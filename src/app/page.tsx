'use client';

import Link from 'next/link';
import { useEffect, useState, type ReactNode } from 'react';
import { ScenarioCards } from '@/components/ScenarioCards';
import { flights } from '@/lib/data/mockData';
import { cloneRuntimeConfig, defaultRuntimeConfig, readBrowserRuntimeConfig } from '@/lib/runtimeConfig';
import { AnalyzeInput, RecoveryPlan, RuntimeConfig, ScenarioDefinition } from '@/lib/types';

const defaultInput: AnalyzeInput = {
  flightNumber: flights[0].flightNumber,
  disruptionTypeId: 'delay',
  notes: '',
  message: '',
};

function tone(level: 'low' | 'medium' | 'high') {
  if (level === 'high') return 'border-rose-700/50 bg-rose-950/50 text-rose-200';
  if (level === 'medium') return 'border-amber-700/50 bg-amber-950/50 text-amber-200';
  return 'border-emerald-700/50 bg-emerald-950/50 text-emerald-200';
}

export default function HomePage() {
  const [runtimeConfig, setRuntimeConfig] = useState<RuntimeConfig>(cloneRuntimeConfig(defaultRuntimeConfig));
  const [input, setInput] = useState<AnalyzeInput>(defaultInput);
  const [result, setResult] = useState<RecoveryPlan | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const config = readBrowserRuntimeConfig();
    setRuntimeConfig(config);
    setInput((current) => ({
      ...current,
      disruptionTypeId: config.disruptionTypes[0]?.id || current.disruptionTypeId,
    }));
  }, []);

  async function analyze(payload: AnalyzeInput = input) {
    setLoading(true);
    setError(null);

    try {
      const res = await fetch('/api/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          input: payload,
          runtimeConfig,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Request failed');
      }
      setResult(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unexpected error');
    } finally {
      setLoading(false);
    }
  }

  function applyScenario(scenario: ScenarioDefinition) {
    setInput({
      flightNumber: scenario.flightNumber,
      disruptionTypeId: scenario.disruptionTypeId,
      notes: scenario.notes,
      message: scenario.message,
    });
    setError(null);
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-7xl flex-col gap-8 px-6 py-10">
      <section className="rounded-[2rem] border border-slate-800 bg-[radial-gradient(circle_at_top_left,_rgba(14,165,233,0.16),_transparent_38%),linear-gradient(135deg,rgba(15,23,42,0.92),rgba(2,6,23,0.96))] p-8">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="inline-flex rounded-full border border-sky-700/50 bg-sky-950/50 px-3 py-1 text-xs font-medium text-sky-300">
              Airport duty manager command center
            </div>
            <h1 className="mt-4 text-4xl font-bold tracking-tight">IROP recovery desk</h1>
            <p className="mt-3 max-w-3xl text-slate-300">
              Choose the flight, pick the disruption type, add quick notes, and get an easy-to-run station plan with
              staffing, passenger recovery, and escalation guidance.
            </p>
          </div>
          <Link href="/admin" className="rounded-2xl border border-slate-700 px-4 py-2 text-sm font-medium text-slate-100">
            Open admin builder
          </Link>
        </div>
      </section>

      <section className="grid gap-8 lg:grid-cols-[0.95fr_1.05fr]">
        <div className="space-y-6">
          <div className="rounded-3xl border border-slate-800 bg-slate-900 p-6">
            <div className="mb-5">
              <div className="text-lg font-semibold">Create a disruption incident</div>
              <p className="mt-1 text-sm text-slate-400">Structured inputs come first. Notes are optional support context for the planner.</p>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <label className="space-y-2">
                <span className="text-sm text-slate-300">Flight</span>
                <select
                  value={input.flightNumber}
                  onChange={(event) => setInput((current) => ({ ...current, flightNumber: event.target.value }))}
                  className="w-full rounded-2xl border border-slate-700 bg-slate-950 px-4 py-3 text-sm outline-none"
                >
                  {flights.map((flight) => (
                    <option key={flight.id} value={flight.flightNumber}>
                      {flight.flightNumber} - {flight.route}
                    </option>
                  ))}
                </select>
              </label>
              <label className="space-y-2">
                <span className="text-sm text-slate-300">Disruption type</span>
                <select
                  value={input.disruptionTypeId}
                  onChange={(event) => setInput((current) => ({ ...current, disruptionTypeId: event.target.value }))}
                  className="w-full rounded-2xl border border-slate-700 bg-slate-950 px-4 py-3 text-sm outline-none"
                >
                  {runtimeConfig.disruptionTypes.map((type) => (
                    <option key={type.id} value={type.id}>
                      {type.label}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <label className="mt-4 block space-y-2">
              <span className="text-sm text-slate-300">Operator notes</span>
              <textarea
                value={input.notes}
                onChange={(event) =>
                  setInput((current) => ({
                    ...current,
                    notes: event.target.value,
                    message: event.target.value,
                  }))
                }
                rows={5}
                className="w-full rounded-2xl border border-slate-700 bg-slate-950 p-4 text-sm outline-none placeholder:text-slate-500"
                placeholder="Example: Gate changed from A2 to A5. Protect wayfinding and boarding flow."
              />
            </label>

            <div className="mt-4 flex flex-wrap gap-3">
              <button
                onClick={() => analyze()}
                disabled={loading}
                className="rounded-2xl bg-sky-500 px-5 py-3 font-semibold text-slate-950 transition hover:bg-sky-400 disabled:opacity-50"
              >
                {loading ? 'Building station plan...' : 'Run recovery analysis'}
              </button>
              <button
                onClick={() => {
                  setInput({
                    ...defaultInput,
                    disruptionTypeId: runtimeConfig.disruptionTypes[0]?.id || 'delay',
                  });
                  setResult(null);
                  setError(null);
                }}
                className="rounded-2xl border border-slate-700 px-5 py-3 font-semibold text-slate-200"
              >
                Reset
              </button>
            </div>

            {error ? <div className="mt-4 text-sm text-rose-300">{error}</div> : null}
          </div>

          <div className="rounded-3xl border border-slate-800 bg-slate-900 p-6">
            <div className="mb-4 text-lg font-semibold">Fast demo scenarios</div>
            <ScenarioCards scenarios={runtimeConfig.scenarios} onSelect={applyScenario} />
          </div>
        </div>

        <div className="rounded-3xl border border-slate-800 bg-slate-900 p-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="text-lg font-semibold">Recovery output</div>
              <div className="mt-1 text-sm text-slate-400">The output is organized for one station-level duty manager coordinating multiple teams.</div>
            </div>
            {result ? (
              <span className="rounded-full border border-slate-700 px-3 py-1 text-xs text-slate-300">{result.mode}</span>
            ) : null}
          </div>

          {!result ? (
            <div className="mt-8 rounded-3xl border border-dashed border-slate-700 bg-slate-950/60 p-8 text-sm text-slate-400">
              Run a scenario to see the situation summary, immediate action, escalation path, staffing feasibility,
              passenger recovery actions, and the decision trace.
            </div>
          ) : (
            <div className="mt-6 space-y-6">
              <div className="rounded-3xl border border-slate-800 bg-slate-950 p-5">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div>
                    <div className="text-2xl font-bold">{result.disruptedFlight}</div>
                    <div className="mt-1 text-sm text-slate-400">{result.disruptionType}</div>
                  </div>
                  <div className={`rounded-full border px-3 py-1 text-xs font-medium capitalize ${tone(result.staffingRisk)}`}>
                    {result.staffingRisk} staffing risk
                  </div>
                </div>
                <p className="mt-4 text-sm leading-6 text-slate-200">{result.summary}</p>
                <div className="mt-4 grid gap-3 md:grid-cols-2">
                  <MetricCard label="Impacted window" value={result.impactedWindow} />
                  <MetricCard label="Passenger impact" value={result.passengerImpact} />
                </div>
              </div>

              <div className="rounded-3xl border border-slate-800 bg-slate-950 p-5">
                <div className="text-sm font-semibold text-slate-200">What to do now</div>
                <div className="mt-3 rounded-2xl border border-sky-800/60 bg-sky-950/40 p-4">
                  <div className="text-base font-semibold text-sky-200">{result.recommendedNextAction.title}</div>
                  <div className="mt-1 text-xs text-slate-400">Owner: {result.recommendedNextAction.owner}</div>
                  <div className="mt-3 text-sm text-slate-200">{result.recommendedNextAction.reason}</div>
                  <div className="mt-2 text-sm text-sky-300">Impact: {result.recommendedNextAction.impact}</div>
                </div>
              </div>

              <Section title="Operational actions">
                {result.actions.map((action, index) => (
                  <ActionCard key={`${action.title}-${index}`} title={action.title} owner={action.owner} body={action.reason} footer={action.impact} />
                ))}
              </Section>

              <Section title="Next steps / escalation timeline">
                {result.timeline.map((step, index) => (
                  <div key={`${step.phase}-${index}`} className="rounded-2xl border border-slate-800 bg-slate-950 p-4">
                    <div className="text-sm font-semibold text-sky-300">{step.phase}</div>
                    <div className="mt-1 text-xs text-slate-500">Owner: {step.owner}</div>
                    <div className="mt-3 text-xs uppercase tracking-wide text-slate-500">Trigger</div>
                    <div className="mt-1 text-sm text-slate-200">{step.trigger}</div>
                    <div className="mt-3 text-xs uppercase tracking-wide text-slate-500">Action</div>
                    <div className="mt-1 text-sm text-slate-300">{step.action}</div>
                  </div>
                ))}
              </Section>

              <Section title="Staffing feasibility">
                {result.staffingOptions.map((option) => (
                  <div key={option.role} className="rounded-2xl border border-slate-800 bg-slate-950 p-4">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div className="text-sm font-semibold text-slate-100">
                        {option.role} - need {option.required}
                      </div>
                      <span className={`rounded-full border px-3 py-1 text-xs font-medium capitalize ${tone(option.status === 'gap' ? 'high' : option.status === 'watch' ? 'medium' : 'low')}`}>
                        {option.status}
                      </span>
                    </div>
                    <div className="mt-3 text-sm text-slate-200">
                      Recommended: <span className="font-medium text-sky-300">{option.recommendedStaff || 'No candidate available'}</span>
                    </div>
                    <div className="mt-2 text-sm text-slate-300">{option.reason}</div>
                    {option.backups.length ? <div className="mt-3 text-sm text-slate-300">Backups: {option.backups.join(', ')}</div> : null}
                    {option.excludedCandidates.length ? (
                      <div className="mt-3 text-xs text-slate-500">Excluded: {option.excludedCandidates.join(' | ')}</div>
                    ) : null}
                  </div>
                ))}
              </Section>

              <Section title="Passenger recovery actions">
                {result.passengerActions.map((action, index) => (
                  <div key={`${action.title}-${index}`} className="rounded-2xl border border-slate-800 bg-slate-950 p-4">
                    <div className="font-medium">{action.title}</div>
                    <div className="mt-1 text-xs text-slate-500">Owner: {action.owner}</div>
                    <div className="mt-2 text-sm text-slate-300">{action.reason}</div>
                  </div>
                ))}
              </Section>

              <Section title="Alternative considerations">
                {result.alternatives.map((alt, idx) => (
                  <div key={`${alt}-${idx}`} className="rounded-2xl border border-slate-800 bg-slate-950 p-3 text-sm text-slate-300">
                    {alt}
                  </div>
                ))}
              </Section>

              <details className="rounded-3xl border border-slate-800 bg-slate-950 p-5">
                <summary className="cursor-pointer text-sm font-semibold text-slate-200">Decision trace</summary>
                <div className="mt-4 space-y-3">
                  {result.steps.map((step, idx) => (
                    <div key={`${step.tool}-${idx}`} className="rounded-2xl border border-slate-800 bg-slate-900 p-4">
                      <div className="text-sm font-medium text-sky-300">{step.tool}</div>
                      <div className="mt-1 text-xs text-slate-500">Input: {JSON.stringify(step.input)}</div>
                      <div className="mt-2 text-sm text-slate-300">{step.outputSummary}</div>
                    </div>
                  ))}
                </div>
              </details>
            </div>
          )}
        </div>
      </section>
    </main>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div>
      <div className="mb-3 text-sm font-semibold text-slate-200">{title}</div>
      <div className="space-y-3">{children}</div>
    </div>
  );
}

function MetricCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-900 p-4">
      <div className="text-xs uppercase tracking-wide text-slate-500">{label}</div>
      <div className="mt-2 text-sm text-slate-200">{value}</div>
    </div>
  );
}

function ActionCard({
  title,
  owner,
  body,
  footer,
}: {
  title: string;
  owner: string;
  body: string;
  footer: string;
}) {
  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-950 p-4">
      <div className="font-medium">{title}</div>
      <div className="mt-1 text-xs text-slate-500">Owner: {owner}</div>
      <div className="mt-2 text-sm text-slate-300">{body}</div>
      <div className="mt-2 text-sm text-sky-300">Impact: {footer}</div>
    </div>
  );
}
