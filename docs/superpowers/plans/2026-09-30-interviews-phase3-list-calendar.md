# Interviews Phase 3 — Interviews Tab with List and Calendar Views — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the kanban board and the Live table with an Interviews tab that has a server-paginated List (the default) and a week/month Calendar, switched from the top right, next to an unchanged Analyze tab.

**Architecture:**
- **Backend.** The list endpoint gains "any round in range" date matching and column sorting. A new `GET /interviews/rounds` returns flattened rounds for the calendar.
- **Frontend.**
  - One `InterviewsPage` owns the header (toggle + New interview) and the shared filters. Filters are kept in URL query params via a `useInterviewFilters` hook.
  - It renders `<InterviewsList>` or `<InterviewsCalendar>`.
  - Calendar geometry lives in pure functions in `src/lib/calendarLayout.ts`.
  - Every create/edit goes through phase 2's `<InterviewPanel>`.

**Tech Stack:** FastAPI/Beanie/pytest; React 18 + TS + SWR + Tailwind; no new dependencies (the calendar is built in-app, spec approach 2A).

**Spec:** `docs/superpowers/specs/2026-09-30-interviews-redesign-design.md` §5. Depends on phase 2 (`InterviewPanel`, `ConfirmDialog`, `lib/interviewForm.ts`, round fields).

## Global Constraints

- **Worktrees and commits:** same worktrees, branch, "never stage transactions files" rule, one commit per repo at the end, the co-author trailer, Slack off locally, no `--apply` and test commands as in the phase 2 plan's Global Constraints.
- **Routes:** `/interviews` (List), `/interviews/calendar` (Calendar), `/interviews/analyze` (unchanged). `/interviews/live` → `<Navigate to="/interviews/calendar" replace />`.
- **Tabs:** `Interviews` (active for `/interviews` and `/interviews/calendar`) and `Analyze`.
- **URL filter params:**
  - `user` (default: the current user id; `all` = every user), `profile`, `stage`, `status`
  - List only: `range` (a `DateRangePreset`, default `this_week`), `from`, `to` (custom), `sort` (`latest|company|stage|status`, default `latest`), `dir` (`desc|asc`, default `desc`), `page`
  - Calendar only: `view` (`week|month`, default `week`), `date` (the anchor `YYYY-MM-DD`, default today)
- **Calendar hours:** `07:00`–`21:00`, extended to fit rounds outside them. 30-minute rows. Weeks run Mon–Sun. Month view is a 6-week grid with up to 3 rounds per day, then `+N more`.
- **Legacy all-day rounds:** a round with no `endsAt` whose UTC time is exactly `12:00:00` is a legacy date-only round and goes in the all-day row.
- **Round colours:** `stageBadgeClass(stage)`. Canceled rounds get `opacity-60 line-through`; rejected rounds get `border-l-4 border-red-500`.
- **Removed in this phase:** the board and Live code. `@dnd-kit` stays (Pipeline uses it).

## Review Focus

1. **Overlapping rounds** (2, 3, and chains A∩B, B∩C, not A∩C) → no block is hidden; a chain shares columns. Pinned in Task 3 (`layoutDayEvents` cases).
2. **A round crossing the visible hour range** (e.g. 06:30 or 21:30) → the grid extends so it is fully visible. Pinned in Task 3 (`visibleHourRange`).
3. **Reloading or sharing a URL** with filters/view/date → the same filters, view and range. Pinned in Task 2 (the `parseInterviewFilters` round trip).
4. **The list date range when only an earlier round falls in range** → the interview is still listed. Pinned in Task 1.
5. **A month grid across a year boundary or DST change** → 42 consecutive days starting on a Monday, with no duplicates or gaps. Pinned in Task 3 (`monthGrid`).

---

### Task 1: Backend list filters/sort and the rounds endpoint

**Files:**
- Modify: `app/routers/interviews.py`: `list_interviews` (~515-600); remove `_stage_filter_values`'s `tech` branch
- Test: `tests_unit/test_interview_rounds_endpoint.py` (pure helpers); `tests/test_interviews.py` (append, not run)

**Interfaces:**
- Produces:
  - `range_match(from_dt: Optional[datetime], to_dt: Optional[datetime]) -> dict`: the Mongo filter `{"$or": [{"stageHistory": {"$elemMatch": {"scheduledAt": rng}}}, {"stageHistory": {"$size": 0}, "scheduledAt": rng}]}`, where `rng` holds `$gte`/`$lte`. Returns `{}` when there are no bounds.
  - The list endpoint's `sort` param accepts `latest|company|stage|status` plus `dir=asc|desc`. The old `sort=asc|desc` still works, meaning `latest` with that direction.
    - Sort keys: `latest` → `scheduledAt`; `company` → `companyName`; `stage` → `stage`; `status` → `status`.
    - A secondary key `_id` keeps sorting stable.
  - `flatten_rounds(interviews: list[dict], *, from_dt, to_dt, stage: str = "", status: str = "") -> list[dict]`: rows `{interviewId, roundId, stage, status, scheduledAt, endsAt, companyName, profileLabel, ownerId, ownerName, hasCaller}` for rounds whose `scheduledAt` falls in `[from_dt, to_dt)`, filtered on the round's own stage/status and sorted by `scheduledAt`.
  - `GET /interviews/rounds?from&to&creatorId&accountId&stage&status`: `from` and `to` are required (400 otherwise), and the span is at most 45 days (400 otherwise).
    - It queries with `range_match` plus creator/account filters, populates owner and account the way the list does, then calls `flatten_rounds`.
    - Response: `{"rounds": [...]}`.
    - Visibility is the same as the list (any authenticated user).
  - **The route must be declared before `GET /{iv_id}`**, or `rounds` would be read as an id.

- [ ] **Step 1: Write failing unit tests:**
  - `test_range_match_shape`
  - `test_flatten_rounds_filters_by_round_range_stage_status`: an interview with an intro on Sep 22 and tech on Oct 1, with range Sep 28–Oct 5, returns only the tech row; `status="canceled"` leaves only canceled rounds.
  - `test_flatten_rounds_sorted_and_has_caller`
- [ ] **Step 2: Run them.** Expected: `ImportError`.
- [ ] **Step 3: Implement**, including the list endpoint changes.
- [ ] **Step 4: Run** the unit suite. Expected: PASS.
- [ ] **Step 5: Add integration tests** (not run):
  - `test_list_date_range_matches_any_round` *(Review Focus 4)*
  - `test_list_sort_company_asc`
  - `test_rounds_endpoint_requires_range`
  - `test_rounds_endpoint_route_not_shadowed_by_id`
- [ ] **Step 6: Read-only check:** `GET /interviews/rounds?from=<this Monday>&to=<next Monday>` on :8081 with a staff token returns 200 and rows sorted by `scheduledAt`.

---

### Task 2: Tabs, routes and URL-backed filters

**Files:**
- Create: `src/lib/interviewFilters.ts` (pure), `src/pages/interviews/useInterviewFilters.ts` (hook), `src/pages/interviews/InterviewFilters.tsx` (the filter bar)
- Create: `src/pages/interviews/InterviewsPage.tsx`: header, tabs, List | Calendar segmented control (a `<nav>` of two `<Link>`s with `aria-current`), `New interview` button, filter bar, and `<InterviewPanel>` state
- Modify: `src/components/InterviewTabs.tsx` (two tabs), `src/App.tsx` (routes)

**Interfaces:**
- Produces:
  - `type InterviewFilters = { user: string; profile: string; stage: string; status: string; range: DateRangePreset; from: string; to: string; sort: 'latest'|'company'|'stage'|'status'; dir: 'asc'|'desc'; page: number; view: 'week'|'month'; date: string }`
  - `parseInterviewFilters(params: URLSearchParams, defaults: { userId: string; today: string }): InterviewFilters`
  - `serializeInterviewFilters(f: InterviewFilters, defaults): URLSearchParams`: omits default values.
  - `listQuery(f): Record<string, string | number>`: the query object for `api.listInterviews`, with `page`, `limit`, `from`/`to` from `range` (or custom), `creatorId` (unless `user=all`), `accountId`, `stage`, `status`, `sort` and `dir`.
  - `roundsQuery(f, range: { from: string; to: string }): Record<string, string>`: the same filters for `api.listInterviewRounds`.
  - `useInterviewFilters()` returns `[filters, update(patch)]`. `update` resets `page` to 1 whenever anything other than `page` changes, and writes with `setSearchParams(..., { replace: true })`.
  - `InterviewsPage` props: `view: 'list' | 'calendar'`. Its routes are `/interviews` → `<InterviewsPage view="list" />` and `/interviews/calendar` → `<InterviewsPage view="calendar" />`.
  - `api.listInterviewRounds(params)` goes in `src/api/endpoints.ts` (interview hunk only).

- [ ] **Step 1: Write the node assertion script** `scratchpad/interview-filters-check.mjs`:
  - Parse → serialize → parse round trip equals *(Review Focus 3)*.
  - Defaults are omitted from the serialized string.
  - An invalid `sort`/`view` falls back to the default.
  - `user=all` maps to no `creatorId` in `listQuery`.
  - Run it. Expected: FAIL.
- [ ] **Step 2: Implement** `src/lib/interviewFilters.ts`, then rerun. Expected: PASS.
- [ ] **Step 3: Implement** the hook, filter bar, page shell, tabs and routes. Type check: no new errors.

---

### Task 3: Calendar layout (pure)

**Files:**
- Create: `src/lib/calendarLayout.ts`

**Interfaces:**
- Produces:
  - `type CalEvent = { id: string; start: Date; end: Date; allDay: boolean }`
  - `isLegacyAllDay(scheduledAt: string, endsAt?: string | null): boolean` (see Global Constraints)
  - `weekDays(anchor: Date): Date[]`: 7 local dates, Mon–Sun.
  - `monthGrid(anchor: Date): Date[]`: 42 local dates starting from the Monday on or before the 1st.
  - `visibleHourRange(events: CalEvent[], base = { start: 7, end: 21 }): { start: number; end: number }`: floor of the earliest start hour, ceil of the latest end hour, clamped to 0–24.
  - `layoutDayEvents(events: CalEvent[]): Array<CalEvent & { col: number; cols: number }>`: the standard overlap-cluster algorithm.
    - Sort by start (then longer first).
    - Greedily assign the first free column.
    - `cols` = the maximum number of columns used within the event's connected overlap cluster.
    - Events that only touch (`a.end == b.start`) don't overlap.
  - `rangeFor(view: 'week'|'month', anchor: Date): { from: string; to: string }`: `to` is exclusive; for month it's the grid's 42-day span.
  - `shiftAnchor(view, anchor, delta: number): Date`

- [ ] **Step 1: Write the node assertion script** `scratchpad/calendar-layout-check.mjs` (esbuild bundle). Cases:
  - no overlap → every event gets `cols=1`
  - two overlapping → cols 0/1 of 2
  - three mutually overlapping → 3 columns
  - chain A∩B, B∩C, not A∩C → A and C share column 0, B is column 1, and all have `cols=2` *(Review Focus 1)*
  - touching events → `cols=1`
  - `visibleHourRange` with a 06:30 start → `start=6`; a 21:30 end → `end=22` *(Review Focus 2)*
  - `monthGrid(2026-12-15)` → 42 days, the first is a Monday, consecutive, and includes Jan 2027 *(Review Focus 5)*
  - `monthGrid(2026-03-15)` (DST month) → 42 consecutive dates
  - `weekDays(Sunday 2026-10-04)` → starts Mon Sep 28
  - `isLegacyAllDay("2026-10-01T12:00:00Z", null) === true`; with `endsAt` → false
  - Run it. Expected: FAIL (module missing).
- [ ] **Step 2: Implement**, then rerun. Expected: all pass.

---

### Task 4: List view

**Files:**
- Create: `src/pages/interviews/InterviewsList.tsx`, `src/pages/interviews/RoundTrail.tsx` (the dot trail)

**Interfaces:**
- Consumes: Task 1 (sort/range), Task 2 (filters), phase 2 `InterviewPanel`, `ConfirmDialog`, `interviewStatusBadgeClass`, `stageBadgeClass`, `stageLabel`.
- **Behaviour:**
  - SWR key `['interviews-list', listQuery(filters)]`, with `keepPreviousData`.
  - **Table columns:** Company (+ position under it, muted), Profile (`formatProfileLabel`), Stage (badge + phone icon if the latest round has a caller), Latest round (local `EEE MMM d, h:mm a`), Status (badge + quick menu: Completed/Passed/Rejected/Canceled → `updateInterviewStage(id, tipId, {status})`, shown only when the user can edit), Rounds (`RoundTrail`: one 8px dot per round coloured by status, with `title` = `stage · status · date`), Owner (`NameWithAvatar`), and a ⋯ menu (Add next round / Open full screen / Delete).
  - **Sortable headers:** Company, Stage, Latest round and Status, as `<button>`s with `aria-sort` on the `<th>`.
  - **Pagination:** the same footer as Transactions (page size 10/20/50).
  - **Row click / Enter:** opens `InterviewPanel` for that interview. The ⋯ menu stops propagation.
  - **Empty state:** "No interviews match these filters."
  - **Below `sm`:** each row renders as a card with the same fields.
- [ ] **Step 1: Implement.** Type check: no new errors.
- [ ] **Step 2: Read-only data check:** the list call the page makes (from `listQuery` defaults) returns 200 on :8081, and `sort=company&dir=asc` is alphabetical.

---

### Task 5: Calendar view

**Files:**
- Create: `src/pages/interviews/InterviewsCalendar.tsx`, `src/pages/interviews/CalendarWeek.tsx`, `src/pages/interviews/CalendarMonth.tsx`, `src/pages/interviews/CalendarAgenda.tsx` (mobile)

**Interfaces:**
- Consumes: Task 1 (`listInterviewRounds`), Task 2 (filters: `view` and `date` in the URL), Task 3 (layout), phase 2 `InterviewPanel`.
- **Behaviour:**
  - **Header:** `‹` `Today` `›`, the range label (week: `formatCalendarPeriod('week', ...)` from `dateRangePresets.ts`; month: `September 2026`), and a Week | Month segmented control.
  - **Data:** SWR key `['interview-rounds', roundsQuery(filters, rangeFor(view, anchor))]`.
  - **Week:**
    - A time column plus 7 day columns.
    - Row height is 24px per 30 minutes.
    - Blocks are absolutely positioned from `layoutDayEvents`, and each block is a `<button>` labelled `"{time} {company} · {stageLabel}"`.
    - There's a current-time line on today, and an all-day row for legacy rounds.
  - **Month:** the day cell lists up to 3 `<button>` rounds with `"{h:mm} {company} · {stage}"`. `+N more` sets `view=week` and `date` to that day.
  - **Click a round** → `InterviewPanel` with `initialMode="editRound"` and `initialRoundId`.
  - **Click an empty slot:**
    - In Week view, the 30-minute slot opens `InterviewPanel initialMode="new" prefill={{ date, time }}`.
    - In Month view, clicking a day's empty area opens it with `time: '10:00'`.
  - **Keyboard:** each day header has a `+` button (`aria-label="New interview on {date}"`).
  - **Below `sm`:** `CalendarAgenda` lists the week's rounds grouped by day.
- [ ] **Step 1: Implement.** Type check: no new errors.
- [ ] **Step 2: Read-only data check:** the rounds request for the current week returns 200. Pedro does the visual check.

---

### Task 6: Remove the board and Live, verify, commit

**Files:**
- Delete: `src/pages/Interviews.tsx`, `src/pages/InterviewsLive.tsx` (after grepping for importers)
- Modify: `src/App.tsx` imports; drop helpers from `src/components/InterviewEditPanel.tsx` that nothing uses once they're gone (grep each)

- [ ] **Step 1:** `grep -rn "pages/Interviews'\|pages/InterviewsLive\|BOARD_COLUMNS\|LIVE_COLUMNS" src` → no matches.
- [ ] **Step 2:** Type check. Expected: the error count drops by the errors that lived in the deleted files (`Interviews.tsx` and `InterviewsLive.tsx` held 4 of the 6). Record the new baseline.
- [ ] **Step 3:** BE unit suite: all pass.
- [ ] **Step 4:** Serve checks: `/src/pages/interviews/InterviewsPage.tsx` returns 200 on :3001; the rounds and list API calls return 200.
- [ ] **Step 5:** Commit the BE and FE with explicit paths (the deletions via `git rm`), then check `git status` again.
- [ ] **Step 6:** Final report to Pedro, including the combined migration dry-run output (phase 1 + phase 2 rules), and ask for the go-ahead to run `--apply`.
