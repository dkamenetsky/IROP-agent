import { RuntimeConfig, DisruptionTypeDefinition, ScenarioDefinition, RecoveryAction, PassengerRecoveryAction, EscalationStep, RiskLevel } from '@/lib/types';

export const RUNTIME_CONFIG_STORAGE_KEY = 'irop-runtime-config-v1';
const CONFIG_VERSION = 1;

function cloneAction(action: RecoveryAction): RecoveryAction {
  return {
    title: action.title,
    owner: action.owner,
    reason: action.reason,
    impact: action.impact,
  };
}

function clonePassengerAction(action: PassengerRecoveryAction): PassengerRecoveryAction {
  return {
    title: action.title,
    owner: action.owner,
    reason: action.reason,
  };
}

function cloneTimelineStep(step: EscalationStep): EscalationStep {
  return {
    phase: step.phase,
    trigger: step.trigger,
    action: step.action,
    owner: step.owner,
  };
}

function cloneDisruptionType(definition: DisruptionTypeDefinition): DisruptionTypeDefinition {
  return {
    ...definition,
    keywords: [...definition.keywords],
    actionRules: definition.actionRules.map(cloneAction),
    passengerActions: definition.passengerActions.map(clonePassengerAction),
    escalationTimeline: definition.escalationTimeline.map(cloneTimelineStep),
    alternatives: [...definition.alternatives],
  };
}

function cloneScenario(scenario: ScenarioDefinition): ScenarioDefinition {
  return { ...scenario };
}

export const defaultRuntimeConfig: RuntimeConfig = {
  version: CONFIG_VERSION,
  disruptionTypes: [
    {
      id: 'delay',
      label: 'Departure delay',
      description: 'A delayed departure that needs extended operational coverage and tighter coordination across gate, ramp, and operations.',
      keywords: ['delay', 'delayed', 'depart late', 'push back'],
      severity: 'high',
      staffingRisk: 'high',
      operationalFocus: 'Protect the revised departure window and keep all teams aligned on one plan.',
      passengerImpact: 'Passengers need clear timing updates and confidence that boarding will stay organized.',
      defaultImpactMinutes: 95,
      actionRules: [
        {
          title: 'Extend gate coverage through the revised departure window',
          owner: 'Gate lead',
          reason: 'Boarding activity will shift into a later bank and needs visible ownership.',
          impact: 'Reduces boarding confusion and missed announcements.',
        },
        {
          title: 'Hold one reserve ramp agent for compressed turnaround tasks',
          owner: 'Ramp supervisor',
          reason: 'Delayed departures create tighter sequencing on turnaround work.',
          impact: 'Protects departure readiness without overcommitting overtime.',
        },
        {
          title: 'Rebrief station control on the revised ETD for {flightNumber}',
          owner: 'Operations',
          reason: 'All front-line teams need the same timing assumption.',
          impact: 'Keeps the station aligned on one recovery plan.',
        },
      ],
      passengerActions: [
        {
          title: 'Publish an immediate delay update to gate displays and agents',
          owner: 'Gate lead',
          reason: 'Passengers need a single, visible source of truth.',
        },
        {
          title: 'Prepare one roaming staff member for questions near gate {gate}',
          owner: 'Duty manager',
          reason: 'A visible staff presence prevents crowding at the podium.',
        },
      ],
      escalationTimeline: [
        {
          phase: 'Now',
          trigger: 'Delay has been confirmed',
          action: 'Push the revised departure message and lock one operating plan for gate, ramp, and ops.',
          owner: 'Duty manager',
        },
        {
          phase: 'Next 15-30 min',
          trigger: 'Inbound timing remains stable',
          action: 'Reconfirm staff coverage, gate readiness, and boarding window for {flightNumber}.',
          owner: 'Operations',
        },
        {
          phase: 'If disruption worsens',
          trigger: 'Delay exceeds {delayMinutes} minutes or the inbound slips again',
          action: 'Move to stronger passenger support and reassess reserve staffing usage.',
          owner: 'Duty manager',
        },
      ],
      alternatives: [
        'Use reserve staff before approving overtime.',
        'Avoid pulling staff from the next departure bank unless the revised ETD slips again.',
      ],
    },
    {
      id: 'cancellation',
      label: 'Cancellation',
      description: 'A cancelled flight that shifts work from boarding to passenger reaccommodation and crowd control.',
      keywords: ['cancel', 'cancelled', 'cancellation'],
      severity: 'high',
      staffingRisk: 'high',
      operationalFocus: 'Move frontline effort from departure handling to passenger recovery and queue control.',
      passengerImpact: 'Customers need fast rebooking guidance, visible service desks, and clear exception handling.',
      defaultImpactMinutes: 60,
      actionRules: [
        {
          title: 'Redeploy gate staffing from boarding to rebooking support',
          owner: 'Duty manager',
          reason: 'Passenger service workload spikes immediately after a cancellation.',
          impact: 'Improves queue flow and reduces uncertainty in the gate area.',
        },
        {
          title: 'Assign reserve customer service support for voucher and reaccommodation work',
          owner: 'Customer service lead',
          reason: 'Cancelled flights create concentrated desk pressure.',
          impact: 'Prevents lobby congestion and long rebooking lines.',
        },
        {
          title: 'Release excess ramp coverage once baggage handling is stable',
          owner: 'Ramp supervisor',
          reason: 'Ramp demand drops after the flight is no longer departing.',
          impact: 'Preserves staffing for the next departure bank.',
        },
      ],
      passengerActions: [
        {
          title: 'Send an immediate cancellation message with rebooking instructions',
          owner: 'Customer service lead',
          reason: 'Passengers need a clear first step as soon as the flight is cancelled.',
        },
        {
          title: 'Assign one visible staff member to priority and special-assistance customers',
          owner: 'Duty manager',
          reason: 'High-friction cases need fast manual triage.',
        },
      ],
      escalationTimeline: [
        {
          phase: 'Now',
          trigger: 'Cancellation decision is final',
          action: 'Stop departure activity and pivot the team to passenger recovery.',
          owner: 'Duty manager',
        },
        {
          phase: 'Next 15-30 min',
          trigger: 'Queues start forming',
          action: 'Open a dedicated rebooking point and add wayfinding support near the original gate.',
          owner: 'Customer service lead',
        },
        {
          phase: 'If disruption worsens',
          trigger: 'Queue times exceed 20 minutes or vouchers are required',
          action: 'Add reserve service staff and escalate for goodwill support approval.',
          owner: 'Duty manager',
        },
      ],
      alternatives: [
        'Keep one gate-trained agent visible near the original boarding area to redirect passengers.',
        'Do not overstaff ramp handling once baggage and offload work are stable.',
      ],
    },
    {
      id: 'gate_change',
      label: 'Gate change',
      description: 'A last-minute gate move that creates wayfinding risk and boarding coordination problems.',
      keywords: ['gate change', 'moved gate', 'new gate', 'changed gate'],
      severity: 'medium',
      staffingRisk: 'medium',
      operationalFocus: 'Protect passenger wayfinding and keep boarding activity synchronized at the new gate.',
      passengerImpact: 'The biggest risk is confusion, no-shows, and late arrivals at the new gate.',
      defaultImpactMinutes: 60,
      actionRules: [
        {
          title: 'Move boarding setup for {flightNumber} from {gate} to the replacement gate',
          owner: 'Gate lead',
          reason: 'The operational focus shifts to fast, visible gate coordination.',
          impact: 'Keeps boarding setup aligned with the active departure point.',
        },
        {
          title: 'Position one staff member at the original gate to redirect passengers',
          owner: 'Duty manager',
          reason: 'Passengers often remain at the original gate after a late move.',
          impact: 'Reduces no-shows and boarding delays.',
        },
      ],
      passengerActions: [
        {
          title: 'Refresh gate displays and overhead announcements immediately',
          owner: 'Gate lead',
          reason: 'Passengers need repeated signals when a gate move happens late.',
        },
        {
          title: 'Place wayfinding support between the original and new gate areas',
          owner: 'Duty manager',
          reason: 'Walking passengers need a human cue in addition to signage.',
        },
      ],
      escalationTimeline: [
        {
          phase: 'Now',
          trigger: 'Gate move has been approved',
          action: 'Reset the active boarding point and notify every affected team.',
          owner: 'Operations',
        },
        {
          phase: 'Next 15-30 min',
          trigger: 'Passenger flow is moving toward the new gate',
          action: 'Keep one redirect staff member at the original gate until boarding is stable.',
          owner: 'Duty manager',
        },
        {
          phase: 'If disruption worsens',
          trigger: 'Boarding confusion continues or the move happens close to departure',
          action: 'Add extra wayfinding support and recheck boarding timing.',
          owner: 'Gate lead',
        },
      ],
      alternatives: [
        'Protect wayfinding before adding extra operations staffing.',
        'Keep the redirect role in place until the majority of passengers have reached the new gate.',
      ],
    },
    {
      id: 'late_inbound',
      label: 'Late inbound aircraft',
      description: 'A late-arriving aircraft that threatens the outbound turn and can compress both ramp and gate tasks.',
      keywords: ['late inbound', 'inbound aircraft', 'late aircraft', 'incoming aircraft'],
      severity: 'medium',
      staffingRisk: 'medium',
      operationalFocus: 'Protect the aircraft turn and keep the station ready for a compressed departure sequence.',
      passengerImpact: 'Passengers need reassurance that the delay is being actively managed and that boarding updates will follow.',
      defaultImpactMinutes: 70,
      actionRules: [
        {
          title: 'Protect turnaround coverage for the inbound serving {flightNumber}',
          owner: 'Ramp supervisor',
          reason: 'A compressed turn creates tight sequencing on turnaround tasks.',
          impact: 'Reduces the chance of a secondary delay during departure prep.',
        },
        {
          title: 'Keep gate staff aligned on a rolling estimate instead of a fixed promise',
          owner: 'Gate lead',
          reason: 'Inbound uncertainty makes overcommitting on timing risky.',
          impact: 'Improves trust and prevents repeated message reversals.',
        },
        {
          title: 'Stage reserve support if the turn remains compressed',
          owner: 'Duty manager',
          reason: 'Reserve staffing helps without immediately increasing overtime.',
          impact: 'Improves recovery flexibility through the revised departure window.',
        },
      ],
      passengerActions: [
        {
          title: 'Explain that the aircraft is still inbound and timing will be confirmed after arrival',
          owner: 'Gate lead',
          reason: 'Passengers react better to specific operational context than vague delay messaging.',
        },
        {
          title: 'Prepare one service staff member to handle connection or timing concerns',
          owner: 'Customer service lead',
          reason: 'Late inbound events create more connection-related questions.',
        },
      ],
      escalationTimeline: [
        {
          phase: 'Now',
          trigger: 'Inbound is confirmed late',
          action: 'Shift the station to a rolling ETA/ETD view and protect turn coverage.',
          owner: 'Operations',
        },
        {
          phase: 'Next 15-30 min',
          trigger: 'Inbound aircraft is still en route',
          action: 'Reconfirm reserve staffing and boarding readiness assumptions.',
          owner: 'Duty manager',
        },
        {
          phase: 'If disruption worsens',
          trigger: 'Turn time becomes too compressed for the original staffing plan',
          action: 'Escalate reserve use and review whether boarding sequencing needs to change.',
          owner: 'Ramp supervisor',
        },
      ],
      alternatives: [
        'Keep overtime as a secondary tool behind reserve usage.',
        'Avoid promising a firm ETD until the inbound aircraft is on the ground.',
      ],
    },
    {
      id: 'crew_timeout_risk',
      label: 'Crew timeout risk',
      description: 'A crew legality or duty-time concern that may force rapid resourcing and passenger messaging changes.',
      keywords: ['crew timeout', 'crew legality', 'duty time', 'timeout risk'],
      severity: 'high',
      staffingRisk: 'high',
      operationalFocus: 'Coordinate quickly across operations, crew support, and gate teams before the issue becomes a cancellation.',
      passengerImpact: 'Customers need steady updates while the station confirms whether the flight will operate on time, delay, or cancel.',
      defaultImpactMinutes: 90,
      actionRules: [
        {
          title: 'Escalate immediately for crew-status confirmation on {flightNumber}',
          owner: 'Operations',
          reason: 'Crew legality risk must be confirmed before downstream staffing decisions are locked in.',
          impact: 'Prevents the station from staffing to an invalid operating assumption.',
        },
        {
          title: 'Prepare a reserve customer service posture while the decision is pending',
          owner: 'Duty manager',
          reason: 'Passengers may need fast rebooking support if the issue becomes a cancellation.',
          impact: 'Cuts response time if the scenario escalates.',
        },
      ],
      passengerActions: [
        {
          title: 'Use holding language that explains an operational review is underway',
          owner: 'Gate lead',
          reason: 'Passengers need a transparent update without overpromising the final outcome.',
        },
      ],
      escalationTimeline: [
        {
          phase: 'Now',
          trigger: 'Crew legality concern is reported',
          action: 'Hold final staffing moves until operating status is confirmed.',
          owner: 'Duty manager',
        },
        {
          phase: 'Next 15-30 min',
          trigger: 'Replacement crew is not yet confirmed',
          action: 'Stage customer recovery staffing and review gate messaging cadence.',
          owner: 'Customer service lead',
        },
        {
          phase: 'If disruption worsens',
          trigger: 'Flight is likely to cancel or delay materially',
          action: 'Shift the station into cancellation-style passenger recovery.',
          owner: 'Duty manager',
        },
      ],
      alternatives: [
        'Treat the issue like a pending cancellation until crew status is confirmed.',
        'Avoid committing scarce reserve staff until the operating outcome is clearer.',
      ],
    },
  ],
  scenarios: [
    {
      id: 'scenario-delay',
      title: 'Delay recovery',
      flightNumber: 'PD123',
      disruptionTypeId: 'delay',
      notes: '95 minute departure delay. Keep overtime low and keep the station aligned.',
      message: 'PD123 is delayed 95 minutes. What should we do?',
    },
    {
      id: 'scenario-cancel',
      title: 'Cancellation handling',
      flightNumber: 'PD67',
      disruptionTypeId: 'cancellation',
      notes: 'Cancellation decision is final. Prioritize rebooking flow and visible passenger support.',
      message: 'How should we handle the cancellation of PD67?',
    },
    {
      id: 'scenario-gate',
      title: 'Gate change',
      flightNumber: 'PD010',
      disruptionTypeId: 'gate_change',
      notes: 'Gate changed from A2 to A5. Protect wayfinding and boarding flow.',
      message: 'Gate changed for PD010 from A2 to A5. Give me a staffing plan.',
    },
    {
      id: 'scenario-inbound',
      title: 'Late inbound aircraft',
      flightNumber: 'PD123',
      disruptionTypeId: 'late_inbound',
      notes: 'Late inbound pushes the departure back roughly 70 minutes. Minimize overtime.',
      message: 'A late inbound aircraft will push PD123 back by 70 minutes. Minimize overtime.',
    },
    {
      id: 'scenario-crew',
      title: 'Crew timeout risk',
      flightNumber: 'PD67',
      disruptionTypeId: 'crew_timeout_risk',
      notes: 'Crew duty-time exposure is growing. Prepare a backup staffing and passenger plan.',
      message: 'PD67 has a crew timeout risk. Give me a contingency plan.',
    },
  ],
};

function asString(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback;
}

function asStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.map((item) => asString(item)).filter(Boolean) : [];
}

function asRiskLevel(value: unknown, fallback: RiskLevel): RiskLevel {
  return value === 'low' || value === 'medium' || value === 'high' ? value : fallback;
}

function normalizeAction(value: unknown): RecoveryAction | null {
  if (!value || typeof value !== 'object') return null;
  const record = value as Record<string, unknown>;
  return {
    title: asString(record.title),
    owner: asString(record.owner),
    reason: asString(record.reason),
    impact: asString(record.impact),
  };
}

function normalizePassengerAction(value: unknown): PassengerRecoveryAction | null {
  if (!value || typeof value !== 'object') return null;
  const record = value as Record<string, unknown>;
  return {
    title: asString(record.title),
    owner: asString(record.owner),
    reason: asString(record.reason),
  };
}

function normalizeTimelineStep(value: unknown): EscalationStep | null {
  if (!value || typeof value !== 'object') return null;
  const record = value as Record<string, unknown>;
  return {
    phase: asString(record.phase),
    trigger: asString(record.trigger),
    action: asString(record.action),
    owner: asString(record.owner),
  };
}

function normalizeDisruptionType(value: unknown, fallback: DisruptionTypeDefinition): DisruptionTypeDefinition {
  if (!value || typeof value !== 'object') {
    return cloneDisruptionType(fallback);
  }

  const record = value as Record<string, unknown>;
  const normalized: DisruptionTypeDefinition = {
    id: asString(record.id, fallback.id),
    label: asString(record.label, fallback.label),
    description: asString(record.description, fallback.description),
    keywords: asStringArray(record.keywords),
    severity: asRiskLevel(record.severity, fallback.severity),
    staffingRisk: asRiskLevel(record.staffingRisk, fallback.staffingRisk),
    operationalFocus: asString(record.operationalFocus, fallback.operationalFocus),
    passengerImpact: asString(record.passengerImpact, fallback.passengerImpact),
    defaultImpactMinutes:
      typeof record.defaultImpactMinutes === 'number' && Number.isFinite(record.defaultImpactMinutes)
        ? record.defaultImpactMinutes
        : fallback.defaultImpactMinutes,
    actionRules: Array.isArray(record.actionRules)
      ? record.actionRules.map(normalizeAction).filter((item): item is RecoveryAction => Boolean(item && item.title))
      : fallback.actionRules.map(cloneAction),
    passengerActions: Array.isArray(record.passengerActions)
      ? record.passengerActions
          .map(normalizePassengerAction)
          .filter((item): item is PassengerRecoveryAction => Boolean(item && item.title))
      : fallback.passengerActions.map(clonePassengerAction),
    escalationTimeline: Array.isArray(record.escalationTimeline)
      ? record.escalationTimeline
          .map(normalizeTimelineStep)
          .filter((item): item is EscalationStep => Boolean(item && item.phase))
      : fallback.escalationTimeline.map(cloneTimelineStep),
    alternatives: asStringArray(record.alternatives),
  };

  if (!normalized.id) normalized.id = fallback.id;
  if (!normalized.label) normalized.label = fallback.label;
  if (!normalized.keywords.length) normalized.keywords = [...fallback.keywords];
  if (!normalized.actionRules.length) normalized.actionRules = fallback.actionRules.map(cloneAction);
  if (!normalized.passengerActions.length) normalized.passengerActions = fallback.passengerActions.map(clonePassengerAction);
  if (!normalized.escalationTimeline.length) normalized.escalationTimeline = fallback.escalationTimeline.map(cloneTimelineStep);
  if (!normalized.alternatives.length) normalized.alternatives = [...fallback.alternatives];

  return normalized;
}

function normalizeScenario(value: unknown, fallback: ScenarioDefinition): ScenarioDefinition {
  if (!value || typeof value !== 'object') {
    return cloneScenario(fallback);
  }

  const record = value as Record<string, unknown>;
  const normalized = {
    id: asString(record.id, fallback.id),
    title: asString(record.title, fallback.title),
    flightNumber: asString(record.flightNumber, fallback.flightNumber),
    disruptionTypeId: asString(record.disruptionTypeId, fallback.disruptionTypeId),
    notes: asString(record.notes, fallback.notes),
    message: asString(record.message, fallback.message),
  };

  if (!normalized.id) normalized.id = fallback.id;
  if (!normalized.title) normalized.title = fallback.title;
  if (!normalized.flightNumber) normalized.flightNumber = fallback.flightNumber;
  if (!normalized.disruptionTypeId) normalized.disruptionTypeId = fallback.disruptionTypeId;

  return normalized;
}

export function cloneRuntimeConfig(config: RuntimeConfig): RuntimeConfig {
  return {
    version: config.version,
    disruptionTypes: config.disruptionTypes.map(cloneDisruptionType),
    scenarios: config.scenarios.map(cloneScenario),
  };
}

export function normalizeRuntimeConfig(value: unknown): RuntimeConfig {
  if (!value || typeof value !== 'object') {
    return cloneRuntimeConfig(defaultRuntimeConfig);
  }

  const record = value as Record<string, unknown>;
  const fallbackDisruptionTypes = defaultRuntimeConfig.disruptionTypes;
  const fallbackScenarios = defaultRuntimeConfig.scenarios;

  const disruptionTypes = Array.isArray(record.disruptionTypes)
    ? record.disruptionTypes.map((item, index) =>
        normalizeDisruptionType(item, fallbackDisruptionTypes[index] || fallbackDisruptionTypes[0]),
      )
    : fallbackDisruptionTypes.map(cloneDisruptionType);

  const scenarios = Array.isArray(record.scenarios)
    ? record.scenarios.map((item, index) => normalizeScenario(item, fallbackScenarios[index] || fallbackScenarios[0]))
    : fallbackScenarios.map(cloneScenario);

  return {
    version:
      typeof record.version === 'number' && Number.isFinite(record.version) ? record.version : defaultRuntimeConfig.version,
    disruptionTypes: disruptionTypes.length ? disruptionTypes : fallbackDisruptionTypes.map(cloneDisruptionType),
    scenarios: scenarios.length ? scenarios : fallbackScenarios.map(cloneScenario),
  };
}

export function readBrowserRuntimeConfig(): RuntimeConfig {
  if (typeof window === 'undefined') {
    return cloneRuntimeConfig(defaultRuntimeConfig);
  }

  try {
    const raw = window.localStorage.getItem(RUNTIME_CONFIG_STORAGE_KEY);
    if (!raw) return cloneRuntimeConfig(defaultRuntimeConfig);
    return normalizeRuntimeConfig(JSON.parse(raw));
  } catch {
    return cloneRuntimeConfig(defaultRuntimeConfig);
  }
}

export function saveBrowserRuntimeConfig(config: RuntimeConfig) {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(RUNTIME_CONFIG_STORAGE_KEY, JSON.stringify(config));
}

export function resetBrowserRuntimeConfig() {
  if (typeof window === 'undefined') return;
  window.localStorage.removeItem(RUNTIME_CONFIG_STORAGE_KEY);
}
