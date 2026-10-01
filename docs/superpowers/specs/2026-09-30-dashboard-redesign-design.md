# Dashboard redesign — design

Date: 2026-09-30
Repos: `engineers_app` (frontend), `engineers_backend` (API). Branch `feat/cleanup` in both.

## Goal

Replace the current Dashboard with a focused page that tells a user where they stand in this week's plan and in their earnings, and motivates them to keep going. This pass builds the **user view**; a full admin view comes later.

## Decisions (agreed)

| Topic | Decision |
|---|---|
| Bid actuals | Sum of **regular** daily plans: self = `bidsHandsOn`, bidder = `bidsByBidder` |
| Interviews done (progress bar, chart line) | Daily plan `interviewsDone` |
| Weekly targets | This week's weekly plan metrics `bids` and `interviews` (`target`) |
| Interview stage tiles | Interview records (rounds in `stageHistory`), board grouping |
| Chart series | Stacked self + bidder bars, interviews-done line on a right axis |
| Transactions | Approved only, owned by the user (`userId`), net = sum of signed `amount` |
| Motivation | Pace indicator, daily-plan streak, team percentile |
| Work week | **Monday–Saturday**; Sunday is rest |
| API shape | New `/dashboard` router with three endpoints |

## Navigation

- Add a **Dashboard** item at the top of `Sidebar.tsx` (above Leaderboard), `href="/dashboard"`, same inline SVG icon style as the other items.
- Visible to admin and staff (accountants never reach the sidebar app; `RoleGuard` redirects them). `/dashboard` is already in `STAFF_ALLOWED`.
- The Topbar logo keeps linking to `/dashboard`.

## Page layout (`src/pages/Dashboard.tsx`)

`PageHeader "Dashboard"`, then three stacked cards:

1. `ThisWeekCard`
2. `ActivityChartCard`
3. `NetIncomeCard`

Everything currently on the page is removed: `MotivationHero`, hero KPI row, funnel, WeeklyPlanCTA, TrendSection, `DailyPlanChart`, upcoming / recent-activity cards. Dashboard-only components that become unused are deleted: `components/dashboard/DailyPlanChart.tsx`, `DashboardOverview.tsx`, `KpiCards.tsx`, `MetricsChart.tsx`, `PeriodTable.tsx`, and any helpers used only by them (verify with grep before deleting). Endpoint wrappers in `api/endpoints.ts` that lose all callers (`getDashboardMetrics`, `getDashboardFeed`) are removed from the frontend; the backend endpoints stay (out of scope).

**Admin on this pass:** admins see a user `<select>` (non-admin users, via `lookupUsers({excludeRole:'admin'})`) at the top of the page, with an empty "Pick a user" state until one is selected. The selected `userId` is passed to all three endpoints.

Each card fetches independently with SWR (array keys, e.g. `['dashboard-week', userId]`), shows a `skeleton` while loading, and an inline error with a Retry button on failure.

## Week definition

- Timezone: `APP_TIMEZONE` (default `America/New_York`).
- A week is **Monday 00:00 – Saturday 23:59:59** for display and pace. Data logged on **Sunday rolls into the preceding week** (i.e. the counting window is Mon 00:00 – Sun 23:59:59) so nothing is lost.
- Working days = Mon–Sat (6).
- The weekly plan for "this week" is the user's plan whose `startDate`–`endDate` contains today's date in the app timezone.

## Backend: `app/routers/dashboard.py` (prefix `/dashboard`)

All endpoints require `get_current_user`. Optional query `userId`: if present and caller is admin → use it; if present and caller is not admin → **403**; absent → caller's own id. Pure computations live in `app/dashboard_stats.py` (no DB) so they can be unit-tested.

### `GET /dashboard/week`

Query: `userId?`, `today?` (YYYY-MM-DD, client's local today; defaults to app-timezone today — mirrors `/daily-plans/stats` `to`).

Response:

```json
{
  "week": { "start": "2026-09-28", "end": "2026-10-03" },
  "bids": { "self": 18, "bidder": 13, "total": 31, "target": 50,
            "pace": { "expected": 35, "behindBy": 4, "perDayNeeded": 5, "onTrack": false },
            "percentile": { "position": "top", "percent": 20 } },
  "interviews": { "done": 3, "target": 5,
                  "pace": { "expected": 3, "behindBy": 0, "perDayNeeded": 1, "onTrack": true },
                  "percentile": { "position": "top", "percent": 40 } },
  "stages": [ { "key": "intro", "label": "Intro", "count": 3 }, "...", { "key": "canceled", "label": "Canceled", "count": 1 } ],
  "streak": 6,
  "hasWeeklyPlan": true
}
```

Rules:

- **Actuals:** sum over the user's `DailyPlan` docs with `planType == "regular"` and `date` in the counting window.
- **Target:** `metrics[key=="bids"].target` / `metrics[key=="interviews"].target` of this week's weekly plan; `null` if no plan or no/zero target. When `target` is null, `pace` is null.
- **Pace:** `elapsed` = working days from Monday through today inclusive, capped at 6 (Sunday → 6). `expected = round(target * elapsed / 6)`. `behindBy = max(0, expected - actual)`. `onTrack = actual >= expected`. `remainingDays = 6 - elapsed`; `perDayNeeded = ceil(max(0, target - actual) / remainingDays)` when `remainingDays > 0`, else `null`.
- **Streak:** walk back from today over calendar days, skipping Sundays. Today without a regular plan does not break the streak (start from the previous working day in that case). Count consecutive working days that have a regular daily plan. Look back at most 365 days.
- **Percentile:** population = non-admin users with ≥1 regular daily plan in the last 30 days (app timezone), always including the subject user. Score = this week's total bids (and separately interviews done). Rank with ties sharing the better rank (`rank = 1 + count(score > mine)`). `percent = ceil(rank / N * 100)`. If `percent <= 50` → `{position:"top", percent}`, else `{position:"bottom", percent: ceil((N - rank + 1) / N * 100)}`. `null` when `N < 3`.
- **Stage tiles:** count interview rounds for interviews with `createdBy == user` whose round date (`stageHistory[].scheduledAt`, falling back to the interview's `scheduledAt`) falls in the counting window. Reuse the grouping and exclusions from `metrics.py` (`_breakdown_group`, `_ROUND_COUNT_EXCLUDED`, `_BREAKDOWN_ORDER`) plus the Canceled convention (`status == "scheduled"` and stage `rejected`) — extract to a shared helper rather than duplicate. Tiles always include all six keys (Intro, Tech, Hiring, Panel, Final, Canceled), zeros included.

### `GET /dashboard/activity`

Query: `from`, `to` (YYYY-MM-DD, inclusive, required), `userId?`.

Validation: `from <= to`, range ≤ 3 years (1096 days) → else **422**.

Bucket auto-selection (`pick_bucket(from, to)`):

- ≤ 62 days → `day`
- ≤ 182 days → `week` (Mon-start; Sunday belongs to the preceding week)
- otherwise → `month`

So the Week (Mon–Sat) and Month presets get `day`, the Year preset (a calendar year) gets `month`, and Custom follows the same rule. In `day` buckets, Sunday rows are merged into the preceding Saturday.

Response:

```json
{
  "bucket": "day",
  "from": "2026-09-28", "to": "2026-10-03",
  "series": [ { "key": "2026-09-28", "label": "Mon", "self": 4, "bidder": 2, "interviews": 1 } ],
  "totals": { "self": 18, "bidder": 13, "bids": 31, "interviews": 3 }
}
```

Source: regular daily plans only. Empty buckets are zero-filled. Labels: `day` → weekday short name for ranges ≤ 7 days, else `MMM d`; `week` → `MMM d` of the Monday; `month` → `MMM` when all buckets share a year, else `MMM yy`.

### `GET /dashboard/net-monthly`

Query: `userId?`, `today?`.

Response:

```json
{ "months": [ { "period": "2025-10", "income": 3000, "outcome": 900, "net": 2100 } ],
  "total": 24300 }
```

Rules: `Transaction` with `userId == subject`, `status == "approved"`, `date` in the 12 calendar months ending with the current month (app timezone boundaries). `income = sum(amount > 0)`, `outcome = sum(abs(amount < 0))`, `net = income - outcome`. All 12 months present, zero-filled, oldest first. Reuse the `_TOTALS_GROUP` pattern from `transactions.py`.

Register the router in `app/main.py`.

## Frontend components (`src/components/dashboard/`)

- **`ThisWeekCard.tsx`** — header "This week · {Mon d} – {Sat d}", streak chip (`🔥 N-day streak`, hidden at 0). Two progress rows (Bids, Interviews): `actual / target`, `progress-track` bar (green at ≥100%), pace text ("On track" / "Behind pace by N · X/day needed"), percentile chip ("Top 20% of team" / "Bottom 30% of team"). Bids row shows "Self N · Bidder N". No target → counts only, no bar, plus a "Set weekly targets" link to `/report?tab=weekly`. Stage tiles row: six rectangles using `stageBadgeClass` colours; clicking one navigates to `/interviews` with this week's date range.
- **`ActivityChartCard.tsx`** — segmented buttons Week | Month | Year | Custom (`segmented` classes), ‹ › stepping for preset periods (disabled beyond the current period), From/To inputs for Custom. recharts `ComposedChart`: stacked `Bar`s self + bidder, `Line` interviews on right `YAxis`, theme from `useChartTheme()`. Footer totals line.
- **`NetIncomeCard.tsx`** — headline "12-mo total $X · This month $Y" (USD via `Intl.NumberFormat`). recharts `BarChart` of `net`, `Cell` fill green for ≥0, red for <0, zero reference line; tooltip shows income, outcome, net.
- API wrappers in `api/endpoints.ts`: `getDashboardWeek`, `getDashboardActivity`, `getDashboardNetMonthly` with typed responses.
- Date helpers for period presets (Mon–Sat week, month, year stepping) go in `lib/week.ts` / `lib/dateRangePresets.ts`, reusing what exists.

## Error handling

- Backend: 403 for non-admin `userId`; 422 for invalid ranges/dates; unknown `userId` → 404.
- Frontend: per-card error state with Retry (SWR `mutate`); admin with no selected user sees a neutral prompt, no requests fired.

## Testing

Backend (`engineers_backend`):

- `tests_unit/test_dashboard_stats.py` — `pick_bucket` boundaries; pace (Monday, mid-week, Saturday, Sunday, no target, target met); streak (gap, across Sunday, today missing, zero); percentile (ties, top/bottom split, N<3 → null); Sunday-merge in day buckets.
- `tests/test_dashboard.py` (integration, real Mongo) — week sums from regular plans only (custom plans ignored); target from weekly plan / missing plan; stage tiles grouping + canceled; activity buckets + zero-fill + 422s; net-monthly approved-only, owner-only, 12-month fill; admin `userId` works, non-admin `userId` → 403.

Frontend: `npm run lint` (tsc) passes for new/changed files; manual check in the dev server as staff and as admin.

## Out of scope

- Full admin dashboard (team overview, per-user comparison).
- Changing existing endpoints (`/metrics/dashboard`, `/daily-plans/stats`, `/transactions/summary`).
- Fixing the pre-existing `tsc` errors on `main` (tracked separately).
