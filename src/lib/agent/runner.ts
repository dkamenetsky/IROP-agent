import { runFallbackPlanner } from '@/lib/agent/fallbackPlanner';
import { executeStructuredTool, structuredToolDefinitions } from '@/lib/agent/structuredTools';
import {
  AnalyzeInput,
  EscalationStep,
  PassengerRecoveryAction,
  RecoveryAction,
  RecoveryPlan,
  RiskLevel,
  RuntimeConfig,
  StaffRole,
  StaffingOption,
  ToolStep,
} from '@/lib/types';

type OpenRouterRole = 'system' | 'user' | 'assistant' | 'tool';

interface OpenRouterToolCall {
  id: string;
  type: 'function';
  function: {
    name: string;
    arguments: string;
  };
}

interface OpenRouterMessage {
  role: OpenRouterRole;
  content: string | null;
  tool_call_id?: string;
  tool_calls?: OpenRouterToolCall[];
}

interface OpenRouterChoice {
  message?: {
    role?: string;
    content?: string | null;
    tool_calls?: OpenRouterToolCall[];
  };
}

interface OpenRouterResponse {
  choices?: OpenRouterChoice[];
  error?: {
    message?: string;
  };
}

interface AgentIncidentState {
  input: AnalyzeInput;
  toolSteps: ToolStep[];
  toolOutputs: Array<{
    toolCallId: string;
    toolName: string;
    input: Record<string, unknown>;
    output: unknown;
  }>;
}

const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';
const DEFAULT_OPENROUTER_MODEL = 'openai/gpt-4o-mini';
const MAX_TOOL_ITERATIONS = 6;
const STAFF_ROLES: StaffRole[] = ['Gate', 'Ramp', 'Customer Service', 'Operations'];

const SYSTEM_PROMPT = `You are an airline IROP recovery agent operating in a hackathon sandbox.
You must gather facts with tools before making a recovery recommendation.

Tool rules:
- If a flight number is present or can be inferred, call get_flight_state before you answer.
- After observing the flight, call get_staffing_state for the same flight before you finalize any staffing recommendation or staffing risk.
- Treat tool output as the authoritative system of record for this prototype.
- Do not invent live staffing assignments or external system actions that cannot be verified from the available tool data.
- Do not narrate tool execution history. The server will record actual tool steps separately.

Return only valid JSON and nothing else. Do not use markdown fences.

Use this exact JSON shape:
{
  "summary": "string",
  "disruptedFlight": "string",
  "disruptionType": "string",
  "impactedWindow": "string",
  "staffingRisk": "low | medium | high",
  "passengerImpact": "string",
  "operationalFocus": "string",
  "recommendedNextAction": {
    "title": "string",
    "owner": "string",
    "reason": "string",
    "impact": "string"
  },
  "actions": [
    {
      "title": "string",
      "owner": "string",
      "reason": "string",
      "impact": "string"
    }
  ],
  "timeline": [
    {
      "phase": "string",
      "trigger": "string",
      "action": "string",
      "owner": "string"
    }
  ],
  "staffingOptions": [
    {
      "role": "Gate | Ramp | Customer Service | Operations",
      "required": 0,
      "status": "ready | watch | gap",
      "recommendedStaff": null,
      "backups": [],
      "reason": "string",
      "excludedCandidates": []
    }
  ],
  "passengerActions": [
    {
      "title": "string",
      "owner": "string",
      "reason": "string"
    }
  ],
  "alternatives": ["string"]
}`;

function buildUserPrompt(input: AnalyzeInput): string {
  return JSON.stringify(
    {
      task: 'Analyze this disruption and produce a recovery plan.',
      incidentInput: {
        flightNumber: input.flightNumber || null,
        selectedDisruptionTypeId: input.disruptionTypeId || null,
        notes: input.notes || null,
        message: input.message || null,
      },
      instruction:
        'Observe first with available tools, then reason over the observed system state and produce the final JSON response.',
    },
    null,
    2,
  );
}

function asString(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback;
}

function asRiskLevel(value: unknown, fallback: RiskLevel): RiskLevel {
  return value === 'low' || value === 'medium' || value === 'high' ? value : fallback;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function normalizeRecoveryAction(value: unknown): RecoveryAction | null {
  const record = asRecord(value);
  const title = asString(record.title);
  if (!title) return null;

  return {
    title,
    owner: asString(record.owner, 'Duty manager'),
    reason: asString(record.reason, 'No reason provided by model.'),
    impact: asString(record.impact, 'Impact not specified.'),
  };
}

function normalizePassengerAction(value: unknown): PassengerRecoveryAction | null {
  const record = asRecord(value);
  const title = asString(record.title);
  if (!title) return null;

  return {
    title,
    owner: asString(record.owner, 'Duty manager'),
    reason: asString(record.reason, 'No reason provided by model.'),
  };
}

function normalizeTimelineStep(value: unknown): EscalationStep | null {
  const record = asRecord(value);
  const phase = asString(record.phase);
  if (!phase) return null;

  return {
    phase,
    trigger: asString(record.trigger, 'Monitor the situation and reassess as new facts arrive.'),
    action: asString(record.action, 'Continue coordinating the station response.'),
    owner: asString(record.owner, 'Duty manager'),
  };
}

function normalizeStaffingOption(value: unknown): StaffingOption | null {
  const record = asRecord(value);
  const role = asString(record.role) as StaffRole;
  if (!STAFF_ROLES.includes(role)) return null;

  const statusValue = asString(record.status);
  const status: StaffingOption['status'] =
    statusValue === 'ready' || statusValue === 'watch' || statusValue === 'gap' ? statusValue : 'watch';

  return {
    role,
    required: typeof record.required === 'number' && Number.isFinite(record.required) ? record.required : 0,
    status,
    recommendedStaff: typeof record.recommendedStaff === 'string' ? record.recommendedStaff : null,
    backups: asArray(record.backups).map((item) => asString(item)).filter(Boolean),
    reason: asString(record.reason, 'Staffing verification is not available in this iteration.'),
    excludedCandidates: asArray(record.excludedCandidates).map((item) => asString(item)).filter(Boolean),
  };
}

function extractJsonObject(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    const fencedMatch = text.match(/```json\s*([\s\S]*?)```/i);
    if (fencedMatch?.[1]) {
      return JSON.parse(fencedMatch[1]);
    }

    const objectMatch = text.match(/\{[\s\S]*\}/);
    if (objectMatch) {
      return JSON.parse(objectMatch[0]);
    }

    throw new Error('Model response did not contain valid JSON.');
  }
}

function getObservedFlightRecord(incidentState: AgentIncidentState): Record<string, unknown> | null {
  const latestFlightState = [...incidentState.toolOutputs]
    .reverse()
    .find((item) => item.toolName === 'get_flight_state');

  if (!latestFlightState) return null;

  const output = asRecord(latestFlightState.output);
  if (output.ok !== true) return null;

  const flight = asRecord(output.flight);
  return Object.keys(flight).length ? flight : null;
}

function getObservedPrimaryDisruption(flightRecord: Record<string, unknown> | null): Record<string, unknown> | null {
  if (!flightRecord) return null;

  const disruptions = asArray(flightRecord.knownDisruptions).map(asRecord);
  const activeDisruption = disruptions.find((item) => asString(item.status) === 'active');
  return activeDisruption || disruptions[0] || null;
}

function getObservedStaffingRecord(incidentState: AgentIncidentState): Record<string, unknown> | null {
  const latestStaffingState = [...incidentState.toolOutputs]
    .reverse()
    .find((item) => item.toolName === 'get_staffing_state');

  if (!latestStaffingState) return null;

  const output = asRecord(latestStaffingState.output);
  if (output.ok !== true) return null;

  const staffing = asRecord(output.staffing);
  return Object.keys(staffing).length ? staffing : null;
}

function hasObservedTool(incidentState: AgentIncidentState, toolName: string) {
  return incidentState.toolOutputs.some((item) => item.toolName === toolName);
}

function deriveStaffingOptionsFromObservedState(staffingRecord: Record<string, unknown> | null): StaffingOption[] {
  if (!staffingRecord) return [];

  return asArray(staffingRecord.roleCoverage)
    .map(asRecord)
    .map((entry) => {
      const role = asString(entry.role) as StaffRole;
      if (!STAFF_ROLES.includes(role)) return null;

      const statusValue = asString(entry.status);
      const status: StaffingOption['status'] =
        statusValue === 'ready' || statusValue === 'watch' || statusValue === 'gap' ? statusValue : 'watch';

      const complianceRisks = asArray(entry.complianceRisks).map((item) => asString(item)).filter(Boolean);
      const baseReason = asString(entry.reason, 'Observed staffing state is available.');

      return {
        role,
        required: typeof entry.required === 'number' && Number.isFinite(entry.required) ? entry.required : 0,
        status,
        recommendedStaff: typeof entry.recommendedStaff === 'string' ? entry.recommendedStaff : null,
        backups: asArray(entry.backups).map((item) => asString(item)).filter(Boolean),
        reason: complianceRisks.length ? `${baseReason} Compliance watch: ${complianceRisks.join('; ')}.` : baseReason,
        excludedCandidates: asArray(entry.excludedCandidates).map((item) => asString(item)).filter(Boolean),
      } satisfies StaffingOption;
    })
    .filter((item): item is StaffingOption => Boolean(item));
}

function formatObservedImpactedWindow(
  flightRecord: Record<string, unknown> | null,
  disruptionRecord: Record<string, unknown> | null,
): string {
  if (!flightRecord) {
    return 'To be confirmed from observed flight state.';
  }

  const scheduledDeparture = asString(flightRecord.scheduledDeparture);
  if (!scheduledDeparture) {
    return 'To be confirmed from observed flight state.';
  }

  const start = new Date(scheduledDeparture);
  if (Number.isNaN(start.getTime())) {
    return 'To be confirmed from observed flight state.';
  }

  const formatter = new Intl.DateTimeFormat('en-CA', {
    hour: 'numeric',
    minute: '2-digit',
  });

  const disruptionType = asString(disruptionRecord?.type);
  if (disruptionType === 'cancellation') {
    return `${formatter.format(start)} onward`;
  }

  const delayMinutes =
    disruptionRecord && typeof disruptionRecord.minutesDelayed === 'number' ? disruptionRecord.minutesDelayed : null;
  if (typeof delayMinutes === 'number' && Number.isFinite(delayMinutes)) {
    const end = new Date(start.getTime() + delayMinutes * 60_000);
    return `${formatter.format(start)} to ${formatter.format(end)}`;
  }

  return formatter.format(start);
}

function summarizeToolExecution(toolName: string, input: Record<string, unknown>, output: unknown): string {
  const record = asRecord(output);

  if (toolName === 'get_flight_state') {
    if (record.ok !== true) {
      const errorRecord = asRecord(record.error);
      return asString(errorRecord.message, 'Flight state lookup failed.');
    }

    const flight = asRecord(record.flight);
    const flightNumber = asString(flight.flightNumber, asString(input.flightNumber, 'unknown flight'));
    const gate = asString(flight.currentGate, 'unknown gate');
    const disruptions = asArray(flight.knownDisruptions)
      .map(asRecord)
      .map((item) => {
        const label = asString(item.label, asString(item.type, 'unknown disruption'));
        const status = asString(item.status, 'unknown');
        const delayMinutes = typeof item.minutesDelayed === 'number' ? `, ${item.minutesDelayed} minutes` : '';
        return `${label} (${status}${delayMinutes})`;
      })
      .filter(Boolean);

    const disruptionSummary = disruptions.length ? disruptions.join('; ') : 'no known disruptions';
    return `Observed ${flightNumber} at ${gate} with ${disruptionSummary}.`;
  }

  if (toolName === 'get_staffing_state') {
    if (record.ok !== true) {
      const errorRecord = asRecord(record.error);
      return asString(errorRecord.message, 'Staffing state lookup failed.');
    }

    const staffing = asRecord(record.staffing);
    const overallRisk = asString(staffing.overallRisk, 'unknown');
    const roleCoverage = asArray(staffing.roleCoverage)
      .map(asRecord)
      .map((entry) => `${asString(entry.role)}: ${asString(entry.status)} with ${asString(entry.recommendedStaff, 'no primary candidate')}`)
      .filter(Boolean);

    return `Observed staffing risk ${overallRisk}. ${roleCoverage.join('; ')}.`;
  }

  return `${toolName} executed.`;
}

function normalizeRecoveryPlan(rawPlan: unknown, input: AnalyzeInput, incidentState: AgentIncidentState): RecoveryPlan {
  const record = asRecord(rawPlan);
  const observedFlight = getObservedFlightRecord(incidentState);
  const observedDisruption = getObservedPrimaryDisruption(observedFlight);
  const observedStaffing = getObservedStaffingRecord(incidentState);
  const observedStaffingOptions = deriveStaffingOptionsFromObservedState(observedStaffing);

  const actions = asArray(record.actions)
    .map(normalizeRecoveryAction)
    .filter((item): item is RecoveryAction => Boolean(item));
  const passengerActions = asArray(record.passengerActions)
    .map(normalizePassengerAction)
    .filter((item): item is PassengerRecoveryAction => Boolean(item));
  const timeline = asArray(record.timeline)
    .map(normalizeTimelineStep)
    .filter((item): item is EscalationStep => Boolean(item));
  const modelStaffingOptions = asArray(record.staffingOptions)
    .map(normalizeStaffingOption)
    .filter((item): item is StaffingOption => Boolean(item));
  const recommendedNextAction = normalizeRecoveryAction(record.recommendedNextAction) || actions[0] || {
    title: 'Review observed flight state',
    owner: 'Duty manager',
    reason: 'Begin with the tool-observed disruption details before expanding to more systems.',
    impact: 'Keeps the station aligned on verified facts.',
  };
  const observedOverallRisk = asRiskLevel(observedStaffing?.overallRisk, 'medium');

  return {
    summary: asString(
      record.summary,
      `Observed ${asString(observedFlight?.flightNumber, input.flightNumber || 'flight')} and generated a recovery plan from tool-backed mock system state.`,
    ),
    disruptedFlight: asString(record.disruptedFlight, asString(observedFlight?.flightNumber, input.flightNumber || 'Unknown flight')),
    disruptionType: asString(record.disruptionType, asString(observedDisruption?.label, input.disruptionTypeId || 'Unknown disruption')),
    impactedWindow: asString(record.impactedWindow, formatObservedImpactedWindow(observedFlight, observedDisruption)),
    staffingRisk: observedStaffing ? observedOverallRisk : asRiskLevel(record.staffingRisk, 'medium'),
    passengerImpact: asString(
      record.passengerImpact,
      asString(observedDisruption?.passengerImpact, 'Passenger impact requires confirmation from additional tools.'),
    ),
    operationalFocus: asString(
      record.operationalFocus,
      asString(observedDisruption?.operationalImpact, 'Coordinate the station around the observed disruption state.'),
    ),
    recommendedNextAction,
    actions,
    timeline,
    staffingOptions: observedStaffingOptions.length ? observedStaffingOptions : modelStaffingOptions,
    passengerActions,
    alternatives: asArray(record.alternatives).map((item) => asString(item)).filter(Boolean),
    steps: incidentState.toolSteps,
    mode: 'openrouter-agent',
  };
}

async function createOpenRouterCompletion(messages: OpenRouterMessage[]): Promise<OpenRouterResponse> {
  const apiKey = process.env.OPENROUTER_API_KEY;

  if (!apiKey) {
    throw new Error('OPENROUTER_API_KEY is not configured.');
  }

  const response = await fetch(OPENROUTER_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': 'http://localhost:3000',
      'X-Title': 'irop-agent-prototype',
    },
    body: JSON.stringify({
      model: process.env.OPENROUTER_MODEL || DEFAULT_OPENROUTER_MODEL,
      messages,
      tools: structuredToolDefinitions,
      tool_choice: 'auto',
      parallel_tool_calls: false,
      temperature: 0.2,
    }),
  });

  const payload = (await response.json()) as OpenRouterResponse;

  if (!response.ok) {
    throw new Error(payload.error?.message || 'OpenRouter request failed.');
  }

  return payload;
}

export async function runRecoveryAgent(input: AnalyzeInput, runtimeConfig: RuntimeConfig): Promise<RecoveryPlan> {
  void runtimeConfig;

  const incidentState: AgentIncidentState = {
    input: { ...input },
    toolSteps: [],
    toolOutputs: [],
  };

  const messages: OpenRouterMessage[] = [
    { role: 'system', content: SYSTEM_PROMPT },
    { role: 'user', content: buildUserPrompt(input) },
  ];

  for (let iteration = 0; iteration < MAX_TOOL_ITERATIONS; iteration += 1) {
    const completion = await createOpenRouterCompletion(messages);
    const assistantMessage = completion.choices?.[0]?.message;

    if (!assistantMessage) {
      throw new Error('OpenRouter returned no assistant message.');
    }

    const toolCalls = assistantMessage.tool_calls || [];

    if (toolCalls.length > 0) {
      messages.push({
        role: 'assistant',
        content: assistantMessage.content ?? null,
        tool_calls: toolCalls,
      });

      for (const toolCall of toolCalls) {
        let parsedInput: Record<string, unknown> = {};
        try {
          parsedInput = toolCall.function.arguments ? (JSON.parse(toolCall.function.arguments) as Record<string, unknown>) : {};
        } catch {
          parsedInput = { rawArguments: toolCall.function.arguments };
        }

        const result = executeStructuredTool(toolCall.function.name, toolCall.function.arguments);

        incidentState.toolOutputs.push({
          toolCallId: toolCall.id,
          toolName: toolCall.function.name,
          input: parsedInput,
          output: result,
        });
        incidentState.toolSteps.push({
          tool: toolCall.function.name,
          input: parsedInput,
          outputSummary: summarizeToolExecution(toolCall.function.name, parsedInput, result),
        });

        messages.push({
          role: 'tool',
          tool_call_id: toolCall.id,
          content: JSON.stringify(result),
        });
      }

      continue;
    }

    const finalContent = assistantMessage.content;
    if (!finalContent) {
      throw new Error('OpenRouter returned an empty final response.');
    }

    if (!hasObservedTool(incidentState, 'get_flight_state')) {
      messages.push({
        role: 'user',
        content: 'Before you finalize, call get_flight_state for the disrupted flight and then continue.',
      });
      continue;
    }

    if (!hasObservedTool(incidentState, 'get_staffing_state')) {
      const observedFlight = getObservedFlightRecord(incidentState);
      const flightNumber = asString(observedFlight?.flightNumber, input.flightNumber || 'the same flight');
      messages.push({
        role: 'user',
        content: `Before you finalize, call get_staffing_state for ${flightNumber} and then continue with the final JSON response.`,
      });
      continue;
    }

    return normalizeRecoveryPlan(extractJsonObject(finalContent), input, incidentState);
  }

  return runFallbackPlanner(input, runtimeConfig);
}
