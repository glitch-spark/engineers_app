# Dashboard Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the Dashboard with three motivating cards (This week, Bids & interviews chart, Net income 12 months), backed by a new `/dashboard` API router, and add Dashboard to the sidebar.

**Architecture:** Backend gets a pure helper module (`app/dashboard_stats.py`, no DB) plus a thin router (`app/routers/dashboard.py`) with three endpoints; interview-round counting is extracted from `metrics.py` into a shared module. Frontend gets three self-contained card components, each with its own SWR fetch, composed by a rewritten `Dashboard.tsx`.

**Tech Stack:** FastAPI + Beanie/Motor (MongoDB), pytest (+ pytest-asyncio); React 18 + Vite + TypeScript, SWR 2, recharts 2.12, Tailwind.

**Spec:** `engineers_app/docs/superpowers/specs/2026-09-30-dashboard-redesign-design.md` — read it alongside this plan.

## Global Constraints

- Repos/branches: backend tasks run in `engineers_backend`, frontend tasks in `engineers_app`; both on `feat/cleanup`.
- Timezone: `get_settings().APP_TIMEZONE` (default `America/New_York`, tests use `UTC`); invalid/empty → `UTC`.
- Week: display and pace Mon–Sat (6 working days); counting window Mon 00:00 → Sun 23:59:59 (Sunday rolls into the preceding week).
- Daily plan counts: only `planType == "regular"`; self = `bidsHandsOn`, bidder = `bidsByBidder`, interviews = `interviewsDone`. `DailyPlan.date` is naive midnight of the calendar day — compare with `datetime(d.year, d.month, d.day)`, no tz conversion.
- Interviews and transactions store naive-UTC datetimes — convert app-timezone day boundaries to naive UTC before querying.
- Transactions: `status == "approved"`, `userId == subject` (payer-only rows excluded), USD.
- `userId` query param on every `/dashboard` endpoint: admin → that user (404 if unknown); non-admin → 403; absent → caller.
- Invalid dates / ranges → 422. Custom range max 1096 days.
- Bucket rule: ≤62 days `day`, ≤182 days `week`, else `month`.
- Backend field names camelCase in JSON responses, matching existing routers.
- Frontend styling uses existing classes (`panel`, `card-title`, `segmented`, `segmented-btn`, `segmented-btn-active`, `progress-track`, `skeleton`, `btn-outline`, `text-muted`) and `useChartTheme()`; money via `Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 })`.

## Environment notes (read before starting)

- Backend unit tests: `.venv/Scripts/python.exe -m pytest tests_unit/<file> -v`. Run **specific files** — three unrelated files in `tests_unit/` (`test_resume_experience_roles.py`, `test_style_serializer.py`, `test_template_annotate_removals.py`) already fail to import on `dev`; don't fix them here.
- Backend integration tests need `MONGODB_URI_TEST` pointing at a **throwaway** database (never the `.env` `MONGODB_URI`). It is not set on this machine. Before Task 3, ask the user for a test URI. If none is available, write the integration tests anyway, report them as "written, not run", and still verify endpoints manually against the running dev server (`http://127.0.0.1:8080`, uvicorn `--reload`).
- No new models or collections. `tests/conftest.py` already cleans `DailyPlan`, `WeeklyPlan`, `Interview`, `Transaction`, `UserExtra`.
- Frontend has no test runner. `npx tsc -b --noEmit` already fails on `main` in `InterviewPrepLibrary.tsx`, `Interviews.tsx`, `InterviewsLive.tsx`. Verify frontend tasks with:
  `npx tsc -b --noEmit 2>&1 | grep -E "dashboard|Dashboard|Sidebar|endpoints|dashboardPeriod"` → **no output**.
- Dev servers are already running (Vite on :3000, uvicorn on :8080) with hot reload.

## Review Focus

1. **Brand-new user** (no daily plans, no weekly plan, no interviews, no transactions): every endpoint returns zeros/nulls with 200, cards render empty states, no division by zero (target `0` is treated as no target).
2. **Timezone edges:** an interview at Saturday 23:30 New York (Sunday 03:30/04:30 UTC) belongs to that week; a daily plan dated Sunday counts toward the preceding week and, in day buckets, into Saturday's bar.
3. **Custom range starting on a Sunday:** the Sunday has no preceding Saturday in range — its counts go to the next bucket (Monday), never dropped.
4. **Weekly plan without a `bids`/`interviews` metric** (only custom rows, or legacy empty `metrics`): target `null`, pace `null`, card shows counts + "Set weekly targets" link.
5. **Malformed input:** `from=2026-13-01`, `from > to`, range > 1096 days, `today=garbage`, `userId=not-an-id` → 4xx (422 / 400), never 500.

---

### Task 1: Extract interview round counting into a shared module (backend)

**Files:**
- Create: `engineers_backend/app/interview_rounds.py`
- Modify: `engineers_backend/app/routers/metrics.py` (lines ~76–224: `_ROUND_COUNT_EXCLUDED`, `_BREAKDOWN_ORDER`, `_breakdown_group`, `_empty_breakdown`, `_norm_stage`, `_norm_status`, `_as_aware`, `_dt_in_range`, `_dated_rounds`, `_count_interview_rounds`, `_load_interviews_for_window`)
- Test: `engineers_backend/tests_unit/test_interview_rounds.py`

**Interfaces:**
- Produces (public names in `app/interview_rounds.py`):
  - `BREAKDOWN_ORDER: tuple[tuple[str, str], ...]` — `(("intro","Intro"),("tech","Tech"),("hiring","Hiring"),("panel","Panel"),("final","Final"))`
  - `empty_breakdown() -> dict[str, int]`
  - `count_interview_rounds(iv, start: datetime, end: datetime) -> tuple[int, int, dict[str, int]]` — (rounds, canceled, breakdown); same semantics as today's `_count_interview_rounds`.
  - `async load_interviews_for_window(user_ids: list, start: datetime, end: datetime) -> list[Interview]`
- `metrics.py` imports these and keeps its private aliases (`_count_interview_rounds = count_interview_rounds`, etc.) so no other call site changes. Other helpers (`_norm_stage`, `_norm_status`, `_as_aware`, `_dt_in_range`, `_dated_rounds`, `_breakdown_group`, `_ROUND_COUNT_EXCLUDED`) move too; keep them module-private in `interview_rounds.py` and re-import into `metrics.py` only those `metrics.py` still references elsewhere (grep each name).

- [ ] **Step 1: Write the failing tests** in `tests_unit/test_interview_rounds.py` (set `MONGODB_URI` / `AUTH_SECRET` env defaults before importing, as `tests_unit/test_daily_plan_stats.py` does). Build interviews with `SimpleNamespace(stage=..., status=..., scheduledAt=..., stageHistory=[SimpleNamespace(stage=..., scheduledAt=...)])`.

```python
START, END = datetime(2026, 9, 28), datetime(2026, 10, 4, 23, 59, 59)

def test_counts_each_dated_round_by_group():
    iv = _iv("tech_round_2", "scheduled", datetime(2026, 10, 1, 15),
             history=[("intro", datetime(2026, 9, 28, 14)), ("tech_round_1", datetime(2026, 9, 30, 14))])
    rounds, canceled, bd = count_interview_rounds(iv, START, END)
    assert (rounds, canceled) == (3, 0)
    assert bd == {"intro": 1, "tech": 2, "hiring": 0, "panel": 0, "final": 0}

def test_excluded_stages_not_counted():
    iv = _iv("home_assessment", "scheduled", datetime(2026, 9, 29),
             history=[("ai_interview", datetime(2026, 9, 28))])
    assert count_interview_rounds(iv, START, END)[0] == 0

def test_scheduled_rejected_is_canceled():
    iv = _iv("rejected", "scheduled", datetime(2026, 9, 30))
    assert count_interview_rounds(iv, START, END)[:2] == (0, 1)

def test_rounds_outside_window_ignored():
    iv = _iv("final", "scheduled", datetime(2026, 10, 5, 9))
    assert count_interview_rounds(iv, START, END)[0] == 0

def test_breakdown_order_labels():
    assert [label for _, label in BREAKDOWN_ORDER] == ["Intro", "Tech", "Hiring", "Panel", "Final"]
```

- [ ] **Step 2: Run** `.venv/Scripts/python.exe -m pytest tests_unit/test_interview_rounds.py -v` — Expected: FAIL (`ModuleNotFoundError: app.interview_rounds`).
- [ ] **Step 3: Move** the listed helpers verbatim into `app/interview_rounds.py` (rename the four public ones), import them back into `metrics.py` with the old private names as aliases, delete the originals from `metrics.py`.
- [ ] **Step 4: Run** the new test file — Expected: PASS. Then `.venv/Scripts/python.exe -c "import app.main"` — Expected: no error. If `MONGODB_URI_TEST` is available also run `pytest tests/test_weekly_plans.py -q` (uses metrics helpers indirectly) — Expected: PASS.
- [ ] **Step 5: Commit**

```bash
git add app/interview_rounds.py app/routers/metrics.py tests_unit/test_interview_rounds.py
git commit -m "refactor: extract interview round counting into app.interview_rounds"
```

---

### Task 2: Pure dashboard helpers (backend)

**Files:**
- Create: `engineers_backend/app/dashboard_stats.py`
- Test: `engineers_backend/tests_unit/test_dashboard_stats.py`

**Interfaces:**
- Produces (all pure, no DB):
  - `Bucket = Literal["day", "week", "month"]`
  - `app_tz() -> ZoneInfo` — from `APP_TIMEZONE`, fallback `UTC`.
  - `local_day_start_utc(d: date, tz: ZoneInfo) -> datetime` — naive UTC datetime of local midnight of `d`.
  - `week_window(today: date) -> tuple[date, date, date]` — `(monday, saturday, sunday)` of the week containing `today` (Sunday → the week that just ended).
  - `pick_bucket(start: date, end: date) -> Bucket` — inclusive day span `n = (end-start).days + 1`: ≤62 `day`, ≤182 `week`, else `month`.
  - `bucket_keys(start: date, end: date, bucket: Bucket) -> list[date]` — ordered bucket starts covering the range; `day` skips Sundays; `week` = Mondays (first may precede `start`); `month` = 1st of each month.
  - `bucket_for(d: date, bucket: Bucket, keys: list[date]) -> date` — key that `d` falls in. `day`: Sunday → previous Saturday if in `keys`, else next day (Monday). `week`: Monday of `d`'s Mon–Sun week. `month`: 1st of month.
  - `bucket_label(key: date, bucket: Bucket, start: date, end: date) -> str` — `day`: `"Mon"`-style weekday when span ≤ 7 days, else `"Sep 28"`; `week`: `"Sep 28"`; `month`: `"Sep"` if `start.year == end.year`, else `"Sep 26"` (2-digit year).
  - `pace(actual: int, target: int | None, today: date) -> dict | None` — `None` when `target` is falsy. Otherwise `{"expected", "behindBy", "perDayNeeded", "onTrack"}` per spec: `elapsed = min(today.weekday() + 1, 6)`; `expected = round(target * elapsed / 6)`; `behindBy = max(0, expected - actual)`; `onTrack = actual >= expected`; `remaining = 6 - elapsed`; `perDayNeeded = ceil(max(0, target - actual) / remaining)` if `remaining > 0` else `None`.
  - `streak(plan_days: set[date], today: date, max_days: int = 365) -> int` — algorithm below.
  - `percentile(mine: int, scores: list[int]) -> dict | None` — `scores` includes `mine`; `None` if `len(scores) < 3`; `rank = 1 + count(s > mine)`; `pct = ceil(rank / N * 100)`; `pct <= 50` → `{"position": "top", "percent": pct}`, else `{"position": "bottom", "percent": ceil((N - rank + 1) / N * 100)}`.
  - `month_keys(today: date, n: int = 12) -> list[str]` — `"YYYY-MM"`, oldest first, ending with `today`'s month.

Streak algorithm (not determined by the signature):

```python
def _prev_working(d):            # step back one day, skipping Sundays
    d -= timedelta(days=1)
    return d - timedelta(days=1) if d.weekday() == 6 else d

cur = today if today.weekday() != 6 else today - timedelta(days=1)
if cur not in plan_days:
    cur = _prev_working(cur)     # today not logged yet does not break it
count = 0
while cur in plan_days and count < max_days:
    count += 1
    cur = _prev_working(cur)
return count
```

- [ ] **Step 1: Write the failing tests** (`tests_unit/test_dashboard_stats.py`, env defaults before import). Dates: 2026-09-28 is a Monday.

```python
def test_week_window_midweek_and_sunday():
    assert week_window(date(2026, 10, 1)) == (date(2026, 9, 28), date(2026, 10, 3), date(2026, 10, 4))
    assert week_window(date(2026, 10, 4)) == (date(2026, 9, 28), date(2026, 10, 3), date(2026, 10, 4))

@pytest.mark.parametrize("days,expected", [(1, "day"), (62, "day"), (63, "week"), (182, "week"), (183, "month"), (365, "month")])
def test_pick_bucket_boundaries(days, expected):
    start = date(2026, 1, 1)
    assert pick_bucket(start, start + timedelta(days=days - 1)) == expected

def test_day_keys_skip_sunday_and_sunday_merges_into_saturday():
    keys = bucket_keys(date(2026, 9, 28), date(2026, 10, 4), "day")
    assert len(keys) == 6 and keys[-1] == date(2026, 10, 3)
    assert bucket_for(date(2026, 10, 4), "day", keys) == date(2026, 10, 3)

def test_range_starting_sunday_rolls_forward():
    keys = bucket_keys(date(2026, 10, 4), date(2026, 10, 10), "day")
    assert bucket_for(date(2026, 10, 4), "day", keys) == date(2026, 10, 5)

def test_week_bucket_puts_sunday_in_preceding_week():
    keys = bucket_keys(date(2026, 9, 1), date(2026, 11, 30), "week")
    assert bucket_for(date(2026, 10, 4), "week", keys) == date(2026, 9, 28)

def test_month_labels_same_and_cross_year():
    assert bucket_label(date(2026, 9, 1), "month", date(2026, 1, 1), date(2026, 12, 31)) == "Sep"
    assert bucket_label(date(2026, 9, 1), "month", date(2025, 10, 1), date(2026, 9, 30)) == "Sep 26"

def test_day_label_weekday_for_week_range():
    assert bucket_label(date(2026, 9, 28), "day", date(2026, 9, 28), date(2026, 10, 4)) == "Mon"
    assert bucket_label(date(2026, 9, 28), "day", date(2026, 9, 1), date(2026, 9, 30)) == "Sep 28"

def test_pace_midweek_behind():
    # Wednesday: elapsed 3 of 6, target 50 → expected 25
    assert pace(20, 50, date(2026, 9, 30)) == {"expected": 25, "behindBy": 5, "perDayNeeded": 10, "onTrack": False}

def test_pace_saturday_and_sunday_have_no_days_left():
    assert pace(50, 50, date(2026, 10, 3))["perDayNeeded"] is None
    assert pace(40, 50, date(2026, 10, 4)) == {"expected": 50, "behindBy": 10, "perDayNeeded": None, "onTrack": False}

def test_pace_no_target():
    assert pace(10, None, date(2026, 9, 30)) is None
    assert pace(10, 0, date(2026, 9, 30)) is None

def test_streak_spans_sunday_and_ignores_missing_today():
    days = {date(2026, 10, 1), date(2026, 9, 30), date(2026, 9, 29), date(2026, 9, 28), date(2026, 9, 26)}
    assert streak(days, date(2026, 10, 2)) == 5     # Fri not logged yet; Thu..Mon + Sat (skip Sun 27)

def test_streak_broken_by_gap_and_zero():
    assert streak({date(2026, 10, 1), date(2026, 9, 29)}, date(2026, 10, 1)) == 1
    assert streak(set(), date(2026, 10, 1)) == 0

def test_percentile_top_bottom_ties_and_small_team():
    assert percentile(50, [50, 40, 30, 20, 10]) == {"position": "top", "percent": 20}
    assert percentile(20, [50, 40, 30, 20, 10]) == {"position": "bottom", "percent": 40}
    assert percentile(40, [40, 40, 10, 5]) == {"position": "top", "percent": 25}
    assert percentile(5, [5, 3]) is None

def test_month_keys_rolls_over_year():
    keys = month_keys(date(2026, 9, 30))
    assert keys[0] == "2025-10" and keys[-1] == "2026-09" and len(keys) == 12

def test_local_day_start_utc_new_york():
    assert local_day_start_utc(date(2026, 9, 28), ZoneInfo("America/New_York")) == datetime(2026, 9, 28, 4, 0)
```

- [ ] **Step 2: Run** `.venv/Scripts/python.exe -m pytest tests_unit/test_dashboard_stats.py -v` — Expected: FAIL (module missing).
- [ ] **Step 3: Implement** `app/dashboard_stats.py` with the signatures above (stdlib only: `datetime`, `math`, `zoneinfo`, `calendar`; `app_tz` imports `get_settings` from `app.config`).
- [ ] **Step 4: Run** the test file — Expected: all PASS.
- [ ] **Step 5: Commit**

```bash
git add app/dashboard_stats.py tests_unit/test_dashboard_stats.py
git commit -m "feat(dashboard): pure helpers for week window, buckets, pace, streak, percentile"
```

---

### Task 3: `/dashboard` router + `GET /dashboard/week` (backend)

**Files:**
- Create: `engineers_backend/app/routers/dashboard.py`
- Modify: `engineers_backend/app/routers/__init__.py` (export `dashboard`, like the other routers), `engineers_backend/app/main.py` (`app.include_router(dashboard.router)` after `metrics.router`)
- Test: `engineers_backend/tests/test_dashboard.py`

**Interfaces:**
- Consumes: Task 1 `load_interviews_for_window`, `count_interview_rounds`, `BREAKDOWN_ORDER`; Task 2 `app_tz`, `local_day_start_utc`, `week_window`, `pace`, `streak`, `percentile`; `app.alerts.app_week_key(day: datetime) -> (year, weekNumber, key)`; `app.routers._util.to_object_id`.
- Produces (used by Tasks 4–5, same file):
  - `router = APIRouter(prefix="/dashboard", tags=["dashboard"])`
  - `async _subject_id(user: UserExtra, user_id: Optional[str]) -> PydanticObjectId` — rules from Global Constraints (403 detail `"admin only"`, 404 detail `"user not found"`).
  - `_parse_ymd(value: Optional[str], name: str) -> Optional[date]` — `None` for empty; `HTTPException(422, f"invalid {name}")` for bad input.
  - `_today(value: Optional[str]) -> date` — parsed `today` param or `datetime.now(app_tz()).date()`.
- Response: exactly the JSON shape in the spec's `GET /dashboard/week` section, with `week = {"start": monday, "end": saturday}` as ISO dates and `stages` = `BREAKDOWN_ORDER` entries + `{"key": "canceled", "label": "Canceled"}`.
- Data rules:
  - Plans: `DailyPlan.find({"userId": sid, "planType": "regular", "date": {"$gte": dt(monday), "$lte": dt(sunday)}})`.
  - Weekly plan: `year, week, _ = app_week_key(datetime(monday...))`; `WeeklyPlan.find_one({"userId": sid, "year": year, "weekNumber": week})`; target = metric `target` for key `bids` / `interviews`, `None` if missing or `0`. `hasWeeklyPlan` = plan exists.
  - Interviews window: `local_day_start_utc(monday, tz)` → `local_day_start_utc(sunday + 1 day, tz) - 1µs`.
  - Streak: regular plan dates for `sid` in `[today - 400 days, today]`.
  - Percentile population: distinct `userId` of regular plans dated `>= today - 29 days`, minus users whose role is `admin`, plus `sid`; scores = this week's sums per user (one query over the window with `userId: {"$in": ids}`).

- [ ] **Step 1: Write the failing integration tests** in `tests/test_dashboard.py`. Seed with direct model inserts (`DailyPlan(...).insert()`, `WeeklyPlan(...)`, `Interview(...)`) — `year`/`weekNumber` on plans via `app_week_key`. Always pass `today=2026-10-01` (Thursday; week Sep 28 – Oct 3). Helper `async def _plan(user, day, self_=0, bidder=0, iv=0, plan_type="regular")`.

```python
async def test_week_requires_auth(client):
    assert (await client.get("/dashboard/week")).status_code == 401

async def test_week_new_user_is_all_zero(client, staff_user, auth_header):
    r = await client.get("/dashboard/week?today=2026-10-01", headers=auth_header(staff_user))
    assert r.status_code == 200
    b = r.json()
    assert b["week"] == {"start": "2026-09-28", "end": "2026-10-03"}
    assert b["bids"] == {"self": 0, "bidder": 0, "total": 0, "target": None, "pace": None, "percentile": None}
    assert b["interviews"]["done"] == 0 and b["streak"] == 0 and b["hasWeeklyPlan"] is False
    assert [s["key"] for s in b["stages"]] == ["intro", "tech", "hiring", "panel", "final", "canceled"]
    assert all(s["count"] == 0 for s in b["stages"])

async def test_week_sums_regular_plans_only_and_sunday_rolls_back(...):
    # Mon 4/2/1, Wed 3/1/0, Sun Oct 4 1/1/1, custom plan Tue 9/9/9, last Sat Sep 26 5/5/5
    ...
    assert b["bids"]["self"] == 8 and b["bids"]["bidder"] == 4 and b["bids"]["total"] == 12
    assert b["interviews"]["done"] == 2

async def test_week_targets_and_pace_from_weekly_plan(...):
    # WeeklyPlan metrics bids target 50, interviews target 0 (→ None); plans total 20 bids
    assert b["bids"]["target"] == 50 and b["hasWeeklyPlan"] is True
    assert b["bids"]["pace"] == {"expected": 33, "behindBy": 13, "perDayNeeded": 15, "onTrack": False}
    assert b["interviews"]["target"] is None and b["interviews"]["pace"] is None

async def test_week_plan_without_core_metrics_has_no_target(...):
    # WeeklyPlan with metrics=[{"key": "study", "label": "Study", "target": 5}]
    assert b["bids"]["target"] is None and b["hasWeeklyPlan"] is True

async def test_week_stage_tiles_and_canceled(...):
    # interviews createdBy staff: intro Mon + tech_round_1 Wed (stageHistory), final Sat 23:30 UTC,
    # rejected+scheduled Tue, ai_interview Thu, intro on next Mon Oct 5 (outside)
    counts = {s["key"]: s["count"] for s in b["stages"]}
    assert counts == {"intro": 1, "tech": 1, "hiring": 0, "panel": 0, "final": 1, "canceled": 1}

async def test_week_streak(...):
    # regular plans Thu Oct 1, Wed, Tue, Mon, Sat Sep 26 (Sun skipped), gap on Fri Sep 25
    assert b["streak"] == 5

async def test_week_percentile_excludes_admins_and_needs_three(...):
    # staff A 30 bids, staff B 20, staff C 10 this week; admin with a plan is ignored
    # as C → {"position": "bottom", "percent": 34}; as A → {"position": "top", "percent": 34}
    # with only A and B active → percentile None

async def test_week_user_id_param(client, staff_user, staff_user_2, admin_user, auth_header):
    assert (await client.get(f"/dashboard/week?userId={staff_user_2.id}", headers=auth_header(staff_user))).status_code == 403
    assert (await client.get(f"/dashboard/week?userId={staff_user_2.id}&today=2026-10-01", headers=auth_header(admin_user))).status_code == 200
    assert (await client.get("/dashboard/week?userId=000000000000000000000000", headers=auth_header(admin_user))).status_code == 404
    assert (await client.get("/dashboard/week?userId=nope", headers=auth_header(admin_user))).status_code == 400

async def test_week_bad_today_is_422(client, staff_user, auth_header):
    assert (await client.get("/dashboard/week?today=garbage", headers=auth_header(staff_user))).status_code == 422
```

Fill in the seeding for the tests shown with `...`; the asserted values are fixed by the comments.

- [ ] **Step 2: Run** `MONGODB_URI_TEST=<uri> .venv/Scripts/python.exe -m pytest tests/test_dashboard.py -v` — Expected: FAIL (404 route missing). (No test DB → skip to Step 3 and note it.)
- [ ] **Step 3: Implement** router, `_subject_id`, `_parse_ymd`, `_today`, and `GET /week`; register in `app/routers/__init__.py` and `app/main.py`.
- [ ] **Step 4: Run** tests — Expected: PASS. Manual check against the dev server: `curl -s "http://127.0.0.1:8080/dashboard/week" -H "Authorization: Bearer <token>"` returns 200 JSON (get a token via `POST /auth/login` with a staff account the user provides, or skip if none).
- [ ] **Step 5: Commit**

```bash
git add app/routers/dashboard.py app/routers/__init__.py app/main.py tests/test_dashboard.py
git commit -m "feat(dashboard): GET /dashboard/week with progress, pace, streak, percentile, stage tiles"
```

---

### Task 4: `GET /dashboard/activity` (backend)

**Files:**
- Modify: `engineers_backend/app/routers/dashboard.py`
- Test: `engineers_backend/tests/test_dashboard.py`

**Interfaces:**
- Consumes: Task 2 `pick_bucket`, `bucket_keys`, `bucket_for`, `bucket_label`; Task 3 `_subject_id`, `_parse_ymd`.
- Query: `from` (alias — declare as `from_: str = Query(..., alias="from")`), `to: str`, `userId?`.
- Response: `{"bucket", "from", "to", "series": [{"key": "YYYY-MM-DD", "label", "self", "bidder", "interviews"}], "totals": {"self", "bidder", "bids", "interviews"}}` — `series` has every key from `bucket_keys`, zero-filled.

- [ ] **Step 1: Write the failing tests**

```python
async def test_activity_week_days_with_sunday_merged(...):
    # plans Mon Sep 28 (2/1/0), Sat Oct 3 (1/0/1), Sun Oct 4 (1/1/0)
    r = await client.get("/dashboard/activity?from=2026-09-28&to=2026-10-04", headers=h)
    b = r.json()
    assert b["bucket"] == "day" and len(b["series"]) == 6
    assert b["series"][0] == {"key": "2026-09-28", "label": "Mon", "self": 2, "bidder": 1, "interviews": 0}
    assert b["series"][5] == {"key": "2026-10-03", "label": "Sat", "self": 2, "bidder": 1, "interviews": 1}
    assert b["totals"] == {"self": 4, "bidder": 2, "bids": 6, "interviews": 1}

async def test_activity_year_is_monthly_and_zero_filled(...):
    r = await client.get("/dashboard/activity?from=2026-01-01&to=2026-12-31", headers=h)
    b = r.json()
    assert b["bucket"] == "month" and len(b["series"]) == 12 and b["series"][0]["label"] == "Jan"

async def test_activity_ignores_custom_plans_and_other_users(...): ...

@pytest.mark.parametrize("qs", ["from=2026-10-05&to=2026-10-01", "from=2020-01-01&to=2026-01-01", "from=2026-13-01&to=2026-12-01", "to=2026-10-01"])
async def test_activity_bad_ranges_422(client, staff_user, auth_header, qs):
    assert (await client.get(f"/dashboard/activity?{qs}", headers=auth_header(staff_user))).status_code == 422
```

- [ ] **Step 2: Run** the new tests — Expected: FAIL (404).
- [ ] **Step 3: Implement** `GET /activity`: validate (`from <= to`, span ≤ 1096 days), query regular plans for `sid` with `date` in `[dt(from), dt(to)]`, accumulate into `bucket_for` keys.
- [ ] **Step 4: Run** — Expected: PASS.
- [ ] **Step 5: Commit** `git commit -am "feat(dashboard): GET /dashboard/activity with auto buckets"` (add test file if untracked changes).

---

### Task 5: `GET /dashboard/net-monthly` (backend)

**Files:**
- Modify: `engineers_backend/app/routers/dashboard.py`
- Test: `engineers_backend/tests/test_dashboard.py`

**Interfaces:**
- Consumes: Task 2 `app_tz`, `local_day_start_utc`, `month_keys`; Task 3 `_subject_id`, `_today`. Reuse the income/outcome/net `$sum` expressions of `_TOTALS_GROUP` in `app/routers/transactions.py` (import it).
- Query: `userId?`, `today?`.
- Pipeline: `$match {userId: sid, status: "approved", date: {$gte: local_day_start_utc(first_of_oldest_month), $lt: local_day_start_utc(first_of_next_month)}}` → `$group {_id: {$dateToString: {format: "%Y-%m", date: "$date", timezone: <APP_TIMEZONE name or "UTC">}}, **_TOTALS_GROUP}`.
- Response: `{"months": [{"period", "income", "outcome", "net"}] (12, oldest first, zero-filled), "total": sum of net}`; amounts rounded to 2 decimals.

- [ ] **Step 1: Write the failing tests**

```python
async def test_net_monthly_approved_owner_only_twelve_months(...):
    # today=2026-09-15. staff owns: approved +3000 Sep 3, approved -900 Sep 10, pending +500 Sep 5,
    # rejected +700 Aug 2, approved -200 Mar 1 2026, approved +100 Sep 20 2025 (outside window);
    # staff_user_2 owns approved +999 Sep 4 with payerId=staff (must not count for staff)
    b = r.json()
    assert len(b["months"]) == 12 and b["months"][0]["period"] == "2025-10" and b["months"][-1]["period"] == "2026-09"
    assert b["months"][-1] == {"period": "2026-09", "income": 3000, "outcome": 900, "net": 2100}
    mar = next(m for m in b["months"] if m["period"] == "2026-03")
    assert mar["net"] == -200
    assert next(m for m in b["months"] if m["period"] == "2026-08")["net"] == 0
    assert b["total"] == 1900

async def test_net_monthly_new_user_zeros(...):
    assert all(m["net"] == 0 for m in b["months"]) and b["total"] == 0

async def test_net_monthly_admin_user_id(...): ...   # admin with userId=staff sees staff's numbers; staff with userId → 403
```

- [ ] **Step 2: Run** — Expected: FAIL (404).
- [ ] **Step 3: Implement** `GET /net-monthly`.
- [ ] **Step 4: Run** the whole `tests/test_dashboard.py` plus `tests_unit/test_dashboard_stats.py tests_unit/test_interview_rounds.py` — Expected: all PASS.
- [ ] **Step 5: Commit** `git commit -am "feat(dashboard): GET /dashboard/net-monthly (approved, owner, 12 months)"`.

---

### Task 6: Frontend API wrappers + period helpers

**Files:**
- Modify: `engineers_app/src/api/endpoints.ts` (new section `// ---------- dashboard ----------`)
- Create: `engineers_app/src/lib/dashboardPeriod.ts`

**Interfaces:**
- Produces (endpoints.ts), using the existing `apiFetch` and `qs` helpers:
  - `interface DashboardPace { expected: number; behindBy: number; perDayNeeded: number | null; onTrack: boolean }`
  - `interface DashboardPercentile { position: 'top' | 'bottom'; percent: number }`
  - `interface DashboardWeek { week: { start: string; end: string }; bids: { self: number; bidder: number; total: number; target: number | null; pace: DashboardPace | null; percentile: DashboardPercentile | null }; interviews: { done: number; target: number | null; pace: DashboardPace | null; percentile: DashboardPercentile | null }; stages: { key: string; label: string; count: number }[]; streak: number; hasWeeklyPlan: boolean }`
  - `interface DashboardActivity { bucket: 'day' | 'week' | 'month'; from: string; to: string; series: { key: string; label: string; self: number; bidder: number; interviews: number }[]; totals: { self: number; bidder: number; bids: number; interviews: number } }`
  - `interface DashboardNetMonthly { months: { period: string; income: number; outcome: number; net: number }[]; total: number }`
  - `getDashboardWeek(params: { userId?: string; today?: string })`, `getDashboardActivity(params: { from: string; to: string; userId?: string })`, `getDashboardNetMonthly(params: { userId?: string; today?: string })`
- Produces (dashboardPeriod.ts):
  - `type PeriodKind = 'week' | 'month' | 'year' | 'custom'`
  - `periodRange(kind: Exclude<PeriodKind, 'custom'>, anchor: Date): { from: string; to: string; label: string }` — week: `from` Monday, `to` **Sunday** (so Sunday data reaches the backend), `label` `"Sep 28 – Oct 3"` (Mon–Sat); month: 1st → last day, label `"September 2026"`; year: Jan 1 → Dec 31, label `"2026"`.
  - `stepAnchor(kind: Exclude<PeriodKind, 'custom'>, anchor: Date, dir: -1 | 1): Date`
  - `isFuturePeriod(kind: Exclude<PeriodKind, 'custom'>, anchor: Date, today?: Date): boolean` — true when the period's `from` is after `today` (used to disable ›).
  - Reuse `mondayOfWeek` / `toDateInputValue` from `lib/dateRangePresets.ts`.

- [ ] **Step 1: Add** the types and three wrappers to `endpoints.ts`.
- [ ] **Step 2: Create** `dashboardPeriod.ts` with the three functions.
- [ ] **Step 3: Verify** `npx tsc -b --noEmit 2>&1 | grep -E "dashboardPeriod|endpoints"` — Expected: no output. Quick sanity in the browser console is not needed; the functions are exercised in Task 8.
- [ ] **Step 4: Commit**

```bash
git add src/api/endpoints.ts src/lib/dashboardPeriod.ts
git commit -m "feat(dashboard): API wrappers and period helpers"
```

---

### Task 7: `ThisWeekCard`

**Files:**
- Create: `engineers_app/src/components/dashboard/ThisWeekCard.tsx`

**Interfaces:**
- Consumes: Task 6 `getDashboardWeek`, `DashboardWeek`; `todayInputValue` from `lib/week.ts`; `stageBadgeClass` from `lib/stageBadge.ts` (pass the tile key; map `hiring` → `'cultural'`, `canceled` → `'rejected'`, `tech` → `'tech_round_1'` for colours).
- Produces: `export default function ThisWeekCard({ userId }: { userId?: string })`
- SWR key `['dashboard-week', userId ?? 'me', today]`, fetcher `getDashboardWeek({ userId, today: todayInputValue() })`.
- Copy (exact): header `This week · {Sep 28} – {Oct 3}`; streak chip `🔥 {n}-day streak` (hidden when 0); rows `Bids` and `Interviews` showing `{actual} / {target}` and `{pct}%`; bids sub-line `Self {n} · Bidder {n}`; pace `On track` or `Behind pace by {n} · {x}/day needed` (omit the `· …/day needed` part when `perDayNeeded` is null); percentile `Top {p}% of team` / `Bottom {p}% of team`; no target → counts only + link `Set weekly targets` → `/report?tab=weekly` (one link for the card, shown when either target is null). Bar uses `progress-track`, fill `bg-accent-500`, `bg-success-500` when ≥100%, width capped at 100%.
- Stage tiles: six equal-width rectangles (`grid grid-cols-3 sm:grid-cols-6 gap-2`), label + large count, each a `<Link to="/interviews">` (Interviews defaults to the current Mon–Sat week).
- Loading: `skeleton` blocks; error: `Couldn't load this week.` + `Retry` button (`btn-outline`) calling SWR `mutate()`.

- [ ] **Step 1: Implement** the component.
- [ ] **Step 2: Verify** `npx tsc -b --noEmit 2>&1 | grep -E "ThisWeekCard"` — Expected: no output.
- [ ] **Step 3: Commit** `git add src/components/dashboard/ThisWeekCard.tsx && git commit -m "feat(dashboard): This week card"`.

---

### Task 8: `ActivityChartCard`

**Files:**
- Create: `engineers_app/src/components/dashboard/ActivityChartCard.tsx`

**Interfaces:**
- Consumes: Task 6 `getDashboardActivity`, `DashboardActivity`, `periodRange`, `stepAnchor`, `isFuturePeriod`, `PeriodKind`; `useChartTheme`.
- Produces: `export default function ActivityChartCard({ userId }: { userId?: string })`
- State: `kind: PeriodKind` (default `'week'`), `anchor: Date` (default today), `custom: { from: string; to: string }` (default current week's range). Range = `kind === 'custom' ? custom : periodRange(kind, anchor)`. Don't fetch while custom `from > to` (show `From must be on or before To.`).
- SWR key `['dashboard-activity', userId ?? 'me', from, to]`.
- UI: title `Bids & interviews`; segmented buttons `Week | Month | Year | Custom`; for non-custom, `‹` / `›` buttons around the period label, `›` disabled when `isFuturePeriod(kind, stepAnchor(kind, anchor, 1))`; for custom, two `<input type="date" className="input">`.
- Chart: recharts `ResponsiveContainer` (height 280) → `ComposedChart data={series}`; `XAxis dataKey="label"`; left `YAxis yAxisId="bids" allowDecimals={false}`; right `YAxis yAxisId="iv" orientation="right" allowDecimals={false}`; `Bar dataKey="self" name="Self" stackId="b" yAxisId="bids" fill="#0ea5e9"`, `Bar dataKey="bidder" name="Bidder" stackId="b" yAxisId="bids" fill="#6366f1"`, `Line dataKey="interviews" name="Interviews" yAxisId="iv" stroke="#10b981" strokeWidth={2}`; `Tooltip`/`CartesianGrid`/axis colours from `useChartTheme()`; `Legend`.
- Footer (exact): `Total: {bids} bids ({self} self · {bidder} bidder) · {interviews} interviews`.
- Loading/error like Task 7 (`Couldn't load activity.`).

- [ ] **Step 1: Implement** the component.
- [ ] **Step 2: Verify** `npx tsc -b --noEmit 2>&1 | grep -E "ActivityChartCard"` — Expected: no output.
- [ ] **Step 3: Commit** `git add src/components/dashboard/ActivityChartCard.tsx && git commit -m "feat(dashboard): bids & interviews chart card"`.

---

### Task 9: `NetIncomeCard`

**Files:**
- Create: `engineers_app/src/components/dashboard/NetIncomeCard.tsx`

**Interfaces:**
- Consumes: Task 6 `getDashboardNetMonthly`, `DashboardNetMonthly`; `todayInputValue`; `useChartTheme`.
- Produces: `export default function NetIncomeCard({ userId }: { userId?: string })`
- SWR key `['dashboard-net', userId ?? 'me', today]`.
- UI: title `Net income · last 12 months`; headline `12-mo total {$X} · This month {$Y}` (`$Y` = last month in `months`). `BarChart` height 260, `XAxis` label = short month from `period` (`"Oct"`, append 2-digit year for January or when the 12 months span two years and the month is the first shown), `YAxis` currency-formatted ticks, `ReferenceLine y={0}`, `Bar dataKey="net"` with `Cell` per month: `#10b981` when `net >= 0`, `#ef4444` otherwise. Tooltip content: `Income $…`, `Outcome $…`, `Net $…`.
- Loading/error like Task 7 (`Couldn't load transactions.`).

- [ ] **Step 1: Implement** the component.
- [ ] **Step 2: Verify** `npx tsc -b --noEmit 2>&1 | grep -E "NetIncomeCard"` — Expected: no output.
- [ ] **Step 3: Commit** `git add src/components/dashboard/NetIncomeCard.tsx && git commit -m "feat(dashboard): net income 12-month card"`.

---

### Task 10: New Dashboard page, sidebar item, remove old dashboard code

**Files:**
- Modify: `engineers_app/src/pages/Dashboard.tsx` (full rewrite), `engineers_app/src/components/Sidebar.tsx` (new first `NavLink`), `engineers_app/src/api/endpoints.ts` (remove `getDashboardMetrics`, `getDashboardFeed` and their now-unused types)
- Delete: `src/components/dashboard/DailyPlanChart.tsx`, `DashboardOverview.tsx`, `KpiCards.tsx`, `MetricsChart.tsx`, `PeriodTable.tsx`, `src/components/MotivationHero.tsx`
- Keep: `src/lib/leaderboardUI.tsx` (used by Leaderboard, AiReviewPanel), `src/components/TransactionChart.tsx` (not dashboard code; out of scope)

**Interfaces:**
- Consumes: Tasks 7–9 components; `useAuth`; `lookupUsers({ excludeRole: 'admin' })`; `PageHeader`; `Select` (or a plain `<select className="select">`, matching `Transactions.tsx`).
- Page: `PageHeader title="Dashboard"`; if admin → user picker (label `User`, placeholder `Pick a user`) and, until one is picked, a `panel` with `Pick a user to see their dashboard.` and no cards rendered; otherwise `<div className="space-y-6">` with `ThisWeekCard`, `ActivityChartCard`, `NetIncomeCard`, each given `userId` (admin's selection, `undefined` for staff).
- Sidebar: first item `href="/dashboard" label="Dashboard"` with a 24×24 stroke "home/grid" SVG matching the other inline icons (`className="w-5 h-5"`, `strokeWidth={1.5}`).

- [ ] **Step 1: Rewrite** `Dashboard.tsx`, add the sidebar item.
- [ ] **Step 2: Delete** the listed files; `grep -rn "DailyPlanChart\|DashboardOverview\|KpiCards\|MetricsChart\|PeriodTable\|MotivationHero\|getDashboardMetrics\|getDashboardFeed" src` — Expected: no output. Remove the two wrappers and any types only they used.
- [ ] **Step 3: Verify types** `npx tsc -b --noEmit 2>&1 | grep -E "dashboard|Dashboard|Sidebar|endpoints|dashboardPeriod"` — Expected: no output; the only remaining errors are the three pre-existing files.
- [ ] **Step 4: Verify in the running app** (http://localhost:3000, hard refresh): as a staff user — Dashboard is first in the sidebar and highlighted on `/dashboard`; three cards load; Week/Month/Year/Custom switch and ‹ › step (› disabled on the current period); custom From > To shows the message; a stage tile opens `/interviews`. As admin — picker shown, no cards until a user is chosen, then that user's data. No console errors. If no credentials are available, ask the user to do this check and report it as pending.
- [ ] **Step 5: Commit**

```bash
git add -A src
git commit -m "feat(dashboard): new dashboard page and sidebar entry; remove old dashboard widgets"
```

---

## Out of scope

Full admin dashboard, changes to existing endpoints, the pre-existing `tsc` errors, the pre-existing broken `tests_unit` files, pushing branches / opening PRs (ask the user).
