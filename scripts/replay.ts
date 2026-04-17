import { scenarios } from '../src/data/scenarios'
import { runDecisionPipeline } from '../src/lib/decisionEngine'
import type { Decision, FailureMode } from '../src/types'

const expectedDecisions: Record<string, Decision> = {
  'auto-archive-newsletter': 'execute_silently',
  'create-reminder': 'execute_and_tell_user_after',
  'board-meeting-confirm': 'confirm_before_executing',
  'legal-hold-email': 'ask_a_clarifying_question',
  'which-sarah': 'ask_a_clarifying_question',
  'stale-send-after-hold': 'ask_a_clarifying_question',
  'mass-delete-inbox': 'refuse_or_escalate',
  'sensitive-data-share': 'refuse_or_escalate',
}

const failureChecks: Array<{
  scenarioId: string
  mode: FailureMode
  expectedDecision: Decision
}> = [
  {
    scenarioId: 'board-meeting-confirm',
    mode: 'timeout',
    expectedDecision: 'confirm_before_executing',
  },
  {
    scenarioId: 'board-meeting-confirm',
    mode: 'malformed_output',
    expectedDecision: 'confirm_before_executing',
  },
]

async function main() {
  globalThis.window = { setTimeout } as Window & typeof globalThis

  const failures: string[] = []

  for (const scenario of scenarios) {
    const trace = await runDecisionPipeline(scenario, 'none')
    const expected = expectedDecisions[scenario.id]

    if (trace.finalDecision !== expected) {
      failures.push(
        `${scenario.id}: expected ${expected} but received ${trace.finalDecision}`,
      )
    }

    console.log(
      `[scenario] ${scenario.id} -> ${trace.finalDecision} (${trace.modelStatus})`,
    )
  }

  for (const check of failureChecks) {
    const scenario = scenarios.find((item) => item.id === check.scenarioId)

    if (!scenario) {
      failures.push(`Missing scenario for failure check: ${check.scenarioId}`)
      continue
    }

    const trace = await runDecisionPipeline(scenario, check.mode)

    if (trace.finalDecision !== check.expectedDecision) {
      failures.push(
        `${check.scenarioId} / ${check.mode}: expected ${check.expectedDecision} but received ${trace.finalDecision}`,
      )
    }

    console.log(
      `[failure] ${check.scenarioId} / ${check.mode} -> ${trace.finalDecision} (${trace.modelStatus})`,
    )
  }

  if (failures.length > 0) {
    console.error('\nReplay failures:')
    for (const failure of failures) {
      console.error(`- ${failure}`)
    }
    process.exit(1)
  }

  console.log('\nReplay passed.')
}

void main()
