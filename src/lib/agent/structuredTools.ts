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

const TOOL_NAME = 'get_flight_state';

export const structuredToolDefinitions: StructuredToolDefinition[] = [
  {
    type: 'function',
    function: {
      name: TOOL_NAME,
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
];

function normalizeFlightNumber(value: unknown): string {
  return typeof value === 'string' ? value.trim().toUpperCase() : '';
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
    staffingVerification: 'not_available_in_this_iteration',
    flight: flightState,
  };
}

export function executeStructuredTool(name: string, rawArguments: string): unknown {
  if (name !== TOOL_NAME) {
    return {
      ok: false,
      error: {
        code: 'UNKNOWN_TOOL',
        message: `Tool ${name} is not registered in this iteration.`,
      },
    };
  }

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

  return getFlightState(String(parsedArguments.flightNumber || ''));
}
