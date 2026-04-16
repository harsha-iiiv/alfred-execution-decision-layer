import type {
  ComputedSignals,
  Decision,
  DecisionTrace,
  EditableScenario,
  FailureMode,
  ParsedModelDecision,
  ProposedAction,
  RiskBand,
  ScenarioInput,
} from '../types'

const requiredFieldsByAction: Record<
  ScenarioInput['proposedAction']['type'],
  string[]
> = {
  email_send: ['subject'],
  email_archive: [],
  email_delete: ['window'],
  calendar_move: ['timeframe'],
  schedule_meeting: ['to'],
  reminder_create: ['title', 'time'],
  data_share: ['requested_fields'],
  other: [],
}

const vagueAffirmationPattern =
  /^(yes|yep|yeah|sure|ok|okay|do it|send it|go ahead|sounds good|ship it)\b/i

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value))
}

function riskBandFromScore(score: number): RiskBand {
  if (score >= 85) {
    return 'critical'
  }
  if (score >= 60) {
    return 'high'
  }
  if (score >= 30) {
    return 'medium'
  }
  return 'low'
}

function normalizeLineList(text: string) {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
}

function parseParameters(text: string) {
  const entries = normalizeLineList(text)
  const parsed: Record<string, string> = {}

  for (const entry of entries) {
    const [key, ...rest] = entry.split(':')
    if (!key || rest.length === 0) {
      continue
    }

    parsed[key.trim()] = rest.join(':').trim()
  }

  return parsed
}

function parseHistory(text: string) {
  return normalizeLineList(text).map((line) => {
    const [role, ...rest] = line.split(':')
    const parsedRole = role?.trim().toLowerCase()

    if (
      parsedRole === 'assistant' ||
      parsedRole === 'external' ||
      parsedRole === 'system'
    ) {
      return {
        role: parsedRole,
        text: rest.join(':').trim(),
      } as ScenarioInput['conversationHistory'][number]
    }

    return {
      role: 'user',
      text: rest.length > 0 ? rest.join(':').trim() : line.trim(),
    } as ScenarioInput['conversationHistory'][number]
  })
}

function extractRequiredFieldGaps(action: ProposedAction) {
  const requiredFields = requiredFieldsByAction[action.type]
  return requiredFields.filter((field) => !action.parameters[field]?.trim())
}

function computeSignals(input: ScenarioInput): ComputedSignals {
  const lowerHistory = input.conversationHistory.map((turn) =>
    turn.text.toLowerCase(),
  )
  const missingCriticalContext = [
    ...extractRequiredFieldGaps(input.proposedAction),
    ...(input.entityResolution.status === 'missing' ? [input.proposedAction.target || 'target'] : []),
  ]
  const contradictoryHistory =
    input.executionContext.priorSafetyHold ||
    lowerHistory.some((turn) =>
      /(hold off|do not send|don't send|wait for legal|not yet|stop for now)/i.test(
        turn,
      ),
    )
  const vagueLatestAffirmation = vagueAffirmationPattern.test(
    input.latestUserMessage.trim(),
  )
  const staleConfirmation =
    input.executionContext.pendingConfirmation &&
    input.executionContext.pendingConfirmationMinutesAgo > 5 &&
    vagueLatestAffirmation

  const legalOrPricingContent =
    input.executionContext.legalReviewRequired ||
    /(legal|pricing|discount|contract|offer|terms)/i.test(
      [
        input.proposedAction.description,
        input.latestUserMessage,
        ...input.conversationHistory.map((turn) => turn.text),
      ].join(' '),
    )

  const destructiveAction =
    input.proposedAction.type === 'email_delete' ||
    !input.proposedAction.reversible

  let policyBlockReason: string | null = null

  if (
    input.proposedAction.type === 'data_share' &&
    input.proposedAction.sensitiveData &&
    input.proposedAction.affectsExternalParty
  ) {
    policyBlockReason =
      'The action would share sensitive personal information with an external party.'
  }

  if (
    input.proposedAction.type === 'email_delete' &&
    input.proposedAction.bulkOperation &&
    !input.proposedAction.reversible
  ) {
    policyBlockReason =
      'The action is a bulk destructive delete with a high chance of irreversible loss.'
  }

  let riskScore = 5

  if (input.proposedAction.affectsExternalParty) {
    riskScore += 18
  }
  if (!input.proposedAction.reversible) {
    riskScore += 22
  }
  if (input.proposedAction.bulkOperation) {
    riskScore += 16
  }
  if (input.proposedAction.sensitiveData) {
    riskScore += 18
  }
  if (contradictoryHistory) {
    riskScore += 17
  }
  if (input.entityResolution.status === 'ambiguous') {
    riskScore += 20
  }
  if (missingCriticalContext.length > 0) {
    riskScore += 20
  }
  if (input.unresolvedParameters.length > 0) {
    riskScore += 14
  }
  if (staleConfirmation) {
    riskScore += 12
  }
  if (legalOrPricingContent) {
    riskScore += 12
  }
  if (input.executionContext.initiatedByExternalRequest) {
    riskScore += 10
  }
  if (input.executionContext.userEmotionalState === 'frustrated') {
    riskScore += 6
  }
  if (input.executionContext.userEmotionalState === 'angry') {
    riskScore += 10
  }
  if (input.userState.autonomyMode === 'high') {
    riskScore -= 8
  }
  if (
    input.userState.standingAutomation &&
    input.userState.quietModeAllowed &&
    !input.proposedAction.affectsExternalParty &&
    input.proposedAction.reversible
  ) {
    riskScore -= 14
  }
  if (input.userState.autonomyMode === 'low') {
    riskScore += 6
  }

  riskScore = clamp(riskScore, 0, 100)
  const riskBand = riskBandFromScore(riskScore)

  const floorReasons: string[] = []
  let deterministicFloor: Decision = 'execute_silently'

  if (policyBlockReason) {
    deterministicFloor = 'refuse_or_escalate'
    floorReasons.push(policyBlockReason)
  } else if (
    missingCriticalContext.length > 0 ||
    input.unresolvedParameters.length > 0 ||
    input.entityResolution.status !== 'resolved' ||
    contradictoryHistory
  ) {
    deterministicFloor = 'ask_a_clarifying_question'
    floorReasons.push(
      'Intent, entity, or key parameters are still unresolved from context.',
    )
  } else if (
    riskScore >= 45 ||
    (input.proposedAction.affectsExternalParty &&
      input.userState.prefersHeadsUpForExternal)
  ) {
    deterministicFloor = 'confirm_before_executing'
    floorReasons.push(
      'Intent is resolved, but the action is above the silent-execution threshold.',
    )
  } else if (!input.userState.quietModeAllowed) {
    deterministicFloor = 'execute_and_tell_user_after'
    floorReasons.push('The action is safe to execute, but the user should get a heads-up afterward.')
  }

  let recommendedDecision: Decision = deterministicFloor

  if (
    deterministicFloor === 'execute_silently' &&
    !input.userState.quietModeAllowed
  ) {
    recommendedDecision = 'execute_and_tell_user_after'
  }

  if (
    deterministicFloor === 'execute_silently' &&
    input.userState.quietModeAllowed &&
    !input.userState.standingAutomation
  ) {
    recommendedDecision = 'execute_and_tell_user_after'
  }

  return {
    requiredFields: requiredFieldsByAction[input.proposedAction.type],
    missingCriticalContext,
    unresolvedParameters: input.unresolvedParameters,
    entityAmbiguity: input.entityResolution.status === 'ambiguous',
    contradictoryHistory,
    vagueLatestAffirmation,
    pendingConfirmation: input.executionContext.pendingConfirmation,
    staleConfirmation,
    externalImpact: input.proposedAction.affectsExternalParty,
    destructiveAction,
    bulkOperation: input.proposedAction.bulkOperation,
    sensitiveData: input.proposedAction.sensitiveData,
    legalOrPricingContent,
    priorSafetyHold: input.executionContext.priorSafetyHold,
    initiatedByExternalRequest: input.executionContext.initiatedByExternalRequest,
    userEmotionalState: input.executionContext.userEmotionalState,
    userAutonomyMode: input.userState.autonomyMode,
    standingAutomation: input.userState.standingAutomation,
    quietModeAllowed: input.userState.quietModeAllowed,
    policyBlockReason,
    riskScore,
    riskBand,
    deterministicFloor,
    recommendedDecision,
    floorReasons,
  }
}

function buildPrompt(input: ScenarioInput, signals: ComputedSignals) {
  return `You are the execution decision layer for an assistant that acts in text messages.

Choose exactly one decision:
- execute_silently
- execute_and_tell_user_after
- confirm_before_executing
- ask_a_clarifying_question
- refuse_or_escalate

Boundary:
- Ask a clarifying question when intent, entity, or key parameters are unresolved.
- Confirm before executing when intent is resolved but risk is above the silent execution threshold.
- Refuse or escalate when policy disallows the action, or risk or uncertainty remains too high after clarification.

Return strict JSON with this schema:
{
  "decision": "...",
  "rationale": "...",
  "user_message": "...",
  "confidence": 0.0,
  "key_signals": ["..."],
  "missing_information": ["..."],
  "follow_up_question": "..." | null
}

Context JSON:
${JSON.stringify(
    {
      input,
      computed_signals: signals,
    },
    null,
    2,
  )}`
}

function simulateModelDecision(
  input: ScenarioInput,
  signals: ComputedSignals,
): ParsedModelDecision {
  const decision = signals.recommendedDecision
  const missingInformation = [
    ...signals.missingCriticalContext,
    ...signals.unresolvedParameters,
  ]
  const keySignals: string[] = []

  if (signals.policyBlockReason) {
    keySignals.push(signals.policyBlockReason)
  }
  if (signals.externalImpact) {
    keySignals.push('The action affects an external party.')
  }
  if (signals.entityAmbiguity) {
    keySignals.push('Multiple entities match the requested action.')
  }
  if (signals.contradictoryHistory) {
    keySignals.push('Recent conversation includes a safety hold or conflicting instruction.')
  }
  if (signals.bulkOperation) {
    keySignals.push('The action applies in bulk and is harder to recover from.')
  }
  if (signals.legalOrPricingContent) {
    keySignals.push('Legal, pricing, or contractual language raises the bar for silent execution.')
  }
  if (
    signals.recommendedDecision === 'execute_silently' &&
    signals.standingAutomation
  ) {
    keySignals.push('This matches a standing low-risk automation preference.')
  }

  let followUpQuestion: string | null = null
  let userMessage = 'Handled.'

  if (decision === 'execute_silently') {
    userMessage = 'Silent automation matched the user preference, so the action can run without a message.'
  }

  if (decision === 'execute_and_tell_user_after') {
    userMessage =
      'I can do that now and text the user once it is complete.'
  }

  if (decision === 'confirm_before_executing') {
    userMessage =
      'I have enough context to act, but the impact is high enough that I should confirm before I actually do it.'
  }

  if (decision === 'ask_a_clarifying_question') {
    followUpQuestion =
      input.id === 'legal-hold-email'
        ? 'Do you want me to send the Acme draft now, and has legal approved the pricing language?'
        : input.id === 'which-sarah'
          ? 'Which Sarah do you mean, and what time should I move the lunch to?'
          : 'I need one more detail before I can safely act. What is the missing parameter?'

    userMessage = followUpQuestion
  }

  if (decision === 'refuse_or_escalate') {
    userMessage =
      'I cannot safely execute that as requested. I should refuse or escalate and offer a safer alternative.'
  }

  if (
    input.id === 'board-meeting-confirm' &&
    decision === 'confirm_before_executing'
  ) {
    userMessage =
      'Everyone is available Monday at 9. Do you want me to move the board prep and notify the attendees?'
  }

  return {
    decision,
    rationale: buildModelRationale(decision),
    user_message: userMessage,
    confidence: signals.riskBand === 'critical' ? 0.96 : 0.82,
    key_signals: keySignals,
    missing_information: missingInformation,
    follow_up_question: followUpQuestion,
  }
}

function buildModelRationale(decision: Decision) {
  if (decision === 'execute_silently') {
    return 'The action is low-risk, reversible, internally scoped, and aligned with a standing automation preference that allows quiet execution.'
  }

  if (decision === 'execute_and_tell_user_after') {
    return 'The action is resolved and low-risk, but it still affects the user state enough that a post-action notification is appropriate.'
  }

  if (decision === 'confirm_before_executing') {
    return 'Intent is resolved, but the action crosses the silent execution threshold because of external impact or higher operational risk.'
  }

  if (decision === 'ask_a_clarifying_question') {
    return 'The conversation leaves unresolved intent, entity selection, or a critical parameter, so clarification is safer than confirmation.'
  }

  return 'Policy or irreversibility makes the action too risky to execute, even with the latest instruction.'
}

function parseModelOutput(rawModelOutput: string): ParsedModelDecision {
  const parsed = JSON.parse(rawModelOutput) as Partial<ParsedModelDecision>

  const validDecisions: Decision[] = [
    'execute_silently',
    'execute_and_tell_user_after',
    'confirm_before_executing',
    'ask_a_clarifying_question',
    'refuse_or_escalate',
  ]

  if (!parsed.decision || !validDecisions.includes(parsed.decision)) {
    throw new Error('Invalid decision value in model output.')
  }

  if (!parsed.rationale || !parsed.user_message) {
    throw new Error('Model output is missing required rationale fields.')
  }

  return {
    decision: parsed.decision,
    rationale: parsed.rationale,
    user_message: parsed.user_message,
    confidence: typeof parsed.confidence === 'number' ? parsed.confidence : 0,
    key_signals: Array.isArray(parsed.key_signals) ? parsed.key_signals : [],
    missing_information: Array.isArray(parsed.missing_information)
      ? parsed.missing_information
      : [],
    follow_up_question:
      typeof parsed.follow_up_question === 'string' || parsed.follow_up_question === null
        ? parsed.follow_up_question
        : null,
  }
}

function safeFallbackDecision(signals: ComputedSignals): Decision {
  if (signals.policyBlockReason) {
    return 'refuse_or_escalate'
  }

  // Timeout / parser failure should never reduce caution below the computed floor.
  if (signals.deterministicFloor !== 'execute_silently') {
    return signals.deterministicFloor
  }

  // Even when the floor allows silence, uncertainty in the model path should
  // still produce a visible post-action message rather than silent execution.
  return 'execute_and_tell_user_after'
}

function applySafetyGate(
  signals: ComputedSignals,
  parsedDecision: ParsedModelDecision | null,
): { finalDecision: Decision; reason: string; overridden: boolean } {
  if (!parsedDecision) {
    const fallback = safeFallbackDecision(signals)
    return {
      finalDecision: fallback,
      reason:
        'The model result was unavailable, so the system used the deterministic safe fallback.',
      overridden: false,
    }
  }

  if (signals.policyBlockReason) {
    return {
      finalDecision: 'refuse_or_escalate',
      reason: signals.policyBlockReason,
      overridden: parsedDecision.decision !== 'refuse_or_escalate',
    }
  }

  if (
    signals.deterministicFloor === 'ask_a_clarifying_question' &&
    !['ask_a_clarifying_question', 'refuse_or_escalate'].includes(
      parsedDecision.decision,
    )
  ) {
    return {
      finalDecision: 'ask_a_clarifying_question',
      reason:
        'Deterministic rules detected unresolved context, so the system cannot skip straight to execution or confirmation.',
      overridden: true,
    }
  }

  if (
    signals.deterministicFloor === 'confirm_before_executing' &&
    ['execute_silently', 'execute_and_tell_user_after'].includes(
      parsedDecision.decision,
    )
  ) {
    return {
      finalDecision: 'confirm_before_executing',
      reason:
        'The action is resolved but above the silent execution threshold, so confirmation is the minimum allowed caution level.',
      overridden: true,
    }
  }

  if (
    signals.deterministicFloor === 'execute_and_tell_user_after' &&
    parsedDecision.decision === 'execute_silently'
  ) {
    return {
      finalDecision: 'execute_and_tell_user_after',
      reason:
        'The action is safe to execute, but the user should still receive a post-action message.',
      overridden: true,
    }
  }

  return {
    finalDecision: parsedDecision.decision,
    reason: 'Model decision accepted without deterministic override.',
    overridden: false,
  }
}

function finalRationale(
  parsedDecision: ParsedModelDecision | null,
  gateReason: string,
) {
  if (!parsedDecision) {
    return `${gateReason} Default safe behavior avoids irreversible execution when uncertain.`
  }

  if (gateReason === 'Model decision accepted without deterministic override.') {
    return parsedDecision.rationale
  }

  return `${parsedDecision.rationale} ${gateReason}`
}

function finalUserMessage(
  finalDecision: Decision,
  parsedDecision: ParsedModelDecision | null,
  input: ScenarioInput,
) {
  if (parsedDecision?.user_message) {
    return parsedDecision.user_message
  }

  if (finalDecision === 'ask_a_clarifying_question') {
    if (input.id === 'which-sarah') {
      return 'Which Sarah do you mean, and what time should I move the lunch to?'
    }

    return 'I need one more detail before I can safely act.'
  }

  if (finalDecision === 'confirm_before_executing') {
    return 'I have enough context to act, but I want a final confirmation before I do it.'
  }

  if (finalDecision === 'refuse_or_escalate') {
    return 'I cannot safely execute that as requested. I should refuse or offer a safer alternative.'
  }

  if (finalDecision === 'execute_silently') {
    return 'The action can run silently under the current autonomy settings.'
  }

  return 'I can do that now and follow up once it is complete.'
}

async function getRawModelOutput(
  input: ScenarioInput,
  signals: ComputedSignals,
  failureMode: FailureMode,
) {
  await new Promise((resolve) => window.setTimeout(resolve, 250))

  if (failureMode === 'timeout') {
    throw new Error('MODEL_TIMEOUT')
  }

  if (failureMode === 'malformed_output') {
    return `decision: confirm_before_executing\nreason: This feels risky and I want a confirmation first.`
  }

  const response = simulateModelDecision(input, signals)
  return JSON.stringify(response, null, 2)
}

export async function runDecisionPipeline(
  input: ScenarioInput,
  failureMode: FailureMode,
): Promise<DecisionTrace> {
  const signals = computeSignals(input)
  const prompt = buildPrompt(input, signals)

  let rawModelOutput: string | null = null
  let parsedDecision: ParsedModelDecision | null = null
  let modelStatus: DecisionTrace['modelStatus'] = 'ok'

  try {
    rawModelOutput = await getRawModelOutput(input, signals, failureMode)
    parsedDecision = parseModelOutput(rawModelOutput)
  } catch (error) {
    if (error instanceof Error && error.message === 'MODEL_TIMEOUT') {
      modelStatus = 'timeout'
    } else {
      modelStatus = 'malformed'
      rawModelOutput = rawModelOutput ?? (error instanceof Error ? error.message : 'Unknown parser error')
    }
  }

  const gated = applySafetyGate(signals, parsedDecision)

  if (modelStatus === 'ok' && gated.overridden) {
    modelStatus = 'overridden_by_safety_gate'
  }

  return {
    input,
    signals,
    prompt,
    rawModelOutput,
    parsedDecision,
    finalDecision: gated.finalDecision,
    finalRationale: finalRationale(
      parsedDecision,
      gated.reason,
    ),
    userFacingMessage: finalUserMessage(
      gated.finalDecision,
      parsedDecision,
      input,
    ),
    modelStatus,
    safetyGateReason: gated.reason,
  }
}

export function serializeHistory(input: ScenarioInput) {
  return input.conversationHistory
    .map((turn) => `${turn.role}: ${turn.text}`)
    .join('\n')
}

export function serializeList(items: string[]) {
  return items.join(', ')
}

export function toEditableScenario(input: ScenarioInput): EditableScenario {
  return {
    id: input.id,
    title: input.title,
    summary: input.summary,
    bucket: input.bucket,
    latestUserMessage: input.latestUserMessage,
    conversationText: serializeHistory(input),
    actionType: input.proposedAction.type,
    actionDescription: input.proposedAction.description,
    tool: input.proposedAction.tool,
    target: input.proposedAction.target,
    parametersText: Object.entries(input.proposedAction.parameters)
      .map(([key, value]) => `${key}: ${value}`)
      .join('\n'),
    affectsExternalParty: input.proposedAction.affectsExternalParty,
    reversible: input.proposedAction.reversible,
    bulkOperation: input.proposedAction.bulkOperation,
    sensitiveData: input.proposedAction.sensitiveData,
    entityResolutionStatus: input.entityResolution.status,
    candidatesText: serializeList(input.entityResolution.candidates),
    unresolvedParametersText: serializeList(input.unresolvedParameters),
    autonomyMode: input.userState.autonomyMode,
    trustLevel: input.userState.trustLevel,
    prefersHeadsUpForExternal: input.userState.prefersHeadsUpForExternal,
    standingAutomation: input.userState.standingAutomation,
    quietModeAllowed: input.userState.quietModeAllowed,
    notesText: input.userState.notes.join('\n'),
    pendingConfirmation: input.executionContext.pendingConfirmation,
    pendingConfirmationMinutesAgo:
      input.executionContext.pendingConfirmationMinutesAgo,
    priorSafetyHold: input.executionContext.priorSafetyHold,
    legalReviewRequired: input.executionContext.legalReviewRequired,
    explicitApprovalRecorded: input.executionContext.explicitApprovalRecorded,
    initiatedByExternalRequest:
      input.executionContext.initiatedByExternalRequest,
    userEmotionalState: input.executionContext.userEmotionalState,
  }
}

export function toScenarioInput(draft: EditableScenario): ScenarioInput {
  return {
    id: draft.id || 'custom',
    title: draft.title.trim() || 'Custom Scenario',
    summary: draft.summary.trim() || 'Custom scenario',
    bucket: draft.bucket,
    latestUserMessage: draft.latestUserMessage.trim(),
    conversationHistory: parseHistory(draft.conversationText),
    proposedAction: {
      type: draft.actionType,
      description: draft.actionDescription.trim(),
      tool: draft.tool.trim(),
      target: draft.target.trim(),
      parameters: parseParameters(draft.parametersText),
      affectsExternalParty: draft.affectsExternalParty,
      reversible: draft.reversible,
      bulkOperation: draft.bulkOperation,
      sensitiveData: draft.sensitiveData,
    },
    entityResolution: {
      status: draft.entityResolutionStatus,
      candidates: draft.candidatesText
        .split(',')
        .map((item) => item.trim())
        .filter(Boolean),
    },
    unresolvedParameters: draft.unresolvedParametersText
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean),
    userState: {
      autonomyMode: draft.autonomyMode,
      trustLevel: draft.trustLevel,
      prefersHeadsUpForExternal: draft.prefersHeadsUpForExternal,
      standingAutomation: draft.standingAutomation,
      quietModeAllowed: draft.quietModeAllowed,
      notes: normalizeLineList(draft.notesText),
    },
    executionContext: {
      pendingConfirmation: draft.pendingConfirmation,
      pendingConfirmationMinutesAgo: draft.pendingConfirmationMinutesAgo,
      priorSafetyHold: draft.priorSafetyHold,
      legalReviewRequired: draft.legalReviewRequired,
      explicitApprovalRecorded: draft.explicitApprovalRecorded,
      initiatedByExternalRequest: draft.initiatedByExternalRequest,
      userEmotionalState: draft.userEmotionalState,
    },
  }
}
