import { NextRequest, NextResponse } from 'next/server';
import { runRecoveryAgent } from '@/lib/agent/runner';
import { normalizeRuntimeConfig } from '@/lib/runtimeConfig';
import { AnalyzeInput } from '@/lib/types';

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

export async function POST(req: NextRequest) {
  try {
    const startedAt = Date.now();
    const body = await req.json();
    const input = normalizeInput(body.input ?? { message: body.message });
    const runtimeConfig = normalizeRuntimeConfig(body.runtimeConfig);

    if (!input.flightNumber && !input.disruptionTypeId && !input.notes && !input.message) {
      return NextResponse.json(
        { error: 'Provide a flight, a disruption type, notes, or a message to analyze.' },
        { status: 400 },
      );
    }

    const result = await runRecoveryAgent(input, runtimeConfig);
    return NextResponse.json({
      ...result,
      durationMs: Date.now() - startedAt,
    });
  } catch (error) {
    const detail = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ error: detail }, { status: 500 });
  }
}
