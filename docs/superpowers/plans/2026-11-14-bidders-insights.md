# Bidders Insights Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The Bidders page compares the owner's bidders with the platform (card + best on the platform), flags bidders that need action, suggests archiving idle ones, adds approval and cost-per-interview columns, and lets an admin read another owner's bidder history.

**Architecture:** Server: `/bids/performance` rows gain pay fields; new `GET /bids/insights` (period: mine vs platform stats and tops; platform cached) and `GET /bids/alerts` (fixed windows: flags + archive). Website: pure helpers in `src/lib/bidderInsights.ts`; card + tops in the Performance tab; banners above both tabs.

**Tech Stack:** FastAPI, Beanie, pytest + mongomock-motor; React 18, TypeScript, SWR, Tailwind; `node --test`.

**Spec:** `docs/superpowers/specs/2026-11-14-bidders-insights-design.md` (website repo).

**Worktrees / branches:** server `scratchpad/run-backend-list`, website `scratchpad/run-app-list`, both `feat/bidders-insights`. Server tests: `"/c/Users/Administrator/Downloads/engineer - Copy/engineers_backend/.venv/Scripts/python" -m pytest <files> -q -p no:cacheprovider`; full suite with `--continue-on-collection-errors` (known pre-existing: test_bidder_ext upload 503, test_resume_prompts bad lists, 3 collection errors). Website: `npm test`, `npx tsc --noEmit -p .`, `npm run build`.

## Global Constraints

- Counting is `app/bids/performance.py`'s: bids = approved + pending; reviewed = approved + rejected; interviews via `interview_credit`, once per round for a group (`performance()` totals); pay = approved × `rate`.
- Only one owner's bidders get insights / alerts: staff always (own); admin only with `ownerId`; admin without → `null`s. Archived bidders never count.
- Never send another owner's bidder ids; names (bidder + owner) for "best on the platform" only.
- Flags: windows end today (report tz); 14 days `[today − 13, today]`; first kind wins in order `inactive`, `rejects`, `no_interviews`, `review_backlog`; bidder created ≥ 14 days ago, except `review_backlog` (no age gate, any-age pending bids whose report day ≤ today − 2). Unregistered bidders: no flags; archive only for an expired unused invite. A bidder in `archive` is never in `flags`.
- Thresholds: `inactive` = 0 bids on the last 3 weekdays before today; `rejects` = 20+ reviewed and ≥ 20% rejected (14 days); `no_interviews` = 100+ bids and 0 interviews (14 days); archive `idle` = registered, created ≥ 14 days ago, 0 bids in 14 days.
- Verdicts (website): per 100 ×0.75 / ×1.25 with 100+ bids; cost per interview lower is better, ×1.25 worse / ×0.75 better with 3+ interviews; approval 10 points apart with 30+ reviewed; hit rate 15 points apart with 10+ weekdays; avg per weekday never judged. Under the minimum → "too few to judge" (grey).
- Tops: most bids; best per 100 (100+ bids); lowest cost per interview (3+ interviews). Ties: better value, more bids, name.
- Copy: flag sentences exactly as the spec; card title "Your N bidders vs the platform average"; "Best on the platform: <bidder> (<owner>) – <value>" / "🏆 Best on the platform".

## Review Focus

- A bidder with no profile (`profileId` None) → no `no_interviews` flag (interviews unknown), no crash (Task 3 test).
- Shared profile (two bidders, untagged interviews) → platform/mine interviews counted once (Task 2 test).
- Admin with `ownerId` of another owner → insights and alerts for that owner; History readable; staff still 404 on another owner's history (Tasks 2–3 tests).
- Cold platform cache → insights waits only in its own request; `/bids/performance` never calls it (Task 2: performance tests unchanged except new keys).
- Bidder with rejects but no `rejectReason` → sentence without "mostly …" (Task 4 test).

## Decisions made while planning (rulings)

- Flags and archive are period-free, so they get their own endpoint `GET /bids/alerts` (keyed by owner only) instead of riding on `/bids/insights` (keyed by period): the banners above both tabs load once per owner, and changing the Performance period never refetches them.
- The Profiles card's tone / chip / bars pieces move to `src/components/insights/compareParts.tsx` so both cards share one look.

---

### Task 1: Server — pay fields on `/bids/performance`

**Files:** Modify `app/bids/performance.py`; test `tests_unit/test_bids_performance_router.py` (KEYS unchanged; row keys), add cases in `tests_unit/test_bids_performance.py` or a new `tests_unit/test_bids_performance_pay.py`.

**Interfaces — Produces:** each row + `rate`, `pay` (round 2), `reviewed`, `approvalRate` (`_ratio(approved, reviewed, 3)`), `costPerInterview` (`_ratio(pay, interviews, 2)`, null at 0 / None interviews); `totals` + `pay`, `approved`, `rejected`, `approvalRate`, `costPerInterview` (pay ÷ once-counted interviews).

- [ ] Step 1: failing test — bidder rate 0.5, 30 approved, 5 pending, 10 rejected, 2 interviews → row `pay == 15.0`, `reviewed == 40`, `approvalRate == 0.75`, `costPerInterview == 7.5`; a bidder with 0 interviews → `costPerInterview is None`; totals `pay` sums rows.
- [ ] Step 2: run → FAIL (KeyError).
- [ ] Step 3: implement.
- [ ] Step 4: run the new test + `test_bids_performance*.py` → PASS.
- [ ] Step 5: commit `feat(bids): pay, approval rate and cost per interview on performance rows`.

### Task 2: Server — `GET /bids/insights` (mine vs platform, tops)

**Files:** Create `app/bids/insights.py`; modify `app/routers/bids.py`; test `tests_unit/test_bids_insights.py`.

**Interfaces:**
- Consumes: Task 1 rows/totals; `performance()`; `BenchmarkCache` from `app.profile_compare` (own instance `platform_cache`).
- Produces: `bidder_stats(perf: dict) -> dict | None` (Stats per spec plus `hitDays`; `None` when no bidder has bids); `bidder_tops(rows) -> {bids, per100, costPerInterview: {id, name, ownerName, value} | None}`; `async def insights(bidders, period, start, end, label, today) -> dict` → `{start, end, label, mine, platform, tops: {measure: {mine: {id, name, value} | None, platform: {name, ownerName, value} | None}}}`; route `GET /bids/insights` (same params as performance minus `includeArchived`).

- [ ] Step 1: failing tests (copy fixtures from `test_bids_performance_router.py`; freeze `_now` 2026-11-04):
  - `test_mine_pools_the_owners_active_bidders` — 2 bidders (100 bids 2 interviews rate 0.5 all approved; 0 bids) → `mine.bidders == 1`, `mine.bids == 100`, `mine.per100 == 2.0`, `mine.pay == 50.0`, `mine.costPerInterview == 25.0`.
  - `test_shared_profile_interviews_count_once` — two bidders on one profile, 1 untagged interview → `mine.interviews == 1`.
  - `test_platform_covers_every_owner_and_names_the_best` — owners Pedro, Maria; Maria's bidder has the best per100 → `tops.per100.platform == {"name": "Bo", "ownerName": "Maria", "value": ...}` and no `id` key in any platform entry.
  - `test_tops_thresholds_and_ties` — 99-bid bidder never in per100 tops; 2-interview bidder never in cost tops; equal per100 → more bids wins.
  - `test_admin_needs_an_owner` — admin without ownerId → `mine is None and platform is None and tops is None`; with ownerId → Maria's numbers.
  - `test_archived_bidders_never_count`.
- [ ] Step 2: run → FAIL (no module / attribute).
- [ ] Step 3: implement; platform = `platform_cache.get((period, start, end))` computing `performance(all active bidders, …)`.
- [ ] Step 4: run the file + `test_bids_performance*.py` → PASS.
- [ ] Step 5: commit `feat(bids): insights — your bidders vs the platform and the best on the platform`.

### Task 3: Server — `GET /bids/alerts` and the History fix

**Files:** Create `app/bids/alerts.py`; modify `app/routers/bids.py`, `app/routers/bidders.py` (`bidder_reports`); tests `tests_unit/test_bids_alerts.py`, add to `tests_unit/test_bids_router.py` (or the reports test file) for history access.

**Interfaces — Produces:** `async def bid_alerts(bidders: list[Bidder], today: date, now: datetime) -> dict` → `{asOf, flags: [{bidderId, name, kind, detail}], archive: [{bidderId, name, reason, since}]}`; route `GET /bids/alerts?ownerId=` (admin without owner → `{asOf, flags: None, archive: None}`).

- [ ] Step 1: failing tests (today Wed 2026-11-18 via `_now`):
  - `test_inactive_after_three_quiet_weekdays` — bids Nov 12 only (Thu); Fri 13, Mon 16, Tue 17 quiet → `inactive`, `detail.lastBidDay == "2026-11-12"`; a bidder with a bid on Nov 17 → not.
  - `test_rejects_needs_20_reviewed_and_20_percent` — 16 approved 4 rejected (2 "blurry", 1 "dup", 1 none) → `rejects`, `detail == {rejected: 4, reviewed: 20, topReason: "blurry"}`; 17/3 → not.
  - `test_no_interviews_needs_100_bids` — 100 bids, 0 interviews → `no_interviews` with profile name; 99 → not; bidder without profile → never.
  - `test_review_backlog_any_age` — pending bids from Oct 1 and Nov 16 → `review_backlog`, `detail == {pending: 2, oldestDay: "2026-10-01"}`; pending only from Nov 17 → not.
  - `test_first_kind_wins` — inactive and backlog → only `inactive`.
  - `test_archive_idle_and_expired_invite` — registered, created Oct 1, no bids 14 days → archive `idle`, not flagged; unregistered with expired invite → `invite_expired`; unregistered never invited → neither list; created Nov 10 with no bids → neither.
  - `test_admin_reads_any_history_staff_only_their_own` — admin 200 on Maria's bidder reports; Pedro 404.
- [ ] Step 2: run → FAIL.
- [ ] Step 3: implement (14-day `day_counts`, `interview_credit`, rejected bids' `rejectReason` Counter, pending bids with `bid_report_day(firstAt) <= today − 2`).
- [ ] Step 4: run the files + `test_bids_*` → PASS; full suite → only the known failures.
- [ ] Step 5: commit `feat(bids): alerts for bidders that need action and archive suggestions; admins read any bidder history`.

### Task 4: Website — types and helpers

**Files:** Modify `src/api/endpoints.ts`, `src/lib/profileList.ts` (export `signed`, `bars`); create `src/lib/bidderInsights.ts`, `tests/bidderInsights.test.mjs`; add `"test"` glob covers it (`node --test "tests/*.test.mjs"`).

**Interfaces — Produces:** types `BidderStats`, `BidderTop`, `BidInsights`, `BidAlert`, `BidAlerts`; row fields from Task 1; `getBidInsights(params)`, `getBidAlerts({ ownerId? })`.
`bidderCells(mine: BidderStats, all: BidderStats): BandCell[]` (keys `avg`, `hit`, `approval`, `per100`, `cost`; labels "Bids per weekday", "Days at 50+", "Approval rate", "Interviews per 100 bids", "Cost per interview"); `bidderTopLines(tops): { key, label, mine: {id, name, text} | null, top: PlatformTop | null }[]`; `flagText(f: BidAlert): string`; `archiveText(a): string`; `rowPer100Verdict(row, platform): 'up' | 'down' | null`.

- [ ] Step 1: failing tests:
  - cells — mine `{avgPerWeekday: 42.3, hitRate: 0.64, weekdays: 22, approvalRate: 0.92, reviewed: 130, approved: 120, per100: 0.85, bids: 2202, interviews: 19, costPerInterview: 41, pay: 820}` vs platform `{… hitRate: 0.45, approvalRate: 0.80, per100: 0.6, costPerInterview: 60}` → tones `[null, 'good', 'good', 'good', 'good']`, gaps `[null, '+19 pts', '+12 pts', '+42%', '−32%']`, texts `['42.3', '64%', '92%', '0.85', '$41']`, notes `[null, '14 of 22 weekdays at 50+', '120 of 130 reviewed', '19 interviews from 2,202 bids', '$820 paid']`; thin cases (weekdays 9, reviewed 29, bids 99, interviews 2) → `'thin'`.
  - tops — `bidderTopLines` with mine best per100 0.85 vs platform 1.2 (Bo, Maria) → chip `far`, text `−0.35 per 100`, leader `Bo (Maria) 1.20`; cost mine $41 vs platform $45 → `lead`; bids mine 2,000 vs 2,400 → `near`, `400 behind`.
  - flags — each kind's sentence: `No bids since Nov 12: check in with Ana.`; `4 of 20 rejected, mostly "blurry": coach on it.`; without reason `4 of 20 rejected: coach on it.`; `120 bids, no interviews: check the profile Erric and its target roles.`; `5 bids waiting for review since Oct 1.`
  - archive — `No bids in 2 weeks (last Oct 30)`, `No bids in 2 weeks`, `Invite expired Nov 3, never used`.
  - `rowPer100Verdict` — 100+ bids and ×1.25 → `up`; 99 bids → `null`.
- [ ] Step 2: `npm test` → FAIL (missing module).
- [ ] Step 3: implement.
- [ ] Step 4: `npm test`, `npx tsc --noEmit -p .` → pass.
- [ ] Step 5: commit `feat(bidders): helpers for the insights card, tops, flags and archive suggestions`.

### Task 5: Website — card, tops, banners, table columns

**Files:** Create `src/components/insights/compareParts.tsx` (TONE, CHIP, CellBars, Standing moved from ProfilesBand), `src/components/bidders/BiddersBand.tsx`, `src/components/bidders/BidderAlerts.tsx`; modify `src/components/profiles/ProfilesBand.tsx` (import the parts), `src/components/bidders/PerformanceTab.tsx`, `src/pages/Bidders.tsx`.

- [ ] Step 1: move the parts; ProfilesBand renders as before (`npm test`, tsc).
- [ ] Step 2: `BiddersBand` at the top of the Performance tab (own SWR `['bid-insights', period params, ownerId]`, only when `!isAdmin || ownerId`; hidden on error); five cells + "Top bidders" table (Most bids, Best conversion, Lowest cost per interview).
- [ ] Step 3: `BidderAlerts` above the tabs in `Bidders.tsx` (SWR `['bid-alerts', ownerId]`; red flags with the bidder name opening `?bidder=<id>`, backlog line opening that bidder's oldest pending day; grey archive list with Archive → `ConfirmDialog` "Archive <name>? They're signed out of the extension; you can restore them any time." → `archiveBidder(id)` → revalidate week, performance, alerts). First 8 red lines + "Show all N".
- [ ] Step 4: Performance table — columns "Approval" (`92%` / "120 of 130 reviewed") and "Cost / interview" (`$41` / "$820 paid"), sortable (`approvalRate`, `costPerInterview`; cost sorts ascending first); per-100 cell: arrow vs `insights.platform.per100` via `rowPer100Verdict` and "3 of 182 bids" under it; Total row shows the totals' approval and cost.
- [ ] Step 5: `npm test`, `npx tsc --noEmit -p .`, `npm run build` → pass.
- [ ] Step 6: commit `feat(bidders): insights card, best on the platform, flags and archive suggestions, approval and cost columns`.
