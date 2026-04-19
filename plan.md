# Agent Demo Roadmap

## Goal

Build a believable airline disruption agent for a hackathon demo without using real company systems or real company data.

The demo should show that the agent can:

1. observe mock operational systems,
2. reason across those systems with an LLM,
3. propose or take bounded mock actions,
4. re-check the environment,
5. update its plan.

## What OpenRouter Is Doing

OpenRouter is not the source of truth and it is not the business logic engine.

OpenRouter is used for:

- deciding what tool to call next,
- reading structured mock system responses,
- synthesizing those observations into a recovery plan,
- later proposing actions and replanning after state changes.

In simple terms:

- mock tools simulate the airline systems,
- OpenRouter decides how to use them,
- the app orchestrates the loop and records what actually happened.

## Architecture Direction

1. `src/app/api/analyze/route.ts` stays thin.
2. `runRecoveryAgent` remains the orchestration loop.
3. The model only sees structured tool interfaces, never raw app internals.
4. Mock data stays embedded inside tools so the model experiences them like live internal systems.
5. The server owns incident state, tool traces, and later mock action results.
6. The old fallback planner remains available as a safety net while the agent path expands.

## Current State

Implemented now:

- `get_flight_state(flightNumber)`
- `get_staffing_state(flightNumber)`
- OpenRouter tool-calling loop
- server-owned tool trace
- grounded staffing risk and staffing options

Current demo story:

- operator selects a disruption,
- the agent checks the mock flight system,
- the agent checks the mock staffing system,
- the agent produces a recovery plan from observed state.

## Demo Roadmap

### Stage 1: Multi-System Observation

Status: in progress

Objective:

- prove the agent is reading mock systems before answering

Tools in this stage:

- `get_flight_state`
- `get_staffing_state`
- `get_passenger_recovery_state`

Expected demo behavior:

- the trace shows multiple tool calls
- passenger impact becomes grounded, not generic
- recommendations become more believable for a duty manager

### Stage 2: Draft Actions

Objective:

- move from “AI planner” toward “AI agent”

Planned tools:

- `draft_passenger_announcement`
- `draft_station_briefing`
- `draft_escalation_message`

Expected demo behavior:

- the agent does not only analyze
- it creates usable outputs that a manager could approve

### Stage 3: Mock Execution

Objective:

- let the agent act inside the sandbox

Planned tools:

- `publish_passenger_announcement`
- `open_rebooking_support`
- `request_reserve_staff`

Expected demo behavior:

- the agent proposes an action
- the user approves it
- the mock system state changes

### Stage 4: Replanning Loop

Objective:

- show adaptive agent behavior instead of one-shot generation

Planned behavior:

- after a mock action, the agent re-checks tools
- the plan updates based on the new state

Expected demo behavior:

- observe
- reason
- act
- observe again
- revise the plan

### Stage 5: Broader Operational Context

Objective:

- make the agent feel more like a real airline operations assistant

Possible next tools:

- `get_gate_operations_state`
- `get_network_impact`

Expected demo behavior:

- the agent can reason beyond a single narrow fact source
- tradeoffs feel more operationally realistic

## What Not To Build Yet

- real company integrations
- real customer or staff data
- automatic high-risk actions without approval
- online model training from user interactions

## Important Clarification

The agent does not need to “learn” in the retraining sense to be agentic.

For this demo, agentic behavior means:

- choosing tools,
- reading system state,
- deciding on next steps,
- performing approved mock actions,
- updating the plan when the environment changes.
