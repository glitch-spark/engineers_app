# Profiles list: how my profiles do against all profiles

Date: 2026-11-14 · branches `feat/profiles-list-compare` in engineers_app (from `feat/profile-metrics-ux` with
`feat/profile-tab-ux` merged in) and engineers_backend (from `feat/profile-metrics-ux`).

## Why

After the Profile page's Metrics and Profile tabs, the Profiles list should answer for an owner, at a glance: **how
are my profiles doing overall, compared with other users' profiles** (user), and which of mine are strong, weak or
not set up. The comparison is with the **all-profiles average, never a ranking of users** (user picked A).

## Goals, non-goals, anti-goals

- Goals: a summary band "your profiles vs all profiles" for the picked date range; per-row ▲/▼ where a profile
  clearly beats or trails all profiles; a Pass rate column; a Setup column that flags units Job Applies can't use well.
- Non-goals: other owners' names, counts per owner or any leaderboard; changes to the Metrics or Profile tabs;
  sorting by Setup; the archived-profiles view (metrics stay active-only, as today).
- Anti-goals: a list number that disagrees with the Metrics tab for the same profile and days; verdicts on noise
  (a handful of bids or rounds); a slower list for owners (the all-profiles numbers come from the existing cache).

## Approaches (user picked 2)

1. Website only, from today's row numbers: rejected; the rows don't use the fair rules (launch day, creation day,
   idle profiles out), so arrows would disagree with the Metrics tab.
2. **The list's metrics request also returns the fair compare numbers; the band reuses the cached all-profiles
   benchmark; Setup comes from small additions to the profiles list response** — picked.
3. A separate summary request: one more call per list load for numbers the metrics request already has to load.

## Backend

`GET /accounts/metrics` (same filters and access as today) adds, without changing any existing field:

- `comparedFrom` / `comparedTo`: the compared window, or both null when the range ends before the launch day. The
  window ends at min(range end, today), as the benchmark and the Metrics tab do (the list's presets send whole
  periods, e.g. This month to Nov 30; counting future days would lower per-week values and miss the cache).
- An admin viewing every owner (no user picked) gets no `compare` and no `mine`: that would be the benchmark's work
  on every list load, uncached (my call; pick a user to see arrows).
- Each row: `compare`: this profile's CompareStats over the compared window (`pool([...], drop_idle=False)`), null
  when there's no window or the profile was created after it. And `rounds`: `{decided, passed, passRate}` over the
  row's own range (home assessments left out, as the Metrics tab's pass rate).
- `mine`: CompareStats of all the listed profiles together over the window (idle ones out of the averages, as
  everywhere), null without a window.
- All time: the window is `[all-time start, today]`, where all-time start = max(launch day, earliest active profile
  of any owner) — the same rule the benchmark uses, moved into one shared helper so the list and the benchmark always
  ask the cache for the same window.

- Each row also gets `name` (the band names strongest / weakest even when they're on another page).

`GET /accounts` (the list): each profile gains `setupUnits: [{id, name, roles, hasTemplate, hasPrompt}]` and
`setupDefaultId`, read through `prompts_view` exactly as the Profile tab gets them (so a unit saved before units had
templates uses the profile's template, and an older profile reads as one unit). `resumePrompts` stays as it is; the
HTML and prompt text stay out of the response.

## Website

```
Your 9 profiles with bids vs 50 across all owners · This month (since Nov 5)
  Bids / week per profile   Interviews per bid    Pass rate          Tailor score
  38   vs 45                0.62% ▲ vs 0.41%      40% vs 35%         74 vs 72.5
                                                  (10 decided)       (120 scored)
  Strongest: Erric 1.1% interviews per bid · Weakest: Oleksii Savenkov 0.1%

Name   Region  Applies  Bids  Interviews  Intv/bid   Pass rate     Resume score  Setup                Owner ...
Erric  …       …        …     …           1.1% ▲     40% · 4 of 10  74 ▼          2 fixed              …
Oleksii …                                  0.1% ▼     —             71            3 units ⚠            …
```

- **Band** (above the table): shown when the list is one owner's profiles (every non-admin; an admin with a user
  picked); hidden for an admin viewing everyone (it would compare all profiles with themselves). Covers the owner's
  active profiles whatever the Search and Region filters. Both counts in the heading are profiles with bids in the
  window (idle ones are out of both averages), so they're counted alike (my call). Four cells (no arrow on bids /
  week: owners run different numbers of bidders, as on the Metrics tab), each "mine vs all", from `mine` and the
  benchmark (`getMetricsBenchmark`: All time → `period=all`; any other range → `period=custom, date=from, to=to`).
  A cell's ▲/▼ uses the rules below. Strongest / weakest: highest and lowest interviews per bid among my profiles
  with 30+ bids in the window, only when two or more qualify; names link to the profile. "since <day>" appears only
  when the window starts after the range's first day. No window: one muted line "Nothing to compare before
  <launch day>".
- **Arrows**: on Intv/bid, Pass rate and Resume score, from the row's `compare` against the benchmark, only when
  the benchmark's window (`comparedFrom`, `end`) equals the list's (`comparedFrom`, `comparedTo`). Rules = the Metrics tab's "Needs attention" thresholds, shared
  from one helper: interviews per bid with 30+ bids, ×0.75 / ×1.25; pass rate with 5+ decided, 15 points; tailor
  score with 5+ scored, 5 points. Tooltip: "Since Nov 5: 0.62% vs 0.41% across all profiles".
- **Pass rate column** (after Intv/bid, sortable): `passRate` with "N of M decided" under it, from `rounds`; "—"
  with none decided.
- **Setup column** (after Resume score): "2 fixed · 3 units", "2 fixed", "3 units" or "—"; a units count only when
  tailoring is set up. ⚠ when the Profile tab's setup strip has warnings, listed in the tooltip. Same rules as the
  Profile tab (`setupStrip`), on `setupUnits` / `setupDefaultId`.
- Older backend (no `compare` / `mine` / `setupUnits`, mid-deploy): no band, no arrows, Setup counts fixed resumes
  and `resumePrompts` without ⚠.

## Testing

Backend: pytest for the new fields (window clipping by launch and creation, `mine` dropping idle profiles,
all-time window equals the benchmark's, unit flags, admin/owner scoping unchanged). Website: `npm test` for the
pure helpers (band cells and strongest/weakest, arrow verdicts shared with Needs attention, Setup text and
warnings from slim units); `npm run lint && npm run build`; then a click-through on the live data (read-only).

## Left to the builder

Exact spacing and colours (arrows reuse the Metrics tab's up/down colours), band layout on mobile, the sort order
of "—" in Pass rate (with the other columns' missing values: last).
