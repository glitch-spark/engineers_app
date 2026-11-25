# Home: bidder bids split into approved / pending

**Size:** small change.

## Intent
Owner looks at Home and needs to know how many bids their bidders applied today (approved + pending) and how many
of those are already approved. Today Home shows one bidder number (approved + pending, rejected excluded) with no split.

## Goals
- Home "Bids" line shows bidder total plus approved / pending split.
- "Bids by location" table shows the same split per region.

## Non-goals
- Daily Plan, Slack post, Bidders page, week total: unchanged (can follow later).
- Self bids: untouched (separate `SELF_BIDS_TRACKED_FROM` topic).

## Anti-goals
- Target, progress bar and auto-tick must NOT change meaning: they keep counting approved + pending.
- Split must always add up to the bidder number shown next to it.

## Approaches
- **A. Server returns split (picked).** `plan_bidder.bids_by_day` already reads every approved + pending bid; also
  count by status. `_bids_tables` adds `bidderApproved` / `bidderPending` to `bidsTotals` and each `bidsByRegion`
  row. Home renders them. One source of truth, smallest diff.
- B. Home fetches split from Bidders page endpoint. Rejected: extra request, duplicates report-day + region logic,
  numbers can drift.
- Approved-only toward target. Rejected: user wants total applied visible.

## Design
- Backend (`engineers_backend`):
  - `bids_by_day` keeps its return shape for existing callers; a sibling (or optional flag) yields
    `(bidderId, day, status)` counts. `bidder_done_by_profile` callers unchanged.
  - `_bids_tables` (routers/daily_plans.py) gets per-profile approved/pending, adds
    `bidderApproved`, `bidderPending` to `bidsTotals` and to each region row. Only on `live` days (>= RELEASE_DAY);
    older days omit the fields.
  - Test: approved + pending sum equals `bidder` in totals and in every row.
- Frontend (`engineers_app`, `components/home/MyHome.tsx`):
  - Line: `bidder 107 / 200 (95 approved · 12 pending)`.
  - Table bidder cell: `107 (95 ✓ · 12 pending)`.
  - Fields optional in types; missing (older server / pre-release day) → plain number as today.
  - Bidder 0 → no split. Pending 0 → `(107 approved)` only (my call: zero parts add noise).

## Left to builder
- Exact markup/colors (approved green, pending muted, matching existing `UNDER` / tabular style).
