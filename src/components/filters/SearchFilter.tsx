import { useEffect, useId, useRef, useState } from 'react';
import { Search, X } from 'lucide-react';

const DEBOUNCE_MS = 300;

/**
 * Debounced search box for a `FilterBar`. `onChange` fires 300 ms after the last keystroke; the x button and Esc
 * clear it at once (and cancel any pending change). When `value` changes from outside (Clear, reset, a new URL) the
 * box follows it.
 */
export default function SearchFilter({
  value,
  onChange,
  placeholder,
  label = 'Search',
  width = 'w-64',
  description,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  label?: string;
  /** Tailwind width class for the field. */
  width?: string;
  /** Screen-reader-only hint, linked to the box with `aria-describedby` (e.g. how multiple words are matched). */
  description?: string;
}) {
  const id = useId();
  const [text, setText] = useState(value);
  // The last value this box reported or adopted; a `value` that differs from it came from outside.
  const synced = useRef(value);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  const cancel = () => {
    if (timer.current !== null) {
      clearTimeout(timer.current);
      timer.current = null;
    }
  };

  useEffect(() => {
    if (value !== synced.current) {
      cancel();
      synced.current = value;
      setText(value);
    }
  }, [value]);

  useEffect(() => cancel, []);

  const type = (next: string) => {
    setText(next);
    cancel();
    timer.current = setTimeout(() => {
      timer.current = null;
      if (next !== synced.current) {
        synced.current = next;
        onChangeRef.current(next);
      }
    }, DEBOUNCE_MS);
  };

  const clear = () => {
    cancel();
    setText('');
    if (text !== '' || value !== '') {
      synced.current = '';
      onChangeRef.current('');
    }
  };

  return (
    <div className={width}>
      <label htmlFor={id} className="mb-1 block text-xs text-muted">
        {label}
      </label>
      <div className="relative">
        <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" aria-hidden />
        <input
          id={id}
          type="text"
          role="searchbox"
          autoComplete="off"
          className="input !pl-9 !pr-8"
          placeholder={placeholder}
          aria-describedby={description ? `${id}-desc` : undefined}
          value={text}
          onChange={(e) => type(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Escape') {
              e.preventDefault();
              clear();
            }
          }}
        />
        {text !== '' && (
          <button
            type="button"
            className="btn-icon absolute right-1 top-1/2 -translate-y-1/2 !p-1"
            onClick={clear}
            aria-label="Clear search"
            title="Clear search"
          >
            <X size={14} aria-hidden />
          </button>
        )}
      </div>
      {description && (
        <span id={`${id}-desc`} className="sr-only">
          {description}
        </span>
      )}
    </div>
  );
}
