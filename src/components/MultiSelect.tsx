import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { Check, X } from 'lucide-react';

export interface MultiSelectOption {
  value: string;
  label: string;
  hint?: string;
}

interface MultiSelectProps {
  value: string[];
  onChange: (value: string[]) => void;
  options: MultiSelectOption[];
  placeholder?: string;
  disabled?: boolean;
  id?: string;
  /** Accessible name when there is no visible <label htmlFor>. */
  ariaLabel?: string;
  ariaLabelledBy?: string;
  emptyText?: string;
}

export default function MultiSelect({
  value,
  onChange,
  options,
  placeholder = 'Search…',
  disabled = false,
  id,
  ariaLabel,
  ariaLabelledBy,
  emptyText = 'No matches',
}: MultiSelectProps) {
  const autoId = useId();
  const inputId = id ?? `multiselect-${autoId}`;
  const listId = `${inputId}-list`;
  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);

  const selected = useMemo(() => new Set(value), [value]);
  const byValue = useMemo(() => new Map(options.map((o) => [o.value, o])), [options]);
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return options;
    return options.filter(
      (o) => o.label.toLowerCase().includes(q) || (o.hint ?? '').toLowerCase().includes(q),
    );
  }, [options, query]);
  const activeIndex = Math.min(active, Math.max(filtered.length - 1, 0));

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open]);

  const toggle = (v: string) => {
    onChange(selected.has(v) ? value.filter((x) => x !== v) : [...value, v]);
    if (query) {
      setQuery('');
      setActive(0);
    }
  };

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (!open) setOpen(true);
      else setActive(Math.min(activeIndex + 1, filtered.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive(Math.max(activeIndex - 1, 0));
    } else if (e.key === 'Enter') {
      if (open && filtered[activeIndex]) {
        e.preventDefault();
        toggle(filtered[activeIndex].value);
      }
    } else if (e.key === 'Escape') {
      if (open) {
        e.preventDefault();
        e.stopPropagation();
        setOpen(false);
      }
    } else if (e.key === 'Backspace' && !query && value.length) {
      onChange(value.slice(0, -1));
    }
  };

  const optionId = (i: number) => `${listId}-opt-${i}`;

  return (
    <div ref={rootRef} className="relative">
      <div
        className={`input flex flex-wrap items-center gap-1.5 !py-1.5 cursor-text ${disabled ? 'opacity-60 cursor-not-allowed' : ''}`}
        onClick={() => {
          if (disabled) return;
          inputRef.current?.focus();
          setOpen(true);
        }}
      >
        {value.map((v) => {
          const label = byValue.get(v)?.label ?? 'Unknown user';
          return (
            <span
              key={v}
              className="inline-flex max-w-full items-center gap-1 rounded-lg bg-zinc-200/70 pl-2 pr-0.5 py-0.5 text-xs font-medium text-zinc-800 dark:bg-zinc-800 dark:text-zinc-100"
            >
              <span className="truncate">{label}</span>
              {!disabled && (
                <button
                  type="button"
                  className="rounded p-0.5 hover:bg-black/10 dark:hover:bg-white/10"
                  aria-label={`Remove ${label}`}
                  onClick={(e) => {
                    e.stopPropagation();
                    toggle(v);
                  }}
                >
                  <X size={12} aria-hidden />
                </button>
              )}
            </span>
          );
        })}
        <input
          ref={inputRef}
          id={inputId}
          type="text"
          role="combobox"
          aria-expanded={open}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={open && filtered.length ? optionId(activeIndex) : undefined}
          aria-label={ariaLabel}
          aria-labelledby={ariaLabelledBy}
          className="min-w-[8rem] flex-1 bg-transparent py-0.5 text-sm outline-none placeholder:text-zinc-400"
          placeholder={value.length ? '' : placeholder}
          value={query}
          disabled={disabled}
          autoComplete="off"
          onFocus={() => setOpen(true)}
          onChange={(e) => {
            setQuery(e.target.value);
            setActive(0);
            setOpen(true);
          }}
          onKeyDown={onKeyDown}
        />
      </div>
      {open && !disabled && (
        <ul
          id={listId}
          role="listbox"
          aria-multiselectable="true"
          className="absolute left-0 right-0 z-10 mt-1 max-h-56 overflow-auto rounded-xl border border-zinc-200 bg-white p-1 shadow-lg dark:border-zinc-700 dark:bg-zinc-900"
        >
          {filtered.length === 0 ? (
            <li className="px-3 py-2 text-xs text-faint">{emptyText}</li>
          ) : (
            filtered.map((o, i) => {
              const isSelected = selected.has(o.value);
              return (
                <li
                  key={o.value}
                  id={optionId(i)}
                  role="option"
                  aria-selected={isSelected}
                  className={`flex cursor-pointer items-center gap-2 rounded-lg px-2.5 py-1.5 text-sm ${
                    i === activeIndex ? 'bg-zinc-100 dark:bg-zinc-800' : ''
                  }`}
                  onMouseEnter={() => setActive(i)}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => toggle(o.value)}
                >
                  <span
                    aria-hidden
                    className={`inline-flex size-4 shrink-0 items-center justify-center rounded border ${
                      isSelected
                        ? 'border-accent-600 bg-accent-600 text-white'
                        : 'border-zinc-300 dark:border-zinc-600'
                    }`}
                  >
                    {isSelected && <Check size={12} />}
                  </span>
                  <span className="min-w-0 flex-1 truncate">{o.label}</span>
                  {o.hint && <span className="truncate text-xs text-faint">{o.hint}</span>}
                </li>
              );
            })
          )}
        </ul>
      )}
    </div>
  );
}
