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

const followUpPrompts = [
  'Why did the AI choose this plan?',
  'What changed after the AI actions?',
  'What should I tell passengers in simple words?',
  'What is the biggest risk right now?',
];

const loadingStages = [
  'Checking flight status',
  'Checking staffing coverage',
  'Checking passenger impact',
  'Building the final plan',
];

function tone(level: 'low' | 'medium' | 'high') {
  if (level === 'high') return 'border-rose-700/50 bg-rose-950/50 text-rose-200';
  if (level === 'medium') return 'border-amber-700/50 bg-amber-950/50 text-amber-200';
  return 'border-emerald-700/50 bg-emerald-950/50 text-emerald-200';
}

function modeLabel(mode: RecoveryPlan['mode']) {
  if (mode === 'openrouter-agent') return 'AI agent';
  if (mode === 'fallback-planner') return 'Backup planner';
  return mode;
}

function staffingStatusLabel(status: 'ready' | 'watch' | 'gap') {
  if (status === 'ready') return 'covered';
  if (status === 'watch') return 'tight';
  return 'short';
}

function staffingHeadline(option: RecoveryPlan['staffingOptions'][number]) {
  const assignedNow = typeof option.scheduledCount === 'number' ? option.scheduledCount : null;
  const shortfall = typeof option.shortfall === 'number' ? option.shortfall : null;

  if (assignedNow === null) {
    return `${option.required} needed`;
  }

  if (shortfall && shortfall > 0) {
    return `${option.required} needed, ${assignedNow} assigned, still short ${shortfall}`;
  }

  return `${option.required} needed, ${assignedNow} assigned`;
}

function staffingRecommendationLabel(option: RecoveryPlan['staffingOptions'][number]) {
  if (!option.recommendedStaff) {
    return option.status === 'gap' ? 'No qualified extra staff available right now' : 'No extra backup staff available';
  }

  if (option.status === 'gap') {
    return `Best person to add now: ${option.recommendedStaff}`;
  }

  return `Best extra backup if needed: ${option.recommendedStaff}`;
}

function toolLabel(tool: string, status?: RecoveryPlan['steps'][number]['status']) {
  if (tool === 'get_flight_state') return 'Checked flight status';
  if (tool === 'get_staffing_state') return 'Checked staffing';
  if (tool === 'get_passenger_recovery_state') return 'Checked passenger impact';
  if (tool === 'open_rebooking_support') return 'Opened rebooking support';
  if (tool === 'publish_passenger_announcement') return 'Sent passenger update';
  if (tool === 'request_reserve_staff' && status === 'error') return 'Reserve staff request rejected';
  if (tool === 'request_reserve_staff') return 'Assigned reserve staff';
  if (tool === 'agent_fallback') return 'Agent handoff';
  return tool;
}

function formatToolInput(step: RecoveryPlan['steps'][number]) {
  const parts: string[] = [];

  if (typeof step.input.flightNumber === 'string') {
    parts.push(`Flight ${step.input.flightNumber}`);
  }

  if (typeof step.input.role === 'string') {
    parts.push(`Role: ${step.input.role}`);
  }

  if (typeof step.input.staffName === 'string') {
    parts.push(`Staff: ${step.input.staffName}`);
  }

  if (typeof step.input.messageType === 'string') {
    parts.push(`Message: ${step.input.messageType.replace(/_/g, ' ')}`);
  }

  if (typeof step.input.reason === 'string') {
    parts.push(`Reason: ${step.input.reason}`);
  }

  return parts.join(' | ') || 'System step';
}

function stepTone(status?: RecoveryPlan['steps'][number]['status']) {
  if (status === 'error') return 'border-rose-900/70 bg-rose-950/20';
  if (status === 'success') return 'border-slate-800 bg-slate-900';
  return 'border-slate-800 bg-slate-900';
}

function stepStatusLabel(status?: RecoveryPlan['steps'][number]['status']) {
  if (status === 'error') return 'Attempt rejected';
  if (status === 'success') return 'Completed';
  return 'Info';
}

function formatDuration(durationMs?: number) {
  if (typeof durationMs !== 'number' || !Number.isFinite(durationMs)) return null;
  return `${(durationMs / 1000).toFixed(durationMs >= 10_000 ? 0 : 1)}s`;
}

export default function HomePage() {
  const [runtimeConfig, setRuntimeConfig] = useState<RuntimeConfig>(cloneRuntimeConfig(defaultRuntimeConfig));
  const [input, setInput] = useState<AnalyzeInput>(defaultInput);
  const [result, setResult] = useState<RecoveryPlan | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadingElapsedMs, setLoadingElapsedMs] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [followUpQuestion, setFollowUpQuestion] = useState('');
  const [followUpAnswer, setFollowUpAnswer] = useState<string | null>(null);
  const [followUpLoading, setFollowUpLoading] = useState(false);
  const [followUpError, setFollowUpError] = useState<string | null>(null);
  const loadingStageIndex = Math.min(Math.floor(loadingElapsedMs / 2500), loadingStages.length - 1);

  useEffect(() => {
    const config = readBrowserRuntimeConfig();
    setRuntimeConfig(config);
    setInput((current) => ({
      ...current,
      disruptionTypeId: config.disruptionTypes[0]?.id || current.disruptionTypeId,
    }));
  }, []);

  useEffect(() => {
    if (!loading) {
      setLoadingElapsedMs(0);
      return;
    }

    const startedAt = Date.now();
    setLoadingElapsedMs(0);

    const interval = window.setInterval(() => {
      setLoadingElapsedMs(Date.now() - startedAt);
    }, 250);

    return () => window.clearInterval(interval);
  }, [loading]);

  function clearFollowUp() {
    setFollowUpQuestion('');
    setFollowUpAnswer(null);
    setFollowUpError(null);
    setFollowUpLoading(false);
  }

  async function analyze(payload: AnalyzeInput = input) {
    setLoading(true);
    setLoadingElapsedMs(0);
    setError(null);
    setResult(null);
    clearFollowUp();

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
    clearFollowUp();
  }

  async function askFollowUp(questionOverride?: string) {
    const question = (questionOverride ?? followUpQuestion).trim();
    if (!result || !question) return;

    setFollowUpLoading(true);
    setFollowUpError(null);
    setFollowUpAnswer(null);
    setFollowUpQuestion(question);

    try {
      const res = await fetch('/api/follow-up', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          question,
          input: result.incidentContext?.input || input,
          plan: result,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Follow-up request failed');
      }

      setFollowUpAnswer(data.answer);
    } catch (err) {
      setFollowUpError(err instanceof Error ? err.message : 'Unexpected error');
    } finally {
      setFollowUpLoading(false);
    }
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-7xl flex-col gap-8 px-6 py-10">
      <section className="rounded-[2rem] border border-slate-800 bg-[radial-gradient(circle_at_top_left,_rgba(14,165,233,0.16),_transparent_38%),linear-gradient(135deg,rgba(15,23,42,0.92),rgba(2,6,23,0.96))] p-8">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="inline-flex rounded-full border border-sky-700/50 bg-sky-950/50 px-3 py-1 text-xs font-medium text-sky-300">
              Airport ops demo
            </div>
            <h1 className="mt-4 text-4xl font-bold tracking-tight">Flight disruption assistant</h1>
            <p className="mt-3 max-w-3xl text-slate-300">
              Choose a flight, choose the issue, add notes, and get a simple action plan the team can follow.
            </p>
          </div>
          <Link href="/admin" className="rounded-2xl border border-slate-700 px-4 py-2 text-sm font-medium text-slate-100">
            Edit demo setup
          </Link>
        </div>
      </section>

      <section className="grid gap-8 lg:grid-cols-[0.95fr_1.05fr]">
        <div className="space-y-6">
          <div className="rounded-3xl border border-slate-800 bg-slate-900 p-6">
            <div className="mb-5">
              <div className="text-lg font-semibold">Set up the scenario</div>
              <p className="mt-1 text-sm text-slate-400">Pick the flight, pick the issue, and add any extra notes you want the AI to consider.</p>
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
                <span className="text-sm text-slate-300">Issue</span>
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
              <span className="text-sm text-slate-300">Extra notes</span>
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
                placeholder="Example: Gate changed from A2 to A5. Keep passengers moving to the new gate."
              />
            </label>

            <div className="mt-4 flex flex-wrap gap-3">
              <button
                onClick={() => analyze()}
                disabled={loading}
                className="rounded-2xl bg-sky-500 px-5 py-3 font-semibold text-slate-950 transition hover:bg-sky-400 disabled:opacity-50"
              >
                {loading ? 'Checking systems...' : 'Run AI plan'}
              </button>
              <button
                onClick={() => {
                  setInput({
                    ...defaultInput,
                    disruptionTypeId: runtimeConfig.disruptionTypes[0]?.id || 'delay',
                  });
                  setResult(null);
                  setLoadingElapsedMs(0);
                  setError(null);
                  clearFollowUp();
                }}
                className="rounded-2xl border border-slate-700 px-5 py-3 font-semibold text-slate-200"
              >
                Reset
              </button>
            </div>

            {error ? <div className="mt-4 text-sm text-rose-300">{error}</div> : null}
          </div>

            <div className="rounded-3xl border border-slate-800 bg-slate-900 p-6">
            <div className="mb-4 text-lg font-semibold">Quick demo scenarios</div>
            <ScenarioCards scenarios={runtimeConfig.scenarios} onSelect={applyScenario} />
          </div>
        </div>

        <div className="rounded-3xl border border-slate-800 bg-slate-900 p-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="text-lg font-semibold">AI plan</div>
              <div className="mt-1 text-sm text-slate-400">The AI checks mock flight, staffing, and passenger systems before it answers.</div>
              <div className="mt-1 text-xs text-slate-500">Read top to bottom: what happened, what to do first, team actions, then how the AI worked.</div>
            </div>
            <div className="flex items-center gap-2">
              {result ? (
                <span className="rounded-full border border-slate-700 px-3 py-1 text-xs text-slate-300">{modeLabel(result.mode)}</span>
              ) : null}
              {result?.durationMs ? (
                <span className="rounded-full border border-slate-700 px-3 py-1 text-xs text-slate-400">Built in {formatDuration(result.durationMs)}</span>
              ) : null}
            </div>
          </div>

          {loading ? (
            <div className="mt-8 rounded-3xl border border-slate-800 bg-slate-950/70 p-6">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="text-sm font-semibold text-slate-100">AI is working</div>
                  <div className="mt-1 text-sm text-slate-400">Typical live wait is about 5 to 12 seconds.</div>
                </div>
                <div className="rounded-full border border-sky-800/60 bg-sky-950/40 px-3 py-1 text-xs text-sky-200">
                  {formatDuration(loadingElapsedMs) || '0.0s'}
                </div>
              </div>
              <div className="mt-5 space-y-3">
                {loadingStages.map((stage, index) => {
                  const isActive = index === loadingStageIndex;
                  const isDone = index < loadingStageIndex;

                  return (
                    <div
                      key={stage}
                      className={`rounded-2xl border px-4 py-3 text-sm ${
                        isActive
                          ? 'border-sky-800/60 bg-sky-950/30 text-sky-100'
                          : isDone
                            ? 'border-emerald-900/60 bg-emerald-950/20 text-emerald-100'
                            : 'border-slate-800 bg-slate-900 text-slate-400'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-3">
                        <span>{stage}</span>
                        <span className="text-xs">
                          {isDone ? 'Done' : isActive ? 'In progress' : 'Waiting'}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : !result ? (
            <div className="mt-8 rounded-3xl border border-dashed border-slate-700 bg-slate-950/60 p-8 text-sm text-slate-400">
              Run a scenario to see the summary, best next step, team actions, staff coverage, passenger support, and the AI tool trace.
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
                  <MetricCard label="Time affected" value={result.impactedWindow} />
                  <MetricCard label="Passenger impact" value={result.passengerImpact} />
                </div>
              </div>

              {result.steps.some(
                (step) =>
                  step.status === 'success' &&
                  (step.tool === 'publish_passenger_announcement' ||
                    step.tool === 'request_reserve_staff' ||
                    step.tool === 'open_rebooking_support'),
              ) ? (
                <div className="rounded-3xl border border-emerald-800/50 bg-emerald-950/20 p-5">
                  <div className="text-sm font-semibold text-emerald-200">AI completed these actions</div>
                  <div className="mt-3 space-y-3">
                    {result.steps
                      .filter(
                        (step) =>
                          step.status === 'success' &&
                          (step.tool === 'publish_passenger_announcement' ||
                            step.tool === 'request_reserve_staff' ||
                            step.tool === 'open_rebooking_support'),
                      )
                      .map((step, index) => (
                        <div key={`${step.tool}-${index}`} className="rounded-2xl border border-emerald-900/60 bg-slate-950/70 p-4">
                          <div className="text-sm font-medium text-emerald-200">{toolLabel(step.tool, step.status)}</div>
                          <div className="mt-2 text-sm text-slate-300">{step.outputSummary}</div>
                        </div>
                      ))}
                  </div>
                </div>
              ) : null}

              <div className="rounded-3xl border border-slate-800 bg-slate-950 p-5">
                <div className="text-sm font-semibold text-slate-200">Best next step</div>
                <div className="mt-3 rounded-2xl border border-sky-800/60 bg-sky-950/40 p-4">
                  <div className="text-base font-semibold text-sky-200">{result.recommendedNextAction.title}</div>
                  <div className="mt-1 text-xs text-slate-400">Owner: {result.recommendedNextAction.owner}</div>
                  <div className="mt-3 text-sm text-slate-200">{result.recommendedNextAction.reason}</div>
                  <div className="mt-2 text-sm text-sky-300">Impact: {result.recommendedNextAction.impact}</div>
                </div>
              </div>

              <Section title="Team actions">
                {result.actions.map((action, index) => (
                  <ActionCard key={`${action.title}-${index}`} title={action.title} owner={action.owner} body={action.reason} footer={action.impact} />
                ))}
              </Section>

              <Section title="What happens next">
                {result.timeline.map((step, index) => (
                  <div key={`${step.phase}-${index}`} className="rounded-2xl border border-slate-800 bg-slate-950 p-4">
                    <div className="text-sm font-semibold text-sky-300">{step.phase}</div>
                    <div className="mt-1 text-xs text-slate-500">Owner: {step.owner}</div>
                    <div className="mt-3 text-xs uppercase tracking-wide text-slate-500">When</div>
                    <div className="mt-1 text-sm text-slate-200">{step.trigger}</div>
                    <div className="mt-3 text-xs uppercase tracking-wide text-slate-500">Do this</div>
                    <div className="mt-1 text-sm text-slate-300">{step.action}</div>
                  </div>
                ))}
              </Section>

              <Section title="Do we have enough staff?">
                {result.staffingOptions.map((option) => (
                  <div key={option.role} className="rounded-2xl border border-slate-800 bg-slate-950 p-4">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div className="text-sm font-semibold text-slate-100">
                        {option.role}
                      </div>
                      <span className={`rounded-full border px-3 py-1 text-xs font-medium capitalize ${tone(option.status === 'gap' ? 'high' : option.status === 'watch' ? 'medium' : 'low')}`}>
                        {staffingStatusLabel(option.status)}
                      </span>
                    </div>
                    <div className="mt-3 text-sm text-slate-200">{staffingHeadline(option)}</div>
                    <div className="mt-2 text-sm text-sky-300">{staffingRecommendationLabel(option)}</div>
                    <div className="mt-2 text-sm text-slate-300">{option.reason}</div>
                    {typeof option.reserveAvailable === 'number' ? (
                      <div className="mt-2 text-xs text-slate-500">Extra backup staff available: {option.reserveAvailable}</div>
                    ) : null}
                    {option.backups.length ? <div className="mt-3 text-sm text-slate-300">Other options: {option.backups.join(', ')}</div> : null}
                    {option.excludedCandidates.length ? (
                      <details className="mt-3">
                        <summary className="cursor-pointer text-xs text-slate-500">Why others were not available</summary>
                        <div className="mt-2 text-xs text-slate-500">{option.excludedCandidates.join(' | ')}</div>
                      </details>
                    ) : null}
                  </div>
                ))}
              </Section>

              <Section title="Passenger support">
                {result.passengerActions.map((action, index) => (
                  <div key={`${action.title}-${index}`} className="rounded-2xl border border-slate-800 bg-slate-950 p-4">
                    <div className="font-medium">{action.title}</div>
                    <div className="mt-1 text-xs text-slate-500">Owner: {action.owner}</div>
                    <div className="mt-2 text-sm text-slate-300">{action.reason}</div>
                  </div>
                ))}
              </Section>

              <Section title="Other options">
                {result.alternatives.map((alt, idx) => (
                  <div key={`${alt}-${idx}`} className="rounded-2xl border border-slate-800 bg-slate-950 p-3 text-sm text-slate-300">
                    {alt}
                  </div>
                ))}
              </Section>

              <div className="rounded-3xl border border-slate-800 bg-slate-950 p-5">
                <div className="text-sm font-semibold text-slate-200">Ask about this plan</div>
                <div className="mt-1 text-sm text-slate-400">
                  Ask anything about this disruption. The answer stays tied to this flight, this plan, and the mock systems the AI checked.
                </div>
                <div className="mt-4 flex flex-wrap gap-2">
                  {followUpPrompts.map((prompt) => (
                    <button
                      key={prompt}
                      onClick={() => void askFollowUp(prompt)}
                      disabled={followUpLoading}
                      className="rounded-full border border-slate-700 bg-slate-900 px-3 py-1.5 text-xs text-slate-300 transition hover:border-sky-700 hover:text-sky-200 disabled:opacity-50"
                    >
                      {prompt}
                    </button>
                  ))}
                </div>
                <div className="mt-4 flex flex-col gap-3 md:flex-row">
                  <input
                    value={followUpQuestion}
                    onChange={(event) => setFollowUpQuestion(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' && !event.shiftKey) {
                        event.preventDefault();
                        void askFollowUp();
                      }
                    }}
                    placeholder="Example: Why did you open rebooking support?"
                    className="flex-1 rounded-2xl border border-slate-700 bg-slate-900 px-4 py-3 text-sm outline-none placeholder:text-slate-500"
                  />
                  <button
                    onClick={() => void askFollowUp()}
                    disabled={followUpLoading || !followUpQuestion.trim()}
                    className="rounded-2xl bg-sky-500 px-5 py-3 text-sm font-semibold text-slate-950 transition hover:bg-sky-400 disabled:opacity-50"
                  >
                    {followUpLoading ? 'Answering...' : 'Ask AI'}
                  </button>
                </div>
                {followUpError ? <div className="mt-3 text-sm text-rose-300">{followUpError}</div> : null}
                {followUpAnswer ? (
                  <div className="mt-4 rounded-2xl border border-slate-800 bg-slate-900 p-4">
                    <div className="text-xs uppercase tracking-wide text-slate-500">Answer</div>
                    <div className="mt-2 text-sm leading-6 text-slate-200">{followUpAnswer}</div>
                  </div>
                ) : null}
              </div>

              <details className="rounded-3xl border border-slate-800 bg-slate-950 p-5">
                <summary className="cursor-pointer text-sm font-semibold text-slate-200">How the AI worked</summary>
                <div className="mt-4 space-y-3">
                  {result.steps.map((step, idx) => (
                    <div key={`${step.tool}-${idx}`} className={`rounded-2xl border p-4 ${stepTone(step.status)}`}>
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div className={`text-sm font-medium ${step.status === 'error' ? 'text-rose-300' : 'text-sky-300'}`}>
                          {toolLabel(step.tool, step.status)}
                        </div>
                        <div className="rounded-full border border-slate-700 px-2.5 py-1 text-[11px] text-slate-400">
                          {stepStatusLabel(step.status)}
                        </div>
                      </div>
                      <div className="mt-1 text-xs text-slate-500">{formatToolInput(step)}</div>
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
