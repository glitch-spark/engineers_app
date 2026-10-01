# Report Goal vs Done Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn daily and weekly plans into structured Goal vs Done records (bids self/bidder, interviews self/caller with stages, profiles and LinkedIn per region, checklist, notes) and replace the Report page with a week board plus an admin team view.

**Architecture:** Backend keeps the `dailyplans` / `weeklyplans` collections with new embedded `Counts` blocks and before-validators that fold legacy documents; automatic values (interviews from interview records, profiles from Accounts, weekly Done sums) live in one module `app/plan_auto.py` reused by the plan routers, team report, dashboard and leaderboard. Frontend replaces the two-tab Report with a week board and slide-in Day/Week panels.

**Tech Stack:** FastAPI + Beanie/Motor, pytest; React 18 + Vite + TS, SWR 2, Tailwind.

**Spec:** `engineers_app/docs/superpowers/specs/2026-09-30-report-goal-vs-done-design.md` — read it alongside this plan.

## Global Constraints

- Branch `feat/cleanup` in both repos. Backend tasks 1–7 in `engineers_backend`; frontend tasks 8–13 in `engineers_app`.
- Regions: `REGIONS = ("US", "EU", "Latam", "Canada", "Asia")`; profiles also allow `"Unassigned"`. Region dicts omit zero values on output.
- Counts are ints ≥ 0. Checklist: ≤ 20 items, text 1–200 chars after trim. `notes` ≤ 2000 chars; `planNotes`/`recapNotes` ≤ 4000.
- Dates: strict `YYYY-MM-DD`, year 2000–2100, else 422. `DailyPlan.date` and `WeeklyPlan.weekStart` are naive midnight datetimes. `weekStart` must be a Monday (else 422).
- Week = Mon–Sat working days; Sunday entries belong to the preceding week; "tomorrow" = next working day (Saturday → Monday).
- Interview round local date = round datetime (naive UTC) converted to `APP_TIMEZONE` (`app.dashboard_stats.app_tz()`). A round is **caller** iff `iv.caller.enabled` and `iv.caller.startsAt`'s local date equals the round's local date; else **self**. Exclusions/grouping exactly as `app.interview_rounds` (AI interview, home assessment, rejected excluded; canceled = status scheduled + stage rejected, not counted).
- Permissions: writes are owner-only and admins always get 403 on writes; reads allowed for the owner or an admin; staff reading another user → 403; unknown `userId` → 404; malformed id → 400.
- Automatic values are computed on read; GET handlers never write to the DB.
- JSON field names camelCase. Frontend uses existing classes (`panel`, `card-title`, `btn`, `btn-outline`, `input`, `select`, `segmented*`, `skeleton`, `text-muted`) and `useDialog`.

## Environment notes

- Backend unit tests: `.venv/Scripts/python.exe -m pytest tests_unit/<file> -q` (three unrelated tests_unit files fail to import — run specific files).
- Integration tests need a throwaway Mongo. Start the portable one from the session scratchpad if not running (controller handles this): `mongod --dbpath <scratch>/mongo-data --bind_ip 127.0.0.1 --port 27099`. Command:
  `MONGODB_URI_TEST="mongodb://127.0.0.1:27099/engineers_test" .venv/Scripts/python.exe -m pytest <files> -q -o asyncio_default_fixture_loop_scope=session -o asyncio_default_test_loop_scope=session -p no:cacheprovider`
  Pre-existing failures to ignore: 5 in `test_transactions.py`, 6 in `test_interviews.py`. Never use the `.env` database.
- **Transitional red tests (expected):** Task 1 changes the models, so until the task that rewrites each consumer, these existing suites may fail: `tests/test_daily_plans.py` (until Task 3), `tests/test_weekly_plans.py` (until Task 4), `tests/test_dashboard.py` and leaderboard paths (until Task 6). Every task must keep `.venv/Scripts/python.exe -c "import app.main"` working and its own new tests green. After Task 6, all of `tests/test_daily_plans.py tests/test_weekly_plans.py tests/test_dashboard.py tests/test_reports.py tests/test_plan_auto.py` must pass.
- Frontend: `npx tsc -b --noEmit` has 3 pre-existing errors (InterviewPrepLibrary.tsx, Interviews.tsx, InterviewsLive.tsx). Verify with a filtered grep for the files you touched → empty, plus `npx vite build --mode development` succeeds. `git add` only `src/` — never the untracked `docs/`.

## Review Focus

1. **Unmigrated legacy documents** (old daily shape with `bidsHandsOn…`, old weekly with `metrics/content/result`, no `weekStart`) load through the models and appear on the new endpoints with sensible values — the app is deployed before the migration runs.
2. **Timezone edge:** an interview round at Saturday 23:30 New York (Sunday 03:30 UTC) counts on Saturday; a Sunday round counts in the week that just ended.
3. **Tomorrow's goal from a Saturday** lands on Monday, and never overwrites tomorrow's Done, notes or `loggedAt`.
4. **Override round-trip:** setting an override then sending `null` returns the automatic value again.
5. **Permissions matrix:** admin write → 403; staff read of another user → 403; admin read of another user → 200; unknown user → 404.

---

### Task 1: Shared plan types + model rewrite with legacy fold (backend)

**Files:**
- Create: `app/models/plan_common.py`
- Modify: `app/models/daily_plan.py`, `app/models/weekly_plan.py`
- Test: `tests_unit/test_plan_models.py`

**Interfaces — Produces:**
- `plan_common.py`: `REGIONS`, `PROFILE_REGIONS = REGIONS + ("Unassigned",)`, `Counts`, `DoneOverrides`, `WeeklyOverrides`, `ChecklistItem`, `DoneIn` (`bidsSelf`, `bidsBidder`, `linkedin`), `clean_region_dict(d: dict, allowed: tuple) -> dict` (raises `ValueError` on unknown region or negative; drops zeros), `next_working_day(d: date) -> date`, `monday_of(d: date) -> date` (Sunday → preceding Monday).
- `DailyPlan` fields per spec (`goal`, `goalItems`, `done: Counts`, `doneOverrides`, `notes`, `loggedAt`, existing `userId/date/year/weekNumber/slackChannel/slackTs`). Before-validator `fold_legacy_daily(data)`: when legacy keys present and `done` absent → `done.bidsSelf=bidsHandsOn`, `done.bidsBidder=bidsByBidder`, `doneOverrides.interviewsSelf=interviewsDone` (only if > 0), `goalItems=[{text, done: True} for todayItems]`, `notes` = `today` + `tomorrow` text joined by `"\n\n"` (custom plans) , `loggedAt=createdAt` when any done count/items/text exist; legacy keys removed from `data`.
- `WeeklyPlan` fields per spec (`weekStart`, `goal`, `goalItems`, `planNotes`, `recapNotes`, `doneOverrides: WeeklyOverrides`, plus `year/weekNumber/startDate/endDate`). Before-validator `fold_legacy_weekly(data)`: `weekStart` (if absent) = `monday_of((startDate + 12h).date())`; `metrics` bids target → `goal.bidsSelf`, interviews target → `goal.interviewsSelf`; `content → planNotes`, `result → recapNotes`; drop `metrics/nextInterviewTarget/status/content/result`.
- Indexes: daily unchanged; weekly add **non-unique** `(userId, weekStart)` (uniqueness enforced by upsert; existing duplicates must not crash startup).
- Delete `CORE_METRICS`, `WeeklyMetric`, `MetricUnit` only if Task 4 removes all users — leave them in place in this task.

- [ ] **Step 1: Failing tests** — `test_fold_legacy_daily_regular`, `test_fold_legacy_daily_custom_text_to_notes`, `test_fold_legacy_weekly_metrics_and_text`, `test_new_shape_untouched`, `test_clean_region_dict_rejects_unknown_and_negative_drops_zero`, `test_next_working_day_saturday_to_monday`, `test_monday_of_sunday_is_preceding_monday`. Build models via `DailyPlan.model_validate({...})` with legacy dicts (Beanie documents validate without DB). Key assertions: legacy `{bidsHandsOn: 4, bidsByBidder: 2, interviewsDone: 1, todayItems: ["a"]}` → `done.bidsSelf == 4`, `done.bidsBidder == 2`, `doneOverrides.interviewsSelf == 1`, `goalItems[0].done is True`; legacy weekly `startDate=2026-09-28T04:00`, metrics bids target 40 → `weekStart == datetime(2026,9,28)`, `goal.bidsSelf == 40`.
- [ ] **Step 2: Run** → FAIL (import errors).
- [ ] **Step 3: Implement.** Keep every model loadable from both shapes.
- [ ] **Step 4: Run** → PASS; `.venv/Scripts/python.exe -c "import app.main"` OK.
- [ ] **Step 5: Commit** `feat(plans): goal/done plan models with legacy fold`.

---

### Task 2: Automatic values module (backend)

**Files:**
- Create: `app/plan_auto.py`
- Modify: `app/interview_rounds.py` (add `split_rounds_by_day`)
- Test: `tests_unit/test_plan_auto.py`, `tests/test_plan_auto.py`

**Interfaces — Consumes:** Task 1 types; `app.interview_rounds` helpers; `app.dashboard_stats.app_tz`, `local_day_start_utc`.
**Produces:**
- `interview_rounds.split_rounds_by_day(iv, start_utc, end_utc, tz) -> list[tuple[date, str, bool]]` — `(local_date, group, is_caller)` per countable round in window (same exclusion/grouping as `count_interview_rounds`).
- `async plan_auto.interview_counts(user_ids, start: date, end: date) -> dict[uid, dict[date, DayInterviews]]` where `DayInterviews = {"self": int, "caller": int, "stages": {"self": {group: n}, "caller": {group: n}}}` (window = local `start` 00:00 → local `end + 1` 00:00).
- `async plan_auto.profiles_by_region(user_ids) -> dict[uid, dict[str, int]]` (Accounts `createdBy`; `None`/unknown region → `"Unassigned"`).
- `plan_auto.effective_daily_done(plan: DailyPlan | None, auto_day: DayInterviews, auto_profiles: dict) -> Counts` — bids/linkedin from `plan.done`; interviews = override if not None else auto; profiles = override, else stored `done.profiles` if `plan.loggedAt`, else `auto_profiles`.
- `plan_auto.weekly_done(days: list[tuple[date, Counts, bool]], week_interviews: dict, overrides: WeeklyOverrides) -> Counts` — bids summed over all given days; interviews from `week_interviews` (`{"self","caller"}`); profiles/linkedin from the latest logged day (empty dict if none); each field replaced by a non-None override.
- `async plan_auto.week_snapshot(user_ids, monday: date) -> dict[uid, WeekSnapshot]` with `WeekSnapshot = {"plan": WeeklyPlan|None, "days": list[DailyPlan], "dayDone": dict[date, Counts], "dayAuto": dict[date, DayInterviews], "auto": Counts, "done": Counts, "lastLogged": date|None}` — one query each for weekly plans (matching `weekStart` or legacy `startDate` within ±12h of Monday when `weekStart` missing), daily plans (Mon–Sun), interviews, profiles. `auto` = weekly_done with empty overrides.

- [ ] **Step 1: Failing unit tests** (pure functions): `test_effective_daily_done_override_beats_auto`, `test_effective_daily_done_profiles_snapshot_when_logged`, `test_weekly_done_sums_flows_and_takes_latest_stock`, `test_weekly_done_override_replaces_field`, `test_split_rounds_caller_same_local_day_only` (caller.startsAt on another day → self), `test_split_rounds_ny_saturday_late_round_is_saturday` (tz NY, round 2026-10-04 03:30 UTC → date 2026-10-03).
- [ ] **Step 2: Failing integration tests** (`tests/test_plan_auto.py`): `test_interview_counts_by_day_self_and_caller`, `test_profiles_by_region_unassigned`, `test_week_snapshot_reads_legacy_weekly_without_weekStart`.
- [ ] **Step 3: Run** → FAIL. **Step 4: Implement.** **Step 5: Run** → PASS.
- [ ] **Step 6: Commit** `feat(plans): automatic interview/profile values and weekly aggregation`.

---

### Task 3: Daily plans API rewrite (backend)

**Files:**
- Modify: `app/routers/daily_plans.py` (rewrite), `app/slack_bot.py` (daily-plan formatter + sync — spec in Task 6's "Slack" bullet, implemented here because this router is its only caller), `tests_unit/test_slack_daily_plan.py` (rewrite with the exact-string cases listed in Task 6)
- Create: `app/routers/_plan_access.py`
- Delete: `app/daily_plan_stats.py`, `tests_unit/test_daily_plan_stats.py` (after grep shows no other importer)
- Test: `tests/test_daily_plans.py` (rewrite)

**Interfaces — Produces:**
- `_plan_access.py`: `async read_subject(user, user_id: str|None) -> PydanticObjectId`, `require_writer(user) -> None` (admin → 403 `"Admins can view plans but cannot change them"`), `parse_ymd(value, name) -> date` (strict, Global Constraints).
- `GET /daily-plans?weekStart=&userId=` → `{"weekStart", "days": [DayOut…]}` for every existing entry Mon–Sun plus empty templates for Mon–Sat without entries.
- `GET /daily-plans/{date}?userId=` → `DayOut`.
- `PUT /daily-plans/{date}` body `DayIn {goal: Counts, goalItems, done: DoneIn | None, doneOverrides: DoneOverrides, notes, tomorrow: {goal: Counts, goalItems} | None}` → `{"day": DayOut, "tomorrow": DayOut | None}`.
  - Upsert by `(user.id, date)`; `year/weekNumber` via `app_week_key`.
  - When `done` is given: store bids/linkedin, set `loggedAt` if unset, snapshot `done.profiles` from `profiles_by_region` (unless override given).
  - `tomorrow` upserts `next_working_day(date)` goal + goalItems only.
  - Slack sync after save (existing snapshot/edit-in-place behaviour).
- `DELETE /daily-plans/{date}` → owner only; deletes the Slack message as today.
- `DayOut = {"date", "exists", "userId", "goal", "goalItems", "done" (effective), "auto": {"interviewsSelf", "interviewsCaller", "stages", "profiles"}, "doneOverrides", "notes", "loggedAt"}`.
- Remove old id-based POST/PUT/DELETE, `/stats`, `planType` handling.
- Slack: `daily_plan_text(plan, owner, tomorrow: DailyPlan | None = None, done: Counts | None = None) -> str` — lines exactly:
  - header line as today
  - `Bids: self {done}/{goal} · bidder {done}/{goal}`
  - `Interviews: self {done}/{goal} · caller {done}/{goal}`
  - `Profiles {doneTotal}/{goalTotal} · LinkedIn {doneTotal}/{goalTotal}` (omit if all four totals are 0)
  - checklist lines `✓ text` / `○ text`; then notes (if any)
  - `Tomorrow: Bids {self+bidder goal} · Interviews {self+caller goal}` + tomorrow's items as `○ text` (omit when no tomorrow goal)
  - link to `/report?week=<monday>` as today's link style
  The router passes the effective `done` and tomorrow's plan; snapshot for edit-in-place includes goal, done, items, notes, tomorrow goal.


- [ ] **Step 1: Failing tests** (integration): `test_put_day_creates_and_logs`, `test_put_day_with_tomorrow_sets_next_working_day_goal_only` (Saturday → Monday; Monday's existing Done/notes/loggedAt untouched), `test_goal_only_put_does_not_log`, `test_override_then_null_restores_auto`, `test_week_list_has_templates_for_missing_days`, `test_auto_interviews_on_day` (seed Interview with caller), `test_profiles_snapshot_on_log`, `test_validation_422` (unknown region, negative count, 21 items, bad date, non-Monday weekStart on list), `test_permissions_matrix` (admin PUT 403; staff GET other 403; admin GET other 200; unknown 404; bad id 400), `test_legacy_doc_readable` (insert raw legacy dict via `DailyPlan.get_motor_collection().insert_one`). Unit (`tests_unit/test_slack_daily_plan.py`): exact-string Slack text for full, minimal (no profiles/LinkedIn), and no-tomorrow cases.
- [ ] **Step 2: Run** → FAIL. **Step 3: Implement.** **Step 4: Run** → PASS.
- [ ] **Step 5: Commit** `feat(plans): daily plan goal/done API`.

---

### Task 4: Weekly plans API rewrite (backend)

**Files:**
- Modify: `app/routers/weekly_plans.py` (rewrite), `app/models/weekly_plan.py` (delete `CORE_METRICS`/`WeeklyMetric` once unused)
- Delete: `app/weekly_report.py` (after Task 6 removes the metrics.py import — this task may leave it if still imported; note in report)
- Test: `tests/test_weekly_plans.py` (rewrite)

**Interfaces — Consumes:** Task 2 `week_snapshot`, Task 3 `_plan_access`.
**Produces:**
- `GET /weekly-plans/{weekStart}?userId=` → `WeekOut = {"weekStart", "exists", "userId", "goal", "goalItems", "planNotes", "recapNotes", "done", "auto", "doneOverrides", "stages": {"self": {...}, "caller": {...}}, "days": [{"date", "logged", "goal", "done"}]}` (Mon–Sat, plus Sunday only if it has an entry).
- `PUT /weekly-plans/{weekStart}` body `{goal, goalItems, planNotes, recapNotes, doneOverrides}` → `WeekOut`; upsert by `(user.id, weekStart)`, also writing `startDate`/`endDate` (Mon 00:00 / Sun 23:59:59.999) and `year/weekNumber`.
- `DELETE /weekly-plans/{weekStart}` → owner only.
- `GET /weekly-plans/{weekStart}/previous-goals` → previous week's `goal` + unticked `goalItems` (for "Use last week's goals"); empty when none.
- Remove `progress-report`, `summary`, `user-rollup`, `metric-catalog`, id-based routes, `_apply_badge_interview_counts`, `_set_interviews_metric`. `metrics.py` still imports the latter two until Task 6 — keep thin private shims only if needed to keep `import app.main` working, and delete them in Task 6.

- [ ] **Step 1: Failing tests:** `test_put_and_get_week`, `test_week_done_auto_from_days_and_interviews`, `test_week_override_and_reset`, `test_week_stock_metrics_latest_logged_day`, `test_previous_goals_carries_unticked_items`, `test_week_permissions_matrix`, `test_non_monday_week_start_422`, `test_legacy_weekly_doc_readable_by_weekStart` (raw legacy doc with `startDate` 04:00Z and no `weekStart`).
- [ ] **Step 2–4:** RED → implement → GREEN.
- [ ] **Step 5: Commit** `feat(plans): weekly plan goal/done API`.

---

### Task 5: Team report endpoint (backend)

**Files:**
- Create: `app/routers/reports.py`; Modify: `app/main.py` (include router)
- Test: `tests/test_reports.py`

**Interfaces — Consumes:** `week_snapshot`, `parse_ymd`, `require_admin` (`app.deps`).
**Produces:** `GET /reports/team?weekStart=` (admin only, 403 otherwise) → `{"weekStart", "users": [{"userId", "name", "email", "goal", "done", "lastLoggedDate", "hasWeeklyPlan"}]}` for all non-admin users sorted by name; users with no plans included with zero/None values.

- [ ] Tests: `test_team_requires_admin`, `test_team_rows_include_users_without_plans`, `test_team_done_matches_week_endpoint` (same numbers as `GET /weekly-plans/{weekStart}?userId=`). RED → implement → GREEN.
- [ ] **Commit** `feat(plans): admin team report`.

---

### Task 6: Consumers — dashboard, leaderboard (backend)

The Slack daily-post formatter was implemented in **Task 3**; Task 6 only re-runs its tests.

**Files:**
- Modify: `app/routers/dashboard.py`, `app/routers/metrics.py`, `app/routers/weekly_plans.py`/`app/weekly_report.py` (final removals)
- Test: `tests/test_dashboard.py` (update seeding/assertions), `tests/test_leaderboard_targets.py` (new)

**Changes:**
- Dashboard: replace `_regular_plans` with logged plans (`loggedAt != None`); bids from `done.bidsSelf/bidsBidder`; daily interviews done = effective `interviewsSelf + interviewsCaller` using `plan_auto.interview_counts` for the window (one call per request, all users for percentile); weekly targets = `goal.bidsSelf + goal.bidsBidder` and `goal.interviewsSelf + goal.interviewsCaller` via `week_snapshot`/weekly plan lookup (0 → None as before); streak counts logged days. **Response shapes unchanged**; existing dashboard test expectations keep their values after reseeding with new fields.
- Leaderboard: `_weekly_targets_by_user` uses `week_snapshot(user_ids, monday)`: `bidsTarget = goal.bidsSelf + goal.bidsBidder`, `bidsActual = done.bidsSelf + done.bidsBidder`, `interviewsTarget = goal.interviewsSelf + goal.interviewsCaller`; delete `_ensure_plan_metrics`, `_metrics_from_plan`, the `weekly_report` import; then delete `app/weekly_report.py` and any remaining shims/`CORE_METRICS`.
- [ ] Tests: dashboard suite green after reseed; `test_leaderboard_targets_from_goal_and_done`; re-run `tests_unit/test_slack_daily_plan.py` (written in Task 3). RED → implement → GREEN. `grep -rn "weekly_report\|daily_plan_stats\|bidsHandsOn\|interviewsDone\|planBids" app` → only the fold validator and migration.
- [ ] **Commit** `refactor(plans): dashboard, leaderboard and Slack read goal/done`.

---

### Task 7: Migration script (backend)

**Files:**
- Create: `scripts/migrate_plans_goal_done.py`
- Test: `tests_unit/test_migrate_plans.py`, `tests/test_migrate_plans.py`

**Interfaces — Produces:** pure `migrate_daily(doc: dict) -> tuple[dict set, list unset, dict | None next_day_goal]`, `migrate_weekly(doc: dict) -> tuple[dict set, list unset]`; `async run(apply: bool) -> dict` counts `{dailyMigrated, nextDayGoalsCreated, nextDayGoalsSkipped, weeklyMigrated, weeklyDuplicates, alreadyMigrated}`; CLI `python -m scripts.migrate_plans_goal_done [--apply]` (dry-run default) using the `scripts/migrate_stage_notes.py` idiom (init_beanie with needed models, `settings.MONGODB_URI`).
- Mapping per spec "Migration" section; next-day goal goes to `next_working_day(date)`, created goal-only if absent, never overwriting an existing non-empty goal; idempotent (docs with `done` already present and no legacy keys are skipped).

- [ ] Tests: unit mapping for regular/custom daily, weekly; integration `test_dry_run_writes_nothing`, `test_apply_then_second_run_is_noop`, `test_next_day_goal_not_overwritten`, `test_weekly_duplicates_reported`. RED → implement → GREEN.
- [ ] **Commit** `feat(plans): migration script for goal/done plans`.

---

### Task 8: Frontend API, week helpers, SidePanel

**Files:**
- Modify: `src/api/endpoints.ts` (replace weekly/daily section)
- Create: `src/lib/reportWeek.ts`, `src/components/SidePanel.tsx`

**Interfaces — Produces:**
- Types mirroring Tasks 3–5: `Counts`, `ChecklistItem`, `DoneOverrides`, `WeeklyOverrides`, `DayInterviews`, `DayPlan` (= DayOut), `WeekPlan` (= WeekOut), `TeamRow`, `DayPlanInput`, `WeekPlanInput`; `REGIONS`, `PROFILE_REGIONS`.
- Wrappers: `getDayPlans(weekStart, userId?)`, `getDayPlan(date, userId?)`, `putDayPlan(date, body)`, `deleteDayPlan(date)`, `getWeekPlan(weekStart, userId?)`, `putWeekPlan(weekStart, body)`, `deleteWeekPlan(weekStart)`, `getPreviousWeekGoals(weekStart)`, `getTeamReport(weekStart)`. Remove all old weekly/daily wrappers and types (grep first).
- `reportWeek.ts`: `mondayOf(d: Date): Date`, `weekParam(d: Date): string`, `parseWeekParam(s: string | null): Date` (invalid → current Monday), `weekDays(monday: Date): Date[]` (Mon–Sat), `weekLabel(monday)` (reuse Task-6-of-dashboard style "Sep 28 – Oct 3"), `compare(done: number, goal: number): {state: 'met'|'short'|'over'|'none', diff: number}` (goal 0 & done 0 → none; goal 0 & done > 0 → over), `regionTotal(d: Record<string, number>): number`, `worstRegion(goal, done): {region, short} | null`, `emptyCounts(): Counts`, `isToday(d)`.
- `SidePanel({ open, title, onClose, children, footer, dirty? })`: right slide-in `<aside role="dialog" aria-modal>` using `useDialog`, full-width on < sm, `max-w-2xl` otherwise; when `dirty` and closing, `window.confirm('Discard unsaved changes?')`.

- [ ] Implement; verify filtered tsc empty for `endpoints|reportWeek|SidePanel`; sanity-run `compare`/`weekLabel`/`parseWeekParam` via esbuild+node (not committed). **Commit** `feat(report): API types, week helpers and side panel`.

---

### Task 9: Counts and checklist editors

**Files:** Create `src/components/report/CountsEditor.tsx`, `src/components/report/ChecklistEditor.tsx`

**Interfaces — Consumes:** Task 8 types/helpers. **Produces:**
- `CountsEditor({ goal, done, auto, overrides, onGoal, onDone, onOverride, readOnly, showDone })` — rows: Bids self/bidder, Interviews self/caller, Profiles per region, LinkedIn per region; columns Goal | Done (stacked under `sm`). Interviews/profiles Done render the effective value greyed with an `auto` tag and stage chips (`stageBadgeClass`) when not overridden; an Edit button turns it into an input (sets override); `↺` resets (override → null). Regions shown: any with non-zero goal/done/auto, plus a `+ region` select of the rest. Number inputs `min=0`, `inputMode="numeric"`, labelled for screen readers (`aria-label="Bids self goal"` etc.).
- `ChecklistEditor({ items, onChange, readOnly, allowTick })` — tick box per item, inline text edit, remove ×, `+ Add item` (max 20, 200 chars), `Enter` adds a new row.

- [ ] Implement; filtered tsc empty. **Commit** `feat(report): goal/done counts and checklist editors`.

---

### Task 10: Day panel

**Files:** Create `src/components/report/DayPanel.tsx`

**Interfaces — Consumes:** `SidePanel`, `CountsEditor`, `ChecklistEditor`, `getDayPlan`, `putDayPlan`, `deleteDayPlan`, `next working day` logic (Saturday → Monday). **Produces:** `DayPanel({ date, userId, readOnly, open, onClose, onSaved })`.
- Loads `getDayPlan(date, userId)`. Sections: counts (goal + done; done hidden for future days), Goals checklist (ticks allowed for today/past), Notes, **Tomorrow's goal** (only for today/past and not readOnly): `[Copy today's goal]`, counts (goal only), `[Roll over unticked items]`, checklist.
- Save → `putDayPlan(date, {goal, goalItems, done (only when date ≤ today), doneOverrides, notes, tomorrow})`; inline error on failure; `onSaved()` revalidates board SWR keys. Delete button for existing entries (confirm). Title: `Thu, Oct 1` (+ `· today`).

- [ ] Implement; filtered tsc empty. **Commit** `feat(report): day panel`.

---

### Task 11: Week panel

**Files:** Create `src/components/report/WeekPanel.tsx`

**Interfaces — Produces:** `WeekPanel({ weekStart, userId, readOnly, open, onClose, onSaved })` — goal counts (goal column only for bids/interviews/profiles/linkedin), `[Use last week's goals]` (calls `getPreviousWeekGoals`, fills goal + unticked items), goals checklist, Plan notes, Recap notes, Done section (effective values; auto/override/↺ for every field), Save → `putWeekPlan`.

- [ ] Implement; filtered tsc empty. **Commit** `feat(report): week panel`.

---

### Task 12: Week board page

**Files:** Modify `src/pages/Report.tsx` (rewrite), `src/App.tsx` (`/weekly-plan` → `/report`); Delete `src/pages/WeeklyPlan.tsx`, `src/pages/DailyPlan.tsx`; Create `src/components/report/WeekSummaryCard.tsx`, `src/components/report/DayRow.tsx`

**Behaviour:**
- URL params `week` (Monday `YYYY-MM-DD`) and `user` (admins only) via `useSearchParams`; `‹ ›` step weeks (› disabled beyond next week); `This week` button.
- SWR: `['week-plan', week, user]` → `getWeekPlan`, `['day-plans', week, user]` → `getDayPlans`.
- `WeekSummaryCard`: per category `done/goal` with ✓/▼n/▲n (`compare`), profiles/LinkedIn totals + worst region note, checklist `n/m done`, `[Edit week goals]` (owner) / `[View]` (read-only).
- `DayRow` for Mon–Sat (+ Sunday if it has an entry): date, per-category compact `done/goal` badges, items `n/m`; today highlighted with `[Log today]`; future days show goal or `[Set goal]`; click opens `DayPanel`.
- Admin with no `user` param → render Team view placeholder slot (Task 13); admin with `user` → that user's board read-only with a `← Team` link. Staff → own board.
- Empty states and skeletons; per-section error with Retry.

- [ ] Implement; `grep -rn "WeeklyPlan'\|DailyPlan'\|runWeeklyProgressReport" src` → empty; filtered tsc empty; `vite build --mode development` OK. **Commit** `feat(report): week board replaces weekly/daily tabs`.

---

### Task 13: Team view

**Files:** Create `src/components/report/TeamTable.tsx`; Modify `src/pages/Report.tsx` (render it for admins without `user`)

**Behaviour:** `getTeamReport(week)`; table columns User, Bids, Interviews, Profiles, LinkedIn (`done/goal`, coloured by `compare`), Last log (weekday; `⚠` when more than 1 working day before today for the current week, or no log), row click → `?week=…&user=<id>`. Horizontal scroll inside the table container only on narrow screens. Sorted by name.

- [ ] Implement; filtered tsc empty; `vite build --mode development` OK; dev-server serves Report.tsx 200. **Commit** `feat(report): admin team view`.

---

## Out of scope

LinkedIn registry, reminders, item due dates, editing other users' plans, running the migration against production (the user runs dry-run then `--apply`).
