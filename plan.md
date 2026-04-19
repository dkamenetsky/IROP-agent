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
- choosing bounded mock actions,
- replanning after state changes.

In simple terms:

- mock tools simulate airline systems,
- OpenRouter decides how to use them,
- the app orchestrates the loop and records what actually happened.

## Architecture Direction

1. `src/app/api/analyze/route.ts` stays thin.
2. `runRecoveryAgent` remains the orchestration loop.
3. The model only sees structured tool interfaces, never raw app internals.
4. Mock data stays embedded inside tools so the model experiences them like live internal systems.
5. The server owns incident state, tool traces, and mock action results.
6. The old fallback planner remains available as a safety net while the agent path expands.

## Current State

Implemented now:

- `get_flight_state(flightNumber)`
- `get_staffing_state(flightNumber)`
- `get_passenger_recovery_state(flightNumber)`
- `publish_passenger_announcement(flightNumber, messageType, messageBody)`
- `request_reserve_staff(flightNumber, role, staffName)`
- `open_rebooking_support(flightNumber)`
- OpenRouter tool-calling loop
- server-owned tool trace
- grounded staffing risk, staffing options, and passenger pressure
- mock state-changing execution with re-observation
- manager follow-up Q&A tied to the current incident context

Current demo story:

- operator selects a disruption,
- the agent checks the mock flight system,
- the agent checks the mock staffing system,
- the agent checks the mock passenger recovery system,
- the agent can publish a mock passenger announcement,
- the agent can assign reserve staff in the mock staffing system,
- the agent can open extra mock rebooking support when passenger pressure is high,
- the agent re-checks staffing after reserve assignment,
- the agent re-checks passenger state,
- the agent produces a recovery plan from the updated observed state.
- the manager can ask follow-up questions about that exact incident and get grounded answers.

## Demo Roadmap

### Stage 1: Multi-System Observation

Status: implemented

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

### Stage 2: First Mock Action

Status: implemented

Objective:

- move from "AI planner" toward "AI agent"

Implemented now:

- `publish_passenger_announcement`

Expected demo behavior:

- the agent does not only analyze
- it can execute one bounded mock action
- the mock system state changes

### Stage 3: Replanning Loop

Status: implemented for passenger announcements

Objective:

- show adaptive agent behavior instead of one-shot generation

Implemented behavior:

- after `publish_passenger_announcement`, the agent re-checks `get_passenger_recovery_state`
- the final plan reflects the updated passenger system state

Expected demo behavior:

- observe
- reason
- act
- observe again
- revise the plan

### Stage 4: More Action Tools

Status: partly implemented

Objective:

- widen the set of mock actions the agent can take

Implemented now:

- `request_reserve_staff`
- `open_rebooking_support`

Still planned:

- `draft_station_briefing`
- `draft_escalation_message`

Expected demo behavior:

- the agent can take more than one kind of action
- the agent starts looking like a usable operations assistant

### Stage 5: Broader Operational Context

Objective:

- make the agent feel more like a real airline operations assistant

Possible next tools:

- `get_gate_operations_state`
- `get_network_impact`

Expected demo behavior:

- the agent can reason beyond a single narrow fact source
- tradeoffs feel more operationally realistic

### Stage 6: Incident Q&A

Status: implemented

Objective:

- let a manager interrogate the current incident without turning the demo into a generic chatbot

Implemented now:

- manager follow-up questions tied to the current plan, tool trace, and observed incident state

Expected demo behavior:

- the manager can ask freeform questions about the current disruption
- the answer stays grounded in the incident context
- the demo becomes interactive without losing the agent story

## What Not To Build Yet

- real company integrations
- real customer or staff data
- automatic high-risk actions without approval
- online model training from user interactions

## Important Clarification

The agent does not need to "learn" in the retraining sense to be agentic.

For this demo, agentic behavior means:

- choosing tools,
- reading system state,
- deciding on next steps,
- performing approved mock actions,
- updating the plan when the environment changes.
