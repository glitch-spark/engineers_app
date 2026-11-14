# Bidders page: one page instead of Pay week + Performance tabs

Date: 2026-11-14. Branches `feat/bidders-insights` (website `run-app-list`, server `run-backend-list`), stacked on
the insights work (`2026-11-14-bidders-insights-design.md`).

## Why

Most users only use the first tab (Pay week), so the Performance tab's insights go unseen. The two tabs overlap
(both list every bidder with their bids), the Performance tab's top-3 cards and help panel add little, and the Pay
week tiles take a lot of room for four numbers. One page should show today's paying/reviewing work and how bidders
perform, without repeating itself.

## Goals

1. **No tabs.** One Bidders page: banners → period control → slim totals strip → comparison card → one table.
2. **A "week" is the pay week everywhere** (Sat 16:00 → Sat 16:00, the `BID_WEEKLY_REPORT_*` settings; days are the
   Bid Track report days, cutoff 18:30) — the user's decision.
3. **One request feeds the table** (approach A, the user's choice): `/bids/performance` learns pay weeks and carries
   the Pay week board's per-day cells, pay and "to review".
4. **Slim strip** replaces the four big tiles: `743 approved · $44.58 pay │ 18 to review [Review all] │ 2 rejected │
   Today 0 (18 pending)` — one line, each figure clickable where it was.
5. **The top-3 cards and the help panel go**; the card's "Top bidders" gains Longest streak and Most interviews; the
   help text moves to the column headers' info icons, and the dot legend to the "50+ days" header.
6. **The card can be collapsed** (remembered per browser).

## Non-goals

- The single-bidder view (`?bidder=`) stays as it is (it keeps using `/bids/week`).
- No change to how bids, streaks, hit days, interviews or pay are counted (streaks and 50+ days are per report day,
  so moving week boundaries doesn't change them).
- The review overlay is unchanged.

## Decided with the user

- One page, no tabs; merge the tables; remove the top-3 cards and the help panel, keeping their useful parts in the
  card; slim the tiles ("too big section with not much information").
- Week = pay week everywhere. Approach A (one request).

## Server

### `/bids/performance` (and `/bids/insights`, which shares the period parsing)

- `period=week`: the **pay week** holding `date` (default today): `start`/`end` = its first and last report day;
  `weeks` = one column per **report day** (`{start, end, partial: false}` with `start == end`), and the response
  gains `payWeek: {start, end, label, timezone, days: [{day, isToday, isFuture}]}` (as `/bids/week`'s `week`).
- `period=month` / `custom`: report days of the month / range as today; `weeks` = one column per **pay week**
  touching the range, clipped (`partial` when cut).
- `previous_range` for a week = the previous pay week.
- Rows gain, for every period: `status` (as `bidder_status`), `country`, `rate` (already), `pay` (already),
  `toReview` (= pending). In week mode rows also gain `days`: `[{day, approved, pending, rejected, source, error}]`
  exactly as `/bids/week` builds them (folder-counted days included), and `week` (its `{approved, pending, rejected,
  pay, toReview, source, error}`); the row's `weekly[i]` for a day column = that day's approved + pending.
- `totals` gains `toReview`, `rejected` (exists), `pay` (exists); in week mode `days` per day like `/bids/week`'s
  totals and `today` (the current day's `{approved, pending}`) when the pay week is the current one.
- `top` gains nothing; the card's tops (server `bidder_tops`) gain `streak` (longestStreak) and `interviews`
  (most interviews), mine and platform, same shapes and name-only rules.
- `/bids/week` keeps working unchanged (single-bidder view, review overlay).

## Website

- `Bidders.tsx`: drop `Tabs`/`VIEW_TABS`; `?view=performance` is ignored. Layout: header → banners (as now) →
  controls row (`[Pay week | Month | Custom]`, ◀ label ▶ for pay week / month, date inputs for custom; owner filter;
  Show archived) → strip → card (collapsible) → table. URL keeps `week` for the pay week; `period`, `date`, `to` for
  the others.
- **Strip** (`BiddersStrip`): one line from `totals`; "Review all" opens the review overlay for the pay week (week
  mode only); "Today" only for the current pay week; rejected red when > 0.
- **Card**: `BiddersBand` with a collapse toggle (localStorage `bidders.card.open`, default open); its Top bidders
  rows: Most bids, Best conversion, Lowest cost per interview, Longest streak, Most interviews.
- **Table** (`BiddersTable`, replacing `TeamWeekTable` on the list and the Performance table): one row per bidder:
  - Bidder: name (opens the bidder), profile · owner (admin) · `$0.06/bid`, status badge (invite / expired in red /
    archived), ⋯ actions (as the Pay week table: only for bidders the viewer manages).
  - Time columns: week mode = one per report day showing approved with an amber pending badge (folder days grey
    "not reviewed", as now; future days blank); month/custom = one per pay week (bids).
  - Bids (approved + pending, ↑/↓ % vs the previous period), Pay, To review (amber when > 0), 50+ days (hit rate,
    "N of M weekdays", dot strip ≤ 31 days, "streak N · best M"), Interviews (count; per 100 with the arrow vs the
    platform and "N of M bids"), Approval, Cost / interview, Last bid (amber when stale).
  - Avg / weekday moves to the 50+ days cell's hover text. All columns sortable as today.
  - Total row as today plus Pay and To review.
- Removed: the four top-3 cards, the help `<details>` panel, `SummaryTiles` on the list (kept for the single-bidder
  view), the Tabs.

## Testing

- Server: pay-week windows for `period=week` (start/end report days, day columns, `payWeek`, previous range), pay-week
  columns for a month (clipping, partial), rows' `days`/`week`/`status`/`toReview` matching `/bids/week` for the same
  pay week (folder-counted day included), totals `today`, the two new tops; existing performance / insights tests
  updated for pay weeks.
- Website: strip text and visibility rules, column building for week vs month, sort values, card collapse state
  helper, top lines for the new measures.

## Calls made after the builder check (mine, not the user's)

- **Money and review counts in week mode come from the pay-week window, not summed report days.** The pay week (Sat
  16:00 → Sat 16:00) and the report days (ending 18:30) don't line up by 2½ hours on Saturday. In week mode the strip,
  each row's Approved / Pay / To review / Bids and the Total row use `/bids/week`'s `week` block (the same numbers as
  today's tiles, the weekly Slack report and actual pay, and what "Review all" walks), and they fall back to folder
  counts before `BID_RECORDS_START` as today. The performance measures (50+ days, streaks, interviews, per 100,
  approval, cost) stay on report days. Month / custom use report days throughout (no pay-week window to match).
- **"Today" is the open report day** (the report day of now: after 18:30 it is tomorrow's), for every period of
  `/bids/performance`, `/bids/insights` and `/bids/alerts`, so evening bids show in the day cells and in the totals
  alike. The default pay week is the one holding *now* (as `/bids/week`), not local noon; between Sat 16:00 and the
  first report day of the new week the week view shows its empty days and no performance stats yet.

## Left to the builder

Tailwind classes; exact header help texts (reuse today's); how the server reuses `week_board` internals; component
file split.
