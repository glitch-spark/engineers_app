import { useId } from 'react';
import Select from './Select';
import { formatUsd } from '../lib/modelCost';
import type { ModelOption, ModelTier } from '../api/endpoints';

const TIER_LABEL: Record<ModelTier, string> = {
  free: 'Free',
  budget: 'Budget',
  balanced: 'Balanced',
  premium: 'Premium',
};

function optionLabel(o: ModelOption): string {
  const cost = o.estCostUsd == null || o.estCostUsd === 0 ? formatUsd(o.estCostUsd) : `~${formatUsd(o.estCostUsd)}/run`;
  return `${o.label} · ${TIER_LABEL[o.tier]} · ${cost}${o.isDefault ? ' · Recommended' : ''}`;
}

interface ModelSelectProps {
  label: string;
  options: ModelOption[];
  value: string;
  onChange: (id: string) => void;
  loading?: boolean;
  disabled?: boolean;
  labelClassName?: string;
}

/** Model dropdown with a one-line "best for" hint. Renders nothing when no model can be offered. */
export default function ModelSelect({
  label,
  options,
  value,
  onChange,
  loading = false,
  disabled = false,
  labelClassName = 'block text-xs font-medium mb-1 text-muted',
}: ModelSelectProps) {
  const hintId = useId();
  if (!loading && options.length === 0) return null;
  const selected = options.find((o) => o.id === value);
  return (
    <div>
      <Select
        label={label}
        labelClassName={labelClassName}
        value={value}
        onChange={onChange}
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
