'use client';

import Link from 'next/link';
import { ChangeEvent, useEffect, useMemo, useState } from 'react';
import {
  cloneRuntimeConfig,
  defaultRuntimeConfig,
  normalizeRuntimeConfig,
  readBrowserRuntimeConfig,
  resetBrowserRuntimeConfig,
  saveBrowserRuntimeConfig,
} from '@/lib/runtimeConfig';
import {
  DisruptionTypeDefinition,
  EscalationStep,
  PassengerRecoveryAction,
  RecoveryAction,
  RiskLevel,
  RuntimeConfig,
  ScenarioDefinition,
} from '@/lib/types';
import { flights } from '@/lib/data/mockData';

function actionDraft(): RecoveryAction {
  return { title: '', owner: '', reason: '', impact: '' };
}

function passengerActionDraft(): PassengerRecoveryAction {
  return { title: '', owner: '', reason: '' };
}

function escalationDraft(): EscalationStep {
  return { phase: '', trigger: '', action: '', owner: '' };
}

function disruptionDraft(): DisruptionTypeDefinition {
  return {
    id: `custom_type_${Date.now()}`,
    label: 'New disruption type',
    description: '',
    keywords: [],
    severity: 'medium',
    staffingRisk: 'medium',
    operationalFocus: '',
    passengerImpact: '',
    defaultImpactMinutes: 60,
    actionRules: [actionDraft()],
    passengerActions: [passengerActionDraft()],
    escalationTimeline: [escalationDraft()],
    alternatives: [''],
  };
}

function scenarioDraft(disruptionTypeId: string): ScenarioDefinition {
  return {
    id: `scenario_${Date.now()}`,
    title: 'New scenario',
    flightNumber: flights[0].flightNumber,
    disruptionTypeId,
    notes: '',
    message: '',
  };
}

function parseCommaList(value: string) {
  return value
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

export default function AdminPage() {
  const [config, setConfig] = useState<RuntimeConfig>(cloneRuntimeConfig(defaultRuntimeConfig));
  const exportedJson = useMemo(() => JSON.stringify(config, null, 2), [config]);
  const [jsonValue, setJsonValue] = useState(exportedJson);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    const stored = readBrowserRuntimeConfig();
    setConfig(stored);
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    saveBrowserRuntimeConfig(config);
    setJsonValue(JSON.stringify(config, null, 2));
  }, [config, hydrated]);

  function updateDisruption(index: number, updater: (current: DisruptionTypeDefinition) => DisruptionTypeDefinition) {
    setConfig((current) => {
      const next = cloneRuntimeConfig(current);
      next.disruptionTypes[index] = updater(next.disruptionTypes[index]);
      return next;
    });
  }

  function updateScenario(index: number, updater: (current: ScenarioDefinition) => ScenarioDefinition) {
    setConfig((current) => {
      const next = cloneRuntimeConfig(current);
      next.scenarios[index] = updater(next.scenarios[index]);
      return next;
    });
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-7xl flex-col gap-8 px-6 py-10">
      <section className="rounded-3xl border border-slate-800 bg-slate-900/70 p-8">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="inline-flex rounded-full border border-emerald-700/50 bg-emerald-950/50 px-3 py-1 text-xs font-medium text-emerald-300">
              Local admin builder
            </div>
            <h1 className="mt-4 text-4xl font-bold tracking-tight">Admin scenario and rule editor</h1>
            <p className="mt-3 max-w-3xl text-slate-300">
              Shape the disruption types, response rules, and scenario cards the operator sees. Changes persist only in this browser.
            </p>
          </div>
          <Link href="/" className="rounded-2xl border border-slate-700 px-4 py-2 text-sm font-medium text-slate-100">
            Back to operator view
          </Link>
        </div>
        <div className="mt-6 flex flex-wrap gap-3">
          <button
            onClick={() =>
              setConfig((current) => ({
                ...cloneRuntimeConfig(current),
                disruptionTypes: [...current.disruptionTypes, disruptionDraft()],
              }))
            }
            className="rounded-2xl bg-sky-500 px-4 py-2 font-medium text-slate-950"
          >
            Add disruption type
          </button>
          <button
            onClick={() =>
              setConfig((current) => ({
                ...cloneRuntimeConfig(current),
                scenarios: [...current.scenarios, scenarioDraft(current.disruptionTypes[0]?.id || 'delay')],
              }))
            }
            className="rounded-2xl border border-slate-700 px-4 py-2 font-medium text-slate-100"
          >
            Add scenario card
          </button>
          <button
            onClick={() => {
              resetBrowserRuntimeConfig();
              setConfig(cloneRuntimeConfig(defaultRuntimeConfig));
            }}
            className="rounded-2xl border border-rose-700 px-4 py-2 font-medium text-rose-200"
          >
            Reset to defaults
          </button>
        </div>
      </section>

      <section className="space-y-6">
        {config.disruptionTypes.map((definition, index) => (
          <div key={definition.id} className="rounded-3xl border border-slate-800 bg-slate-900 p-6">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold">{definition.label || 'Untitled disruption type'}</h2>
                <p className="mt-1 text-sm text-slate-400">Edit the operational actions, passenger actions, and escalation path for this disruption.</p>
              </div>
              <button
                disabled={config.disruptionTypes.length <= 1}
                onClick={() =>
                  setConfig((current) => {
                    const next = cloneRuntimeConfig(current);
                    const remainingTypes = next.disruptionTypes.filter((item) => item.id !== definition.id);
                    const replacementId = remainingTypes[0]?.id || definition.id;
                    return {
                      ...next,
                      disruptionTypes: remainingTypes,
                      scenarios: next.scenarios.map((scenario) =>
                        scenario.disruptionTypeId === definition.id ? { ...scenario, disruptionTypeId: replacementId } : scenario,
                      ),
                    };
                  })
                }
                className="rounded-2xl border border-slate-700 px-3 py-2 text-sm font-medium text-slate-100 disabled:opacity-40"
              >
                Delete type
              </button>
            </div>

            <div className="mt-5 grid gap-4 md:grid-cols-2">
              <InputField
                label="Type ID"
                value={definition.id}
                onChange={(event) => updateDisruption(index, (current) => ({ ...current, id: event.target.value }))}
              />
              <InputField
                label="Label"
                value={definition.label}
                onChange={(event) => updateDisruption(index, (current) => ({ ...current, label: event.target.value }))}
              />
              <TextareaField
                label="Description"
                value={definition.description}
                onChange={(event) => updateDisruption(index, (current) => ({ ...current, description: event.target.value }))}
              />
              <InputField
                label="Keywords (comma separated)"
                value={definition.keywords.join(', ')}
                onChange={(event) => updateDisruption(index, (current) => ({ ...current, keywords: parseCommaList(event.target.value) }))}
              />
              <SelectField
                label="Severity"
                value={definition.severity}
                onChange={(value) => updateDisruption(index, (current) => ({ ...current, severity: value as RiskLevel }))}
              />
              <SelectField
                label="Staffing risk"
                value={definition.staffingRisk}
                onChange={(value) => updateDisruption(index, (current) => ({ ...current, staffingRisk: value as RiskLevel }))}
              />
              <InputField
                label="Default impact minutes"
                value={String(definition.defaultImpactMinutes)}
                onChange={(event) =>
                  updateDisruption(index, (current) => ({
                    ...current,
                    defaultImpactMinutes: Number(event.target.value) || 0,
                  }))
                }
              />
              <TextareaField
                label="Operational focus"
                value={definition.operationalFocus}
                onChange={(event) => updateDisruption(index, (current) => ({ ...current, operationalFocus: event.target.value }))}
              />
              <TextareaField
                label="Passenger impact"
                value={definition.passengerImpact}
                onChange={(event) => updateDisruption(index, (current) => ({ ...current, passengerImpact: event.target.value }))}
              />
            </div>

            <ActionEditor
              title="Operational action rules"
              items={definition.actionRules}
              onChange={(items) => updateDisruption(index, (current) => ({ ...current, actionRules: items }))}
              createItem={actionDraft}
            />
            <PassengerActionEditor
              items={definition.passengerActions}
              onChange={(items) => updateDisruption(index, (current) => ({ ...current, passengerActions: items }))}
            />
            <TimelineEditor
              items={definition.escalationTimeline}
              onChange={(items) => updateDisruption(index, (current) => ({ ...current, escalationTimeline: items }))}
            />

            <div className="mt-6">
              <div className="mb-3 flex items-center justify-between">
                <h3 className="text-sm font-semibold text-slate-200">Alternative considerations</h3>
                <button
                  onClick={() =>
                    updateDisruption(index, (current) => ({
                      ...current,
                      alternatives: [...current.alternatives, ''],
                    }))
                  }
                  className="rounded-2xl border border-slate-700 px-3 py-1 text-xs font-medium text-slate-100"
                >
                  Add alternative
                </button>
              </div>
              <div className="space-y-3">
                {definition.alternatives.map((alternative, altIndex) => (
                  <div key={`${definition.id}-alt-${altIndex}`} className="flex gap-3">
                    <input
                      value={alternative}
                      onChange={(event) =>
                        updateDisruption(index, (current) => ({
                          ...current,
                          alternatives: current.alternatives.map((item, itemIndex) =>
                            itemIndex === altIndex ? event.target.value : item,
                          ),
                        }))
                      }
                      className="w-full rounded-2xl border border-slate-700 bg-slate-950 px-4 py-3 text-sm outline-none"
                    />
                    <button
                      onClick={() =>
                        updateDisruption(index, (current) => ({
                          ...current,
                          alternatives: current.alternatives.filter((_, itemIndex) => itemIndex !== altIndex),
                        }))
                      }
                      className="rounded-2xl border border-slate-700 px-3 py-2 text-sm font-medium text-slate-100"
                    >
                      Remove
                    </button>
                  </div>
                ))}
              </div>
            </div>
          </div>
        ))}
      </section>

      <section className="rounded-3xl border border-slate-800 bg-slate-900 p-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold">Scenario cards</h2>
            <p className="mt-1 text-sm text-slate-400">These appear on the operator screen for quick use during a demo.</p>
          </div>
        </div>
        <div className="mt-5 space-y-5">
          {config.scenarios.map((scenario, index) => (
            <div key={scenario.id} className="rounded-2xl border border-slate-800 bg-slate-950 p-4">
              <div className="grid gap-4 md:grid-cols-2">
                <InputField
                  label="Scenario title"
                  value={scenario.title}
                  onChange={(event) => updateScenario(index, (current) => ({ ...current, title: event.target.value }))}
                />
                <label className="space-y-2">
                  <span className="text-sm text-slate-300">Flight</span>
                  <select
                    value={scenario.flightNumber}
                    onChange={(event) => updateScenario(index, (current) => ({ ...current, flightNumber: event.target.value }))}
                    className="w-full rounded-2xl border border-slate-700 bg-slate-900 px-4 py-3 text-sm outline-none"
                  >
                    {flights.map((flight) => (
                      <option key={flight.id} value={flight.flightNumber}>
                        {flight.flightNumber}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="space-y-2">
                  <span className="text-sm text-slate-300">Disruption type</span>
                  <select
                    value={scenario.disruptionTypeId}
                    onChange={(event) => updateScenario(index, (current) => ({ ...current, disruptionTypeId: event.target.value }))}
                    className="w-full rounded-2xl border border-slate-700 bg-slate-900 px-4 py-3 text-sm outline-none"
                  >
                    {config.disruptionTypes.map((type) => (
                      <option key={type.id} value={type.id}>
                        {type.label}
                      </option>
                    ))}
                  </select>
                </label>
                <InputField
                  label="Scenario ID"
                  value={scenario.id}
                  onChange={(event) => updateScenario(index, (current) => ({ ...current, id: event.target.value }))}
                />
                <TextareaField
                  label="Operator notes"
                  value={scenario.notes}
                  onChange={(event) => updateScenario(index, (current) => ({ ...current, notes: event.target.value }))}
                />
                <TextareaField
                  label="Display prompt"
                  value={scenario.message}
                  onChange={(event) => updateScenario(index, (current) => ({ ...current, message: event.target.value }))}
                />
              </div>
              <button
                onClick={() =>
                  setConfig((current) => ({
                    ...cloneRuntimeConfig(current),
                    scenarios: current.scenarios.filter((item) => item.id !== scenario.id),
                  }))
                }
                className="mt-4 rounded-2xl border border-slate-700 px-3 py-2 text-sm font-medium text-slate-100"
              >
                Remove scenario
              </button>
            </div>
          ))}
        </div>
      </section>

      <section className="rounded-3xl border border-slate-800 bg-slate-900 p-6">
        <h2 className="text-lg font-semibold">Import / export config</h2>
        <p className="mt-1 text-sm text-slate-400">Use JSON to back up the demo setup or move it between browsers manually.</p>
        <textarea
          value={jsonValue}
          onChange={(event) => setJsonValue(event.target.value)}
          rows={16}
          className="mt-4 w-full rounded-2xl border border-slate-700 bg-slate-950 p-4 text-sm text-slate-200 outline-none"
        />
        <div className="mt-4 flex flex-wrap gap-3">
          <button
            onClick={() => navigator.clipboard.writeText(exportedJson)}
            className="rounded-2xl bg-sky-500 px-4 py-2 font-medium text-slate-950"
          >
            Copy exported JSON
          </button>
          <button
            onClick={() => {
              try {
                setConfig(normalizeRuntimeConfig(JSON.parse(jsonValue)));
              } catch {
                window.alert('The JSON could not be parsed. Check the format and try again.');
              }
            }}
            className="rounded-2xl border border-slate-700 px-4 py-2 font-medium text-slate-100"
          >
            Import from textarea
          </button>
        </div>
      </section>
    </main>
  );
}

function ActionEditor({
  title,
  items,
  onChange,
  createItem,
}: {
  title: string;
  items: RecoveryAction[];
  onChange: (items: RecoveryAction[]) => void;
  createItem: () => RecoveryAction;
}) {
  return (
    <div className="mt-6">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-slate-200">{title}</h3>
        <button
          onClick={() => onChange([...items, createItem()])}
          className="rounded-2xl border border-slate-700 px-3 py-1 text-xs font-medium text-slate-100"
        >
          Add action
        </button>
      </div>
      <div className="space-y-3">
        {items.map((item, index) => (
          <div key={`${item.title}-${index}`} className="grid gap-3 rounded-2xl border border-slate-800 bg-slate-950 p-4 md:grid-cols-2">
            <InputField
              label="Title"
              value={item.title}
              onChange={(event) =>
                onChange(items.map((current, itemIndex) => (itemIndex === index ? { ...current, title: event.target.value } : current)))
              }
            />
            <InputField
              label="Owner"
              value={item.owner}
              onChange={(event) =>
                onChange(items.map((current, itemIndex) => (itemIndex === index ? { ...current, owner: event.target.value } : current)))
              }
            />
            <TextareaField
              label="Reason"
              value={item.reason}
              onChange={(event) =>
                onChange(items.map((current, itemIndex) => (itemIndex === index ? { ...current, reason: event.target.value } : current)))
              }
            />
            <TextareaField
              label="Impact"
              value={item.impact}
              onChange={(event) =>
                onChange(items.map((current, itemIndex) => (itemIndex === index ? { ...current, impact: event.target.value } : current)))
              }
            />
            <button
              onClick={() => onChange(items.filter((_, itemIndex) => itemIndex !== index))}
              className="rounded-2xl border border-slate-700 px-3 py-2 text-sm font-medium text-slate-100 md:col-span-2"
            >
              Remove action
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

function PassengerActionEditor({
  items,
  onChange,
}: {
  items: PassengerRecoveryAction[];
  onChange: (items: PassengerRecoveryAction[]) => void;
}) {
  return (
    <div className="mt-6">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-slate-200">Passenger recovery actions</h3>
        <button
          onClick={() => onChange([...items, passengerActionDraft()])}
          className="rounded-2xl border border-slate-700 px-3 py-1 text-xs font-medium text-slate-100"
        >
          Add passenger action
        </button>
      </div>
      <div className="space-y-3">
        {items.map((item, index) => (
          <div key={`${item.title}-${index}`} className="grid gap-3 rounded-2xl border border-slate-800 bg-slate-950 p-4 md:grid-cols-2">
            <InputField
              label="Title"
              value={item.title}
              onChange={(event) =>
                onChange(items.map((current, itemIndex) => (itemIndex === index ? { ...current, title: event.target.value } : current)))
              }
            />
            <InputField
              label="Owner"
              value={item.owner}
              onChange={(event) =>
                onChange(items.map((current, itemIndex) => (itemIndex === index ? { ...current, owner: event.target.value } : current)))
              }
            />
            <TextareaField
              label="Reason"
              value={item.reason}
              onChange={(event) =>
                onChange(items.map((current, itemIndex) => (itemIndex === index ? { ...current, reason: event.target.value } : current)))
              }
            />
            <button
              onClick={() => onChange(items.filter((_, itemIndex) => itemIndex !== index))}
              className="rounded-2xl border border-slate-700 px-3 py-2 text-sm font-medium text-slate-100 md:col-span-2"
            >
              Remove passenger action
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

function TimelineEditor({
  items,
  onChange,
}: {
  items: EscalationStep[];
  onChange: (items: EscalationStep[]) => void;
}) {
  return (
    <div className="mt-6">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-slate-200">Escalation timeline</h3>
        <button
          onClick={() => onChange([...items, escalationDraft()])}
          className="rounded-2xl border border-slate-700 px-3 py-1 text-xs font-medium text-slate-100"
        >
          Add timeline step
        </button>
      </div>
      <div className="space-y-3">
        {items.map((item, index) => (
          <div key={`${item.phase}-${index}`} className="grid gap-3 rounded-2xl border border-slate-800 bg-slate-950 p-4 md:grid-cols-2">
            <InputField
              label="Phase"
              value={item.phase}
              onChange={(event) =>
                onChange(items.map((current, itemIndex) => (itemIndex === index ? { ...current, phase: event.target.value } : current)))
              }
            />
            <InputField
              label="Owner"
              value={item.owner}
              onChange={(event) =>
                onChange(items.map((current, itemIndex) => (itemIndex === index ? { ...current, owner: event.target.value } : current)))
              }
            />
            <TextareaField
              label="Trigger"
              value={item.trigger}
              onChange={(event) =>
                onChange(items.map((current, itemIndex) => (itemIndex === index ? { ...current, trigger: event.target.value } : current)))
              }
            />
            <TextareaField
              label="Action"
              value={item.action}
              onChange={(event) =>
                onChange(items.map((current, itemIndex) => (itemIndex === index ? { ...current, action: event.target.value } : current)))
              }
            />
            <button
              onClick={() => onChange(items.filter((_, itemIndex) => itemIndex !== index))}
              className="rounded-2xl border border-slate-700 px-3 py-2 text-sm font-medium text-slate-100 md:col-span-2"
            >
              Remove timeline step
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

function InputField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (event: ChangeEvent<HTMLInputElement>) => void;
}) {
  return (
    <label className="space-y-2">
      <span className="text-sm text-slate-300">{label}</span>
      <input value={value} onChange={onChange} className="w-full rounded-2xl border border-slate-700 bg-slate-950 px-4 py-3 text-sm outline-none" />
    </label>
  );
}

function TextareaField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (event: ChangeEvent<HTMLTextAreaElement>) => void;
}) {
  return (
    <label className="space-y-2">
      <span className="text-sm text-slate-300">{label}</span>
      <textarea
        value={value}
        onChange={onChange}
        rows={3}
        className="w-full rounded-2xl border border-slate-700 bg-slate-950 px-4 py-3 text-sm outline-none"
      />
    </label>
  );
}

function SelectField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="space-y-2">
      <span className="text-sm text-slate-300">{label}</span>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="w-full rounded-2xl border border-slate-700 bg-slate-950 px-4 py-3 text-sm outline-none"
      >
        <option value="low">Low</option>
        <option value="medium">Medium</option>
        <option value="high">High</option>
      </select>
    </label>
  );
}
