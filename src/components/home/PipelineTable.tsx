import { useState } from 'react';
import { Link } from 'react-router-dom';
import type { PipelineItem } from '../../api/endpoints';
import { formatInZone, parseServerTime, zonedDateKey } from '../../lib/interviewTimezone';
import { stageLabel } from '../../lib/stageBadge';
import { useInterviewTimezone } from '../../lib/useInterviewTimezone';
import { shortDay } from '../interview/useNeedsInputActions';
import { useNow } from './TodayRound';

const TH = 'px-1.5 py-1 text-right text-[11px] font-normal normal-case tracking-normal text-muted first:pl-0 first:text-left';
const TD = 'whitespace-nowrap px-1.5 py-1.5 text-right tabular-nums';
const AMBER = 'text-amber-700 dark:text-amber-400';
/** Where an open interview stands, in the order the groups show; `short` is the word used in a one-line summary. */
export const PIPELINE_GROUPS: [PipelineItem['status'], string, string][] = [
  ['scheduled', 'Scheduled', 'scheduled'], ['waiting', 'Waiting for a result', 'waiting'],
  ['no_result', 'No result for a week or more', 'no result'], ['followed_up', 'Followed up', 'followed up'],
  ['passed', 'Passed, next round not set', 'passed'],
];

/**
 * The open interviews grouped by where each stands; a group's heading folds it, only Scheduled open at first
 * (user, 2026-11-21). Read-only: a company opens its interview on the Interviews page. Shared by the admin's page
 * for one person and a person's own Home.
 */
export default function PipelineTable({ items }: { items: PipelineItem[] }) {
  const { tz } = useInterviewTimezone();
  const now = useNow();
  const [folded, setFolded] = useState<Set<PipelineItem['status']>>(() => new Set(['waiting', 'no_result', 'followed_up', 'passed']));
  const todayKey = zonedDateKey(new Date(now), tz);
  const when = (p: PipelineItem) => {
    const at = parseServerTime(p.at);
    if (isNaN(at.getTime())) return '—';
    if (zonedDateKey(at, tz) === todayKey) return p.upcoming ? `today ${formatInZone(at, tz, { hour: 'numeric', minute: '2-digit' })}` : 'today';
    return p.upcoming ? formatInZone(at, tz, { weekday: 'short', month: 'short', day: 'numeric' }) : shortDay(p.at, tz);
  };
  const status = (p: PipelineItem): [string, boolean] => {
    switch (p.status) {
      case 'scheduled': return ['scheduled', false];
      case 'waiting': return ['waiting for a result', false];
      case 'no_result': return [p.days != null ? `no result for ${p.days} days` : 'no result yet', true];
      case 'followed_up': {
        const day = shortDay(p.followedUpAt, tz);
        return [`followed up${day ? ` ${day}` : ''}`, true];
      }
      default: return ['passed, next round not set', false];
    }
  };
  return (
    <div className="overflow-x-auto">
      <table aria-label="Pipeline" className="w-full border-collapse text-sm">
        <thead>
          <tr>{['Company', 'Stage', 'Next / last round', 'Status'].map((h) => <th key={h} scope="col" className={TH}>{h}</th>)}</tr>
        </thead>
        {PIPELINE_GROUPS.map(([key, label]) => {
          const rows = items.filter((p) => p.status === key);
          if (rows.length === 0) return null;
          const shown = !folded.has(key);
          return (
            <tbody key={key}>
              <tr className="border-t border-zinc-200 dark:border-zinc-700">
                <td colSpan={4} className="bg-zinc-50 px-1 py-1 dark:bg-zinc-900">
                  <button
                    type="button" aria-expanded={shown} className="w-full text-left text-xs font-semibold text-body"
                    onClick={() => setFolded((f) => { const n = new Set(f); if (n.has(key)) n.delete(key); else n.add(key); return n; })}
                  >
                    <span aria-hidden>{shown ? '▾ ' : '▸ '}</span>{label} ({rows.length})
                  </button>
                </td>
              </tr>
              {shown && rows.map((p) => {
                const [text, due] = status(p);
                return (
                  <tr key={p.interviewId} className="border-t border-zinc-100 dark:border-zinc-800">
                    <th scope="row" className="py-1.5 pl-4 pr-2 text-left font-normal text-body">
                      <Link to={`/interviews?panel=${p.interviewId}`} className="hover:underline">{p.companyName || 'Untitled company'}</Link>
                    </th>
                    <td className={TD}>{stageLabel(p.stage)}</td>
                    <td className={TD}>{when(p)}</td>
                    <td className={`${TD} ${due ? AMBER : ''}`}>{text}</td>
                  </tr>
                );
              })}
            </tbody>
          );
        })}
      </table>
    </div>
  );
}
