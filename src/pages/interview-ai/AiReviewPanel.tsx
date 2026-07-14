import { useEffect, useMemo, useRef, useState } from 'react';
import useSWR from 'swr';
import { marked } from 'marked';
import DOMPurify from 'dompurify';
import { Sparkles, Square, Clock } from 'lucide-react';
import * as api from '../../api/endpoints';
import { notify } from '../../lib/notify';

type Props = {
  selectedIds: Set<string>;
};

function formatRelative(iso?: string): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  const diffMs = Date.now() - d.getTime();
  const sec = Math.round(diffMs / 1000);
  if (sec < 60) return 'just now';
  const min = Math.round(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.round(min / 60);
  if (hr < 24) return `${hr}h ago`;
  return d.toLocaleDateString();
}

function renderMarkdown(text: string): string {
  const html = marked.parse(text || '', { async: false }) as string;
  return DOMPurify.sanitize(html);
}

export default function AiReviewPanel({ selectedIds }: Props) {
  const ids = useMemo(() => Array.from(selectedIds), [selectedIds]);
  const selCount = ids.length;

  const { data: skillsData } = useSWR(['skills'], () => api.listSkills());
  const skills = skillsData?.skills ?? [];

  const { data: runsData, mutate: mutateRuns } = useSWR(['ai-review-runs'], () =>
    api.listAiReviewRuns(50)
  );
  const runs = runsData?.runs ?? [];

  const [activeSkillId, setActiveSkillId] = useState<string>('');
  const [customPrompt, setCustomPrompt] = useState<string>('');
  const [output, setOutput] = useState<string>('');
  const [streaming, setStreaming] = useState<boolean>(false);
  const [activeRunId, setActiveRunId] = useState<string | null>(null);
  const esRef = useRef<EventSource | null>(null);
  const outScrollRef = useRef<HTMLDivElement | null>(null);

  // Auto-scroll output as tokens come in
  useEffect(() => {
    if (streaming && outScrollRef.current) {
      outScrollRef.current.scrollTop = outScrollRef.current.scrollHeight;
    }
  }, [output, streaming]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      esRef.current?.close();
    };
  }, []);

  const selectSkill = (id: string) => {
    if (streaming) return;
    setActiveSkillId(id === activeSkillId ? '' : id);
    if (id) setCustomPrompt('');
  };

  const onCustomChange = (v: string) => {
    if (streaming) return;
    setCustomPrompt(v);
    if (v) setActiveSkillId('');
  };

  const stop = () => {
    esRef.current?.close();
    esRef.current = null;
    setStreaming(false);
  };

  const run = () => {
    if (selCount === 0) {
      notify.error('Select at least one interview from the Interviews tab');
      return;
    }
    if (!activeSkillId && !customPrompt.trim()) {
      notify.error('Pick a skill or write a custom prompt');
      return;
    }
    if (activeSkillId) {
      const skill = skills.find((s) => s._id === activeSkillId);
      if (skill && (selCount < skill.minInterviews || selCount > skill.maxInterviews)) {
        notify.error(
          `"${skill.title}" needs ${skill.minInterviews}–${skill.maxInterviews} interviews (you selected ${selCount})`
        );
        return;
      }
    }

    esRef.current?.close();
    setOutput('');
    setActiveRunId(null);
    setStreaming(true);

    const es = api.streamAiReview({
      interviewIds: ids,
      skillId: activeSkillId || undefined,
      customPrompt: activeSkillId ? undefined : customPrompt.trim(),
      onDelta: (text) => setOutput((prev) => prev + text),
      onDone: (runId) => {
        setStreaming(false);
        esRef.current = null;
        setActiveRunId(runId || null);
        notify.success('Review complete');
        mutateRuns();
      },
      onError: (err) => {
        setStreaming(false);
        esRef.current = null;
        notify.error(err.message || 'AI review failed');
      },
    });
    esRef.current = es;
  };

  const loadRun = (runId: string) => {
    if (streaming) return;
    setActiveRunId(runId);
    const r = runs.find((x) => x._id === runId);
    if (r) setOutput(r.output);
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[1fr_300px] gap-6">
      <div className="space-y-5">
        {/* Selection summary */}
        <div className="flex items-center gap-2 text-sm">
          <span className="inline-flex items-center px-2.5 py-1 rounded-full bg-blue-50 text-primary font-medium">
            {selCount} interview{selCount === 1 ? '' : 's'} selected
          </span>
          {selCount === 0 && (
            <span className="text-muted">Switch to the Interviews tab and check rows to use AI review.</span>
          )}
        </div>

        {/* Skills grid */}
        <div>
          <h3 className="text-sm font-semibold text-strong mb-2">Skills</h3>
          {skills.length === 0 ? (
            <div className="text-sm text-muted border border-dashed border-zinc-200 dark:border-zinc-700 rounded-xl p-4">
              No skills defined yet. {/* admin will see Review Ideas tab */}
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
              {skills.map((s) => {
                const ok = selCount >= s.minInterviews && selCount <= s.maxInterviews;
                const active = s._id === activeSkillId;
                const disabled = streaming || !ok;
                return (
                  <button
                    key={s._id}
                    type="button"
                    onClick={() => selectSkill(s._id)}
                    disabled={disabled}
                    className={
                      'text-left p-3 choice-card ' +
                      (active ? 'choice-card-selected ring-2' : 'bg-zinc-50 dark:bg-zinc-900') +
                      (disabled ? ' opacity-50 cursor-not-allowed' : ' cursor-pointer')
                    }
                    title={ok ? '' : `Needs ${s.minInterviews}–${s.maxInterviews} interviews`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="font-medium text-sm text-strong">{s.title}</div>
                      <span className="shrink-0 text-[11px] px-1.5 py-0.5 rounded bg-zinc-100 dark:bg-zinc-800 text-muted">
                        {s.minInterviews === s.maxInterviews
                          ? `${s.minInterviews}`
                          : `${s.minInterviews}–${s.maxInterviews}`}
                      </span>
                    </div>
                    {s.systemPrompt && (
                      <div className="mt-1 text-xs text-muted line-clamp-2">{s.systemPrompt}</div>
                    )}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Custom prompt */}
        <div>
          <h3 className="text-sm font-semibold text-strong mb-2">Or write a custom prompt</h3>
          <textarea
            className="input w-full min-h-[90px] text-sm"
            placeholder="e.g. Compare these two candidates on systems-design fluency."
            value={customPrompt}
            onChange={(e) => onCustomChange(e.target.value)}
            disabled={streaming || !!activeSkillId}
            maxLength={4000}
          />
          <div className="text-xs text-faint mt-1">{customPrompt.length}/4000</div>
        </div>

        {/* Run / Stop */}
        <div className="flex items-center gap-2">
          {streaming ? (
            <button type="button" className="btn" onClick={stop} style={{ backgroundColor: '#dc2626', color: 'white' }}>
              <Square size={14} className="mr-1" /> Stop
            </button>
          ) : (
            <button
              type="button"
              className="btn"
              onClick={run}
              disabled={selCount === 0 || (!activeSkillId && !customPrompt.trim())}
              style={{ backgroundColor: '#2563eb', color: 'white' }}
            >
              <Sparkles size={14} className="mr-1" /> Run AI review
            </button>
          )}
          {streaming && <span className="text-sm text-muted animate-pulse">Streaming…</span>}
        </div>

        {/* Output */}
        <div>
          <h3 className="text-sm font-semibold text-strong mb-2">Output</h3>
          <div
            ref={outScrollRef}
            className="card p-5 max-h-[60vh] overflow-y-auto"
          >
            {output ? (
              <div
                className="prose prose-sm max-w-none"
                dangerouslySetInnerHTML={{ __html: renderMarkdown(output) }}
              />
            ) : (
              <p className="text-sm text-faint italic">
                Output will appear here as the model streams its response.
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Past runs sidebar */}
      <aside className="space-y-2">
        <h3 className="text-sm font-semibold text-strong flex items-center gap-1.5">
          <Clock size={14} /> Past runs
        </h3>
        {runs.length === 0 ? (
          <p className="text-sm text-faint">No runs yet.</p>
        ) : (
          <div className="space-y-1.5 max-h-[70vh] overflow-y-auto pr-1">
            {runs.map((r) => {
              const skill = skills.find((s) => s._id === r.skillId);
              const label = skill?.title || (r.customPrompt ? 'Custom prompt' : 'Run');
              const active = r._id === activeRunId;
              return (
                <button
                  key={r._id}
                  type="button"
                  onClick={() => loadRun(r._id)}
                  disabled={streaming}
                  className={
                    'w-full text-left p-2.5 choice-card ' +
                    (active ? 'choice-card-selected' : 'bg-zinc-50 dark:bg-zinc-900')
                  }
                >
                  <div className="text-sm font-medium text-strong truncate">{label}</div>
                  <div className="text-[11px] text-muted mt-0.5 flex items-center justify-between">
                    <span>{formatRelative(r.createdAt)}</span>
                    <span>{r.interviewIds.length} iv · {r.completionTokens || 0}t</span>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </aside>
    </div>
  );
}
