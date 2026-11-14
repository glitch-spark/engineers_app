# Self bids tracked by the Bid Track extension

Date: 2026-11-15. Repos: `bid-track` (the Chrome extension, 3.4.1), `engineers_backend` (server), `engineers_app`
(website). Branches `feat/self-bids-extension` in each, from their deployed heads.

## Why

Owners' own job applies ("self bids") are only known from numbers typed into the Daily Plan per profile, so they're
approximate and carry no job, time or proof. From next week owners will record their applies with the Bid Track
extension, as bidders already do, so self bids become real per-job records and every self-vs-bidder number is right.

## Goals

1. An **owner signs into the extension with their platform login** and records applies as they browse, choosing the
   **profile** for each application (remembered between applies).
2. The server stores each as a **self bid**: same capture data as a bidder bid (job URL / title, screenshots, attached
   files, time), owned by the owner, tied to the chosen profile, **no pay, no review** (auto-approved).
3. **Pilot (phase 1, 1–2 weeks):** typed Daily Plan self bids keep counting everywhere; tracked self bids are shown
   **next to** the typed ones (Daily Plan "Typed 42 · Tracked 39 (extension)") and never added to them.
4. **Switch (phase 2):** turned on by one setting, no deploy. Per owner, from that owner's first day with a tracked self
   bid on or after the switch date, tracked self bids replace their typed ones in every metric; their Daily Plan shows
   the tracked numbers read-only. Owners not using the extension keep typing.
5. Metrics read self bids from one place: the Profiles page (Bids column, apply dates, rates), the Bidders page
   ("Self" row; shared-profile note), Statistics (self vs bidder), Daily Plan Slack post.
6. **Bidders page "Self" row** for the owner's tracked self bids, excluded from pay, review, the "vs the platform"
   bidder averages, flags and archive suggestions.
7. "Applied by: Self" interviews can be matched to a tracked self bid by job URL (as bidder interviews are credited).

## Non-goals

- No change to bidders' sign-in, capture, pay or review.
- No migration of past typed self bids into records.
- No owner screenshots review UI beyond what bids already have (a self bid opens like a bid, read-only).

## Decided with the user

- Owners use their own platform login, picking the profile per application (approach A for sign-in).
- Phase 1 side by side (shown, not added), phase 2 per-owner automatic switch after 1–2 weeks.
- Storage approach A (below), with B written down as the backup and why. Build the extension side first.
- Self bids: no pay, no review; a Self row on the Bidders page; interview matching by job URL.

## Storage approaches

- **A (chosen): the same `bids` collection, `kind: "self"`.** A self bid is a `Bid` with `kind="self"`,
  `bidderId=None`, `ownerId` = the owner, `accountId` = the chosen profile, `status="approved"`. Reuses upload-URL
  presigning, confirm, screenshot storage keys, job extraction, evidence and the bid detail view. Why: one upload flow in
  the extension and one place for "all applies to this job"; bidder pay / review / performance / the pay week board all
  query by `bidderId`, so rows without one are out of them by construction. Cost: the few queries by `ownerId` (review
  queue, counts by owner) need an explicit `kind != "self"` filter, each pinned by a test.
- **B (backup): a separate `self_bids` collection.** Bidder pay and review can't be touched by construction. Cost:
  upload / confirm / key building / extraction duplicated or factored out, a second upload path in the extension, and
  two places to read for duplicates and interview matching. Switch to B if, while building A, more than a handful of
  `ownerId`-based bid queries turn up or the unique-index / upsert keys can't be made safe for `bidderId=None`.

## Extension (bid-track) — built first

- Sign-in screen gains "I'm the owner" (platform username/email + password) beside the bidder invite / login. Owner
  mode stores an owner token separately from a bidder token; a signed-in owner sees their name and a **profile picker**
  (their active profiles from the server, last choice remembered, must be chosen before the first capture of a job).
- Capture is unchanged; uploads go to the owner endpoints with the chosen `profileId`.
- Version 3.5.0; the README says how owners sign in.

## Server (engineers_backend)

- **Auth:** `POST /ext/owner/login` (platform credentials, same rate limiting as bidder login) → an extension owner
  token (own claim, e.g. `typ="ext-owner"`, renewable like bidder tokens; app-session tokens are not accepted by the
  extension routes and vice versa). `GET /ext/owner/me` → name and active profiles `[{id, name}]`.
- **Uploads:** `POST /ext/owner/upload-url` and `POST /ext/owner/uploads/confirm`, same bodies as the bidder routes plus
  `profileId` (must be the owner's active profile). Storage key prefix `self/<ownerId>/<date>/<profile>/<job>`.
  `record_screenshot` gains a self variant upserting on `(ownerId, kind="self", jobKey)`.
- **Model:** `Bid.kind: Literal["bidder", "self"] = "bidder"`, `bidderId: Optional`, `accountId: Optional` (self only).
  Indexes: existing `(bidderId, jobKey)` uniqueness made partial on `kind="bidder"`; new unique `(ownerId, jobKey)`
  partial on `kind="self"`.
- **Guards:** every bid query by `ownerId` adds `kind != "self"` (review queue, review endpoints' lists, counts);
  tests pin each.
- **Self bid counts:** one function `tracked_self_bids(owner_ids, account_ids, start, end) -> {(accountId, report day): n}`
  (report day as bidder bids).
- **Switch setting:** `SELF_BIDS_TRACKED_FROM` (ISO date or empty). Empty = phase 1. When set, for each owner, days on
  or after `max(setting, owner's first tracked day)` use tracked counts; earlier days and owners with no tracked bids
  keep typed counts. One function `self_bid_counts(...)` applies this and replaces today's `self_bids()` callers
  (profile metrics, performance shared-profile note, statistics, Daily Plan).
- **Daily Plan API:** the day response gains `trackedSelfByProfile` (always, for the side-by-side) and `selfLocked`
  (phase 2 and the owner has started); saving typed self bids is refused for locked days.
- **Bidders page:** `/bids/performance` gains a `self` row for one owner's list (`kind="self"`), with no pay, no
  review, not in `top`, totals' pay or insights / alerts.
- **Interviews:** an interview with `appliedBy.kind == "self"` is linked to a self bid with the same normalized job URL
  (best effort, for "Self" conversion).

## Website (engineers_app)

- Daily Plan: per profile "Typed 42 · Tracked 39 (extension)" in phase 1; in phase 2 (`selfLocked`) the tracked number,
  read-only, with "from the extension".
- Bidders page: the "Self" row (owner's name + "Self", no pay / review cells), first or last in the table.
- Nothing else changes visually: Profiles and Statistics read the counts the server now picks.

## Testing

- Extension: owner login flow, profile picker required and remembered, uploads carry `profileId` (unit tests where the
  repo has them; a manual checklist otherwise).
- Server: owner login / me / upload / confirm (auth separation both ways, foreign profile refused); self bids absent
  from pay, review queue, board, performance rows, insights and alerts; phase 1 vs phase 2 counts per owner (before /
  after first tracked day, owners without tracked bids); Daily Plan lock; self row; interview link.
- Website: Daily Plan typed vs tracked rendering; Self row.

## Answers and calls after the builder check

From the user:
- **LinkedIn and Indeed stay excluded** for now (the extension's `isExcludedUrl` is unchanged for owners).
- **Owners apply with several profiles and on other devices**, so the switch is **per (owner, profile)**: a profile
  moves to tracked counts from its own first tracked day on or after `SELF_BIDS_TRACKED_FROM`; the owner's other
  profiles keep typed counts.

Mine (following from those):
- **Phase 2 keeps a typed field per switched profile: "Other applies (not captured)"** — LinkedIn / Indeed, another
  device — **added to** the tracked count (tracked + other = the day's self bids). Unswitched profiles keep the plain
  typed field. `selfLocked` becomes per profile: `trackedProfiles: [accountId]` in the Daily Plan response; for those,
  the typed value saved is the "other" number.
- **Tracked counts reach every reader by writing them into the Daily Plan day** (approach (a) of the check): on each
  confirmed self-bid upload (and a nightly recompute for safety), the server sets the day's `done.bidsSelfByProfile[profile]`
  = tracked + other for switched profiles and re-derives the region totals, creating the day's plan if missing and
  marking it logged. So Statistics, dashboard, leaderboard, alerts, the Slack post, weekly progress and lifetime totals
  read the right numbers unchanged. Phase 1 writes nothing (side by side only); `trackedSelfByProfile` is computed at
  read time for the display.
- **A self bid counts like a bidder bid: one captured job = one apply** (no submit screenshot required). The pilot's
  typed-vs-tracked comparison is where over-counting would show before the switch.
- **Interviews:** the Self row counts interviews already tagged "Applied by: Self" on the owner's profiles; URL
  matching is out of this round (goal 7 dropped).
- **Bidders page:** the Self row sits below Total and is not part of it (bidder headline numbers unchanged); an admin
  viewing everyone sees one Self row per owner ("Self · <owner>").
- **Security:** only non-admin users can sign in as owners; `get_current_user` refuses `ext-owner` tokens and the
  extension routes refuse app tokens; owner tokens expire after 14 days without use; deactivated users are refused.
  The bid page and screenshots open self bids (no bidder) for their owner and admins.

## Left to the builder

Copy and layout; how the extension stores the two token kinds; rate-limit keys; the exact job-URL normalization reuse.
