# Bidders page: insights — your bidders vs the platform, best on the platform, flags and archive suggestions

Date: 2026-11-14. Repos: `engineers_app` (website, branch `feat/bidders-insights` from `main` 443264d) and
`engineers_backend` (server, branch `feat/bidders-insights` from `dev` a433675). Follows the Profiles page work
(`2026-11-14-profiles-list-compare-design.md`, `2026-11-14-profiles-flags-and-top-design.md`) and reuses its patterns.

## Why

Owners pay bidders per approved bid and today only see raw counts (Pay week) and a Performance table with top-3 cards.
Nothing says whether a bidder is good compared with others, what an interview costs, or which bidder needs attention.
The page should help an owner decide whom to **coach, check in with, or stop paying**.

## Goals

1. **Comparison card** "Your N bidders vs the platform average" for the Performance tab's period: bids per weekday,
   hit rate (weekdays at 50+), approval rate, interviews per 100 bids, cost per interview — yours vs the platform,
   coloured green / red (grey when too few to judge), with the gap and two bars, exactly like the Profiles card.
2. **Top bidders vs best on the platform**: for most bids, best conversion (per 100 bids) and lowest cost per
   interview, your best bidder next to "Best on the platform: <bidder> (<owner>) – <value>" or "🏆 Best on the
   platform"; chips "N behind" / "−x pts" (amber within 25%, grey further), as on the Profiles card.
3. **Red flags with one suggested action each** (fixed windows, ignore the period).
4. **Archive suggestions** (grey banner, Archive behind a confirmation).
5. **Performance table polish**: approval rate and cost per interview columns; per-100 coloured by verdict with an
   arrow vs the platform and "3 of 182 bids" under it; approval "120 of 130 reviewed" under it.
6. **Fix**: an admin opening another user's bidder can read its History tab (today "Couldn't load history").

## Non-goals / anti-goals

- No automatic archiving, pausing or pay changes; no notifications.
- Don't change how bids, interviews, streaks or hit days are counted: reuse `app/bids/performance.py`.
- The Performance table must not wait on platform numbers.
- Bidder ids of other owners are never sent; names (bidder + owner) are, as on the Profiles card (user's earlier
  decision for "best on the platform").

## Decided with the user

- All five ideas plus the history fix ("Looks good").
- Approach A: a separate insights request, loaded in parallel with the existing Performance request.

## Definitions (shared with the Performance tab)

- Bids = approved + pending (the Performance "Total"); reviewed = approved + rejected.
- Weekdays, hit day (50+ bids), hit rate, avg per weekday: as `performance.streaks` / rows.
- Interviews: rounds held, credited as `interview_credit` does; for a group of bidders each round counts once
  (as `performance` totals do), so shared-profile rounds aren't double-counted.
- Pay = approved × the bidder's `rate` (pending isn't paid yet). Cost per interview = pay ÷ interviews.
- Today = report-timezone today (`_now().astimezone(sched.tz).date()`), as the Performance endpoint.
- Platform = every owner's bidders that aren't archived, over the same days.

## Approaches considered

- **A (chosen): `GET /bids/insights`**, same period params as `/bids/performance`. Card, tops, flags and archive
  suggestions in one response; platform numbers cached per window (stale-while-revalidate like the Profiles
  benchmark). The table request is untouched and loads in parallel.
- B: fold into `/bids/performance` — one request, but the table would wait on cold platform numbers and the Pay week
  tab couldn't show flags without Performance data. Rejected.
- C: website only — no platform average or best on the platform (staff only see their own bidders). Rejected.

## Server (engineers_backend)

### `GET /bids/insights?period=&date=&to=&ownerId=`

Same period parsing and visibility as `/bids/performance` (`_stats_days`, `window`, `_visible_bidders`). Shown only
for one owner's bidders: staff always; an admin only with `ownerId` (admin viewing everyone → `{"mine": null, ...}`
with every field null / empty). Archived bidders never count.

```
{
  "start", "end", "label",
  "mine":     Stats | null,        // the owner's active bidders pooled over [start, end]
  "platform": Stats | null,        // every owner's active bidders, same window (cached)
  "tops": {                        // per measure: the owner's best bidder vs the platform's best
    "bids":     { "mine": {id, name, value} | null, "platform": {name, ownerName, value} | null },
    "per100":   { ... },           // 100+ bids
    "costPerInterview": { ... }    // 3+ interviews; lower is better
  },
  "flags": [ { "bidderId", "name", "kind", "detail" } ],     // red banner, one per bidder (first kind that applies)
  "archive": [ { "bidderId", "name", "reason": "idle" | "invite_expired", "since" } ]
}
Stats = { bidders, bids, weekdays, hitRate, avgPerWeekday, approved, rejected, approvalRate,
          interviews, per100, pay, costPerInterview }
```

- `Stats` pools like the Performance totals: `avgPerWeekday` = bids ÷ weekdays over bidders with at least one bid
  (idle ones dropped, as on the Profiles card); `approvalRate` = approved ÷ reviewed (null at 0 reviewed);
  `per100` null under 100 bids; `costPerInterview` null at 0 interviews.
- Built from `performance()` (or its building blocks) so numbers match the table; the platform call runs over all
  active bidders and is cached per `(start, end)` with the same stale-while-revalidate cache class as the Profiles
  benchmark (`BenchmarkCache`), its own instance.
- Ties in tops: better value, then more bids, then name.

### Flags (red banner) — last 14 days `[today − 13, today]`, ignore the period; bidder created ≥ 14 days ago

First matching kind wins, in this order:

1. `inactive` — no bids on the last 3 weekdays before today (bidder created before them) →
   "No bids since <last bid day>: check in with <name>."
2. `rejects` — 20+ reviewed in 14 days and rejected ≥ 20% → "<n> of <m> rejected, mostly "<top reason>": coach on
   it." (top reason = most frequent `rejectReason`; omitted when none recorded)
3. `no_interviews` — 100+ bids in 14 days and 0 interviews credited → "<bids> bids, no interviews: check the profile
   <profile> and its target roles." (link to the profile)
4. `review_backlog` — pending bids whose report day is 2+ days old → "<n> bids waiting for review since <day>." (link
   opens that bidder's review)

`detail` carries the numbers the website formats: `{lastBidDay}`, `{rejected, reviewed, topReason}`,
`{bids, profileId, profileName}`, `{pending, oldestDay}`.

### Archive suggestions (grey banner)

- `idle`: active, registered bidder, created ≥ 14 days ago, no bids in the last 14 days (`since` = last bid day or
  null).
- `invite_expired`: never registered and the invite code expired (`since` = expiry day).
- A bidder in `archive` is never also in `flags`.
- Archive uses the existing `DELETE /bidders/{id}` (soft archive) behind a confirmation.

### History fix

`GET /bidders/{id}/reports`: an admin may read any bidder's reports (owners still only their own); other bidder
routes keep "no admin exemption".

## Website (engineers_app)

- **Above both tabs** (Pay week and Performance): the red flags banner and the grey archive banner (same look as the
  Profiles banners; red banner not dismissible; first 8 + "Show all N"). Kept while the next period loads, never
  another owner's (as `keptAlerts`).
- **Performance tab, top**: the comparison card (`BiddersBand`): five cells in the Profiles card's style — tone by
  verdict, gap, two bars, "too few to judge" grey — then a "Top bidders" table (Most bids, Best conversion, Lowest
  cost per interview) with the Profiles chips. Avg per weekday has no verdict (owners run different schedules), like
  bids per week on Profiles.
- **Verdicts** (yours vs platform): per 100 bids ×0.75 / ×1.25 with 100+ bids; cost per interview ×1.25 worse /
  ×0.75 better with 3+ interviews; approval rate 10 points apart with 30+ reviewed; hit rate 15 points apart with
  10+ weekdays.
- **Performance table**: new columns "Approval" (`92%`, "120 of 130 reviewed") and "Cost / interview" (`$41`,
  "$820 paid"); per 100 gets the arrow vs the platform and "3 of 182 bids". Sortable like the others.
- Pure helpers in `src/lib/bidderInsights.ts` with `tests/bidderInsights.test.mjs` (cells, tops lines, flag text).

## Testing

- Server (mongomock): Stats pooling (idle dropped, interviews once for shared profiles, pay = approved × rate), each
  flag kind and its order and boundaries (3 weekdays, 14 days, 20 reviewed / 20%, 100 bids, 2-day backlog), archive
  reasons and "never also flagged", tops (thresholds, ties, names, no foreign ids), admin without owner → nulls,
  the platform cache, admin can read another owner's reports and staff still can't.
- Website (node): cells and verdicts, top lines and chips, flag sentences, kept banners.

## Calls made after the builder check (mine, not the user's)

- **Per-bidder pay for the table comes from `/bids/performance`**: its rows gain `rate`, `pay` (approved × rate),
  `reviewed`, `approvalRate` and `costPerInterview`. Adding fields doesn't make the table wait on platform numbers
  (the thing "untouched" meant), and it works for an admin viewing another owner. Exact-shape tests get the keys.
- **`review_backlog` covers every pending bid whose report day is 2+ days old, any age, no bidder-age gate** — it is
  the owner's own unreviewed work. Live data (2026-11-14): most owners review within days; one has 894 pending
  since Nov 3, which is exactly what the flag is for. The link opens that bidder's review on the oldest pending
  day (the day-scoped review that exists today).
- **Bidders that never registered** (folder-based, or invite cleared) are left out of flags and archive suggestions
  entirely: their bids may come from folders, which the insights counts don't see, so "inactive" would be false.
  Only an expired, unused invite suggests archiving.
- **Live counts today** (read-only, 33 active bidders): 6 would get `no_interviews`, 1 `rejects`, 0 `inactive`,
  1 archive `idle`; the 14-day windows and thresholds stay as written.

## Left to the builder

Exact Tailwind classes; banner copy beyond the sentences above; how insights reuses `performance()` internals;
column order in the Performance table.
