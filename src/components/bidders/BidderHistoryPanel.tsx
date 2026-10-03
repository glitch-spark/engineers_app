import { useState } from 'react';
import useSWR from 'swr';
import { Copy } from 'lucide-react';
import * as api from '../../api/endpoints';
import { notify } from '../../lib/notify';
import { usd } from '../../lib/money';
import LoadingSpinner from '../LoadingSpinner';
import SidePanel from '../SidePanel';
import Tabs from '../Tabs';

type Kind = 'daily' | 'weekly';

const TABS: { key: Kind; label: string }[] = [
  { key: 'daily', label: 'Daily' },
  { key: 'weekly', label: 'Weekly' },
];

// Viewer-local, e.g. "Thu 6:30 PM".
const fmtMoment = (iso: string) =>
  new Date(iso).toLocaleString('en-US', { weekday: 'short', hour: 'numeric', minute: '2-digit' });

function ReportList({ bidder, kind }: { bidder: api.Bidder; kind: Kind }) {
  const { data, error, isLoading } = useSWR(
    ['bidder-reports', bidder._id, kind] as const,
    () => api.bidderReports(bidder._id, kind, 30),
  );

  if (isLoading) return <div className="flex justify-center py-8"><LoadingSpinner size="sm" /></div>;
  if (error) return <p className="py-6 text-center text-sm text-muted">Couldn't load history.</p>;
  const reports = data?.reports ?? [];
  if (reports.length === 0) {
    return <p className="py-6 text-center text-sm text-muted">No reports yet — the first one posts at the next cutoff.</p>;
  }

  const daily = kind === 'daily';
  return (
    <div className="table-wrap">
      <table className="min-w-full text-sm">
        <thead className="table-head">
          <tr>
            <th className="px-4 py-2.5">{daily ? 'Date' : 'Week ending'}</th>
            {daily && <th className="px-4 py-2.5">Window</th>}
            <th className="px-4 py-2.5">Count</th>
            {!daily && <th className="px-4 py-2.5">Rate</th>}
            {!daily && <th className="px-4 py-2.5">Pay</th>}
          </tr>
        </thead>
        <tbody>
          {reports.map((r) => (
            <tr key={r.periodKey} className="table-row">
              <td className="px-4 py-2.5">{r.periodKey}</td>
              {daily && (
                <td className="px-4 py-2.5">{fmtMoment(r.periodStart)} → {fmtMoment(r.periodEnd)}</td>
              )}
              {r.error ? (
                <td className="px-4 py-2.5" colSpan={daily ? 1 : 3}>⚠️ {r.error}</td>
              ) : (
                <>
                  <td className="px-4 py-2.5">{r.count ?? '—'}</td>
                  {!daily && <td className="px-4 py-2.5">{usd(r.rate)}</td>}
                  {!daily && <td className="px-4 py-2.5">{r.amount == null ? '—' : usd(r.amount)}</td>}
                </>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function BidderHistoryPanel({ bidder, onClose }: { bidder: api.Bidder | null; onClose: () => void }) {
  const [kind, setKind] = useState<Kind>('daily');

  const copyUrl = async () => {
    if (!bidder) return;
    try {
      await navigator.clipboard.writeText(bidder.screenshotFolderUrl);
      notify.success('Folder URL copied');
    } catch (err) {
      notify.error(err, 'Failed to copy folder URL');
    }
  };

  return (
    <SidePanel
      open={!!bidder}
      title={bidder?.name ?? ''}
      subtitle={bidder && (
        <span className="inline-flex items-center gap-2">
          <span className="font-mono text-xs break-all">{bidder.screenshotFolderUrl}</span>
          <button type="button" className="shrink-0 text-muted hover:text-body" aria-label="Copy folder URL" onClick={copyUrl}>
            <Copy size={14} aria-hidden />
          </button>
        </span>
      )}
      onClose={onClose}
      wide
    >
      {bidder && (
        <Tabs tabs={TABS} value={kind} onChange={(k) => setKind(k as Kind)} ariaLabel="Report history">
          <ReportList bidder={bidder} kind={kind} />
        </Tabs>
      )}
    </SidePanel>
  );
}
