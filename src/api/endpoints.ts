import { apiFetch, BASE_URL, getToken, type ApiFetchOptions } from './client';

// ---------- shared types ----------

export interface User {
  id: string;
  name: string | null;
  email: string | null;
  role: 'admin' | 'staff' | 'interview_manager';
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
  slackConnected?: boolean;
  slackTimezone?: string;
  slackBotConfigured?: boolean;
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

export type SlackStatus = {
  slackConnected: boolean;
  /** The member ID the user typed (U…); used for @-mentions and the test DM. */
  slackUserId: string | null;
  slackTimezone: string;
  slackTimezones?: { value: string; label: string }[];
  slackBotConfigured: boolean;
};

export const getSlackStatus = () => apiFetch<SlackStatus>('/integrations/slack/status');

/** `slackUserId`: a member ID like U04ABC12345; null or '' clears it. 409 when another user has it. */
export const updateSlackPrefs = (body: {
  slackUserId?: string | null;
  slackTimezone?: string;
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

/** `bidsSelf` is the self total: the US / EU / LATAM sum, or a total saved
 *  before self bids were split by region. */
export interface Bids {
  bidsSelf: number;
  bidsSelfUs: number;
  bidsSelfEu: number;
  bidsSelfLatam: number;
  bidsBidder: number;
}

export interface Counts extends Bids {
  interviewsSelf: number;
  interviewsCaller: number;
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
  /** The profile's resume units (template + prompt), without their texts; missing from older backends. */
  units?: JobApplyPromptOption[];
  defaultPromptId?: string | null;
}

export const lookupAccounts = () =>
  apiFetch<{ accounts: AccountLookup[] }>('/accounts/lookup');

// ---------- users lookup (filter dropdowns; available to all authed users) ----------

export const lookupUsers = (params?: { excludeRole?: string }) =>
  apiFetch<{ users: { _id: string; name: string | null; email: string | null; role?: string; isActive?: boolean }[] }>(
    `/users/lookup${qs(params)}`
  );

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
  /** Caller rounds only: the assigned caller (null = not assigned yet, or a name typed before the caller list). */
  callerId?: string | null;
  /** Caller rounds only; "TBD" when no caller is assigned yet. */
  callerName?: string | null;
}

export const listInterviewRounds = (params: {
  from: string;
  to: string;
  creatorId?: string;
  accountId?: string;
  stage?: string;
  status?: string;
  /** 'true': caller rounds only (the Callers calendar). */
  callerOnly?: string;
  /** One caller's rounds; 'unassigned' = no caller yet. */
  callerId?: string;
}) => apiFetch<{ rounds: InterviewRoundRow[]; interviews: Record<string, Record<string, unknown>> }>(
  `/interviews/rounds${qs(params)}`,
);

/** Callers list: every user's caller rounds, one row per round, paginated (from / to optional, inclusive). */
export const listCallerRounds = (params: {
  from?: string;
  to?: string;
  stage?: string;
  status?: string;
  callerId?: string;
  page: number;
  limit: number;
  dir: 'asc' | 'desc';
}) => apiFetch<{ rounds: InterviewRoundRow[]; interviews: Record<string, Record<string, unknown>>; pagination: Pagination }>(
  `/interviews/caller-rounds${qs(params)}`,
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

/** Caller request on a round: a caller joins at the round's start time. */
export interface InterviewCaller {
  enabled: boolean;
  callerName?: string;
  /** From the caller list; null = not assigned yet, or a name typed before the list existed. */
  callerId?: string | null;
  /** Round start (UTC ISO). */
  startsAt?: string | null;
  method?: CallerMethod | null;
  methodValue?: string;
  slackChannelTs?: string | null;
}

export interface CallerInput {
  enabled: boolean;
  callerName?: string;
  /** From the caller list ('' = not assigned). Left out = the round keeps its caller. */
  callerId?: string;
  method?: string;
  methodValue?: string;
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

/** Why an interview has no linked resume. `fixed_resume` is no longer offered (forks replaced it); old links keep it. */
export type NoMatchReason = 'fixed_resume' | 'outside_app' | 'recruiter' | 'referral' | 'name_differs' | 'other';

/** The resume and job an interview came from, frozen when linked (for interview statistics). */
export interface InterviewResumeLink {
  /** fixed: a Job Applies fixed-resume fork. */
  kind: 'tailored' | 'fixed' | 'uploaded' | 'none';
  linkedBy: 'user' | 'auto';
  linkedAt?: string | null;
  resumeJobId?: string | null;
  appliedLogId?: string | null;
  resumeId?: string | null;
  matchedCompany?: string | null;
  source?: 'generator' | 'job_applies' | null;
  filename?: string | null;
  promptName?: string | null;
  resumeModel?: string | null;
  appliedAt?: string | null;
  /** Left out of list and calendar feeds; GET /interviews/{id} and the match preview have it. */
  jobDescription?: string | null;
  jobUrl?: string | null;
  score?: JobApplyTailoredMatch | null;
  reason?: NoMatchReason | null;
  reasonNote?: string | null;
}

/** One company-search result: a generated resume (`t:`) or an uploaded-resume application (`u:`). */
export interface ResumeMatch {
  matchId: string;
  kind: 'tailored' | 'fixed' | 'uploaded';
  company: string;
  appliedAt: string | null;
  filename?: string | null;
  source: 'generator' | 'job_applies';
  promptName?: string | null;
  jobUrl?: string | null;
  score?: JobApplyTailoredMatch | null;
}

/** What the form sends: the picked search result, or that none was found and why. */
export type ResumeLinkInput = { matchId: string } | { none: true; reason: NoMatchReason; note?: string };

export const searchResumeMatches = (accountId: string, q: string) =>
  apiFetch<{ matches: ResumeMatch[] }>(`/interviews/resume-matches${qs({ accountId, q })}`);

export const getResumeMatch = (accountId: string, matchId: string) =>
  apiFetch<InterviewResumeLink>(`/interviews/resume-matches/${encodeURIComponent(matchId)}${qs({ accountId })}`);

export interface CreateInterviewBody {
  accountId: string;
  companyName: string;
  appliedPosition?: string;
  jobUrl?: string;
  round: RoundInput;
  resumeLink?: ResumeLinkInput;
}

/** Application-level fields, or a status-only update of the current round. */
export type UpdateInterviewBody =
  | { accountId?: string; companyName?: string; appliedPosition?: string; jobUrl?: string; resumeLink?: ResumeLinkInput }
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
  /** Caller rounds: the caller is lined up. Cleared when the round's time changes. */
  confirmed?: boolean;
}

/** `confirmed` only on caller rounds (owner or admin). */
export type InterviewStageInput = Partial<RoundInput> & { confirmed?: boolean };

export const addInterviewStage = (id: string, body: RoundInput & { markPreviousPassed?: boolean }) =>
  postJSON<Record<string, unknown>>(`/interviews/${id}/stages`, body);

export const updateInterviewStage = (id: string, stageId: string, body: InterviewStageInput) =>
  apiFetch<Record<string, unknown>>(`/interviews/${id}/stages/${stageId}`, {
    method: 'PATCH',
    body: JSON.stringify(body),
  });

export const deleteInterviewStage = (id: string, stageId: string) =>
  del<Record<string, unknown>>(`/interviews/${id}/stages/${stageId}`);

/** Admin / interview manager: assign a caller round's caller ('' = not assigned yet), on anyone's interview. */
export const assignRoundCaller = (id: string, stageId: string, callerId: string) =>
  putJSON<Record<string, unknown>>(`/interviews/${id}/stages/${stageId}/caller`, { callerId });

// ---------- callers ----------

export type CallerColor = 'sky' | 'violet' | 'emerald' | 'amber' | 'rose' | 'teal' | 'indigo' | 'orange';

export interface Caller {
  _id: string;
  name: string;
  color: CallerColor;
}

/** Everyone reads the list; `canManage` = Admin or interview manager (add, edit, delete). */
export const listCallers = () => apiFetch<{ callers: Caller[]; canManage: boolean }>('/callers');
export const createCaller = (body: { name: string; color?: CallerColor }) => postJSON<Caller>('/callers', body);
export const updateCaller = (id: string, body: { name?: string; color?: CallerColor }) => putJSON<Caller>(`/callers/${id}`, body);
export const deleteCaller = (id: string) => del<void>(`/callers/${id}`);

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

export type DashboardCompareRange = 'week' | 'month' | '30d';

export interface DashboardCompareMetric {
  /** Everyone ranked, highest first; ties share a rank. */
  rows: {
    userId: string;
    name: string;
    image?: string | null;
    value: number;
    rank: number;
  }[];
  /** The viewed user's place; nulls when an admin views nobody. */
  subject: { rank: number | null; value: number | null; outOf: number };
}

export interface DashboardCompare {
  range: DashboardCompareRange;
  from: string;
  to: string;
  subjectId: string;
  metrics: {
    bids: DashboardCompareMetric;
    interviews: DashboardCompareMetric;
    earnings: DashboardCompareMetric;
  };
}

export const getDashboardCompare = (params: { range: DashboardCompareRange; userId?: string; today?: string }) =>
  apiFetch<DashboardCompare>(`/dashboard/compare${qs(params)}`);

export interface DashboardTeamStats {
  bids: number;
  bidsSelf: number;
  bidsBidder: number;
  interviews: number;
  earnings: number;
  goalBidsPct: number | null;
  goalInterviewsPct: number | null;
  logged: number;
  workingDays: number;
}

export interface DashboardTeam {
  range: DashboardCompareRange;
  from: string;
  to: string;
  totals: DashboardTeamStats;
  /** Active non-admin users, by bids (high first). */
  users: (DashboardTeamStats & { userId: string; name: string; image?: string | null; streak: number })[];
}

/** Admins only. */
export const getDashboardTeam = (params: { range: DashboardCompareRange; today?: string }) =>
  apiFetch<DashboardTeam>(`/dashboard/team${qs(params)}`);

export type AiUsageBucket = 'hour' | 'day';

export interface AiUsageTotals {
  costUsd: number;
  calls: number;
  inputTokens: number;
  outputTokens: number;
  /** Part of costUsd rebuilt from older records with an estimated per-step split. */
  estimatedCostUsd: number;
  /** Calls on models without a catalog price (counted at $0). */
  unpricedCalls: number;
}

export interface AiUsageReport {
  from: string;
  to: string;
  tz: string;
  bucket: AiUsageBucket;
  totals: AiUsageTotals;
  /** One point per bucket, labelled in `tz` ("2026-10-14T13:00" or "2026-10-14"); cost split three ways. */
  series: {
    bucket: string;
    costUsd: number;
    calls: number;
    byFeature: Record<string, number>;
    byModel: Record<string, number>;
    byUser: Record<string, number>;
  }[];
  /** user x feature x model, most expensive first. userId null = unattributed. */
  rows: {
    userId: string | null;
    userName: string;
    feature: string;
    model: string;
    calls: number;
    inputTokens: number;
    outputTokens: number;
    costUsd: number;
    estimated: boolean;
  }[];
  /** Everything present in the period, ignoring the filters. User id "unattributed" = no user. */
  options: { users: { id: string; name: string }[]; features: string[]; models: string[] };
}

export interface AiUsageParams {
  from: string;
  to: string;
  tz: string;
  userId?: string[];
  feature?: string[];
  model?: string[];
}

/** Admins only. List filters repeat the key (?feature=a&feature=b), which `qs` doesn't do. */
export const getAiUsage = (params: AiUsageParams) => {
  const search = new URLSearchParams({ from: params.from, to: params.to, tz: params.tz });
  for (const key of ['userId', 'feature', 'model'] as const) {
    for (const value of params[key] ?? []) search.append(key, value);
  }
  return apiFetch<AiUsageReport>(`/ai-usage?${search.toString()}`);
};

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
export type ModelTask = 'resume' | 'cover_letter' | 'screening' | 'judge';
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
  /** Job Applies: the score shown beside it there (this resume vs its job); null for others or until scored. */
  matchScore?: JobApplyTailoredMatch | null;
  /** Job Applies fixed-resume fork: the profile's uploaded resume (this id) copied for the job; not a generation. */
  fixedFrom?: string | null;
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
  /** The profile's resume unit to generate with; omitted = its default unit. */
  promptId?: string;
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

// ---------- resume prompt evaluator ----------

export type EvalRole = 'fullstack' | 'frontend' | 'backend' | 'ai' | 'ml' | 'llm' | 'data' | 'test' | 'senior_swe' | 'staff_swe';
export const EVAL_ROLES: EvalRole[] = ['fullstack', 'frontend', 'backend', 'ai', 'ml', 'llm', 'data', 'test', 'senior_swe', 'staff_swe'];

/** A sample posting in the shared library; seeds carry a `seedKey`. */
export interface EvalJobDescription {
  _id: string;
  role: EvalRole;
  title: string;
  company: string;
  text: string;
  seedKey?: string | null;
  createdBy?: string | null;
  archived: boolean;
  archivedAt?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface JudgeVerdict {
  /** 0-100 fit for the posting; location and work authorization are ignored by the judge. */
  matchScore: number;
  /** 0-100: reads like a real engineer's own resume. */
  believabilityScore: number;
  matchNotes: string[];
  believabilityNotes: string[];
  missingRequirements: string[];
  redFlags: string[];
  strengths: string[];
  summary: string;
  /** Rules judge only: the parts behind each score. */
  matchParts?: ScorePart[];
  believabilityParts?: ScorePart[];
}

/** One part of a rules-judge score: 0-100 on its own, `weight` points of the total. */
export interface ScorePart {
  key: string;
  label: string;
  score: number;
  weight: number;
  detail: string;
}

/** `llm` asks a judge model per resume; `rules` scores the way Job Applies does, with one cached JD reading. */
export type JudgeMode = 'llm' | 'rules';

/** `single`: one resume unit on every JD. `profile`: each JD gets the unit Job Applies would pick, or an override. */
export type PromptMode = 'single' | 'profile';
/** How a row's unit was chosen: by the Job Applies routing, by hand, or the run's one unit. */
export type UnitPick = 'auto' | 'manual' | 'single';

/** A resume unit as a run used it. `body` (the prompt text the run froze) is left out of the runs list. */
export interface EvalUnit {
  id: string;
  name: string;
  roles: string[];
  body?: string;
  templateName: string;
  /** The run's prompt differs from the unit's saved prompt. */
  edited: boolean;
}

/** A profile's unit as the eval form lists it. */
export interface EvalRouteUnit {
  id: string;
  name: string;
  roles: PromptRole[];
  body: string;
  templateName: string;
  hasTemplate: boolean;
}

export interface EvalRoute {
  jdId: string;
  unitId: string;
  unitName: string;
  pick: Exclude<UnitPick, 'single'>;
  reason: string;
}

export type PromptEvalRowStatus = 'pending' | 'generating' | 'judging' | 'done' | 'failed';
export type PromptEvalRunStatus = 'running' | 'done' | 'failed';
export type PromptEvalPromptSource = 'custom' | 'profile' | 'global' | 'none';

export interface PromptEvalRow {
  jdId: string;
  role: EvalRole;
  jdTitle: string;
  jdCompany: string;
  /** The resume unit that generated this row; missing on runs from before units. */
  unitId?: string | null;
  unitName?: string | null;
  unitPick?: UnitPick | null;
  unitReason?: string | null;
  status: PromptEvalRowStatus;
  error?: string | null;
  genModelId?: string | null;
  genProvider?: LlmProvider | null;
  genModel?: string | null;
  genFallbackUsed: boolean;
  /** The resume came from a cache (Redis or Mongo): identical prompt + JD + model, no model call. */
  genCached: boolean;
  genInputTokens?: number | null;
  genOutputTokens?: number | null;
  genCostUsd?: number | null;
  judgeModelId?: string | null;
  judgeProvider?: LlmProvider | null;
  judgeModel?: string | null;
  judgeFallbackUsed: boolean;
  judgeCached: boolean;
  judgeInputTokens?: number | null;
  judgeOutputTokens?: number | null;
  judgeCostUsd?: number | null;
  /** Only on GET /runs/{id}; the list leaves these out. */
  resumeText?: string | null;
  resumeHtml?: string | null;
  verdict?: JudgeVerdict | null;
  durationMs?: number | null;
}

export interface PromptEvalRoleScore {
  match: number | null;
  believability: number | null;
  n: number;
}

export interface PromptEvalRun {
  _id: string;
  userId: string;
  accountId: string;
  accountName: string;
  label?: string | null;
  /** The custom prompt text the run actually used (snapshot). */
  promptBody: string;
  promptSource: PromptEvalPromptSource;
  resumeModelId?: string | null;
  judgeModelId?: string | null;
  /** Missing on runs made before the rules judge existed. */
  judgeMode?: JudgeMode;
  /** Missing on runs made before resume units: read as `single` on the default unit. */
  promptMode?: PromptMode;
  units?: EvalUnit[];
  /** JD id -> unit id picked by hand. */
  unitOverrides?: Record<string, string>;
  status: PromptEvalRunStatus;
  error?: string | null;
  startedAt: string;
  finishedAt?: string | null;
  durationMs?: number | null;
  rows: PromptEvalRow[];
  counts: { total: number; done: number; failed: number };
  avgMatch?: number | null;
  avgBelievability?: number | null;
  roleScores: Partial<Record<EvalRole, PromptEvalRoleScore>>;
  /** By unit id. */
  unitScores?: Record<string, PromptEvalRoleScore>;
  totalCostUsd: number;
  cachedRows: number;
  cachedJudgeRows: number;
  createdAt: string;
  updatedAt: string;
}

export const listEvalJds = (params?: { role?: EvalRole; includeArchived?: boolean }) =>
  apiFetch<{ roles: EvalRole[]; jds: EvalJobDescription[] }>(`/resume/eval/jds${qs(params)}`);

export const createEvalJd = (body: { role: EvalRole; title: string; company: string; text: string }) =>
  postJSON<EvalJobDescription>('/resume/eval/jds', body);

export const updateEvalJd = (id: string, body: Partial<{ role: EvalRole; title: string; company: string; text: string }>) =>
  putJSON<EvalJobDescription>(`/resume/eval/jds/${id}`, body);

export const archiveEvalJd = (id: string) => postJSON<EvalJobDescription>(`/resume/eval/jds/${id}/archive`, {});

export const unarchiveEvalJd = (id: string) => postJSON<EvalJobDescription>(`/resume/eval/jds/${id}/unarchive`, {});

/** Starts a run (202). `promptBody` undefined = the saved profile/global prompt; a string (even '') is used as is. */
export const createPromptEvalRun = (body: {
  accountId: string;
  promptBody?: string;
  resumeModel?: string;
  judgeModel?: string;
  judgeMode?: JudgeMode;
  promptMode?: PromptMode;
  /** Single mode: the unit to test; undefined = the default unit. */
  unitId?: string;
  /** Profile mode: prompt text per unit id for this run (missing = the saved prompt). */
  unitPrompts?: Record<string, string>;
  unitOverrides?: Record<string, string>;
  roles?: EvalRole[];
  jdIds?: string[];
  label?: string;
}) => postJSON<{ runId: string; status: PromptEvalRunStatus; jdCount: number }>('/resume/eval/runs', body);

/** Which unit each JD would get in a whole-profile run, and why. Keyword based: no model call, no cost. */
export const routeEvalJds = (body: { accountId: string; jdIds: string[]; overrides?: Record<string, string> }) =>
  postJSON<{ defaultUnitId: string; units: EvalRouteUnit[]; routes: EvalRoute[] }>('/resume/eval/route', body);

export const listPromptEvalRuns = (params?: { accountId?: string; page?: number; limit?: number }) =>
  apiFetch<{ runs: PromptEvalRun[]; pagination: Pagination }>(`/resume/eval/runs${qs(params)}`);

export const getPromptEvalRun = (id: string) => apiFetch<PromptEvalRun>(`/resume/eval/runs/${id}`);

export const deletePromptEvalRun = (id: string) => del<{ ok: boolean }>(`/resume/eval/runs/${id}`);

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
/** Where screening put a job: worth applying to (valid; scored) or why not. A 'check' job is scored once approved. */
export type JobApplyScreenBucket =
  | 'valid'
  | 'check'
  | 'closed'
  | 'not_fetched'
  | 'read_failed'
  | 'not_job'
  | 'clearance'
  | 'invalid_role'
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
  /** The HTML template tailored resumes are written into; without one the profile can't be tailored. */
  hasTemplate?: boolean;
  templateName?: string | null;
  /** The profile's resume prompts (no text) and its default, for the Prompt column. */
  prompts?: JobApplyPromptOption[];
  defaultPromptId?: string | null;
}

/** A job role a resume prompt is written for. */
export type PromptRole = 'fullstack' | 'frontend' | 'backend' | 'devops' | 'data' | 'ml' | 'mobile' | 'qa';

/** A profile's resume unit: an HTML template, the prompt written for it, and the job roles it is meant for. */
export interface ResumePrompt {
  id: string;
  name: string;
  /** Job roles this unit is for; none = all roles (general). */
  roles: PromptRole[];
  /** Before units had several roles: read as `[role]`. */
  role?: PromptRole | null;
  body: string;
  /** The unit's HTML template; empty / null = none. */
  templateHtml?: string | null;
  templateName?: string | null;
  pageFormat?: string;
  updatedAt?: string;
}

/** A profile's resume unit as Job Applies lists it (no prompt text or template HTML). */
export interface JobApplyPromptOption {
  id: string;
  name: string;
  roles: PromptRole[];
  role?: PromptRole | null;
  hasTemplate?: boolean;
  templateName?: string | null;
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
  /** Applications with a resume to send that aren't in your saved sheet yet. */
  toExport?: number;
  /** Applications with a resume to send already in a sheet: they can still be exported to another sheet. */
  exportedReady?: number;
  /** Applications to go whose uploaded resume scores at or above the minimum score: no tailoring needed. */
  noTailorNeeded?: number;
  /** Applications to go with no uploaded resume, or only ones below the minimum score: they need a tailored one. */
  tailorNeeded?: number;
  applied: number;
  /** Has a resume to apply with: the tailored one when done, else an uploaded one at or above the minimum score. */
  ready: number;
  /** Ready applications sending a template resume at or above the minimum score. */
  readyTemplate?: number;
  /** Ready applications sending a tailored resume. */
  readyTailored?: number;
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
  /** The tailored resume scored against this job, the way uploaded resumes are; null until scored. */
  match?: JobApplyTailoredMatch | null;
  /** This profile's best uploaded resume on this job (even below the threshold), to compare with. */
  uploadedScore?: number | null;
  /** The resume unit (prompt) and HTML template it was tailored with. */
  promptName?: string | null;
  templateName?: string | null;
  /** A fixed-resume fork: the best uploaded resume (this id), copied for the job instead of tailoring. */
  fixedFrom?: string | null;
}

export interface JobApplyTailoredMatch {
  total: number;
  band: ScoreBand;
  knockouts: string[];
  /** The job's terms the resume doesn't show, heaviest first. */
  missing: string[];
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

/** One uploaded resume's score on a job (every resume, not just each profile's best). */
export interface JobApplyResumeScore {
  accountId: string;
  resumeId: string;
  filename: string;
  total: number;
  band: ScoreBand;
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
  /** A person moved it out of Worth applying: it is in Invalid role (even if approved) and is not scored. */
  markedInvalid?: boolean;
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
  /** Every uploaded resume's score, best first within each profile. */
  resumeScores?: JobApplyResumeScore[];
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
  /** The job's roles (strongest first, up to 3), read from its title and skills; `reason` explains them. */
  jobRole?: { roles: PromptRole[]; reason: string };
  /** Per profile: the suggested prompt for this job and the user's choice (null = none / no longer exists). */
  prompt?: Record<string, { suggestedId: string | null; chosenId: string | null }>;
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
  /** Jobs that will be scored: Worth applying (passed every check, or approved). */
  worth: number;
  /** Jobs that need a check: not scored until approved. */
  check: number;
  buckets: Record<JobApplyScreenBucket, number>;
  maxAgeDays: number;
  groups: JobApplyScreeningGroup[];
  /** Jobs open only to candidates outside the markets, per location group (counted, not scored). */
  others: { key: string; jobs: number }[];
  /** Each worthwhile job once, by the set of markets it's in ('none' = no stated location). */
  combos?: { markets: string[]; jobs: number }[];
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

/**
 * Move a Worth applying job to Invalid role (`invalid: true`), or back. Only before scoring starts, and only from
 * Worth applying; the server answers 409 / 400 otherwise. Shared per job link, like an approval.
 */
export const setJobApplyRowInvalid = (rowId: string, invalid: boolean) =>
  apiFetch<JobApplyRow>(`/job-applies/rows/${rowId}/invalid`, { method: 'PUT', body: JSON.stringify({ invalid }) });

/** Choose the resume prompt a profile tailors this job with; choosing the suggested one clears the choice. */
export const setJobApplyRowPrompt = (rowId: string, body: { accountId: string; promptId: string }) =>
  apiFetch<JobApplyRow>(`/job-applies/rows/${rowId}/prompt`, { method: 'PUT', body: JSON.stringify(body) });

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

/** A resume to download from Tailor & apply, and where it goes (`<Profile>/<Company>` + `Resume.pdf`). */
export type JobApplyDownloadFile =
  | { kind: 'tailored'; tailoredJobId: string; folder: string; filename: string }
  | { kind: 'uploaded'; rowId: string; accountId: string; resumeId: string; folder: string; filename: string };

export interface JobApplyDownloadRequest {
  /** Selected jobs: each profile's tailored resume when ready, else its highest template resume at or above the minimum. */
  rowIds?: string[];
  /** Only this profile's resumes on those jobs. */
  accountId?: string;
  /** Tailored resumes picked by hand. */
  tailoredJobIds?: string[];
  /** Exactly these files (a single download). */
  files?: ({ kind: 'tailored'; tailoredJobId: string } | { kind: 'uploaded'; rowId: string; accountId: string; resumeId: string })[];
}

/**
 * Download resumes from Tailor & apply the way the Resume page does: `<Profile>/<Company>/Resume.pdf` into a folder
 * the user picks (Chrome / Edge), else one zip with the same folders. Returns how many resumes were saved and how many
 * applications were skipped because they have no resume to send yet (below the minimum score, not tailored).
 */
export async function downloadJobApplyResumes(
  runId: string,
  body: JobApplyDownloadRequest,
): Promise<{ downloaded: number; skipped: number }> {
  const plan = await postJSON<{ files: JobApplyDownloadFile[]; skipped: number }>(`/job-applies/runs/${runId}/download-files`, body);
  if (!plan.files.length) return { downloaded: 0, skipped: plan.skipped };
  const token = getToken();
  const headers: Record<string, string> = token ? { Authorization: `Bearer ${token}` } : {};

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
      // Same as the Resume page: a few at a time, and one re-prompt if the folder handle goes stale mid-way.
      let currentDir: typeof dir | null = dir;
      let recovery: Promise<typeof dir | null> | null = null;
      const recoverDir = () =>
        (recovery ??= (async () => {
          fsa.resetDownloadDir();
          currentDir = await fsa.getDownloadDir();
          return currentDir;
        })());
      let downloaded = 0;
      const queue = [...plan.files];
      const workers = Array.from({ length: Math.min(5, queue.length) }, async () => {
        for (let f = queue.shift(); f; f = queue.shift()) {
          const url =
            f.kind === 'tailored'
              ? `${BASE_URL}/resume/jobs/${f.tailoredJobId}/download?format=pdf`
              : `${BASE_URL}/job-applies/rows/${f.rowId}/resume-file?${new URLSearchParams({ accountId: f.accountId, resumeId: f.resumeId })}`;
          const res = await fetch(url, { headers });
          if (!res.ok) continue;
          const blob = await res.blob();
          const folder = _sanitizeFolderPath(f.folder);
          try {
            if (!currentDir) break;
            await fsa.writeToFolder(currentDir, folder, f.filename, blob);
          } catch (err) {
            if (!fsa.isStaleHandleError(err)) throw err;
            const fresh = await recoverDir();
            if (!fresh) break;
            await fsa.writeToFolder(fresh, folder, f.filename, blob);
          }
          downloaded += 1;
        }
      });
      await Promise.all(workers);
      return { downloaded, skipped: plan.skipped };
    }
  }

  // Fallback: one zip with the same folders.
  const res = await fetch(`${BASE_URL}/job-applies/runs/${runId}/download-zip`, {
    method: 'POST',
    headers: { ...headers, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    let message = `HTTP ${res.status}`;
    try { const data = await res.json(); message = data.error || data.detail || message; } catch { /* ignore */ }
    throw new Error(message);
  }
  _saveBlob(await res.blob(), _filenameFromCD(res.headers.get('Content-Disposition'), 'resumes.zip'));
  return { downloaded: plan.files.length, skipped: plan.skipped };
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
  /** Of those rows: sending a template resume at or above the minimum score / a tailored resume. */
  readyTemplate?: number;
  readyTailored?: number;
  added: number;
  /** Applications waiting for their tailored resume: a later export adds them. */
  waiting: number;
  /** Of those: nothing tailored yet (no template at or above the minimum score) / being tailored now. */
  needsTailoring?: number;
  tailoring?: number;
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
  /** Bid-record days only; null for days still counted by Backblaze folders. */
  pending?: number | null;
  rejected?: number | null;
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

// ---------- bid review ----------

export type BidStatus = 'pending' | 'approved' | 'rejected';

export type RejectReason = 'no_submission' | 'wrong_profile' | 'not_job_page' | 'duplicate' | 'incomplete' | 'other';

/** Reject reasons in display order; `key` is the shortcut digit in the focus viewer. */
export const REJECT_REASONS: { value: RejectReason; label: string; key: '1' | '2' | '3' | '4' | '5' | '6' }[] = [
  { value: 'no_submission', label: 'No submission', key: '1' },
  { value: 'wrong_profile', label: 'Wrong profile/resume', key: '2' },
  { value: 'not_job_page', label: 'Not a job page', key: '3' },
  { value: 'duplicate', label: 'Duplicate', key: '4' },
  { value: 'incomplete', label: 'Incomplete', key: '5' },
  { value: 'other', label: 'Other', key: '6' },
];

export interface BidReviewItem {
  id: string;
  bidderId: string;
  bidderName: string;
  jobUrl: string | null;
  jobTitle: string | null;
  firstAt: string;
  submittedAt: string | null;
  screenshotCount: number;
  missingUploads: number;
  status: BidStatus;
  reviewedByName: string | null;
  reviewedAt: string | null;
  note: string | null;
  changedSinceReview: boolean;
  /** Host of jobUrl without `www.`. */
  jobDomain: string | null;
  /** Seconds from the first to the last screenshot. */
  durationSec: number;
  /** The bidder's assigned profile; null if none. */
  profileName: string | null;
  resumeNames: string[];
  /** Newest completed tailored resume for this job URL on that profile. */
  tailoredResumeName: string | null;
  rejectReason: RejectReason | null;
  /** Signed link to the Submit screenshot (else the last uploaded step); null if none. */
  thumbUrl: string | null;
}

export interface BidDaySummary {
  name: string;
  approved: number;
  pending: number;
  rejected: number;
  /** Backblaze job folders in the window with no bid record; null if the folder couldn't be read. */
  foldersWithoutRecord: number | null;
}

export interface BidDay {
  /** Period key of the window's end cutoff (not necessarily today's date); null for a `week` query. */
  day: string | null;
  /** Period key of the pay week's cutoff for a `week` query; null for a day. */
  week?: string | null;
  start: string;
  end: string;
  /** IANA key of the report time zone (BID_REPORT_TIMEZONE), e.g. `America/Chicago`. */
  timezone: string;
  bids: BidReviewItem[];
  /** Per bidder id; counts ignore the status filter. */
  summary: Record<string, BidDaySummary>;
}

export interface BidScreenshot {
  key: string;
  step: string | number | null;
  trigger: string | null;
  /** True for the Submit screenshot (`trigger === 'submit'`). */
  isSubmit: boolean;
  capturedAt: string;
  /** Short-lived signed link; null while the upload is unconfirmed. */
  url: string | null;
  /** Files attached on the page at this step; empty unless the bidder allowed recording them in the extension. */
  attachments: BidAttachment[];
}

/** A file the bidder had attached on the job page at a capture. */
export interface BidAttachment {
  /** Full location on the bidder's computer; null when it couldn't be looked up. */
  path: string | null;
  /** Which file and why, for when path is null. */
  name: string;
  pathError: string | null;
}

/** `day` and `week` are exclusive; neither means the open daily window. */
export const listBids = (params: { day?: string; week?: string; bidderId?: string; status?: BidStatus }) =>
  apiFetch<BidDay>(`/bids${qs(params)}`);

// ---------- pay-week board ----------

/** Counts of one bidder (or the team) in a window; pending/rejected are null on folder-counted days. */
export interface BidCounts {
  approved: number | null;
  pending: number | null;
  rejected: number | null;
}

export interface BidWeekDay {
  /** Period key of the day's end cutoff. */
  day: string;
  start: string;
  end: string;
  isToday: boolean;
  isFuture: boolean;
}

export interface BidderWeekDay extends BidCounts {
  day: string;
  /** `folders`: Backblaze folder count before BID_RECORDS_START, not reviewed. */
  source: 'records' | 'folders';
  /** Folder listing failed; counts are null. */
  error: string | null;
}

export interface BidderWeekTotals extends BidCounts {
  /** approved × rate over the pay-week window (the weekly report's number). */
  pay: number | null;
  /** Pending in the pay week; null on folder weeks. */
  toReview: number | null;
  source: 'records' | 'folders';
  error: string | null;
}

export interface BidWeekRow {
  id: string;
  name: string;
  status: Bidder['status'];
  country: string | null;
  profileName: string | null;
  rate: number;
  /** The user who owns the bidder; ownerName is null when that user no longer exists. */
  ownerId: string;
  ownerName: string | null;
  /** One per `week.days`, same order. */
  days: BidderWeekDay[];
  week: BidderWeekTotals;
}

export interface BidWeek {
  week: {
    start: string;
    end: string;
    /** e.g. "Week ending Sat Oct 10". */
    label: string;
    timezone: string;
    days: BidWeekDay[];
  };
  bidders: BidWeekRow[];
  totals: BidCounts & { pay: number | null; toReview: number | null; days: (BidCounts & { day: string })[] };
}

/** The pay week holding `week` (YYYY-MM-DD; default the current one). `ownerId` narrows to one user's bidders. */
export const bidsWeek = (params: { week?: string; includeArchived?: boolean; ownerId?: string }) =>
  apiFetch<BidWeek>(`/bids/week${qs(params)}`);

export const getBid = (id: string) => apiFetch<BidReviewItem>(`/bids/${id}`);

export const bidScreenshots = (id: string) => apiFetch<BidScreenshot[]>(`/bids/${id}/screenshots`);

/** `reason` only goes with `status: 'rejected'`; `other` needs a non-empty note. */
export const reviewBid = (id: string, body: { status: BidStatus; note?: string | null; reason?: RejectReason }) =>
  putJSON<BidReviewItem>(`/bids/${id}/review`, body);

/** `onlyComplete` only goes with `status: 'approved'`: the server then skips bids that are not complete. */
export const reviewBids = (
  body:
    | { ids: string[]; status: BidStatus; reason?: RejectReason; onlyComplete?: false }
    | { ids: string[]; status: 'approved'; onlyComplete: true },
) => postJSON<{ updated: number; skipped: number }>('/bids/review', body);
