import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useSWRConfig } from 'swr';
import * as api from '../../api/endpoints';
import PageHeader from '../../components/PageHeader';
import InterviewTabs from '../../components/InterviewTabs';
import ConfirmDialog from '../../components/ConfirmDialog';
import InterviewPanel, { type PanelMode } from '../../components/interview/InterviewPanel';
import type { RoundPrefill } from '../../components/interview/InterviewForm';
import type { Interview } from '../../components/interview/types';
import { notify } from '../../lib/notify';
import InterviewFilters from './InterviewFilters';
import InterviewsCalendar from './InterviewsCalendar';
import InterviewsList from './InterviewsList';
import { useInterviewFilters } from './useInterviewFilters';
import ZoneSelect from '../../components/interview/ZoneSelect';

type PanelState = { interview: Interview | null; mode: PanelMode; roundId?: string; prefill?: RoundPrefill };

/** Interviews tab: List (default) or Calendar, shared filters, one side panel. */
export default function InterviewsPage({ view }: { view: 'list' | 'calendar' }) {
  const [filters, update, sharedQs] = useInterviewFilters();
  const [params, setParams] = useSearchParams();
  const { mutate } = useSWRConfig();
  const [panel, setPanel] = useState<PanelState | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Interview | null>(null);
  const [deleting, setDeleting] = useState(false);

  const refresh = () => mutate(
    (key) => Array.isArray(key) && (key[0] === 'interviews-list' || key[0] === 'interview-rounds'),
  );

  // `?panel=:id` (e.g. "back" from the full-screen page) opens that interview.
  const panelParam = params.get('panel');
  useEffect(() => {
    if (!panelParam) return;
    let cancelled = false;
    const next = new URLSearchParams(params);
    next.delete('panel');
    setParams(next, { replace: true });
    api.getInterview(panelParam)
      .then((iv) => { if (!cancelled) setPanel({ interview: iv as unknown as Interview, mode: 'view' }); })
      .catch(() => { /* not viewable: stay on the list */ });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [panelParam]);

  const remove = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await api.deleteInterview(deleteTarget._id);
      notify.success('Interview deleted');
      setDeleteTarget(null);
      refresh();
    } catch (err) {
      notify.error(err, 'Failed to delete interview');
    } finally {
      setDeleting(false);
    }
  };

  const rounds = deleteTarget?.stageHistory?.length || 1;
  const viewLink = (target: 'list' | 'calendar', label: string) => (
    <Link
      to={`/interviews${target === 'calendar' ? '/calendar' : ''}${sharedQs}`}
      aria-current={view === target ? 'page' : undefined}
      className={`segmented-btn ${view === target ? 'segmented-btn-active-neutral' : ''}`}
    >
      {label}
    </Link>
  );

  return (
    <div className="space-y-4">
      <PageHeader
        title="Interviews"
        action={<button type="button" className="btn" onClick={() => setPanel({ interview: null, mode: 'new' })}>New interview</button>}
      />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <InterviewTabs />
        <div className="flex flex-wrap items-center gap-3">
          <ZoneSelect />
          <nav className="segmented" aria-label="Interview view">
            {viewLink('list', 'List')}
            {viewLink('calendar', 'Calendar')}
          </nav>
        </div>
      </div>

      <InterviewFilters filters={filters} update={update} />

      {view === 'list' ? (
        <InterviewsList
          filters={filters}
          update={update}
          onOpen={(iv, mode = 'view', roundId) => setPanel({ interview: iv, mode, roundId })}
          onDelete={setDeleteTarget}
        />
      ) : (
        <InterviewsCalendar
          filters={filters}
          update={update}
          onOpenRound={(iv, roundId) => setPanel({ interview: iv, mode: 'editRound', roundId })}
          onNew={(prefill) => setPanel({ interview: null, mode: 'new', prefill })}
        />
      )}

      {panel && (
        <>
          <div className="fixed inset-0 top-16 z-40 bg-black/25" onClick={() => setPanel(null)} aria-hidden />
          <InterviewPanel
            open
            interview={panel.interview}
            initialMode={panel.mode}
            initialRoundId={panel.roundId}
            prefill={panel.prefill}
            onClose={() => setPanel(null)}
            onChanged={() => { refresh(); }}
          />
        </>
      )}

      <ConfirmDialog
        open={!!deleteTarget}
        title="Delete interview?"
        body={`Deletes this interview and its ${rounds} round${rounds === 1 ? '' : 's'}.`}
        busy={deleting}
        onConfirm={remove}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  );
}
