import { useMemo, useState } from 'react';
import useSWR from 'swr';
import { Loader2, Sparkles, AlertTriangle, TrendingUp, Lightbulb, BarChart3 } from 'lucide-react';
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
      ...own.map((a) => ({ value: a._id, label: `${a.name}${a.label ? ` — ${a.label}` : ''}` })),
    ];
  }, [accountsData, user?.id]);

  const [accountId, setAccountId] = useState('');
  const [stage, setStage] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');

  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<InterviewAnalyzeResult | null>(null);
  const [meta, setMeta] = useState<{ interviewCount: number; transcriptCount: number } | null>(null);

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
          disabled={running}
          title="Run analysis"
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
          <StageScoreboard stages={result.stages} />
          <TopQuestions stages={result.stages} />
          <WeakSpots weakSpots={result.weakSpots} />
          <PrepTips stages={result.stages} overall={result.overallTips} />
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
              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border bg-gray-100 text-gray-700 border-gray-200">
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
  const stagesWithTips = stages.filter((s) => s.tips.length > 0);
  if (!stagesWithTips.length && !overall.length) return null;
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
      <div className="space-y-3">
        {stagesWithTips.map((s) => (
          <div key={s.stage}>
            <h3 className="text-xs font-semibold text-gray-700 mb-2">{s.stageLabel}</h3>
            {s.strengths.length > 0 && (
              <p className="text-xs text-green-700 mb-1">
                <strong>Strengths:</strong> {s.strengths.join(', ')}
              </p>
            )}
            {s.weaknesses.length > 0 && (
              <p className="text-xs text-red-700 mb-2">
                <strong>Watch out:</strong> {s.weaknesses.join(', ')}
              </p>
            )}
            <ul className="space-y-1 list-disc pl-5 text-sm text-gray-700">
              {s.tips.map((t, i) => (
                <li key={i}>{t}</li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </section>
  );
}

// ---------- helpers ---------------------------------------------------------

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
