import { ScenarioDefinition } from '@/lib/types';

export function ScenarioCards({
  scenarios,
  onSelect,
}: {
  scenarios: ScenarioDefinition[];
  onSelect: (scenario: ScenarioDefinition) => void;
}) {
  return (
    <div className="grid gap-3 md:grid-cols-2">
      {scenarios.map((scenario) => (
        <button
          key={scenario.id}
          onClick={() => onSelect(scenario)}
          className="rounded-2xl border border-slate-800 bg-slate-900 p-4 text-left transition hover:border-sky-500 hover:bg-slate-800"
        >
          <div className="text-sm font-semibold text-sky-300">{scenario.title}</div>
          <div className="mt-2 text-sm text-slate-300">{scenario.message}</div>
        </button>
      ))}
    </div>
  );
}
