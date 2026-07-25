import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { ChevronDown, X } from 'lucide-react';
import {
  COUNTRIES,
  countryFlag,
  countryName,
  filterCountries,
} from '../lib/countries';

interface CountrySelectProps {
  value: string;
  onChange: (code: string) => void;
  placeholder?: string;
  className?: string;
  id?: string;
}

/**
 * Searchable country dropdown. Typing filters by name/code; each option
 * shows the regional-indicator flag emoji for quick recognition.
 */
export default function CountrySelect({
  value,
  onChange,
  placeholder = 'Search country…',
  className = '',
  id,
}: CountrySelectProps) {
  const listId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');

  const selectedLabel = value
    ? `${countryFlag(value)} ${countryName(value)}`.trim()
    : '';

  const options = useMemo(
    () => (open ? filterCountries(query) : COUNTRIES),
    [open, query],
  );

  useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) {
      if (!rootRef.current?.contains(e.target as Node)) {
        setOpen(false);
        setQuery('');
      }
    }
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);

  function openList() {
    setOpen(true);
    setQuery('');
    requestAnimationFrame(() => inputRef.current?.focus());
  }

  function pick(code: string) {
    onChange(code);
    setOpen(false);
    setQuery('');
  }

  function clear(e: React.MouseEvent) {
    e.stopPropagation();
    onChange('');
    setQuery('');
    setOpen(false);
  }

  return (
    <div ref={rootRef} className={`relative ${className}`}>
      {!open ? (
        <button
          type="button"
          id={id}
          onClick={openList}
          className="input w-full text-sm text-left flex items-center gap-2 min-h-[38px]"
          aria-haspopup="listbox"
          aria-expanded={false}
        >
          <span className={`flex-1 truncate ${value ? 'text-body' : 'text-faint'}`}>
            {selectedLabel || placeholder}
          </span>
          {value ? (
            <span
              role="button"
              tabIndex={0}
              onClick={clear}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  clear(e as unknown as React.MouseEvent);
                }
              }}
              className="p-0.5 rounded text-muted hover:text-body"
              aria-label="Clear country"
            >
              <X className="w-3.5 h-3.5" />
            </span>
          ) : null}
          <ChevronDown className="w-4 h-4 text-muted shrink-0" />
        </button>
      ) : (
        <input
          ref={inputRef}
          id={id}
          className="input w-full text-sm"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Escape') {
              setOpen(false);
              setQuery('');
            } else if (e.key === 'Enter' && options[0]) {
              e.preventDefault();
              pick(options[0].code);
            }
          }}
          placeholder={placeholder}
          aria-controls={listId}
          aria-expanded
          autoComplete="off"
        />
      )}

      {open && (
        <ul
          id={listId}
          role="listbox"
          className="absolute z-30 mt-1 max-h-56 w-full overflow-auto rounded-[10px] border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-950 shadow-lg py-1"
        >
          {options.length === 0 ? (
            <li className="px-3 py-2 text-sm text-muted">No matches</li>
          ) : (
            options.map((c) => (
              <li key={c.code} role="option" aria-selected={c.code === value}>
                <button
                  type="button"
                  className={`w-full text-left px-3 py-1.5 text-sm flex items-center gap-2 hover:bg-zinc-100 dark:hover:bg-zinc-900 ${
                    c.code === value ? 'bg-sky-50 dark:bg-sky-950/40' : ''
                  }`}
                  onClick={() => pick(c.code)}
                >
                  <span className="text-base leading-none w-6 shrink-0" aria-hidden>
                    {countryFlag(c.code)}
                  </span>
                  <span className="truncate flex-1">{c.name}</span>
                  <span className="text-xs text-faint shrink-0">{c.code}</span>
                </button>
              </li>
            ))
          )}
        </ul>
      )}
    </div>
  );
}
