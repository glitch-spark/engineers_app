# App reorganization: pages, tabs and where each feature lives — design

Date: 2026-11-14 · Repos: engineers_app (most of it), engineers_backend (data-consistency steps, a few bug fixes)
Related: `engineers_backend/docs/superpowers/specs/2026-11-14-callers-and-reminders-design.md` (Callers tab, Slack
reminders) — that project goes first and owns the Interviews tab changes.

## Why

The owner's words: the pages "feel random and not organized by what it does; some pages overlap with other pages'
work and are not logically aligned." A full inventory (2026-11-14) confirmed it:

- **The same numbers live on many pages.** Bids per person: Dashboard, Plans team table, Statistics → Bids,
  Bidders → Performance, Profiles (columns + a Metrics tab). Caller numbers in Statistics, caller work in Interviews.
- **The same numbers disagree.** Dashboard "bidder bids" come from the count typed in daily plans
  (`done.bidsBidder`); Statistics uses Bid Track records. Dashboard net income counts approved transactions only;
  Transactions totals include pending and rejected, and the page has no status filter.
- **One thing is edited in several places.** Resume prompts: the profile editor, `/preferences`, and Prompt Eval
  ("Save to profile"). The same object is called "resume unit", "Template-Prompt" and "Prompt".
- **Confusing names.** "Profiles" (`/accounts`) are work identities; "Profile" (`/profile`) is your own account, which
  the user menu calls "Account settings". Plans lives at `/report`.
- **Hidden pages.** `/preferences` is reachable only via a tab; `/profile` only via the user menu.
- **Broken bits and dead code** (listed under step 1 and step 3).

## Goals

1. Every page has one job; pages are grouped by what they do.
2. **Work pages** (where you do things) are separate from **Statistics** (where you read numbers). Work pages keep at
   most a small summary that links to the full numbers.
3. One source and one definition per number; one place to edit each thing; one name per concept.
4. Nothing is lost: every feature still exists somewhere, and old addresses redirect.
5. Ships in independent steps; each step is usable on its own.

## Non-goals

- Who-can-see-what changes, except the interview read-only summary in step 1 (decided by the user). Statistics and
  the earnings ranking stay visible to all users as today (out of scope; can be revisited separately).
- Visual redesign of individual pages beyond moving sections between them.
- New analytics beyond what exists (moved, not invented) — except the Home to-do page.

## Anti-goals

- Breaking bookmarks, Slack links or alert links (all old paths must redirect).
- Nesting big tools inside tabs: Job Applies and Prompt Eval stay full pages (the user flagged this).
- A "big bang" release.

## Approaches considered

- **A. Regroup the menu only** — fast, but every overlap stays; rejected.
- **B. One job per page: work pages vs Statistics** — chosen by the user. Moves sections, renames a few routes, keeps
  every page.
- **C. Fewer hub pages** (Work, Resumes, Bidders, Money, Stats) — cleanest menu but rebuilds pages and breaks habits
  and links at once; rejected.

Within B, two sub-decisions came from the user: Job Applies and Prompt Eval stay their own pages (too big for tabs);
Prompt Eval stays open to every user (people test their own prompts); Bidders and Profiles are not grouped as "Team".

## Target structure

```
Home               ← your day: what needs doing now          (/dashboard)
Plans              ← week goals + daily follow-up             (/plans, was /report)

RESUMES
  Profiles         ← tabs: My profiles · Default prompts      (/accounts, /accounts/:id)
  Generate         ← tabs: Generate · Generated               (/resume, /resume/generated)
  Job Applies                                                 (/job-applies)
  Prompt Eval                                                 (/resume/eval)

Bidders            ← one page (pay week/month/custom, strip, insights card, one table); bidder view: This week · History
Interviews         ← tabs: Interviews · Caller schedule · Callers   (callers project)
Transactions       ← + 12-month net chart, status filter
──────────
Statistics         ← tabs: Team · Bids · Interviews · Callers · Profiles · Resumes · AI usage

ADMIN
  Users
User menu → Account settings  (details, Slack, time zone, password)
```

## What moves where

| From | To | Notes |
|---|---|---|
| Dashboard CompareCard ("You vs team": bids, interviews, earnings rankings) | Statistics → **Team** | Same component and ranges. |
| Dashboard TeamOverview (admin) | Statistics → **Team** (admin sees the team table + tiles) | Clicking a person opens their Plans board (`/plans?user=`). |
| Dashboard NetIncomeCard | Top of **Transactions** | Approved-only net, see "consistency". |
| Profiles list metric columns (Bids, Interviews, Intv/bid, Resume score) + period control | Statistics → **Profiles** | Profiles list keeps name, region, owner, Generate toggle, actions; each row gets a "Stats" link. |
| Profile editor → Metrics tab (`ProfileMetricsPanel`) | Statistics → **Profiles** (drill-in for one profile, `?tab=profiles&profile=<id>`) | The editor keeps Details, Resumes, Prompts, Eval history. |
| ~~Bidders → Performance tab~~ | stays on Bidders | Superseded 2026-11-14: Bidders became one page that merges pay week and performance (`2026-11-14-bidders-single-page-design.md`, shipped `3c0d3d7`/`fd17206`). It is the bidder owner's working page (pay, review, who to keep), so it stays there; Statistics → Bids keeps the per-user totals. |
| `/preferences` (default prompts) | Profiles → **Default prompts** tab | `/preferences` redirects. |
| Statistics → Resume compare | Statistics → **Resumes** | Rename only. |
| Statistics → Callers | stays; links both ways with Interviews → Callers | Done in the callers project. |

Statistics: the open tab and its filters go in the URL (today the tab is component state), so other pages can deep-link
(e.g. `/statistics?tab=callers&period=week`). The shared filter bar (`statistics/controls.tsx`) covers the moved tabs.

## Home (Dashboard → to-do page)

Opens on what needs doing, then progress:

- Today's plan: set today's goal / follow up yesterday (links into Plans' day panel).
- Bids waiting for my review (count per bidder → Bidders review overlay).
- My next interviews and caller rounds today/tomorrow, with confirm status and Download brief.
- Card renewals due (from alerts).
- This week's progress vs goal (today's ThisWeekCard: bids/interviews vs target, pace, streak, stage tiles).
- Admin: the same, plus "people behind on goal / not followed up" (from the team table), linking to Statistics → Team.

The user approved the overall proposal including this; specifics of each card are the builder's within this list.

## Consistency

- **Bidder bids: one source — Bid Track records** (approved + pending), everywhere. Dashboard/Home and Plans read them
  instead of `done.bidsBidder`. In Plans, the bidder **Done** becomes read-only and auto-filled (like interviews Done
  already is); the bidder **goal** stays typed. Keep historical typed values stored (don't delete), just stop showing
  them as Done.
- **Net income: one definition — approved transactions only.** Transactions gets a Status filter (default: all, so the
  list still shows pending); the footer shows approved net, with pending shown separately. (My calls:) The 12-month
  chart follows the page's **User** filter (me / a chosen user / all users) and ignores payer, pay method and period
  (it is a 12-month trend). This is not a visibility change: every role already sees every transaction on this page.
  `/dashboard/net-monthly` (self-only for staff, no all-users total) is replaced by an endpoint scoped like
  `listTransactions`. With Status = Pending or Rejected, the footer totals the matching rows and labels them by that
  status instead of "net". The unused `userTotals`/`payerTotals` stay unused.
- **One name for the resume unit:** "Resume variant" (my call — the user can rename) in the profile editor, Generate
  ("Template-Prompt" today) and Prompt Eval.
- **Prompts edited in one section:** per-profile prompts in the profile editor; defaults in Profiles → Default prompts.
  Prompt Eval keeps "Save to profile" (it is the test bench for the same prompt) and links to the profile's prompts;
  Default prompts gets a "Test in Prompt Eval" link.
- **Names and routes:** Plans at `/plans` (`/report`, `/weekly-plan` redirect); the user menu item and page title are
  both "Account settings" (route `/account`, `/profile` redirects — builder may keep `/profile`); "Generated Resumes" /
  "Generated resumes" one spelling.

## One filter bar for every page (added 2026-11-14)

**Why:** an inventory found 11 filter bars with 8 different date-option sets (Statistics Month/Week/Custom;
Interviews Previous/This/Next week, Previous/This month, This year, Custom; Transactions Week/Month/Year/Custom;
Dashboard This week/This month/Last 30 days; Profiles Last 4/8/12 weeks/All time; Profile Metrics Month/Week/Custom/All
time; Bidders Performance Month/Week/Custom; AI usage Today/Yesterday/This week/This month/Custom), two Segmented
components (`statistics/controls.tsx`, `jobApplies/Segmented.tsx`), the custom `Select` mixed with native selects,
per-page pagination with sizes from 5 to 200, filters in the URL on some pages and lost on reload on others, Interviews
filters dropped when switching its tabs, and weeks ending Sunday on most pages but Saturday in Plans.

**Decided with the user:**
- Standard date presets, in this order: **This week · Last week · Last 2 weeks · Last month · This month · This year ·
  Custom**.
- **Last 2 weeks = the two previous full weeks** (Mon two weeks ago → last Sunday), consistent with Last week
  excluding the current week (user: option A).
- **Interviews also offers "Next week"** (Interviews only, after This week) for upcoming interviews (user: option B).

**Definitions (my calls):**
- Weeks run Monday–Sunday everywhere filters are used. Last month = the previous calendar month. This week / This month
  / This year = the whole calendar period; on pages that only show the past (`allowFuture: false` — Statistics, Profile
  metrics, AI usage) the end is clipped to today and › stops at the current period. Interviews and
  Transactions allow the future.
- ‹ › arrows next to the range move it back/forward by its own length (week, 2 weeks, month, year, or a custom range's
  day count); the label always shows the actual dates. A stepped range that no longer matches a preset shows as Custom.
- Custom keeps today's 366-day cap.
- Page-specific extras sit below the standard list on that page only: AI usage keeps **Today** and **Yesterday**
  (hourly); profile statistics keep **All time**.
- **Bidders uses the same FilterBar + DateRangeFilter** (user, 2026-11-14: "Bidders page also should use similar
  component"), with pay-week presets because a "week" there is the pay week (Sat 16:00 → Sat 16:00, report days cut at
  18:30): **This pay week · Last pay week · Last 2 pay weeks · This month · Last month · Custom**, ‹ › stepping by the
  range's own length, label with the actual dates (e.g. "Nov 7–14 (pay week)"). It replaces the one-off
  `Pay week | Month | Custom` segmented control and the separate WeekNav on the list page; week presets map to today's
  `period=week&date=` (pay week holding the date), month presets to `period=month`, the rest to `period=custom`. The bar
  also carries Owner (admin), Show archived, and a new SearchFilter "Search bidders…" (name or profile, client-side).
  The single-bidder view and the review overlay keep their own pay-week navigation.
- Not filters, kept as week arrows restyled to match: the single-bidder view's pay week and the
  Plans week (`?week=` Monday, Mon–Sat days). Dashboard/Home cards with fixed periods keep them.
- Time zones don't change: presets resolve to calendar dates (YYYY-MM-DD) in the browser and each endpoint interprets
  them as it does today; Interviews keeps its ZoneSelect conversion.
- Server params don't change where the existing contract fits: week presets send `period=week&date=<Monday>`, month
  presets `period=month&date=<1st>`, the rest `period=custom&date=<from>&to=<to>` (Statistics,
  Profile metrics); `from`/`to` pages (Interviews, Transactions, AI usage) send dates. Old Interviews URL values map on
  read: `prev_week` → `last_week`, `prev_month` → `last_month`, `next_week` → `next_week`.

**The bar:**

```
User ▾   Profile ▾   Region ▾   Status ▾   [Search…]   Date range ▾   ‹ Nov 9–15, 2026 ›   Clear
```

- One `FilterBar` component (panel style, labels above controls) in a fixed order: who (User/Owner) → what
  (page-specific: Profile, Region, Status, Stage, Caller, Pay method, Payer, Role…) → search → date range → "Clear"
  (shown when anything differs from the page default). Pages pass only the filters they need. Statistics' bar stays
  sticky; others are not.
- One date-range control (`DateRangeFilter`) and one presets module (`lib/dateRange.ts`) replacing
  `lib/dateRangePresets.ts`, `statistics/controls.tsx` period pieces, `lib/aiUsagePeriod.ts` period logic and
  Transactions' `calendarPeriodRange`.
- One Segmented (keep the labelled radiogroup with counts from `jobApplies/Segmented.tsx`, move it to
  `components/`), the custom `Select` everywhere, one `Pagination` (from `jobApplies/Pagination.tsx`) with page sizes
  **10 / 20 / 50 / 100, default 20**; the Job Applies run table keeps 25/50/100/200.
- One region list (`All · LATAM · EU · US · Canada · Asia · No region`), each page showing the subset it supports.
- **One search box** (`SearchFilter`, added 2026-11-14 at the user's request): 🔍 icon, × clear, Esc clears, 300 ms
  debounce, kept in the URL as `q`, placed after the page-specific filters and before the date range, reset by
  "Clear"; placeholder names what it searches ("Search profiles…", "Search companies…", "Search users…", "Search job
  descriptions…"). Used by Profiles, Generated (JD search; its Company box stays a separate text filter in the same
  style — they search different things), Statistics → Resume compare, Users, Prompt Eval → Job descriptions (new:
  title/company), and Interviews (new: company/position — needs a small backend `q` param on the list and rounds
  endpoints).
- Filters live in the URL on every page (standard names `range`, `from`, `to`, plus page-specific keys; defaults left
  out), and carry across a page's tabs (Statistics tabs; Interviews · Caller schedule · Callers).
- Pages: Statistics (all tabs incl. AI usage), Interviews (list, calendar, Caller schedule), Transactions, Bidders
  (pay-week presets, owner, Show archived, search — see above), Profiles list, Profile metrics (→ Statistics → Profiles),
  Generated, Prompt Eval (runs + JD library), Job Applies runs, Users, Statistics → Team (from the Dashboard cards).

## Steps (each ships alone)

Sequencing: the callers project ships first and owns every Interviews change (tabs, Caller schedule rename, confirm,
assigned-caller access) and the Account settings time-zone fix. Steps below that touch Interviews or Home's
confirm status build on it rather than redo it.

1. **Menu, names, redirects + bug fixes.** New sidebar groups and order; Resumes group highlights correctly on all its
   pages (today `/preferences` doesn't); renames/redirects above; update internal links (Dashboard "Set weekly
   targets" → `/plans`, the `weekly_plan` alert → `/plans`). Fixes:
   - Staff opening someone else's interview via `?panel=`/`/interview/:id` get 403 (the list shows it, the detail
     refuses). **Decided (user, option A): a read-only summary for everyone** — company, position, profile, stage,
     each round's date/stage/status, and the caller: what the list already exposes, laid out per round. Notes,
     transcripts/questions, AI analysis, resumes and the brief stay limited to the owner, interview managers, admins
     and the round's assigned caller (callers project §5). Rejected: B (everything for everyone — every candidate's
     resume downloadable by all) and C (keep the 403, make others' rows unclickable). Implement as a summary shape
     of the detail endpoint (or a separate summary endpoint) for non-privileged viewers; the panel hides the actions
     and sections they can't use. This is the one deliberate visibility change in this project.
   - Account settings: time zone hidden until Slack is linked (shared with the callers project — do it once);
     "Standard Account"/"Active" hard-coded; phone editable only by admins.
   - Users page status filter "Active/Inactive" vs badge "Pending approval".
2. **One filter bar** (section above): shared components first, then every page. Done before step 3 so the tabs
   that move into Statistics arrive on the new bar instead of being converted twice.
3. **Move the numbers into Statistics** (table above), tab + filters in the URL, links from work pages.
4. **Prompts in one section, one name, cleanup.** Default prompts tab; "Resume variant"; fix Preferences' out-of-date
   copy; remove dead code: `pages/Leaderboard.tsx` + `lib/leaderboardUI.tsx`, `components/ResumeStylingEditor.tsx`,
   `components/TransactionChart.tsx` (the "Run eval — Coming soon" card no longer exists as of 2026-11-14), unused endpoint
   helpers (`getLeaderboard`, `getGlobalPrompt`, `updateGlobalPrompt`, `generateScreeningAnswers`,
   `listResumeHistory`, `bidderLiveCounts`, `rejectAwaitingRound`, `transactionSummary`, `deleteWeekPlan`). Backend
   endpoints only used by those helpers may be removed too, after a usage check. Leave the hidden "Mark applied"
   (Job Applies `APPLIED_UI = false`) alone — the applied log is still read by metrics.
5. **Consistency:** bidder bids from Bid Track everywhere; approved-only net income + status filter on Transactions.
6. **Home as the to-do page.**

## Constraints

- Live app = Vercel (engineers_app `main`) + Railway (engineers_backend `dev`); old links in Slack posts and alerts must
  keep working.
- Staff/interview-manager route allow-list in `auth/RoleGuard.tsx` (`STAFF_ALLOWED`) must include new paths.
- SWR keys and `src/api/endpoints.ts` are the data layer; reuse existing endpoints when moving components.

## Left to the builder

Exact component moves and file layout; how Statistics → Team splits staff vs admin views within today's two
components; Home card layout; whether `/profile` becomes `/account`; redirect implementation.
