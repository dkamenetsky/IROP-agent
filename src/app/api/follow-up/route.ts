import { NextRequest, NextResponse } from 'next/server';
import { createOpenRouterCompletion, type OpenRouterMessage } from '@/lib/openrouter';
import { AnalyzeInput, RecoveryPlan, ToolStep } from '@/lib/types';

function asString(value: unknown) {
  return typeof value === 'string' ? value.trim() : '';
}

function normalizeInput(value: unknown): AnalyzeInput {
  if (!value || typeof value !== 'object') return {};
  const record = value as Record<string, unknown>;
  return {
    flightNumber: typeof record.flightNumber === 'string' ? record.flightNumber : undefined,
    disruptionTypeId: typeof record.disruptionTypeId === 'string' ? record.disruptionTypeId : undefined,
    notes: typeof record.notes === 'string' ? record.notes : undefined,
    message: typeof record.message === 'string' ? record.message : undefined,
  };
}

function normalizeSteps(value: unknown): ToolStep[] {
  if (!Array.isArray(value)) return [];

  return value
    .map((item) => {
      if (!item || typeof item !== 'object') return null;
      const record = item as Record<string, unknown>;
      return {
        tool: asString(record.tool),
        input: record.input && typeof record.input === 'object' && !Array.isArray(record.input) ? (record.input as Record<string, unknown>) : {},
        outputSummary: asString(record.outputSummary),
      };
    })
    .filter((item): item is ToolStep => Boolean(item?.tool));
}

function normalizePlan(value: unknown): Partial<RecoveryPlan> | null {
  if (!value || typeof value !== 'object') return null;
  const record = value as Record<string, unknown>;

  return {
    summary: asString(record.summary),
    disruptedFlight: asString(record.disruptedFlight),
    disruptionType: asString(record.disruptionType),
    impactedWindow: asString(record.impactedWindow),
    passengerImpact: asString(record.passengerImpact),
    operationalFocus: asString(record.operationalFocus),
    mode: asString(record.mode) as RecoveryPlan['mode'],
    steps: normalizeSteps(record.steps),
    incidentContext:
      record.incidentContext && typeof record.incidentContext === 'object' && !Array.isArray(record.incidentContext)
        ? (record.incidentContext as RecoveryPlan['incidentContext'])
        : undefined,
    recommendedNextAction:
      record.recommendedNextAction && typeof record.recommendedNextAction === 'object' && !Array.isArray(record.recommendedNextAction)
        ? (record.recommendedNextAction as RecoveryPlan['recommendedNextAction'])
        : undefined,
    actions: Array.isArray(record.actions) ? (record.actions as RecoveryPlan['actions']) : [],
    staffingOptions: Array.isArray(record.staffingOptions) ? (record.staffingOptions as RecoveryPlan['staffingOptions']) : [],
    passengerActions: Array.isArray(record.passengerActions) ? (record.passengerActions as RecoveryPlan['passengerActions']) : [],
    alternatives: Array.isArray(record.alternatives) ? (record.alternatives as RecoveryPlan['alternatives']) : [],
  };
}

function buildFollowUpContext(plan: Partial<RecoveryPlan>, input: AnalyzeInput) {
  return {
    incidentInput: input,
    planSummary: {
      disruptedFlight: plan.disruptedFlight || null,
      disruptionType: plan.disruptionType || null,
      summary: plan.summary || null,
      impactedWindow: plan.impactedWindow || null,
      passengerImpact: plan.passengerImpact || null,
      operationalFocus: plan.operationalFocus || null,
      mode: plan.mode || null,
    },
    recommendedNextAction: plan.recommendedNextAction || null,
    actions: plan.actions || [],
    staffingOptions: plan.staffingOptions || [],
    passengerActions: plan.passengerActions || [],
    alternatives: plan.alternatives || [],
    steps: plan.steps || [],
    incidentContext: plan.incidentContext || null,
  };
}

const FOLLOW_UP_SYSTEM_PROMPT = `You answer follow-up questions about one airline disruption incident.
Use only the supplied incident plan, observed state, and tool trace.
If the question is unrelated to this specific incident, say you can only answer questions about the current disruption.
Keep answers concise, plain-language, and presentation-friendly.
Avoid jargon when simpler wording will work.
Do not invent facts that are not present in the supplied incident context.`;

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const question = asString(body.question);
    const input = normalizeInput(body.input);
    const plan = normalizePlan(body.plan);

    if (!question) {
      return NextResponse.json({ error: 'Enter a follow-up question about the current incident.' }, { status: 400 });
    }

    if (!plan) {
      return NextResponse.json({ error: 'No incident plan was provided for follow-up.' }, { status: 400 });
    }

    const messages: OpenRouterMessage[] = [
      { role: 'system', content: FOLLOW_UP_SYSTEM_PROMPT },
      {
        role: 'user',
        content: JSON.stringify(
          {
            task: 'Answer a manager follow-up question about the current incident.',
            managerQuestion: question,
            incident: buildFollowUpContext(plan, input),
          },
          null,
          2,
        ),
      },
    ];

    const completion = await createOpenRouterCompletion({
      messages,
      toolChoice: 'none',
      temperature: 0.2,
    });

    const answer = asString(completion.choices?.[0]?.message?.content);
    if (!answer) {
      throw new Error('OpenRouter returned an empty follow-up response.');
    }

    return NextResponse.json({ answer });
  } catch (error) {
    const detail = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ error: detail }, { status: 500 });
  }
}
