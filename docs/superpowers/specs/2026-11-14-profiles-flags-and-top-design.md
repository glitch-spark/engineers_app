# Profiles list: top profiles per region, "no interviews" flags and archive suggestions

Date: 2026-11-14. Repos: `engineers_app` (website, branch `feat/profiles-flags-top`, stacked on
`fix/profiles-list-labels`) and `engineers_backend` (server, branch `feat/profiles-flags-top`, stacked on
`fix/profiles-list-breakdowns`). Builds on the Profiles list compare work
(`2026-11-14-profiles-list-compare-design.md`).

## Why

Owners run many profiles and can't see at a glance which ones work and which are dead weight. The Profiles page should
(1) point them at their best profiles in each hiring region, measured against the best numbers any user reaches there,
(2) loudly flag profiles that stopped getting interviews, with a concrete next step, and (3) suggest archiving profiles
nobody applies with any more.

## Goals

- **Top profiles per region** inside the comparison card (`ProfilesBand`): for US, EU and LATAM, the owner's profile
  with the most interviews and the one with the best interview rate, each next to the best number any single profile
  of any user reached in that region (no names of other users' profiles).
- **Red "no interviews" banner** at the very top of the page for the owner's profiles with no interview in the last
  2 weeks, one suggested action per profile, plus a red tint and a tag on those rows in the table.
- **Grey "archive suggestion" banner** for profiles with no applies (self or bidder) in the last 3 weeks, each with an
  Archive button.

## Non-goals / anti-goals

- Never show another user's profile names or ids (only numbers). The user was explicit: "top of users' profiles for
  now, not other users' top".
- No automatic archiving, no emails/Slack, no dismissing the red banner (it goes away when the profile gets an
  interview).
- No change to how bids, interviews or scores are counted; reuse the existing counters.

## Decided with the user

- Top lists show only the owner's own profiles; other users appear as numbers ("best across all users").
- The red banner is prominent: red, at the very top, above the card; flagged rows are tinted red with a tag
  "No interviews in 14 days". It cannot be dismissed.
- One suggestion per flagged profile, the first rule that matches:
  1. fewer than 30 bids in the 2 weeks → "Too few bids to get interviews: add bids or a bidder."
  2. the Setup column shows a warning (⚠) → "Fix the setup: <first warning>."
  3. no tailored resumes in the 2 weeks → "Set up tailoring so resumes match each job."
  4. tailor score over the 2 weeks at least 5 points below all users' average over the same 2 weeks →
     "Resume score <x> is below all users' average <y>: update the tailoring prompt or template."
  5. otherwise → "Bids aren't turning into interviews: update the resume and check the target roles."
  Each line shows the profile name, its 2-week numbers (bids, resume score vs all users' average, or "no tailored
  resumes") and an "Open profile" link (`/accounts/<id>`).
- The archive banner is quieter (grey), lists the profiles with an Archive button each, with a confirmation.
- Approach A (below): the server decides banner membership and returns the numbers; the website renders.

## Definitions

- **Today**: `accounts._today()` (app time zone), as the rest of the list.
- **Last 2 weeks**: the 14 days `[today − 13, today]`. **Last 3 weeks**: `[today − 20, today]`. Both ignore the page's
  date filter.
- **Interviews**: interview rounds held, as the Interviews column counts them (`selfInterviews + callerInterviews`
  from `load_sources` / `days_from`).
- **Applies**: bids, self + bidder, as the Bids column counts them.
- **Too new to flag**: a profile created after `today − 13` is never in the red banner; created after `today − 20`
  never in the archive banner (`profile_compare.created_day`).
- **One banner per profile**: a profile in the archive banner (no applies in 3 weeks) is left out of the red banner.
- **Region**: `Account.region`; the card shows rows for `US`, `EU`, `Latam` (shown "LATAM") only. Profiles with
  another region (Canada, Asia) or none are not in the top lists. A region row is left out when the owner has no
  profile there.

## Approaches considered

- **A (chosen): server works it out.** The list metrics response carries the flags and the owner's regional tops; the
  cached benchmark carries all users' regional best numbers. One request as today; rules tested in one place; "today"
  in the app's time zone. Cost: more server code, two small extra reads in the list request.
- **B: website works it out** from two extra metrics requests (last 14 / 21 days). Less server code, but two more
  ~2 s requests per page load, rules split between website and server, and the website guessing "today". Rejected.

## Server (engineers_backend)

### `GET /accounts/metrics` (`list_profile_metrics`)

Adds, only when the list is one owner's (same condition as `compare`: non-admin, or admin with `userId`) and the
range is valid:

```
"alerts": {
  "asOf": "2026-11-14",                       // today
  "noInterviews": [                           // red banner, most bids first
    { "accountId", "name", "bids": 379, "tailored": 120,
      "tailorScore": { "avg": 67.2, "n": 118 } }
  ],
  "allTailorScore": 71.3 | null,              // all users' pooled tailor average over the same 14 days
  "noApplies": [ { "accountId", "name" } ]    // archive banner, by name
},
"regionTops": {                               // the owner's profiles over the card's compared window
  "US":    { "mostInterviews": { "accountId", "name", "interviews": 3 } | null,
             "bestRate": { "accountId", "name", "interviewsPerBid": 0.0165, "bids": 182 } | null },
  "EU":    ...,
  "Latam": ...
}
```

- `alerts` ignores the date filter. One `load_sources(accounts, today − 20, today)` read covers both windows;
  `window_stats` per profile per window gives bids / interviews / tailored / tailor scores.
- `allTailorScore`: `tailorScore.avg` of the benchmark for the window `(today − 13, today)` through the existing
  `BenchmarkCache` (cold the first time, then cached 15 min like the card's).
- `regionTops` uses the same compared window and per-profile stats as each row's `compare` (no new reads).
  `bestRate` needs 30+ bids in the window (`MIN_BIDS`, as "Best interview rate" in the card); ties → more bids, then
  name. `mostInterviews` needs at least 1 interview; ties → better rate, then name. A region key is present only when
  the owner has at least one active profile in it.
- `ProfileSpan` gains `region: Optional[str] = None`.
- Admin viewing every owner: no `alerts`, no `regionTops` (as `compare`/`mine`).

### `GET /accounts/metrics/benchmark`

The benchmark result gains `regionTops`: `{ "US" | "EU" | "Latam": { "mostInterviews": n | null,
"bestRate": x | null } }`, the best single profile's number per region over the window, any owner, 30+ bids for the
rate. Numbers only. Same cache key; the Metrics tab ignores the new field.

## Website (engineers_app)

- **Card (`ProfilesBand`)**: a "Top profiles" block under the four cells, one line per region present:
  `US · Most interviews: Erric 3 (best across all users: 9) · Best interview rate: Daniel Kifle 0.40% (best across
  all users: 1.2%)`. Names link to the profile. When the owner's number equals the all-users best, the bracket reads
  "(best across all users)". Missing side → "—". Shown only when the card is shown (windows match).
- **Red banner** (`role="alert"`, red border/background in light and dark), at the very top of the page content,
  above the card: heading "⛔ N profile(s) got no interviews in the last 2 weeks", then one line per profile: name,
  "379 bids · resume score 67 (all users' avg 71)" (or "no tailored resumes"), the suggestion (rules above), "Open
  profile". The setup warning (rule 2) comes from `setupText(acc)` on the list's account (already on the page); a
  flagged profile not on the current page of the table still gets its line, without rule 2 if its account isn't
  loaded.
- **Rows**: an account in `alerts.noInterviews` gets a light red row background and a small red tag
  "No interviews in 14 days" in the Interviews cell, whatever the date filter.
- **Grey banner** under the red one: "N profile(s) had no applies in the last 3 weeks. Archive them to keep the list
  focused." with each name and an Archive button → `ConfirmDialog` ("Archive <name>? It leaves the active list and
  Generate; you can unarchive it any time.") → existing `setArchived(acc, true)`; on success, refresh list and
  metrics.
- Neither banner shows on the Archived status filter, for an admin viewing every owner, or when metrics failed.
- Pure helpers in `src/lib/profileList.ts` (tested in `tests/profileList.test.mjs`): `flagSuggestion(alert,
  allTailorScore, setupWarnings)` and `regionTopLines(mine, all)`.

## Testing

- Server (mongomock, `tests_unit`): banner membership (no interviews 14 days; no applies 21 days wins; too-new
  profiles skipped; interview on day today − 13 counts; bid on today − 20 counts), `allTailorScore`, `regionTops`
  (owner) and benchmark `regionTops` (30+ bids rule, ties, regions with no profiles left out, other regions ignored),
  admin-everyone gets neither; exact-shape tests updated.
- Website (node test runner): every suggestion rule and its order; region lines incl. "(best across all users)" and
  missing sides.

## Calls made after the builder check (mine, not the user's)

- **Banner length: list every flagged profile, no folding.** Measured on the live data (2026-11-14, start day
  Oct 1): 9 of the 44 profiles old enough to judge would be in the red banner, at most 5 for one owner (Yuari: 14-day
  bids 171, 89, 51, 13, 2), 0–2 for the others; 4 in the archive banner, at most 1 per owner. The low-bid ones get
  rule 1 ("Too few bids…"), which is the point. If an owner ever has more than 8, show the first 8 by bids and
  "Show all N" (local state); not expected today.
- **The region block replaces the card's "Best interview rate … · Lowest: …" line.** Two "best rate" lines (owner-wide
  and per region) could disagree; the weak profiles now have the red banner. `strongestWeakest` and its test go.
- **`allTailorScore` never slows the list.** The list reads the 14-day benchmark only if it is already cached (fresh
  or stale); on a miss it returns `null` (rule 4 skipped, rule 5 applies) and starts a background warm-up so the next
  load has it. Needs a non-blocking `BenchmarkCache.peek(window)` (cached value or None, starting a refresh when
  missing or stale).

## Left to the builder

Exact Tailwind classes and spacing; banner copy beyond what's above; sorting inside the archive banner; how the
list request reuses reads it already makes.
