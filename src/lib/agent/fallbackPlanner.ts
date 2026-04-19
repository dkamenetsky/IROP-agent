import {
  buildImpactedWindow,
  extractDelayMinutes,
  getFlightByNumber,
  getStaffingOptions,
  inferDisruptionType,
  pickFlightNumber,
  renderAlternatives,
  renderOperationalActions,
  renderPassengerActions,
  renderTimeline,
} from '@/lib/agent/tools';
import { AnalyzeInput, RecoveryPlan, RuntimeConfig, ToolStep } from '@/lib/types';

export async function runFallbackPlanner(input: AnalyzeInput, runtimeConfig: RuntimeConfig): Promise<RecoveryPlan> {
  const flightNumber = pickFlightNumber(input);
  const disruptionType = inferDisruptionType(input, runtimeConfig);
  const flight = getFlightByNumber(flightNumber);
  const notes = input.notes || input.message || '';
  const delayMinutes = extractDelayMinutes(input, disruptionType);
  const impactedWindow = buildImpactedWindow(flight, disruptionType, delayMinutes);
  const staffingOptions = getStaffingOptions(flight);
  const actions = renderOperationalActions({ flight, input, disruptionType, notes, delayMinutes });
  const passengerActions = renderPassengerActions({ flight, input, disruptionType, notes, delayMinutes });
  const timeline = renderTimeline({ flight, input, disruptionType, notes, delayMinutes });
  const alternatives = renderAlternatives({ flight, input, disruptionType, notes, delayMinutes }, staffingOptions);

  const steps: ToolStep[] = [
    {
      tool: 'resolve_input',
      input: { ...input },
      outputSummary: `Resolved ${flight.flightNumber} with disruption type ${disruptionType.label}.`,
    },
    {
      tool: 'load_flight_context',
      input: { flightNumber: flight.flightNumber },
      outputSummary: `${flight.flightNumber} departs ${flight.route} from ${flight.gate}.`,
    },
    {
      tool: 'evaluate_staffing',
      input: { flightNumber: flight.flightNumber },
      outputSummary: staffingOptions
        .map((option) => `${option.role}: ${option.recommendedStaff || 'no candidate'} (${option.status})`)
        .join('; '),
    },
    {
      tool: 'assemble_recovery_plan',
      input: { disruptionTypeId: disruptionType.id },
      outputSummary: `${actions.length} operational actions, ${passengerActions.length} passenger actions, ${timeline.length} timeline steps.`,
    },
  ];

  const recommendedNextAction =
    actions[0] || {
      title: 'Review the disruption with station control',
      owner: 'Duty manager',
      reason: 'A default coordination action is needed when no specific rule is configured.',
      impact: 'Keeps the station on one operating assumption.',
    };

  const summary = `${flight.flightNumber} is being managed as ${disruptionType.label.toLowerCase()}. ${disruptionType.operationalFocus}`;

  return {
    summary,
    disruptedFlight: flight.flightNumber,
    disruptionType: disruptionType.label,
    impactedWindow,
    staffingRisk: disruptionType.staffingRisk,
    passengerImpact: disruptionType.passengerImpact,
    operationalFocus: disruptionType.operationalFocus,
    recommendedNextAction,
    actions,
    timeline,
    staffingOptions,
    passengerActions,
    alternatives,
    steps,
    mode: 'fallback-planner',
  };
}
