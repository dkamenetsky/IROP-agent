import { runFallbackPlanner } from '@/lib/agent/fallbackPlanner';
import { createMockSystemState, executeStructuredTool, structuredToolDefinitions, type MockSystemState } from '@/lib/agent/structuredTools';
import { createOpenRouterCompletion, type OpenRouterMessage } from '@/lib/openrouter';
import {
  AnalyzeInput,
  EscalationStep,
  IncidentContext,
  PassengerRecoveryAction,
  RecoveryAction,
  RecoveryPlan,
  RiskLevel,
  RuntimeConfig,
  StaffRole,
  StaffingOption,
  ToolStep,
} from '@/lib/types';

interface AgentIncidentState {
  input: AnalyzeInput;
  systemState: MockSystemState;
  toolSteps: ToolStep[];
  toolOutputs: Array<{
    toolCallId: string;
    toolName: string;
    input: Record<string, unknown>;
    output: unknown;
  }>;
}

const MAX_TOOL_ITERATIONS = 18;
const STAFF_ROLES: StaffRole[] = ['Gate', 'Ramp', 'Customer Service', 'Operations'];

const SYSTEM_PROMPT = `You are an airline IROP recovery agent operating in a hackathon sandbox.
You must gather facts with tools before making a recovery recommendation.

Tool rules:
- If a flight number is present or can be inferred, call get_flight_state before you answer.
- After observing the flight, call get_staffing_state for the same flight before you finalize any staffing recommendation or staffing risk.
- Only use request_reserve_staff with the exact role and recommended staff member returned by the staffing tool for that role.
- If staffing shows a watch or gap and a reserve option is available, use request_reserve_staff once before you finalize.
- Before you finalize passenger impact or passenger actions, call get_passenger_recovery_state for the same flight.
- If passenger recovery shows a critical queue or a large manual handling backlog, use open_rebooking_support before you finalize passenger recovery recommendations.
- If passenger recovery says an announcement is ready, use publish_passenger_announcement before you finalize.
- Prefer combining independent read-only checks in the same response when possible to keep the workflow efficient.
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

function simplifyPlainLanguage(text: string): string {
  return text
    .replace(/\bmisconnects?\b/gi, (match) => (match.toLowerCase().endsWith('s') ? 'missed connections' : 'missed connection'))
    .replace(/\breaccommodation\b/gi, 'rebooking')
    .replace(/\bmanual handling\b/gi, 'manual help')
    .replace(/\breserve depth\b/gi, 'backup staff available')
    .replace(/\brecovery flexibility\b/gi, 'backup options')
    .replace(/\bheadcount\b/gi, 'staffing level')
    .replace(/\bdisruption window\b/gi, 'active disruption period')
    .trim();
}

function humanizeDisruptionLabel(value: string): string {
  const normalized = value.trim().toLowerCase();

  const knownLabels: Record<string, string> = {
    delay: 'Departure delay',
    late_inbound: 'Late inbound aircraft',
    gate_change: 'Gate change',
    cancellation: 'Cancellation',
    crew_timeout_risk: 'Crew timeout risk',
  };

  if (knownLabels[normalized]) {
    return knownLabels[normalized];
  }

  if (!normalized) {
    return '';
  }

  if (normalized.includes('_')) {
    return normalized
      .split('_')
      .filter(Boolean)
      .map((part) => part[0]?.toUpperCase() + part.slice(1))
      .join(' ');
  }

  return value.trim();
}

function normalizeRecoveryAction(value: unknown): RecoveryAction | null {
  const record = asRecord(value);
  const title = asString(record.title);
  if (!title) return null;

  return {
    title,
    owner: asString(record.owner, 'Duty manager'),
    reason: simplifyPlainLanguage(asString(record.reason, 'No reason provided by model.')),
    impact: simplifyPlainLanguage(asString(record.impact, 'Impact not specified.')),
  };
}

function normalizePassengerAction(value: unknown): PassengerRecoveryAction | null {
  const record = asRecord(value);
  const title = asString(record.title);
  if (!title) return null;

  return {
    title,
    owner: asString(record.owner, 'Duty manager'),
    reason: simplifyPlainLanguage(asString(record.reason, 'No reason provided by model.')),
  };
}

function normalizeTimelineStep(value: unknown): EscalationStep | null {
  const record = asRecord(value);
  const phase = asString(record.phase);
  if (!phase) return null;

  return {
    phase,
    trigger: simplifyPlainLanguage(asString(record.trigger, 'Monitor the situation and reassess as new facts arrive.')),
    action: simplifyPlainLanguage(asString(record.action, 'Continue coordinating the station response.')),
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
    reason: simplifyPlainLanguage(asString(record.reason, 'Staffing verification is not available in this iteration.')),
    excludedCandidates: asArray(record.excludedCandidates).map((item) => asString(item)).filter(Boolean),
  };
}

function sanitizeJsonCandidate(value: string) {
  return value
    .replace(/^\uFEFF/, '')
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/,\s*([}\]])/g, '$1')
    .trim();
}

function extractJsonObject(text: string): unknown {
  const candidates: string[] = [];
  const trimmed = text.trim();

  if (trimmed) {
    candidates.push(trimmed);
  }

  const fencedMatch = text.match(/```json\s*([\s\S]*?)```/i);
  if (fencedMatch?.[1]) {
    candidates.push(fencedMatch[1].trim());
  }

  const objectMatch = text.match(/\{[\s\S]*\}/);
  if (objectMatch?.[0]) {
    candidates.push(objectMatch[0].trim());
  }

  const seen = new Set<string>();

  for (const candidate of candidates) {
    if (!candidate || seen.has(candidate)) continue;
    seen.add(candidate);

    try {
      return JSON.parse(candidate);
    } catch {
      try {
        return JSON.parse(sanitizeJsonCandidate(candidate));
      } catch {
        continue;
      }
    }
  }

  throw new Error('Model response did not contain valid JSON.');
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
    .find((item) => item.toolName === 'get_staffing_state' || item.toolName === 'request_reserve_staff');

  if (!latestStaffingState) return null;

  const output = asRecord(latestStaffingState.output);
  if (output.ok !== true) return null;

  const staffing = asRecord(output.staffing);
  return Object.keys(staffing).length ? staffing : null;
}

function getObservedPassengerRecoveryRecord(incidentState: AgentIncidentState): Record<string, unknown> | null {
  const latestPassengerState = [...incidentState.toolOutputs]
    .reverse()
    .find(
      (item) =>
        item.toolName === 'get_passenger_recovery_state' ||
        item.toolName === 'publish_passenger_announcement' ||
        item.toolName === 'open_rebooking_support',
    );

  if (!latestPassengerState) return null;

  const output = asRecord(latestPassengerState.output);
  if (output.ok !== true) return null;

  const passengerRecovery = asRecord(output.passengerRecovery);
  return Object.keys(passengerRecovery).length ? passengerRecovery : null;
}

function hasObservedTool(incidentState: AgentIncidentState, toolName: string) {
  return incidentState.toolOutputs.some((item) => item.toolName === toolName);
}

function getLastToolIndex(incidentState: AgentIncidentState, toolName: string) {
  for (let index = incidentState.toolOutputs.length - 1; index >= 0; index -= 1) {
    if (incidentState.toolOutputs[index]?.toolName === toolName) {
      return index;
    }
  }

  return -1;
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
      const baseReason = simplifyPlainLanguage(asString(entry.reason, 'Observed staffing state is available.'));

      return {
        role,
        required: typeof entry.required === 'number' && Number.isFinite(entry.required) ? entry.required : 0,
        status,
        recommendedStaff: typeof entry.recommendedStaff === 'string' ? entry.recommendedStaff : null,
        backups: asArray(entry.backups).map((item) => asString(item)).filter(Boolean),
        reason: complianceRisks.length ? `${baseReason} Compliance warning: ${complianceRisks.join('; ')}.` : baseReason,
        excludedCandidates: asArray(entry.excludedCandidates).map((item) => asString(item)).filter(Boolean),
      } satisfies StaffingOption;
    })
    .filter((item): item is StaffingOption => Boolean(item));
}

function getReserveStaffActionCandidate(staffingRecord: Record<string, unknown> | null) {
  if (!staffingRecord) return null;

  for (const entry of asArray(staffingRecord.roleCoverage).map(asRecord)) {
    const role = asString(entry.role) as StaffRole;
    const status = asString(entry.status);
    const recommendedStaff = asString(entry.recommendedStaff);

    if (!STAFF_ROLES.includes(role)) continue;
    if (!recommendedStaff) continue;
    if (status !== 'watch' && status !== 'gap') continue;

    return {
      role,
      staffName: recommendedStaff,
      status,
    };
  }

  return null;
}

function needsRebookingSupport(passengerRecord: Record<string, unknown> | null) {
  if (!passengerRecord) return false;

  const queueStatus = asString(passengerRecord.queueStatus);
  const reaccommodationStatus = asRecord(passengerRecord.reaccommodationStatus);
  const needsManualHandling =
    typeof reaccommodationStatus.needsManualHandling === 'number' ? reaccommodationStatus.needsManualHandling : 0;

  return queueStatus === 'critical' || needsManualHandling >= 25;
}

function derivePassengerActionsFromObservedState(passengerRecord: Record<string, unknown> | null): PassengerRecoveryAction[] {
  if (!passengerRecord) return [];

  const queueStatus = asString(passengerRecord.queueStatus, 'stable');
  const communicationStatus = asRecord(passengerRecord.communicationStatus);
  const nextRecommendedMessage = asString(communicationStatus.nextRecommendedMessage, 'Provide a clear passenger update.');
  const announcementReady = communicationStatus.announcementReady === true;
  const needsManualHandling = typeof asRecord(passengerRecord.reaccommodationStatus).needsManualHandling === 'number'
    ? (asRecord(passengerRecord.reaccommodationStatus).needsManualHandling as number)
    : 0;
  const specialAssistanceCount =
    typeof passengerRecord.specialAssistanceCount === 'number' ? passengerRecord.specialAssistanceCount : 0;
  const topConcerns = asArray(passengerRecord.topConcerns).map((item) => asString(item)).filter(Boolean);

  const actions: PassengerRecoveryAction[] = [];

  if (announcementReady) {
    actions.push({
      title: 'Issue the next passenger update',
      owner: 'Gate lead',
      reason: nextRecommendedMessage,
    });
  }

  if (needsManualHandling > 0) {
    actions.push({
      title: 'Stage manual reaccommodation support',
      owner: 'Customer service lead',
      reason: `${needsManualHandling} passengers currently need manual handling in the mock recovery system.`,
    });
  }

  if (queueStatus === 'building' || queueStatus === 'critical') {
    actions.push({
      title: 'Add visible queue management near the gate or recovery point',
      owner: 'Duty manager',
      reason: `Passenger queue status is ${queueStatus} and top concerns indicate front-line pressure is rising.`,
    });
  }

  if (specialAssistanceCount > 0) {
    actions.push({
      title: 'Assign focused support for special-assistance and priority passengers',
      owner: 'Duty manager',
      reason: `${specialAssistanceCount} special-assistance passengers are flagged in the mock recovery system.`,
    });
  }

  if (topConcerns[0]) {
    actions.push({
      title: 'Brief front-line staff on the main passenger concern',
      owner: 'Customer service lead',
      reason: topConcerns[0],
    });
  }

  return actions;
}

function passengerAnnouncementReady(passengerRecord: Record<string, unknown> | null) {
  const communicationStatus = asRecord(passengerRecord?.communicationStatus);
  return communicationStatus.announcementReady === true;
}

function buildIncidentContext(incidentState: AgentIncidentState): IncidentContext {
  return {
    input: { ...incidentState.input },
    observedFlight: getObservedFlightRecord(incidentState),
    observedDisruption: getObservedPrimaryDisruption(getObservedFlightRecord(incidentState)),
    observedStaffing: getObservedStaffingRecord(incidentState),
    observedPassengerRecovery: getObservedPassengerRecoveryRecord(incidentState),
    actionLog: incidentState.systemState.actionLog.map((entry) => ({
      tool: entry.tool,
      flightNumber: entry.flightNumber,
      status: entry.status,
      executedAt: entry.executedAt,
      details: entry.details,
    })),
  };
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

function normalizeImpactedWindowText(
  impactedWindow: string,
  flightRecord: Record<string, unknown> | null,
  disruptionRecord: Record<string, unknown> | null,
) {
  const trimmed = impactedWindow.trim();
  if (!trimmed) {
    return formatObservedImpactedWindow(flightRecord, disruptionRecord);
  }

  if (/^\d{4}-\d{2}-\d{2}t\d{2}:\d{2}/i.test(trimmed) || /^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    return formatObservedImpactedWindow(flightRecord, disruptionRecord);
  }

  return trimmed;
}

function buildFriendlyPassengerImpact(
  passengerRecord: Record<string, unknown> | null,
  disruptionRecord: Record<string, unknown> | null,
) {
  if (!passengerRecord) {
    return simplifyPlainLanguage(asString(disruptionRecord?.passengerImpact, 'Passenger impact needs confirmation.'));
  }

  const impactedPassengers =
    typeof passengerRecord.impactedPassengers === 'number' ? passengerRecord.impactedPassengers : 'Affected';
  const queueStatus = asString(passengerRecord.queueStatus, 'unknown');
  const misconnectRisk = asString(passengerRecord.misconnectRisk, 'unknown');

  return `${impactedPassengers} passengers are affected. Passenger crowding is ${queueStatus} and missed-connection risk is ${misconnectRisk}.`;
}

function getToolStepStatus(output: unknown): ToolStep['status'] {
  const record = asRecord(output);
  if (typeof record.ok === 'boolean') {
    return record.ok ? 'success' : 'error';
  }

  return 'info';
}

function displayStaffingStatus(status: string) {
  if (status === 'ready') return 'covered';
  if (status === 'watch') return 'tight';
  if (status === 'gap') return 'short';
  return status;
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
      .map(
        (entry) =>
          `${asString(entry.role)}: ${displayStaffingStatus(asString(entry.status))} with ${asString(
            entry.recommendedStaff,
            'no primary candidate',
          )}`,
      )
      .filter(Boolean);

    return `Observed staffing risk ${overallRisk}. ${roleCoverage.join('; ')}.`;
  }

  if (toolName === 'get_passenger_recovery_state') {
    if (record.ok !== true) {
      const errorRecord = asRecord(record.error);
      return asString(errorRecord.message, 'Passenger recovery lookup failed.');
    }

    const passengerRecovery = asRecord(record.passengerRecovery);
    const queueStatus = asString(passengerRecovery.queueStatus, 'unknown');
    const misconnectRisk = asString(passengerRecovery.misconnectRisk, 'unknown');
    const impactedPassengers =
      typeof passengerRecovery.impactedPassengers === 'number' ? passengerRecovery.impactedPassengers : 0;

    return `Observed passenger recovery state: ${impactedPassengers} affected passengers, queue ${queueStatus}, missed-connection risk ${misconnectRisk}.`;
  }

  if (toolName === 'publish_passenger_announcement') {
    if (record.ok !== true) {
      const errorRecord = asRecord(record.error);
      return `Passenger update was not sent: ${simplifyPlainLanguage(asString(errorRecord.message, 'Passenger announcement execution failed.'))}`;
    }

    const action = asRecord(record.action);
    const messageType = asString(action.messageType, 'passenger update').replace(/_/g, ' ');
    return `Sent a ${messageType} to passengers for ${asString(action.flightNumber, 'unknown flight')}.`;
  }

  if (toolName === 'request_reserve_staff') {
    if (record.ok !== true) {
      const errorRecord = asRecord(record.error);
      const code = asString(errorRecord.code);
      const rawMessage = asString(errorRecord.message, 'Reserve staffing action failed.');

      if (code === 'ROLE_MISMATCH') {
        const match = rawMessage.match(/^(.*?) is a (.*?), not a (.*?)\.$/);
        if (match) {
          return `Reserve staff request was rejected: ${match[1]} is assigned to ${match[2].toLowerCase()} work, not ${match[3].toLowerCase()} work.`;
        }
      }

      return `Reserve staff request was rejected: ${simplifyPlainLanguage(rawMessage)}`;
    }

    const action = asRecord(record.action);
    return `Assigned reserve ${asString(action.role, 'staff')} support: ${asString(action.staffName, 'unknown staff')} to ${asString(
      action.flightNumber,
      'unknown flight',
    )}.`;
  }

  if (toolName === 'open_rebooking_support') {
    if (record.ok !== true) {
      const errorRecord = asRecord(record.error);
      return `Extra rebooking support was not opened: ${simplifyPlainLanguage(asString(errorRecord.message, 'Rebooking support action failed.'))}`;
    }

    const passengerRecovery = asRecord(record.passengerRecovery);
    const reaccommodationStatus = asRecord(passengerRecovery.reaccommodationStatus);
    const manualHandling =
      typeof reaccommodationStatus.needsManualHandling === 'number' ? reaccommodationStatus.needsManualHandling : 0;

    return `Opened extra rebooking support. Passenger queue is now ${asString(
      passengerRecovery.queueStatus,
      'unknown',
    )} and manual handling is down to ${manualHandling}.`;
  }

  return `${toolName} executed.`;
}

function normalizeRecoveryPlan(rawPlan: unknown, input: AnalyzeInput, incidentState: AgentIncidentState): RecoveryPlan {
  const record = asRecord(rawPlan);
  const observedFlight = getObservedFlightRecord(incidentState);
  const observedDisruption = getObservedPrimaryDisruption(observedFlight);
  const observedStaffing = getObservedStaffingRecord(incidentState);
  const observedPassengerRecovery = getObservedPassengerRecoveryRecord(incidentState);
  const observedStaffingOptions = deriveStaffingOptionsFromObservedState(observedStaffing);
  const observedPassengerActions = derivePassengerActionsFromObservedState(observedPassengerRecovery);

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
    summary: simplifyPlainLanguage(asString(
      record.summary,
      `Observed ${asString(observedFlight?.flightNumber, input.flightNumber || 'flight')} and generated a recovery plan from tool-backed mock system state.`,
    )),
    disruptedFlight: asString(record.disruptedFlight, asString(observedFlight?.flightNumber, input.flightNumber || 'Unknown flight')),
    disruptionType: humanizeDisruptionLabel(
      asString(record.disruptionType, asString(observedDisruption?.label, input.disruptionTypeId || 'Unknown disruption')),
    ),
    impactedWindow: normalizeImpactedWindowText(
      asString(record.impactedWindow, ''),
      observedFlight,
      observedDisruption,
    ),
    staffingRisk: observedStaffing ? observedOverallRisk : asRiskLevel(record.staffingRisk, 'medium'),
    passengerImpact: simplifyPlainLanguage(asString(
      record.passengerImpact,
      buildFriendlyPassengerImpact(observedPassengerRecovery, observedDisruption),
    )),
    operationalFocus: simplifyPlainLanguage(asString(
      record.operationalFocus,
      asString(observedDisruption?.operationalImpact, 'Coordinate the station around the observed disruption state.'),
    )),
    recommendedNextAction,
    actions,
    timeline,
    staffingOptions: observedStaffingOptions.length ? observedStaffingOptions : modelStaffingOptions,
    passengerActions: observedPassengerActions.length ? observedPassengerActions : passengerActions,
    alternatives: asArray(record.alternatives)
      .map((item) => simplifyPlainLanguage(asString(item)))
      .filter(Boolean),
    steps: incidentState.toolSteps,
    mode: 'openrouter-agent',
    incidentContext: buildIncidentContext(incidentState),
  };
}

async function buildFallbackPlanWithAgentTrace(
  input: AnalyzeInput,
  runtimeConfig: RuntimeConfig,
  incidentState: AgentIncidentState,
  reason: string,
): Promise<RecoveryPlan> {
  const fallbackPlan = await runFallbackPlanner(input, runtimeConfig);

  const agentSteps: ToolStep[] = [
    ...incidentState.toolSteps,
    {
      tool: 'agent_fallback',
      input: {
        reason,
        attemptedToolCalls: incidentState.toolSteps.length,
      },
      outputSummary: `OpenRouter was attempted but the agent loop did not finish cleanly. The backup planner completed the response instead. Reason: ${reason}.`,
      status: 'info',
    },
  ];

  return {
    ...fallbackPlan,
    summary: `${fallbackPlan.summary} The AI agent path was attempted first, then handed off to the backup planner.`,
    steps: agentSteps.length ? agentSteps : fallbackPlan.steps,
    incidentContext: buildIncidentContext(incidentState),
  };
}

export async function runRecoveryAgent(input: AnalyzeInput, runtimeConfig: RuntimeConfig): Promise<RecoveryPlan> {
  void runtimeConfig;

  const incidentState: AgentIncidentState = {
    input: { ...input },
    systemState: createMockSystemState(),
    toolSteps: [],
    toolOutputs: [],
  };

  const messages: OpenRouterMessage[] = [
    { role: 'system', content: SYSTEM_PROMPT },
    { role: 'user', content: buildUserPrompt(input) },
  ];

  for (let iteration = 0; iteration < MAX_TOOL_ITERATIONS; iteration += 1) {
    const completion = await createOpenRouterCompletion({
      messages,
      tools: structuredToolDefinitions,
      toolChoice: 'auto',
      parallelToolCalls: true,
      temperature: 0.1,
    });
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

        const result = executeStructuredTool(incidentState.systemState, toolCall.function.name, toolCall.function.arguments);

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
          status: getToolStepStatus(result),
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

    const observedStaffing = getObservedStaffingRecord(incidentState);
    const reserveStaffCandidate = getReserveStaffActionCandidate(observedStaffing);
    const lastReserveStaffActionIndex = getLastToolIndex(incidentState, 'request_reserve_staff');

    if (reserveStaffCandidate && lastReserveStaffActionIndex < 0) {
      const observedFlight = getObservedFlightRecord(incidentState);
      const flightNumber = asString(observedFlight?.flightNumber, input.flightNumber || 'the same flight');
      messages.push({
        role: 'user',
        content: `Before you finalize, call request_reserve_staff for ${flightNumber} using role ${reserveStaffCandidate.role} and staffName ${reserveStaffCandidate.staffName}, then continue.`,
      });
      continue;
    }

    if (!hasObservedTool(incidentState, 'get_passenger_recovery_state')) {
      const observedFlight = getObservedFlightRecord(incidentState);
      const flightNumber = asString(observedFlight?.flightNumber, input.flightNumber || 'the same flight');
      messages.push({
        role: 'user',
        content: `Before you finalize, call get_passenger_recovery_state for ${flightNumber} and then continue with the final JSON response.`,
      });
      continue;
    }

    const observedPassengerRecovery = getObservedPassengerRecoveryRecord(incidentState);
    const lastPassengerObservationIndex = getLastToolIndex(incidentState, 'get_passenger_recovery_state');
    const lastRebookingSupportActionIndex = getLastToolIndex(incidentState, 'open_rebooking_support');
    const lastAnnouncementActionIndex = getLastToolIndex(incidentState, 'publish_passenger_announcement');

    if (needsRebookingSupport(observedPassengerRecovery) && lastRebookingSupportActionIndex < 0) {
      const observedFlight = getObservedFlightRecord(incidentState);
      const flightNumber = asString(observedFlight?.flightNumber, input.flightNumber || 'the same flight');
      messages.push({
        role: 'user',
        content: `Before you finalize, call open_rebooking_support for ${flightNumber}, then continue.`,
      });
      continue;
    }

    if (passengerAnnouncementReady(observedPassengerRecovery) && lastAnnouncementActionIndex < lastPassengerObservationIndex) {
      const observedFlight = getObservedFlightRecord(incidentState);
      const flightNumber = asString(observedFlight?.flightNumber, input.flightNumber || 'the same flight');
      messages.push({
        role: 'user',
        content: `Before you finalize, call publish_passenger_announcement for ${flightNumber} using the recommended passenger update, then continue.`,
      });
      continue;
    }

    try {
      return normalizeRecoveryPlan(extractJsonObject(finalContent), input, incidentState);
    } catch (error) {
      const detail = error instanceof Error ? error.message : 'The previous response was not valid JSON.';
      messages.push({
        role: 'user',
        content:
          `Your previous final response was not valid strict JSON. Error: ${detail}. ` +
          'Return the exact required JSON shape only, with double-quoted property names, no trailing commas, and no markdown fences.',
      });
      continue;
    }
  }

  return buildFallbackPlanWithAgentTrace(
    input,
    runtimeConfig,
    incidentState,
    `Reached the maximum tool-iteration budget of ${MAX_TOOL_ITERATIONS}.`,
  );
}
