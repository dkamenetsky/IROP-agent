# Agent Architecture Roadmap

## Goal

Move the app from a static fallback planner to a model-driven orchestration loop that can observe, reason, and act against structured mock tools that look like live operational systems.

## Architecture Direction

1. API route stays thin.
2. `runRecoveryAgent` becomes the orchestration loop.
3. The LLM interacts only through structured tool interfaces.
4. Mock data is embedded inside tool implementations so the model experiences the tools like live systems.
5. The fallback planner remains available as a separate safety net while the agent path matures.

## Iterative Build Plan

### Step 1: Flight-state observation loop

Scope for this iteration:

- Add one structured tool: `get_flight_state(flightNumber)`.
- Embed mock flight and disruption data inside that tool.
- Route `runRecoveryAgent` through OpenRouter using `OPENROUTER_API_KEY`.
- Let the model call `get_flight_state`, read tool JSON, and then generate the final recovery output.
- Keep the rest of the app contract unchanged so the existing UI can still render the result.

Expected outcome:

- The model must perform at least one observation step through a tool before producing a plan.
- Tool results are machine-readable and auditable.

### Step 2: Incident state and trace hardening

- Introduce a first-class incident state object inside the agent loop.
- Persist tool results, assumptions, and decisions separately from the final narrative output.
- Tighten validation of model outputs and tool-call sequencing.

### Step 3: Action-oriented tool expansion

- Add a staffing/system-read tool next.
- Add passenger-recovery or messaging draft tools after that.
- Keep tools narrow, structured, and individually testable.

### Step 4: Approval-aware action model

- Split recommendations into read-only observations, draftable actions, and approval-required actions.
- Add explicit action boundaries so the agent cannot silently overstep.

### Step 5: Evaluation harness

- Build fixed incident scenarios and expected behaviors.
- Measure tool-use correctness, policy compliance, and output quality before adding more tools.

## Non-Goals For This Iteration

- No real APIs.
- No real data.
- No broad tool set yet.
- No autonomous execution beyond one read-only tool.
