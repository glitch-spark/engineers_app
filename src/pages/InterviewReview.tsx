import { useEffect, useRef, useState } from 'react';
import useSWR from 'swr';
import { Link, useParams } from 'react-router-dom';
import { marked } from 'marked';
import { ArrowLeft, RefreshCw, Send, Sparkles, Trash2 } from 'lucide-react';
import * as api from '../api/endpoints';
import { notify } from '../lib/notify';

type ChatMsg = { role: 'user' | 'assistant'; content: string };

const storageKey = (id: string) => `interview_review_${id}`;

type Persisted = { brief: string; chat: ChatMsg[]; includeRubric: boolean };

function loadPersisted(id: string): Persisted | null {
  try {
    const raw = localStorage.getItem(storageKey(id));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Persisted;
    if (typeof parsed?.brief !== 'string' || !Array.isArray(parsed.chat)) return null;
    return parsed;
  } catch {
    return null;
  }
}

function savePersisted(id: string, value: Persisted) {
  try {
    localStorage.setItem(storageKey(id), JSON.stringify(value));
  } catch {
    /* quota / disabled — ignore */
  }
}

function clearPersisted(id: string) {
  try {
    localStorage.removeItem(storageKey(id));
  } catch {
    /* ignore */
  }
}

const reviewStyles = `
  .review-md { font-size: 14px; line-height: 1.6; }
  .review-md h1, .review-md h2, .review-md h3 { font-weight: 600; margin: 0.75em 0 0.35em; }
  .review-md h1 { font-size: 1.25em; } .review-md h2 { font-size: 1.15em; } .review-md h3 { font-size: 1.05em; }
  .review-md p { margin: 0 0 0.6em 0; }
  .review-md ul, .review-md ol { margin: 0 0 0.6em 0; padding-left: 1.4em; }
  .review-md li { margin-bottom: 0.2em; }
  .review-md table { border-collapse: collapse; margin: 0.5em 0; font-size: 13px; }
  .review-md th, .review-md td { border: 1px solid #e5e7eb; padding: 0.35em 0.6em; text-align: left; }
  .review-md th { background: #f9fafb; }
  .review-md code { background: #f3f4f6; padding: 0.1em 0.35em; border-radius: 3px; font-size: 0.9em; }
  .review-md blockquote { border-left: 3px solid #d1d5db; padding-left: 0.75em; color: #4b5563; margin: 0.5em 0; }
  .review-md a { color: #2563eb; text-decoration: underline; }
`;

function MdBlock({ text }: { text: string }) {
  const html = marked.parse(text || '', { async: false }) as string;
  return <div className="review-md" dangerouslySetInnerHTML={{ __html: html }} />;
}

export default function InterviewReviewPage() {
  const { id } = useParams<{ id: string }>();
  const { data: interviewData } = useSWR(
    id ? ['interview', id] as const : null,
    () => api.getInterview(id!),
  );

  const initial = id ? loadPersisted(id) : null;
  const [brief, setBrief] = useState<string>(initial?.brief ?? '');
  const [briefLoading, setBriefLoading] = useState(false);
  const [briefError, setBriefError] = useState<string>('');
  const [includeRubric, setIncludeRubric] = useState(initial?.includeRubric ?? true);

  const [chat, setChat] = useState<ChatMsg[]>(initial?.chat ?? []);
  const [input, setInput] = useState('');
  const [chatLoading, setChatLoading] = useState(false);
  const [clearing, setClearing] = useState(false);

  const chatEndRef = useRef<HTMLDivElement | null>(null);

  // Persist locally so navigating away doesn't drop the conversation.
  useEffect(() => {
    if (!id) return;
    if (!brief && chat.length === 0) return;
    savePersisted(id, { brief, chat, includeRubric });
  }, [id, brief, chat, includeRubric]);

  // Hydrate follow-up history from DB on first mount (replaces local cache if
  // server has a record). Initial brief is skipped server-side, so it remains
  // local-only — re-run the brief if the user lands without one.
  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await api.interviewChatHistory(id, 100);
        if (cancelled) return;
        const logs = res.logs ?? [];
        if (logs.length === 0) return;
        const turns: ChatMsg[] = [];
        for (const log of logs) {
          turns.push({ role: 'user', content: log.question });
          if (log.answer) turns.push({ role: 'assistant', content: log.answer });
        }
        setChat((prev) => {
          // Merge: keep the initial assistant brief if it exists, then append
          // server turns (skip duplicates by content match).
          const head = prev[0]?.role === 'assistant' ? [prev[0]] : [];
          const seen = new Set(head.map((m) => `${m.role}:${m.content}`));
          const merged = [...head];
          for (const t of turns) {
            const key = `${t.role}:${t.content}`;
            if (seen.has(key)) continue;
            seen.add(key);
            merged.push(t);
          }
          return merged;
        });
      } catch {
        /* non-fatal — local state still works */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [id]);

  const runBrief = async () => {
    if (!id) return;
    setBriefLoading(true);
    setBriefError('');
    try {
      const res = await api.interviewChat(id, { messages: [], rubric: includeRubric });
      setBrief(res.reply);
      setChat([{ role: 'assistant', content: res.reply }]);
    } catch (err) {
      setBriefError(err instanceof Error ? err.message : 'Failed to generate review');
      notify.error(err, 'Failed to generate review');
    } finally {
      setBriefLoading(false);
    }
  };

  useEffect(() => {
    if (id && !brief && !briefLoading && (initial?.brief ?? '') === '') {
      runBrief();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const clearHistory = async () => {
    if (!id) return;
    if (!window.confirm('Clear this AI Review and all follow-ups? This cannot be undone.')) return;
    setClearing(true);
    try {
      await api.clearInterviewChatHistory(id);
    } catch (err) {
      notify.error(err, 'Failed to clear history');
    } finally {
      clearPersisted(id);
      setBrief('');
      setBriefError('');
      setChat([]);
      setInput('');
      setClearing(false);
    }
  };

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chat, chatLoading]);

  const sendFollowUp = async () => {
    if (!id) return;
    const text = input.trim();
    if (!text || chatLoading) return;
    const next: ChatMsg[] = [...chat, { role: 'user', content: text }];
    setChat(next);
    setInput('');
    setChatLoading(true);
    try {
      const res = await api.interviewChat(id, { messages: next, rubric: false });
      setChat([...next, { role: 'assistant', content: res.reply }]);
    } catch (err) {
      notify.error(err, 'Follow-up failed');
      setChat(next.slice(0, -1));
      setInput(text);
    } finally {
      setChatLoading(false);
    }
  };

  const copyBrief = async () => {
    if (!brief) return;
    await navigator.clipboard.writeText(brief);
    notify.success('Brief review copied');
  };

  const presetQuestions = [
    'What 3 follow-up questions should the next round ask?',
    'Score this candidate against a senior engineer bar.',
    'Draft a hiring-manager debrief email summarizing the round.',
    'What are the strongest and weakest moments in the transcript?',
  ];

  if (!id) return <div className="p-6 text-gray-500">Missing interview id.</div>;

  const iv = interviewData as Record<string, unknown> | undefined;
  const headerTitle = (iv?.companyName as string) || (iv?.appliedPosition as string) || 'Interview';
  const stage = iv?.stage as string | undefined;
  const interviewer = iv?.interviewerName as string | undefined;

  return (
    <div className="space-y-5">
      <style>{reviewStyles}</style>

      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <Link to={`/interviews/${id}`} className="btn" title="Back to Interview">
            <ArrowLeft size={16} />
          </Link>
          <div>
            <h1 className="page-title flex items-center gap-2">
              <Sparkles size={20} /> AI Review
            </h1>
            <div className="text-sm text-gray-500">
              {headerTitle}
              {stage ? ` · ${stage}` : ''}
              {interviewer ? ` · w/ ${interviewer}` : ''}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <label className="text-xs text-gray-600 inline-flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={includeRubric}
              onChange={(e) => setIncludeRubric(e.target.checked)}
            />
            Include rubric
          </label>
          <button type="button" className="btn" onClick={runBrief} disabled={briefLoading}>
            <RefreshCw size={16} className={`mr-1 ${briefLoading ? 'animate-spin' : ''}`} />
            {brief ? 'Regenerate' : 'Generate'}
          </button>
          <button type="button" className="btn" onClick={copyBrief} disabled={!brief}>Copy</button>
          <button
            type="button"
            className="btn"
            onClick={clearHistory}
            disabled={clearing || briefLoading || chatLoading || (!brief && chat.length === 0)}
            title="Clear review and follow-up history"
          >
            <Trash2 size={16} className="mr-1" /> Clear
          </button>
        </div>
      </div>

      {/* Brief review panel */}
      <div className="card p-5">
        <div className="text-xs text-gray-500 uppercase tracking-wide mb-2">Brief Review</div>
        {briefLoading && !brief ? (
          <div className="flex items-center text-gray-500 py-4">
            <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-blue-600 mr-3"></div>
            Reading transcript and generating review…
          </div>
        ) : briefError ? (
          <div className="text-red-600 text-sm">{briefError}</div>
        ) : brief ? (
          <MdBlock text={brief} />
        ) : (
          <div className="text-gray-400 text-sm italic">No review yet.</div>
        )}
      </div>

      {/* Chat */}
      <div className="card p-0 overflow-hidden">
        <div className="px-5 py-3 border-b border-gray-100 flex items-center justify-between">
          <div className="text-sm font-medium">Follow-ups</div>
          <div className="text-xs text-gray-500">{chat.length} message{chat.length !== 1 ? 's' : ''}</div>
        </div>

        <div className="px-5 py-4 max-h-[480px] overflow-y-auto space-y-4">
          {chat.length === 0 && !chatLoading && (
            <div className="text-sm text-gray-500">Ask a follow-up question about this interview.</div>
          )}
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
          {chatLoading && (
            <div className="flex justify-start">
              <div className="bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-500">
                <span className="inline-flex gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-gray-400 animate-pulse"></span>
                  <span className="w-1.5 h-1.5 rounded-full bg-gray-400 animate-pulse" style={{ animationDelay: '120ms' }}></span>
                  <span className="w-1.5 h-1.5 rounded-full bg-gray-400 animate-pulse" style={{ animationDelay: '240ms' }}></span>
                </span>
              </div>
            </div>
          )}
          <div ref={chatEndRef} />
        </div>

        {/* Preset suggestions */}
        {brief && chat.length <= 1 && !chatLoading && (
          <div className="px-5 pb-3 flex flex-wrap gap-2">
            {presetQuestions.map((q) => (
              <button
                key={q}
                type="button"
                className="text-xs border border-gray-200 rounded-full px-3 py-1 text-gray-700 hover:bg-gray-50"
                onClick={() => setInput(q)}
              >
                {q}
              </button>
            ))}
          </div>
        )}

        {/* Composer */}
        <div className="border-t border-gray-100 p-3 flex items-end gap-2">
          <textarea
            className="input flex-1 resize-none"
            rows={2}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                e.preventDefault();
                sendFollowUp();
              }
            }}
            placeholder="Ask a follow-up… (Cmd/Ctrl+Enter to send)"
            disabled={chatLoading || briefLoading}
          />
          <button
            type="button"
            className="btn"
            onClick={sendFollowUp}
            disabled={!input.trim() || chatLoading || briefLoading}
            title="Send (Cmd/Ctrl+Enter)"
          >
            <Send size={16} className="mr-1" /> Send
          </button>
        </div>
      </div>
    </div>
  );
}
