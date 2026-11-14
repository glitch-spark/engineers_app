# Single Bidders Page Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** One Bidders page (no tabs) on pay weeks: banners, period control, slim strip, collapsible card, one table fed by one `/bids/performance` request.

**Architecture:** Server: a shared period helper in `app/routers/bids.py` turns (period, date, to, now) into report-day ranges with the pay week for `week` and the open report day as today; `performance()` takes its time columns from the caller (days for a pay week, pay weeks for a month / range); in week mode the route merges `/bids/week`'s per-bidder `days` / `week` blocks and totals into the response. Website: one `BiddersTable`, a `BiddersStrip`, the card with a collapse toggle; tabs, top-3 cards and the help panel removed.

**Tech Stack:** FastAPI, Beanie, pytest + mongomock-motor; React 18, TypeScript, SWR, Tailwind; `node --test`.

**Spec:** `docs/superpowers/specs/2026-11-14-bidders-single-page-design.md`.

## Global Constraints

- Week = pay week (Sat 16:00 → Sat 16:00, `BID_WEEKLY_REPORT_*`); days = report days (cutoff 18:30); today = the open report day (`bid_report_day(now)`); the default week holds *now*.
- Week mode: strip, rows' Approved / Pay / To review / Bids and the Total row from `week_board`'s `week` blocks (folder fallback included); performance measures on report days.
- Month / custom: report days of the range; columns = pay weeks touching it, clipped (`partial`).
- No change to counting; `/bids/week` unchanged; the single-bidder view unchanged.

## Review Focus

- Saturday 16:00–18:30 (new pay week, no report day started) → week view renders its days, no crash, empty stats (Task 1 test).
- After 18:30 → evening bids count in today's day cell and the totals (Task 1 test).
- A week before `BID_RECORDS_START` (folder counts) → week-mode Pay / Approved from folders (Task 2 test).
- Admin viewing another owner → no ⋯ actions on their bidders (Task 4).
- Month columns: first / last pay week clipped and marked partial (Task 1 test).

---

### Task 1: Server — pay-week periods and columns

**Files:** `app/routers/bids.py` (helper `bid_period(period, date, to, now, sched) -> BidPeriod(start, end, label, today, pay_week|None)` used by performance, insights, alerts), `app/bids/performance.py` (`pay_week_columns(start, end, sched)`, `day_columns(days)`, `performance(..., columns=None)` defaulting to today's behaviour for direct callers), tests `tests_unit/test_bids_period.py`, existing performance / insights / alerts tests updated where week boundaries move.

- [ ] Failing tests: `period=week` on Wed Nov 18 09:00 CT → start Sun Nov 15, end Sat Nov 21 (report days of the pay week ending Sat Nov 21 16:00), `weeks` = 7 day columns, `payWeek.label == "Week ending Sat Nov 21"`; at Sat Nov 21 17:00 CT the default week is the next one (days Nov 22–28, no stats, no crash); at Wed 19:00 CT today is Thu (a 19:00 bid shows in Thu's column and the totals); `period=month` Nov → columns are pay weeks clipped to Nov 1 and Nov 30 with `partial`; previous range for a week = the previous pay week.
- [ ] Implement; run `test_bids_*` → PASS.
- [ ] Commit `feat(bids): pay weeks for the performance periods; today is the open report day`.

### Task 2: Server — week-mode board merge, statuses, tops

**Files:** `app/routers/bids.py` (week mode: `week_board` for the pay week, merged by bidder id into rows: `days`, `week`, `status`, `country`; totals `payWeek`, `days`, `toReview`, `today`), `app/bids/performance.py` (rows: `status`, `country`, `toReview`), `app/bids/insights.py` (`bidder_tops` + `streak` (longestStreak) and `interviews`), tests in `tests_unit/test_bids_single_page.py`.

- [ ] Failing tests: week-mode row `days` / `week` equal `/bids/week`'s for the same pay week (incl. a folder-counted day before records start); totals `toReview` / `pay` equal `/bids/week` totals; `today` present only for the current pay week; month rows have `status`, `toReview` and no `days`; tops include streak and interviews with names only for the platform.
- [ ] Implement; run `test_bids_*` and the full suite → only the known failures.
- [ ] Commit `feat(bids): the performance response carries the pay week board in week mode`.

### Task 3: Website — types and helpers

**Files:** `src/api/endpoints.ts` (new response fields), `src/lib/bidderPage.ts` + `tests/bidderPage.test.mjs`: `stripItems(totals, payWeek, isCurrent)` → `[{key, text, tone, action?}]`; `timeColumns(resp)` → `[{key, label, title, day?}]` (week: `Sat 15`… / month: `Nov 8–14`); `rowCells(row, mode)` → `{bids, pay, toReview}` (week from `row.week`, else report-day sums); `cardOpen(stored)`; `bidderTopLines` gains streak and interviews (`bidderInsights.ts`).
- [ ] Failing tests for each helper; implement; `npm test`, tsc → pass. Commit.

### Task 4: Website — the single page

**Files:** `src/pages/Bidders.tsx` (no Tabs; controls row; strip; card; table), `src/components/bidders/BiddersStrip.tsx`, `src/components/bidders/BiddersTable.tsx` (merges TeamWeekTable + Performance table; ⋯ via `BidderActions` only when `canManageBidders`), `BiddersBand.tsx` (collapse toggle), remove `PerformanceTab` usage of top-3 cards and help panel (file deleted or reduced), keep `SummaryTiles` for the single-bidder view.
- [ ] Implement; `npm test`, tsc, build → pass. Commit `feat(bidders): one page — pay weeks, slim strip, one table, collapsible card`.
