import { apiFetch, BASE_URL, getToken, type ApiFetchOptions } from './client';

// ---------- shared types ----------

export interface User {
  id: string;
  name: string | null;
  email: string | null;
  role: 'admin' | 'staff' | 'accountant';
  image?: string | null;
  /** ISO timestamps (UTC). Missing from older backends and cached sessions. */
  createdAt?: string | null;
  lastLoginAt?: string | null;
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
  freeLlmModelId?: string;
  freeLlmMaxTokens?: number | null;
  freeLlmApiKeySet?: boolean;
  freeLlmApiKeyHint?: string;
  freeLlmKeyVerified?: boolean;
  slackConnected?: boolean;
  slackAlertsEnabled?: boolean;
  slackTimezone?: string;
  slackDigestHour?: number;
  slackDigestMinute?: number;
  slackOAuthConfigured?: boolean;
  slackBotConfigured?: boolean;
}

export interface FreeLlmModelPreset {
  id: string;
  label: string;
  model: string;
  defaultMaxTokens: number;
}

export interface TransactionListParams {
  page?: number;
  limit?: number;
  from?: string;
  to?: string;
  userId?: string;
  payerId?: string;
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

function postJSON<T>(path: string, body: unknown, options?: Pick<ApiFetchOptions, 'timeoutMs'>) {
  return apiFetch<T>(path, {
    method: 'POST',
    body: JSON.stringify(body),
    timeoutMs: options?.timeoutMs,
  });
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

export const listFreeLlmModels = () =>
  apiFetch<{ models: FreeLlmModelPreset[] }>('/profile/free-llm-models');

export const updateFreeLlmSettings = (body: {
  freeLlmModelId?: string;
  freeLlmMaxTokens?: number | null;
  freeLlmApiKey?: string;
}) => putJSON<{
  message: string;
  freeLlmModelId: string;
  freeLlmMaxTokens: number | null;
  freeLlmApiKeySet: boolean;
  freeLlmApiKeyHint: string;
  freeLlmKeyVerified: boolean;
}>('/profile/free-llm', body);

export const testFreeLlm = () =>
  postJSON<{
    ok: boolean;
    model: string;
    sample: string;
    freeLlmKeyVerified: boolean;
    freeLlmApiKeySet: boolean;
    freeLlmApiKeyHint: string;
  }>('/profile/free-llm-test', {}, { timeoutMs: 330_000 });

export type SlackStatus = {
  slackConnected: boolean;
  slackAlertsEnabled: boolean;
  slackTimezone: string;
  slackTimezones?: { value: string; label: string }[];
  slackDigestHour: number;
  slackDigestMinute: number;
  slackOAuthConfigured: boolean;
  slackBotConfigured: boolean;
};

export const getSlackStatus = () => apiFetch<SlackStatus>('/integrations/slack/status');

export const startSlackOAuth = () =>
  postJSON<{ url: string }>('/integrations/slack/oauth-start', {});

export const disconnectSlack = () => del<SlackStatus>('/integrations/slack/disconnect');

export const updateSlackPrefs = (body: {
  slackAlertsEnabled?: boolean;
  slackTimezone?: string;
  slackDigestHour?: number;
  slackDigestMinute?: number;
}) =>
  apiFetch<SlackStatus>('/integrations/slack/prefs', {
    method: 'PATCH',
    body: JSON.stringify(body),
  });

export const testSlackDm = () => postJSON<{ ok: boolean }>('/integrations/slack/test-dm', {});

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
  /** Default (omitted) = active only. */
  status?: 'active' | 'archived' | 'all';
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

/** Add or replace (by filename) one resume: extracted text is stored on the profile, the original file in S3. */
export const uploadAccountResume = (accountId: string, file: File, markdown: string) => {
  const form = new FormData();
  form.append('file', file);
  form.append('markdown', markdown);
  return apiFetch<Record<string, unknown>>(`/accounts/${accountId}/resumes`, { method: 'POST', body: form, timeoutMs: 120_000 });
};

/** Short-lived download link for a resume's original file (404 when only the text is stored). */
export const getAccountResumeFileUrl = (accountId: string, resumeId: string) =>
  apiFetch<{ url: string }>(`/accounts/${accountId}/resumes/${resumeId}/file`);

// ---------- transactions ----------

export interface TransactionUserTotal {
  userId: string;
  name: string;
  email?: string | null;
  image?: string | null;
  income: number;
  outcome: number;
  net: number;
  count: number;
}

export interface TransactionPayerTotal {
  payerId: string;
  name: string;
  email?: string | null;
  image?: string | null;
  income: number;
  outcome: number;
  net: number;
  count: number;
}

export const listTransactions = (params?: TransactionListParams) =>
  apiFetch<{
    transactions: Record<string, unknown>[];
    pagination: Pagination;
    userTotals?: TransactionUserTotal[];
    payerTotals?: TransactionPayerTotal[];
    totalOutcome?: number;
    /** Sums over every row matching the filters, not just the current page. */
    totals?: { income: number; outcome: number; net: number; count: number };
  }>(`/transactions${qs(params)}`);

export const createTransaction = (body: Record<string, unknown>) =>
  postJSON<Record<string, unknown>>('/transactions', body);

export const updateTransaction = (id: string, body: Record<string, unknown>) =>
  putJSON<Record<string, unknown>>(`/transactions/${id}`, body);

export const deleteTransaction = (id: string) => del<{ ok: boolean }>(`/transactions/${id}`);

export const transactionSummary = (params?: { userId?: string; year?: number }) =>
  apiFetch<TransactionSummary>(`/transactions/summary${qs(params)}`);

export const transactionCardHints = () =>
  apiFetch<{ cards: { cardLast4: string; cardLabel: string }[] }>('/transactions/card-hints');

export type AlertKind = 'card_renewal' | 'weekly_plan' | 'daily_bids';

export type AlertAction = { key: string; label: string };

export type AlertResolution = 'none' | 'paid' | 'stopped' | 'opened';

export interface AppAlert {
  _id: string;
  kind: AlertKind;
  title: string;
  body: string;
  href: string;
  unread: boolean;
  periodKey: string;
  createdAt?: string;
  resolution?: AlertResolution;
  resolvedAt?: string | null;
  actions?: AlertAction[];
  meta?: Record<string, unknown>;
}

export const listAlerts = () => apiFetch<{ alerts: AppAlert[] }>('/alerts');

export const alertsUnreadCount = () => apiFetch<{ count: number }>('/alerts/unread-count');

export const markAllAlertsRead = () => postJSON<{ ok: boolean; updated?: number }>('/alerts/read-all', {});

export const runAlertAction = (id: string, action: string) =>
  postJSON<AppAlert>(`/alerts/${id}/actions/${action}`, {});

// ---------- weekly / daily plans (Goal vs Done) ----------

export interface Counts {
  bidsSelf: number;
  bidsBidder: number;
  interviewsSelf: number;
  interviewsCaller: number;
}

export interface Bids {
  bidsSelf: number;
  bidsBidder: number;
}

export interface ChecklistItem {
  text: string;
  done: boolean;
}

export type StageCounts = Record<string, number>;

export interface InterviewStages {
  self: StageCounts;
  caller: StageCounts;
}

/** Interviews held that day, from the Interviews page (never typed). */
export interface DayInterviews {
  self: number;
  caller: number;
  stages: InterviewStages;
}

export interface DayPlan {
  date: string;
  exists: boolean;
  userId: string;
  goal: Counts;
  goalItems: ChecklistItem[];
  /** Typed bids + interviews from the Interviews page. */
  done: Counts;
  interviews: DayInterviews;
  notes: string;
  /** Set once the day has been followed up. */
  loggedAt: string | null;
}

/** A day's follow-up: bids done, the daily goal lines with ticks, and notes (posts to Slack). */
export interface DayPlanInput {
  goalItems: ChecklistItem[];
  done: Bids;
  notes: string;
}

export interface WeekDaySummary {
  date: string;
  logged: boolean;
  goal: Counts;
  done: Counts;
  itemsDone: number;
  itemsTotal: number;
}

export interface WeekPlan {
  weekStart: string;
  exists: boolean;
  userId: string;
  goal: Counts;
  goalItems: ChecklistItem[];
  /** The goal for every working day of the week (bids + goal lines). */
  dailyGoal: Counts;
  dailyGoalItems: ChecklistItem[];
  recapNotes: string;
  done: Counts;
  stages: InterviewStages;
  days: WeekDaySummary[];
}

export interface WeekPlanInput {
  goal: Counts;
  goalItems: ChecklistItem[];
  dailyGoal: Bids;
  dailyGoalItems: ChecklistItem[];
  recapNotes: string;
}

export interface TeamRow {
  userId: string;
  name: string | null;
  email: string | null;
  goal: Counts;
  done: Counts;
  itemsDone: number;
  itemsTotal: number;
  lastLoggedDate: string | null;
  hasWeeklyPlan: boolean;
}

export const getDayPlans = (weekStart: string, userId?: string) =>
  apiFetch<{ weekStart: string; days: DayPlan[] }>(`/daily-plans${qs({ weekStart, userId })}`);

export const getDayPlan = (date: string, userId?: string) =>
  apiFetch<DayPlan>(`/daily-plans/${date}${qs({ userId })}`);

export const putDayPlan = (date: string, body: DayPlanInput) =>
  putJSON<DayPlan>(`/daily-plans/${date}`, body);

export const deleteDayPlan = (date: string) => del<{ message: string }>(`/daily-plans/${date}`);

export const getWeekPlan = (weekStart: string, userId?: string) =>
  apiFetch<WeekPlan>(`/weekly-plans/${weekStart}${qs({ userId })}`);

export const putWeekPlan = (weekStart: string, body: WeekPlanInput) =>
  putJSON<WeekPlan>(`/weekly-plans/${weekStart}`, body);

export const deleteWeekPlan = (weekStart: string) => del<{ message: string }>(`/weekly-plans/${weekStart}`);

export const getPreviousWeekGoals = (weekStart: string) =>
  apiFetch<{
    goal: Counts | null;
    goalItems: ChecklistItem[];
    dailyGoal: Counts | null;
    dailyGoalItems: ChecklistItem[];
  }>(`/weekly-plans/${weekStart}/previous-goals`);

export const getTeamReport = (weekStart: string) =>
  apiFetch<{ weekStart: string; users: TeamRow[] }>(`/reports/team${qs({ weekStart })}`);

export const askResumeJobScreening = (jobId: string, questions: string[], model?: string) =>
  postJSON<{ pairs: { question: string; answer: string }[] }>(`/resume/jobs/${jobId}/ask`, { questions, model });

// ---------- accounts lookup (filter dropdowns) ----------

export interface AccountLookup {
  _id: string;
  name: string;
  country?: string | null;
  region?: string | null;
  hasTemplate?: boolean;
  hasPrompt?: boolean;
  createdBy?: string;
  showInGenerate?: boolean;
  archived?: boolean;
}

export const lookupAccounts = () =>
  apiFetch<{ accounts: AccountLookup[] }>('/accounts/lookup');

// ---------- users lookup (filter dropdowns; available to all authed users) ----------

export const lookupUsers = (params?: { excludeRole?: string }) =>
  apiFetch<{ users: { _id: string; name: string | null; email: string | null; role?: string }[] }>(
    `/users/lookup${qs(params)}`
  );

// ---------- interview prep library (prompts + template answers) ----------

export interface InterviewPrepItem {
  _id: string;
  userId?: { _id: string; name?: string | null; email?: string | null };
  title: string;
  body: string;
  ownerName?: string | null;
  ownerEmail?: string | null;
  createdAt?: string;
  updatedAt?: string;
}

export const listInterviewPrompts = (params?: { userId?: string }) =>
  apiFetch<{ prompts: InterviewPrepItem[] }>(`/interview-prep/prompts${qs(params)}`);

export const createInterviewPrompt = (body: { title: string; body?: string }) =>
  postJSON<InterviewPrepItem>('/interview-prep/prompts', body);

export const updateInterviewPrompt = (id: string, body: { title?: string; body?: string }) =>
  putJSON<InterviewPrepItem>(`/interview-prep/prompts/${id}`, body);

export const deleteInterviewPrompt = (id: string) =>
  del<{ ok: boolean }>(`/interview-prep/prompts/${id}`);

export const listInterviewTemplateAnswers = (params?: { userId?: string }) =>
  apiFetch<{ items: InterviewPrepItem[] }>(`/interview-prep/template-answers${qs(params)}`);

export const createInterviewTemplateAnswer = (body: { title: string; body?: string }) =>
  postJSON<InterviewPrepItem>('/interview-prep/template-answers', body);

export const updateInterviewTemplateAnswer = (id: string, body: { title?: string; body?: string }) =>
  putJSON<InterviewPrepItem>(`/interview-prep/template-answers/${id}`, body);

export const deleteInterviewTemplateAnswer = (id: string) =>
  del<{ ok: boolean }>(`/interview-prep/template-answers/${id}`);

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
  /** Column to sort by; legacy 'asc' | 'desc' means latest round date. */
  sort?: 'latest' | 'company' | 'stage' | 'status' | 'asc' | 'desc';
  dir?: 'asc' | 'desc';
}

export const listInterviews = (params?: InterviewListParams) =>
  apiFetch<{ interviews: Record<string, unknown>[]; pagination: Pagination }>(
    `/interviews${qs(params)}`
  );

/** One calendar row: a round with its interview's headline fields. */
export interface InterviewRoundRow {
  interviewId: string;
  roundId: string;
  stage: string;
  status: string | null;
  scheduledAt: string;
  endsAt: string | null;
  companyName: string | null;
  profileLabel: string | null;
  ownerId: string;
  ownerName: string | null;
  hasCaller: boolean;
}

export const listInterviewRounds = (params: {
  from: string;
  to: string;
  creatorId?: string;
  accountId?: string;
  stage?: string;
  status?: string;
}) => apiFetch<{ rounds: InterviewRoundRow[]; interviews: Record<string, Record<string, unknown>> }>(
  `/interviews/rounds${qs(params)}`,
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

export type CallerMethod = 'video' | 'phone_hushed' | 'phone_slynumber';

/** Caller request on a round: a coworker joins at the round's start time. */
export interface InterviewCaller {
  enabled: boolean;
  callerName?: string;
  /** Round start (UTC ISO). */
  startsAt?: string | null;
  method?: CallerMethod | null;
  methodValue?: string;
  coworkerIds?: string[];
  coworkers?: { _id: string; name?: string | null; email?: string | null }[];
  slackChannelTs?: string | null;
}

export interface CallerInput {
  enabled: boolean;
  callerName?: string;
  method?: string;
  methodValue?: string;
  coworkerIds?: string[];
}

/** One round as sent to the API (ISO UTC datetimes). */
export interface RoundInput {
  stage: string;
  scheduledAt: string;
  endsAt?: string;
  status?: string;
  interviewerName?: string;
  note?: string;
  transcript?: string;
  caller?: CallerInput;
}

export interface CreateInterviewBody {
  accountId: string;
  companyName: string;
  appliedPosition?: string;
  jobUrl?: string;
  round: RoundInput;
}

/** Application-level fields, or a status-only update of the current round. */
export type UpdateInterviewBody =
  | { accountId?: string; companyName?: string; appliedPosition?: string; jobUrl?: string }
  | { status: string };

export const createInterview = (body: CreateInterviewBody) =>
  postJSON<Record<string, unknown>>('/interviews', body);

export const updateInterview = (id: string, body: UpdateInterviewBody) =>
  putJSON<Record<string, unknown>>(`/interviews/${id}`, body);

export const deleteInterview = (id: string) => del<{ ok: boolean }>(`/interviews/${id}`);

/** One round of an interview; each round owns its own script (transcript) and note. */
export interface InterviewStageEntry {
  id: string;
  stage: string;
  at?: string;
  source?: string;
  scheduledAt?: string | null;
  status?: string | null;
  transcript?: string;
  note?: string;
  interviewerName?: string | null;
  endsAt?: string | null;
  caller?: InterviewCaller | null;
}

export type InterviewStageInput = Partial<RoundInput>;

export const addInterviewStage = (id: string, body: RoundInput & { markPreviousPassed?: boolean }) =>
  postJSON<Record<string, unknown>>(`/interviews/${id}/stages`, body);

export const updateInterviewStage = (id: string, stageId: string, body: InterviewStageInput) =>
  apiFetch<Record<string, unknown>>(`/interviews/${id}/stages/${stageId}`, {
    method: 'PATCH',
    body: JSON.stringify(body),
  });

export const deleteInterviewStage = (id: string, stageId: string) =>
  del<Record<string, unknown>>(`/interviews/${id}/stages/${stageId}`);

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

export interface InterviewStageBreakdownItem {
  label: string;
  count: number;
}

export interface ConsolidatedLeaderboardUser {
  userId: string;
  name: string;
  image?: string | null;
  bids: number;
  bidsPlan?: number;
  bidsTailor?: number;
  interviews: number;
  interviewsCanceled?: number;
  interviewBreakdown?: InterviewStageBreakdownItem[];
  conversion: number;
  qualifiesConversion: boolean;
  bidsTarget: number;
  interviewsTarget: number;
  prevBids: number;
  prevBidsPlan?: number;
  prevBidsTailor?: number;
  prevInterviews: number;
  prevInterviewsCanceled?: number;
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
    bids: {
      userId: string;
      name: string;
      image?: string | null;
      value: number;
      bidsPlan?: number;
      bidsTailor?: number;
    } | null;
    interviews: {
      userId: string;
      name: string;
      image?: string | null;
      value: number;
      breakdown?: InterviewStageBreakdownItem[];
      canceled?: number;
    } | null;
    conversion: { userId: string; name: string; image?: string | null; value: number } | null;
  };
  users: ConsolidatedLeaderboardUser[];
  yourStats: {
    bids: number; bidsPlan?: number; bidsTailor?: number;
    interviews: number; interviewsCanceled?: number;
    interviewBreakdown?: InterviewStageBreakdownItem[];
    conversion: number;
    rankBids?: number; rankInterviews?: number; rankConversion?: number;
    bidsTarget: number; interviewsTarget: number;
    prevBids: number; prevInterviews: number; prevInterviewsCanceled?: number; prevConversion: number;
  } | null;
}

export const getLeaderboardConsolidated = (range: string = 'week', trendWeeks?: number) => {
  const params = new URLSearchParams({ range });
  if (trendWeeks) params.set('trendWeeks', String(trendWeeks));
  return apiFetch<ConsolidatedLeaderboard>(`/metrics/leaderboard/consolidated?${params.toString()}`);
};

// ---------- dashboard ----------

export interface DashboardPace {
  expected: number;
  behindBy: number;
  perDayNeeded: number | null;
  onTrack: boolean;
}

export interface DashboardPercentile {
  position: 'top' | 'bottom';
  percent: number;
}

export interface DashboardWeek {
  week: { start: string; end: string };
  bids: {
    self: number;
    bidder: number;
    total: number;
    target: number | null;
    pace: DashboardPace | null;
    percentile: DashboardPercentile | null;
  };
  interviews: {
    done: number;
    target: number | null;
    pace: DashboardPace | null;
    percentile: DashboardPercentile | null;
  };
  stages: { key: string; label: string; count: number }[];
  streak: number;
  hasWeeklyPlan: boolean;
}

export interface DashboardActivity {
  bucket: 'day' | 'week' | 'month';
  from: string;
  to: string;
  series: { key: string; label: string; self: number; bidder: number; interviews: number }[];
  totals: { self: number; bidder: number; bids: number; interviews: number };
}

export interface DashboardNetMonthly {
  months: { period: string; income: number; outcome: number; net: number }[];
  total: number;
}

export const getDashboardWeek = (params: { userId?: string; today?: string }) =>
  apiFetch<DashboardWeek>(`/dashboard/week${qs(params)}`);

export const getDashboardActivity = (params: { from: string; to: string; userId?: string }) =>
  apiFetch<DashboardActivity>(`/dashboard/activity${qs(params)}`);

export const getDashboardNetMonthly = (params: { userId?: string; today?: string }) =>
  apiFetch<DashboardNetMonthly>(`/dashboard/net-monthly${qs(params)}`);

// ---------- pipeline ----------

export type KanbanStage =
  | 'bid_sent' | 'intro' | 'tech' | 'tech_round_1' | 'tech_round_2'
  | 'live_coding' | 'system_design' | 'home_assessment'
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
  stageHistory: Array<{ stage: string; at: string; by?: string | null; source?: string; scheduledAt?: string | null }>;
  archivedAt?: string | null;
  // AI-proposed cards (from email) start unconfirmed and render with Yes/No.
  confirmed: boolean;
  aiLabel?: string | null;
  aiConfidence?: number | null;
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

export const confirmApplication = (id: string) =>
  postJSON<ApplicationDoc>(`/applications/${id}/confirm`, {});

export const rejectApplication = (id: string) =>
  postJSON<{ ok: boolean }>(`/applications/${id}/reject`, {});

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
  | 'on_board' | 'dismissed' | 'ignored'
  | 'auto_applied' | 'needs_review' | 'applied';

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
  postJSON<{ ok: boolean; stats: { fetched: number; classified: number; on_board: number; ignored: number } }>(
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

export const listInterviewQuestions = (id: string, stageId?: string) =>
  apiFetch<{ questions: InterviewQuestion[] }>(`/interviews/${id}/questions${qs({ stageId })}`);

export const reextractInterview = (id: string, stageId?: string) =>
  postJSON<{ ok: boolean; message: string }>(`/interviews/${id}/extract${qs({ stageId })}`, {});

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

export type LlmProvider = 'free' | 'openai' | 'anthropic';
export type ModelTask = 'resume' | 'cover_letter' | 'screening';
export type ModelTier = 'budget' | 'balanced' | 'premium';

export interface ModelProviderInfo {
  id: LlmProvider;
  label: string;
}

/** One selectable model from GET /resume/models (only models the server can run right now). */
export interface ModelOption {
  id: string;
  label: string;
  provider: LlmProvider;
  tier: ModelTier;
  bestFor: string;
  /** Typical cost of one run in USD; null when the price is unknown. */
  estCostUsd: number | null;
  isDefault: boolean;
  /** First suggestion for its provider and task. */
  recommended: boolean;
  /** Short label such as "Best value", "Max quality", "Older generation". */
  tag: string;
}

export function listResumeModels(task: ModelTask) {
  return apiFetch<{ task: ModelTask; defaultId: string | null; providers: ModelProviderInfo[]; models: ModelOption[] }>(
    `/resume/models${qs({ task })}`
  );
}

export interface CoverLetterVersion {
  text: string;
  provider: string;
  model: string;
  createdAt: string;
}

export interface CoverLetterRegenResult {
  coverLetterText: string;
  coverLetterLlmProvider: LlmProvider | null;
  coverLetterLlmModel: string | null;
  coverLetterLlmFallbackUsed: boolean | null;
  coverLetterLlmFallbackReason: string | null;
  estimatedCostUsd: number | null;
  coverLetterHistory: CoverLetterVersion[];
}

/** Writes the job's cover letter again: up to four sequential model calls of up to 5 minutes each,
 *  so the timeout is generous. The server finishes and saves even if the client gives up first. */
export function regenerateCoverLetter(jobId: string, body: { model?: string; hook?: string }) {
  return postJSON<CoverLetterRegenResult>(`/resume/jobs/${jobId}/cover-letter`, body, { timeoutMs: 600_000 });
}

export function generateScreeningAnswers(body: {
  accountId: string;
  jobDescription?: string;
  questions: string[];
  model?: string;
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
  /** Where it was queued from; Job Applies tailoring is tagged and not auto-downloaded. */
  source?: 'generator' | 'job_applies';
  /** Job Applies: the job row and run it was tailored for (run fields null once the run expired). */
  jobApplyRowId?: string | null;
  jobApplyRunId?: string | null;
  jobApplyRunName?: string | null;
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
  resumeLlmProvider?: LlmProvider | null;
  resumeLlmModel?: string | null;
  resumeLlmFallbackUsed?: boolean | null;
  resumeLlmFallbackReason?: string | null;
  screeningLlmProvider?: LlmProvider | null;
  screeningLlmModel?: string | null;
  screeningLlmFallbackUsed?: boolean | null;
  screeningLlmFallbackReason?: string | null;
  matchSnippet?: string;
  coverLetterText?: string | null;
  coverLetterLlmProvider?: LlmProvider | null;
  coverLetterLlmModel?: string | null;
  coverLetterLlmFallbackUsed?: boolean | null;
  coverLetterLlmFallbackReason?: string | null;
  coverLetterHistory?: CoverLetterVersion[];
  coverLetterHook?: string | null;
  resumeModelId?: string | null;
  coverLetterModelId?: string | null;
  screeningModelId?: string | null;
  /** Running total of model spend for this job; null when no priced model ran. */
  estimatedCostUsd?: number | null;
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
  /** Catalog ids from listResumeModels; omit to let the server choose. */
  resumeModel?: string;
  coverLetterModel?: string;
  screeningModel?: string;
  coverLetterHook?: string;
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

export function getResumeJob(id: string) {
  return apiFetch<ResumeJob>(`/resume/jobs/${id}`);
}

export function deleteResumeJob(id: string) {
  return del<{ ok: boolean }>(`/resume/jobs/${id}`);
}

export function retryResumeJob(id: string) {
  return postJSON<{ jobId: string; status: ResumeJobStatus }>(`/resume/jobs/${id}/retry`, {});
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

// ---------- job applies ----------

export type JobApplyRunStatus = 'queued' | 'running' | 'screened' | 'done' | 'failed' | 'cancelled';
export type JobApplyRowStatus =
  | 'pending'
  | 'fetched'
  | 'extracted'
  | 'scored'
  | 'excluded'
  | 'fetch_failed'
  | 'llm_failed'
  | 'unassigned';
/** Where screening put a job: worth applying to (valid / check) or why not. */
export type JobApplyScreenBucket =
  | 'valid'
  | 'check'
  | 'closed'
  | 'not_fetched'
  | 'read_failed'
  | 'not_job'
  | 'clearance'
  | 'onsite'
  | 'too_old'
  | 'other_location';
export type JobApplyView = 'all' | 'suggested' | 'excluded' | 'failed';
export type ScoreBand = 'strong' | 'good' | 'fair' | 'weak';

export interface JobApplyCounts {
  total: number;
  fetched: number;
  extracted: number;
  scored: number;
  excluded: number;
  failed: number;
}

export interface JobApplyProfile {
  accountId: string;
  name: string;
  country?: string | null;
  region?: string | null;
}

export interface JobApplyRunSummary {
  worth: number;
  closed: number;
  markets: { US: number; UKEU: number; LATAM: number };
  toApply: number;
  applied: number;
  tailoring: number;
}

export interface JobApplyRun {
  _id: string;
  /** Uploaded file name, or the Google Sheet's title. */
  fileName: string;
  /** Google Sheets link when the run came from one. */
  sourceUrl?: string | null;
  status: JobApplyRunStatus;
  /** 'screen': fetching and checking jobs (then waits at 'screened'); 'score': scoring the picked profiles. */
  phase: 'screen' | 'score';
  /** Location group key → profile ids its jobs are scored against; '*' = every group. */
  assignments: Record<string, string[]>;
  /** Created with profiles up front: scored right after screening, every group against every profile. */
  autoStart?: boolean;
  screenedAt?: string | null;
  threshold: number;
  maxAgeDays: number;
  counts: JobApplyCounts;
  suggested: number;
  /** Failed jobs a retry can help (closed jobs excluded). */
  retryable?: number;
  /** Only on GET /job-applies/runs: the numbers its card shows (per job); null when they couldn't be computed. */
  summary?: JobApplyRunSummary | null;
  createdAt: string;
  finishedAt?: string | null;
  error?: string | null;
  notes?: string[];
  /** When this run's results are deleted (7 days after upload). Applied history is kept permanently. */
  expiresAt?: string | null;
  /** Only on GET /job-applies/runs/{id}: resumes marked applied in this run. */
  appliedInRun?: number;
  /** Only when requested with appliedSince: applications since that moment (e.g. local midnight). */
  appliedSince?: number;
  /** Only on GET /job-applies/runs/{id}: suggested jobs with at least one application still to go. */
  toApply?: number;
  /** Only on GET /job-applies/runs/{id}: applications (job × profile) by state, and what's left per profile. */
  applications?: JobApplyApplicationCounts;
  /** Only on GET /job-applies/runs/{id}: jobs in the Excluded tab (failed a check, or no profile can take them). */
  excludedCount?: number;
  /** Only on GET /job-applies/runs/{id}: this run's tailored resumes by status. */
  tailoring?: { queued: number; inProgress: number; ready: number; failed: number };
  selection: { accountId: string; resumeIds: string[] }[];
  /** Only on GET /job-applies/runs/{id}. */
  profiles?: JobApplyProfile[];
  /** Only on GET /job-applies/runs/{id}: each selected resume with its parse-health badge. */
  resumes?: JobApplyResumeHealth[];
}

export type JobApplyApplicationState = 'applied' | 'ready' | 'tailoring' | 'needsResume';

/** One profile applying to one job. */
export interface JobApplyApplication {
  accountId: string;
  state: JobApplyApplicationState;
}

export interface JobApplyApplicationCounts {
  /** Jobs with at least one application to go. */
  jobs: number;
  /** Applications not applied yet (ready + tailoring + needsResume). */
  toGo: number;
  /** Applications with a resume to send that aren't in the shared sheet yet. */
  toExport?: number;
  applied: number;
  /** Has a resume to apply with: the tailored one when done, else the matching uploaded one. */
  ready: number;
  tailoring: number;
  needsResume: number;
  byProfile: { accountId: string; name: string; toGo: number; ready: number }[];
}

export interface JobApplyResumeHealth {
  accountId: string;
  resumeId: string;
  filename: string;
  health: { score: number; issues: string[] };
  /** The original file is stored (S3) and can be downloaded. */
  hasFile?: boolean;
}

/** The file applied with: an uploaded resume (resumeId) or the job's tailored resume (tailoredJobId). */
export interface JobApplyAppliedMark {
  accountId: string;
  resumeId?: string | null;
  tailoredJobId?: string | null;
  at: string | null;
}

export interface JobApplyTailored {
  jobId: string;
  accountId: string;
  status: ResumeJobStatus;
  step: ResumeJobStep;
  hasPdf: boolean;
  error?: string | null;
}

export interface JobApplyPreviousApplication {
  appliedAt: string | null;
  profileName: string;
  filename: string;
  accountId?: string | null;
}

export type JobApplyAppliedFilter = 'any' | 'yes' | 'no';

export interface JobApplyGate {
  name: string;
  result: 'pass' | 'fail' | 'unknown';
  reason: string;
}

export interface JobApplySuggestion {
  accountId: string;
  resumeId: string;
  filename: string;
  total: number;
  band: ScoreBand;
  knockouts: string[];
}

export interface JobApplyRow {
  _id: string;
  rowIndex: number;
  url: string | null;
  title: string;
  company: string;
  status: JobApplyRowStatus;
  statusReason?: string | null;
  screen?: JobApplyScreenBucket | null;
  /** Normalised allowed locations, e.g. 'GB', 'EU+US', 'none'. */
  groupKey?: string | null;
  /** Candidate markets the job is open to: 'US', 'UKEU', 'LATAM'. */
  markets?: string[];
  forceInclude?: boolean;
  jdSource?: 'sheet' | 'ats_api' | 'html' | 'browser' | 'manual' | null;
  /** false: read from the page's text only (no job-site API or posting data), so it needs a check. */
  jdStructured?: boolean | null;
  postedDate?: string | null;
  workMode?: 'remote' | 'hybrid' | 'onsite' | 'unknown' | null;
  allowedLocations: { kind: 'country' | 'region'; value: string }[];
  timezoneNote?: string | null;
  extractionSource?: 'llm' | 'rules' | 'cache' | 'human' | null;
  /** A person corrected this job's info (shared by everyone who uses the link). */
  humanEdited?: boolean;
  gates: JobApplyGate[];
  profileGates: { accountId: string; gates: JobApplyGate[] }[];
  topScore: number | null;
  suggestions: JobApplySuggestion[];
  /** Resumes marked applied for this job in this run. */
  appliedResumes: JobApplyAppliedMark[];
  /** Every application for this job is applied (or, with none, something was marked). */
  applied: boolean;
  /** One per profile this job is for (job × profile), with its state. */
  applications: JobApplyApplication[];
  /** Applications to this URL recorded in earlier runs. */
  previouslyApplied: JobApplyPreviousApplication[];
  /** Tailored resumes for this job, at most one per profile. */
  tailored: JobApplyTailored[];
  /** Profiles this job is open to (passes their location / work-authorization checks). */
  openProfiles: string[];
  /** Profiles whose row for this job is already in the exported Google Sheet. */
  exportedProfiles: string[];
  /** Profiles without uploaded resumes this job is open to (apply with a tailored resume). */
  tailorOnly: string[];
}

export interface JobApplyComponent {
  score: number;
  weight: number;
  detail: string;
}

export interface JobApplyTermHit {
  term: string;
  tier: 'required' | 'core' | 'mentioned' | 'preferred' | 'context';
  weight: number;
  credit: number;
  match: 'exact' | 'variant' | 'fuzzy' | 'missing';
  where: 'recent' | 'skills' | 'old' | 'none';
}

export interface JobApplyResumeScore extends JobApplySuggestion {
  components: Record<string, JobApplyComponent>;
  terms: JobApplyTermHit[];
  uploadedAt?: string | null;
}

export interface JobApplyRowDetail extends JobApplyRow {
  scores: JobApplyResumeScore[];
  extraction: Record<string, unknown> | null;
  jdText: string | null;
  /** Who last corrected this job's URL; null when nobody did. */
  info: { editedBy: string; editedAt: string; /** false: this job was read before the correction (sync the run). */ applied: boolean } | null;
}

/** What a person corrected; only the fields sent change. null clears postedDate / timezoneNote. */
export interface JobApplyInfoPatch {
  title?: string;
  company?: string;
  workMode?: 'remote' | 'hybrid' | 'onsite' | 'unknown';
  allowedLocations?: { kind: 'country' | 'region'; value: string }[];
  postedDate?: string | null;
  clearance?: 'required' | 'preferred' | 'none';
  timezoneNote?: string | null;
  jdText?: string;
}

/** The job sheet: an uploaded .xlsx/.csv, or a Google Sheets link shared as "Anyone with the link". */
export type JobApplySource = { file: File } | { sheetUrl: string };

/** Without `selection` the run checks the jobs and waits at 'screened' for profiles per location group. */
export const createJobApplyRun = (
  source: JobApplySource,
  opts: { maxAgeDays: number; selection?: { accountId: string; resumeIds: string[] }[]; threshold?: number },
) => {
  const form = new FormData();
  if ('file' in source) form.append('file', source.file);
  else form.append('sheetUrl', source.sheetUrl);
  if (opts.selection) form.append('selection', JSON.stringify(opts.selection));
  if (opts.threshold !== undefined) form.append('threshold', String(opts.threshold));
  form.append('maxAgeDays', String(opts.maxAgeDays));
  return apiFetch<{ runId: string; status: JobApplyRunStatus; total: number }>('/job-applies/runs', {
    method: 'POST',
    body: form,
    timeoutMs: 120_000,
  });
};

export const listJobApplyRuns = () => apiFetch<{ runs: JobApplyRun[] }>('/job-applies/runs');

export const getJobApplyRun = (id: string, appliedSince?: string) =>
  apiFetch<JobApplyRun>(`/job-applies/runs/${id}${qs({ appliedSince })}`);

export const listJobApplyRows = (
  id: string,
  params: {
    view?: JobApplyView;
    applied?: JobApplyAppliedFilter;
    accountId?: string;
    minScore?: number;
    page?: number;
    limit?: number;
    screen?: JobApplyScreenBucket;
  } = {},
) => apiFetch<{ rows: JobApplyRow[]; pagination: Pagination }>(`/job-applies/runs/${id}/rows${qs(params)}`);

export const getJobApplyRow = (rowId: string) => apiFetch<JobApplyRowDetail>(`/job-applies/rows/${rowId}`);

/** Correct a job's parsed info and/or description. Saved for the URL, so everyone sees it. */
export const updateJobApplyRowInfo = (rowId: string, patch: JobApplyInfoPatch) =>
  apiFetch<JobApplyRowDetail>(`/job-applies/rows/${rowId}/info`, { method: 'PUT', body: JSON.stringify(patch) });

/** Re-read the run's jobs whose link was corrected by someone after they were read (no fetch, no AI call). */
export const syncJobApplyRunInfo = (runId: string) => postJSON<{ updated: number }>(`/job-applies/runs/${runId}/sync-info`, {});

/** Drop the correction and read the job again with the AI (the run goes back to checking). */
export const resetJobApplyRowInfo = (rowId: string) => del<{ ok: boolean }>(`/job-applies/rows/${rowId}/info`);

export const updateJobApplyRun = (id: string, body: { threshold?: number; maxAgeDays?: number }) =>
  apiFetch<JobApplyRun>(`/job-applies/runs/${id}`, { method: 'PATCH', body: JSON.stringify(body) });

export interface JobApplyScreeningGroup {
  /** Candidate market: 'US', 'UKEU', 'LATAM', or 'none' (no stated location). */
  key: string;
  jobs: number;
  /** Of `jobs`, how many need a check (no date, work mode or location not stated, or included anyway). */
  check: number;
  /** Profile ids whose country/region fits this group. */
  fits: string[];
}

export interface JobApplyScreeningProfile {
  id: string;
  name: string;
  country: string | null;
  region: string | null;
  resumes: number;
}

export interface JobApplyScreening {
  total: number;
  worth: number;
  check: number;
  buckets: Record<JobApplyScreenBucket, number>;
  maxAgeDays: number;
  groups: JobApplyScreeningGroup[];
  /** Jobs open only to candidates outside the markets, per location group (counted, not scored). */
  others: { key: string; jobs: number }[];
  /** Each worthwhile job once, by the set of markets it's in ('none' = no stated location). */
  combos?: { markets: string[]; jobs: number; check: number }[];
  profiles: JobApplyScreeningProfile[];
}

export const getJobApplyScreening = (id: string) => apiFetch<JobApplyScreening>(`/job-applies/runs/${id}/screening`);

export const startJobApplyRun = (
  id: string,
  body: {
    assignments: Record<string, string[]>;
    selection: { accountId: string; resumeIds: string[] }[];
    threshold: number;
  },
) => postJSON<JobApplyRun>(`/job-applies/runs/${id}/start`, body);

/**
 * Approve a job (`include: true`) so it moves to Worth applying whatever the checks said, or undo the approval.
 * Only jobs that were read can be approved; the server answers 400 otherwise.
 */
export const setJobApplyRowInclude = (rowId: string, include: boolean) =>
  apiFetch<JobApplyRow>(`/job-applies/rows/${rowId}/include`, { method: 'PUT', body: JSON.stringify({ include }) });

export const cancelJobApplyRun = (id: string) => postJSON<JobApplyRun>(`/job-applies/runs/${id}/cancel`, {});

export const retryJobApplyRun = (id: string) => postJSON<{ reset: number }>(`/job-applies/runs/${id}/retry-failed`, {});

export const deleteJobApplyRun = (id: string) => del<{ ok: boolean }>(`/job-applies/runs/${id}`);

/** Mark or unmark one resume as applied for one job (also recorded in the permanent applied log). */
export const setJobApplyResumeApplied = (
  rowId: string,
  body: { accountId: string; resumeId?: string; tailoredJobId?: string; applied: boolean },
) =>
  apiFetch<{ _id: string; appliedResumes: JobApplyAppliedMark[] }>(`/job-applies/rows/${rowId}/applied`, {
    method: 'PUT',
    body: JSON.stringify(body),
  });

export interface JobApplyMarkRef {
  rowId: string;
  accountId: string;
  resumeId?: string;
  tailoredJobId?: string;
}

/**
 * Mark the top suggestion applied for the given jobs, or with `all` for every job still to apply to (all pages;
 * `accountId` limits it to that profile's best resume). Returns the marks made so they can be undone.
 */
export const markTopJobApplied = (runId: string, body: { rowIds?: string[]; all?: boolean; accountId?: string }) =>
  postJSON<{ marked: number; marks: JobApplyMarkRef[] }>(`/job-applies/runs/${runId}/mark-top-applied`, body);

/** Undo a bulk mark: removes exactly these marks. */
export const unmarkJobApplied = (runId: string, marks: JobApplyMarkRef[]) =>
  postJSON<{ unmarked: number }>(`/job-applies/runs/${runId}/unmark-applied`, { marks });

/** Queue a tailored resume for one job (default: the best-scoring profile). Blank models = server default. */
export const tailorJobApplyRow = (
  rowId: string,
  body: { accountId?: string; coverLetter?: boolean; coverLetterModel?: string } = {},
) => postJSON<{ tailored: JobApplyTailored }>(`/job-applies/rows/${rowId}/tailor`, body);

/**
 * Queue a tailored resume for each job still to apply to (or only the `rowIds` given) × each chosen profile it's
 * open to (skipping ones that already have one), up to the daily cap. `dryRun` only returns the counts.
 */
export const tailorAllJobApplies = (
  runId: string,
  body: {
    accountIds?: string[];
    rowIds?: string[];
    coverLetter?: boolean;
    coverLetterModel?: string;
    dryRun?: boolean;
  } = {},
) =>
  postJSON<{ queued: number; skippedCap: number; skipped: number }>(`/job-applies/runs/${runId}/tailor-all`, body);

/** Download a generated (tailored) resume PDF by its generation job id. */
export async function downloadTailoredResume(jobId: string, filename: string): Promise<void> {
  const token = getToken();
  const res = await fetch(`${BASE_URL}/resume/jobs/${jobId}/download?format=pdf`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (!res.ok) {
    let message = `HTTP ${res.status}`;
    try { const data = await res.json(); message = data.error || data.detail || message; } catch { /* ignore */ }
    throw new Error(message);
  }
  _saveBlob(await res.blob(), filename);
}

export interface JobSheetPreview {
  title: string;
  /** Unique jobs (links after cleaning and de-duplication). */
  total: number;
  withDescription: number;
  urlOnly: number;
  /** Links found in the sheet, before de-duplication. */
  links?: number;
  duplicates?: number;
  /** Links whose URL was cleaned (tracking params, apply pages…). */
  cleaned?: number;
  /** Link-only jobs on sites that block automated access (LinkedIn, Indeed, Glassdoor…). */
  blocked?: number;
}

/** Read a job sheet (link or file) without starting a run: job counts, or a 400 explaining the problem. */
export const previewJobSheet = (source: JobApplySource) => {
  const form = new FormData();
  if ('file' in source) form.append('file', source.file);
  else form.append('sheetUrl', source.sheetUrl);
  return apiFetch<JobSheetPreview>('/job-applies/sheet-preview', { method: 'POST', body: form, timeoutMs: 60_000 });
};

export interface JobApplyExportResult {
  /** Rows that would be / were added: applications with a resume to send. */
  ready: number;
  added: number;
  /** Applications waiting for their tailored resume: a later export adds them. */
  waiting: number;
  alreadyExported: number;
  /** Matching uploaded resumes whose original PDF isn't stored (no link possible). */
  noFile: number;
  sheetTitle: string;
  tab: string;
  sheetUrl: string;
  serviceAccount: string | null;
}

export interface JobApplyChecksExport {
  tab: string;
  jobs: number;
  sheetTitle: string;
  sheetUrl: string;
  serviceAccount: string | null;
}

/**
 * Write every job in the run with what the checks found to the run's own "Checks · …" tab of the shared Google
 * Sheet (replacing what an earlier export wrote there). Available once the jobs are checked; `dryRun` only counts.
 */
export const exportJobApplyChecks = (runId: string, body: { sheetUrl?: string; dryRun?: boolean } = {}) =>
  postJSON<JobApplyChecksExport>(`/job-applies/runs/${runId}/export-checks`, body, { timeoutMs: 120_000 });

/**
 * Append the run's applications with a resume to send (one row per job × profile: Profile, Company Name, Job Title,
 * Job URL, Download Resume) to today's "Apply · <date>" tab of the shared Google Sheet. Without `sheetUrl` the last one
 * used is reused; `dryRun` only counts and checks access.
 */
export const exportJobApplySheet = (runId: string, body: { sheetUrl?: string; dryRun?: boolean } = {}) =>
  postJSON<JobApplyExportResult>(`/job-applies/runs/${runId}/export-sheet`, body, { timeoutMs: 120_000 });

// ---------- bidders ----------

export interface Bidder {
  _id: string;
  name: string;
  country: string | null;
  profileId: string | null;
  profileName: string | null;
  rate: number;
  screenshotFolderUrl: string;
  folder: string | null;
  status: 'invited' | 'active' | 'archived';
  username: string | null;
  inviteExpiresAt: string | null;
  registeredAt: string | null;
  archivedAt: string | null;
  createdAt: string;
}

export type BidderInput = Pick<Bidder, 'name' | 'country' | 'profileId' | 'rate'>;

export interface BidderInvite {
  code: string;
  expiresAt: string;
}

export interface BidderLiveCount {
  today: number | null;
  week: number | null;
  error: string | null;
}

export interface BidReport {
  kind: 'daily' | 'weekly';
  periodKey: string;
  periodStart: string;
  periodEnd: string;
  count: number | null;
  rate: number;
  amount: number | null;
  error: string | null;
}

export const listBidders = (archived = false) =>
  apiFetch<{ bidders: Bidder[] }>(`/bidders${qs({ archived })}`);

export const createBidder = (body: BidderInput) =>
  postJSON<{ bidder: Bidder; invite: BidderInvite }>('/bidders', body);

export const newBidderInvite = (id: string) => postJSON<BidderInvite>(`/bidders/${id}/invite`, {});

export const resetBidderLogin = (id: string) => postJSON<BidderInvite>(`/bidders/${id}/reset-login`, {});

export const updateBidder = (id: string, body: BidderInput) => putJSON<Bidder>(`/bidders/${id}`, body);

export const archiveBidder = (id: string) => del<null>(`/bidders/${id}`);

export const bidderLiveCounts = () => apiFetch<Record<string, BidderLiveCount>>('/bidders/live-counts');

export const bidderReports = (id: string, kind: 'daily' | 'weekly', limit = 30) =>
  apiFetch<{ reports: BidReport[] }>(`/bidders/${id}/reports${qs({ kind, limit })}`);
