import { useEffect, useRef, useState } from 'react';
import { Link, Navigate, useLocation, useSearchParams } from 'react-router-dom';
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
import NeedsInput from './NeedsInput';
import { useInterviewFilters } from './useInterviewFilters';
import { legacyCallTarget } from '../../lib/interviewFilters';
import ZoneSelect from '../../components/interview/ZoneSelect';
import CallerRoundsList from './CallerRoundsList';
import { SUMMARY_KEY } from './InterviewTotals';
import CallersLegend from '../../components/interview/CallersLegend';
import CallersDirectory from './CallersDirectory';

type PanelState = { interview: Interview | null; mode: PanelMode; roundId?: string; focusRoundId?: string; prefill?: RoundPrefill };

type View = 'list' | 'calendar';

export default function InterviewsPage(props: { view: View; callers?: boolean; directory?: boolean }) {
  const { pathname, search } = useLocation();
  const target = props.callers || props.directory ? null : legacyCallTarget(pathname, search);
  if (target) return <Navigate to={target} replace />;
  return <InterviewsPageBody {...props} />;
}

/** Self interviews and Caller interviews tabs, each List (default) or Calendar, shared filters, one side panel.
 * `callers`: every user's caller rounds, coloured by caller; a click opens the side panel on that round, where
 * admins and interview managers assign the caller.
 * `directory`: the Manage callers tab (who the callers are, their load and pass rate) instead of rounds. */
function InterviewsPageBody({ view, callers = false, directory = false }: { view: View; callers?: boolean; directory?: boolean }) {
  const { filters, update, sharedQs, canClear, clear, pending } = useInterviewFilters(callers);
  const [params, setParams] = useSearchParams();
  const { mutate } = useSWRConfig();
  const [panel, setPanel] = useState<PanelState | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Interview | null>(null);
  const [deleting, setDeleting] = useState(false);

  const refresh = () => mutate(
    (key) => Array.isArray(key) && ['interviews-list', 'interview-rounds', 'caller-rounds-list', 'interviews-needs-input', SUMMARY_KEY].includes(key[0]),
  );

  // Dropping the deep-link param re-renders this page; only unmounting should discard a pending lookup.
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);

  // `?panel=:id` (e.g. "back" from the full-screen page) opens that interview.
  const panelParam = params.get('panel');
  useEffect(() => {
    if (!panelParam) return;
    const next = new URLSearchParams(params);
    next.delete('panel');
    setParams(next, { replace: true });
    api.getInterview(panelParam)
      .then((iv) => { if (mounted.current) setPanel({ interview: iv as unknown as Interview, mode: 'view' }); })
      .catch(() => { /* not viewable: stay on the list */ });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [panelParam]);

  // `?round=<interviewId>:<roundId>` (the Slack "Assign caller" button) opens the side panel on that round.
  const roundParam = params.get('round');
  useEffect(() => {
    if (!roundParam || !callers) return;
    const next = new URLSearchParams(params);
    next.delete('round');
    setParams(next, { replace: true });
    const [ivId, roundId] = roundParam.split(':');
    if (!ivId || !roundId) return;
    api.getInterview(ivId)
      .then((iv) => { if (mounted.current) setPanel({ interview: iv as unknown as Interview, mode: 'view', focusRoundId: roundId }); })
      .catch(() => { /* not viewable: stay on the schedule */ });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roundParam, callers]);

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
  const viewLink = (target: View, label: string) => (
    <Link
      to={`/interviews${callers ? '/callers' : ''}${target === 'calendar' ? '/calendar' : ''}${sharedQs}`}
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
        {!directory && (
          <div className="flex flex-wrap items-center gap-3">
            <ZoneSelect />
            <nav className="segmented" aria-label="Interview view">
              {viewLink('list', 'List')}
              {viewLink('calendar', 'Calendar')}
            </nav>
          </div>
        )}
      </div>

      {/* Self interviews only; waits for an admin's default user like the list below. */}
      {!directory && !callers && !pending && <NeedsInput filterUser={filters.user} onSaved={refresh} />}
      {!directory && <InterviewFilters filters={filters} update={update} canClear={canClear} onClear={clear} callers={callers} />}
      {callers && !directory && <CallersLegend />}

      {directory ? (
        <CallersDirectory />
      ) : pending && !callers ? (
        // An admin's default user (the first team member) is still loading: nothing is asked for until it is known.
        <div className="panel space-y-2 p-4" aria-busy="true" data-testid="interviews-pending">
          {Array.from({ length: 5 }, (_, i) => <div key={i} className="skeleton h-10 w-full" />)}
        </div>
      ) : callers && view === 'list' ? (
        <CallerRoundsList
          filters={filters}
          update={update}
          onOpenRound={(iv, roundId) => setPanel({ interview: iv, mode: 'view', focusRoundId: roundId })}
        />
      ) : callers ? (
        <InterviewsCalendar
          key="callers"
          callers
          filters={filters}
          update={update}
          onOpenRound={(iv, roundId) => setPanel({ interview: iv, mode: 'view', focusRoundId: roundId })}
          onNew={(prefill) => setPanel({ interview: null, mode: 'new', prefill: { ...prefill, caller: true } })}
        />
      ) : view === 'list' ? (
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
          // Same as the list: the interview's summary first (Edit details, Add next round, edit a round from there).
          onOpenRound={(iv) => setPanel({ interview: iv, mode: 'view' })}
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
            focusRoundId={panel.focusRoundId}
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
