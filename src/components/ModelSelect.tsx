import { useId } from 'react';
import Select from './Select';
import { formatUsd } from '../lib/modelCost';
import type { ModelChoice } from '../lib/useModelChoice';
import type { ModelOption } from '../api/endpoints';

function optionLabel(o: ModelOption): string {
  const cost = o.estCostUsd == null ? 'cost n/a' : `~${formatUsd(o.estCostUsd)}/run`;
  return [o.label, o.tag, cost].filter(Boolean).join(' · ');
}

interface ModelSelectProps {
  label: string;
  choice: ModelChoice;
  disabled?: boolean;
  labelClassName?: string;
}

/**
 * Two-step model picker: choose a provider, then one of its suggested models for the task.
 * Renders nothing when no model can be offered (the server then picks its default).
 */
export default function ModelSelect({
  label,
  choice,
  disabled = false,
  labelClassName = 'block text-xs font-medium mb-1 text-muted',
}: ModelSelectProps) {
  const hintId = useId();
  const groupLabelId = useId();
  const { providers, provider, setProvider, options, value, setValue, loading } = choice;
  if (!loading && options.length === 0) return null;
  const selected = options.find((o) => o.id === value);
  return (
    <div>
      {providers.length > 1 && (
        <div className="mb-2">
          <span id={groupLabelId} className={labelClassName}>
            {label} provider
          </span>
          <div role="radiogroup" aria-labelledby={groupLabelId} className="inline-flex rounded-lg border border-zinc-200 dark:border-zinc-700 p-0.5">
            {providers.map((p) => {
              const active = p.id === provider;
              return (
                <button
                  key={p.id}
                  type="button"
                  role="radio"
                  aria-checked={active}
                  disabled={disabled}
                  onClick={() => setProvider(p.id)}
                  className={
                    'focus-ring text-xs px-3 py-1 rounded-md disabled:opacity-50 ' +
                    (active ? 'bg-primary text-white' : 'text-muted hover:bg-zinc-100 dark:hover:bg-zinc-800')
                  }
                >
                  {p.label}
                </button>
              );
            })}
          </div>
        </div>
      )}
      <Select
        label={label}
        labelClassName={labelClassName}
        value={value}
        onChange={setValue}
        options={options.map((o) => ({ value: o.id, label: optionLabel(o) }))}
        placeholder={loading ? 'Loading models…' : undefined}
        disabled={disabled || loading}
        ariaDescribedBy={selected ? hintId : undefined}
      />
      {selected && (
        <p id={hintId} className="mt-1 text-xs text-faint">
          {selected.bestFor}
        </p>
      )}
    </div>
  );
}
