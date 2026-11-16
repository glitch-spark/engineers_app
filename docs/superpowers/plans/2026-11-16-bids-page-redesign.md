# Bids Page Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `/bidders` becomes **Bids**: three tabs (Bidders · My bids · Pay) that open on the signed-in user's own team, one review flow with one exit, one word per number with click help, Week / Performance table views, a bidder page that carries performance, a per-pay-week Pay summary, and daily / weekly Slack posts that list only bidders with bids and deep-link into the page.

**Architecture:** The server is the only schedule authority: `GET /bids/clock` gives the open report day and the current pay week, and the client never derives a pay week from a weekday or a 7-day length. It steps from the first / last report day of the period the server returned. Four small additive endpoints (`/bids/clock`, `/bids/pending`, `/bids/backlog`, `/bids/pay`) feed the new blocks. URL ↔ state mapping lives in pure modules with vitest (`src/lib/bidsUrl.ts`, `src/lib/bidderFilters.ts`, `src/lib/bidsWords.ts`, `src/lib/payCopy.ts`), and `src/pages/Bidders.tsx` wires them. Slack posts keep their stored rows and gain URL buttons built from the same URL keys.

**Tech Stack:** React 18 + Vite + SWR + Tailwind + vitest / Testing Library (`src/**/*.test.ts(x)`) + node:test (`tests/*.test.mjs`); FastAPI + Beanie (Python 3.13), pytest + mongomock-motor (`tests_unit/`); Slack Block Kit.

**Spec:** `docs/superpowers/specs/2026-11-16-bidders-page-redesign-design.md` (steps 1–5; step 0 is the separate pay-week plan). Evidence: `docs/superpowers/specs/2026-11-16-bidders-ux-audit.md` (F1–F24, T1–T6).

## Before starting

- **Precondition:** the pay-week switch plan (`docs/superpowers/plans/2026-11-16-pay-week-sunday-switch.md`) is merged into both `feat/app-reorg` branches. Check in `wt/backend-reorg`: `grep -c "def report_day\|def next_cutoff\|def daily_cutoff_on" app/bids/windows.py` prints `3` and `grep -c BID_SCHEDULE_SWITCH_AT app/config.py` is at least `1`. Stop and tell the controller if not.
- Worktrees: app `wt/app-reorg`, backend `wt/backend-reorg`, both on `feat/app-reorg`. This plan and the spec live in the app worktree; backend implementers read them there. Commit each task in the repo(s) it touched, with the same message.
- Backend tests, from `wt/backend-reorg`. The worktree has a `.env` that makes two tests fail (`tests_unit/test_bidder_ext.py::test_upload_url_without_storage_is_503`, `tests_unit/test_resume_prompts.py::test_apply_prompts_rejects_bad_lists[prompts5-new-1]`), so move it aside for every run and put it back afterwards: `mv .env ../backend-reorg.env.off` … `mv ../backend-reorg.env.off .env`. Run: `"C:/Users/Administrator/Downloads/engineer - Copy/engineers_backend/.venv/Scripts/python.exe" -m pytest tests_unit/<file> -q -p no:cacheprovider`.
- App checks, from `wt/app-reorg`: `npx vitest run <files>`, `npm run test:node`, `npm run lint`, `npm test`, `npm run build`.
- Baseline: before Task 1, run the full backend suite (`tests_unit/`) and `npm test` once and write the failure list into Task 1's commit message. Every later full run must show the same set.
- Steps ship in order: Tasks 1–8 = step 1, 9–11 = step 2, 12–13 = step 3, 14–15 = step 4, 16–17 = step 5. The Pay tab stays hidden until Task 15.

## Global Constraints

- Route `/bidders` unchanged. Sidebar label **Bids**; page title **Bids** (on a bidder's page: the bidder's name); tabs **Bidders**, **My bids**, **Pay**.
- New URL keys (defaults are never written to the URL): `section` = absent (Bidders) | `mine` | `pay`; `lens` = absent (Week) | `performance`; `owner` = absent (an admin's own id) | a user id | `all`. Review overlay keys: `mode=focus` plus `review` = `all` | `range` | `day` | `week`, `at` = a report day (for `day` that day, for `week` any day of that pay week; absent = today / the current pay week), and `reviewBidder` = a bidder id (filters the overlay without opening the bidder page).
- Old keys keep working: `bidder`, `day`, `tab` (`history` = Past weeks), `mode=focus` with `bid` + `day` (the day panel's walk), `mode=focus` without `review` (the pay week of `week`, or the current one), `bid`, `view` (ignored), `week`, `range`, `date`, `from`, `to`, `archived`, `q`, `period`. `show=self` opens `section=mine`; `show=bidders` / `show=all` open the Bidders tab.
- A pay week's `date` / `week` / `at` value is any report day inside it, and the server resolves it. The client steps from the shown period's report days: back = first − 1 day; forward = last + 7 days (two pay weeks: last + 14), clamped to the current pay week.
- Words: **Approved**; **Pending** (never "to review" / "Review" as a count); **Bids** = approved + pending (Performance view only); **Pay** = approved × rate inside the pay week, the only money figure; **Pay week**, labelled "Week ending Sun Nov 29"; **My bids** (never "self" / "Self" in the UI). Rate: "$0.06 per approved bid". Status: "Active · @user" / "Invited · expires …" / "Archived". Back button: "← Bidders".
- Permissions on every new endpoint: staff see only their own bidders (a foreign `ownerId` gives an empty result, a foreign `bidderId` a 404). Admins see one owner with `ownerId`, and every owner without it.
- New bid routes are declared above `@router.get("/{bid_id}")` in `app/routers/bids.py` (it would swallow `/clock` etc.).
- Backend changes are additive: no stored field changes, no new collections. Slack: one post per period, edited in place after reviews, 50 blocks and 3,000 chars per section.
- No new UI library: the shared `FilterBar`, `DateRangeFilter`, `SearchFilter`, `Segmented`, `Tabs`, `Select`, `ActionMenu`, `SidePanel`, `useUrlFilters`.
- Test switch settings, wherever a test needs the switched schedule: `BID_SCHEDULE_SWITCH_AT="2026-11-22T20:00"`, `BID_NEXT_DAILY_REPORT_TIME="18:00"`, `BID_NEXT_WEEKLY_REPORT_DAY="sunday"`, `BID_NEXT_WEEKLY_REPORT_TIME="20:00"`.

## Review Focus

1. Stepping the date range or the bidder's week nav across the long week (Sun Nov 15 → Sun Nov 22, 2026) visits each pay week exactly once and snaps back onto This / Last pay week. Tests: Task 1 `steps across the long week` and `WeekNav steps from the shown days`.
2. Closing the review overlay returns to exactly where it was opened (a list review never adds `bidder`). Test: Task 8 `the row's Pending badge opens the review over the list and Close returns to the list`.
3. A bid decided by another reviewer while the overlay is open stays on screen with "Changed by…" instead of vanishing from a pending-only list. Tests: Task 2 `test_pending_since_keeps_bids_decided_while_open` and Task 5 `keeps the shown bid when a refresh says it was decided`.
4. A closed week's Pay equals the stored weekly report even after a rate edit, so the Pay tab, Slack and Past weeks agree. Test: Task 14 `test_pay_closed_week_uses_the_stored_report`.
5. Old and Slack links open the same thing or its new home (`show=self`, `mode=focus&week=`, an admin's link without `owner`, `range=pay_week&date=<week-ending day>`). Tests: Task 4 `old links`, Task 1 `a Slack link's week-ending day opens that pay week`.

---

## Step 1: tabs, own-team default, My bids, one review flow

### Task 1: Server clock; the client stops hard-coding the schedule

**Files:**
- Modify (backend): `app/routers/bids.py` (new route above `get_bid`)
- Create (backend): `tests_unit/test_bids_page_endpoints.py`
- Modify (app): `src/api/endpoints.ts`, `src/lib/bidderFilters.ts`, `src/lib/bidderFilters.test.ts`, `src/components/bidders/biddersFilters.tsx`, `src/components/bidders/biddersFilters.test.tsx`, `src/components/filters/DateRangeFilter.tsx`, `src/components/filters/DateRangeFilter.test.tsx`, `src/components/bidders/WeekNav.tsx`, `src/pages/Bidders.tsx`
- Create (app): `src/lib/useReportClock.ts`, `src/components/bidders/WeekNav.test.tsx`

**Interfaces:**
- Produces (backend): `GET /bids/clock` → `async def bids_clock(user) -> dict` returning `{"today": str, "payWeekStart": str, "payWeekEnd": str, "timezone": str}`. `today = report_day(_now(), sched)`; the week fields are the first / last `DayWindow.key` of `pay_week(sched, _now())`; `timezone = sched.tz.key`. Any signed-in user.
- Produces (backend test file): fixtures `db` (mongomock with `UserExtra, Account, Bidder, Bid, BidReport, DailyPlan, Interview, InterviewQuestion`; `records.get_settings` patched to `BID_RECORDS_START=None`, as in `test_bids_single_page.py`), `switch_on` (patches `app.bids.windows.get_settings` to a settings copy with the Global Constraints switch values), helper `at(monkeypatch, local: datetime)` (patches `bids_router._now` to that America/Chicago time), and `seed()` → users `pedro` (staff), `maria` (staff), `boss` (admin); bidders `ana` (pedro, rate 0.06), `raj` (pedro, 0.06), `lee` (pedro, archived), `mia` (maria, 0.5); helper `bid(bidder, status, local_dt, reviewed_at=None)`. Tasks 2, 3 and 14 add their tests here.
- Produces (app):
  - `api.BidClock = { today: string; payWeekStart: string; payWeekEnd: string; timezone: string }`, `api.getBidClock(): Promise<BidClock>`.
  - `useReportClock(): { clock: ReportClock | undefined; error: unknown; retry: () => void }` (SWR key `['bid-clock']`, `refreshInterval: 300_000`).
  - In `bidderFilters.ts`: `type ReportClock = api.BidClock`; `type ShownWeeks = { first: string; last: string }`; `shownWeeksOf(resp: { period: string; start: string; end: string; payWeek?: { days: { day: string }[] } | null }): ShownWeeks | undefined`; `stepPayWeekDay(shown: ShownWeeks, dir: -1 | 1, weeks: 1 | 2 = 1): string`; `bidderCanStepBack(f: BidderFilters, shown?: ShownWeeks): boolean`; `stepBidderPeriod(f, dir, clock, shown?: ShownWeeks)`; `bidderDays(f, clock, shown?: ShownWeeks)`. Unchanged names and signatures: `parseBidderValues`, `bidderPeriodRequest`, `bidderCanStepForward`, `pickBidderPreset`, `bidderLabel`.
  - Removed: `reportClock`, `payWeekStartOf`, `REPORT_TZ`, `DAILY_CUTOFF_MIN`, `WEEKLY_CUTOFF_MIN`.
  - `useBidderFilters(isAdmin: boolean, clock: ReportClock | undefined): BidderFilterState | null` (null until the clock loads). `BiddersFilterBar` gains `shown?: ShownWeeks`.
  - `DateRangeFilter` gains `canStepBack?: boolean` (default unchanged).
  - `WeekNav({ shown: ShownWeeks | null; label: string | null; isCurrent: boolean; onChange: (week: string | null) => void })`.

Rules the code must follow:
- **Anchor.** A pay-week anchor is any report day of it. Own anchors: This = `payWeekStart`; Last and Last 2 = `payWeekStart − 1`.
- **Settling an anchor on a preset.**
  - One week: This when anchor ≥ `payWeekStart`; Last when anchor ∈ [`payWeekStart − 7`, `payWeekStart − 1`]; otherwise the transient `pay_week` with `date = anchor`.
  - Two weeks: `last_2_pay_weeks` for that same Last interval, else `two_pay_weeks`.
  - A URL `date` (or old `week`) later than `payWeekEnd` is ignored. Months and Custom are unchanged.
- **Steps.** Use `stepPayWeekDay`. Back = `first − 1`. Forward = `last + 7` (`weeks` 2: `last + 14`); a result after `payWeekEnd` becomes `payWeekStart`. `stepBidderPeriod` returns null for a pay-week preset without `shown`.
- **Days of a pay-week period.** `bidderDays` returns `shown` when given. Otherwise: This = [`payWeekStart`, `payWeekEnd`]; Last = [`−7`, `−1`]; Last 2 = [`−14`, `−1`] (all relative to `payWeekStart`); a transient preset = null.
- **What the server showed.** `shownWeeksOf` returns the first / last of `payWeek.days` when present. For `period` `week` without `payWeek` (two pay weeks) it returns `start` / `end` cut to 10 chars. Otherwise undefined.
- **Page.** While the clock loads, the list area shows its skeleton. A clock error shows "Couldn't load the pay week." with Retry (`retry`). The bar gets `shown={perf.data && shownWeeksOf(perf.data)}`. The bidder view's WeekNav gets the board's first and last `week.days[].day`.

- [ ] **Step 1: Write the failing backend tests** in `tests_unit/test_bids_page_endpoints.py` (call `bids_router.bids_clock(user)` directly):
  - `test_clock_in_the_long_week` (`switch_on`, now Wed 2026-11-18 09:00): result `== {"today": "2026-11-18", "payWeekStart": "2026-11-15", "payWeekEnd": "2026-11-22", "timezone": "America/Chicago"}`.
  - `test_clock_after_the_switch` (`switch_on`): at Sun 2026-11-22 20:00 → `payWeekStart "2026-11-23"`, `payWeekEnd "2026-11-29"`, `today "2026-11-23"`; at Mon 2026-11-23 18:00 → `today "2026-11-24"`.
  - `test_clock_without_the_switch`: at Sat 2026-11-21 15:59 → `payWeekStart "2026-11-15"`, `payWeekEnd "2026-11-21"`, `today "2026-11-21"`; at Sat 16:00 → `"2026-11-22"` / `"2026-11-28"`; at Sat 18:30 → `today "2026-11-22"`.
- [ ] **Step 2: Run** the file → FAIL (`bids_clock` missing).
- [ ] **Step 3: Implement `bids_clock`** as in Interfaces.
- [ ] **Step 4: Run** → PASS.
- [ ] **Step 5: Write the failing app tests.** Clocks: `CLOCK = { today: '2026-11-18', payWeekStart: '2026-11-15', payWeekEnd: '2026-11-22', timezone: 'America/Chicago' }` (the long week) and `AFTER = { today: '2026-11-25', payWeekStart: '2026-11-23', payWeekEnd: '2026-11-29', timezone: 'America/Chicago' }`.
  - **`bidderFilters.test.ts`.** Delete `describe('the report clock')`. Existing stepping tests pass `shown` and use `CLOCK`. Add:
    - `steps across the long week` (AFTER):
      - from the default, back with shown {2026-11-23, 2026-11-29} → `last_pay_week` with `date ''`;
      - back with {2026-11-15, 2026-11-22} → `pay_week` / `'2026-11-14'`;
      - back with {2026-11-08, 2026-11-14} → `'2026-11-07'`;
      - forward from `'2026-11-07'` with {2026-11-01, 2026-11-07} → `'2026-11-14'`;
      - forward with {2026-11-08, 2026-11-14} → `last_pay_week`;
      - forward with {2026-11-15, 2026-11-22} → `this_pay_week`.
    - `Last pay week asks for the day before this pay week` (AFTER): `{ period: 'week', date: '2026-11-22' }`; Last 2 → the same plus `weeks: 2`.
    - `a Slack link's week-ending day opens that pay week` (AFTER):
      - `range=pay_week&date=2026-11-22` → `last_pay_week`, `date ''`;
      - `date=2026-11-14` → `pay_week` / `'2026-11-14'` with request `{ period: 'week', date: '2026-11-14' }`;
      - `date=2026-11-30` → `this_pay_week`.
    - `no step for a pay week before the period loads`: `stepBidderPeriod(thisWeek, -1, AFTER)` is null; `bidderCanStepBack(thisWeek, undefined)` is false; for `this_month` it is true.
    - `two pay weeks step by two` (AFTER):
      - Last 2 with shown {2026-11-08, 2026-11-22}, back → `two_pay_weeks` / `'2026-11-07'`;
      - forward from that with {2026-10-25, 2026-11-07} → `last_2_pay_weeks`.
    - `shownWeeksOf`:
      - `payWeek.days` 2026-11-23..29 → `{ first: '2026-11-23', last: '2026-11-29' }`;
      - `{ period: 'week', start: '2026-11-08', end: '2026-11-22', payWeek: null }` → `{ first: '2026-11-08', last: '2026-11-22' }`;
      - a month → undefined.
  - **`biddersFilters.test.tsx`.** `Bar` passes `CLOCK` to `useBidderFilters` and a `shown` prop; drop the fake Date. Existing assertions keep their dates. New: `previous period waits for the period to load` (no `shown` → "Previous period" disabled).
  - **`DateRangeFilter.test.tsx`.** `canStepBack={false}` disables "Previous period".
  - **`WeekNav.test.tsx`.** `WeekNav steps from the shown days`: shown {2026-11-23, 2026-11-29}, Previous → `onChange('2026-11-22')`; shown {2026-11-15, 2026-11-22}, Previous → `'2026-11-14'`, Next → `'2026-11-29'`.
- [ ] **Step 6: Run** `npx vitest run src/lib/bidderFilters.test.ts src/components/bidders/biddersFilters.test.tsx src/components/filters/DateRangeFilter.test.tsx src/components/bidders/WeekNav.test.tsx` → FAIL.
- [ ] **Step 7: Implement** the app side as in Interfaces and Rules, including the `Bidders.tsx` wiring.
- [ ] **Step 8: Run** the step 6 files, `npm run lint` and `npm test` → PASS.
- [ ] **Step 9: Commit** (both repos) `feat(bids): the server's clock drives the pay week; the client steps from the shown week`.

### Task 2: Backend: pending bids for one review scope

**Files:**
- Modify: `app/routers/bids.py` (new route above `get_bid`)
- Test: `tests_unit/test_bids_page_endpoints.py`
- Modify (app): `src/api/endpoints.ts` (types and fetcher only)

**Interfaces:**
- Consumes: `bid_period`, `_pay_week_param`, `_visible_bidders`, `evidence_for`, `_thumb_urls`, `_bid_out`; Task 1's `windows.report_day`, `daily_cutoff_on`, `window_for`.
- Produces (backend): `GET /bids/pending` → `async def pending_bids(user, period: Literal["all","day","week","month","custom"] = "all", date: str = "", to: str = "", weeks: int = Query(1, ge=1, le=2), ownerId: Optional[str] = None, bidderId: Optional[str] = None, since: Optional[str] = None) -> dict`. It returns `{"label": str, "timezone": str, "bidderName": Optional[str], "bids": [<_bid_out>]}`, oldest `firstAt` first.
  - **Window:**
    - `all`: no time limit, label `"All pending"`.
    - `day`: the daily window of `date` (default today's report day), label `f"{d:%a} {d:%b} {d.day}"`.
    - `week` with `weeks=1`: the pay-week window, label `week_label`.
    - `week` with `weeks=2`: earlier week start → later week end, label from `bid_period`.
    - `month` / `custom`: first report day's window start → last report day's window end (`bid_period` days), label from `bid_period`.
  - **Match:** `status == "pending"`. With `since` (ISO, aware or `Z`), also any status whose `reviewedAt >= since`, so a bid decided while the overlay is open stays in the list.
  - **Errors:** a bad `date` or `since` → 400. `bidderId` outside the visible bidders → 404 `"bidder not found"`. Archived bidders are included.
- Produces (app): `api.PendingQuery = { period: 'all' | 'day' | 'week' | 'month' | 'custom'; date?: string; to?: string; weeks?: number; ownerId?: string; bidderId?: string }`, `api.PendingBids = { label: string; timezone: string; bidderName: string | null; bids: BidReviewItem[] }`, `api.listPendingBids(q: PendingQuery & { since?: string }): Promise<PendingBids>`.

- [ ] **Step 1: Write the failing tests** (`switch_on`, now Wed 2026-11-25 09:00 CST). Seed:
  - Ana: pending at Oct 1 10:00, Nov 17 10:00 and Nov 24 10:00; approved at Nov 24 11:00 with `reviewedAt` 2026-11-25T14:59:30Z; approved at Nov 24 12:00 with `reviewedAt` 2026-11-25T14:00Z.
  - Mia (maria): pending at Nov 24 10:00.

  Tests:
  - `test_pending_lists_every_pending_bid_of_any_age`: pedro, `period="all"` → 3 bids in `firstAt` order Oct 1, Nov 17, Nov 24; `label == "All pending"`; `bidderName is None`.
  - `test_pending_for_a_day_and_a_week`:
    - `day` + `2026-11-24` → 1 bid, label `"Tue Nov 24"`;
    - `day` with no date → 0 bids, label `"Wed Nov 25"`;
    - `week` → 1 bid (Nov 24), label `"Week ending Sun Nov 29"`;
    - `week` + `2026-11-22` → 1 bid (Nov 17), label `"Week ending Sun Nov 22"`;
    - `week` + `2026-11-22` + `weeks=2` → 1, label `"Nov 8–22, 2026"`;
    - `month` + `2026-11-01` → 2 (Nov 17, Nov 24), label `"Nov 2026"`.
  - `test_pending_since_keeps_bids_decided_while_open`: `week` with `since="2026-11-25T14:59:00Z"` → 2 bids, statuses `["pending", "approved"]`; the 14:00 decision is not listed.
  - `test_pending_one_bidder`: `bidderId=ana` → `bidderName == "Ana"`; pedro with `bidderId=mia` → `HTTPException` 404.
  - `test_pending_staff_see_only_their_own`: pedro `all` lists no Mia bid; pedro with `ownerId=maria` → `bids == []`.
  - `test_pending_admin_any_owner_or_all`: boss with `ownerId=maria` → only Mia's; boss without `ownerId` → 4 bids.
  - `test_pending_bad_dates_are_400`: `day` + `"2026-02-31"` → 400; `since="yesterday"` → 400.
- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3: Implement** `pending_bids` and the app types.
- [ ] **Step 4: Run** the file and `npm run lint` → PASS.
- [ ] **Step 5: Commit** (both repos) `feat(bids): /bids/pending lists one review scope's pending bids`.

### Task 3: Backend: the To review counts (backlog of any age)

**Files:**
- Modify: `app/bids/alerts.py` (factor the query at `:64-70` into a helper), `app/routers/bids.py` (new route above `get_bid`)
- Test: `tests_unit/test_bids_page_endpoints.py`; `tests_unit/test_bids_alerts.py` must still pass unchanged
- Modify (app): `src/api/endpoints.ts`

**Interfaces:**
- Produces (backend):
  - `async def pending_days(bidder_ids: list[PydanticObjectId], sched: BidSchedule) -> dict[str, list[date]]` in `alerts.py`: every pending bid's report day per bidder id. `bid_alerts` uses it and keeps its own `<= today - BACKLOG_DAYS` filter.
  - `GET /bids/backlog` → `async def bids_backlog(user, ownerId: Optional[str] = None) -> dict` returning `{"today": str, "total": int, "todayCount": int, "oldestDay": Optional[str], "bidders": [{"bidderId": str, "name": str, "ownerName": Optional[str], "pending": int, "oldestDay": str}]}`. Bidders come from `_visible_bidders(user, owner)` (archived included, the same set `/bids/pending` walks) and are left out when they have nothing pending. Sort by `pending` descending, then name case-insensitive. `todayCount` = pending bids whose report day is `today`.
- Produces (app): `api.BidBacklog` (that shape) and `api.getBidBacklog(p: { ownerId?: string }): Promise<BidBacklog>`.

- [ ] **Step 1: Write the failing tests** (`switch_on`, now Wed 2026-11-25 09:00). Seed: Ana pending Oct 1, Nov 17 and Nov 25 08:00; Raj pending Nov 10; Lee (archived) pending Nov 20; Ana approved Nov 24; Mia pending Nov 24.
  - `test_backlog_counts_every_pending_bid_of_any_age`: pedro → `total 5`, `todayCount 1`, `oldestDay "2026-10-01"`, `bidders == [("Ana", 3, "2026-10-01"), ("Lee", 1, "2026-11-20"), ("Raj", 1, "2026-11-10")]` (as name / pending / oldestDay).
  - `test_backlog_staff_see_only_their_own`: pedro with `ownerId=maria` → `total 0`, `bidders []`.
  - `test_backlog_admin_any_owner_or_all`: boss `ownerId=maria` → `total 1`; boss without → `total 6`.
- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3: Implement** `pending_days`, `bids_backlog` and the app types.
- [ ] **Step 4: Run** `test_bids_page_endpoints.py`, `test_bids_alerts.py` and `npm run lint` → PASS.
- [ ] **Step 5: Commit** (both repos) `feat(bids): /bids/backlog counts every pending bid per bidder, any age`.

### Task 4: URL mapping for tabs, owner and the review flow

**Files:**
- Create: `src/lib/bidsUrl.ts`, `src/lib/bidsUrl.test.ts`

**Interfaces:**
- Consumes: `ReportClock`, `BidderPeriodRequest` (Task 1); `api.PendingQuery` (Task 2).
- Produces (all pure):
  - `type UrlGet = (key: string) => string | null`
  - `type BidsSection = 'bidders' | 'mine' | 'pay'`; `sectionFromUrl(get: UrlGet): BidsSection`. `section` wins; then `show=self` → `mine`; anything else → `bidders`.
  - `sectionPatch(next: BidsSection): { section: string | null; show: null; q: null; archived: null }`. Search and Show archived belong to the Bidders tab, so a tab change drops them.
  - `type OwnerScope = { ownerId: string | undefined; all: boolean }`; `ownerScope(raw: string, isAdmin: boolean, userId: string | undefined): OwnerScope`; `ownerSelectValue(raw: string, userId: string | undefined): string`; `ownerOptions(users: { _id: string; name?: string | null; email?: string | null }[], userId: string | undefined): { value: string; label: string }[]`. The list is: Me (`''`), the other users sorted by label (name, else email, else id), then All owners (`'all'`).
  - `type ReviewScope = { kind: 'day'; day: string } | { kind: 'week'; at: string | null } | { kind: 'range' } | { kind: 'all' }`; `type ReviewTarget = { scope: ReviewScope; bidderId: string | null }`.
  - `reviewFromUrl(get: UrlGet, today: string): ReviewTarget | null`. Returns null without `mode=focus`, and for the day panel's walk (`bid` present). `bidderId = reviewBidder ?? bidder ?? null`.
  - `reviewPatch(scope: ReviewScope, bidderId?: string | null): { mode: 'focus'; review: string; at: string | null; reviewBidder: string | null; bid: null }`; `REVIEW_EXIT = { mode: null, bid: null, review: null, at: null, reviewBidder: null }`.
  - `type ReviewSwitch = 'today' | 'week' | 'range' | 'all'`; `REVIEW_SWITCH_OPTIONS` = Today, This pay week, Range, All pending; `reviewSwitchValue(scope: ReviewScope, clock: ReportClock): ReviewSwitch | null`; `reviewSwitchScope(v: ReviewSwitch, clock: ReportClock): ReviewScope`.
  - `pendingQuery(t: ReviewTarget, request: BidderPeriodRequest | null, ownerId: string | undefined): api.PendingQuery | null`. Keys that would be undefined are left out.

- [ ] **Step 1: Write the failing tests** (`AFTER` clock from Task 1):
  - **`sections`:**
    - `''` → `bidders`; `section=mine` → `mine`; `section=pay` → `pay`; `section=junk` → `bidders`;
    - `sectionPatch('bidders')` → `{ section: null, show: null, q: null, archived: null }`.
  - **`owner`:**
    - `ownerScope('', true, 'u1')` → `{ ownerId: 'u1', all: false }`; `('all', true, 'u1')` → `{ ownerId: undefined, all: true }`;
    - `('u2', true, 'u1')` → `{ ownerId: 'u2', all: false }`; `('u2', false, 'u1')` → `{ ownerId: undefined, all: false }`;
    - `ownerSelectValue('u1', 'u1')` → `''`;
    - `ownerOptions([{_id:'u2',name:'Zed'},{_id:'u1',name:'Pat'},{_id:'u3',email:'a@x.io'}], 'u1')` → `[{value:'',label:'Me'},{value:'u3',label:'a@x.io'},{value:'u2',label:'Zed'},{value:'all',label:'All owners'}]`.
  - **`review scopes`:**
    - `?mode=focus&review=all` → `{ scope: { kind: 'all' }, bidderId: null }`;
    - `review=day&at=2026-11-24` → day `'2026-11-24'`; `review=day` and `review=day&at=junk` → day `'2026-11-25'` (today);
    - `review=week&at=2026-11-14&reviewBidder=b1` → `{ scope: { kind: 'week', at: '2026-11-14' }, bidderId: 'b1' }`;
    - `review=range` → range; `mode=focus&bid=x&day=2026-11-24` → null; no `mode` → null.
  - **`old links`:**
    - `?show=self` → `mine`; `?show=bidders` and `?show=all` → `bidders`; `?section=pay&show=self` → `pay`;
    - `?mode=focus&week=2026-11-22&bidder=b1` → `{ scope: { kind: 'week', at: '2026-11-22' }, bidderId: 'b1' }`; `?mode=focus` → week `at: null`;
    - an admin's `''` owner → own id (above).
  - **`patches`:**
    - `reviewPatch({ kind: 'range' }, 'b1')` → `{ mode: 'focus', review: 'range', at: null, reviewBidder: 'b1', bid: null }`;
    - `reviewPatch({ kind: 'day', day: '2026-11-25' })` → `at '2026-11-25'`, `reviewBidder null`.
  - **`switch`:**
    - day `'2026-11-25'` → `'today'`; day `'2026-11-24'` → null;
    - week `null` and week `'2026-11-27'` → `'week'`; week `'2026-11-22'` → null;
    - `reviewSwitchScope('today', AFTER)` → `{ kind: 'day', day: '2026-11-25' }`.
  - **`pending queries`:**
    - all + owner `'u1'` → `{ period: 'all', ownerId: 'u1' }`; day → `{ period: 'day', date: '2026-11-24' }`;
    - week `null` → `{ period: 'week' }`; week `'2026-11-14'` + bidder `'b1'` → `{ period: 'week', date: '2026-11-14', bidderId: 'b1' }`;
    - range with `{ period: 'month', date: '2026-10-01' }` → `{ period: 'month', date: '2026-10-01' }`; range with null request → null.
- [ ] **Step 2: Run** `npx vitest run src/lib/bidsUrl.test.ts` → FAIL.
- [ ] **Step 3: Implement `src/lib/bidsUrl.ts`.**
- [ ] **Step 4: Run** → PASS; `npm run lint` → exit 0.
- [ ] **Step 5: Commit** `feat(bids): URL mapping for tabs, owner and the review scopes`.

### Task 5: The review overlay walks a server queue with a scope switch

**Files:**
- Modify: `src/components/bids/FocusReview.tsx`, `src/components/bids/FocusToolbar.tsx`
- Create: `src/components/bids/FocusReview.test.tsx`

**Interfaces:**
- Consumes: `api.listPendingBids`, `api.PendingQuery` (Task 2); `ReviewSwitch`, `REVIEW_SWITCH_OPTIONS` (Task 4).
- Produces:
  - `export type FocusScope = { day: string } | { queue: api.PendingQuery }`. The `{ week }` variant goes away; week reviews are queues.
  - New prop `scopeSwitch?: { value: ReviewSwitch | null; onChange: (v: ReviewSwitch) => void }`, rendered in `FocusToolbar` as `Segmented` labelled "Review" (none checked when `value` is null).
  - The other props are unchanged (`bidderId` now serves the day scope only).
  - For `{ queue }`:
    - **Fetch:** `api.listPendingBids({ ...queue, since })` with `since = new Date(visit - 60_000).toISOString()` (60 s of slack for clock skew).
    - **Toolbar scope text:** `` `${data.label} · ${data.bidderName ?? 'All bidders'}` ``. This is the server's label (fixes F10).
    - **End state:** "No pending bids left · {label}" with Back.
  - The `{ day }` scope behaves exactly as today.

- [ ] **Step 1: Write the failing tests** (`vi.mock('../../api/endpoints')`; `listPendingBids` resolves `{ label: 'Week ending Sun Nov 29', timezone: 'America/Chicago', bidderName: null, bids: [pendingBid('x1')] }`; `bidScreenshots` resolves `[]`):
  - `shows the server's label`: the toolbar text contains `'Week ending Sun Nov 29 · All bidders'`. `listPendingBids` was called once with `period: 'week'` and a `since` string ending in `Z`.
  - `the scope switch reports the pick`: with `scopeSwitch={{ value: 'week', onChange }}`, clicking the "Today" radio calls `onChange('today')`; "This pay week" is checked.
  - `keeps the shown bid when a refresh says it was decided`: the second call resolves the same bid with `status: 'approved'`, `reviewedByName: 'Kim'`. After `mutate` the job title is still shown and the alert reads `Changed by Kim to approved`.
- [ ] **Step 2: Run** `npx vitest run src/components/bids/FocusReview.test.tsx` → FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** → PASS; `npm run lint` → exit 0. To compile, `Bidders.tsx` passes `{ queue: { period: 'week', date: focusWeek } }` where it passed `{ week: focusWeek }`; Task 8 rewires it.
- [ ] **Step 5: Commit** `feat(bids): the review overlay walks a server queue and switches scope`.

### Task 6: My bids tab and a read-only bids panel without review parts

**Files:**
- Create: `src/components/bidders/MyBidsTab.tsx`, `src/components/bidders/MyBidsTab.test.tsx`, `src/components/bidders/SelfBidsPanel.test.tsx`
- Modify: `src/components/bidders/SelfBidsPanel.tsx`, `src/components/bidders/DayPanel.tsx` (the `readOnly` branch), `src/lib/bidderPage.ts` (`TimeColumn` gains `end?: string` from `weeks[i].end`), `tests/bidderPage.test.mjs`

**Interfaces:**
- Consumes: `BidPerformance.selfRows[].profiles`, `timeColumns`.
- Produces:
  - **`MyBidsTab`.** `MyBidsTab({ data: api.BidPerformance; allOwners: boolean; onOpen: (scope: SelfScope) => void })`.
    - **First line:** `Your own bids from Bid Track · {data.label}`.
    - **Rows:** one row per profile (Profile · time columns · Total · Interviews), then a Total row. With `allOwners`, one block per `selfRows` entry, headed by `ownerName`.
    - **Opening the panel:**
      - A day cell opens `{ ownerId, ownerName, accountId, profileName, day }`.
      - A pay-week column cell (month, Custom, two pay weeks) opens `{ ..., week: column.end }`.
      - A profile name is a button only for a single pay week and opens `{ ..., week: payWeek.days[0].day }`. In other periods it is plain text: the read-only listing takes a day or a pay week, not a month.
    - **Cell labels:** `` `${profile}, ${col.label} ${col.sub}: ${n} bids` ``.
    - **Empty:** "No own bids in this period. Jobs you apply to with Bid Track signed in as yourself show up here." plus a "Download Bid Track" link (`${BASE_URL}/ext/download`).
  - **`SelfBidsPanel`.**
    - Title: `My bids · {ownerName when given} · {profileName} · {when}`. `when` is the day ("Tue Nov 24"), or "Week ending …" built from the listing's `week` key; "…" while loading.
    - Subtitle: "Your own bids from Bid Track", or `` `${ownerName}'s own bids from Bid Track` `` when `ownerName` is given (admin viewing another owner).
  - **`DayPanel` with `readOnly`.** No status chips row (removed, not `invisible`), no Status and no Checks columns, and the empty text "No bids in this period".

- [ ] **Step 1: Write the failing tests:**
  - `MyBidsTab.test.tsx`. Data: week mode with 2 day columns (2026-11-23, 2026-11-24); one `selfRows` entry (`o1`, Pedro) with profiles Alpha (weekly `[1,4]`, total 5, interviews 1) and Zeta (`[2,0]`, 2, 0).
    - `one row per profile, then a Total row`: the rows read Alpha `5` `1`, Zeta `2` `0`, Total `7` `1`.
    - `a day cell opens that profile's bids for the day`: clicking `'Zeta, Mon Nov 23: 2 bids'` → `onOpen({ ownerId: 'o1', ownerName: 'Pedro', accountId: 'a2', profileName: 'Zeta', day: '2026-11-23' })`.
    - `All owners: one block per owner`: two entries → headings `Pedro` and `Maria`.
    - `empty says so and links Bid Track`: the exact text above, plus a link named "Download Bid Track".
    - `never says Self`: `queryByText(/self/i)` is null.
  - `SelfBidsPanel.test.tsx` (mocked `listBids` → `{ day: null, week: '2026-11-29', bids: [], summary: {}, ... }`): `getByText('No bids in this period')`, `queryByRole('columnheader', { name: 'Status' })` null, title contains `Week ending Sun Nov 29`.
  - `tests/bidderPage.test.mjs`: `timeColumns` of a month response carries `end` per column.
- [ ] **Step 2: Run** `npx vitest run src/components/bidders/MyBidsTab.test.tsx src/components/bidders/SelfBidsPanel.test.tsx` and `npm run test:node` → FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** → PASS; `npm run lint` → exit 0.
- [ ] **Step 5: Commit** `feat(bids): My bids tab, one row per profile; read-only panel without review parts`.

### Task 7: The Bids page: rename, tabs, own-team default, Show switch removed

**Files:**
- Modify: `src/components/Sidebar.tsx:64` (label `Bids`), `src/pages/Bidders.tsx`, `src/components/bidders/biddersFilters.tsx`, `src/components/bidders/biddersFilters.test.tsx`, `src/lib/bidderFilters.ts`, `src/lib/bidderFilters.test.ts`, `src/components/bidders/BiddersOverview.tsx`, `src/components/bidders/BiddersTable.tsx` (remove `SelfRows`, the `show` prop and the Self rows in `<tfoot>`), `src/lib/bidderPage.ts` (remove `shownRows` / `RowFilter`), `tests/bidderPage.test.mjs`
- Delete: `src/components/bidders/SelfRows.test.tsx`
- Create: `src/pages/Bidders.test.tsx`

**Interfaces:**
- Consumes: Task 4 `sectionFromUrl`, `sectionPatch`, `ownerScope`, `ownerOptions`, `ownerSelectValue`; Task 6 `MyBidsTab`.
- Produces:
  - **Filters.** `bidderFilters.ts` loses the `show` key: `BidderKey`, `BidderFilters.show`, `BIDDER_URL_DEFAULTS.show`, `BIDDER_CLEAR_KEYS`, `BIDDER_SHOW_OPTIONS`, `BidderRowFilter`, and `show` in `bidderCanClear`.
  - **Bar.** `BiddersFilterBar` props: `{ f, isAdmin, section: BidsSection, ownerOptions, ownerValue: string, serverLabel?, failed?, shown? }`. Search and Show archived render only when `section === 'bidders'`. The Owner select uses `ownerValue` and patches `owner: v || undefined`.
  - **Page.**
    - `useDocumentTitle('Bids')`; `PageHeader` title "Bids".
    - Actions: `Add bidder` plus `ActionMenu` "More actions" with one item, "Download Bid Track" (`window.location.assign(`${BASE_URL}/ext/download`)`). The install steps move into the help popover in Task 9.
    - `Tabs` keys `bidders | mine | pay`, labels Bidders / My bids / Pay, with Pay `hidden: true` until Task 15. A tab change calls `setParam(sectionPatch(k))`, which pushes a history entry. Tabs show only when `bidder` is absent.
    - Every API call takes `ownerId` from `ownerScope(filters.owner, isAdmin, user?.id).ownerId`.
    - With All owners, the Bidders table shows the Owner column (`showOwner={all}`).
  - **Empty states.**
    - Another owner with no bidders: "This owner has no bidders." / "This owner has no active bidders." plus "Show all owners" (patch `owner: 'all'`).
    - Own team empty: "No bidders yet" / "Add a bidder, then send them the invite code and the Bid Track download." plus Add bidder.

- [ ] **Step 1: Write the failing tests** in `src/pages/Bidders.test.tsx`.

  Setup, following `Accounts.test.tsx`:
  - `vi.mock('../api/endpoints')` with `getBidClock` → `AFTER`. `getBidPerformance` → a week-mode response: Ana (`b1`, week `{ approved: 10, pending: 3, toReview: 3, pay: 0.6, ... }`), `payWeek` days 2026-11-23..29, and `selfRows` for `u1` with profile Alpha.
  - `lookupUsers` → `u1` Pat and `u2` Zed; `listBidders` → `[]`; `getBidAlerts` → no flags; `getBidInsights` → nulls; `getBidBacklog` → total 0.
  - `useAuth` → admin `u1`. `vi.mock('../components/bids/FocusReview')` → a stub that prints `JSON.stringify(props.scope)` and has a "Close" button calling `onExit`.

  Tests:
  - `opens on Bids › Bidders with the admin's own team`: heading `Bids`; tabs `Bidders`, `My bids`, no `Pay`; `getBidPerformance` called with `ownerId: 'u1'`; the Owner select shows `Me`; no radiogroup named `Show`.
  - `show=self opens My bids`: `/bidders?show=self` → the `My bids` tab has `aria-selected="true"` and `Alpha` is shown.
  - `a tab change writes section and drops search and archived`: `/bidders?q=ana&archived=1`, click `My bids` → the location search is `?section=mine`.
  - `All owners asks for everyone and shows the Owner column`: pick `All owners` → search `?owner=all`; the last `getBidPerformance` call has no `ownerId`; columnheader `Owner` present.
  - `bidderFilters.test.ts`: delete the Show describe; `bidderCanClear` ignores `show`.
- [ ] **Step 2: Run** `npx vitest run src/pages/Bidders.test.tsx src/lib/bidderFilters.test.ts src/components/bidders/biddersFilters.test.tsx` → FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** the same files, `npm run test:node` and `npm run lint` → PASS.
- [ ] **Step 5: Commit** `feat(bids): Bids page with Bidders and My bids tabs, own team by default, no Show switch`.

### Task 8: To review block and one way in, one way out of review

**Files:**
- Create: `src/components/bidders/ToReviewBlock.tsx`, `src/components/bidders/ToReviewBlock.test.tsx`
- Modify: `src/pages/Bidders.tsx`, `src/components/bidders/BiddersOverview.tsx` (no strip review item, no "Review all"), `src/lib/bidderPage.ts` (`stripItems` drops the `review` item), `tests/bidderPage.test.mjs`, `src/components/bidders/BiddersTable.tsx` (the Pending badge is a button in every period kind), `src/components/bidders/BidderView.tsx` (tile action), `src/lib/bidderInsights.ts` (`attentionFlags`), `tests/bidderInsights.test.mjs`, `src/components/bidders/BidderAlerts.tsx` (uses `attentionFlags`), `src/pages/Bidders.test.tsx`

**Interfaces:**
- Consumes: Task 2 `listPendingBids`; Task 3 `getBidBacklog`; Task 4 `reviewFromUrl`, `reviewPatch`, `REVIEW_EXIT`, `reviewSwitchValue`, `reviewSwitchScope`, `pendingQuery`; Task 5 `FocusScope`, `scopeSwitch`.
- Produces:
  - **`ToReviewBlock`.** `ToReviewBlock({ backlog: api.BidBacklog; allOwners: boolean; onReview: (scope: ReviewScope, bidderId?: string) => void })`.
    - Hidden when `total` is 0.
    - Amber, `role="status"`, not an alert.
    - Line: `To review · {total} pending (all, any age) · oldest {Mon Nov 9}`.
    - A chip per bidder: `` `${name} ${pending}` ``, or `` `${name} · ${ownerName} ${pending}` `` with `allOwners`. A chip calls `onReview({ kind: 'all' }, bidderId)`.
    - `Review today ({todayCount})`, shown when `todayCount > 0`, calls `onReview({ kind: 'day', day: backlog.today })`.
    - `Review all` calls `onReview({ kind: 'all' })`.
  - **`attentionFlags`.** `attentionFlags(alerts: api.BidAlerts): api.BidAlert[]` returns the flags without `review_backlog` (the block covers it). `BidderAlerts` renders only those.
  - **Page wiring.**
    - `setParam(patch, opts?: { replace?: boolean })`.
    - The overlay's `scope = { queue: pendingQuery(target, request, ownerId) }` comes from `reviewFromUrl`. When the query is null, no overlay opens.
    - `scopeSwitch.onChange` calls `setParam(reviewPatch(reviewSwitchScope(v, clock), target.bidderId), { replace: true })`.
    - Close calls `setParam(REVIEW_EXIT)`.
    - The `FocusReview` `key` is `JSON.stringify(scope)` + `startAt`.
    - `refresh()` also revalidates `'bid-backlog'`.
  - **Entry points.**
    - The list row's Pending badge → `reviewPatch({ kind: 'range' }, rowId)`. It never sets `bidder` (the audit's `Bidders.tsx:199`).
    - The bidder page tile → `reviewPatch({ kind: 'week', at: weekKey })`; the URL's own `bidder` filters it.
    - The day panel's bid walk is unchanged.
  - The block sits at the top of the Bidders tab, above the alerts.

- [ ] **Step 1: Write the failing tests:**
  - `ToReviewBlock.test.tsx`. Backlog: total 18, todayCount 6, oldest `2026-11-09`, bidders Ana 12 and Raj 6.
    - Text `To review · 18 pending (all, any age) · oldest Mon Nov 9`.
    - `Review today (6)` → `onReview({ kind: 'day', day: '2026-11-25' })`.
    - Chip `Ana 12` → `onReview({ kind: 'all' }, 'b1')`.
    - `queryByRole('alert')` is null.
    - Total 0 renders nothing.
  - `Bidders.test.tsx` (backlog mock: total 3, todayCount 1, today `2026-11-25`, Ana 3). The stub's printed scope is parsed and compared with `toEqual`, so key order doesn't matter.
    - `the row's Pending badge opens the review over the list and Close returns to the list`:
      - Click `Review 3 pending bids of Ana`. The search has `mode=focus`, `review=range`, `reviewBidder=b1` and no `bidder`.
      - The scope is `{ queue: { period: 'week', ownerId: 'u1', bidderId: 'b1' } }`.
      - Click `Close`. The search is `''`, the row `Ana` is visible and there is no `← Bidders` button.
    - `To review › Review all walks every pending bid of the owner`: the scope is `{ queue: { period: 'all', ownerId: 'u1' } }`.
    - `Review today uses the server's today`: the search has `review=day&at=2026-11-25`.
    - `an old focus link opens that week's review`: `/bidders?mode=focus&week=2026-11-22` → the scope is `{ queue: { period: 'week', date: '2026-11-22', ownerId: 'u1' } }`.
  - `tests/bidderInsights.test.mjs`: `attentionFlags` drops `review_backlog` and keeps `inactive`.
  - `tests/bidderPage.test.mjs`: the strip keys are `['approved', 'rejected', 'today']`.
- [ ] **Step 2: Run** `npx vitest run src/components/bidders/ToReviewBlock.test.tsx src/pages/Bidders.test.tsx` and `npm run test:node` → FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** → PASS; then `npm test`, `npm run lint`, `npm run build` → exit 0.
- [ ] **Step 5: Commit** `feat(bids): To review block; every review opens one overlay and Close returns where it opened`.

## Step 2: names and help, Week / Performance views

### Task 9: One word per number, and help you can click

**Files:**
- Create: `src/lib/bidsWords.ts`, `src/lib/bidsWords.test.ts`, `src/components/bidders/BidsHelp.tsx`, `src/components/bidders/BidsHelp.test.tsx`
- Modify: `src/pages/Bidders.tsx` (status via `statusWords`; the suggested-archive confirm uses `ARCHIVE_CONFIRM`), `src/components/bidders/BidderActions.tsx` (archive confirm uses `ARCHIVE_CONFIRM`; the "History" item goes, as Past weeks is a tab), `src/components/bidders/InviteDialog.tsx` (re-export `formatInviteDate` from `bidsWords`)

**Interfaces:**
- Produces:
  - `GLOSSARY: { word: string; means: string }[]`, in this order with this copy:
    - Approved: "Bids an owner approved."
    - Pending: "Bids waiting for review. They are not paid until approved."
    - Bids: "Approved + pending, shown only where both are meant (Performance view)."
    - Pay: "Approved bids × the bidder's rate, inside the pay week. The only money figure on this page."
    - Pay week: "Sunday 8 pm → Sunday 8 pm, Chicago time, shown as "Week ending Sun Nov 29". Weeks before Nov 22, 2026 ran Saturday 4 pm → Saturday 4 pm."
    - My bids: "Your own bids recorded by Bid Track while signed in as yourself. Never paid, never in the totals."
  - `OVERLAP_NOTE`: "A report day closes at 6 pm but the pay week at Sunday 8 pm, so bids made Sunday 6–8 pm show in Monday's day column yet count in the pay week that closes that Sunday. (Before Nov 22, 2026 the same happened Saturday 4–6:30 pm.)"
  - `BID_TRACK_STEPS`: the text of today's hover `title` at `Bidders.tsx:290`.
  - `rateText(rate: number): string` → `` `${usd(rate)} per approved bid` ``.
  - `formatInviteDate` (moved from `InviteDialog.tsx`).
  - `statusWords(status: 'active' | 'invited' | 'archived', bidder: { username: string | null; inviteExpiresAt: string | null } | undefined, now: number): { text: string; expired: boolean }`:
    - `Archived`;
    - `Active · @{username}` / `Active`;
    - `Invited` (no record, an admin viewing another owner);
    - `Invited · no code yet`;
    - `Invited · expires {formatInviteDate}`.
  - `ARCHIVE_CONFIRM = { title: 'Archive bidder?', body: (name: string) => string, confirmLabel: 'Archive', tone: 'default' }`. Body: `Archive ${name}? They're signed out of Bid Track and leave the reports. History is kept, and you can restore them any time.`
  - `BidsHelp()`: a button "What do these numbers mean?" (`aria-expanded`) that opens a popover (`role="dialog"`, `aria-label="What these numbers mean"`) with the glossary as a `<dl>`, `OVERLAP_NOTE`, and a "Bid Track" paragraph: "Download it from More actions › Download Bid Track. {BID_TRACK_STEPS}". It opens on click and closes on Esc, an outside click or the button.

- [ ] **Step 1: Write the failing tests:**
  - `bidsWords.test.ts`:
    - `rateText(0.06) === '$0.06 per approved bid'`;
    - `statusWords('active', { username: 'ana', inviteExpiresAt: null }, now).text === 'Active · @ana'`;
    - an invited bidder whose `inviteExpiresAt` is before `now` → `expired: true`;
    - `statusWords('invited', undefined, now).text === 'Invited'`;
    - the `GLOSSARY` words are `['Approved','Pending','Bids','Pay','Pay week','My bids']`;
    - `ARCHIVE_CONFIRM.body('Lee')` starts `Archive Lee? They're signed out`.
  - `BidsHelp.test.tsx`: a click opens the dialog containing `Pending` and `Sunday 6–8 pm`; `Escape` closes it; the trigger is a `button`.
- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3: Implement**, and use `statusWords` / `ARCHIVE_CONFIRM` in the files listed.
- [ ] **Step 4: Run** the two files, `npm test` and `npm run lint` → PASS.
- [ ] **Step 5: Commit** `feat(bids): one glossary, one status and rate wording, one archive confirm, click help`.

### Task 10: Week and Performance views of the Bidders table

**Files:**
- Modify (backend): `app/bids/performance.py` (each row gains `weeklyPending`), `tests_unit/test_bids_single_page.py`
- Modify (app): `src/lib/bidsUrl.ts`, `src/lib/bidsUrl.test.ts`, `src/lib/bidderFilters.ts`, `src/lib/bidderFilters.test.ts`, `src/lib/bidderPage.ts`, `tests/bidderPage.test.mjs`, `src/components/bidders/BiddersOverview.tsx`, `src/components/bidders/BiddersBand.tsx`, `src/api/endpoints.ts`, `src/components/bidders/PayReadNote.test.tsx` (import path)
- Create (app): `src/components/bidders/BiddersWeekTable.tsx`, `src/components/bidders/BiddersPerformanceTable.tsx`, `src/components/bidders/PayReadNote.tsx` (moved out of `BiddersTable.tsx`), `src/components/bidders/BiddersWeekTable.test.tsx`
- Delete (app): `src/components/bidders/BiddersTable.tsx`

**Interfaces:**
- Produces (backend): each `performance()` row gains `"weeklyPending": list[int]`, the pending bids per time column, aligned with `weekly` (`weekly` stays approved + pending).
- Produces (app):
  - `type BidsLens = 'week' | 'performance'`; `lensFromUrl(get: UrlGet): BidsLens`; `lensPatch(l: BidsLens): { lens: string | null }`.
  - `isWholePayWeeks(range: BidderPreset): boolean`: true for `this_pay_week`, `last_pay_week`, `last_2_pay_weeks`, `pay_week`, `two_pay_weeks`.
  - In `bidderPage.ts`: `weekCell(row: BidPerformanceRow, i: number, weekMode: boolean): BidCounts`. Week mode returns `row.dayCells[i]`; otherwise `{ approved: weekly[i] − weeklyPending[i], pending: weeklyPending[i], rejected: null }`.
  - `cardOpen(stored)` returns `stored === 'open'`, so the card is folded by default.
  - Removed: `stripItems` / `StripItem` (the Total row carries those numbers).
  - `api.BidPerformanceRow.weeklyPending?: number[]`.
  - **`BiddersWeekTable`.** `BiddersWeekTable({ data, rows, showOwner, showPay, onOpenBidder, onReview, renderStatus, renderActions })`. `data` is the whole period (the Total row); `rows` is the search-narrowed list (fixes F18).
    - **Columns:** Bidder (sticky on narrow screens) · time columns (`DayCount` of `weekCell`, today highlighted, a day cell opens the bidder's day) · Approved · Pending (a button `Review {n} pending bids of {name}` → `onReview(id)`) · Pay (only when `showPay`) · ⋯.
    - **Behaviour:** every header sorts. There are no ⓘ icons, and honest "—" / `PayReadNote` stay.
  - **`BiddersPerformanceTable`.** `BiddersPerformanceTable({ data, rows, platformPer100, showOwner, onOpenBidder, renderActions })`.
    - **Columns:** Bidder · Bids (total with ↑/↓ change) · Days at 50+ (`{hitDays} of {weekdays}` and %) · Interviews (per 100) · Approval (% and `{approved} of {reviewed}`) · Cost per interview · Last bid · ⋯.
    - No "$X paid" line (F4) and no dot strip (F11).
  - **`BiddersOverview`.**
    - A `Segmented` "View" (Week | Performance) writes `lensPatch`.
    - With `!isWholePayWeeks(range)`, one line above the Week table: "Pay is shown for whole pay weeks. Pick This pay week, Last pay week or Last 2 pay weeks to see it."
    - The comparison card renders only in the Performance view. Folded, it is one line: `{whose} {n} bidders vs the platform · Days at 50+ {pct} · Approval {pct} · Interviews {x} per 100 · Cost per interview {$}`, plus a "Show details" button. Unfolded, it is today's card.
    - `BidsHelp` sits beside the View switch. The strip is gone.

- [ ] **Step 1: Write the failing tests:**
  - **pytest** `test_month_columns_carry_pending` (existing fixture, now Wed 2026-11-18): `perf(pedro, period="month", date="2026-11-01")`. Ana's row has `weekly[2] == 14`, `weeklyPending[2] == 4` and `sum(weeklyPending) == 4`.
  - **vitest `bidsUrl`:** `''` → `week`; `lens=performance` → `performance`; `lens=junk` → `week`; `lensPatch('week')` → `{ lens: null }`.
  - **vitest `bidderFilters`:** `isWholePayWeeks` is true for the five pay-week presets and false for `this_month`, `last_month`, `month` and `custom`.
  - **node `bidderPage`:**
    - `weekCell` month with `weekly [14]`, `weeklyPending [4]` → `{ approved: 10, pending: 4, rejected: null }`;
    - `cardOpen(null) === false`, `cardOpen('open') === true`.
  - **`BiddersWeekTable.test.tsx`:**
    - month data with `showPay={false}` → no columnheader named `Pay`, columnheaders `Approved` and `Pending` present;
    - week data with `showPay` → Ana's Pay cell `$0.60`;
    - the `Review 3 pending bids of Ana` button → `onReview('b1')`;
    - with `rows` narrowed to `[]`, the Total row still shows the full approved total.
- [ ] **Step 2: Run** the pytest test, the vitest files and `npm run test:node` → FAIL.
- [ ] **Step 3: Implement**, then delete `BiddersTable.tsx`.
- [ ] **Step 4: Run** → PASS; then `npm test`, `npm run lint`, `npm run build` → exit 0.
- [ ] **Step 5: Commit** (both repos) `feat(bids): Week view by default, Performance view on demand; pay only for whole pay weeks`.

### Task 11: Needs attention block

**Files:**
- Create: `src/components/bidders/NeedsAttention.tsx`, `src/components/bidders/NeedsAttention.test.tsx`
- Modify: `src/pages/Bidders.tsx` (inside the Bidders tab, under To review)
- Delete: `src/components/bidders/BidderAlerts.tsx`

**Interfaces:**
- Consumes: `attentionFlags`, `flagText`, `archiveText` (`bidderInsights.ts`); `ARCHIVE_CONFIRM` (Task 9).
- Produces: `NeedsAttention({ alerts: api.BidAlerts; onOpenBidder: (id: string) => void; onOpenProfile: (id: string) => void; onArchive: (id: string, name: string) => void; canArchive: boolean })`.
  - **Look:** amber, `role="region"`, `aria-label="Needs attention"` (never `role="alert"`).
  - **Heading:** a toggle button "Needs attention · {n}", open by default. Folding is remembered in localStorage `bids.attention.open` (`'closed'` = folded), with try/catch around every access.
  - **Lines:** one sentence per flag with `[Open]`: `no_interviews` opens the profile, the other kinds open the bidder.
  - **Unused bidders:** one line "Looks unused:" with a chip per suggestion (`{name} · {archiveText}` plus an `Archive` button when `canArchive`).
  - Renders nothing when there is nothing to show.

- [ ] **Step 1: Write the failing tests:** alerts with flags `inactive` (Raj) and `review_backlog` (Ana), and archive `idle` (Lee `b3`).
  - Exactly one flag sentence (Raj's), and no `waiting for review` text.
  - `queryByRole('alert')` is null.
  - `Archive` in Lee's chip → `onArchive('b3', 'Lee')`.
  - The toggle hides the lines and stores `'closed'`.
- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3: Implement**, and replace `BidderAlerts` in the page.
- [ ] **Step 4: Run**, plus `npm test` and `npm run lint` → PASS.
- [ ] **Step 5: Commit** `feat(bids): amber Needs attention block with the unused-bidder line`.

## Step 3: the bidder page

### Task 12: Bidder page header, week nav and Days / Past weeks

**Files:**
- Modify (backend): `app/bids/week.py` (each `week_board` row gains `profileId`), `tests_unit/test_bids_single_page.py`
- Modify (app): `src/components/bidders/BidderView.tsx` (the tile labels live in its `tiles` array), `src/components/bidders/BidderActions.tsx`, `src/pages/Bidders.tsx`, `src/api/endpoints.ts` (`BidWeekRow.profileId: string | null`)
- Create (app): `src/components/bidders/BidderView.test.tsx`

**Interfaces:**
- Consumes: `statusWords`, `rateText`, `BidsHelp` (Task 9); `WeekNav` and `ShownWeeks` (Task 1); `reviewPatch` (Task 4).
- Produces:
  - **Backend:** each `week_board` row gains `"profileId": Optional[str]`.
  - **`BidderView` props:**
    - `week: { shown: ShownWeeks; label: string; isCurrent: boolean; onChange: (week: string | null) => void }`;
    - `onBack: () => void`. The page maps it to `setParam({ bidder: null, day: null, tab: null, week: null })`; clearing `week` stops a browsed week leaking into the list (F24).
    - The other props are unchanged. `onParam` accepts the review keys.
  - **`BidderActions`.** `BidderActions({ bidder, onChanged, layout?: 'row' | 'page' })`.
    - `'row'`: today's menu without History.
    - `'page'`: visible buttons `Edit`, plus `Invite code` (invited) or `Reset login` (active), then a ⋯ menu with Archive or Restore only.
  - **Layout, top to bottom:**
    - `← Bidders` (first focusable, top-left);
    - flag + name + status words;
    - `Profile {name}` linking to `/accounts/{profileId}` (plain text without an id) · resume names · `rateText`;
    - actions (own bidders only);
    - `WeekNav` and `BidsHelp` in the same header panel.
  - **Tabs:** `Days` | `Past weeks`; the URL keeps `tab=history`.
  - **Tiles:** only on Days. Labels: Approved, Pending (button "Review" → `onParam(reviewPatch({ kind: 'week', at: weekKey }))`), Rejected, Today.
  - **Page:** the title (`PageHeader` and `useDocumentTitle`) is the bidder's name.

- [ ] **Step 1: Write the failing tests:**
  - **pytest** `test_board_rows_carry_the_profile_id`: Ana with a profile → `board(pedro)["bidders"][0]["profileId"] == str(profile.id)`.
  - **`BidderView.test.tsx`** (mocked `listBids` → empty; row Ana `b1`, status active, username `ana`, profileId `p1`, profileName `Dev-A`, rate 0.06, `weekKey '2026-11-29'`):
    - the first button is named `Bidders` and calls `onBack`;
    - text `Active · @ana`;
    - a link `Dev-A` with `href '/accounts/p1'`;
    - text `$0.06 per approved bid`;
    - tabs named `Days` and `Past weeks`;
    - with `tab='history'`, no `Approved` tile;
    - clicking `Review` → `onParam` called with `{ mode: 'focus', review: 'week', at: '2026-11-29', reviewBidder: null, bid: null }`.
- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run**, plus `npm test` and `npm run lint` → PASS.
- [ ] **Step 5: Commit** (both repos) `feat(bids): bidder page header with ← Bidders, visible actions, week nav; Days and Past weeks`.

### Task 13: The bidder's performance line

**Files:**
- Modify: `src/lib/bidderFilters.ts`, `src/lib/bidderFilters.test.ts`, `src/components/bidders/BidderView.tsx`, `src/pages/Bidders.tsx`
- Create: `src/components/bidders/BidderPerformanceLine.tsx`, `src/components/bidders/BidderPerformanceLine.test.tsx`

**Interfaces:**
- Consumes: `getBidPerformance`, `getBidInsights`, `rowPer100Verdict`.
- Produces:
  - `bidderPerfRequest(f: BidderFilters, clock: ReportClock): { request: BidderPeriodRequest; fromList: boolean }`. A month preset or a valid Custom range in the URL (the list it was drilled from) gives `bidderPeriodRequest(f, clock)` and `fromList: true`. Anything else gives Last month (`{ period: 'month', date: <first of last month> }`, `fromList: false`). The default is Last month as the design proposes; there is no picker, and the line says which period it shows.
  - `BidderPerformanceLine({ bidderId: string; ownerId: string; request: BidderPeriodRequest })` fetches `getBidPerformance({ ...request, ownerId, includeArchived: true })` and `getBidInsights({ ...request, ownerId })`, then picks the row by id. It renders:
    `{label}: 50+ on {hitDays} of {weekdays} weekdays · {interviews} interviews ({per100} per 100{ ▲/▼ vs the platform}) · {approval}% approved · {cost} per interview · last bid {relative}`.
    - An unknown measure shows "—".
    - While loading it shows a skeleton line; on error, "Couldn't load performance." with Retry.
  - `BidderView` gains `perfRequest: BidderPeriodRequest` and renders the line under the header on both tabs.

- [ ] **Step 1: Write the failing tests:**
  - `bidderFilters.test.ts` (AFTER):
    - default → `{ request: { period: 'month', date: '2026-10-01' }, fromList: false }`;
    - `range=this_month` → `{ request: { period: 'month' }, fromList: true }`;
    - Custom 2026-10-05..2026-10-20 → `{ request: { period: 'custom', date: '2026-10-05', to: '2026-10-20' }, fromList: true }`.
  - `BidderPerformanceLine.test.tsx` (mocked row: hitDays 14, weekdays 21, interviews 3, per100 0.8, approvalRate 0.96, costPerInterview 5, label `Oct 2026`, lastBidAt null; insights platform per100 1.5) → text `Oct 2026: 50+ on 14 of 21 weekdays · 3 interviews (0.80 per 100 ▼ vs the platform) · 96% approved · $5 per interview · last bid —`.
- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run**, plus `npm test` and `npm run lint` → PASS.
- [ ] **Step 5: Commit** `feat(bids): the bidder page shows performance for the list's month or last month`.

## Step 4: the Pay tab

### Task 14: Backend: pay per pay week (stored report for closed weeks, live board for the open one)

**Files:**
- Modify: `app/bids/week.py` (`pay_weeks_touching`), `app/routers/bids.py` (new route above `get_bid`)
- Test: `tests_unit/test_bids_week.py`, `tests_unit/test_bids_page_endpoints.py`

**Interfaces:**
- Consumes: `bid_period`, `pay_week`, `week_board`, `week_label`, `period_key`, `BidReport`.
- Produces:
  - `pay_weeks_touching(sched: BidSchedule, now: datetime, first: date, last: date) -> list[PayWeek]`: every pay week with a report day in `[first, last]`, newest first.
  - `GET /bids/pay` → `async def bids_pay(user, period: str = Query("week"), date: str = Query(""), to: str = Query(""), weeks: int = Query(1, ge=1, le=2), ownerId: Optional[str] = None) -> dict` returning:
    - top level `{"label": p.label, "timezone": str, "first": str, "last": str, "weeks": [...]}`. `first` / `last` are the report-day bounds of all the weeks;
    - each week: `{"weekEnd": period_key(pw.cutoff), "label": week_label(pw), "end": iso, "first", "last", "state": "open" | "closed", "source": "report" | "live", "bidders": [...], "totals": {"approved": int, "pending": int, "pay": float, "errors": int}}`;
    - each bidder: `{"bidderId", "name", "country", "profileName", "ownerId", "ownerName", "approved": Optional[int], "pending": Optional[int], "rate": float, "pay": Optional[float], "error": Optional[str]}`.
  - **Which weeks:** `p.pay_week`, `p.pay_weeks` or `pay_weeks_touching(p.start, p.end)`, newest first.
  - **Closed week** (`pw.end <= now`): the weekly `BidReport` rows with that `periodKey`, filtered by `ownerId` (staff: their own; admin: `ownerId` or all). The row's snapshot name, `count` → approved, `pending`, `rate`, `amount` → pay and `error`, with `source="report"`. With no stored rows, it falls back to the live board with `source="live"`.
  - **Open week:** `week_board(_visible_bidders(user, owner), pw, ...)` block `approved` / `pending` / `pay` / `error`, with `source="live"`.
  - **Archived bidders** (now) appear only with approved or pending > 0.
  - **Sorting:** bidders by `(ownerName or "").lower()`, then `name.lower()`. Totals add the known values; `errors` counts the rows that have an error.

- [ ] **Step 1: Write the failing tests:**
  - **`test_bids_week.py`** `test_pay_weeks_touching_across_the_switch` (the file's `sched_on` from the pay-week plan): `first=2026-11-01`, `last=2026-11-25` → week ends `[2026-11-29, 2026-11-22, 2026-11-14, 2026-11-07]` (local cutoff dates).
  - **`test_bids_page_endpoints.py`** (`switch_on`, now Wed 2026-11-25 09:00). Seed: a stored weekly row for Ana with `periodKey "2026-11-22"`, count 158, rate 0.06, amount 9.48, pending 3, rejected 0, ownerId pedro. Ana's live rate is edited to 0.10. Ana has 2 approved bids in the long week, plus 1 approved and 1 pending on Nov 24.
    - `test_pay_closed_week_uses_the_stored_report`:
      - `week` + `2026-11-22`: the week has `state "closed"`, `source "report"`, `label "Week ending Sun Nov 22"`, `first "2026-11-15"`, `last "2026-11-22"`;
      - Ana has approved 158, pending 3, rate 0.06, pay 9.48;
      - totals `{approved: 158, pending: 3, pay: 9.48, errors: 0}`.
    - `test_pay_open_week_uses_the_live_board`: `week` → `state "open"`, `source "live"`, Ana approved 1, pending 1, rate 0.10, pay 0.1.
    - `test_pay_closed_week_without_a_report_is_live`: `week` + `2026-11-14` → `source "live"`.
    - `test_pay_month_lists_the_pay_weeks_it_touches`: `month` + `2026-11-01` → `[w["weekEnd"] for w in weeks] == ["2026-11-29", "2026-11-22", "2026-11-14", "2026-11-07"]`.
    - `test_pay_hides_archived_bidders_without_bids`: a stored row for Lee (archived) with count 0 and pending 0 → not listed. With count 4 → listed.
    - `test_pay_staff_see_only_their_own`: a stored row for Mia (ownerId maria) in week `2026-11-22`. pedro with `week` + `2026-11-22` sees only `Ana`; pedro with `ownerId=maria` → every week's `bidders == []`.
    - `test_pay_admin_any_owner_or_all`: `week` + `2026-11-22`: boss with `ownerId=maria` → names `["Mia"]`; boss without → `["Mia", "Ana"]` (Maria sorts before Pedro).
- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** both files → PASS.
- [ ] **Step 5: Commit** `feat(bids): /bids/pay — each pay week's pay, closed weeks as reported`.

### Task 15: Pay tab and Copy pay summary

**Files:**
- Create: `src/lib/payCopy.ts`, `src/lib/payCopy.test.ts`, `src/components/bidders/PayTab.tsx`, `src/components/bidders/PayTab.test.tsx`
- Modify: `src/api/endpoints.ts`, `src/lib/bidderFilters.ts`, `src/lib/bidderFilters.test.ts`, `src/components/bidders/biddersFilters.tsx`, `src/pages/Bidders.tsx`, `src/pages/Bidders.test.tsx`, `src/components/bidders/BiddersOverview.tsx` (the pay pointer becomes a link to the Pay tab)

**Interfaces:**
- Consumes: Task 14's response; `reviewPatch`, `sectionPatch` (Task 4); `shownWeeksOf` / `ShownWeeks` (Task 1); `timeInZone` (`weekDates.ts`); `BidsHelp`.
- Produces:
  - **API:** `api.PayBidderRow`, `api.PayWeekBlock`, `api.BidPay` (Task 14's shapes) and `api.getBidPay(p: { period: 'week' | 'month' | 'custom'; date?: string; to?: string; weeks?: number; ownerId?: string }): Promise<BidPay>`.
  - **Default range:** `parseBidderValues`, `bidderCanClear`, `rangeToUrl`, `periodPatch`, `stepBidderPeriod` and `pickBidderPreset` take a last parameter `defaultRange: BidderPreset = BIDDER_DEFAULT_RANGE`. `useBidderFilters(isAdmin, clock, defaultRange)`. The page passes `'last_pay_week'` when `section === 'pay'`.
  - **`payCopyText(week: api.PayWeekBlock, opts: { groupByOwner: boolean }): string`.** Lines are joined with `\n`:
    - first, `week.label` with "Week ending" replaced by "Pay week ending", plus ` (so far)` when `state === 'open'`;
    - with `groupByOwner`, a `{ownerName ?? 'Unknown owner'}:` line before each owner's bidders;
    - for each bidder, one of:
      - `{name} — {approved} approved × {usd(rate)} = {usd(pay)}`;
      - `{name} — {approved} bids × {usd(rate)} = {usd(pay)}` (folder week, `pending === null`);
      - `{name} — couldn't read the count` (error);
    - after a bidder's line, when `pending > 0`: `⚠ {name}: {pending} pending — not paid until reviewed`;
    - last, `Total {usd(totals.pay)}`.
  - **`PayTab({ data: api.BidPay; allOwners: boolean; onReview: (weekEnd: string, bidderId: string) => void })`.** One block per week, in the order served.
    - **Heading:**
      - closed from the report: `{Pay week ending …}, {timeInZone(end, timezone)} · closed (as posted to Slack)`;
      - closed but live: `… · closed (live count; the weekly report isn't saved yet)`;
      - open: `… · so far`.
    - **Copy button:** `Copy pay summary` per block → `navigator.clipboard.writeText(payCopyText(week, { groupByOwner: allOwners }))`, then `notify.success('Pay summary copied')`.
    - **Rows:** `{name}  {approved} approved × {rate} = {pay}`, then `⚠ {n} pending — not paid until reviewed` with a `Review` button → `onReview(week.weekEnd, bidderId)`. With `allOwners`, rows are grouped under owner headings. A Total row follows.
    - **Empty week:** "No approved or pending bids in this pay week."
    - `BidsHelp` in the tab header.
  - **Page.**
    - The Pay tab is visible.
    - Pay data: SWR `['bid-pay', request…, ownerId]`. The bar's `serverLabel` and `shown` come from it (`{ first, last }`) on this tab.
    - `onReview` → `setParam(reviewPatch({ kind: 'week', at: weekEnd }, bidderId))`.
  - **Pay pointer:** in the Week view it reads "Pay is counted per pay week — see the Pay tab.", with a button calling `setParam(sectionPatch('pay'))`. The range is kept, so a month opens its pay weeks.

- [ ] **Step 1: Write the failing tests:**
  - **`payCopy.test.ts`.**
    - `the design's summary`: a closed week labelled `Week ending Sun Nov 29` with Ana (158, 3 pending, 0.06, 9.48) and Raj (100, 0, 0.06, 6), totals pay 15.48, gives exactly:
      ```
      Pay week ending Sun Nov 29
      Ana — 158 approved × $0.06 = $9.48
      ⚠ Ana: 3 pending — not paid until reviewed
      Raj — 100 approved × $0.06 = $6.00
      Total $15.48
      ```
    - The open week's first line is `Pay week ending Sun Nov 29 (so far)`.
    - `groupByOwner` puts `Pedro:` before Ana.
    - An error row reads `Lee — couldn't read the count`.
    - A folder row reads `Ana — 158 bids × $0.06 = $9.48`.
  - **`PayTab.test.tsx`.**
    - `navigator.clipboard.writeText` mocked: clicking `Copy pay summary` calls it with the exact text above.
    - The text `⚠ 3 pending — not paid until reviewed` is visible.
    - `Review` → `onReview('2026-11-29', 'b1')`.
    - The heading contains `closed (as posted to Slack)`.
  - **`bidderFilters.test.ts`** (`defaultRange 'last_pay_week'`):
    - parsing `''` → `last_pay_week`;
    - picking This pay week → patch `{ range: 'this_pay_week', ... }`;
    - `bidderCanClear` is false on `last_pay_week`.
  - **`Bidders.test.tsx`** `the Pay tab opens on Last pay week`: `/bidders?section=pay` → `getBidPay` called with `{ period: 'week', date: '2026-11-22', ownerId: 'u1' }`; tab `Pay` has `aria-selected="true"`.
- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run**, then `npm test`, `npm run lint`, `npm run build` → exit 0.
- [ ] **Step 5: Commit** `feat(bids): Pay tab — pay per pay week, pending warnings, Copy pay summary`.

## Step 5: daily and weekly bids Slack posts

### Task 16: Post format: only bidders with bids, page words, owner buttons, My bids line

**Files:**
- Modify: `app/bids/slack_format.py`, `tests_unit/test_bids_slack_format.py`

**Interfaces:**
- Produces: `format_report(kind, start, end, rows, owners, tz, app_url, updated_at=None, my_bids: Optional[Mapping[str, Mapping[str, int]]] = None) -> tuple[str, list[list[dict]]]`. `my_bids` maps owner id → {profile name: self bids}.

Rules:
- **Which rows.** A row is empty when it has no error and `count`, `pending` and `rejected` are all 0 or None. Empty rows are left out. An owner with no row left is left out, unless they have My bids (> 0): then their section is the header `*{owner}*` alone plus the My bids line (user-approved preview, 2026-11-16). Error rows stay.
- **Bidder line, records** (`pending` is not None):
  - Daily: `• {flag} {name} · {profile} — {count} approved · {pending} pending`.
  - Weekly: `• … — {count} approved × {rate} = {amount} · {pending} pending`.
  - ` · {rejected} rejected` is added only when rejected > 0.
  - Folder rows keep `— {count} bids` (weekly `— {count} bids × {rate} = {amount}`).
  - Error: `• ⚠️ {name} — couldn't read screenshot folder` (unchanged).
- **Owner section.**
  - Header `*{owner}* — {approved} approved · {pending} pending`, with the same rejected rule. Weekly adds ` · *{pay}*`. ` · {n} failed` as today. An all-folder owner reads `{count} bids`.
  - The bidder lines follow (most first, as today). When the owner's My bids total is > 0, the last line is `My bids — {total} ({name} {n} · …)`, with profiles sorted by name case-insensitive, zero counts left out and names escaped. My bids never count in any total.
- **Owner button.** The owner's first section carries a button accessory: `{"type": "button", "text": {"type": "plain_text", "text": ...}, "url": ..., "action_id": f"bids-link-{ownerId}"}`.
  - Daily: with pending > 0, the text is `Review {pending} pending` and the URL `{app_url}/bidders?owner={ownerId}&mode=focus&review=day&at={periodKey}`; otherwise `Open Bids` → `{app_url}/bidders?owner={ownerId}&range=pay_week&date={periodKey}`.
  - Weekly: every owner gets `Open Pay` → `{app_url}/bidders?section=pay&owner={ownerId}&range=pay_week&date={periodKey}` (user-approved preview: one Open Pay per owner).
  - "(cont.)" sections get no button.
- **Footer.**
  - Daily: `*Total: {approved} approved · {pending} pending · {n} bidder(s) with bids* · <{app_url}/bidders|View in app>`. Rejected is added only when > 0. `n` counts the listed rows without errors; singular is "1 bidder with bids".
  - Weekly: the same, with ` · {pay}` after pending. No footer button (Open Pay is per owner).
  - ` · updated …` as today.
- **Nobody with bids.** The blocks are the header, `No bids today.` (weekly `No bids this week.`) and `<{app_url}/bidders|View in app>`. The fallback text ends `: no bids`.
- **Fallback text.** `Daily bids — Fri Oct 2: 160 approved · 12 pending`; weekly adds ` · $9.60`.
- **No usable link.** With `app_url` not starting with `http`, no accessories are added (Slack refuses a bad URL). The existing interactions endpoint already answers unknown `block_actions` with 200, so link buttons need no handler.
- The header line, the 3,000-char "(cont.)" split, the 50-block messages and the escaping stay as they are.

- [ ] **Step 1: Write the failing tests** (rewrite the copy assertions of the existing tests; `test_large_reports_respect_slack_limits` uses counts `i + 1` so no row is empty):
  - `test_daily_post_lists_only_bidders_with_bids`. Rows: Ana Silva (PEDRO, BR, AI Full-stack, 160 / 12 / 0); Raj Kumar (PEDRO, 0 / 0 / 0); John Doe (PEDRO, error); Mia Cruz (MARIA, 0 / 0 / 0).
    - The texts are exactly: the header `📨 *Daily bids — Fri Oct 2* · Thu 6:30 PM → Fri 6:30 PM CDT`; then `*<@U1>* — 160 approved · 12 pending · 1 failed\n• 🇧🇷 Ana Silva · AI Full-stack — 160 approved · 12 pending\n• ⚠️ John Doe — couldn't read screenshot folder`; then `*Total: 160 approved · 12 pending · 1 bidder with bids* · <https://app.example/bidders|View in app>`.
    - Fallback `Daily bids — Fri Oct 2: 160 approved · 12 pending`.
  - `test_owner_button_links_to_the_review`. Pedro's accessory is `{"type": "button", "text": {"type": "plain_text", "text": "Review 12 pending"}, "url": f"https://app.example/bidders?owner={PEDRO}&mode=focus&review=day&at=2026-10-02", "action_id": f"bids-link-{PEDRO}"}`. An owner with 1 approved and 0 pending gets `Open Bids` → `f"https://app.example/bidders?owner={MARIA}&range=pay_week&date=2026-10-02"`.
  - `test_rejected_only_when_some`: 5 / 0 / 2 gives the line `• Ana — 5 approved · 0 pending · 2 rejected`.
  - `test_weekly_post_pay_lines_and_open_pay`:
    - the section `*<@U1>* — 160 approved · 12 pending · *$9.60*\n• 🇧🇷 Ana Silva · AI Full-stack — 160 approved × $0.06 = $9.60 · 12 pending`;
    - Pedro's accessory is `Open Pay` → `f"https://app.example/bidders?section=pay&owner={PEDRO}&range=pay_week&date=2026-10-02"`;
    - the footer text `*Total: 160 approved · 12 pending · $9.60 · 1 bidder with bids* · <https://app.example/bidders|View in app>`, with no accessory.
  - `test_no_bids_says_so`: all rows empty → texts `[header, "No bids today.", "<https://app.example/bidders|View in app>"]`; weekly says `No bids this week.`; the fallback ends `: no bids`.
  - `test_my_bids_line_per_owner`:
    - `my_bids={str(PEDRO): {"Cory": 23, "Arda": 12, "Zed": 0}, str(MARIA): {"Solo": 5}}`, with Maria having no bidder bids;
    - Pedro's section ends `\nMy bids — 35 (Arda 12 · Cory 23)`;
    - Maria (no bidder bids) gets the section `*<@U2>*\nMy bids — 5 (Solo 5)` with an `Open Bids` button;
    - the footer total is unchanged.
  - `test_folder_rows_keep_the_bids_wording`: a weekly folder row (pending None, count 2, rate 0.5) → `*<@U1>* — 2 bids · *$1.00*\n• 🇧🇷 Ana Silva — 2 bids × $0.50 = $1.00`; the footer starts `*Total: 2 bids · $1.00 · 1 bidder with bids*`.
  - `test_no_buttons_without_an_app_url`: `app_url=""` → no block has `"accessory"`.
- [ ] **Step 2: Run** `tests_unit/test_bids_slack_format.py` → FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `test_bids_slack_format.py` and `test_bids_reports.py` → PASS. Fix only assertions in `test_bids_reports.py` that read the old copy.
- [ ] **Step 5: Commit** `feat(bids): Slack posts list only bidders with bids, in the page's words, with review / pay buttons`.

### Task 17: Reports pass each owner's My bids into the post

**Files:**
- Modify: `app/bids/reports.py`, `tests_unit/test_bids_reports.py`

**Interfaces:**
- Consumes: `self_bids.tracked_counts` (import it inside the method, as `routers/bids.py:_self_rows` does, to avoid an import cycle); `week.pay_week`; Task 16 `format_report(..., my_bids=...)`.
- Produces:
  - `ReportStore.my_bids(self, owner_ids: list[PydanticObjectId], first: date, last: date) -> dict[str, dict[str, int]]`. `BeanieReportStore` sums `tracked_counts(owner, first, last)` per profile id and names the profiles with `Account` names (`"Unknown profile"` when missing).
  - `report_days(kind: Kind, period_key: str, sched: BidSchedule) -> tuple[date, date]`. Daily is `(d, d)`. Weekly is the first and last `DayWindow.key` of `pay_week(sched, datetime.now(timezone.utc), date.fromisoformat(period_key))`, so My bids covers the same report days as the My bids tab.
  - `_render` calls both and passes `my_bids`. It is used on first posts and on edits alike.

- [ ] **Step 1: Write the failing tests:**
  - `FakeStore` gains `self.mine = {}`, `self.my_bids_calls = []` and `async def my_bids(self, ids, first, last)`, which records `(first, last)` and returns `self.mine`. `Poster` also keeps `self.messages`.
  - `test_daily_post_carries_my_bids`:
    - `mine = {str(OWNER): {"Arda": 12, "Cory": 23}}`;
    - Ana's folder count is 3;
    - the tick at `DAILY_CUTOFF + 5 min` → a posted section contains `My bids — 35 (Arda 12 · Cory 23)`;
    - `my_bids_calls == [(date(2026, 10, 2), date(2026, 10, 2))]`.
  - `test_weekly_my_bids_cover_the_pay_weeks_report_days`: the tick at `2026-10-03T21:05Z` (Sat 16:05 CDT, `SCHED`) posts weekly; `(date(2026, 9, 27), date(2026, 10, 3))` is in `my_bids_calls`.
  - `test_store_my_bids_counts_self_bids_per_profile(db)`. Add `Account` to the `db` fixture's models.
    - Seed: Account `Arda` (createdBy OWNER); 2 bids `kind="self"`, `ownerId=OWNER`, `accountId=arda.id`, `firstAt` 2026-10-02 15:00 UTC.
    - `await reports.BeanieReportStore().my_bids([OWNER], date(2026, 10, 2), date(2026, 10, 2)) == {str(OWNER): {"Arda": 2}}`.
- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `test_bids_reports.py` and `test_bids_slack_format.py`, then the full backend suite (`.env` moved aside) → the failure set equals the baseline.
- [ ] **Step 5: Commit** `feat(bids): daily and weekly posts show each owner's My bids per profile`.
