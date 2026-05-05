import { apiFetch, BASE_URL, getToken } from './client';

// ---------- shared types ----------

export interface User {
  id: string;
  name: string | null;
  email: string | null;
  role: 'admin' | 'staff' | 'accountant';
  image?: string | null;
}

export interface LoginResponse {
  access_token: string;
  token_type: 'bearer';
  user: User;
}

export interface Pagination {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
  hasNext?: boolean;
  hasPrev?: boolean;
}

export interface ProfileShape {
  username: string;
  email: string;
  image: string;
  birthday: string | null;
}

export interface TransactionListParams {
  page?: number;
  limit?: number;
  from?: string;
  to?: string;
  userId?: string;
  search?: string;
  fromSearch?: string;
  toSearch?: string;
  userSearch?: string;
}

export interface TransactionSummary {
  monthly: { period: string; total: number; year: number }[];
  stats: {
    totalAmount: number;
    totalCount: number;
    avgAmount: number;
    minAmount: number;
    maxAmount: number;
  };
  statusBreakdown: Record<string, { count: number; total: number }>;
}

// ---------- helpers ----------

function qs(params?: object): string {
  if (!params) return '';
  const entries = Object.entries(params).filter(
    ([, v]) => v !== undefined && v !== null && v !== ''
  );
  if (entries.length === 0) return '';
  const enc = (s: string) => encodeURIComponent(s);
  return '?' + entries.map(([k, v]) => `${enc(k)}=${enc(String(v))}`).join('&');
}

function postJSON<T>(path: string, body: unknown) {
  return apiFetch<T>(path, { method: 'POST', body: JSON.stringify(body) });
}

function putJSON<T>(path: string, body: unknown) {
  return apiFetch<T>(path, { method: 'PUT', body: JSON.stringify(body) });
}

function del<T>(path: string) {
  return apiFetch<T>(path, { method: 'DELETE' });
}

// ---------- auth ----------

export const login = (body: { username: string; password: string }) =>
  postJSON<LoginResponse>('/auth/login', body);

export const register = (body: { username: string; email: string; password: string }) =>
  postJSON<{ ok: boolean }>('/auth/register', body);

export const me = () => apiFetch<User>('/auth/me');

// ---------- profile ----------

export const getProfile = () => apiFetch<{ user: ProfileShape }>('/profile');

export const updateProfile = (body: {
  username: string;
  email: string;
  image?: string;
  birthday?: string;
}) => putJSON<{ message: string; user: ProfileShape }>('/profile', body);

export const changePassword = (body: { currentPassword: string; newPassword: string }) =>
  putJSON<{ message: string }>('/profile/password', body);

// ---------- users (admin) ----------

export const listUsers = (params?: {
  search?: string;
  role?: string;
  status?: string;
  page?: number;
  limit?: number;
}) =>
  apiFetch<{ users: Record<string, unknown>[]; pagination: Pagination }>(
    `/users${qs(params)}`
  );

export const createUser = (body: Record<string, unknown>) =>
  postJSON<Record<string, unknown>>('/users', body);

export const updateUser = (id: string, body: Record<string, unknown>) =>
  putJSON<Record<string, unknown>>(`/users/${id}`, body);

export const deleteUser = (id: string) => del<{ ok: boolean }>(`/users/${id}`);

export const approveUser = (id: string) =>
  postJSON<Record<string, unknown>>(`/users/${id}/approve`, {});

// ---------- accounts ----------

export const listAccounts = (params?: {
  page?: number;
  limit?: number;
  search?: string;
  userId?: string;
}) =>
  apiFetch<{ accounts: Record<string, unknown>[]; pagination: Pagination }>(
    `/accounts${qs(params)}`
  );

export const getAccount = (id: string) =>
  apiFetch<Record<string, unknown>>(`/accounts/${id}`);

export const createAccount = (body: Record<string, unknown>) =>
  postJSON<Record<string, unknown>>('/accounts', body);

export const updateAccount = (id: string, body: Record<string, unknown>) =>
  putJSON<Record<string, unknown>>(`/accounts/${id}`, body);

export const deleteAccount = (id: string) => del<{ ok: boolean }>(`/accounts/${id}`);

// ---------- transactions ----------

export const listTransactions = (params?: TransactionListParams) =>
  apiFetch<{ transactions: Record<string, unknown>[]; pagination: Pagination }>(
    `/transactions${qs(params)}`
  );

export const createTransaction = (body: Record<string, unknown>) =>
  postJSON<Record<string, unknown>>('/transactions', body);

export const updateTransaction = (id: string, body: Record<string, unknown>) =>
  putJSON<Record<string, unknown>>(`/transactions/${id}`, body);

export const deleteTransaction = (id: string) => del<{ ok: boolean }>(`/transactions/${id}`);

export const transactionSummary = (params?: { userId?: string; year?: number }) =>
  apiFetch<TransactionSummary>(`/transactions/summary${qs(params)}`);

// ---------- cardlinks ----------

export const listCardlinks = (params?: TransactionListParams) =>
  apiFetch<{ cardlinks: Record<string, unknown>[]; pagination: Pagination }>(
    `/cardlinks${qs(params)}`
  );

export const createCardlink = (body: Record<string, unknown>) =>
  postJSON<Record<string, unknown>>('/cardlinks', body);

export const updateCardlink = (id: string, body: Record<string, unknown>) =>
  putJSON<Record<string, unknown>>(`/cardlinks/${id}`, body);

export const deleteCardlink = (id: string) => del<{ ok: boolean }>(`/cardlinks/${id}`);

// ---------- weekly plans ----------

export const listWeeklyPlans = (params?: {
  page?: number;
  limit?: number;
  year?: number;
  weekNumber?: number;
  userId?: string;
}) =>
  apiFetch<{ plans: Record<string, unknown>[]; pagination: Pagination }>(
    `/weekly-plans${qs(params)}`
  );

export const getWeeklyPlan = (id: string) =>
  apiFetch<Record<string, unknown>>(`/weekly-plans/${id}`);

export const createWeeklyPlan = (body: Record<string, unknown>) =>
  postJSON<Record<string, unknown>>('/weekly-plans', body);

export const updateWeeklyPlan = (id: string, body: Record<string, unknown>) =>
  putJSON<Record<string, unknown>>(`/weekly-plans/${id}`, body);

export const deleteWeeklyPlan = (id: string) => del<{ message: string }>(`/weekly-plans/${id}`);

// ---------- accounts lookup (filter dropdowns) ----------

export interface AccountLookup {
  _id: string;
  name: string;
  email: string;
  label?: string | null;
  hasExperience?: boolean;
  createdBy?: string;
}

export const lookupAccounts = () =>
  apiFetch<{ accounts: AccountLookup[] }>('/accounts/lookup');

// ---------- users lookup (filter dropdowns; available to all authed users) ----------

export const lookupUsers = () =>
  apiFetch<{ users: { _id: string; name: string | null; email: string | null }[] }>('/users/lookup');

// ---------- interviews ----------

export interface InterviewListParams {
  page?: number;
  limit?: number;
  from?: string;
  to?: string;
  accountId?: string;
  stage?: string;
  status?: string;
  creatorId?: string;
  sort?: 'asc' | 'desc';
}

export const listInterviews = (params?: InterviewListParams) =>
  apiFetch<{ interviews: Record<string, unknown>[]; pagination: Pagination }>(
    `/interviews${qs(params)}`
  );

export const getInterview = (id: string) =>
  apiFetch<Record<string, unknown>>(`/interviews/${id}`);

export interface AiInterviewChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface AiInterviewChatResponse {
  reply: string;
  model: string;
  promptTokens: number;
  completionTokens: number;
}

export const interviewChat = (
  interviewId: string,
  body: { messages: AiInterviewChatMessage[]; rubric?: boolean },
) =>
  postJSON<AiInterviewChatResponse>(`/ai-review/interview/${interviewId}/chat`, body);

export const createInterview = (body: Record<string, unknown>) =>
  postJSON<Record<string, unknown>>('/interviews', body);

export const updateInterview = (id: string, body: Record<string, unknown>) =>
  putJSON<Record<string, unknown>>(`/interviews/${id}`, body);

export const deleteInterview = (id: string) => del<{ ok: boolean }>(`/interviews/${id}`);

// ---------- skills (admin CRUD; list available to any auth user) ----------

export interface Skill {
  _id: string;
  title: string;
  minInterviews: number;
  maxInterviews: number;
  systemPrompt: string;
  createdBy: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface SkillInput {
  title: string;
  minInterviews: number;
  maxInterviews: number;
  systemPrompt: string;
}

export const listSkills = () => apiFetch<{ skills: Skill[] }>('/skills');

export const createSkill = (body: SkillInput) => postJSON<Skill>('/skills', body);

export const updateSkill = (id: string, body: Partial<SkillInput>) =>
  apiFetch<Skill>(`/skills/${id}`, { method: 'PATCH', body: JSON.stringify(body) });

export const deleteSkill = (id: string) => del<{ ok: boolean }>(`/skills/${id}`);

// ---------- global prompt (admin edits; any auth user reads) ----------

export interface GlobalPrompt {
  _id: string;
  key: string;
  systemPrompt: string;
  createdAt?: string;
  updatedAt?: string;
}

export const getGlobalPrompt = () => apiFetch<GlobalPrompt>('/global-prompt');

export const updateGlobalPrompt = (systemPrompt: string) =>
  putJSON<GlobalPrompt>('/global-prompt', { systemPrompt });

// ---------- AI review runs ----------

export interface AiReviewRun {
  _id: string;
  interviewIds: string[];
  skillId?: string | null;
  customPrompt?: string | null;
  output: string;
  model: string;
  promptTokens: number;
  completionTokens: number;
  ranBy: string;
  createdAt?: string;
  updatedAt?: string;
}

export const listAiReviewRuns = (limit = 50) =>
  apiFetch<{ runs: AiReviewRun[] }>(`/ai-review/runs${qs({ limit })}`);

export const getAiReviewRun = (id: string) =>
  apiFetch<AiReviewRun>(`/ai-review/runs/${id}`);

// ---------- AI review SSE stream ----------

export interface StreamAiReviewOpts {
  interviewIds: string[];
  skillId?: string;
  customPrompt?: string;
  onDelta: (text: string) => void;
  onDone: (runId: string) => void;
  onError: (err: { message: string; status?: number }) => void;
}

/**
 * Open an SSE connection to /ai-review/stream. Token is passed via query
 * string because the browser EventSource API cannot set Authorization headers.
 * Returns the EventSource so callers can `.close()` it on unmount/abort.
 */
export function streamAiReview(opts: StreamAiReviewOpts): EventSource {
  const token = getToken();
  if (!token) {
    opts.onError({ message: 'Not authenticated' });
    // Return a closed EventSource-like stub so the caller's close() is safe.
    return new EventSource('about:blank');
  }
  const params = new URLSearchParams();
  for (const id of opts.interviewIds) params.append('interviewIds', id);
  if (opts.skillId) params.set('skillId', opts.skillId);
  if (opts.customPrompt) params.set('customPrompt', opts.customPrompt);
  params.set('token', token);

  const es = new EventSource(`${BASE_URL}/ai-review/stream?${params.toString()}`);

  es.onmessage = (ev) => {
    try {
      const payload = JSON.parse(ev.data);
      if (typeof payload.delta === 'string') opts.onDelta(payload.delta);
    } catch {
      // ignore non-JSON keepalives
    }
  };
  es.addEventListener('done', (ev) => {
    try {
      const payload = JSON.parse((ev as MessageEvent).data);
      opts.onDone(payload.runId);
    } catch {
      opts.onDone('');
    } finally {
      es.close();
    }
  });
  es.addEventListener('error', (ev) => {
    try {
      const payload = JSON.parse((ev as MessageEvent).data);
      opts.onError({ message: payload.message || 'Stream error' });
    } catch {
      // EventSource fires a generic error event without data on connection drop;
      // surface a message and close to disable auto-reconnect.
      opts.onError({ message: 'Connection lost' });
    } finally {
      es.close();
    }
  });

  return es;
}

// ---------- resume ----------

export interface ResumeApplication {
  _id: string;
  userId: string;
  accountId: string;
  companyName: string;
  jobDescription: string;
  s3Key?: string | null;
  s3Url?: string | null;
  createdAt: string;
}

export interface ScreeningPair {
  question: string;
  answer: string;
}

export function generateScreeningAnswers(body: {
  accountId: string;
  jobDescription?: string;
  questions: string[];
  guidelines?: string;
  guidelinesMode?: 'markdown' | 'plaintext';
  saveGuidelines?: boolean;
  useGeneratedResumeContext?: boolean;
}) {
  return postJSON<{ pairs: ScreeningPair[] }>('/resume/screening-answers', body);
}

export function refreshPreviewHtml(accountId: string, jobDescription?: string) {
  return postJSON<{ html: string }>('/resume/preview-html', {
    accountId,
    ...(jobDescription ? { jobDescription } : {}),
  });
}

export function listResumeHistory(accountId?: string) {
  return apiFetch<{ applications: ResumeApplication[] }>(
    `/resume/history${qs({ accountId })}`
  );
}

// ---------- async resume jobs ----------

export type ResumeJobStatus = 'queued' | 'in_progress' | 'completed' | 'failed';
export type ResumeJobStep =
  | 'queued'
  | 'generating_resume'
  | 'rendering_pdf'
  | 'uploading'
  | 'generating_answers'
  | 'done';

export interface ResumeJob {
  _id: string;
  userId: string;
  accountId: string;
  profileName: string;
  companyName: string;
  jobUrl?: string | null;
  status: ResumeJobStatus;
  step: ResumeJobStep;
  pdfFilename?: string | null;
  s3Url?: string | null;
  errorMessage?: string | null;
  executionMs?: number | null;
  hasPdf?: boolean;
  screeningQuestions: string[];
  screeningPairs: ScreeningPair[];
  createdAt?: string | null;
  startedAt?: string | null;
  completedAt?: string | null;
}

export function enqueueResumeJob(body: {
  accountId: string;
  company: string;
  jobDescription: string;
  jobUrl?: string;
  questions?: string[];
  guidelines?: string;
  guidelinesMode?: 'markdown' | 'plaintext';
}) {
  return postJSON<{ jobId: string; status: ResumeJobStatus }>('/resume/generate', body);
}

export function listResumeJobs(params?: {
  accountId?: string;
  page?: number;
  limit?: number;
}) {
  return apiFetch<{ jobs: ResumeJob[]; pagination: Pagination }>(
    `/resume/jobs${qs(params)}`
  );
}

export function deleteResumeJob(id: string) {
  return del<{ ok: boolean }>(`/resume/jobs/${id}`);
}

/** Trigger a browser download for a completed job's PDF.
 *  Backend returns either {url, filename} (S3 presigned) or raw PDF bytes
 *  (legacy inline). For S3 path we use anchor click — bypasses CORS and
 *  lets S3 serve the file directly to the browser. */
export async function downloadResumeJob(job: ResumeJob): Promise<void> {
  const token = getToken();
  const headers: Record<string, string> = {};
  if (token) headers.Authorization = `Bearer ${token}`;

  const res = await fetch(`${BASE_URL}/resume/jobs/${job._id}/download`, { headers });
  if (!res.ok) {
    let message = `HTTP ${res.status}`;
    try {
      const data = await res.json();
      message = data.error || data.detail || message;
    } catch { /* ignore */ }
    throw new Error(message);
  }

  const ct = res.headers.get('Content-Type') || '';
  if (ct.includes('application/json')) {
    const data = (await res.json()) as { url: string; filename?: string };
    const a = document.createElement('a');
    a.href = data.url;
    if (data.filename) a.download = data.filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    return;
  }

  // Legacy: inline bytes
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = (job.pdfFilename || `resume_${job.companyName}.pdf`).split('/').pop()!;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
