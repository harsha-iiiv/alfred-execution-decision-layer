import { useEffect, useState } from 'react'
import './App.css'
import { scenarios } from './data/scenarios'
import {
  runDecisionPipeline,
  toEditableScenario,
  toScenarioInput,
} from './lib/decisionEngine'
import type {
  ActionType,
  DecisionTrace,
  EditableScenario,
  FailureMode,
  ScenarioBucket,
  ScenarioInput,
} from './types'

const actionTypes: Array<{ value: ActionType; label: string }> = [
  { value: 'email_send', label: 'Send email' },
  { value: 'email_archive', label: 'Archive email' },
  { value: 'email_delete', label: 'Delete email' },
  { value: 'calendar_move', label: 'Move calendar event' },
  { value: 'schedule_meeting', label: 'Schedule meeting' },
  { value: 'reminder_create', label: 'Create reminder' },
  { value: 'data_share', label: 'Share data' },
  { value: 'other', label: 'Other' },
]

const buckets: Array<{ value: ScenarioBucket; label: string }> = [
  { value: 'clear', label: 'Clear / easy' },
  { value: 'ambiguous', label: 'Ambiguous' },
  { value: 'risky', label: 'Risky / adversarial' },
]

const failureModes: Array<{ value: FailureMode; label: string }> = [
  { value: 'none', label: 'Normal run' },
  { value: 'timeout', label: 'Simulate LLM timeout' },
  { value: 'malformed_output', label: 'Simulate malformed model output' },
]

const emptyCustomScenario: ScenarioInput = {
  id: 'custom',
  title: 'Custom Scenario',
  summary: 'Freeform sandbox for trying your own action plus context.',
  bucket: 'clear',
  latestUserMessage: 'Please handle this for me.',
  conversationHistory: [
    {
      role: 'user',
      text: 'Please handle this for me.',
    },
  ],
  proposedAction: {
    type: 'reminder_create',
    description: 'Create a reminder for tomorrow at 9 AM.',
    tool: 'reminders.create',
    target: 'Reminder',
    parameters: {
      title: 'Follow up',
      time: 'Tomorrow 9:00 AM',
    },
    affectsExternalParty: false,
    reversible: true,
    bulkOperation: false,
    sensitiveData: false,
  },
  entityResolution: {
    status: 'resolved',
    candidates: [],
  },
  unresolvedParameters: [],
  userState: {
    autonomyMode: 'standard',
    trustLevel: 0.65,
    prefersHeadsUpForExternal: true,
    standingAutomation: false,
    quietModeAllowed: false,
    notes: [],
  },
  executionContext: {
    pendingConfirmation: false,
    pendingConfirmationMinutesAgo: 0,
    priorSafetyHold: false,
    legalReviewRequired: false,
    explicitApprovalRecorded: false,
    initiatedByExternalRequest: false,
    userEmotionalState: 'calm',
  },
}

function App() {
  const [draft, setDraft] = useState<EditableScenario>(
    toEditableScenario(scenarios[0]),
  )
  const [failureMode, setFailureMode] = useState<FailureMode>('none')
  const [trace, setTrace] = useState<DecisionTrace | null>(null)

  useEffect(() => {
    void runDecisionPipeline(scenarios[0], 'none').then(setTrace)
  }, [])

  const runCurrentScenario = async () => {
    const normalized = toScenarioInput(draft)
    const nextTrace = await runDecisionPipeline(normalized, failureMode)
    setTrace(nextTrace)
  }

  const loadScenario = (scenario: ScenarioInput) => {
    setDraft(toEditableScenario(scenario))
    setFailureMode('none')
    void runDecisionPipeline(scenario, 'none').then(setTrace)
  }

  const resetToBlank = () => {
    setDraft(toEditableScenario(emptyCustomScenario))
    setFailureMode('none')
    void runDecisionPipeline(emptyCustomScenario, 'none').then(setTrace)
  }

  if (!trace) {
    return (
      <div className="shell loading-shell">
        <section className="panel loading-panel">
          <span className="eyebrow">Initializing</span>
          <h1>Preparing the decision pipeline…</h1>
        </section>
      </div>
    )
  }

  return (
    <div className="shell">
      <header className="hero">
        <div className="hero-copy">
          <span className="eyebrow">alfred_ execution decision layer</span>
          <h1>Prototype the judgment, not just the verdict.</h1>
          <p className="lede">
            This demo treats execution as a contextual decision problem. It
            combines deterministic safety signals with a model judgment layer,
            then shows the entire trace: inputs, computed rules, prompt, raw
            output, parsing, and safe fallback behavior.
          </p>
        </div>

        <div className="hero-metrics">
          <Metric label="Preloaded Scenarios" value={`${scenarios.length}`} />
          <Metric label="Decision Modes" value="5" />
          <Metric label="Visible Failure Paths" value="Timeout + malformed" />
        </div>
      </header>

      <main className="workspace">
        <section className="left-column">
          <section className="panel">
            <div className="panel-header">
              <div>
                <p className="panel-kicker">Scenario Library</p>
                <h2>Coverage set</h2>
              </div>
              <button className="ghost-button" onClick={resetToBlank}>
                New custom scenario
              </button>
            </div>

            <div className="scenario-grid">
              {scenarios.map((scenario) => (
                <button
                  key={scenario.id}
                  className={`scenario-card ${
                    draft.id === scenario.id ? 'selected' : ''
                  }`}
                  onClick={() => loadScenario(scenario)}
                >
                  <span className={`bucket ${scenario.bucket}`}>
                    {scenario.bucket}
                  </span>
                  <strong>{scenario.title}</strong>
                  <p>{scenario.summary}</p>
                </button>
              ))}
            </div>
          </section>

          <section className="panel">
            <div className="panel-header">
              <div>
                <p className="panel-kicker">Inputs</p>
                <h2>Editable scenario</h2>
              </div>
            </div>

            <div className="editor-grid">
              <label className="field">
                <span>Scenario title</span>
                <input
                  value={draft.title}
                  onChange={(event) =>
                    setDraft({ ...draft, title: event.target.value })
                  }
                />
              </label>

              <label className="field">
                <span>Scenario bucket</span>
                <select
                  value={draft.bucket}
                  onChange={(event) =>
                    setDraft({
                      ...draft,
                      bucket: event.target.value as ScenarioBucket,
                    })
                  }
                >
                  {buckets.map((bucket) => (
                    <option key={bucket.value} value={bucket.value}>
                      {bucket.label}
                    </option>
                  ))}
                </select>
              </label>

              <label className="field full">
                <span>Summary</span>
                <textarea
                  rows={2}
                  value={draft.summary}
                  onChange={(event) =>
                    setDraft({ ...draft, summary: event.target.value })
                  }
                />
              </label>

              <label className="field full">
                <span>Latest user message</span>
                <textarea
                  rows={3}
                  value={draft.latestUserMessage}
                  onChange={(event) =>
                    setDraft({
                      ...draft,
                      latestUserMessage: event.target.value,
                    })
                  }
                />
              </label>

              <label className="field full">
                <span>Conversation history</span>
                <textarea
                  rows={7}
                  value={draft.conversationText}
                  onChange={(event) =>
                    setDraft({
                      ...draft,
                      conversationText: event.target.value,
                    })
                  }
                />
                <small>One turn per line, formatted as `role: text`.</small>
              </label>

              <label className="field">
                <span>Action type</span>
                <select
                  value={draft.actionType}
                  onChange={(event) =>
                    setDraft({
                      ...draft,
                      actionType: event.target.value as ActionType,
                    })
                  }
                >
                  {actionTypes.map((actionType) => (
                    <option key={actionType.value} value={actionType.value}>
                      {actionType.label}
                    </option>
                  ))}
                </select>
              </label>

              <label className="field">
                <span>Tool</span>
                <input
                  value={draft.tool}
                  onChange={(event) =>
                    setDraft({ ...draft, tool: event.target.value })
                  }
                />
              </label>

              <label className="field">
                <span>Target</span>
                <input
                  value={draft.target}
                  onChange={(event) =>
                    setDraft({ ...draft, target: event.target.value })
                  }
                />
              </label>

              <label className="field">
                <span>Failure mode</span>
                <select
                  value={failureMode}
                  onChange={(event) =>
                    setFailureMode(event.target.value as FailureMode)
                  }
                >
                  {failureModes.map((mode) => (
                    <option key={mode.value} value={mode.value}>
                      {mode.label}
                    </option>
                  ))}
                </select>
              </label>

              <label className="field full">
                <span>Proposed action</span>
                <textarea
                  rows={3}
                  value={draft.actionDescription}
                  onChange={(event) =>
                    setDraft({
                      ...draft,
                      actionDescription: event.target.value,
                    })
                  }
                />
              </label>

              <label className="field full">
                <span>Parameters</span>
                <textarea
                  rows={4}
                  value={draft.parametersText}
                  onChange={(event) =>
                    setDraft({ ...draft, parametersText: event.target.value })
                  }
                />
                <small>One per line, formatted as `key: value`.</small>
              </label>

              <label className="field">
                <span>Entity resolution</span>
                <select
                  value={draft.entityResolutionStatus}
                  onChange={(event) =>
                    setDraft({
                      ...draft,
                      entityResolutionStatus: event.target
                        .value as EditableScenario['entityResolutionStatus'],
                    })
                  }
                >
                  <option value="resolved">Resolved</option>
                  <option value="ambiguous">Ambiguous</option>
                  <option value="missing">Missing</option>
                </select>
              </label>

              <label className="field">
                <span>User autonomy</span>
                <select
                  value={draft.autonomyMode}
                  onChange={(event) =>
                    setDraft({
                      ...draft,
                      autonomyMode: event.target.value as EditableScenario['autonomyMode'],
                    })
                  }
                >
                  <option value="low">Low autonomy</option>
                  <option value="standard">Standard</option>
                  <option value="high">High autonomy</option>
                </select>
              </label>

              <label className="field">
                <span>Trust level</span>
                <input
                  type="number"
                  min="0"
                  max="1"
                  step="0.01"
                  value={draft.trustLevel}
                  onChange={(event) =>
                    setDraft({
                      ...draft,
                      trustLevel: Number(event.target.value),
                    })
                  }
                />
              </label>

              <label className="field full">
                <span>Candidate matches</span>
                <textarea
                  rows={2}
                  value={draft.candidatesText}
                  onChange={(event) =>
                    setDraft({ ...draft, candidatesText: event.target.value })
                  }
                />
                <small>Comma-separated values.</small>
              </label>

              <label className="field full">
                <span>Unresolved parameters</span>
                <textarea
                  rows={2}
                  value={draft.unresolvedParametersText}
                  onChange={(event) =>
                    setDraft({
                      ...draft,
                      unresolvedParametersText: event.target.value,
                    })
                  }
                />
                <small>Comma-separated values.</small>
              </label>

              <label className="field full">
                <span>User notes / standing preferences</span>
                <textarea
                  rows={3}
                  value={draft.notesText}
                  onChange={(event) =>
                    setDraft({ ...draft, notesText: event.target.value })
                  }
                />
                <small>One note per line.</small>
              </label>
            </div>

            <div className="toggle-grid">
              <Toggle
                label="Affects external party"
                checked={draft.affectsExternalParty}
                onChange={(checked) =>
                  setDraft({ ...draft, affectsExternalParty: checked })
                }
              />
              <Toggle
                label="Reversible"
                checked={draft.reversible}
                onChange={(checked) =>
                  setDraft({ ...draft, reversible: checked })
                }
              />
              <Toggle
                label="Bulk operation"
                checked={draft.bulkOperation}
                onChange={(checked) =>
                  setDraft({ ...draft, bulkOperation: checked })
                }
              />
              <Toggle
                label="Sensitive data"
                checked={draft.sensitiveData}
                onChange={(checked) =>
                  setDraft({ ...draft, sensitiveData: checked })
                }
              />
              <Toggle
                label="Standing automation"
                checked={draft.standingAutomation}
                onChange={(checked) =>
                  setDraft({ ...draft, standingAutomation: checked })
                }
              />
              <Toggle
                label="Heads-up for external actions"
                checked={draft.prefersHeadsUpForExternal}
                onChange={(checked) =>
                  setDraft({
                    ...draft,
                    prefersHeadsUpForExternal: checked,
                  })
                }
              />
              <Toggle
                label="Quiet mode allowed"
                checked={draft.quietModeAllowed}
                onChange={(checked) =>
                  setDraft({ ...draft, quietModeAllowed: checked })
                }
              />
              <Toggle
                label="Pending confirmation"
                checked={draft.pendingConfirmation}
                onChange={(checked) =>
                  setDraft({ ...draft, pendingConfirmation: checked })
                }
              />
              <Toggle
                label="Prior safety hold"
                checked={draft.priorSafetyHold}
                onChange={(checked) =>
                  setDraft({ ...draft, priorSafetyHold: checked })
                }
              />
              <Toggle
                label="Legal / pricing review needed"
                checked={draft.legalReviewRequired}
                onChange={(checked) =>
                  setDraft({ ...draft, legalReviewRequired: checked })
                }
              />
              <Toggle
                label="Explicit approval recorded"
                checked={draft.explicitApprovalRecorded}
                onChange={(checked) =>
                  setDraft({ ...draft, explicitApprovalRecorded: checked })
                }
              />
              <Toggle
                label="Initiated by external request"
                checked={draft.initiatedByExternalRequest}
                onChange={(checked) =>
                  setDraft({ ...draft, initiatedByExternalRequest: checked })
                }
              />
              <label className="field">
                <span>Emotional state</span>
                <select
                  value={draft.userEmotionalState}
                  onChange={(event) =>
                    setDraft({
                      ...draft,
                      userEmotionalState: event.target
                        .value as EditableScenario['userEmotionalState'],
                    })
                  }
                >
                  <option value="calm">Calm</option>
                  <option value="frustrated">Frustrated</option>
                  <option value="angry">Angry</option>
                </select>
              </label>
              <label className="field">
                <span>Pending confirmation age (min)</span>
                <input
                  type="number"
                  min="0"
                  step="1"
                  value={draft.pendingConfirmationMinutesAgo}
                  onChange={(event) =>
                    setDraft({
                      ...draft,
                      pendingConfirmationMinutesAgo: Number(event.target.value),
                    })
                  }
                />
              </label>
            </div>

            <div className="actions">
              <button className="primary-button" onClick={runCurrentScenario}>
                Run decision pipeline
              </button>
              <button
                className="ghost-button"
                onClick={() => {
                  const normalized = toScenarioInput(draft)
                  setDraft(toEditableScenario(normalized))
                }}
              >
                Normalize inputs
              </button>
            </div>
          </section>
        </section>

        <aside className="right-column">
          <section className="panel sticky">
            <div className="panel-header">
              <div>
                <p className="panel-kicker">Outcome</p>
                <h2>Final decision</h2>
              </div>
              <span className={`decision-pill ${trace.finalDecision}`}>
                {trace.finalDecision.replaceAll('_', ' ')}
              </span>
            </div>

            <p className="decision-rationale">{trace.finalRationale}</p>

            <div className="callout">
              <span className="callout-label">User-facing next step</span>
              <p>{trace.userFacingMessage}</p>
            </div>

            {trace.modelStatus !== 'ok' ? (
              <div className="failure-banner">
                <strong>Failure path engaged</strong>
                <p>
                  {trace.modelStatus === 'timeout'
                    ? 'The model timed out, so the system fell back to a deterministic safe decision.'
                    : trace.modelStatus === 'malformed'
                      ? 'The model returned malformed output, so the parser rejected it and the system fell back safely.'
                      : 'The model output was overridden by the deterministic safety gate.'}
                </p>
              </div>
            ) : null}

            <div className="decision-meta">
              <MetaRow label="Risk score" value={`${trace.signals.riskScore}/100`} />
              <MetaRow label="Risk band" value={trace.signals.riskBand} />
              <MetaRow
                label="Deterministic floor"
                value={trace.signals.deterministicFloor.replaceAll('_', ' ')}
              />
              <MetaRow label="Model status" value={trace.modelStatus} />
            </div>
          </section>
        </aside>
      </main>

      <section className="panel trace-panel">
        <div className="panel-header">
          <div>
            <p className="panel-kicker">Under The Hood</p>
            <h2>Full pipeline trace</h2>
          </div>
        </div>

        <div className="trace-grid">
          <TraceCard
            title="Inputs"
            subtitle="Normalized action + context"
            code={JSON.stringify(trace.input, null, 2)}
          />
          <TraceCard
            title="Computed signals"
            subtitle="Deterministic features, risk, and rule outputs"
            code={JSON.stringify(trace.signals, null, 2)}
          />
          <TraceCard
            title="Prompt"
            subtitle="Exact prompt sent to the model adapter"
            code={trace.prompt}
          />
          <TraceCard
            title="Raw model output"
            subtitle="Unparsed response, including malformed cases"
            code={trace.rawModelOutput ?? 'null'}
          />
          <TraceCard
            title="Parsed model decision"
            subtitle="Validated model judgment before safety gating"
            code={JSON.stringify(trace.parsedDecision, null, 2)}
          />
          <TraceCard
            title="Final parsed decision"
            subtitle="What the product would actually do"
            code={JSON.stringify(
              {
                finalDecision: trace.finalDecision,
                rationale: trace.finalRationale,
                userFacingMessage: trace.userFacingMessage,
                safetyGateReason: trace.safetyGateReason,
              },
              null,
              2,
            )}
          />
        </div>
      </section>

      <section className="panel footer-panel">
        <div className="footer-grid">
          <div>
            <p className="panel-kicker">Design split</p>
            <h2>LLM for judgment, code for guardrails</h2>
            <p>
              The model chooses among comparable safe options, but regular code
              computes the risk signals, catches missing context, rejects
              malformed outputs, and enforces the minimum allowed caution level.
            </p>
          </div>
          <div>
            <p className="panel-kicker">Safe defaults</p>
            <h2>Uncertainty never silently executes</h2>
            <p>
              Timeouts, parser failures, and missing critical context all route
              to a safe fallback. If the action is destructive or policy-blocked,
              the system refuses or escalates instead of guessing.
            </p>
          </div>
        </div>
      </section>
    </div>
  )
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="metric">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  )
}

function MetaRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="meta-row">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  )
}

function Toggle({
  label,
  checked,
  onChange,
}: {
  label: string
  checked: boolean
  onChange: (checked: boolean) => void
}) {
  return (
    <label className="toggle">
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
      />
      <span>{label}</span>
    </label>
  )
}

function TraceCard({
  title,
  subtitle,
  code,
}: {
  title: string
  subtitle: string
  code: string
}) {
  return (
    <article className="trace-card">
      <div className="trace-header">
        <h3>{title}</h3>
        <p>{subtitle}</p>
      </div>
      <pre>{code}</pre>
    </article>
  )
}

export default App
