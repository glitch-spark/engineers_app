# Home bidder approved / pending split Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Home's bidder bids show total applied (approved + pending) with the approved / pending split, in the Bids line and the by-location table.

**Architecture:** Backend counts the day's bidder bids per profile per status (one query, as today) and adds `bidderApproved` / `bidderPending` to `bidsTotals` and each `bidsByRegion` row on live days. Frontend renders the split when the fields are present.

**Tech Stack:** FastAPI + Beanie + pytest (mongomock-motor) in `engineers_backend`; React + TS + Vitest in `engineers_app`.

**Spec:** `engineers_app/docs/superpowers/specs/2026-11-24-home-bidder-pending-split-design.md`

## Global Constraints

- `bidder` / `total` / `target` / progress bar / auto-tick keep counting approved + pending (rejected excluded). Unchanged.
- `bidderApproved + bidderPending == bidder` in totals and in every region row.
- Split fields only when `live` (day >= `plan_bidder.RELEASE_DAY`); otherwise omitted (keys absent).
- Frontend: fields optional; missing → plain number exactly as today. Bidder 0 → no split. Pending 0 → approved part only.
- Copy: line `bidder 107 / 200 (95 approved · 12 pending)`; table cell `107 (95 ✓ · 12 pending)`.
- Branch `feat/home-bidder-pending-split` in both main checkouts (no worktrees). Commit messages single line, no Co-Authored-By. No push without user OK.

## Review Focus

- Bidder on no profile (`profileId None`): counted in totals split, in no region row — totals split must still sum to `bidder`. (Task 1 test.)
- Rejected bid on the day: in neither approved nor pending. (Task 1 test.)
- Pre-release day: totals and rows have no split keys; existing equality asserts stay valid. (Task 1 test.)
- Older server (no split fields) on Home: line and table render exactly as before. (Task 2: existing tests unchanged + assertion.)
- All pending, 0 approved: `(0 approved · 5 pending)` — keep both parts. (Task 2 test.)

---

### Task 1: Backend — split in `bidsTotals` / `bidsByRegion`

**Files:**
- Modify: `engineers_backend/app/plan_bidder.py` (`bids_by_day`, `bidder_done_by_profile`, new `bidder_split_by_profile`)
- Modify: `engineers_backend/app/routers/daily_plans.py:197-235` (`_view`, `_bids_tables`)
- Test: `engineers_backend/tests_unit/test_admin_home.py`

**Interfaces:**
- Produces: `bids_by_day(bidder_ids, start, end, with_status: bool = False) -> Counter` — keys `(bidderId, day)`, or `(bidderId, day, status)` when `with_status`. Existing callers (`bidder_alerts`) unchanged.
- Produces: `bidder_split_by_profile(owner_id, day: date) -> dict[profileId | None, Counter]` — each Counter has keys `"approved"`, `"pending"`.
- `bidder_done_by_profile` keeps its signature; returns `Counter({pid: approved + pending})` built from `bidder_split_by_profile`.
- Produces: `_bids_tables(out: dict, split: dict, live: bool = True) -> dict` — `split` replaces `bidder_by_profile`; per-profile total = `approved + pending`. When `live`: each row gains `"bidderApproved"`, `"bidderPending"`; `bidsTotals` gains same keys (sums over all profiles incl. `None`).
- `_view` calls `bidder_split_by_profile` once, derives the bidder total for `_day_out` from it.
- API (consumed by Task 2): `bidsTotals.bidderApproved?`, `bidsTotals.bidderPending?`, `bidsByRegion[].bidderApproved?`, `bidsByRegion[].bidderPending?` (ints).

- [ ] **Step 1: Write failing test** in `test_admin_home.py`. Add `status="approved"` param to the `bids()` helper. New test:

```python
async def test_bids_split_approved_and_pending_on_live_days(me, monkeypatch):
    monkeypatch.setattr(plan_bidder, "RELEASE_DAY", MON)
    us = await profile(me, "Usa")
    on_us, free = await bidder(me, "Uma", us), await bidder(me, "Fay")
    await bids(on_us, TUE, 3)
    await bids(on_us, TUE, 2, status="pending")
    await bids(on_us, TUE, 4, status="rejected")
    await bids(free, TUE, 1, status="pending")      # no profile: totals only
    out = await get_day(TUE.isoformat(), me, None)
    assert out["bidsByRegion"][0] == {"region": "US", "self": 0, "selfTarget": None, "bidder": 5,
                                      "bidderApproved": 3, "bidderPending": 2, "total": 5}
    t = out["bidsTotals"]
    assert (t["bidder"], t["bidderApproved"], t["bidderPending"]) == (6, 3, 3)
    monkeypatch.setattr(plan_bidder, "RELEASE_DAY", date(2026, 12, 1))   # pre-release: no split keys
    out = await get_day(TUE.isoformat(), me, None)
    assert "bidderApproved" not in out["bidsTotals"] and "bidderApproved" not in out["bidsByRegion"][0]
```

- [ ] **Step 2: Run, expect FAIL** (`KeyError`/assert on `bidderApproved`)

Run: `cd engineers_backend && .venv/bin/pytest tests_unit/test_admin_home.py -k split -q`

- [ ] **Step 3: Implement** the Interfaces above. In `bids_by_day` add `"status": 1` to the projection only when `with_status`.

- [ ] **Step 4: Update** the existing live-day assert at `test_admin_home.py:316` to include `"bidderApproved": 7, "bidderPending": 0`.

- [ ] **Step 5: Run backend tests, expect PASS**

Run: `.venv/bin/pytest tests_unit/test_admin_home.py tests_unit/test_plan_bidder.py tests_unit/test_daily_plan_by_profile.py -q`

- [ ] **Step 6: Commit** (branch `feat/home-bidder-pending-split` off `dev`)

`git commit -m "feat(daily-plans): split day bidder bids into approved and pending"`

### Task 2: Frontend — render split on Home

**Files:**
- Modify: `engineers_app/src/api/endpoints.ts:624-629` (types)
- Modify: `engineers_app/src/components/home/MyHome.tsx:~250` (Bids line) and `:~285` (table bidder cell)
- Test: `engineers_app/src/components/home/MyHome.test.tsx`

**Interfaces:**
- Consumes: Task 1 API fields.
- Produces: `bidderSplit(approved?: number, pending?: number, label: 'approved' | '✓'): string` in `MyHome.tsx` — `''` when either undefined or `approved + pending === 0`; `' (95 approved · 12 pending)'`; pending 0 → `' (107 approved)'`.

- [ ] **Step 1: Write failing tests** in `MyHome.test.tsx`:

```ts
it('Bids show the bidder split into approved and pending', async () => {
  setup(plan({ bidsTotals: { self: 0, selfTarget: 200, bidder: 107, bidderApproved: 95, bidderPending: 12, bidderTarget: 200, total: 107, target: 400 },
               bidsByRegion: [{ region: 'US', self: 0, selfTarget: null, bidder: 107, bidderApproved: 95, bidderPending: 12, total: 107 }] }));
  expect((await rowOf('Bids')).textContent).toContain('bidder 107 / 200 (95 approved · 12 pending)');
  const table = within(await daily()).getByRole('table', { name: 'Bids by location' });
  expect(within(table).getAllByRole('row')[1].children[2].textContent).toBe('107 (95 ✓ · 12 pending)');
});

it('Bids split: nothing pending shows approved only; all pending keeps both', async () => {
  setup(plan({ bidsTotals: { self: 0, selfTarget: null, bidder: 9, bidderApproved: 9, bidderPending: 0, bidderTarget: null, total: 9, target: null } }));
  expect((await rowOf('Bids')).textContent).toContain('bidder 9 (9 approved)');
  cleanup();
  setup(plan({ bidsTotals: { self: 0, selfTarget: null, bidder: 5, bidderApproved: 0, bidderPending: 5, bidderTarget: null, total: 5, target: null } }));
  expect((await rowOf('Bids')).textContent).toContain('bidder 5 (0 approved · 5 pending)');
});
```

Existing tests (`'145 of 150 · self 60 / 50 · bidder 85'`, table rows `['US', '60 / 50', '85', '145']`) stay unchanged = older-server coverage; add `expect(...).not.toContain('approved')` to the `bidsTotals` one.

- [ ] **Step 2: Run, expect FAIL**

Run: `cd engineers_app && npx vitest run src/components/home/MyHome.test.tsx`

- [ ] **Step 3: Implement** types (optional fields) + `bidderSplit` + render after the bidder target in the line, after `num(r.bidder)` in the table cell.

- [ ] **Step 4: Run, expect PASS** — same command, plus `npx tsc --noEmit`.

- [ ] **Step 5: Commit** (branch `feat/home-bidder-pending-split` off `main`; include spec + plan docs)

`git commit -m "feat(home): show bidder bids split into approved and pending"`
