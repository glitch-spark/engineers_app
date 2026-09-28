import { useId } from 'react';

interface SwitchProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: string;
  description?: string;
  disabled?: boolean;
  id?: string;
}

export default function Switch({ checked, onChange, label, description, disabled = false, id }: SwitchProps) {
  const autoId = useId();
  const switchId = id ?? `switch-${autoId}`;
  const labelId = `${switchId}-label`;
  const descId = description ? `${switchId}-desc` : undefined;

  return (
    <div className="flex items-start justify-between gap-3">
      <div className="min-w-0">
        <label id={labelId} htmlFor={switchId} className="block text-sm font-medium cursor-pointer">
          {label}
        </label>
        {description && (
          <p id={descId} className="text-xs text-muted text-pretty">
            {description}
          </p>
        )}
      </div>
      <button
        id={switchId}
        type="button"
        role="switch"
        aria-checked={checked}
        aria-labelledby={labelId}
        aria-describedby={descId}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full border transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-600 focus-visible:ring-offset-2 dark:focus-visible:ring-sky-400 dark:focus-visible:ring-offset-zinc-950 disabled:cursor-not-allowed disabled:opacity-60 ${
          checked
            ? 'bg-sky-700 border-sky-700'
            : 'bg-zinc-200 border-zinc-500 dark:bg-zinc-800 dark:border-zinc-500'
        }`}
      >
        <span
          aria-hidden
          className={`inline-block size-5 rounded-full bg-white shadow-sm transition-transform duration-150 ease-out motion-reduce:transition-none ${
            checked ? 'translate-x-5' : 'translate-x-0.5'
          }`}
        />
      </button>
    </div>
  );
}
