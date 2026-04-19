import { flights, staff } from '@/lib/data/mockData';
import { AnalyzeInput, DisruptionTypeDefinition, Flight, RuntimeConfig, StaffMember, StaffingOption, StaffRole } from '@/lib/types';

interface PlanningContext {
  flight: Flight;
  input: AnalyzeInput;
  disruptionType: DisruptionTypeDefinition;
  notes: string;
  delayMinutes: number;
}

interface CandidateEvaluation {
  recommended: Array<{ member: StaffMember; score: number; reason: string }>;
  excluded: string[];
}

export function getFlightByNumber(flightNumber: string): Flight {
  const normalized = flightNumber.toLowerCase();
  const flight = flights.find((item) => item.flightNumber.toLowerCase() === normalized);
  if (!flight) {
    throw new Error(`Flight ${flightNumber} not found in mock data.`);
  }
  return flight;
}

export function getAvailableFlights(): Flight[] {
  return flights;
}

export function getAvailableDisruptionTypes(config: RuntimeConfig): DisruptionTypeDefinition[] {
  return config.disruptionTypes;
}

export function pickFlightNumber(input: AnalyzeInput): string {
  if (input.flightNumber) {
    const requested = input.flightNumber.toUpperCase();
    const knownFlight = flights.find((item) => item.flightNumber.toUpperCase() === requested);
    if (knownFlight) return requested;
  }

  const source = `${input.notes || ''} ${input.message || ''}`;
  const match = source.match(/PD\d{3}/i);
  const inferred = match?.[0]?.toUpperCase();
  const knownFlight = inferred ? flights.find((item) => item.flightNumber.toUpperCase() === inferred) : undefined;
  return knownFlight?.flightNumber || flights[0].flightNumber;
}

export function inferDisruptionType(input: AnalyzeInput, config: RuntimeConfig): DisruptionTypeDefinition {
  const preferred = input.disruptionTypeId
    ? config.disruptionTypes.find((item) => item.id === input.disruptionTypeId)
    : undefined;
  if (preferred) return preferred;

  const source = `${input.notes || ''} ${input.message || ''}`.toLowerCase();
  const matched = config.disruptionTypes.find((item) =>
    item.keywords.some((keyword) => source.includes(keyword.toLowerCase())),
  );

  return matched || config.disruptionTypes[0];
}

export function extractDelayMinutes(input: AnalyzeInput, disruptionType: DisruptionTypeDefinition): number {
  const source = `${input.notes || ''} ${input.message || ''}`;
  const match = source.match(/(\d+)\s*(minute|min|minutes)/i);
  return match ? Number(match[1]) : disruptionType.defaultImpactMinutes;
}

export function buildImpactedWindow(flight: Flight, disruptionType: DisruptionTypeDefinition, delayMinutes: number): string {
  const start = new Date(flight.scheduledDeparture);
  const end = new Date(start.getTime() + delayMinutes * 60_000);

  const formatter = new Intl.DateTimeFormat('en-CA', {
    hour: 'numeric',
    minute: '2-digit',
  });

  if (disruptionType.id === 'cancellation') {
    return `${formatter.format(start)} onward`;
  }

  return `${formatter.format(start)} to ${formatter.format(end)}`;
}

function buildTemplateContext({ flight, disruptionType, input, notes, delayMinutes }: PlanningContext): Record<string, string> {
  const newGateMatch = notes.match(/\bto\s+([A-Z]\d{1,2})\b/i);

  return {
    disruptionType: disruptionType.label,
    flightNumber: flight.flightNumber,
    route: flight.route,
    gate: flight.gate,
    scheduledDeparture: flight.scheduledDeparture,
    passengers: String(flight.passengers),
    notes,
    delayMinutes: String(delayMinutes),
    newGate: newGateMatch?.[1] || flight.gate,
    message: input.message || '',
  };
}

export function interpolateText(template: string, context: Record<string, string>): string {
  return template.replace(/\{(\w+)\}/g, (_, key: string) => context[key] || '');
}

function evaluateCandidates(role: StaffRole, flight: Flight): CandidateEvaluation {
  const recommended = [] as Array<{ member: StaffMember; score: number; reason: string }>;
  const excluded = [] as string[];

  for (const member of staff) {
    if (member.role !== role) {
      continue;
    }

    if (member.hoursThisWeek >= member.maxHours) {
      excluded.push(`${member.name}: max weekly hours reached`);
      continue;
    }

    if (member.assignedFlights.includes(flight.flightNumber) && !member.onReserve) {
      excluded.push(`${member.name}: already committed to ${flight.flightNumber}`);
      continue;
    }

    const hoursRemaining = member.maxHours - member.hoursThisWeek;
    const reserveScore = member.onReserve ? 100 : 0;
    const assignmentPenalty = member.assignedFlights.length * 10;
    const score = reserveScore + hoursRemaining * 5 - assignmentPenalty;

    recommended.push({
      member,
      score,
      reason: member.onReserve
        ? `Reserve ${role.toLowerCase()} with ${hoursRemaining} hours remaining this week`
        : `Qualified ${role.toLowerCase()} with ${hoursRemaining} hours remaining this week`,
    });
  }

  recommended.sort((a, b) => b.score - a.score || a.member.name.localeCompare(b.member.name));
  return { recommended, excluded };
}

export function getStaffingOptions(flight: Flight): StaffingOption[] {
  return (Object.entries(flight.rolesNeeded) as Array<[StaffRole, number]>).map(([role, required]) => {
    const evaluation = evaluateCandidates(role, flight);
    const recommended = evaluation.recommended[0];
    const backups = evaluation.recommended.slice(1, 3).map((item) => item.member.name);
    const availableCount = evaluation.recommended.length;

    let status: StaffingOption['status'] = 'ready';
    if (!recommended) status = 'gap';
    else if (availableCount < required + 1) status = 'watch';

    return {
      role,
      required,
      status,
      recommendedStaff: recommended?.member.name || null,
      backups,
      reason: recommended
        ? recommended.reason
        : `No eligible ${role.toLowerCase()} candidate is currently available in mock staffing.`,
      excludedCandidates: evaluation.excluded,
    };
  });
}

export function renderOperationalActions(context: PlanningContext) {
  const templateContext = buildTemplateContext(context);
  return context.disruptionType.actionRules.map((action) => ({
    title: interpolateText(action.title, templateContext),
    owner: interpolateText(action.owner, templateContext),
    reason: interpolateText(action.reason, templateContext),
    impact: interpolateText(action.impact, templateContext),
  }));
}

export function renderPassengerActions(context: PlanningContext) {
  const templateContext = buildTemplateContext(context);
  return context.disruptionType.passengerActions.map((action) => ({
    title: interpolateText(action.title, templateContext),
    owner: interpolateText(action.owner, templateContext),
    reason: interpolateText(action.reason, templateContext),
  }));
}

export function renderTimeline(context: PlanningContext) {
  const templateContext = buildTemplateContext(context);
  return context.disruptionType.escalationTimeline.map((step) => ({
    phase: interpolateText(step.phase, templateContext),
    trigger: interpolateText(step.trigger, templateContext),
    action: interpolateText(step.action, templateContext),
    owner: interpolateText(step.owner, templateContext),
  }));
}

export function renderAlternatives(context: PlanningContext, staffingOptions: StaffingOption[]): string[] {
  const templateContext = buildTemplateContext(context);
  const staffingNotes = staffingOptions
    .filter((option) => option.recommendedStaff)
    .map((option) => `${option.role}: ${option.recommendedStaff} is the first fallback`)
    .join('. ');

  return [
    ...context.disruptionType.alternatives.map((item) => interpolateText(item, templateContext)),
    staffingNotes ? `Backup staffing: ${staffingNotes}.` : 'Backup staffing is thin and should be monitored closely.',
  ];
}
