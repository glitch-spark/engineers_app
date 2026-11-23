# Person's Week Plan Page Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rework the Plans page "Week plan" card into a today-first view with pace, compact goals and a foldable routine × day grid.

**Architecture:** The backend adds `routineDays` (existing `routines_grid`) to `GET /weekly-plans/{week}`; the app rewrites `WeekGoalCard` to render from `WeekPlan` alone and gets an `onOpenDay` callback from `Report.tsx`.

**Tech Stack:** FastAPI/Beanie (pytest), React 18 + Tailwind (vitest + Testing Library).

**Spec:** `docs/superpowers/specs/2026-11-23-person-week-page-design.md`

## Global Constraints

- Backend ships before the app; the app must render without `routineDays` (older server).
- Pace = `target × elapsed / week.days.length`, elapsed = days with `date <= today`.
- Checklist is read-only; rows open today's Day panel.

## Review Focus

- Week with no `routineDays` (old server) → checklist names only, no "Show week by day".
- Past / future week → no Today bar; grid shown unfolded.
- All targets 0 but items set → no Targets block, no empty meters.
- Region split absent (pre-split bids) → single "Bids · self" row, no region line.
- Admin viewing someone → Today button reads "Open today", no "+ Add my own item".

---

### Task 1: Backend `routineDays` (engineers_backend)

**Files:** Modify `app/routers/weekly_plans.py` (`_week_out`, `get_week`, `put_week`); Test `tests_unit/test_daily_plan_api.py` (week GET tests live there) or `tests_unit/test_weekly_plan_team.py`.

- [ ] Test `test_week_get_returns_routine_days`: plan with routine `r` (check), daily plan Mon with `r` done, GET `/weekly-plans/{MON}?today={WED}` → `routineDays[0]["id"] == r.id`, Mon state `done`, Tue `missed`, Wed `today`, Thu `future`.
- [ ] `_week_out(..., today: date)` adds `"routineDays": routines_grid(plan, by_date, days, today) if plan else []`. `get_week` takes `today: Optional[date] = Query(None)` (default `date.today()`); `put_week` passes `date.today()`.
- [ ] Run plan tests; commit.

### Task 2: App types + API

**Files:** `src/api/endpoints.ts`.

- [ ] `WeekPlan.routineDays?: DashboardRoutineRow[]`; `getWeekPlan(weekStart, userId?, today?)` sends `today`.

### Task 3: `WeekGoalCard` rewrite + Report wiring

**Files:** `src/components/report/WeekGoalCard.tsx`, `WeekGoalCard.test.tsx`, `src/components/home/WeekTable.tsx` (export `dayCell`), `src/pages/Report.tsx`.

- [ ] Props add `today: string`, `onOpenDay: (date: string) => void`, `onAddOwn?: () => void`.
- [ ] Tests: Today bar "2 of 5 done" + "Fill today's standup" calls `onOpenDay(today)`; checklist row shows "30 / 50" for a short cell and MINE for `addedBy: 'self'`; "Show week by day" toggles the grid; targets hide 0-goal metrics and show "N behind" with pace; old server (no `routineDays`) has no toggle; past week has no Today bar; existing tests adapted.
- [ ] Implement; `npx vitest run src/components/report src/pages`; `npm run lint`; commit.
