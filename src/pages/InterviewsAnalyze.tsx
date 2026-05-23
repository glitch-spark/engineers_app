import { useEffect, useMemo, useRef, useState } from 'react';
import { marked } from 'marked';
import useSWR from 'swr';
import {
  Loader2, Sparkles, AlertTriangle, TrendingUp, Lightbulb, BarChart3,
  Mic, Star, Flame, Target, MessageCircle, Send, Trash2,
} from 'lucide-react';
import Select from '../components/Select';
import InterviewTabs from '../components/InterviewTabs';
import * as api from '../api/endpoints';
import type { InterviewAnalyzeResult, InterviewAnalyzeStage, InterviewAnalyzeWeakSpot } from '../api/endpoints';
import { useAuth } from '../auth/useAuth';
import { notify } from '../lib/notify';

const STAGE_OPTS = [
  { value: '', label: 'All stages' },
  { value: 'intro', label: 'Intro' },
  { value: 'tech', label: 'Tech' },
  { value: 'panel', label: 'Panel' },
  { value: 'live_coding', label: 'Live Coding' },
  { value: 'system_design', label: 'System Design' },
  { value: 'cultural', label: 'Cultural' },
  { value: 'final', label: 'Final' },
  { value: 'ai_interview', label: 'AI Interview' },
];

export default function InterviewsAnalyzePage() {
  const { user } = useAuth();

  const { data: accountsData } = useSWR('analyze-accounts-lookup', () => api.lookupAccounts());
  const accountOptions = useMemo(() => {
    const all = accountsData?.accounts ?? [];
    const own = all.filter((a) => a.createdBy && user?.id && a.createdBy === user.id);
    return [
      { value: '', label: 'All profiles' },
      ...own.map((a) => ({ value: a._id, label: a.name })),
    ];
  }, [accountsData, user?.id]);

  const [accountId, setAccountId] = useState('');
  const [stage, setStage] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');

  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<InterviewAnalyzeResult | null>(null);
  const [meta, setMeta] = useState<{ interviewCount: number; transcriptCount: number } | null>(null);
  const [filterContext, setFilterContext] = useState<Record<string, unknown>>({});

  async function run() {
    setRunning(true);
    setResult(null);
    setMeta(null);
    try {
      const res = await api.analyzeInterviews({
        accountId: accountId || undefined,
        stages: stage ? [stage] : undefined,
        fromDate: from || undefined,
        toDate: to || undefined,
      });
      setResult(res.result);
      setFilterContext(res.filterContext ?? {});
      setMeta({ interviewCount: res.interviewCount, transcriptCount: res.transcriptCount });
      if (res.transcriptCount === 0) {
        notify.warn('No transcripts in scope — upload some first.');
      }
    } catch (err) {
      notify.error(err, 'Analysis failed');
    } finally {
      setRunning(false);
    }
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold">Interviews</h1>
        <p className="text-sm text-gray-500 mt-1">
          Cross-interview rollup — find patterns, weak spots, and prep tips.
        </p>
      </div>
      <InterviewTabs />

      {/* Filters */}
      <div className="flex items-end gap-2 flex-wrap text-xs bg-white rounded-md border border-gray-100 shadow-sm p-3">
        <div className="w-44">
          <label className="block mb-1 text-gray-600">Profile</label>
          <Select value={accountId} onChange={setAccountId} options={accountOptions} />
        </div>
        <div className="w-40">
          <label className="block mb-1 text-gray-600">Stage</label>
          <Select value={stage} onChange={setStage} options={STAGE_OPTS} />
        </div>
        <div className="w-36">
          <label className="block mb-1 text-gray-600">From</label>
          <input className="input w-full" type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
        </div>
        <div className="w-36">
          <label className="block mb-1 text-gray-600">To</label>
          <input className="input w-full" type="date" value={to} onChange={(e) => setTo(e.target.value)} />
        </div>
        <button
          type="button"
          className="btn px-3 py-2 text-xs"
          onClick={run}
          disabled={running || !accountId}
          title={accountId ? 'Run analysis' : 'Pick a profile first'}
        >
          {running ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <Sparkles size={14} className="mr-1" />}
          Analyze
        </button>
        {meta && (
          <span className="text-gray-500 ml-2">
            {meta.transcriptCount}/{meta.interviewCount} interviews with transcripts
          </span>
        )}
      </div>

      {!result && !running && (
        <div className="bg-white rounded-md border border-gray-100 shadow-sm p-8 text-center text-sm text-gray-500">
          Pick filters → click Analyze to run.
        </div>
      )}

      {running && (
        <div className="bg-white rounded-md border border-gray-100 shadow-sm p-8 text-center text-sm text-gray-500">
          <Loader2 className="w-5 h-5 animate-spin mx-auto mb-2" />
          Analyzing transcripts… 30-60s.
        </div>
      )}

      {result && (
        <div className="space-y-4">
          <StyleProfile result={result} />
          <HowToShine result={result} />
          <StageScoreboard stages={result.stages} />
          <StagePatterns stages={result.stages} />
          <TopQuestions stages={result.stages} />
          <WeakSpots weakSpots={result.weakSpots} />
          <PrepTips stages={result.stages} overall={result.overallTips} />
          <RedFlagsCard
            redFlags={result.redFlags}
            uncertaintyTopics={result.uncertaintyTopics}
          />
          <FollowUpChat
            result={result}
            filterContext={filterContext}
            accountId={accountId}
            stage={stage}
            from={from}
            to={to}
          />
        </div>
      )}
    </div>
  );
}

// ---------- Cards -----------------------------------------------------------

function StageScoreboard({ stages }: { stages: InterviewAnalyzeStage[] }) {
  if (!stages.length) return null;
  return (
    <section className="bg-white rounded-md border border-gray-100 shadow-sm p-5">
      <header className="flex items-center gap-2 mb-3">
        <BarChart3 className="w-4 h-4 text-gray-500" />
        <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">Score per stage</h2>
      </header>
      <div className="space-y-2">
        {stages.map((s) => (
          <div key={s.stage} className="flex items-center gap-3">
            <div className="w-32 text-sm text-gray-700">{s.stageLabel}</div>
            <div className="flex-1 h-3 bg-gray-100 rounded-full overflow-hidden">
              <div
                className={`h-full ${scoreColor(s.overallScore)}`}
                style={{ width: `${Math.max(0, Math.min(100, (s.overallScore / 10) * 100))}%` }}
              />
            </div>
            <div className="w-16 text-right text-sm font-semibold text-gray-900">
              {s.overallScore.toFixed(1)}/10
            </div>
            <div className="w-16 text-right text-xs text-gray-400">
              n={s.interviewCount}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

function TopQuestions({ stages }: { stages: InterviewAnalyzeStage[] }) {
  const withQs = stages.filter((s) => s.topQuestions.length > 0);
  if (!withQs.length) return null;
  return (
    <section className="bg-white rounded-md border border-gray-100 shadow-sm p-5">
      <header className="flex items-center gap-2 mb-3">
        <TrendingUp className="w-4 h-4 text-gray-500" />
        <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">Most-asked questions per stage</h2>
      </header>
      <div className="space-y-4">
        {withQs.map((s) => (
          <div key={s.stage}>
            <h3 className="text-xs font-semibold text-gray-700 mb-2">{s.stageLabel}</h3>
            <ul className="space-y-1">
              {s.topQuestions.map((q, i) => (
                <li key={i} className="flex items-start gap-2 text-sm text-gray-700">
                  <span className="text-gray-400 mt-0.5">{i + 1}.</span>
                  <span className="flex-1">{q.question}</span>
                  <span className="text-xs text-gray-400 whitespace-nowrap">×{q.frequency}</span>
                  <span className={`text-xs font-semibold ${scoreTextColor(q.exampleScore)}`}>
                    {q.exampleScore}/10
                  </span>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </section>
  );
}

function WeakSpots({ weakSpots }: { weakSpots: InterviewAnalyzeWeakSpot[] }) {
  if (!weakSpots.length) return null;
  return (
    <section className="bg-white rounded-md border border-gray-100 shadow-sm p-5">
      <header className="flex items-center gap-2 mb-3">
        <AlertTriangle className="w-4 h-4 text-amber-600" />
        <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">Weak spots</h2>
      </header>
      <ul className="space-y-3">
        {weakSpots.map((w, i) => (
          <li key={i} className="border border-amber-100 rounded-md p-3 bg-amber-50/40">
            <div className="flex items-center gap-2 mb-1">
              <span className="inline-flex items-center px-2 py-0.5 rounded-[8px] text-xs font-medium border bg-gray-100 text-gray-700 border-gray-200">
                {w.stage}
              </span>
              <strong className="text-sm text-gray-900">{w.topic}</strong>
            </div>
            <p className="text-sm text-gray-700 mb-1">{w.explanation}</p>
            <p className="text-sm text-gray-700"><span className="font-medium">Tip:</span> {w.tip}</p>
          </li>
        ))}
      </ul>
    </section>
  );
}

function PrepTips({ stages, overall }: { stages: InterviewAnalyzeStage[]; overall: string[] }) {
  const stagesWithDrills = stages.filter(
    (s) => s.drills.length > 0 || s.styleImprovements.length > 0,
  );
  if (!stagesWithDrills.length && !overall.length) return null;
  return (
    <section className="bg-white rounded-md border border-gray-100 shadow-sm p-5">
      <header className="flex items-center gap-2 mb-3">
        <Lightbulb className="w-4 h-4 text-yellow-600" />
        <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">Prep tips</h2>
      </header>
      {overall.length > 0 && (
        <div className="mb-4">
          <h3 className="text-xs font-semibold text-gray-700 mb-2">Overall</h3>
          <ul className="space-y-1.5 list-disc pl-5 text-sm text-gray-700">
            {overall.map((t, i) => (
              <li key={i}>{t}</li>
            ))}
          </ul>
        </div>
      )}
      <div className="space-y-4">
        {stagesWithDrills.map((s) => (
          <div key={s.stage} className="border-t border-gray-100 pt-3 first:border-t-0 first:pt-0">
            <h3 className="text-xs font-semibold text-gray-700 mb-2">{s.stageLabel}</h3>
            {s.drills.length > 0 && (
              <>
                <div className="text-xs font-medium text-gray-500 mb-1">Drills</div>
                <ul className="space-y-1 list-disc pl-5 text-sm text-gray-700 mb-2">
                  {s.drills.map((t, i) => <li key={i}>{t}</li>)}
                </ul>
              </>
            )}
            {s.styleImprovements.length > 0 && (
              <>
                <div className="text-xs font-medium text-gray-500 mb-1">Style fixes</div>
                <ul className="space-y-1 list-disc pl-5 text-sm text-gray-700">
                  {s.styleImprovements.map((t, i) => <li key={i}>{t}</li>)}
                </ul>
              </>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}

function StyleProfile({ result }: { result: InterviewAnalyzeResult }) {
  const { styleProfile, signatureStrengths, blindSpots } = result;
  if (!styleProfile && !signatureStrengths.length && !blindSpots.length) return null;
  return (
    <section className="bg-white rounded-md border border-gray-100 shadow-sm p-5">
      <header className="flex items-center gap-2 mb-3">
        <Mic className="w-4 h-4 text-indigo-600" />
        <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">Your interview style</h2>
      </header>
      {styleProfile && (
        <p className="text-sm text-gray-800 mb-4 leading-relaxed">{styleProfile}</p>
      )}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {signatureStrengths.length > 0 && (
          <div>
            <div className="text-xs font-semibold text-green-700 mb-1.5 flex items-center gap-1">
              <Star size={12} /> Signature strengths
            </div>
            <ul className="space-y-1 list-disc pl-5 text-sm text-gray-700">
              {signatureStrengths.map((t, i) => <li key={i}>{t}</li>)}
            </ul>
          </div>
        )}
        {blindSpots.length > 0 && (
          <div>
            <div className="text-xs font-semibold text-red-700 mb-1.5 flex items-center gap-1">
              <AlertTriangle size={12} /> Blind spots
            </div>
            <ul className="space-y-1 list-disc pl-5 text-sm text-gray-700">
              {blindSpots.map((t, i) => <li key={i}>{t}</li>)}
            </ul>
          </div>
        )}
      </div>
    </section>
  );
}

function HowToShine({ result }: { result: InterviewAnalyzeResult }) {
  const { howToShine, interviewTactics } = result;
  if (!howToShine.length && !interviewTactics.length) return null;
  return (
    <section className="bg-white rounded-md border border-gray-100 shadow-sm p-5">
      <header className="flex items-center gap-2 mb-3">
        <Target className="w-4 h-4 text-blue-600" />
        <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">How to shine next time</h2>
      </header>
      {howToShine.length > 0 && (
        <div className="mb-3">
          <div className="text-xs font-medium text-gray-500 mb-1.5">Power moves</div>
          <ul className="space-y-2">
            {howToShine.map((m, i) => (
              <li key={i} className="text-sm text-gray-800">
                <span className="font-medium text-gray-900">{m.move}</span>
                {m.why && <span className="text-gray-600"> — {m.why}</span>}
              </li>
            ))}
          </ul>
        </div>
      )}
      {interviewTactics.length > 0 && (
        <div>
          <div className="text-xs font-medium text-gray-500 mb-1.5">Direction-leading tactics</div>
          <ul className="space-y-1 list-disc pl-5 text-sm text-gray-700">
            {interviewTactics.map((t, i) => <li key={i}>{t}</li>)}
          </ul>
        </div>
      )}
    </section>
  );
}

function StagePatterns({ stages }: { stages: InterviewAnalyzeStage[] }) {
  const withSignal = stages.filter(
    (s) => s.askedAlways.length || s.youShineOn.length || s.youStumbleOn.length
      || Object.values(s.communicationStyle || {}).some((v) => !!v),
  );
  if (!withSignal.length) return null;
  return (
    <section className="bg-white rounded-md border border-gray-100 shadow-sm p-5">
      <header className="flex items-center gap-2 mb-3">
        <MessageCircle className="w-4 h-4 text-gray-500" />
        <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">Per-stage patterns</h2>
      </header>
      <div className="space-y-5">
        {withSignal.map((s) => (
          <div key={s.stage} className="border-t border-gray-100 pt-4 first:border-t-0 first:pt-0">
            <h3 className="text-sm font-semibold text-gray-800 mb-2">{s.stageLabel}</h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
              {s.askedAlways.length > 0 && (
                <div>
                  <div className="text-xs font-medium text-gray-500 mb-1">Asked nearly always</div>
                  <ul className="space-y-1 list-disc pl-5 text-gray-700">
                    {s.askedAlways.map((t, i) => <li key={i}>{t}</li>)}
                  </ul>
                </div>
              )}
              {s.youShineOn.length > 0 && (
                <div>
                  <div className="text-xs font-medium text-green-700 mb-1">You shine on</div>
                  <ul className="space-y-1 list-disc pl-5 text-gray-700">
                    {s.youShineOn.map((e, i) => (
                      <li key={i}>
                        {e.topic}
                        {e.evidence && <span className="text-xs text-gray-500"> — “{e.evidence}”</span>}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {s.youStumbleOn.length > 0 && (
                <div>
                  <div className="text-xs font-medium text-red-700 mb-1">You stumble on</div>
                  <ul className="space-y-1 list-disc pl-5 text-gray-700">
                    {s.youStumbleOn.map((e, i) => (
                      <li key={i}>
                        {e.topic}
                        {e.failureMode && (
                          <span className="ml-1 text-xs px-1.5 py-0.5 rounded bg-red-50 text-red-700 border border-red-100">
                            {e.failureMode}
                          </span>
                        )}
                        {e.evidence && <span className="text-xs text-gray-500"> — “{e.evidence}”</span>}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
            {(() => {
              const cs = s.communicationStyle || {};
              const rows = [
                ['Pacing', cs.pacing],
                ['Structure', cs.structure],
                ['Verbosity', cs.verbosity],
                ['Confidence', cs.confidence],
              ].filter(([, v]) => !!v) as [string, string][];
              if (!rows.length) return null;
              return (
                <div className="mt-3 grid grid-cols-2 md:grid-cols-4 gap-2 text-xs">
                  {rows.map(([k, v]) => (
                    <div key={k} className="bg-gray-50 rounded p-2 border border-gray-100">
                      <div className="font-semibold text-gray-700">{k}</div>
                      <div className="text-gray-600">{v}</div>
                    </div>
                  ))}
                </div>
              );
            })()}
          </div>
        ))}
      </div>
    </section>
  );
}

function RedFlagsCard({
  redFlags, uncertaintyTopics,
}: { redFlags: string[]; uncertaintyTopics: string[] }) {
  if (!redFlags.length && !uncertaintyTopics.length) return null;
  return (
    <section className="bg-white rounded-md border border-gray-100 shadow-sm p-5">
      <header className="flex items-center gap-2 mb-3">
        <Flame className="w-4 h-4 text-rose-600" />
        <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">Watch list</h2>
      </header>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {redFlags.length > 0 && (
          <div>
            <div className="text-xs font-medium text-rose-700 mb-1.5">Recurring red flags</div>
            <ul className="space-y-1 list-disc pl-5 text-sm text-gray-700">
              {redFlags.map((t, i) => <li key={i}>{t}</li>)}
            </ul>
          </div>
        )}
        {uncertaintyTopics.length > 0 && (
          <div>
            <div className="text-xs font-medium text-amber-700 mb-1.5">Uncertainty (from your AI follow-ups)</div>
            <ul className="space-y-1 list-disc pl-5 text-sm text-gray-700">
              {uncertaintyTopics.map((t, i) => <li key={i}>{t}</li>)}
            </ul>
          </div>
        )}
      </div>
    </section>
  );
}

// ---------- helpers ---------------------------------------------------------

type ChatMsg = { role: 'user' | 'assistant'; content: string };

function filterSig(args: { accountId: string; stage: string; from: string; to: string }) {
  return `analyze_chat_${args.accountId}_${args.stage}_${args.from}_${args.to}`;
}

function MdBlock({ text }: { text: string }) {
  const html = marked.parse(text || '', { async: false }) as string;
  return <div className="prose prose-sm max-w-none" dangerouslySetInnerHTML={{ __html: html }} />;
}

function FollowUpChat({
  result, filterContext, accountId, stage, from, to,
}: {
  result: InterviewAnalyzeResult;
  filterContext: Record<string, unknown>;
  accountId: string; stage: string; from: string; to: string;
}) {
  const sigKey = useMemo(() => filterSig({ accountId, stage, from, to }), [accountId, stage, from, to]);
  const [chat, setChat] = useState<ChatMsg[]>(() => {
    try {
      const raw = localStorage.getItem(sigKey);
      return raw ? (JSON.parse(raw) as ChatMsg[]) : [];
    } catch { return []; }
  });
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const endRef = useRef<HTMLDivElement | null>(null);

  // Reset on filter change
  useEffect(() => {
    try {
      const raw = localStorage.getItem(sigKey);
      setChat(raw ? (JSON.parse(raw) as ChatMsg[]) : []);
    } catch { setChat([]); }
  }, [sigKey]);

  // Persist
  useEffect(() => {
    try {
      if (chat.length === 0) localStorage.removeItem(sigKey);
      else localStorage.setItem(sigKey, JSON.stringify(chat));
    } catch { /* ignore */ }
  }, [chat, sigKey]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chat, loading]);

  const presets = useMemo(() => buildPresets(result), [result]);

  const send = async (text: string) => {
    const q = text.trim();
    if (!q || loading) return;
    const next: ChatMsg[] = [...chat, { role: 'user', content: q }];
    setChat(next);
    setInput('');
    setLoading(true);
    try {
      const res = await api.analyzeChat({
        accountId: accountId || undefined,
        stages: stage ? [stage] : undefined,
        fromDate: from || undefined,
        toDate: to || undefined,
        filterContext,
        result: result as unknown as Record<string, unknown>,
        messages: next,
      });
      setChat([...next, { role: 'assistant', content: res.reply }]);
    } catch (err) {
      notify.error(err, 'Follow-up failed');
      setChat(next.slice(0, -1));
      setInput(q);
    } finally {
      setLoading(false);
    }
  };

  const clear = () => {
    if (!chat.length) return;
    if (!window.confirm('Clear this follow-up conversation?')) return;
    setChat([]);
    setInput('');
  };

  return (
    <section className="bg-white rounded-md border border-gray-100 shadow-sm p-5">
      <header className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-primary" />
          <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">Follow up</h2>
        </div>
        <button
          type="button"
          className="btn px-2 py-1 text-xs"
          onClick={clear}
          disabled={loading || !chat.length}
          title="Clear conversation"
        >
          <Trash2 size={12} className="mr-1" /> Clear
        </button>
      </header>

      {chat.length === 0 && (
        <p className="text-xs text-gray-500 mb-3">
          Ask anything about your analysis — drill blind spots, expand drills, draft a pitch, plan a week of prep.
        </p>
      )}

      {chat.length > 0 && (
        <div className="space-y-3 mb-3 max-h-[420px] overflow-y-auto pr-1">
          {chat.map((m, i) => (
            <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              <div
                className={`max-w-[85%] rounded-lg px-3 py-2 text-sm ${
                  m.role === 'user'
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-50 border border-gray-200 text-gray-800'
                }`}
              >
                {m.role === 'assistant' ? <MdBlock text={m.content} /> : m.content}
              </div>
            </div>
          ))}
          {loading && (
            <div className="flex justify-start">
              <div className="bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-500">
                <span className="inline-flex gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-gray-400 animate-pulse" />
                  <span className="w-1.5 h-1.5 rounded-full bg-gray-400 animate-pulse" style={{ animationDelay: '120ms' }} />
                  <span className="w-1.5 h-1.5 rounded-full bg-gray-400 animate-pulse" style={{ animationDelay: '240ms' }} />
                </span>
              </div>
            </div>
          )}
          <div ref={endRef} />
        </div>
      )}

      {chat.length <= 1 && presets.length > 0 && (
        <div className="flex flex-wrap gap-2 mb-3">
          {presets.map((p) => (
            <button
              key={p}
              type="button"
              className="text-xs border border-gray-200 rounded-full px-3 py-1 text-gray-700 hover:bg-gray-50"
              onClick={() => setInput(p)}
              disabled={loading}
            >
              {p}
            </button>
          ))}
        </div>
      )}

      <div className="flex items-end gap-2">
        <textarea
          className="input flex-1 resize-none text-sm"
          rows={2}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
              e.preventDefault();
              send(input);
            }
          }}
          placeholder="Ask a follow-up… (Cmd/Ctrl+Enter to send)"
          disabled={loading}
        />
        <button
          type="button"
          className="btn"
          onClick={() => send(input)}
          disabled={!input.trim() || loading}
          title="Send (Cmd/Ctrl+Enter)"
        >
          <Send size={14} className="mr-1" /> Send
        </button>
      </div>
    </section>
  );
}

function buildPresets(r: InterviewAnalyzeResult): string[] {
  const out: string[] = [];
  if (r.blindSpots[0]) out.push(`Drill into blind spot: ${r.blindSpots[0]}`);
  const weakStage = [...r.stages].sort((a, b) => a.overallScore - b.overallScore)[0];
  if (weakStage) out.push(`Build a 1-week prep plan for my ${weakStage.stageLabel} stage`);
  if (r.styleProfile) out.push('Rewrite my style profile as a 30-second elevator pitch');
  if (r.howToShine[0]) out.push(`How do I actually pull off: "${r.howToShine[0].move}"?`);
  out.push('What would push me from borderline to strong hire?');
  return out.slice(0, 5);
}

function scoreColor(n: number): string {
  if (n >= 8) return 'bg-green-500';
  if (n >= 6) return 'bg-blue-500';
  if (n >= 4) return 'bg-amber-500';
  return 'bg-red-500';
}

function scoreTextColor(n: number): string {
  if (n >= 8) return 'text-green-700';
  if (n >= 6) return 'text-blue-700';
  if (n >= 4) return 'text-amber-700';
  return 'text-red-700';
}
