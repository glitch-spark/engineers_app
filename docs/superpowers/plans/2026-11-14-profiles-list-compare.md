# Profiles list compare Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The Profiles list shows an owner's profiles against the all-profiles average (band, ▲/▼, Pass rate, Setup).

**Architecture:** `GET /accounts/metrics` adds fair per-row and combined CompareStats over the compared window (the
Metrics tab's rules, `app/profile_compare.py`); the website reads the cached benchmark (`/accounts/metrics/benchmark`)
for "all profiles" and judges with the Metrics tab's thresholds, shared from one helper.

**Tech Stack:** FastAPI + Beanie (pytest, mongomock-motor); React 18 + TypeScript + SWR + Tailwind (Node test runner).

**Spec:** `docs/superpowers/specs/2026-11-14-profiles-list-compare-design.md` (this worktree).

Worktrees (both on branch `feat/profiles-list-compare`):
- BACK = `C:/Users/ADMINI~1/AppData/Local/Temp/2/claude/409b0cc9221f9860/d4b3fc45-0895-4b25-8af0-e23ddd50123e/scratchpad/run-backend-list`
- APP = `C:/Users/ADMINI~1/AppData/Local/Temp/2/claude/409b0cc9221f9860/d4b3fc45-0895-4b25-8af0-e23ddd50123e/scratchpad/run-app-list`
- Python: `"/c/Users/Administrator/Downloads/engineer - Copy/engineers_backend/.venv/Scripts/python" -m pytest`

## Global Constraints

- No existing response field changes shape; everything is added. Admin / owner scoping of `/accounts/metrics` unchanged.
- Thresholds, verbatim from the Metrics tab: interviews per bid with 30+ bids, ×0.75 / ×1.25; pass rate with 5+
  decided, 15 points; tailor score with 5+ scored, 5 points. No arrow on bid volume (owners run different bidder counts).
- No other owner's names, ids or per-owner numbers anywhere.
- Live DB: never run a backend probe that writes; tests use mongomock only. No push, no merge.
- Older backend mid-deploy: no band, no arrows, Setup counts without ⚠.

## Review Focus

1. Range ending before the launch day: no band numbers, no arrows, no crash (`compare`/`mine` null) — pinned in Task 1
   (`test_range_before_launch_has_no_compare`) and Task 3 (`rowArrow` with null compare).
2. Benchmark and list windows differ (benchmark still loading, other range): arrows must not compare across windows —
   Task 3 `windowsMatch`.
3. Profile created mid-range: its compare counts only its own days — Task 1 `test_window_starts_at_launch_and_creation`.
4. Paginated list: strongest / weakest may be off the current page; names come from the metrics rows, not the page —
   Task 1 adds `name` to rows; Task 3 `strongestWeakest` uses it.
5. Older profiles (no units, or units saved before they had templates) must not get a false "no tailor draft" ⚠ —
   Task 2 `test_list_setup_units_for_older_profiles`; an older server without `setupUnits` — Task 3 `setupText`.
6. Whole-period presets (This month = to Nov 30) must not count future days — Task 1 first test (`days == 13`).

---

### Task 1: Fair compare numbers on the list's metrics (backend)

**Files:**
- Modify: `BACK/app/profile_compare.py` (add `all_time_start`, `pass_counts`)
- Modify: `BACK/app/profile_metrics.py:26-33` (`ProfileSpan` gains `name: str = ""`)
- Modify: `BACK/app/routers/accounts.py` (`list_profile_metrics`, `get_metrics_benchmark`)
- Test: `BACK/tests_unit/test_profiles_list_compare.py` (new; copy the `db`, `today`, `launch`, `_profile`, `_bids`,
  `_round` helpers from `tests_unit/test_profile_benchmark.py`, `_profile` taking an optional `created` datetime)

**Interfaces:**
- Produces: `async def all_time_start(today: date) -> date` = max(launch day, earliest active profile's created day,
  any owner); `today` when there are no active profiles. `def pass_counts(rounds: list[dict]) -> dict` =
  `{"decided", "passed", "passRate"}` of `profile_rounds` records, home assessments left out, `passRate` via
  `interview_rates.rate` (None with none decided).
- Produces (response): top-level `comparedFrom: str | None`, `comparedTo: str | None`, `mine: CompareStats | None`;
  per row `name: str`, `compare: CompareStats | None`, `rounds: {decided, passed, passRate}`.

- [ ] **Step 1: Write the failing tests** (list called as `list_profile_metrics(user, userId="", **kw)`; `_today`
  patched to 2026-11-13 as in the benchmark tests; profiles created 2026-01-05 unless said)

```python
async def test_rows_carry_compare_rounds_and_name(db, today):
    # Ana: A with 40 bids on Nov 3, an intro passed Nov 4 and one rejected Nov 5
    out = await _list(ana, **{"from_": "2026-11-01", "to": "2026-11-30"})   # whole month: window stops at today
    row = out["rows"][0]
    assert row["name"] == "A" and (out["comparedFrom"], out["comparedTo"]) == ("2026-11-01", "2026-11-13")
    assert row["compare"]["days"] == 13
    assert (row["compare"]["bids"], row["compare"]["decided"], row["compare"]["passRate"]) == (40, 2, 0.5)
    assert row["compare"]["interviewsPerBid"] == 0.05
    assert row["rounds"] == {"decided": 2, "passed": 1, "passRate": 0.5}

async def test_mine_pools_listed_profiles_and_drops_idle(db, today):
    # Bo: B with 60 bids + 1 passed round, C idle
    out = await _list(bo, **{"from_": "2026-11-01", "to": "2026-11-13"})
    assert (out["mine"]["profiles"], out["mine"]["bids"]) == (1, 60)
    idle = next(r for r in out["rows"] if r["name"] == "C")
    assert idle["compare"]["bids"] == 0          # a row keeps its own numbers even when idle

async def test_window_starts_at_launch_and_creation(db, today, monkeypatch):
    launch(monkeypatch, "2026-11-05")
    # Ana: N created 2026-11-08 15:00 UTC, 10 bids on Nov 9
    out = await _list(ana, **{"from_": "2026-11-01", "to": "2026-11-13"})
    assert out["comparedFrom"] == "2026-11-05"
    assert next(r for r in out["rows"] if r["name"] == "N")["compare"]["days"] == 6

async def test_range_before_launch_has_no_compare(db, today, monkeypatch):
    launch(monkeypatch, "2026-11-05")
    out = await _list(ana, **{"from_": "2026-10-01", "to": "2026-10-20"})
    assert out["comparedFrom"] is None and out["mine"] is None
    assert all(r["compare"] is None and "rounds" in r for r in out["rows"])

async def test_all_time_window_matches_the_benchmark(db, today, monkeypatch):
    launch(monkeypatch, "2026-11-05")
    out = await _list(ana, weeks="all")
    bench = await get_metrics_benchmark(ana, period="all", date="", to="")
    assert out["comparedFrom"] == bench["comparedFrom"] == "2026-11-05"
    assert out["comparedTo"] == bench["end"] == "2026-11-13"

async def test_admin_viewing_everyone_gets_no_compare(db, today):
    # admin = UserExtra(role="admin"); Ana's and Bo's profiles exist
    out = await _list(admin, **{"from_": "2026-11-01", "to": "2026-11-13"})
    assert out["mine"] is None and all(r["compare"] is None for r in out["rows"])
    picked = await _list(admin, userId=str(ana.id), **{"from_": "2026-11-01", "to": "2026-11-13"})
    assert picked["mine"] is not None
```

- [ ] **Step 2: Run, expect failure**

Run: `cd BACK && PY tests_unit/test_profiles_list_compare.py -q`
Expected: FAIL (KeyError `name` / `compare` / `comparedFrom`).

- [ ] **Step 3: Implement**

`get_metrics_benchmark` (period `all`) uses `all_time_start(_today())`, behaviour unchanged (its tests stay green).
In `list_profile_metrics`, after the rows: window from = `all_time_start(today)` on All time, else `start`;
`window = compared_window(from, min(end, today))` when from <= min(end, today); none for an admin with no `userId`.
With a window: `load_sources(accounts, *window)` (reuse the
range's sources when the request is a from / to range: load them once and pass them to `collect_range`) and
`profile_rounds(ids, *window)`; each row's `compare = pool([window_stats(...)], drop_idle=False)` exactly as
`get_profile_metrics` builds `compare.this`; `mine = pool(all those stats)`. Without a window: `compare` and `mine`
None. Every row: `name` from `ProfileSpan.name`, `rounds = pass_counts(profile_rounds(ids, start, end)[id])`
(one query for all rows; the row's own range, not the window).

- [ ] **Step 4: Run the new file, then the profile suites**

Run: `PY tests_unit/test_profiles_list_compare.py tests_unit/test_profile_benchmark.py tests_unit/test_profile_metrics_router.py tests_unit/test_profile_metrics_range.py tests_unit/test_profile_metrics_applied.py tests_unit/test_profile_bidder_breakdown.py tests_unit/test_profile_compare.py -q`
Expected: all pass. Existing exact-shape assertions that now see extra keys: update them to include the new keys
(ledger a ruling per file).

- [ ] **Step 5: Commit** — `feat(profiles list): fair compare numbers, pass counts and names on the list's metrics`

### Task 2: Setup units on the profiles list (backend)

**Files:**
- Modify: `BACK/app/routers/accounts.py` (`list_accounts`: computed from the `Account` rows before `populate_owner`)
- Test: `BACK/tests_unit/test_profiles_list_compare.py`

**Interfaces:**
- Produces: each profile of `GET /accounts` carries `setupUnits: [{id, name, roles, hasTemplate, hasPrompt}]` and
  `setupDefaultId`, from `prompts_view(acc)` (the Profile tab's view); `hasTemplate` / `hasPrompt` = non-blank
  `templateHtml` / `body`. `resumePrompts` unchanged.

- [ ] **Step 1: Failing tests**

```python
async def test_list_setup_units_follow_the_profile_tab(db, today):
    # Ana: P with units [{id "u1", body "Rewrite", templateHtml "<p>x</p>"}, {id "u2", body "  ", templateHtml ""}]
    out = await list_accounts(ana, page=1, limit=10, search="", userId="", status_="active", region="")
    p = out["accounts"][0]
    assert [(u["id"], u["hasTemplate"], u["hasPrompt"]) for u in p["setupUnits"]] == [("u1", True, True), ("u2", False, False)]
    assert all("body" not in u and "templateHtml" not in u for u in p["setupUnits"])

async def test_list_setup_units_for_older_profiles(db, today):
    # L: no resumePrompts, resumePromptBody "# Backend\nRewrite", styleTemplate "<p/>"
    # M: one unit with templateHtml None (saved before units had templates), styleTemplate "<p/>"
    out = await list_accounts(ana, page=1, limit=10, search="", userId="", status_="active", region="")
    by = {a["name"]: a for a in out["accounts"]}
    assert [(u["hasTemplate"], u["hasPrompt"]) for u in by["L"]["setupUnits"]] == [(True, True)]
    assert by["M"]["setupUnits"][0]["hasTemplate"] is True
```

- [ ] **Step 2: Run** `PY tests_unit/test_profiles_list_compare.py -q` → FAIL (KeyError `setupUnits`).
- [ ] **Step 3: Implement** in `list_accounts`.
- [ ] **Step 4: Run** the file plus `tests_unit/test_accounts_region_filter.py tests_unit/test_account_archive.py tests_unit/test_accounts_admin.py` → all pass. Then the whole suite to a log:
  `PY -q -p no:cacheprovider > .superpowers/full.log 2>&1; tail -5` → only the known 2 failures and 3 collection errors.
- [ ] **Step 5: Commit** — `feat(profiles list): setup units read the way the Profile tab reads them`

### Task 3: List helpers (website)

**Files:**
- Modify: `APP/tsconfig.app.json` (or whichever tsconfig sets `"moduleResolution": "Bundler"`): `"allowImportingTsExtensions": true`
- Modify: `APP/src/lib/profileAttention.ts` (extract verdicts; `attentionLines` uses them)
- Modify: `APP/src/lib/profileList.ts` (new helpers; value imports use `.ts` extensions so Node loads them)
- Modify: `APP/src/api/endpoints.ts` (types only)
- Test: `APP/tests/profileList.test.mjs`, `APP/tests/profileAttention.test.mjs` (must stay green unchanged)

**Interfaces:**
- Consumes: Task 1/2 response fields.
- Produces (endpoints.ts): `ProfileMetricsRow` gains optional `name?: string`, `compare?: CompareStats | null`,
  `rounds?: { decided: number; passed: number; passRate: number | null }`; `getProfileMetrics` result gains optional
  `comparedFrom?: string | null`, `comparedTo?: string | null`, `mine?: CompareStats | null`;
  `export type SetupUnit = { id: string; name: string; roles: PromptRole[]; hasTemplate: boolean; hasPrompt: boolean }`.
- Produces (profileAttention.ts): `export type Verdict = 'up' | 'down' | null`;
  `conversionVerdict(me: CompareStats, all: number): Verdict`, `passVerdict(me: CompareStats, all: number): Verdict`,
  `tailorVerdict(me: CompareStats, all: number): Verdict` (thresholds in Global Constraints).
- Produces (profileList.ts):
  - `type BandCell = { key: 'bids' | 'rate' | 'pass' | 'tailor'; label: string; mine: string; all: string; note: string | null; dir: Verdict }`
  - `bandCells(mine: CompareStats, all: CompareStats): BandCell[]` — labels `Bids / week per profile`,
    `Interviews per bid`, `Pass rate`, `Tailor score`; notes `N decided` / `N scored` (pass / tailor only); missing
    values `—`; `dir` null on bids.
  - `strongestWeakest(rows: Pick<ProfileMetricsRow, 'accountId' | 'name' | 'compare'>[]): { strongest: Pick; weakest: Pick } | null`
    where Pick = `{ accountId: string; name: string; interviewsPerBid: number }`; rows with compare, 30+ bids and a
    rate; null with fewer than 2 or when strongest and weakest rates are equal.
  - `windowsMatch(list: { comparedFrom?: string | null; comparedTo?: string | null }, bench: { comparedFrom: string | null; end: string } | undefined): boolean`
    — true only when both are set and `comparedFrom` and `comparedTo === bench.end` agree.
  - `rowArrow(kind: 'rate' | 'pass' | 'tailor', compare: CompareStats | null | undefined, all: CompareStats | null, comparedFrom: string): { dir: 'up' | 'down'; title: string } | null`
    — title `Since Nov 5: 0.62% vs 0.41% across all profiles` (pass: `Since Nov 5: 40% vs 35% across all profiles`;
    tailor: `Since Nov 5: tailor score 74 vs 73 across all profiles`).
  - `fmtListRate(x: number): string` — under 1%: two decimals (`0.62%`), else one (`1.1%`).
  - `setupText(acc: { resumes?: unknown[] | null; resumePrompts?: unknown[] | null; setupUnits?: SetupUnit[]; setupDefaultId?: string | null }): { text: string; warnings: string[] }`
    — `2 fixed · 3 units`, `1 fixed`, `1 unit`, `—`.

- [ ] **Step 1: Failing tests** in `tests/profileList.test.mjs` (keep the two `interviewsAppliedBy` tests):

```js
const stats = (o = {}) => ({ profiles: 1, days: 13, bids: 100, decided: 10, bidsPerWeek: 38, interviewsPerWeek: 1,
  tailoredResumesPerWeek: 5, interviewsPerBid: 0.0062, passRate: 0.4, tailorScore: { avg: 74, n: 120 },
  matchScore: { avg: null, n: 0 }, ...o });
const all = stats({ profiles: 50, bidsPerWeek: 45, interviewsPerBid: 0.0041, passRate: 0.35, tailorScore: { avg: 72.5, n: 900 } });

test('band cells', () => {
  assert.deepEqual(bandCells(stats(), all).map((c) => [c.mine, c.all, c.note, c.dir]), [
    ['38', '45', null, null], ['0.62%', '0.41%', null, 'up'], ['40%', '35%', '10 decided', null], ['74', '73', '120 scored', null]]);
  assert.equal(bandCells(stats({ passRate: null, decided: 0 }), all)[2].mine, '—');
});
test('strongest and weakest need two profiles with 30+ bids', () => {
  const r = (id, bids, ipb) => ({ accountId: id, name: id.toUpperCase(), compare: stats({ bids, interviewsPerBid: ipb }) });
  assert.deepEqual(strongestWeakest([r('a', 40, 0.011), r('b', 50, 0.001), r('c', 10, 0.5)]),
    { strongest: { accountId: 'a', name: 'A', interviewsPerBid: 0.011 }, weakest: { accountId: 'b', name: 'B', interviewsPerBid: 0.001 } });
  assert.equal(strongestWeakest([r('a', 40, 0.01), r('c', 10, 0.5)]), null);
  assert.equal(strongestWeakest([r('a', 40, 0.01), r('b', 40, 0.01)]), null);
});
test('row arrows follow the Metrics tab thresholds and need a compare', () => {
  assert.deepEqual(rowArrow('rate', stats(), all, '2026-11-05'), { dir: 'up', title: 'Since Nov 5: 0.62% vs 0.41% across all profiles' });
  assert.equal(rowArrow('rate', stats({ bids: 29 }), all, '2026-11-05'), null);
  assert.equal(rowArrow('pass', stats({ passRate: 0.2, decided: 5 }), all, '2026-11-05').dir, 'down');
  assert.equal(rowArrow('tailor', stats({ tailorScore: { avg: 77, n: 5 } }), all, '2026-11-05'), null); // 77 vs 73 (4 pts)
  assert.equal(rowArrow('rate', null, all, '2026-11-05'), null);
  assert.equal(rowArrow('rate', stats(), null, '2026-11-05'), null);
});
test('windows match only on the same compared window', () => {
  const w = { comparedFrom: '2026-11-05', comparedTo: '2026-11-13' };
  assert.equal(windowsMatch(w, { comparedFrom: '2026-11-05', end: '2026-11-13' }), true);
  assert.equal(windowsMatch(w, { comparedFrom: '2026-11-01', end: '2026-11-13' }), false);
  assert.equal(windowsMatch(w, { comparedFrom: '2026-11-05', end: '2026-11-30' }), false);
  assert.equal(windowsMatch({ comparedFrom: null, comparedTo: null }, { comparedFrom: null, end: '2026-10-20' }), false);
  assert.equal(windowsMatch({}, undefined), false);
});
test('setup text and warnings from setup units', () => {
  const u = (o) => ({ id: 'b', name: 'Backend', roles: ['backend'], hasTemplate: true, hasPrompt: true, ...o });
  assert.deepEqual(setupText({ resumes: [{}, {}], setupUnits: [u(), u({ id: 'q', name: 'QA', hasTemplate: false })], setupDefaultId: 'b' }),
    { text: '2 fixed · 2 units', warnings: ['"QA" unit has no tailor draft'] });
  assert.deepEqual(setupText({ resumes: [{}], setupUnits: [u({ hasTemplate: false, hasPrompt: false, roles: [] })], setupDefaultId: 'b' }), { text: '1 fixed', warnings: [] });
  assert.deepEqual(setupText({ resumes: [] }), { text: '—', warnings: [] });
  assert.deepEqual(setupText({ resumePrompts: [{ id: 'b' }, { id: 'c' }] }), { text: '2 units', warnings: [] }); // older server
});
```

- [ ] **Step 2: Run** `cd APP && npm test` → FAIL (exports missing).
- [ ] **Step 3: Implement.** Verdicts move out of `attentionLines` without changing its output. `setupText` maps
  `setupUnits` to units with `templateHtml: hasTemplate ? 'x' : ''`, `body: hasPrompt ? 'x' : ''` and reuses
  `setupStrip` / `tailoringSetUp` (import from `./profileSetup.ts`); without `setupUnits` (older server) the units
  count is `resumePrompts.length` and no warnings.
  `bandCells` / `rowArrow` judge against `all` only (no peers fallback).
- [ ] **Step 4: Run** `npm test && npm run lint` → all pass (profileAttention's 12 unchanged).
- [ ] **Step 5: Commit** — `feat(profiles list): band, arrow and setup helpers sharing the Metrics tab's thresholds`

### Task 4: Band, arrows, Pass rate and Setup on the page (website)

**Files:**
- Create: `APP/src/components/profiles/ProfilesBand.tsx`
- Modify: `APP/src/pages/Accounts.tsx`

**Interfaces:**
- Consumes: Task 3 helpers; `api.getMetricsBenchmark`.
- Produces: `ProfilesBand({ count, mine, all, rangeLabel, rangeFrom, comparedFrom, rows })`.

- [ ] **Step 1: Wire the benchmark** — SWR key `['metrics-benchmark', 'all' | from, to]` (null when archived or the
  range is invalid), All time → `{ period: 'all' }`, else `{ period: 'custom', date: from, to }`,
  `revalidateOnFocus: false`. A benchmark error hides band numbers and arrows only.
- [ ] **Step 2: Band** above `table-wrap`, when `!isAdmin || userId`, not archived, and the metrics carry `mine`:
  heading `Your N profiles with bids vs M across all owners · <range label>` (N = `mine.profiles`, M = the
  benchmark's `profiles`; admin with a user picked: `These N profiles with bids…`), ` (since Nov 5)` only when `comparedFrom` is after the range's first day (All time: always when set);
  four cells from `bandCells` with ▲/▼ in the Metrics tab's up/down colours; strongest / weakest line linking to
  `/accounts/<id>`. Windows not matching or `mine` null with a `comparedFrom` of null: one muted line
  `Nothing to compare before <launch day>` (launch day = the benchmark's `comparedFrom` on All time; else omit the
  date: `Nothing to compare in this range`).
- [ ] **Step 3: Columns** — after Intv/bid a sortable `Pass rate` (`SortKey` `'pass'`, value `rounds.passRate`):
  `40%` and under it `4 of 10 decided`, `—` with none decided. After Resume score a `Setup` column from `setupText`
  (⚠ with `title` = warnings joined by newlines). ▲/▼ after the Intv/bid, Pass rate and Resume score values from
  `rowArrow` (only when `windowsMatch`), `title` on the arrow. Archived rows: no arrows. `colSpan` 10 → 12.
- [ ] **Step 4: Verify** `npm test && npm run lint && npm run build` → pass; then serve on 3001 against the local
  backend (Slack off) and load `/accounts` read-only: band numbers equal the Metrics tab's for the same range.
- [ ] **Step 5: Commit** — `feat(profiles list): your profiles vs all profiles, pass rate and setup columns`
