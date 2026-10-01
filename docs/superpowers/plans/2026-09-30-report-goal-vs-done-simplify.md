# Report Goal vs Done — Simplify (revision 2) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:executing-plans (user chose inline execution). Steps use checkbox (`- [ ]`) syntax.

**Goal:** Cut plans down to bids (self, bidder), interviews (self, caller, automatic) and notes, with typed week/day goals, ticked goal lines and an evening-only Slack post.

**Architecture:** Shrink the existing Goal vs Done code in place — same collections, routes, week board and panels; delete regions, overrides and tomorrow's goal.

**Tech Stack:** FastAPI + Beanie, pytest; React + Vite + TS, SWR.

**Spec:** `engineers_app/docs/superpowers/specs/2026-09-30-report-goal-vs-done-design.md` (revision 2).

## Global Constraints

- `Counts = {bidsSelf, bidsBidder, interviewsSelf, interviewsCaller}` ints ≥ 0; no region maps, no overrides.
- Day goal uses bids only; day Done stores bids only; interview Done always from interview records.
- Checklist ≤ 20 items, 1–200 chars; day notes ≤ 2000; week recap notes ≤ 4000.
- `done` in a day PUT = follow-up: sets `loggedAt` once and syncs Slack; goal-only saves never post.
- Permissions, date parsing, week rules unchanged from revision 1.
- Integration test command and pre-existing failures as in the revision 1 plan (19 known failures on `dev`: cardlinks, interviews, transactions).

## Review Focus

1. Unmigrated legacy daily/weekly documents still read correctly (fold) on every endpoint, dashboard and team view.
2. A goal-only save of today never sets `loggedAt` or posts to Slack; a follow-up save does, exactly once per day message (edits after).
3. Interview Done ignores anything typed: only interview records count (self vs caller per round, canceled excluded).
4. Week bids Done sums only logged days; goal lines ticks count correctly in day rows, week summary and team table.
5. Permissions matrix unchanged (admin write 403, staff read other 403, admin read 200, unknown 404).

---

### Task 1: Backend — models, automatic values, routers, Slack, migration, consumers

**Files:** `app/models/plan_common.py`, `app/models/daily_plan.py`, `app/models/weekly_plan.py`, `app/plan_auto.py`, `app/routers/daily_plans.py`, `app/routers/weekly_plans.py`, `app/routers/reports.py`, `app/routers/dashboard.py`, `app/slack_bot.py`, `scripts/migrate_plans_goal_done.py`; tests in `tests/` and `tests_unit/` for each.

**Interfaces — Produces:**
- `plan_common`: `Counts`, `BidsIn {bidsSelf, bidsBidder}`, `ChecklistItem`, `ChecklistItems`, `next_working_day`, `monday_of` (drop `REGIONS`, `PROFILE_REGIONS`, `clean_region_dict`, `DoneOverrides`, `WeeklyOverrides`, `DoneIn`).
- `plan_auto`: `empty_day()`, `interview_counts(user_ids, start, end)`, `effective_daily_done(plan, auto_day) -> Counts`, `weekly_done(days: list[(date, Counts, logged)], week_interviews) -> Counts`, `weekly_plans_for`, `week_snapshot(user_ids, monday) -> {plan, days, dayDone, dayAuto, done, lastLogged}`, `interviews_by_day(user_ids, start, end) -> {uid: {date: self+caller}}` (drop `profiles_by_region`, `effective_interviews_by_day`).
- API shapes exactly as the spec's API section.
- `daily_plan_text(plan, owner, done)` per the spec's Slack block; `sync_daily_plan_message(plan, owner, done)`.

- [ ] Rewrite tests first for: models/fold (`tests/test_plan_models.py`), plan_auto unit + integration, daily/weekly/reports routers, Slack text, migration, dashboard (interviews from records only, legacy daily still counted), leaderboard + alerts (unchanged expectations). Run → RED.
- [ ] Implement; run all backend suites → only the known pre-existing failures remain.
- [ ] Commit `refactor(plans): simplify goal/done to bids, interviews and notes`.

### Task 2: Frontend — types, editors, panels, board, team

**Files:** `src/api/endpoints.ts`, `src/lib/reportWeek.ts`, `src/components/report/*` (replace `CountsEditor` with `GoalDoneFields`), `src/pages/Report.tsx`.

- [ ] Update types/wrappers to the spec API; drop region helpers (`regionTotal`, `worstRegion`, region constants) and update the reportWeek check script first (RED → GREEN).
- [ ] `GoalDoneFields({ goal, onGoal, done, onDone, interviews, showDone, showInterviewGoal, readOnly })`: Bids self/bidder rows (Goal input | Done input), Interviews self/caller rows (Goal input on week only | Done read-only with stage chips).
- [ ] DayPanel (goal mode / follow-up mode per spec), WeekPanel, WeekSummaryCard, DayRow, TeamTable per spec.
- [ ] Verify: tsc shows only the pre-existing `InterviewPrepLibrary.tsx` errors; `vite build --mode development` passes; dev server serves modules.
- [ ] Commit `refactor(report): simplify plans to bids, interviews and notes`.

### Final: one fresh whole-branch review (most capable model), one fix pass, then finishing-a-development-branch.
