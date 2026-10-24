import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { Loader2 } from 'lucide-react';
import * as api from '../../api/endpoints';
import type { ResumeMatch } from '../../api/endpoints';
import { TailoredScore } from '../jobApplies/Suggestions';

const DEBOUNCE_MS = 250;
const MIN_CHARS = 2;

export function shortDay(iso: string | null | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  return isNaN(d.getTime()) ? '' : d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

export const KIND_LABEL: Record<'tailored' | 'uploaded', string> = { tailored: 'Tailored', uploaded: 'Uploaded' };

/**
 * The Company box of a new interview: typing searches the profile's generated resumes and uploaded-resume
 * applications (editable combobox with a listbox popup, as CountrySelect). Typed text stays the company name;
 * picking a result links it.
 */
export default function CompanyMatchField({
  id,
  accountId,
  value,
  onChange,
  onPick,
  disabled,
}: {
  id: string;
  accountId: string;
  value: string;
  onChange: (company: string) => void;
  onPick: (m: ResumeMatch) => void;
  disabled?: boolean;
}) {
  const listId = `${id}-list`;
  const rootRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [matches, setMatches] = useState<ResumeMatch[]>([]);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);
  const q = value.trim();
  const searchable = !!accountId && q.length >= MIN_CHARS;
  const optionId = (i: number) => `${listId}-opt-${i}`;
  const activeIndex = Math.min(active, Math.max(matches.length - 1, 0));

  useEffect(() => {
    if (!searchable) {
      setMatches([]);
      setLoading(false);
      return;
    }
    let stale = false;
    setLoading(true);
    const t = setTimeout(() => {
      api.searchResumeMatches(accountId, q)
        .then((r) => {
          if (stale) return;
          setMatches(r.matches);
          setFailed(false);
          setActive(0);
        })
        .catch(() => {
          if (stale) return;
          setMatches([]);
          setFailed(true);
        })
        .finally(() => {
          if (!stale) setLoading(false);
        });
    }, DEBOUNCE_MS);
    return () => {
      stale = true;
      clearTimeout(t);
    };
  }, [accountId, q, searchable]);

  useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);

  useEffect(() => {
    if (open) document.getElementById(optionId(activeIndex))?.scrollIntoView({ block: 'nearest' });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, activeIndex]);

  function pick(m: ResumeMatch) {
    onPick(m);
    setOpen(false);
  }

  function onKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (!open) setOpen(true);
      else setActive(Math.min(activeIndex + 1, matches.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive(Math.max(activeIndex - 1, 0));
    } else if (e.key === 'Enter') {
      if (open && matches[activeIndex]) {
        e.preventDefault();
        pick(matches[activeIndex]);
      }
    } else if (e.key === 'Escape' && open) {
      // Don't let the surrounding panel close too.
      e.preventDefault();
      e.stopPropagation();
      setOpen(false);
    }
  }

  const showList = open && searchable;

  return (
    <div
      ref={rootRef}
      className="relative"
      onBlur={(e) => {
        if (!rootRef.current?.contains(e.relatedTarget as Node | null)) setOpen(false);
      }}
    >
      <input
        id={id}
        type="text"
        role="combobox"
        aria-expanded={showList}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={showList && matches.length ? optionId(activeIndex) : undefined}
        aria-required
        className="input w-full !pr-9"
        value={value}
        disabled={disabled || !accountId}
        placeholder={accountId ? 'Search your resumes by company…' : 'Select a profile first'}
        autoComplete="off"
        onFocus={() => setOpen(true)}
        onChange={(e) => {
          onChange(e.target.value);
          setOpen(true);
        }}
        onKeyDown={onKeyDown}
      />
      {loading && (
        <Loader2 className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-muted" aria-hidden />
      )}
      <span role="status" className="sr-only">
        {showList && !loading ? `${matches.length} ${matches.length === 1 ? 'resume' : 'resumes'} found` : ''}
      </span>
      {showList && (
        <ul
          id={listId}
          role="listbox"
          aria-label="Resumes for this company"
          className="absolute z-30 mt-1 max-h-72 w-full overflow-auto rounded-[10px] border border-zinc-200 bg-white py-1 shadow-lg dark:border-zinc-700 dark:bg-zinc-950"
        >
          {matches.length === 0 ? (
            <li className="px-3 py-2 text-sm text-muted">
              {loading
                ? 'Searching…'
                : failed
                  ? 'Search failed. Try again, or tick No company found.'
                  : `No resume or application for “${q}”. Tick No company found below.`}
            </li>
          ) : (
            matches.map((m, i) => (
              <li
                key={m.matchId}
                id={optionId(i)}
                role="option"
                aria-selected={i === activeIndex}
                className={`flex cursor-pointer items-center gap-3 px-3 py-1.5 text-sm ${i === activeIndex ? 'bg-zinc-100 dark:bg-zinc-900' : ''}`}
                onMouseEnter={() => setActive(i)}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => pick(m)}
              >
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium text-strong">{m.company}</span>
                  <span className="block truncate text-xs text-muted">
                    {[KIND_LABEL[m.kind], shortDay(m.appliedAt), m.promptName && `prompt “${m.promptName}”`, m.filename]
                      .filter(Boolean)
                      .join(' · ')}
                  </span>
                </span>
                {m.score ? <TailoredScore m={m.score} /> : <span className="text-xs text-faint">No score</span>}
              </li>
            ))
          )}
        </ul>
      )}
    </div>
  );
}
