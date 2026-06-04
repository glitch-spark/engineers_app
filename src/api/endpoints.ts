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
  leaderboardOptIn?: boolean;
  leaderboardName?: string;
  leaderboardAnon?: boolean;
  resumePromptBody?: string;
  screeningPromptBody?: string;
  coverLetterPromptBody?: string;
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
  payMethod?: 'coin' | 'card' | '';
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
  leaderboardOptIn?: boolean;
  leaderboardName?: string;
  leaderboardAnon?: boolean;
  resumePromptBody?: string;
  screeningPromptBody?: string;
  coverLetterPromptBody?: string;
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

export interface WeeklyMetricCatalogItem { key: string; label: string }

export const getWeeklyMetricCatalog = () =>
  apiFetch<{ metrics: WeeklyMetricCatalogItem[] }>('/weekly-plans/metric-catalog');

export interface WeeklyPlanSummary {
  series: Array<Record<string, unknown>>;
  totals: Array<{ key: string; label: string; target: number; actual: number }>;
  planCount: number;
  reviewedCount: number;
  completionRate: number;
}

export const getWeeklyPlanSummary = (params?: { year?: number; weekNumber?: number; userId?: string }) =>
  apiFetch<WeeklyPlanSummary>(`/weekly-plans/summary${qs(params)}`);

export const runWeeklyProgressReport = (params?: { year?: number; weekNumber?: number; userId?: string }) =>
  postJSON<{ processed: number; skipped: number; plans: Record<string, unknown>[] }>(
    `/weekly-plans/progress-report${qs(params)}`,
    {},
  );

export interface WeeklyUserRollup {
  userId: string;
  name: string;
  email: string;
  planCount: number;
  reviewedCount: number;
  metrics: Array<{ key: string; label: string; target: number; actual: number }>;
}

export const getWeeklyUserRollup = (params?: { year?: number; weekNumber?: number; userId?: string }) =>
  apiFetch<{ users: WeeklyUserRollup[] }>(`/weekly-plans/user-rollup${qs(params)}`);

export const askResumeJobScreening = (jobId: string, questions: string[]) =>
  postJSON<{ pairs: { question: string; answer: string }[] }>(`/resume/jobs/${jobId}/ask`, { questions });

// ---------- accounts lookup (filter dropdowns) ----------

export interface AccountLookup {
  _id: string;
  name: string;
  hasTemplate?: boolean;
  hasPrompt?: boolean;
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

export interface InterviewChatLog {
  _id: string;
  interviewId: string;
  userId: string;
  question: string;
  answer: string;
  model?: string;
  rubric?: boolean;
  createdAt: string;
}

export const interviewChatHistory = (interviewId: string, limit = 100) =>
  apiFetch<{ logs: InterviewChatLog[] }>(
    `/ai-review/interview/${interviewId}/chat/history?limit=${limit}`,
  );

export const clearInterviewChatHistory = (interviewId: string) =>
  del<{ deleted: number }>(`/ai-review/interview/${interviewId}/chat/history`);

export const createInterview = (body: Record<string, unknown>) =>
  postJSON<Record<string, unknown>>('/interviews', body);

export const updateInterview = (id: string, body: Record<string, unknown>) =>
  putJSON<Record<string, unknown>>(`/interviews/${id}`, body);

export const deleteInterview = (id: string) => del<{ ok: boolean }>(`/interviews/${id}`);

// ---------- dashboard metrics ----------

export interface DashboardKpiTotals {
  income: number;
  bids: number;
  interviews: number;
  bidToInterview: number;
}

export interface DashboardSeriesPoint {
  bucketStart: string;
  income: number;
  bids: number;
  interviews: number;
  rate: number;
}

export interface DashboardMetrics {
  window: { from: string; to: string };
  previousWindow: { from: string; to: string };
  bucket: 'day' | 'week' | 'month';
  totals: DashboardKpiTotals;
  previousTotals: DashboardKpiTotals;
  series: DashboardSeriesPoint[];
}

export const getDashboardMetrics = (params: {
  range?: number;
  bucket?: 'day' | 'week' | 'month';
  from?: string;
  to?: string;
  includeSeries?: boolean;
}) => apiFetch<DashboardMetrics>(`/metrics/dashboard${qs(params)}`);

// ---------- leaderboard ----------

export type LeaderboardMetric = 'earnings' | 'bids' | 'interviews' | 'conversion';

export interface LeaderboardRow {
  userId: string;
  name: string;
  image?: string | null;
  value: number;
  secondary: string;
  rank: number;
}

export interface ConsolidatedLeaderboardUser {
  userId: string;
  name: string;
  image?: string | null;
  bids: number;
  interviews: number;
  conversion: number;
  qualifiesConversion: boolean;
  bidsTarget: number;
  interviewsTarget: number;
  prevBids: number;
  prevInterviews: number;
  prevConversion: number;
  trend: Array<{ label: string; bids: number; interviews: number }>;
  rank_bids?: number;
  rank_interviews?: number;
  rank_conversion?: number;
}

export interface ConsolidatedLeaderboard {
  range: string;
  label: string;
  period: { from: string; to: string };
  conversionMinBids: number;
  champions: {
    bids: { userId: string; name: string; image?: string | null; value: number } | null;
    interviews: { userId: string; name: string; image?: string | null; value: number } | null;
    conversion: { userId: string; name: string; image?: string | null; value: number } | null;
  };
  users: ConsolidatedLeaderboardUser[];
  yourStats: {
    bids: number; interviews: number; conversion: number;
    rankBids?: number; rankInterviews?: number; rankConversion?: number;
    bidsTarget: number; interviewsTarget: number;
    prevBids: number; prevInterviews: number; prevConversion: number;
  } | null;
}

export const getLeaderboardConsolidated = (range: string = 'week', trendWeeks?: number) => {
  const params = new URLSearchParams({ range });
  if (trendWeeks) params.set('trendWeeks', String(trendWeeks));
  return apiFetch<ConsolidatedLeaderboard>(`/metrics/leaderboard/consolidated?${params.toString()}`);
};

export interface DashboardFeed {
  recent: Array<{
    kind: 'bid' | 'interview_done' | 'interview_past';
    at: string;
    company?: string | null;
    profile?: string;
    jobId?: string;
    interviewId?: string;
    stage?: string | null;
    status?: string | null;
  }>;
  upcoming: Array<{
    interviewId: string;
    company?: string | null;
    stage?: string | null;
    scheduledAt: string | null;
    endsAt: string | null;
  }>;
}

export const getDashboardFeed = () => apiFetch<DashboardFeed>('/metrics/dashboard-feed');

// ---------- pipeline ----------

export type KanbanStage =
  | 'bid_sent' | 'intro' | 'tech' | 'live_coding' | 'system_design'
  | 'panel' | 'cultural' | 'final' | 'ai_interview' | 'offer'
  | 'rejected' | 'withdrawn';

export type ApplicationOutcome = 'active' | 'offer' | 'rejected' | 'withdrawn' | 'no_response';

export interface ApplicationDoc {
  _id: string;
  userId: { _id?: string; name?: string; email?: string } | string;
  accountId?: string | null;
  companyName: string;
  jobUrl?: string | null;
  jobDescription?: string | null;
  bidJobIds: string[];
  interviewIds: string[];
  stage: KanbanStage;
  outcome: ApplicationOutcome;
  appliedAt?: string | null;
  lastTouchedAt?: string | null;
  notes: string;
  stageHistory: Array<{ stage: string; at: string; by?: string | null; source?: string }>;
  archivedAt?: string | null;
  ownerName?: string | null;
  ownerEmail?: string | null;
  ownerImage?: string | null;
}

export const listApplications = (params?: {
  stage?: string; outcome?: string; userId?: string; profileId?: string;
  search?: string; includeArchived?: boolean;
}) => apiFetch<{ applications: ApplicationDoc[] }>(`/applications${qs(params)}`);

export const getApplication = (id: string) => apiFetch<ApplicationDoc>(`/applications/${id}`);

export const patchApplication = (id: string, body: {
  stage?: string; outcome?: string; notes?: string; archived?: boolean;
}) => apiFetch<ApplicationDoc>(`/applications/${id}`, { method: 'PATCH', body: JSON.stringify(body) });

export const deleteApplication = (id: string) => del<{ ok: boolean }>(`/applications/${id}`);

export const migrateApplications = () =>
  postJSON<{ applications: number; bidsLinked: number; interviewsLinked: number }>('/applications/migrate', {});

export const autoArchiveApplications = (days: number = 30) =>
  postJSON<{ archived: number }>(`/applications/auto-archive?days=${days}`, {});

export const wipeBidOnlyApplications = () =>
  postJSON<{ deleted: number }>('/applications/wipe-bid-only', {});

// ---------- email integrations (Gmail) ----------

export type EmailProvider = 'gmail' | 'outlook';
export type EmailSyncStatus = 'idle' | 'running' | 'error';
export type EmailReviewStatus =
  | 'auto_applied' | 'needs_review' | 'dismissed' | 'applied' | 'ignored';

export type EmailLabel =
  | 'applied' | 'recruiter_reachout' | 'phone_screen' | 'pre_screening'
  | 'take_home' | 'live_coding' | 'system_design' | 'behavioral'
  | 'panel' | 'final_round' | 'offer' | 'rejection'
  | 'schedule_interview' | 'follow_up' | 'noise';

export interface EmailAccountDoc {
  id: string;
  provider: EmailProvider;
  email: string;
  historyId?: string | null;
  lastSyncAt?: string | null;
  lastSyncError?: string | null;
  syncStatus: EmailSyncStatus;
  disconnectedAt?: string | null;
  createdAt: string;
}

export interface EmailMessageDoc {
  id: string;
  accountId: string;
  messageId: string;
  threadId: string;
  fromAddress: string;
  fromName?: string | null;
  subject: string;
  snippet: string;
  receivedAt: string;
  label?: EmailLabel | null;
  confidence: number;
  companyGuess?: string | null;
  targetStage?: string | null;
  applicationId?: string | null;
  reviewStatus: EmailReviewStatus;
}

export const listEmailAccounts = () =>
  apiFetch<{ accounts: EmailAccountDoc[] }>('/integrations/email/accounts');

export const startGmailOAuth = () =>
  postJSON<{ url: string }>('/integrations/email/gmail/oauth-start', {});

export const startOutlookOAuth = () =>
  postJSON<{ url: string }>('/integrations/email/outlook/oauth-start', {});

export const resetEmailAccountSync = (id: string, fullReSync = false) =>
  postJSON<{ ok: boolean; syncStatus: string; historyId: string | null }>(
    `/integrations/email/${id}/reset${fullReSync ? '?fullReSync=true' : ''}`,
    {},
  );

export const syncEmailAccount = (id: string) =>
  postJSON<{ ok: boolean; stats: { fetched: number; classified: number; auto_applied: number; needs_review: number } }>(
    `/integrations/email/${id}/sync`,
    {},
  );

export const disconnectEmailAccount = (id: string) =>
  del<void>(`/integrations/email/${id}`);

export const listEmailMessages = (params?: {
  accountId?: string; applicationId?: string; reviewStatus?: EmailReviewStatus; limit?: number;
}) => apiFetch<{ messages: EmailMessageDoc[] }>(`/integrations/email/messages${qs(params)}`);

export const applyEmailMessage = (id: string, body: { applicationId?: string; stage?: string }) =>
  postJSON<{ ok: boolean }>(`/integrations/email/messages/${id}/apply`, body);

export const dismissEmailMessage = (id: string) =>
  postJSON<{ ok: boolean }>(`/integrations/email/messages/${id}/dismiss`, {});

export const fetchEmailBody = (id: string) =>
  apiFetch<{ body: string }>(`/integrations/email/messages/${id}/body`);

export interface LeaderboardResponse {
  metric: LeaderboardMetric;
  range: number;
  rows: LeaderboardRow[];
  yourRank: {
    rank: number | null;
    value: number | null;
    secondary: string | null;
    outOf: number;
    optedIn: boolean;
  };
}

export const getLeaderboard = (params: {
  metric?: LeaderboardMetric;
  range?: number;
  limit?: number;
}) => apiFetch<LeaderboardResponse>(`/metrics/leaderboard${qs(params)}`);

// ---------- interview analyze ----------

export interface CommunicationStyle {
  pacing?: string;
  structure?: string;
  verbosity?: string;
  confidence?: string;
}

export interface ShineEntry { topic: string; evidence?: string }
export interface StumbleEntry { topic: string; failureMode?: string; evidence?: string }
export interface ShineMove { move: string; why?: string }

export interface InterviewAnalyzeStage {
  stage: string;
  stageLabel: string;
  interviewCount: number;
  overallScore: number;
  topQuestions: { question: string; frequency: number; exampleScore: number }[];
  askedAlways: string[];
  youShineOn: ShineEntry[];
  youStumbleOn: StumbleEntry[];
  communicationStyle: CommunicationStyle;
  styleImprovements: string[];
  drills: string[];
}

export interface InterviewAnalyzeWeakSpot {
  topic: string;
  stage: string;
  explanation: string;
  tip: string;
}

export interface InterviewAnalyzeResult {
  stages: InterviewAnalyzeStage[];
  weakSpots: InterviewAnalyzeWeakSpot[];
  styleProfile: string;
  signatureStrengths: string[];
  blindSpots: string[];
  howToShine: ShineMove[];
  interviewTactics: string[];
  redFlags: string[];
  uncertaintyTopics: string[];
  overallTips: string[];
}

export interface InterviewQuestion {
  _id: string;
  interviewId: string;
  userId: string;
  accountId?: string | null;
  stage?: string | null;
  companyName?: string | null;
  question: string;
  candidateAnswer: string;
  score?: number | null;
  scoreRationale?: string | null;
  improvementTip?: string | null;
  createdAt?: string;
}

export const listInterviewQuestions = (id: string) =>
  apiFetch<{ questions: InterviewQuestion[] }>(`/interviews/${id}/questions`);

export const reextractInterview = (id: string) =>
  postJSON<{ ok: boolean; message: string }>(`/interviews/${id}/extract`, {});

export interface AnalyzeChatRequest {
  accountId?: string;
  stages?: string[];
  fromDate?: string;
  toDate?: string;
  filterContext: Record<string, unknown>;
  result: Record<string, unknown>;
  messages: { role: 'user' | 'assistant'; content: string }[];
}

export const analyzeChat = (body: AnalyzeChatRequest) =>
  postJSON<{ reply: string; model: string; promptTokens: number; completionTokens: number }>(
    '/interviews/analyze/chat',
    body,
  );

export function analyzeInterviews(body: {
  accountId?: string;
  stages?: string[];
  fromDate?: string;
  toDate?: string;
}) {
  return postJSON<{
    interviewCount: number;
    transcriptCount: number;
    questionCount?: number;
    filterContext?: Record<string, unknown>;
    result: InterviewAnalyzeResult;
  }>('/interviews/analyze', body);
}

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
}) {
  return postJSON<{ pairs: ScreeningPair[] }>('/resume/screening-answers', body);
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
  jobDescription?: string;
  inputTokens?: number | null;
  outputTokens?: number | null;
  reasoningTokens?: number | null;
  matchSnippet?: string;
  coverLetterText?: string | null;
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
  promptBody?: string;
  generateCoverLetter?: boolean;
}) {
  return postJSON<{ jobId: string; status: ResumeJobStatus }>('/resume/generate', body);
}

export function listResumeJobs(params?: {
  accountId?: string;
  company?: string;
  q?: string;
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

function _sanitizeFolderPath(path: string): string {
  // Preserve '/' as a folder separator. Sanitize each segment for FS-unsafe
  // chars. Drop empty segments. Fallback to 'company' if everything strips out.
  const segs = (path || '')
    .split('/')
    .map((s) => s.replace(/[\\\x00-\x1f<>:"|?*]+/g, '_').trim().replace(/^[. ]+|[. ]+$/g, ''))
    .filter(Boolean);
  return segs.length ? segs.join('/') : 'company';
}

function _filenameFromCD(cd: string | null, fallback: string): string {
  if (!cd) return fallback;
  const m = /filename="?([^";]+)"?/i.exec(cd);
  return m?.[1] || fallback;
}

function _saveBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

/** Single-job download.
 *  - File System Access API (Chromium): writes `<picked-dir>/<company>/Resume.pdf` directly to disk.
 *  - Fallback (Firefox/Safari): backend returns a ZIP containing `<company>/Resume.pdf`. */
export async function downloadResumeJob(job: ResumeJob): Promise<void> {
  const token = getToken();
  const baseHeaders: Record<string, string> = {};
  if (token) baseHeaders.Authorization = `Bearer ${token}`;

  // FSA path — only if the browser supports it AND the user grants a dir.
  const fsa = await import('../lib/downloadDir');
  if (fsa.isFsaSupported()) {
    const dir = await fsa.getDownloadDir();
    if (!dir && fsa.lastPickError() === 'blocked') {
      throw new Error("Chrome blocked that folder (system files protected). Pick a normal folder — e.g. Documents/Resumes — and try again.");
    }
    if (!dir && fsa.lastPickError() === 'dead') {
      throw new Error("That folder no longer exists on disk. Pick a different folder and try again.");
    }
    if (dir) {
      const res = await fetch(`${BASE_URL}/resume/jobs/${job._id}/download?format=pdf`, { headers: baseHeaders });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const folder = _sanitizeFolderPath(res.headers.get('X-Folder') || `${job.profileName || 'profile'}/${job.companyName || 'company'}`);
      const blob = await res.blob();
      try {
        await fsa.writeToFolder(dir, folder, 'Resume.pdf', blob);
      } catch (err) {
        if (!fsa.isStaleHandleError(err)) throw err;
        fsa.resetDownloadDir();
        const fresh = await fsa.getDownloadDir();
        if (!fresh) throw new Error('Pick a folder to save to and try again.');
        await fsa.writeToFolder(fresh, folder, 'Resume.pdf', blob);
      }
      return;
    }
  }

  // Fallback — server-built zip.
  const res = await fetch(`${BASE_URL}/resume/jobs/${job._id}/download`, { headers: baseHeaders });
  if (!res.ok) {
    let message = `HTTP ${res.status}`;
    try {
      const data = await res.json();
      message = data.error || data.detail || message;
    } catch { /* ignore */ }
    throw new Error(message);
  }
  const blob = await res.blob();
  const filename = _filenameFromCD(res.headers.get('Content-Disposition'), `${job.companyName || 'resume'}.zip`);
  _saveBlob(blob, filename);
}

/** Bulk download.
 *  - FSA: writes each `<picked-dir>/<company>/Resume.pdf` straight to disk
 *    (no zip). Fetches per-job PDF bytes in parallel (cap 5 concurrent).
 *  - Fallback: backend builds one ZIP with all folders inside. */
export async function bulkDownloadResumeJobs(jobIds: string[]): Promise<void> {
  if (!jobIds.length) return;
  const token = getToken();
  const baseHeaders: Record<string, string> = {};
  if (token) baseHeaders.Authorization = `Bearer ${token}`;

  const fsa = await import('../lib/downloadDir');
  if (fsa.isFsaSupported()) {
    const dir = await fsa.getDownloadDir();
    if (!dir && fsa.lastPickError() === 'blocked') {
      throw new Error("Chrome blocked that folder (system files protected). Pick a normal folder — e.g. Documents/Resumes — and try again.");
    }
    if (!dir && fsa.lastPickError() === 'dead') {
      throw new Error("That folder no longer exists on disk. Pick a different folder and try again.");
    }
    if (dir) {
      // Modest concurrency — large bulks shouldn't stampede the backend.
      // currentDir is captured in closure + swapped if a stale-handle error
      // surfaces mid-bulk; one re-prompt covers all workers via shared ref.
      let currentDir: typeof dir | null = dir;
      let recoveryPromise: Promise<typeof dir | null> | null = null;
      const recoverDir = async () => {
        if (!recoveryPromise) {
          recoveryPromise = (async () => {
            fsa.resetDownloadDir();
            const fresh = await fsa.getDownloadDir();
            currentDir = fresh;
            return fresh;
          })();
        }
        return recoveryPromise;
      };
      const queue = [...jobIds];
      const workers = Array.from({ length: Math.min(5, queue.length) }, async () => {
        while (queue.length) {
          const id = queue.shift();
          if (!id) break;
          const res = await fetch(`${BASE_URL}/resume/jobs/${id}/download?format=pdf`, { headers: baseHeaders });
          if (!res.ok) continue;
          const folder = _sanitizeFolderPath(res.headers.get('X-Folder') || 'company');
          const blob = await res.blob();
          try {
            if (!currentDir) break;
            await fsa.writeToFolder(currentDir, folder, 'Resume.pdf', blob);
          } catch (err) {
            if (!fsa.isStaleHandleError(err)) throw err;
            const fresh = await recoverDir();
            if (!fresh) break;
            await fsa.writeToFolder(fresh, folder, 'Resume.pdf', blob);
          }
        }
      });
      await Promise.all(workers);
      return;
    }
  }

  // Fallback — one big zip.
  const res = await fetch(`${BASE_URL}/resume/jobs/bulk-download`, {
    method: 'POST',
    headers: { ...baseHeaders, 'Content-Type': 'application/json' },
    body: JSON.stringify({ jobIds }),
  });
  if (!res.ok) {
    let message = `HTTP ${res.status}`;
    try { const data = await res.json(); message = data.error || data.detail || message; } catch { /* ignore */ }
    throw new Error(message);
  }
  const blob = await res.blob();
  const filename = _filenameFromCD(res.headers.get('Content-Disposition'), 'resumes.zip');
  _saveBlob(blob, filename);
}
