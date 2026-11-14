# Profiles Top Profiles, Flags and Archive Suggestions Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The Profiles page shows each region's top profiles of the owner against all users' best numbers, a red banner (and red rows) for profiles with no interviews in 14 days with one suggested action each, and a grey archive suggestion for profiles with no applies in 21 days.

**Architecture:** The server decides everything (approach A): `GET /accounts/metrics` gains `alerts` and `regionTops` for one owner's list; the cached benchmark gains all users' `regionTops` (numbers only). The website picks the suggestion text from the alert's numbers plus the Setup warnings it already computes, and renders.

**Tech Stack:** FastAPI, Beanie/Motor, pytest + mongomock-motor (`tests_unit`); React 18, TypeScript, SWR, Tailwind; `node --test` (`npm test`).

**Spec:** `docs/superpowers/specs/2026-11-14-profiles-flags-and-top-design.md` (website repo).

**Worktrees:** server `scratchpad/run-backend-list`, website `scratchpad/run-app-list`, both on `feat/profiles-flags-top`.
Server tests: `"/c/Users/Administrator/Downloads/engineer - Copy/engineers_backend/.venv/Scripts/python" -m pytest <files> -q -p no:cacheprovider`. Website: `npm test`, `npx tsc --noEmit -p .`, `npm run build`.

## Global Constraints

- Never return another owner's profile names or ids: all users' `regionTops` are numbers only.
- Today = `accounts._today()`; last 2 weeks = `[today − 13, today]`; last 3 weeks = `[today − 20, today]`; both ignore the date filter.
- Interviews = held rounds (`selfInterviews + callerInterviews`); applies = self + bidder bids.
- Too new: created after `today − 13` → never red; created after `today − 20` → never grey. A grey profile is never red.
- Regions shown: `US`, `EU`, `Latam` (label "LATAM"); others / none ignored; a region appears only when the owner has an active profile there.
- `bestRate` needs ≥ 30 bids (`MIN_BIDS`); ties → more bids, then name. `mostInterviews` needs ≥ 1; ties → better rate, then name.
- Admin viewing every owner: no `alerts`, no `regionTops`. No banners on the Archived filter or when metrics failed.
- `allTailorScore` never blocks the list: cached value or `null` (and a background warm-up).
- Copy: red heading "⛔ N profile(s) got no interviews in the last 2 weeks"; tag "No interviews in 14 days"; grey "N profile(s) had no applies in the last 3 weeks. Archive them to keep the list focused."; confirm "Archive <name>? It leaves the active list and Generate; you can unarchive it any time."; suggestion texts exactly as in the spec's rules 1–5.
- More than 8 red lines → first 8 by bids + "Show all N".

## Review Focus

- A profile with region `null` or `Canada` → absent from region tops, no error (Task 1 test).
- Cold benchmark cache → list returns `allTailorScore: null` at once and a warm-up starts (Task 2 test).
- Boundary days: an interview on `today − 13` clears the red flag; a bid on `today − 20` clears the grey one (Task 2 test).
- Owner whose profiles are all too new → `noInterviews: []`, `noApplies: []` (Task 2 test).
- A flagged profile not on the table's current page → its banner line still renders; rule 2 skipped (Task 3 test: `flagSuggestion` with `[]` warnings).

---

### Task 1: Server — region tops (owner's list and all users' benchmark)

**Files:**
- Modify: `app/profile_metrics.py` (`ProfileSpan` + `region: Optional[str] = None`)
- Modify: `app/profile_compare.py` (`region_tops`, `benchmark`)
- Modify: `app/routers/accounts.py` (`_add_compare` sets `out["regionTops"]`)
- Create: `tests_unit/test_profiles_region_tops.py`; modify exact-shape sets in `tests_unit/test_profile_metrics_router.py`, `tests_unit/test_profile_benchmark.py` if they pin keys.

**Interfaces:**
- Produces: `REGIONS = ("US", "EU", "Latam")`; `region_tops(pairs: list[tuple[ProfileSpan, Optional[dict]]]) -> dict[str, dict]` where each value is `{"mostInterviews": {"accountId", "name", "interviews"} | None, "bestRate": {"accountId", "name", "interviewsPerBid", "bids"} | None}` and `pairs` carry `window_stats` dicts (None = created after the window). List response `regionTops` (same shape; only when `compared`, else `None`). Benchmark dict gains `regionTops: {region: {"mostInterviews": int | None, "bestRate": float | None}}` (always present, `{}` with no profiles).

- [ ] **Step 1: Write the failing tests** (fixtures: copy the db/today/launch setup and bid/interview helpers from `tests_unit/test_profiles_list_compare.py`)

```python
async def test_region_tops_pick_most_interviews_and_best_rate(db, today):
    # owner: US "A" 40 bids 2 interviews, US "B" 100 bids 3 interviews, US "C" 10 bids 1 interview,
    # EU "E" 50 bids 0 interviews, "N" region None 60 bids 5 interviews, "K" region "Canada" 60 bids 5 interviews
    out = await _list(owner, from_="2026-11-01", to="2026-11-30")
    us = out["regionTops"]["US"]
    assert us["mostInterviews"] == {"accountId": str(b.id), "name": "B", "interviews": 3}
    assert us["bestRate"] == {"accountId": str(a.id), "name": "A", "interviewsPerBid": 0.05, "bids": 40}  # C: <30 bids
    assert out["regionTops"]["EU"] == {"mostInterviews": None, "bestRate": {"accountId": str(e.id), "name": "E",
                                                                          "interviewsPerBid": 0.0, "bids": 50}}
    assert set(out["regionTops"]) == {"US", "EU"}          # no Latam profile; None / Canada ignored

async def test_region_top_ties(db, today):
    # US "X" 40 bids 2 interviews, US "Y" 80 bids 2 interviews, US "Z" 80 bids 4 interviews -> Z and X/Y rate tie 0.05
    ...
    assert us["mostInterviews"]["name"] == "Z"
    assert us["bestRate"]["name"] == "Y"                  # same 0.05 as X, more bids

async def test_benchmark_region_tops_are_numbers_only(db, today):
    # two owners' US profiles: 9 interviews / 300 bids and 3 / 100; an EU profile with 20 bids
    bench = await benchmark((date(2026, 11, 1), date(2026, 11, 14)))
    assert bench["regionTops"] == {"US": {"mostInterviews": 9, "bestRate": 0.03}, "EU": {"mostInterviews": None, "bestRate": None}}

async def test_admin_everyone_gets_no_region_tops(db, today):
    assert (await _list(admin, from_="2026-11-01", to="2026-11-30"))["regionTops"] is None
```

- [ ] **Step 2: Run** `pytest tests_unit/test_profiles_region_tops.py` — Expected: FAIL (`KeyError: 'regionTops'`).
- [ ] **Step 3: Implement** `region_tops` (rate = `interviews / bids`, rounded like `pool`'s `interviewsPerBid`), `ProfileSpan.region`, `benchmark` adding the numbers-only form, `_add_compare` setting `out["regionTops"] = region_tops([(a, stats[str(a.id)]) for a in accounts])` when compared, else `None`.
- [ ] **Step 4: Run** the new file plus `test_profile_metrics_router.py test_profile_benchmark.py test_profiles_list_compare.py` — Expected: PASS (update exact-shape key sets for `regionTops`).
- [ ] **Step 5: Commit** `feat(profiles list): top profiles per region and all users' best per region`.

### Task 2: Server — alerts (no interviews in 14 days, no applies in 21) and non-blocking benchmark peek

**Files:**
- Modify: `app/profile_compare.py` (`BenchmarkCache.peek`)
- Create: `app/profile_alerts.py`
- Modify: `app/routers/accounts.py` (`list_profile_metrics` sets `out["alerts"]`)
- Create: `tests_unit/test_profile_alerts.py`; add a `peek` test to `tests_unit/test_profile_benchmark.py`.

**Interfaces:**
- Consumes: `ProfileSpan.region` / `name` (Task 1), `load_sources`, `days_from`, `window_stats`, `created_day`, `pool`.
- Produces: `BenchmarkCache.peek(window) -> Optional[dict]` (usable entry → value, refreshing when stale as `get` does; missing → `None` and starts one background compute via `_refresh` unless one runs). `async def profile_alerts(accounts: list[ProfileSpan], today: date) -> dict` returning `{"asOf": iso, "noInterviews": [{"accountId", "name", "bids", "tailored", "tailorScore": {"avg", "n"}}] (most bids first), "allTailorScore": float | None, "noApplies": [{"accountId", "name"}] (by name, case-insensitive)}`. List response `alerts` only when one owner (same condition as `compare`), else `None`.

- [ ] **Step 1: Write the failing tests** (today = 2026-11-14)

```python
async def test_profile_with_no_interviews_in_14_days_is_red(db, today):
    # "V": created Oct 1, 379 bids Nov 1-14, interview on Oct 30 only  -> red
    # "D": created Oct 1, bids, interview on Nov 1 (= today - 13)       -> not red (boundary)
    al = (await _list(owner, from_="2026-11-01", to="2026-11-30"))["alerts"]
    assert [x["name"] for x in al["noInterviews"]] == ["V"]
    assert al["noInterviews"][0]["bids"] == 379 and al["asOf"] == "2026-11-14"

async def test_no_applies_in_21_days_is_grey_not_red(db, today):
    # "T": created Oct 1, last bid Oct 23 (today - 22), no interviews -> grey only
    # "U": created Oct 1, last bid Oct 24 (= today - 20), no interviews -> red, not grey (boundary)
    assert [x["name"] for x in al["noApplies"]] == ["T"]
    assert [x["name"] for x in al["noInterviews"]] == ["U"]

async def test_too_new_profiles_are_never_flagged(db, today):
    # "New14": created Nov 2 (after today - 13), no bids -> neither
    # "New21": created Oct 25 (old enough for red, too new for grey), no bids -> red only
    assert [x["name"] for x in al["noInterviews"]] == ["New21"] and al["noApplies"] == []

async def test_owner_with_only_new_profiles_gets_empty_alerts(db, today):
    # one profile created Nov 10
    assert al["noInterviews"] == [] and al["noApplies"] == []

async def test_all_tailor_score_comes_from_the_cache_or_is_null(db, today, monkeypatch):
    al = (await _list(owner, from_="2026-11-01", to="2026-11-30"))["alerts"]
    assert al["allTailorScore"] is None                              # cold: never waits
    await benchmark_cache.wait_refreshes()
    al = (await _list(owner, from_="2026-11-01", to="2026-11-30"))["alerts"]
    assert al["allTailorScore"] == pytest.approx(<pooled avg of the fixture's 14-day tailor scores>)

async def test_admin_everyone_gets_no_alerts(db, today):
    assert (await _list(admin, from_="2026-11-01", to="2026-11-30"))["alerts"] is None

# test_profile_benchmark.py
async def test_peek_returns_none_and_warms_the_window():
    calls = []; cache = BenchmarkCache(lambda w: _compute(calls, w))
    assert cache.peek(W) is None
    await cache.wait_refreshes()
    assert cache.peek(W) == {"w": W} and calls == [W]                # computed once, in the background
```

(Clear `benchmark_cache` between tests, as `test_profiles_list_compare.py` does.)

- [ ] **Step 2: Run** `pytest tests_unit/test_profile_alerts.py tests_unit/test_profile_benchmark.py` — Expected: FAIL (`KeyError: 'alerts'`, `AttributeError: peek`).
- [ ] **Step 3: Implement** `peek`; `profile_alerts` with one `load_sources(accounts, today − 20, today)`, `window_stats` per window (rounds `[]`; interviews come from the daily counts); `allTailorScore = (benchmark_cache.peek((today − 13, today)) or {}).get("tailorScore", {}).get("avg")`; call it in `list_profile_metrics` when one owner and accounts exist (`{"asOf", [] , None, []}` shape with no accounts).
- [ ] **Step 4: Run** the two files plus `test_profile_metrics_router.py test_profiles_list_compare.py test_profiles_region_tops.py` — Expected: PASS (exact-shape sets gain `alerts`).
- [ ] **Step 5: Run** the whole suite `pytest tests_unit -q -p no:cacheprovider --continue-on-collection-errors` — Expected: only the known pre-existing failures (bidder_ext upload 503, resume_prompts bad lists, 3 collection errors).
- [ ] **Step 6: Commit** `feat(profiles list): flag profiles with no interviews in 14 days and no applies in 21`.

### Task 3: Website — types and helpers

**Files:**
- Modify: `src/api/endpoints.ts`, `src/lib/profileList.ts`, `tests/profileList.test.mjs`

**Interfaces:**
- Consumes: server shapes from Tasks 1–2.
- Produces: types `RegionTop`, `RegionTops = Partial<Record<'US' | 'EU' | 'Latam', RegionTop>>`, `BenchRegionTops`, `ProfileAlert`, `ProfileAlerts`; `getProfileMetrics` result `alerts?: ProfileAlerts | null; regionTops?: RegionTops | null`; `MetricsBenchmark.regionTops?`.
  `flagSuggestion(alert: ProfileAlert, allTailorScore: number | null, setupWarnings: string[]): string`;
  `flagNumbers(alert: ProfileAlert, allTailorScore: number | null): string`;
  `regionTopLines(mine: RegionTops, all: BenchRegionTops | undefined): { region: string; label: string; most: {accountId, name, text} | null; mostAll: string; best: {accountId, name, text} | null; bestAll: string }[]` (order US, EU, LATAM; `mostAll`/`bestAll` = `"best across all users: 9"`, `"best across all users"` when equal, `""` when unknown).
  Remove `strongestWeakest` and its test.

- [ ] **Step 1: Write the failing tests**

```js
const al = (o = {}) => ({ accountId: 'v', name: 'Vyas', bids: 379, tailored: 120, tailorScore: { avg: 64, n: 118 }, ...o });
test('flag suggestion: first matching rule', () => {
  assert.equal(flagSuggestion(al({ bids: 12 }), 71, ['x']), 'Too few bids to get interviews: add bids or a bidder.');
  assert.equal(flagSuggestion(al(), 71, ['"QA" unit has no tailor draft']), 'Fix the setup: "QA" unit has no tailor draft.');
  assert.equal(flagSuggestion(al({ tailored: 0, tailorScore: { avg: null, n: 0 } }), 71, []), 'Set up tailoring so resumes match each job.');
  assert.equal(flagSuggestion(al({ tailorScore: { avg: 66, n: 9 } }), 71.2, []),
    "Resume score 66 is below all users' average 71: update the tailoring prompt or template.");
  assert.equal(flagSuggestion(al({ tailorScore: { avg: 67, n: 9 } }), 71.2, []),
    "Bids aren't turning into interviews: update the resume and check the target roles.");      // 4.2 pts: not rule 4
  assert.equal(flagSuggestion(al({ tailorScore: { avg: 50, n: 9 } }), null, []),
    "Bids aren't turning into interviews: update the resume and check the target roles.");      // no average: rule 5
});
test('flag numbers line', () => {
  assert.equal(flagNumbers(al(), 71.2), "379 bids · resume score 64 (all users' avg 71)");
  assert.equal(flagNumbers(al({ tailored: 0, tailorScore: { avg: null, n: 0 } }), 71), '379 bids · no tailored resumes');
  assert.equal(flagNumbers(al({ bids: 1 }), null), '1 bid · resume score 64');
});
test('region lines', () => {
  const mine = { US: { mostInterviews: { accountId: 'e', name: 'Erric', interviews: 3 },
                       bestRate: { accountId: 'd', name: 'Daniel Kifle', interviewsPerBid: 0.004, bids: 363 } },
                 Latam: { mostInterviews: null, bestRate: null } };
  const lines = regionTopLines(mine, { US: { mostInterviews: 9, bestRate: 0.012 }, Latam: { mostInterviews: 2, bestRate: null } });
  assert.deepEqual(lines.map((l) => [l.label, l.most?.text ?? null, l.mostAll, l.best?.text ?? null, l.bestAll]), [
    ['US', '3', 'best across all users: 9', '0.40%', 'best across all users: 1.2%'],
    ['LATAM', null, 'best across all users: 2', null, ''],
  ]);
  assert.equal(regionTopLines({ US: { ...mine.US } }, { US: { mostInterviews: 3, bestRate: 0.004 } })[0].mostAll, 'best across all users');
});
```

- [ ] **Step 2: Run** `npm test` — Expected: FAIL (missing exports).
- [ ] **Step 3: Implement** the types and helpers (`count`, `fmtListRate`, `score` already in the file; rule 4 compares rounded-to-one-decimal values: `avg <= all − 5`).
- [ ] **Step 4: Run** `npm test` and `npx tsc --noEmit -p .` — Expected: PASS, exit 0.
- [ ] **Step 5: Commit** `feat(profiles list): helpers for region tops and flag suggestions`.

### Task 4: Website — card block, banners, red rows, archive with confirmation

**Files:**
- Create: `src/components/profiles/ProfileAlerts.tsx`
- Modify: `src/components/profiles/ProfilesBand.tsx`, `src/pages/Accounts.tsx`

**Interfaces:**
- Consumes: Task 3 helpers and types; `setupText(acc)`; existing `setArchived(acc, true)`, `ConfirmDialog`, `mutate()`.
- Produces: `ProfileAlerts({ alerts, accountsById, onArchive })` default export (red `role="alert"` block + grey block; >8 red lines → first 8 + "Show all N" button); `ProfilesBand` prop `regionTops`/`benchTops` replacing the strongest/weakest line.

- [ ] **Step 1: Implement** `ProfilesBand` "Top profiles" block (one line per `regionTopLines` entry, names link to `/accounts/<id>`, "—" for missing sides) in place of the strongest/weakest paragraph.
- [ ] **Step 2: Implement** `ProfileAlerts` (red light/dark: `border-red-300 bg-red-50 text-red-900 dark:border-red-800 dark:bg-red-950/40 dark:text-red-100`; grey: `panel` + `text-muted`), each red line: name (link), `flagNumbers`, `flagSuggestion(alert, allTailorScore, setupText(acc).warnings or [] when the account isn't on the page)`, "Open profile" link; grey line: name + "Archive" button.
- [ ] **Step 3: Wire `Accounts.tsx`:** render `<ProfileAlerts>` first inside the page body (above `{band}`) when `metricsData?.alerts` and not archived filter / not `metricsError`; archive → `ConfirmDialog` with the spec copy → `setArchived(acc, true)` then `mutate()` and revalidate the metrics key; rows whose id is in `alerts.noInterviews` get `bg-red-50 dark:bg-red-950/30` and, in the Interviews cell, a tag `<span className="ml-1 rounded bg-red-100 px-1 text-[10px] text-red-700 dark:bg-red-900/50 dark:text-red-200">No interviews in 14 days</span>`. A grey-banner profile not on the page is archived through `api.updateAccount(id, { archived: true })` with the same confirm.
- [ ] **Step 4: Run** `npm test`, `npx tsc --noEmit -p .`, `npm run build` — Expected: pass, exit 0, built.
- [ ] **Step 5: Commit** `feat(profiles list): top profiles per region, no-interview banner and archive suggestions`.
