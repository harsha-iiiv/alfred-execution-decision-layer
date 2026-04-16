# alfred_ Execution Decision Layer

Prototype for alfred_'s execution decision challenge: a debug-first UI for deciding whether the assistant should execute silently, execute and tell the user after, confirm first, ask a clarifying question, or refuse / escalate.

Live URL: https://harsha-iiiv.github.io/alfred-execution-decision-layer/

GitHub repo: https://github.com/harsha-iiiv/alfred-execution-decision-layer

## What this prototype does

- Accepts a proposed action plus contextual conversation state.
- Computes deterministic safety and ambiguity signals in code.
- Builds the exact model prompt from those normalized inputs.
- Runs a model adapter and shows the raw unparsed output.
- Parses the output into a structured decision.
- Applies a deterministic safety gate so uncertain or malformed outputs never silently execute risky actions.

The UI exposes the full trace:

- inputs
- computed signals
- prompt
- raw model output
- parsed model decision
- final product decision after safety gating

## Scenario coverage

The demo ships with 7 preloaded scenarios:

- 2 clear / easy cases
- 3 ambiguous or judgment-heavy cases
- 2 risky / adversarial cases

Included examples:

- Silent archive for a standing low-risk newsletter automation
- Simple reminder creation
- Multi-attendee board meeting reschedule that should confirm before acting
- Conflicting "send it" after an earlier legal hold
- Ambiguous "Sarah" lunch reschedule
- Bulk destructive inbox deletion
- Sensitive external data-share request

## Signals used, and why

The code computes these signals deterministically because they are crisp, auditable, and should not depend on model creativity:

- Missing critical fields: required action parameters like subject, time, or requested data fields
- Entity ambiguity: multiple candidate meetings / contacts or missing target resolution
- Contradictory history: earlier "hold off", "not yet", or other safety-relevant turns in the thread
- Pending confirmation freshness: a vague "yep" after a stale or interrupted confirmation flow is treated carefully
- External impact: actions affecting other people carry a higher trust threshold
- Destructiveness / reversibility: deletes and other hard-to-undo actions get penalized
- Bulk scope: batched actions raise blast radius even if each individual action is simple
- Sensitive data / legal-pricing context: personal, contractual, or pricing content raises the bar
- Initiated by external request: broad user assent should not automatically authorize external asks
- User state: autonomy mode, standing automations, quiet mode, and heads-up preferences influence thresholds
- Emotional context: frustration or anger nudges the system toward caution on destructive requests

## LLM vs regular code

I split responsibility like this:

- Regular code:
  - normalize inputs
  - compute signals
  - assign risk score / risk band
  - detect policy blocks and missing context
  - parse model output
  - reject malformed output
  - choose safe fallback on timeout / parse failure
  - enforce a minimum caution floor
- Model layer:
  - weigh the contextual signals together
  - choose among the allowed decision modes
  - generate a concise rationale
  - propose the user-facing next step or clarifying question

This keeps the model in the judgment lane while reserving hard safety guarantees for deterministic code.

## What the model decides vs what the code decides

Computed deterministically:

- unresolved vs resolved context
- risk score and risk band
- whether policy blocks the action
- whether the action is even eligible for silent execution
- fallback behavior after timeout or malformed output

Chosen by the model adapter:

- which decision to take within the allowed safety envelope
- explanation of the choice
- user-facing wording for the next step

Final authority:

- the deterministic safety gate can override the model if it tries to be less cautious than the computed floor

## Prompt design

The prompt is intentionally compact and inspectable:

- defines the 5 possible decisions
- states the comparable boundary between clarify / confirm / refuse
- includes a strict JSON schema
- passes normalized input plus computed signals as structured context

This makes it easy to debug why a decision happened and to swap the model backend later without changing the surrounding product logic.

## Failure modes

The prototype demonstrates and surfaces these failure paths:

- LLM timeout
  - visible in the UI through the failure mode selector
  - falls back to a deterministic safe decision
- Malformed model output
  - parser rejects it
  - system falls back safely
- Missing critical context
  - surfaced as computed signals
  - routes to a clarifying question rather than risky execution

Default safe behavior never silently executes when the system is uncertain.

## One important scoping choice

To keep the deployed demo fully inspectable and free of server-side secrets, the shipped app uses a local model adapter that simulates the model interface and raw JSON output shape. The rest of the pipeline is structured exactly as it would be with a real LLM call: prompt construction, raw output capture, strict parsing, fallback behavior, and deterministic safety gating.

If I were productionizing this next, I would swap `getRawModelOutput` in [`src/lib/decisionEngine.ts`](./src/lib/decisionEngine.ts) for a real server-side model call and keep the rest of the pipeline unchanged.

## How I would evolve this as alfred_ gets riskier tools

- Move from a single risk score to tool-specific policy packs
- Add per-user trust calibration and learned silent-execution thresholds
- Distinguish "confirm" from "double confirm" for irreversible high-blast-radius actions
- Add tool-aware simulation before execution, especially for multi-step workflows
- Store decision traces for evaluation, disagreement analysis, and red-team review
- Introduce policy tests and offline replay over real conversation logs

## What I would build over the next 6 months

1. Evaluation harness with replayable transcripts, golden decisions, and regression scoring.
2. Tool-specific risk policies for email send, scheduling, payments, and data access.
3. Personalized autonomy controls that let users shape when alfred_ acts silently.
4. Calibrated confidence + uncertainty estimation instead of a single heuristic risk score.
5. Human-in-the-loop escalation paths for sensitive enterprise or legal workflows.
6. Analytics on user trust: confirmation fatigue, reversal rate, and post-action dissatisfaction.

## Running locally

```bash
npm install
npm run dev
```

Build and lint:

```bash
npm run build
npm run lint
```

## Deployment

The repo includes a GitHub Pages workflow in `.github/workflows/deploy.yml`. Pushing to `main` publishes the static Vite build automatically.
