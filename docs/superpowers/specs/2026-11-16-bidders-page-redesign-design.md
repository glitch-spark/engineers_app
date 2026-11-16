# Bids page (was Bidders) — three tabs, one review flow, plain numbers, Sunday pay week

Status: design, awaiting the user's approval (2026-11-16; builder-check questions answered the same day). Builds on `feat/app-reorg` (shared filter bar, Self rows
split per profile). Evidence for every problem below, with file:line references, is in
`docs/superpowers/specs/2026-11-16-bidders-ux-audit.md` ("the audit"; findings are cited as F1–F24, themes as T1–T6).

## Why

The user, as an admin and as an owner: the first visit shows **one long list with no clear separation between their
own applies (Self) and their bidders' bids**. The audit adds why the page feels hard: six blocks stand in front of a
17-column table (F1); four different "Review" buttons lead to different screens and exits (F2); the same word counts
different things in neighbouring cells and one row can show two pay amounts (F3, F4); there is no way to close out a
pay week (F5); a bidder's own page lacks their performance (F6); names drift ("This week" tab shows any week) (F7);
meanings hide in hover tooltips (F8).

Seven non-technical users use this page. Success: on first load each person sees **their own team**, can tell at a
glance **what needs review** and **what they owe**, and their **own applies are somewhere else entirely**.

## Decisions (made by the user)

1. **The page is renamed Bids** (menu and title; route `/bidders` unchanged) with **three tabs: Bidders | My bids | Pay**
   (option B, chosen over one page in sections).
2. **The page opens on the signed-in user's own bidders**, admins included. Admins switch owner (or pick everyone)
   with the Owner filter.
3. **Clean separation between bidders and self**: own bids live only in the My bids tab, never in the bidders
   table.
4. **To review counts every pending bid the team still has, of any age** — not just the selected dates (last week's
   unreviewed bids are the ones that go unpaid).
5. **Pay week moves to Sunday 8 pm → Sunday 8 pm America/Chicago** (Mon–Sun in practice; bids after Sunday 8 pm count
   toward the next week), with a switch so past weeks keep their Saturday 4 pm boundaries: the week that began
   **Sat Nov 14 2026, 4 pm runs until Sun Nov 22 2026, 8 pm** (one ~8-day week), and every week after is Sun 8 pm →
   Sun 8 pm. **Each report day closes at 6:00 pm Chicago** (was 6:30 pm), from the same switch.
6. **The weekly Slack summary posts Sunday 8 pm Chicago**: each bidder's bids for the week and their pay, plus the
   total. That post is the record to pay from; the Pay tab shows the same figures for closed weeks.
7. **Pay tab is a summary only** for now: what each bidder earned per pay week, a warning about pending bids, a copy
   button. **No "Mark paid" tracking** (nothing in the app records bidder payments today; Transactions holds card and
   subscription costs).

## Goals

- First load = own team, Bidders tab, this pay week; nothing about other owners or own applies on that screen.
- One way into review and one way out (T1).
- One name and one definition per number, with help you can click (T3).
- A calmer bidders table: a **Week** view by default and a **Performance** view on demand (T2).
- A bidder's own page carries their performance (T4).
- A Pay tab that answers "what do I pay each bidder for this pay week, and what is still unreviewed" (T5, summary part).
- Own bids in their own tab, one row per profile (T6, fitted to the tab layout).
- The pay week ends Sunday 8 pm, reported to Slack at that moment, without moving any past week.

## Non-goals

- "Mark paid", payment records, links to Transactions.
- Changing how bids or pay are counted (Bid Track counting stays approved + pending where "bids" is meant; pay =
  approved × rate in the pay week window). Only the schedule (decision 5) changes.
- Moving bidder performance to Statistics (the reorg spec keeps Bidders as one page; tabs live inside it).
- The Bid Track extension itself, invites/login mechanics, the review overlay's keyboard model.

## Anti-goals (would make this a failure even if it works)

- Breaking existing links: Slack and alert links, bookmarks with `bidder`, `day`, `tab`, `mode=focus`, `bid`, `week`,
  `range`, `date`, `from`, `to`, `owner`, `archived`, `q`, `show` must still open the same thing (or its new home).
- Any pay or count figure changing value for the same bidder and an **already closed** pay week or report day
  compared with today's server numbers (the schedule switch must not re-cut the past).
- Admins losing the ability to see every owner's bidders.
- Losing what the audit lists as working well (audit §4): filters in the URL, the review overlay (keyboard, prefetch,
  undo, "Changed by…"), the "form should use" box, the day panel (Approve all complete, bulk ticks), honest "—"/⚠ for
  unknowns, invite sharing, today highlighting, sortable columns, Retry on errors.

## Target structure

```
Bids                                                      [Add bidder]  ⋯ (Download Bid Track)
[ Bidders | My bids | Pay ]
[filter bar: Owner (admins) · Search (Bidders tab) · Show archived (Bidders tab) · date range ‹ label › · Clear]

── Bidders tab (default) ─────────────────────────────────────────────────────────────────────────
┌ To review · 18 pending (all, any age) · oldest Nov 9 · Ana 12 · Raj 4  [Review today (6)] [Review all] ┐
┌ Needs attention (amber, collapsible): Raj — 300 bids, no interviews: check profile Dev-A  [Open]      ┐
View: [Week | Performance]
Week view:
  Bidder           Sun  Mon  Tue  Wed  Thu  Fri  Sat   Approved  Pending  Pay
  🇵🇭 Ana · Dev-A    52   61  45³   –    –    –    –      158       3 →     $9.48   ⋯
  Total             …                                    258       3       $15.48
Performance view:
  Bidder     Bids  Days at 50+  Interviews (per 100)  Approval  Cost per interview  Last bid   ⋯
  + one-line platform comparison that expands into today's comparison card

── My bids tab ──────────────────────────────────────────────────────────────────────────────────
  Your own bids from Bid Track · Week ending Sun Nov 29
  Profile        Sun  Mon  Tue … Sat   Total   Interviews
  Dev-A            6    7    …          13        1          (cell or name → that profile's applies)
  Dev-B            4    5    …           9        0
  Total                                 22        1

── Pay tab ──────────────────────────────────────────────────────────────────────────────────────
  Pay week ending Sun Nov 29, 8 pm · closed (as posted to Slack)          [Copy pay summary]
  Ana   158 approved × $0.06 = $9.48     ⚠ 3 pending — not paid until reviewed  [Review]
  Raj   100 approved × $0.06 = $6.00
  Total $15.48
  (opens on Last pay week; a range of several pay weeks shows one block per pay week, newest first; the current pay
   week says "so far")
```

### Tabs and URL

- New URL key **`section`**: absent = Bidders, `mine` = My bids, `pay` = Pay (the key `tab` is already used by
  the bidder view and stays there). Defaults are left out of the URL, like every other filter.
- Tabs share the date range and Owner, with one exception: with no `range` in the URL, the **Pay tab opens on Last
  pay week** (the one you pay for); Bidders and My bids open on This pay week. Search and Show archived apply to the
  Bidders tab only (hidden on the others).
- The Show [All | Bidders | Self] switch merged from `main` is **removed**; tabs replace it. Old `show=self` links open
  `section=mine`; `show=bidders` / `show=all` open the Bidders tab.

### Owner default

- Staff: unchanged (they only ever see their own).
- Admins: the default is **their own id** (today it is "everyone"). The Owner picker gets **Me** first, then each owner,
  then **All owners** (URL `owner=all`). An old link with no `owner` now opens the admin's own team — accepted
  behaviour change. With **All owners**, the Bidders table shows an Owner column (as today), My bids shows one block
  per owner, and Pay groups bidders by owner.

### Review: one way in, one way out (T1)

- One **To review** block at the top of the Bidders tab replaces the strip's review item, the row badge's separate
  route, and the red backlog sentences. It shows the pending count, the oldest day, a chip per bidder, **Review today**
  and **Review all**. It shows **every pending bid of the owner's bidders, of any age, regardless of the selected
  range** (decision 4). Its count can differ from the table's Pending column (which is the range's); the block says
  "all pending" to make that plain. Source: all pending bids per owner (the alerts backlog already queries them,
  `app/bids/alerts.py:55-70`); a small endpoint returning counts per bidder plus the oldest day is fine.
- Every review entry (block, row "N →" badge, Needs-attention line, bidder page tile, Pay tab ⚠ link) opens the **same
  review overlay**. **Close returns to exactly where it was opened** (list stays the list; `Bidders.tsx:199` must stop
  setting `bidder`).
- The overlay gets a scope switch **Today | This pay week | Range** and uses the server's period label (fixes F10).
- "Review all" for a range spanning several pay weeks may need a small server change to list pending bids for a
  period (the overlay takes a day or a week today, `FocusReview.tsx:60`) — builder confirms.
- The backlog is a to-do, shown in neutral/amber, never the red error style (F22).

### Numbers: one name, one meaning (T3)

Glossary, applied everywhere on the page, the bidder page, the overlay and the Pay tab:

| Word | Means |
|---|---|
| **Approved** | bids an owner approved |
| **Pending** | bids waiting for review (never "to review" / "Review" as a count) |
| **Bids** | approved + pending, only where both are meant (Performance view) |
| **Pay** | approved × rate inside the pay week (Sat 4 pm → Sat 4 pm Chicago); the **single** source for every money figure — the second "$X paid" under Cost per interview goes (F4) |
| **Pay week** | Sun 8 pm → Sun 8 pm Chicago from the switch (Sat 4 pm before it); labelled "Week ending Sun Nov 29" |
| **My bids** | the owner's own bids recorded by Bid Track (never "self bids" in the UI) |

- Week view day cells show **approved** with a small pending badge (as today's board); the Approved/Pending/Pay
  columns add up to the Total row.
- Help you can click: one **"What do these numbers mean?"** popover (button, works on touch) replaces the hover-only
  ⓘ icons; it includes the Saturday overlap note (F9).
- Smaller name fixes from the audit (F7, F13, F21): bidder page tab "This week" → **Days**; History → **Past weeks**;
  one status wording (Active / Invited / Archived) on the list and the bidder page; one rate wording "$0.06 per approved
  bid"; one archive confirm; "← Team" → **← Bidders**.

### Bidders tab table (T2)

- **Week** view (default) columns: Bidder (name, flag, profile) · the period's day (or pay-week) columns · Approved ·
  Pending · Pay · ⋯. About 10 columns instead of 17; one line per cell where possible. **Pay shows only when the
  range is whole pay weeks** (This / Last / Last 2 pay weeks and their stepped versions); for a month or custom range
  the column is hidden with a one-line pointer to the Pay tab, so the page never shows two pay totals for one range.
- **Performance** view columns: Bidder · Bids · Days at 50+ · Interviews (per 100 bids) · Approval · Cost per
  interview · Last bid · ⋯. The comparison card moves here, folded to one summary line that expands.
- The table view is kept in the URL as **`lens=performance`** (absent = Week). `view` is already a page key
  (`Bidders.tsx:26`, cleared on navigation), so it is not reused.
- Keep: sorting, today highlight, sticky name column on narrow screens, Retry, honest "—"/⚠ for unknowns, search
  narrowing rows (totals stay the period's).
- "Looks unused" banner: folded into the Needs attention block as one line with Archive chips.

### My bids tab (T6)

- One row per profile the owner applied with in the range (from `selfRows[].profiles`, already built), the range's
  day/pay-week columns, Total, Interviews (rounds "Applied by: Self"). A Total row.
- A profile name or a day cell opens the read-only panel with that profile's applies (`accountId` filter, already
  built). The panel loses the bid-review parts it can't use (status chips, Status and Checks columns) and says "No
  bids in this period" when empty.
- Admin viewing **All owners**: one block per owner, headed by the owner's name.
- Empty tab: "No own bids in this period. Jobs you apply to with Bid Track signed in as yourself show up here." plus
  the Download Bid Track link.

### Pay tab (T5, summary only)

- Opens on **Last pay week** unless a range is picked. One block per pay week in the range, newest first. The current
  pay week is labelled "so far" (live numbers); a closed one "closed" and shows **the amounts saved with the weekly
  report** (the Slack post; `BidReport` rows, rate as of the report, recounted by later reviews), so the Pay tab, Slack
  and the bidder's Past weeks agree even after a rate edit.
- Per bidder: approved × rate = pay; a ⚠ line when pending bids remain in that pay week ("N pending — not paid until
  reviewed") with a **Review** link (same overlay, that bidder, that pay week); a Total row.
- **Copy pay summary**: plain text for chat or a payment app, e.g.
  `Pay week ending Sat Nov 15\nAna — 158 approved × $0.06 = $9.48\nRaj — 100 × $0.06 = $6.00\nTotal $15.48`
  (pending warnings included as a line per bidder).
- Data: closed weeks from the stored weekly `BidReport`; the week in progress from the live pay-week board
  (`week_board`). No new storage. Month / custom ranges list the pay weeks they touch.
- Archived bidders appear in a pay week only if they have approved or pending bids in it.

### A bidder's own page (T4)

- Header: **← Bidders** at top-left, name, status (list wording), profile link, rate; **Edit** and **Invite code /
  Reset login** as visible buttons; Archive stays in ⋯ (F17). The page title is the bidder's name.
- Week navigation sits in the header.
- A **Performance** line for a chosen period (default Last month; builder may pick a different default and say so),
  with the platform comparison; drilling in from a month view keeps that month for this line (F6).
- Tabs **Days | Past weeks**. Tiles show only on Days.

## Pay week schedule switch (decisions 5–6)

- Today the schedule is three settings (`BID_WEEKLY_REPORT_DAY=saturday`, `BID_WEEKLY_REPORT_TIME=16:00`,
  `BID_DAILY_REPORT_TIME=18:30`, `app/config.py:137-143`) applied to every period, past and future
  (`app/bids/windows.py`, `app/bids/week.py:44`). Changing them would re-cut every past week and day. The switch
  therefore needs a **switch moment** setting: periods that end at or before it keep the old times; periods after it
  use the new ones (weekly Sunday 20:00, daily 18:00). The week ending at the switch is the long one (Sat Nov 14
  16:00 → Sun Nov 22 20:00). The report day that straddles the switch closes at the first new 18:00 cutoff after it.
- Weekly and daily Slack reports, the board, pay weeks, the Pay tab, "Week ending …" labels, period keys and the
  stored `BidReport` rows all follow the switched schedule; reports already posted are not re-posted.
- Note (user's choice): a report day closes at 6 pm but the week at Sunday 8 pm, so bids made Sunday 6–8 pm sit in
  Monday's report day yet in the closing pay week. The help popover explains it (as the Saturday note does today).
- The client stops hard-coding the schedule (`src/lib/bidderFilters.ts` mirrors Sat 16:00 / 18:30 today): the server
  exposes the schedule (including the switch) and the client uses it.
- The weekly Slack post lists each bidder's bids for the week and pay, plus the total (check what
  `app/bids/slack_format.py` already shows; add what is missing).
- Rollout: deploy before Sun Nov 22 2026, 8 pm Chicago, with the new settings set on Railway.

## Steps (each ships on its own)

0. **Pay week schedule switch** (backend + the client's schedule source), deployed before Sun Nov 22, 8 pm Chicago.

1. **Tabs + own-team default + separation + one review flow**: `section` tabs, admin Owner default = Me / All owners,
   rename to Bids, My bids tab (moves Self out of the table, removes the Show switch), the To review block, one overlay with one
   exit, Pay tab placeholder hidden until step 4 (or ship Pay in step 1 if cheap — builder's call).
2. **Names and help + Week/Performance views**: glossary everywhere, the help popover, the two table views, comparison
   card folded into Performance, Needs attention block.
3. **Bidder page**: header, performance line, Days / Past weeks.
4. **Pay tab**: summary per pay week, pending warnings, Copy pay summary.

## Constraints

- Frontend: React 18 + Vite + SWR + Tailwind, the shared filter components (`FilterBar`, `DateRangeFilter` with the
  Bidders pay-week presets, `SearchFilter`, `Segmented`, `useUrlFilters`) — no new UI library.
- Backend changes stay small and additive (e.g. a pending-bids-for-a-period list for Review all across pay weeks).
- Every new URL key is defaulted out of the URL; every old key keeps working (see Anti-goals).
- Tests: vitest for new pure mapping (URL ↔ tab/owner/view), component tests for the tabs and the review exit; pytest
  for any server change. The local `.env` in a worktree breaks two backend tests — run suites with it moved aside.

## Left to the builder

- Exact visual styling within the existing look; icon choices; the popover's wording beyond the glossary.
- Whether the bidder page's Performance default period is Last month.
- How "Review all" over a multi-pay-week range is served (new endpoint vs looping pay weeks client-side).
- Whether the Pay tab ships in step 1 or step 4.

## Step 5 — Daily and weekly bids Slack posts (added 2026-11-16, approved by the user)

After steps 1–4 ship. Today's daily post lists every bidder, empty or not (Sun Nov 15: 29 rows, 23 with no bids),
and offers only "View in app" (`app/bids/slack_format.py`).

- **Leave out empty rows**: a bidder with no approved, pending or rejected bids in the period is not listed; an owner
  whose bidders all have none is not listed. Rows that failed to read (⚠) stay. Nobody with bids → "No bids today."
  (weekly: "No bids this week.").
- **One line per bidder** in the page's words: `🇵🇭 Ana · Dev-A — 160 approved · 12 pending` (rejected only when > 0).
- **Owner header + one link button per owner**: `@Owner — 380 approved · 32 pending` with **Review N pending** when
  pending > 0 (deep link to the Bids page review overlay filtered to that owner's pending bids — the step-1 single
  review flow; login keeps the link), else **Open Bids**. Plain URL buttons: no Slack interactivity needed.
- **My bids line per owner** (user: yes): `My bids — 35 (Arda 12 · Cory 23)`, only when > 0, never in the totals.
- **Footer**: `Total: 520 approved · 32 pending · 3 bidders with bids · View in app`.
- **Weekly pay post**: same cleanup; per owner pay as today; an **Open Pay** button to that week on the Pay tab
  (`/bidders?section=pay&range=pay_week&date=<a day of that week>`).
- Keep: one post per period, edit-in-place after reviews, Slack's 50-block / 3,000-char limits (split into
  "(cont.)" sections and thread replies as today).
