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

const GET_FLIGHT_STATE_TOOL = 'get_flight_state';
const GET_STAFFING_STATE_TOOL = 'get_staffing_state';

const MOCK_FLIGHT_STATES: Record<string, MockFlightState> = {
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

const MOCK_STAFF_ROSTER: MockStaffRecord[] = [
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
];

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

function evaluateRoleCoverage(flightState: MockFlightState, role: StaffRole, required: number): StaffingCoverageEntry {
  const coverageWindow = getCoverageWindow(flightState);
  const scheduled = MOCK_STAFF_ROSTER.filter(
    (member) => member.role === role && member.assignedFlights.includes(flightState.flightNumber),
  );
  const candidates: Array<{ member: MockStaffRecord; score: number }> = [];
  const excludedCandidates: string[] = [];
  const complianceRisks = scheduled
    .filter(isNearHourLimit)
    .map((member) => `${member.name}: within 4 hours of weekly maximum`);

  for (const member of MOCK_STAFF_ROSTER) {
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

function buildStaffingState(flightState: MockFlightState) {
  const coverageWindow = getCoverageWindow(flightState);
  const roleCoverage = (Object.entries(flightState.rolesNeeded) as Array<[StaffRole, number]>).map(([role, required]) =>
    evaluateRoleCoverage(flightState, role, required),
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

export function getFlightState(flightNumber: string) {
  const normalizedFlightNumber = normalizeFlightNumber(flightNumber);
  const flightState = MOCK_FLIGHT_STATES[normalizedFlightNumber];

  if (!flightState) {
    return {
      ok: false,
      error: {
        code: 'FLIGHT_NOT_FOUND',
        message: `Flight ${normalizedFlightNumber || '(empty)'} is not present in the mock operations dataset.`,
      },
      availableFlights: Object.keys(MOCK_FLIGHT_STATES),
      sourceSystem: 'mock-flight-ops',
      dataFreshness: 'mock-static',
    };
  }

  return {
    ok: true,
    sourceSystem: 'mock-flight-ops',
    dataFreshness: 'mock-static',
    staffingVerification: 'available_via_get_staffing_state',
    flight: flightState,
  };
}

export function getStaffingState(flightNumber: string) {
  const normalizedFlightNumber = normalizeFlightNumber(flightNumber);
  const flightState = MOCK_FLIGHT_STATES[normalizedFlightNumber];

  if (!flightState) {
    return {
      ok: false,
      error: {
        code: 'FLIGHT_NOT_FOUND',
        message: `Flight ${normalizedFlightNumber || '(empty)'} is not present in the mock staffing dataset.`,
      },
      availableFlights: Object.keys(MOCK_FLIGHT_STATES),
      sourceSystem: 'mock-staff-ops',
      dataFreshness: 'mock-static',
    };
  }

  return {
    ok: true,
    sourceSystem: 'mock-staff-ops',
    dataFreshness: 'mock-static',
    flightNumber: normalizedFlightNumber,
    staffing: buildStaffingState(flightState),
  };
}

export function executeStructuredTool(name: string, rawArguments: string): unknown {
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
    return getFlightState(String(parsedArguments.flightNumber || ''));
  }

  if (name === GET_STAFFING_STATE_TOOL) {
    return getStaffingState(String(parsedArguments.flightNumber || ''));
  }

  return {
    ok: false,
    error: {
      code: 'UNKNOWN_TOOL',
      message: `Tool ${name} is not registered in this iteration.`,
    },
  };
}
