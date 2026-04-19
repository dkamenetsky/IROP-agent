import { RiskLevel, StaffRole } from '@/lib/types';

type JsonSchema = Record<string, unknown>;

export interface StructuredToolDefinition {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: JsonSchema;
  };
}

interface MockDisruptionState {
  id: string;
  type: string;
  label: string;
  status: 'active' | 'watch';
  severity: RiskLevel;
  reason: string;
  minutesDelayed?: number;
  newGate?: string;
  operationalImpact: string;
  passengerImpact: string;
}

interface MockFlightState {
  flightNumber: string;
  station: string;
  route: {
    origin: string;
    destination: string;
  };
  scheduledDeparture: string;
  scheduledDepartureLocal: string;
  currentGate: string;
  passengers: number;
  rolesNeeded: Partial<Record<StaffRole, number>>;
  knownDisruptions: MockDisruptionState[];
}

interface MockStaffRecord {
  id: string;
  name: string;
  role: StaffRole;
  certifications: string[];
  shiftStart: string;
  shiftEnd: string;
  hoursThisWeek: number;
  maxHours: number;
  onReserve: boolean;
  assignedFlights: string[];
}

interface StaffingCoverageEntry {
  role: StaffRole;
  required: number;
  scheduled: number;
  availableForRecovery: number;
  reserveAvailable: number;
  status: 'ready' | 'watch' | 'gap';
  recommendedStaff: string | null;
  backups: string[];
  reason: string;
  complianceRisks: string[];
  excludedCandidates: string[];
}

interface MockPassengerRecoveryState {
  flightNumber: string;
  totalPassengers: number;
  impactedPassengers: number;
  misconnectRisk: 'low' | 'medium' | 'high';
  queueStatus: 'stable' | 'building' | 'critical';
  specialAssistanceCount: number;
  priorityPassengerCount: number;
  reaccommodationStatus: {
    alreadyProtected: number;
    needsManualHandling: number;
    selfServeEligible: number;
  };
  communicationStatus: {
    lastUpdateSent: string;
    nextRecommendedMessage: string;
    announcementReady: boolean;
  };
  topConcerns: string[];
}

interface MockActionLogEntry {
  tool: string;
  flightNumber: string;
  status: 'executed';
  executedAt: string;
  details: Record<string, unknown>;
}

export interface MockSystemState {
  flightStates: Record<string, MockFlightState>;
  staffRoster: MockStaffRecord[];
  passengerRecoveryStates: Record<string, MockPassengerRecoveryState>;
  actionLog: MockActionLogEntry[];
}

const GET_FLIGHT_STATE_TOOL = 'get_flight_state';
const GET_STAFFING_STATE_TOOL = 'get_staffing_state';
const GET_PASSENGER_RECOVERY_STATE_TOOL = 'get_passenger_recovery_state';
const PUBLISH_PASSENGER_ANNOUNCEMENT_TOOL = 'publish_passenger_announcement';
const REQUEST_RESERVE_STAFF_TOOL = 'request_reserve_staff';

const BASE_FLIGHT_STATES: Record<string, MockFlightState> = {
  PD218: {
    flightNumber: 'PD218',
    station: 'YTZ',
    route: { origin: 'YTZ', destination: 'YOW' },
    scheduledDeparture: '2026-04-17T17:10:00',
    scheduledDepartureLocal: '2026-04-17 17:10',
    currentGate: 'A2',
    passengers: 94,
    rolesNeeded: { Gate: 2, Ramp: 2, 'Customer Service': 1, Operations: 1 },
    knownDisruptions: [
      {
        id: 'd1',
        type: 'delay',
        label: 'Departure delay',
        status: 'active',
        severity: 'high',
        reason: 'Crew arrival delay from inbound aircraft',
        minutesDelayed: 95,
        operationalImpact: 'Extended gate coverage and tighter station coordination are required.',
        passengerImpact: 'Passengers need clear revised departure timing and active crowd management.',
      },
      {
        id: 'd4',
        type: 'late_inbound',
        label: 'Late inbound aircraft',
        status: 'watch',
        severity: 'medium',
        reason: 'Late aircraft arrival from previous sector',
        minutesDelayed: 70,
        operationalImpact: 'The outbound turn is compressed and turnaround tasks may stack up.',
        passengerImpact: 'Connection and timing concerns are likely to increase at the gate.',
      },
    ],
  },
  PD412: {
    flightNumber: 'PD412',
    station: 'YTZ',
    route: { origin: 'YTZ', destination: 'YUL' },
    scheduledDeparture: '2026-04-17T18:00:00',
    scheduledDepartureLocal: '2026-04-17 18:00',
    currentGate: 'A4',
    passengers: 76,
    rolesNeeded: { Gate: 2, Ramp: 2, 'Customer Service': 2, Operations: 1 },
    knownDisruptions: [
      {
        id: 'd2',
        type: 'cancellation',
        label: 'Cancellation',
        status: 'active',
        severity: 'high',
        reason: 'Weather and network recovery constraints',
        operationalImpact: 'Departure handling stops and the station pivots to passenger recovery.',
        passengerImpact: 'Rebooking, vouchers, and queue control become the primary pressure points.',
      },
      {
        id: 'd5',
        type: 'crew_timeout_risk',
        label: 'Crew timeout risk',
        status: 'watch',
        severity: 'high',
        reason: 'Crew duty-time exposure is approaching a legality threshold',
        minutesDelayed: 90,
        operationalImpact: 'Operating status may change quickly if replacement crew cannot be confirmed.',
        passengerImpact: 'Passengers need steady holding updates while the operating decision is still pending.',
      },
    ],
  },
  PD305: {
    flightNumber: 'PD305',
    station: 'YTZ',
    route: { origin: 'YTZ', destination: 'EWR' },
    scheduledDeparture: '2026-04-17T18:20:00',
    scheduledDepartureLocal: '2026-04-17 18:20',
    currentGate: 'A2',
    passengers: 88,
    rolesNeeded: { Gate: 2, Ramp: 1, 'Customer Service': 1, Operations: 1 },
    knownDisruptions: [
      {
        id: 'd3',
        type: 'gate_change',
        label: 'Gate change',
        status: 'active',
        severity: 'medium',
        reason: 'Stand availability conflict',
        newGate: 'A5',
        operationalImpact: 'Boarding activity and wayfinding support must shift quickly to the new gate.',
        passengerImpact: 'Late gate changes increase the risk of confusion and missed boarding calls.',
      },
    ],
  },
};

const BASE_STAFF_ROSTER: MockStaffRecord[] = [
  {
    id: 's1',
    name: 'Mia Chen',
    role: 'Gate',
    certifications: ['boarding', 'gate_change'],
    shiftStart: '2026-04-17T13:00:00',
    shiftEnd: '2026-04-17T21:00:00',
    hoursThisWeek: 34,
    maxHours: 40,
    onReserve: false,
    assignedFlights: ['PD218'],
  },
  {
    id: 's2',
    name: 'Noah Patel',
    role: 'Gate',
    certifications: ['boarding', 'reaccommodation'],
    shiftStart: '2026-04-17T12:00:00',
    shiftEnd: '2026-04-17T20:00:00',
    hoursThisWeek: 30,
    maxHours: 40,
    onReserve: true,
    assignedFlights: ['PD412'],
  },
  {
    id: 's3',
    name: 'Ava Ross',
    role: 'Ramp',
    certifications: ['pushback', 'turnaround'],
    shiftStart: '2026-04-17T14:00:00',
    shiftEnd: '2026-04-17T22:00:00',
    hoursThisWeek: 32,
    maxHours: 40,
    onReserve: false,
    assignedFlights: ['PD218', 'PD305'],
  },
  {
    id: 's4',
    name: 'Liam Grant',
    role: 'Ramp',
    certifications: ['pushback', 'deice'],
    shiftStart: '2026-04-17T11:00:00',
    shiftEnd: '2026-04-17T19:00:00',
    hoursThisWeek: 28,
    maxHours: 40,
    onReserve: true,
    assignedFlights: ['PD412'],
  },
  {
    id: 's5',
    name: 'Sofia Nguyen',
    role: 'Customer Service',
    certifications: ['reaccommodation', 'voucher_handling'],
    shiftStart: '2026-04-17T10:00:00',
    shiftEnd: '2026-04-17T18:00:00',
    hoursThisWeek: 36,
    maxHours: 40,
    onReserve: false,
    assignedFlights: ['PD412'],
  },
  {
    id: 's6',
    name: 'Ethan Walker',
    role: 'Customer Service',
    certifications: ['reaccommodation', 'irregular_ops'],
    shiftStart: '2026-04-17T14:00:00',
    shiftEnd: '2026-04-17T22:00:00',
    hoursThisWeek: 24,
    maxHours: 40,
    onReserve: true,
    assignedFlights: [],
  },
  {
    id: 's7',
    name: 'Olivia Brooks',
    role: 'Operations',
    certifications: ['station_control', 'irregular_ops'],
    shiftStart: '2026-04-17T09:00:00',
    shiftEnd: '2026-04-17T17:30:00',
    hoursThisWeek: 38,
    maxHours: 45,
    onReserve: false,
    assignedFlights: ['PD218', 'PD412', 'PD305'],
  },
  {
    id: 's8',
    name: 'Daniel Kim',
    role: 'Operations',
    certifications: ['station_control', 'gate_coordination'],
    shiftStart: '2026-04-17T14:00:00',
    shiftEnd: '2026-04-17T23:00:00',
    hoursThisWeek: 26,
    maxHours: 45,
    onReserve: true,
    assignedFlights: [],
  },
];

const BASE_PASSENGER_RECOVERY_STATES: Record<string, MockPassengerRecoveryState> = {
  PD218: {
    flightNumber: 'PD218',
    totalPassengers: 94,
    impactedPassengers: 94,
    misconnectRisk: 'medium',
    queueStatus: 'building',
    specialAssistanceCount: 5,
    priorityPassengerCount: 11,
    reaccommodationStatus: {
      alreadyProtected: 0,
      needsManualHandling: 18,
      selfServeEligible: 76,
    },
    communicationStatus: {
      lastUpdateSent: '2026-04-17T16:35:00',
      nextRecommendedMessage: 'Delay update with revised departure expectations and gate presence guidance.',
      announcementReady: true,
    },
    topConcerns: [
      'Gate-area crowding is increasing as passengers wait for a revised departure update.',
      'A moderate number of connecting passengers may need proactive timing support.',
    ],
  },
  PD412: {
    flightNumber: 'PD412',
    totalPassengers: 76,
    impactedPassengers: 76,
    misconnectRisk: 'high',
    queueStatus: 'critical',
    specialAssistanceCount: 6,
    priorityPassengerCount: 9,
    reaccommodationStatus: {
      alreadyProtected: 21,
      needsManualHandling: 29,
      selfServeEligible: 26,
    },
    communicationStatus: {
      lastUpdateSent: '2026-04-17T17:05:00',
      nextRecommendedMessage: 'Cancellation message with rebooking and service-desk routing instructions.',
      announcementReady: true,
    },
    topConcerns: [
      'Manual reaccommodation pressure is high and priority passengers need fast triage.',
      'Queue growth is likely unless visible rebooking support is added quickly.',
    ],
  },
  PD305: {
    flightNumber: 'PD305',
    totalPassengers: 88,
    impactedPassengers: 88,
    misconnectRisk: 'low',
    queueStatus: 'stable',
    specialAssistanceCount: 4,
    priorityPassengerCount: 8,
    reaccommodationStatus: {
      alreadyProtected: 0,
      needsManualHandling: 6,
      selfServeEligible: 82,
    },
    communicationStatus: {
      lastUpdateSent: '2026-04-17T17:40:00',
      nextRecommendedMessage: 'Gate change message with repeated wayfinding and boarding location reminders.',
      announcementReady: true,
    },
    topConcerns: [
      'Passengers at the original gate may miss the move without repeated direction.',
      'Special-assistance travelers need support during the gate transition.',
    ],
  },
};

export const structuredToolDefinitions: StructuredToolDefinition[] = [
  {
    type: 'function',
    function: {
      name: GET_FLIGHT_STATE_TOOL,
      description:
        'Read the current operational state for one flight from the station operations system. Use this before making recovery recommendations.',
      parameters: {
        type: 'object',
        properties: {
          flightNumber: {
            type: 'string',
            description: 'The airline flight number, for example PD218.',
          },
        },
        required: ['flightNumber'],
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function',
    function: {
      name: GET_STAFFING_STATE_TOOL,
      description:
        'Read staffing coverage, reserve depth, and compliance-sensitive constraints for one disrupted flight from the station staffing system.',
      parameters: {
        type: 'object',
        properties: {
          flightNumber: {
            type: 'string',
            description: 'The airline flight number, for example PD218.',
          },
        },
        required: ['flightNumber'],
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function',
    function: {
      name: GET_PASSENGER_RECOVERY_STATE_TOOL,
      description:
        'Read passenger recovery pressure, communication readiness, and reaccommodation status for one disrupted flight from the customer recovery system.',
      parameters: {
        type: 'object',
        properties: {
          flightNumber: {
            type: 'string',
            description: 'The airline flight number, for example PD218.',
          },
        },
        required: ['flightNumber'],
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function',
    function: {
      name: PUBLISH_PASSENGER_ANNOUNCEMENT_TOOL,
      description:
        'Publish a passenger-facing announcement in the mock recovery system. This is a sandbox execution tool that updates communication state for the flight.',
      parameters: {
        type: 'object',
        properties: {
          flightNumber: {
            type: 'string',
            description: 'The airline flight number, for example PD218.',
          },
          messageType: {
            type: 'string',
            description: 'A short message category such as delay_update, cancellation_update, or gate_change_update.',
          },
          messageBody: {
            type: 'string',
            description: 'The concise announcement text to publish to passengers.',
          },
        },
        required: ['flightNumber', 'messageType', 'messageBody'],
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function',
    function: {
      name: REQUEST_RESERVE_STAFF_TOOL,
      description:
        'Assign one reserve staff member to support a disrupted flight in the mock staffing system. This is a sandbox execution tool that updates staffing state for the flight.',
      parameters: {
        type: 'object',
        properties: {
          flightNumber: {
            type: 'string',
            description: 'The airline flight number, for example PD218.',
          },
          role: {
            type: 'string',
            description: 'The role to reinforce, for example Gate or Ramp.',
          },
          staffName: {
            type: 'string',
            description: 'The reserve staff member to assign.',
          },
        },
        required: ['flightNumber', 'role', 'staffName'],
        additionalProperties: false,
      },
    },
  },
];

function deepClone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

export function createMockSystemState(): MockSystemState {
  return {
    flightStates: deepClone(BASE_FLIGHT_STATES),
    staffRoster: deepClone(BASE_STAFF_ROSTER),
    passengerRecoveryStates: deepClone(BASE_PASSENGER_RECOVERY_STATES),
    actionLog: [],
  };
}

function normalizeFlightNumber(value: unknown): string {
  return typeof value === 'string' ? value.trim().toUpperCase() : '';
}

function parseDate(value: string): Date {
  return new Date(value);
}

function getCoverageWindow(flightState: MockFlightState) {
  const scheduledDeparture = parseDate(flightState.scheduledDeparture);
  const activeDisruption =
    flightState.knownDisruptions.find((item) => item.status === 'active') || flightState.knownDisruptions[0];
  const delayMinutes = activeDisruption?.minutesDelayed || 60;
  const start = new Date(scheduledDeparture.getTime() - 45 * 60_000);
  const end = new Date(scheduledDeparture.getTime() + (delayMinutes + 45) * 60_000);

  return {
    start,
    end,
    startLocal: start.toISOString(),
    endLocal: end.toISOString(),
  };
}

function overlapsCoverage(member: MockStaffRecord, coverageWindow: { start: Date; end: Date }) {
  const shiftStart = parseDate(member.shiftStart);
  const shiftEnd = parseDate(member.shiftEnd);
  return shiftStart <= coverageWindow.start && shiftEnd >= coverageWindow.end;
}

function isNearHourLimit(member: MockStaffRecord) {
  return member.maxHours - member.hoursThisWeek <= 4;
}

function evaluateRoleCoverage(
  state: MockSystemState,
  flightState: MockFlightState,
  role: StaffRole,
  required: number,
): StaffingCoverageEntry {
  const coverageWindow = getCoverageWindow(flightState);
  const scheduled = state.staffRoster.filter(
    (member) => member.role === role && member.assignedFlights.includes(flightState.flightNumber),
  );
  const candidates: Array<{ member: MockStaffRecord; score: number }> = [];
  const excludedCandidates: string[] = [];
  const complianceRisks = scheduled
    .filter(isNearHourLimit)
    .map((member) => `${member.name}: within 4 hours of weekly maximum`);

  for (const member of state.staffRoster) {
    if (member.role !== role) continue;

    if (member.assignedFlights.includes(flightState.flightNumber) && !member.onReserve) {
      excludedCandidates.push(`${member.name}: already committed to ${flightState.flightNumber}`);
      continue;
    }

    if (!overlapsCoverage(member, coverageWindow)) {
      excludedCandidates.push(`${member.name}: shift does not cover the disruption window`);
      continue;
    }

    if (member.hoursThisWeek >= member.maxHours) {
      excludedCandidates.push(`${member.name}: max weekly hours reached`);
      continue;
    }

    const hoursRemaining = member.maxHours - member.hoursThisWeek;
    const reserveBonus = member.onReserve ? 100 : 0;
    const assignmentPenalty = member.assignedFlights.length * 10;
    const fatiguePenalty = isNearHourLimit(member) ? 20 : 0;
    const score = reserveBonus + hoursRemaining * 5 - assignmentPenalty - fatiguePenalty;

    candidates.push({ member, score });
  }

  candidates.sort((a, b) => b.score - a.score || a.member.name.localeCompare(b.member.name));

  const reserveAvailable = candidates.filter((candidate) => candidate.member.onReserve).length;
  const scheduledCount = scheduled.length;
  const availableForRecovery = candidates.length;
  const recoverableCount = scheduledCount + availableForRecovery;

  let status: StaffingCoverageEntry['status'] = 'ready';
  if (recoverableCount < required) status = 'gap';
  else if (recoverableCount === required || reserveAvailable === 0) status = 'watch';

  const recommendedStaff = candidates[0]?.member.name || null;
  const backups = candidates.slice(1, 3).map((candidate) => candidate.member.name);

  const reason =
    status === 'gap'
      ? `Observed ${role.toLowerCase()} coverage cannot fully meet the required headcount of ${required} during the disruption window.`
      : status === 'watch'
        ? `Observed ${role.toLowerCase()} coverage can meet demand, but reserve depth is thin and the station has limited recovery flexibility.`
        : `Observed ${role.toLowerCase()} coverage meets the requirement and retains reserve depth for the disruption window.`;

  return {
    role,
    required,
    scheduled: scheduledCount,
    availableForRecovery,
    reserveAvailable,
    status,
    recommendedStaff,
    backups,
    reason,
    complianceRisks,
    excludedCandidates,
  };
}

function buildStaffingState(state: MockSystemState, flightState: MockFlightState) {
  const coverageWindow = getCoverageWindow(flightState);
  const roleCoverage = (Object.entries(flightState.rolesNeeded) as Array<[StaffRole, number]>).map(([role, required]) =>
    evaluateRoleCoverage(state, flightState, role, required),
  );

  const overallRisk: RiskLevel = roleCoverage.some((entry) => entry.status === 'gap')
    ? 'high'
    : roleCoverage.some((entry) => entry.status === 'watch')
      ? 'medium'
      : 'low';

  const notes = [
    'This staffing system reports read-only mock coverage and reserve depth.',
    'Compliance-sensitive conditions are surfaced as warnings and do not auto-approve overtime.',
  ];

  return {
    station: flightState.station,
    coverageWindow: {
      start: coverageWindow.startLocal,
      end: coverageWindow.endLocal,
    },
    overallRisk,
    roleCoverage,
    notes,
  };
}

function getFlightState(state: MockSystemState, flightNumber: string) {
  const normalizedFlightNumber = normalizeFlightNumber(flightNumber);
  const flightState = state.flightStates[normalizedFlightNumber];

  if (!flightState) {
    return {
      ok: false,
      error: {
        code: 'FLIGHT_NOT_FOUND',
        message: `Flight ${normalizedFlightNumber || '(empty)'} is not present in the mock operations dataset.`,
      },
      availableFlights: Object.keys(state.flightStates),
      sourceSystem: 'mock-flight-ops',
      dataFreshness: 'mock-static',
    };
  }

  return {
    ok: true,
    sourceSystem: 'mock-flight-ops',
    dataFreshness: 'mock-static',
    staffingVerification: 'available_via_get_staffing_state',
    passengerRecoveryVerification: 'available_via_get_passenger_recovery_state',
    flight: flightState,
  };
}

function getStaffingState(state: MockSystemState, flightNumber: string) {
  const normalizedFlightNumber = normalizeFlightNumber(flightNumber);
  const flightState = state.flightStates[normalizedFlightNumber];

  if (!flightState) {
    return {
      ok: false,
      error: {
        code: 'FLIGHT_NOT_FOUND',
        message: `Flight ${normalizedFlightNumber || '(empty)'} is not present in the mock staffing dataset.`,
      },
      availableFlights: Object.keys(state.flightStates),
      sourceSystem: 'mock-staff-ops',
      dataFreshness: 'mock-static',
    };
  }

  return {
    ok: true,
    sourceSystem: 'mock-staff-ops',
    dataFreshness: 'mock-static',
    flightNumber: normalizedFlightNumber,
    staffing: buildStaffingState(state, flightState),
  };
}

function getPassengerRecoveryState(state: MockSystemState, flightNumber: string) {
  const normalizedFlightNumber = normalizeFlightNumber(flightNumber);
  const passengerState = state.passengerRecoveryStates[normalizedFlightNumber];

  if (!passengerState) {
    return {
      ok: false,
      error: {
        code: 'FLIGHT_NOT_FOUND',
        message: `Flight ${normalizedFlightNumber || '(empty)'} is not present in the mock passenger recovery dataset.`,
      },
      availableFlights: Object.keys(state.passengerRecoveryStates),
      sourceSystem: 'mock-passenger-recovery',
      dataFreshness: 'mock-static',
    };
  }

  return {
    ok: true,
    sourceSystem: 'mock-passenger-recovery',
    dataFreshness: 'mock-static',
    flightNumber: normalizedFlightNumber,
    passengerRecovery: passengerState,
  };
}

function publishPassengerAnnouncement(
  state: MockSystemState,
  flightNumber: string,
  messageType: string,
  messageBody: string,
) {
  const normalizedFlightNumber = normalizeFlightNumber(flightNumber);
  const passengerState = state.passengerRecoveryStates[normalizedFlightNumber];

  if (!passengerState) {
    return {
      ok: false,
      error: {
        code: 'FLIGHT_NOT_FOUND',
        message: `Flight ${normalizedFlightNumber || '(empty)'} is not present in the mock passenger recovery dataset.`,
      },
      availableFlights: Object.keys(state.passengerRecoveryStates),
      sourceSystem: 'mock-passenger-recovery',
      dataFreshness: 'mock-static',
    };
  }

  const executedAt = new Date().toISOString();
  passengerState.communicationStatus.lastUpdateSent = executedAt;
  passengerState.communicationStatus.announcementReady = false;
  passengerState.communicationStatus.nextRecommendedMessage =
    'Wait for the next operational change before sending another broad passenger update.';
  passengerState.topConcerns = passengerState.topConcerns.filter(
    (concern) => !concern.toLowerCase().includes('revised departure update') && !concern.toLowerCase().includes('repeated direction'),
  );

  if (passengerState.queueStatus === 'critical') passengerState.queueStatus = 'building';
  else if (passengerState.queueStatus === 'building') passengerState.queueStatus = 'stable';

  state.actionLog.push({
    tool: PUBLISH_PASSENGER_ANNOUNCEMENT_TOOL,
    flightNumber: normalizedFlightNumber,
    status: 'executed',
    executedAt,
    details: {
      messageType,
      messageBody,
    },
  });

  return {
    ok: true,
    sourceSystem: 'mock-passenger-recovery',
    dataFreshness: 'mock-static-updated',
    action: {
      tool: PUBLISH_PASSENGER_ANNOUNCEMENT_TOOL,
      flightNumber: normalizedFlightNumber,
      messageType,
      messageBody,
      executedAt,
      result: 'published',
    },
    passengerRecovery: passengerState,
  };
}

function requestReserveStaff(
  state: MockSystemState,
  flightNumber: string,
  role: string,
  staffName: string,
) {
  const normalizedFlightNumber = normalizeFlightNumber(flightNumber);
  const normalizedRole = role.trim() as StaffRole;
  const normalizedStaffName = staffName.trim().toLowerCase();
  const flightState = state.flightStates[normalizedFlightNumber];

  if (!flightState) {
    return {
      ok: false,
      error: {
        code: 'FLIGHT_NOT_FOUND',
        message: `Flight ${normalizedFlightNumber || '(empty)'} is not present in the mock staffing dataset.`,
      },
      availableFlights: Object.keys(state.flightStates),
      sourceSystem: 'mock-staff-ops',
      dataFreshness: 'mock-static',
    };
  }

  if (!['Gate', 'Ramp', 'Customer Service', 'Operations'].includes(normalizedRole)) {
    return {
      ok: false,
      error: {
        code: 'INVALID_ROLE',
        message: `Role ${role || '(empty)'} is not supported by the mock staffing tool.`,
      },
      sourceSystem: 'mock-staff-ops',
      dataFreshness: 'mock-static',
    };
  }

  const staffMember = state.staffRoster.find((member) => member.name.toLowerCase() === normalizedStaffName);

  if (!staffMember) {
    return {
      ok: false,
      error: {
        code: 'STAFF_NOT_FOUND',
        message: `Staff member ${staffName || '(empty)'} is not present in the mock staffing dataset.`,
      },
      sourceSystem: 'mock-staff-ops',
      dataFreshness: 'mock-static',
    };
  }

  if (staffMember.role !== normalizedRole) {
    return {
      ok: false,
      error: {
        code: 'ROLE_MISMATCH',
        message: `${staffMember.name} is a ${staffMember.role}, not a ${normalizedRole}.`,
      },
      sourceSystem: 'mock-staff-ops',
      dataFreshness: 'mock-static',
    };
  }

  if (!staffMember.onReserve) {
    return {
      ok: false,
      error: {
        code: 'NOT_ON_RESERVE',
        message: `${staffMember.name} is not currently marked as reserve in the mock staffing system.`,
      },
      sourceSystem: 'mock-staff-ops',
      dataFreshness: 'mock-static',
    };
  }

  const executedAt = new Date().toISOString();

  if (!staffMember.assignedFlights.includes(normalizedFlightNumber)) {
    staffMember.assignedFlights.push(normalizedFlightNumber);
  }
  staffMember.onReserve = false;

  state.actionLog.push({
    tool: REQUEST_RESERVE_STAFF_TOOL,
    flightNumber: normalizedFlightNumber,
    status: 'executed',
    executedAt,
    details: {
      role: normalizedRole,
      staffName: staffMember.name,
    },
  });

  return {
    ok: true,
    sourceSystem: 'mock-staff-ops',
    dataFreshness: 'mock-static-updated',
    action: {
      tool: REQUEST_RESERVE_STAFF_TOOL,
      flightNumber: normalizedFlightNumber,
      role: normalizedRole,
      staffName: staffMember.name,
      executedAt,
      result: 'assigned',
    },
    staffing: buildStaffingState(state, flightState),
  };
}

export function executeStructuredTool(state: MockSystemState, name: string, rawArguments: string): unknown {
  let parsedArguments: Record<string, unknown> = {};

  try {
    parsedArguments = rawArguments ? (JSON.parse(rawArguments) as Record<string, unknown>) : {};
  } catch {
    return {
      ok: false,
      error: {
        code: 'INVALID_TOOL_ARGUMENTS',
        message: 'Tool arguments must be valid JSON.',
      },
    };
  }

  if (name === GET_FLIGHT_STATE_TOOL) {
    return getFlightState(state, String(parsedArguments.flightNumber || ''));
  }

  if (name === GET_STAFFING_STATE_TOOL) {
    return getStaffingState(state, String(parsedArguments.flightNumber || ''));
  }

  if (name === GET_PASSENGER_RECOVERY_STATE_TOOL) {
    return getPassengerRecoveryState(state, String(parsedArguments.flightNumber || ''));
  }

  if (name === PUBLISH_PASSENGER_ANNOUNCEMENT_TOOL) {
    return publishPassengerAnnouncement(
      state,
      String(parsedArguments.flightNumber || ''),
      String(parsedArguments.messageType || ''),
      String(parsedArguments.messageBody || ''),
    );
  }

  if (name === REQUEST_RESERVE_STAFF_TOOL) {
    return requestReserveStaff(
      state,
      String(parsedArguments.flightNumber || ''),
      String(parsedArguments.role || ''),
      String(parsedArguments.staffName || ''),
    );
  }

  return {
    ok: false,
    error: {
      code: 'UNKNOWN_TOOL',
      message: `Tool ${name} is not registered in this iteration.`,
    },
  };
}
