# Pay Week Sunday Switch Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** From Sun Nov 22 2026, 8 pm Chicago, pay weeks run Sunday 8 pm → Sunday 8 pm and report days close at 6 pm, without re-cutting any earlier week or day; the weekly Slack "bids & pay" report posts at the new cutoff.

**Architecture:** The bid schedule today is one fixed rule set (`BidSchedule`: daily 18:30, weekly Saturday 16:00) applied to all time. Add an optional **switch**: a moment plus a second rule set. Every cutoff before the switch follows the old rules, every cutoff after it the new ones, and all window math goes through era-aware helpers in `app/bids/windows.py`. A pay week's days become "the daily windows whose midpoint is inside the week" (identical to today's rule for old weeks, and Mon–Sun for new ones). Existing Railway variables stay as the "before" rules; four new variables turn the switch on, so deploying the code changes nothing until they are set.

**Tech Stack:** FastAPI + Beanie (Python 3.13), pytest + mongomock-motor (`tests_unit/`); React + TS for one copy fix.

**Spec:** `docs/superpowers/specs/2026-11-16-bidders-page-redesign-design.md` — decisions 5–6 and "Pay week schedule switch".

## Before starting

- Backend worktree `wt/backend-payweek`, branch `feat/pay-week-sunday` from `origin/dev` (this ships to Railway on its own; it does **not** go on the unmerged reorg branches). App worktree `wt/app-payweek`, branch `fix/pay-week-copy` from `origin/main` (Task 6 only). Copy this plan and the spec into the backend worktree's `docs/superpowers/` and commit them first.
- Backend tests: from the backend worktree root, `"C:/Users/Administrator/Downloads/engineer - Copy/engineers_backend/.venv/Scripts/python.exe" -m pytest tests_unit/<file> -q -p no:cacheprovider`. Do not put a `.env` in the worktree (it changes two tests' results). Known pre-existing failures on `dev`: record them in Task 1 by running the full suite once before any change.
- App checks: `npm run lint`, `npm run build`, `npm test` in `wt/app-payweek`.

## Global Constraints

- Time zone `America/Chicago` (`BID_REPORT_TIMEZONE`).
- Before the switch (unchanged): daily cutoff **18:30**, weekly cutoff **Saturday 16:00** (from the existing `BID_DAILY_REPORT_TIME`, `BID_WEEKLY_REPORT_DAY`, `BID_WEEKLY_REPORT_TIME`).
- Switch moment **2026-11-22 20:00** local. After it: daily cutoff **18:00**, weekly cutoff **Sunday 20:00**.
- New settings (all optional; switch off when `BID_SCHEDULE_SWITCH_AT` is unset): `BID_SCHEDULE_SWITCH_AT` = `"YYYY-MM-DDTHH:MM"` local; `BID_NEXT_DAILY_REPORT_TIME` = `"HH:MM"`; `BID_NEXT_WEEKLY_REPORT_DAY` = `monday`..`sunday`; `BID_NEXT_WEEKLY_REPORT_TIME` = `"HH:MM"`. Setting the switch requires all three NEXT values, and the switch moment must fall on the NEXT weekly day at the NEXT weekly time (startup fails otherwise, like the existing validators).
- Weekly cutoffs: old-rule cutoffs exist only at or before **switch − 7 days**; new-rule cutoffs exist only at or after the switch. So the week ending at the switch runs **Sat 2026-11-14 16:00 → Sun 2026-11-22 20:00**.
- Daily cutoffs: old-rule cutoffs at or before the switch; new-rule cutoffs strictly after it. So the day straddling the switch runs **Sun 2026-11-22 18:30 → Mon 2026-11-23 18:00**.
- A moment exactly on a cutoff belongs to the next period (as today).
- A pay week's days are the daily windows whose midpoint lies inside `[week start, week end)`; labels stay `Week ending <Ddd> <Mon> <d>`.
- Every closed period computed before the switch must equal what the code computes today with no switch configured.
- Outside `app/bids/windows.py`, no code reads `daily_at`, `weekly_day` or `weekly_at` directly.

## Review Focus

1. A bid exactly at Sun Nov 22 20:00, Mon Nov 23 18:00 or Sun Nov 22 18:30 lands in the following period — tests in Tasks 2 and 3.
2. Old weeks and days (e.g. the pay week ending Sat Nov 7 2026, report day Nov 10) are byte-identical with the switch on vs off — tests in Tasks 2 and 3.
3. The first DST change after the switch (Sun 2027-03-14, clocks forward at 02:00): that pay week is 7 report days, its UTC length is 167 h, and the cutoff is 20:00 local — test in Task 3.
4. `?week=2026-11-21` (a Saturday) and `?week=2026-11-22` open the long week; `?week=2026-11-23` opens the first Sunday week — test in Task 3.
5. With the switch unset, every existing test passes unchanged (deploy-before-configure safety) — full-suite run in Task 5.

---

### Task 1: Settings and the two-rule schedule

**Files:**
- Modify: `app/config.py` (bid report settings block, `:137-143`, and its validators `:206-226`)
- Modify: `app/bids/windows.py` (`BidSchedule`, `schedule_from_settings`)
- Test: `tests_unit/test_bids_windows.py`

**Interfaces:**
- Produces: `@dataclass(frozen=True) class Rules: daily_at: time; weekly_day: int; weekly_at: time` and `BidSchedule(tz: ZoneInfo, daily_at: time, weekly_day: int, weekly_at: time, switch_at: Optional[datetime] = None, next_rules: Optional[Rules] = None)` — the four existing fields keep their positions and meaning ("before" rules, or the only rules), so every existing `BidSchedule(...)` call in tests still works. `switch_at` is aware in `tz`.

- [ ] **Step 1:** Run the full backend suite once on the fresh branch and write the failure list into the commit message of Step 6 (baseline).
- [ ] **Step 2: Failing tests** in `test_bids_windows.py`: `test_switch_settings_build_a_two_rule_schedule` (settings with the four new values give `switch_at == datetime(2026,11,22,20,0,tzinfo=CHI)`, `next_rules == Rules(time(18,0), 6, time(20,0))`, old fields unchanged); `test_switch_off_by_default` (`switch_at is None and next_rules is None`); `test_switch_needs_all_next_values` and `test_switch_must_sit_on_the_next_weekly_cutoff` (`2026-11-22T19:00` or a Saturday → `ValidationError`).
- [ ] **Step 3:** Run → FAIL. **Step 4:** Implement (settings as Global Constraints; validators reuse the existing HH:MM / weekday ones). **Step 5:** Run → PASS.
- [ ] **Step 6:** Commit `feat(bids): optional schedule switch settings`.

### Task 2: Era-aware cutoffs and windows

**Files:**
- Modify: `app/bids/windows.py`
- Test: `tests_unit/test_bids_windows.py`

**Interfaces:**
- Consumes: Task 1 `BidSchedule`, `Rules`.
- Produces (all era-aware; with no switch they return exactly what today's code returns):
  - `latest_cutoff(kind: Kind, now: datetime, sched: BidSchedule) -> datetime` (unchanged signature)
  - `next_cutoff(kind: Kind, after: datetime, sched: BidSchedule) -> datetime` — first cutoff strictly after `after`, in `sched.tz`
  - `window_for(kind: Kind, cutoff: datetime, sched: BidSchedule) -> tuple[datetime, datetime]` — `[previous cutoff, cutoff)` in UTC, where previous = `latest_cutoff(kind, cutoff - 1 µs)`
  - `daily_cutoff_on(day: date, sched: BidSchedule) -> datetime` — the daily cutoff whose local date is `day`
  - `report_day(moment: datetime, sched: BidSchedule) -> date` — local date of `next_cutoff("daily", moment)`; `moment` aware, or naive = UTC

Algorithm for `latest_cutoff` (the only non-obvious part): compute the candidate under the NEXT rules (same formula as today's code with `next_rules`' times); if a switch is set and that candidate is `>= switch_at` (weekly) / `> switch_at` (daily), return it. Otherwise return today's formula under the old rules evaluated at `min(now, limit)`, where `limit = switch_at - 7 days` (weekly) or `switch_at` (daily). `next_cutoff` is the mirror image.

- [ ] **Step 1: Failing tests** (all times America/Chicago, switch as Global Constraints, `sched_on`/`sched_off` fixtures):
  - `test_weekly_cutoffs_around_the_switch`: `latest_cutoff("weekly", Sat 2026-11-21 17:00)` → Sat 11-14 16:00; at Sun 11-22 19:59 → Sat 11-14 16:00; at Sun 11-22 20:00 → Sun 11-22 20:00; at Wed 12-02 09:00 → Sun 11-29 20:00.
  - `test_weekly_windows_around_the_switch`: `window_for("weekly", Sun 11-22 20:00)` → (2026-11-14 22:00Z, 2026-11-23 02:00Z); `window_for("weekly", Sun 11-29 20:00)` → (2026-11-23 02:00Z, 2026-11-30 02:00Z).
  - `test_daily_cutoffs_around_the_switch`: `latest_cutoff("daily", Sun 11-22 19:00)` → Sun 11-22 18:30; at Mon 11-23 12:00 → Sun 11-22 18:30; at Mon 11-23 18:00 → Mon 11-23 18:00; `window_for("daily", Mon 11-23 18:00)` → [Sun 11-22 18:30, Mon 11-23 18:00).
  - `test_next_cutoff`: weekly after Sat 11-14 16:00 → Sun 11-22 20:00; daily after Sun 11-22 18:30 → Mon 11-23 18:00.
  - `test_daily_cutoff_on`: 11-10 → 18:30, 11-22 → 18:30, 11-23 → 18:00.
  - `test_report_day`: Sun 11-22 18:15 → 11-22; Sun 11-22 18:30 → 11-23 (on the cutoff = next day); Mon 11-23 18:00 → 11-24; Sun 11-29 18:30 → 11-30.
  - `test_the_past_is_unchanged`: for every hour of 2026-10-01..2026-11-14, `latest_cutoff` and `window_for` (both kinds) are equal with `sched_on` and `sched_off`.
- [ ] **Step 2:** Run → FAIL. **Step 3:** Implement. **Step 4:** Run the file → PASS (existing tests in it too).
- [ ] **Step 5:** Commit `feat(bids): cutoffs and windows follow the schedule switch`.

### Task 3: Pay weeks across the switch

**Files:**
- Modify: `app/bids/week.py` (`pay_week`, module docstring)
- Test: `tests_unit/test_bids_week.py`

**Interfaces:**
- Consumes: Task 2 `latest_cutoff`, `next_cutoff`, `window_for`.
- Produces: `pay_week(sched, now, week=None) -> PayWeek` (unchanged signature): end = `next_cutoff("weekly", latest_cutoff("weekly", anchor))`; days = daily windows (walk with `next_cutoff("daily", …)` from the week start minus one day) whose midpoint is inside `[start, end)`.

- [ ] **Step 1: Failing tests:**
  - `test_the_long_week_at_the_switch`: `pay_week(sched_on, Wed 2026-11-18 09:00)` → start 2026-11-14 22:00Z, end 2026-11-23 02:00Z, day keys `2026-11-15 … 2026-11-22` (8 days), `week_label` `"Week ending Sun Nov 22"`.
  - `test_the_first_sunday_week`: now Wed 2026-11-25 → days `2026-11-23 … 2026-11-29` (Mon–Sun), label `"Week ending Sun Nov 29"`; its first day window is [Sun 11-22 18:30, Mon 11-23 18:00).
  - `test_week_param_picks_the_right_week`: `week=date(2026,11,21)` and `date(2026,11,22)` → the long week; `date(2026,11,23)` → week ending Nov 29.
  - `test_old_weeks_are_unchanged`: for each week anchor 2026-10-03..2026-11-14 (Saturdays), `pay_week(sched_on, …)` equals `pay_week(sched_off, …)` field by field.
  - `test_dst_week_after_the_switch`: `pay_week(sched_on, Wed 2027-03-10 09:00)` (the week holding the Sun 2027-03-14 02:00 clock change) → ends Sun 2027-03-14 20:00 local, 7 day keys `2027-03-08 … 2027-03-14`, `(end - start) == timedelta(hours=167)`.
- [ ] **Step 2:** Run → FAIL. **Step 3:** Implement. **Step 4:** Run `test_bids_week.py`, `test_bids_two_pay_weeks.py`, `test_bids_single_page.py` → PASS.
- [ ] **Step 5:** Commit `feat(bids): pay weeks across the schedule switch (midpoint days)`.

### Task 4: Every other schedule reader goes through the helpers

**Files:**
- Modify: `app/bids/performance.py:131-138` (`day_windows` → `daily_cutoff_on`), `app/routers/bids.py:190-199` (open window and `day=` → `next_cutoff` / `daily_cutoff_on`; docstring `:306` drops "Sat 16:00"), `app/profile_metrics.py:79-82` (`bid_report_day` → `windows.report_day`, keep the name as a thin alias for its callers)
- Test: `tests_unit/test_bids_windows.py` (one grep test), plus the files below

**Interfaces:**
- Consumes: Task 2 helpers.

- [ ] **Step 1: Failing tests:**
  - `test_listing_a_day_after_the_switch` (in `test_bids_single_page.py`, its fixture extended with `sched_on` settings): bids at Sun 11-22 18:40 and Mon 11-23 17:50 are both listed by `list_bids(user, day="2026-11-23")`; one at Mon 11-23 18:00 is not.
  - `test_report_day_alias` (in an existing profile-metrics test file): `bid_report_day(naive UTC of Sun 11-22 18:30 Chicago, sched_on) == date(2026,11,23)`.
  - `test_no_direct_schedule_reads`: reads every `app/**/*.py` except `app/bids/windows.py` and asserts none contains `.daily_at`, `.weekly_day` or `.weekly_at`.
- [ ] **Step 2:** Run → FAIL. **Step 3:** Implement. **Step 4:** Run the touched test files → PASS.
- [ ] **Step 5:** Commit `refactor(bids): report days and day lists use the switch-aware helpers`.

### Task 5: Slack reports at the switch, and the full suite

**Files:**
- Test: `tests_unit/test_bids_reports.py`
- Modify: only if a test exposes a gap (`app/bids/reports.py` already derives everything from `latest_cutoff` / `window_for`)

- [ ] **Step 1: Tests** (follow the file's fake store / fake post): with `sched_on`, `run_bid_reports_tick` at Sat 2026-11-21 16:05 posts **no** weekly report; at Sun 2026-11-22 20:05 posts weekly `periodKey "2026-11-22"` with window [11-14 22:00Z, 11-23 02:00Z) and the header `Weekly bids & pay — week ending …Nov 22…`; at Sun 11-22 18:35 posts daily `"2026-11-22"`; at Mon 11-23 18:05 posts daily `"2026-11-23"`; at Mon 11-23 17:59 nothing new.
- [ ] **Step 2:** Run → expect PASS if Tasks 2–4 are right; fix `reports.py` only for a real failure.
- [ ] **Step 3:** Full backend suite with the switch **unset** (defaults): the failure set equals Task 1's baseline.
- [ ] **Step 4:** Commit `test(bids): weekly and daily reports at the schedule switch`.

### Task 6: Copy that names the old schedule (app, `main`)

**Files:**
- Modify (in `wt/app-payweek`): `src/components/bidders/BiddersTable.tsx:21` — the Bids tip says `(Sat 4 pm – Sat 4 pm)`; drop the times: `Approved + pending bids. In a pay week: the pay-week window, as the weekly report pays. Hover a value for the split.`
- [ ] **Step 1:** Grep `src` for `Sat 4`, `4 pm`, `16:00`, `18:30`, `6:30 PM`, `Saturday cutoff` in user-visible strings (comments may stay); fix any other hit the same way (no times in copy; times come from the server).
- [ ] **Step 2:** `npm run lint && npm run build && npm test` → exit 0. Commit `fix(bidders): no hard-coded pay-week times in copy`.

### Task 7: Rollout (controller + user; no code)

- [ ] **Step 1:** Ask the user before pushing: push `feat/pay-week-sunday` and open a PR to `dev`; push `fix/pay-week-copy` and open a PR to `main`. The user merges, and approves the Railway deploy in the dashboard (deploys wait at NEEDS_APPROVAL).
- [ ] **Step 2:** After the deploy is live, and **before Sat 2026-11-21 16:00 Chicago** (else the old rules close and post that week on Saturday), with the user's OK set on **both** Railway services (`engineers_backend`, `keen-spirit`): `BID_SCHEDULE_SWITCH_AT=2026-11-22T20:00`, `BID_NEXT_DAILY_REPORT_TIME=18:00`, `BID_NEXT_WEEKLY_REPORT_DAY=sunday`, `BID_NEXT_WEEKLY_REPORT_TIME=20:00`. Leave the existing three `BID_*` schedule variables as they are.
- [ ] **Step 3:** Verify: the user opens Bidders on the live app — the label reads `Week ending Sun Nov 22` and the week shows 8 days, Nov 15 … Nov 22.
- [ ] **Step 4:** After Sun Nov 22 20:00: the weekly Slack post for 2026-11-22 appeared once; Mon Nov 23 18:00 daily post appeared.
- [ ] **Step 5:** Merge `origin/dev` and `origin/main` into the callers and reorg branches (as on 2026-11-16) so the Bids page work builds on the switched schedule; the reorg client's hard-coded clock (`src/lib/bidderFilters.ts` `reportClock`) is replaced in the Bids page plan's first task.
