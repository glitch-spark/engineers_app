import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent } from 'react';
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
  /** Id of the combobox input — pair with an external <label htmlFor>. */
  id?: string;
  /** Accessible name when there is no visible <label htmlFor>. */
  ariaLabel?: string;
  ariaLabelledBy?: string;
}

/**
 * Searchable country dropdown (ARIA 1.2 editable combobox with a listbox
 * popup). Typing filters by name/code; ArrowUp/Down move the active option,
 * Enter picks it, Escape closes. Each option shows the regional-indicator
 * flag emoji for quick recognition (hidden from assistive tech).
 */
export default function CountrySelect({
  value,
  onChange,
  placeholder = 'Search country…',
  className = '',
  id,
  ariaLabel,
  ariaLabelledBy,
}: CountrySelectProps) {
  const autoId = useId();
  const inputId = id ?? `country-${autoId}`;
  const listId = `${inputId}-list`;
  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);

  const selectedName = value ? countryName(value) : '';

  const options = useMemo(
    () => (open ? filterCountries(query) : COUNTRIES),
    [open, query],
  );
  const activeIndex = Math.min(active, Math.max(options.length - 1, 0));
  const optionId = (i: number) => `${listId}-opt-${i}`;

  useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) {
      if (!rootRef.current?.contains(e.target as Node)) close();
    }
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);

  // Keep the active option visible while arrowing through a long list.
  useEffect(() => {
    if (!open) return;
    const el = document.getElementById(optionId(activeIndex));
    el?.scrollIntoView({ block: 'nearest' });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, activeIndex]);

  function openList() {
    if (open) return;
    const selectedIndex = value ? COUNTRIES.findIndex((c) => c.code === value) : -1;
    setQuery('');
    setActive(selectedIndex >= 0 ? selectedIndex : 0);
    setOpen(true);
  }

  function close() {
    setOpen(false);
    setQuery('');
  }

  function pick(code: string) {
    onChange(code);
    close();
    inputRef.current?.focus();
  }

  function clear() {
    onChange('');
    close();
    inputRef.current?.focus();
  }

  function onKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (!open) openList();
      else setActive(Math.min(activeIndex + 1, options.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (!open) openList();
      else setActive(Math.max(activeIndex - 1, 0));
    } else if (e.key === 'Home' && open) {
      e.preventDefault();
      setActive(0);
    } else if (e.key === 'End' && open) {
      e.preventDefault();
      setActive(Math.max(options.length - 1, 0));
    } else if (e.key === 'Enter') {
      if (open && options[activeIndex]) {
        e.preventDefault();
        pick(options[activeIndex].code);
      }
    } else if (e.key === 'Escape') {
      if (open) {
        // Don't let a surrounding dialog close too.
        e.preventDefault();
        e.stopPropagation();
        close();
      }
    }
  }

  const showFlag = !open && !!value;

  return (
    <div
      ref={rootRef}
      className={`relative ${className}`}
      onBlur={(e) => {
        // Tabbing out of the widget closes the listbox.
        if (!rootRef.current?.contains(e.relatedTarget as Node | null)) close();
      }}
    >
      {showFlag && (
        <span
          className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-sm leading-none"
          aria-hidden
        >
          {countryFlag(value)}
        </span>
      )}
      <input
        ref={inputRef}
        id={inputId}
        type="text"
        role="combobox"
        aria-expanded={open}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={open && options.length ? optionId(activeIndex) : undefined}
        aria-label={ariaLabel}
        aria-labelledby={ariaLabelledBy}
        className={`input w-full text-sm min-h-[38px] ${showFlag ? '!pl-9' : ''} ${value ? '!pr-14' : '!pr-9'}`}
        value={open ? query : selectedName}
        placeholder={placeholder}
        autoComplete="off"
        onFocus={(e) => e.target.select()}
        onClick={openList}
        onChange={(e) => {
          setQuery(e.target.value);
          setActive(0);
          setOpen(true);
        }}
        onKeyDown={onKeyDown}
      />
      {value ? (
        <button
          type="button"
          onClick={clear}
          className="absolute right-8 top-1/2 -translate-y-1/2 p-0.5 rounded text-muted hover:text-body"
          aria-label="Clear country"
        >
          <X className="w-3.5 h-3.5" aria-hidden />
        </button>
      ) : null}
      <ChevronDown
        className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted"
        aria-hidden
      />

      {/* Announce how many results the current query matches (WCAG 4.1.3). */}
      <span role="status" className="sr-only">
        {open ? `${options.length} ${options.length === 1 ? 'country' : 'countries'} available` : ''}
      </span>

      {open && (
        <ul
          id={listId}
          role="listbox"
          aria-label="Countries"
          className="absolute z-30 mt-1 max-h-56 w-full overflow-auto rounded-[10px] border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-950 shadow-lg py-1"
        >
          {options.length === 0 ? (
            <li className="px-3 py-2 text-sm text-muted">No matches</li>
          ) : (
            options.map((c, i) => {
              const isSelected = c.code === value;
              return (
                <li
                  key={c.code}
                  id={optionId(i)}
                  role="option"
                  aria-selected={isSelected}
                  className={`w-full cursor-pointer text-left px-3 py-1.5 text-sm flex items-center gap-2 ${
                    i === activeIndex
                      ? 'bg-zinc-100 dark:bg-zinc-900'
                      : isSelected
                        ? 'bg-sky-50 dark:bg-sky-950/40'
                        : ''
                  }`}
                  onMouseEnter={() => setActive(i)}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => pick(c.code)}
                >
                  <span className="text-base leading-none w-6 shrink-0" aria-hidden>
                    {countryFlag(c.code)}
                  </span>
                  <span className="truncate flex-1">{c.name}</span>
                  <span className="text-xs text-faint shrink-0">{c.code}</span>
                </li>
              );
            })
          )}
        </ul>
      )}
    </div>
  );
}
