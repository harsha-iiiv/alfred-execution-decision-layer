export type Decision =
  | 'execute_silently'
  | 'execute_and_tell_user_after'
  | 'confirm_before_executing'
  | 'ask_a_clarifying_question'
  | 'refuse_or_escalate'

export type RiskBand = 'low' | 'medium' | 'high' | 'critical'

export type ActionType =
  | 'email_send'
  | 'email_archive'
  | 'email_delete'
  | 'calendar_move'
  | 'schedule_meeting'
  | 'reminder_create'
  | 'data_share'
  | 'other'

export type EntityResolutionStatus = 'resolved' | 'ambiguous' | 'missing'

export type ScenarioBucket = 'clear' | 'ambiguous' | 'risky'

export type UserAutonomyMode = 'low' | 'standard' | 'high'

export type EmotionalState = 'calm' | 'frustrated' | 'angry'

export type FailureMode = 'none' | 'timeout' | 'malformed_output'

export interface ConversationTurn {
  role: 'user' | 'assistant' | 'external' | 'system'
  text: string
}

export interface ProposedAction {
  type: ActionType
  description: string
  tool: string
  target: string
  parameters: Record<string, string>
  affectsExternalParty: boolean
  reversible: boolean
  bulkOperation: boolean
  sensitiveData: boolean
}

export interface ScenarioInput {
  id: string
  title: string
  summary: string
  bucket: ScenarioBucket
  latestUserMessage: string
  conversationHistory: ConversationTurn[]
  proposedAction: ProposedAction
  entityResolution: {
    status: EntityResolutionStatus
    candidates: string[]
  }
  unresolvedParameters: string[]
  userState: {
    autonomyMode: UserAutonomyMode
    trustLevel: number
    prefersHeadsUpForExternal: boolean
    standingAutomation: boolean
    quietModeAllowed: boolean
    notes: string[]
  }
  executionContext: {
    pendingConfirmation: boolean
    pendingConfirmationMinutesAgo: number
    priorSafetyHold: boolean
    legalReviewRequired: boolean
    explicitApprovalRecorded: boolean
    initiatedByExternalRequest: boolean
    userEmotionalState: EmotionalState
  }
}

export interface EditableScenario {
  id: string
  title: string
  summary: string
  bucket: ScenarioBucket
  latestUserMessage: string
  conversationText: string
  actionType: ActionType
  actionDescription: string
  tool: string
  target: string
  parametersText: string
  affectsExternalParty: boolean
  reversible: boolean
  bulkOperation: boolean
  sensitiveData: boolean
  entityResolutionStatus: EntityResolutionStatus
  candidatesText: string
  unresolvedParametersText: string
  autonomyMode: UserAutonomyMode
  trustLevel: number
  prefersHeadsUpForExternal: boolean
  standingAutomation: boolean
  quietModeAllowed: boolean
  notesText: string
  pendingConfirmation: boolean
  pendingConfirmationMinutesAgo: number
  priorSafetyHold: boolean
  legalReviewRequired: boolean
  explicitApprovalRecorded: boolean
  initiatedByExternalRequest: boolean
  userEmotionalState: EmotionalState
}

export interface ComputedSignals {
  requiredFields: string[]
  missingCriticalContext: string[]
  unresolvedParameters: string[]
  entityAmbiguity: boolean
  contradictoryHistory: boolean
  vagueLatestAffirmation: boolean
  pendingConfirmation: boolean
  staleConfirmation: boolean
  externalImpact: boolean
  destructiveAction: boolean
  bulkOperation: boolean
  sensitiveData: boolean
  legalOrPricingContent: boolean
  priorSafetyHold: boolean
  initiatedByExternalRequest: boolean
  userEmotionalState: EmotionalState
  userAutonomyMode: UserAutonomyMode
  standingAutomation: boolean
  quietModeAllowed: boolean
  policyBlockReason: string | null
  riskScore: number
  riskBand: RiskBand
  deterministicFloor: Decision
  recommendedDecision: Decision
  floorReasons: string[]
}

export interface ParsedModelDecision {
  decision: Decision
  rationale: string
  user_message: string
  confidence: number
  key_signals: string[]
  missing_information: string[]
  follow_up_question: string | null
}

export interface DecisionTrace {
  input: ScenarioInput
  signals: ComputedSignals
  prompt: string
  rawModelOutput: string | null
  parsedDecision: ParsedModelDecision | null
  finalDecision: Decision
  finalRationale: string
  userFacingMessage: string
  modelStatus: 'ok' | 'timeout' | 'malformed' | 'overridden_by_safety_gate'
  safetyGateReason: string
}
