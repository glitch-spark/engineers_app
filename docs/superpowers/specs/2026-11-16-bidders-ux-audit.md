# Bidders page (`/bidders`) UX audit

Date: 2026-11-16. Branch `feat/app-reorg` (app `wt/app-reorg`, server `wt/backend-reorg`). I read the code and did
not run the app, so everything below comes from what the code renders. Paths are relative to `src/` unless they start
with `docs/` or `app/` (server). "Guess" marks anything I could not confirm from the code. Example numbers in the
sketches are made up.

---

## 1. Map of the page today

### 1.1 URL states and how screens nest

| URL | Screen | Source |
|---|---|---|
| `/bidders` (+ `range, date, from, to, q, show, archived, owner`) | **List** | `pages/Bidders.tsx:195-231`, `lib/bidderFilters.ts:9-15` |
| `?bidder=<id>&week=<Sat>` | **One bidder's view**, "This week" tab | `Bidders.tsx:246-259` |
| `…&tab=history` | Bidder view, **History** tab | `components/bidders/BidderView.tsx:163,201-202` |
| `…&day=<YYYY-MM-DD>` | **Day panel** (side panel over the bidder view) | `BidderView.tsx:63,219-235` |
| `…&mode=focus[&bid=<id>]` | **Review overlay** (full screen over whatever is below) | `Bidders.tsx:149-168,271-281` |
| (no URL; component state) | **Self panel** (side panel) and its screenshot modal | `Bidders.tsx:49,311`; `SelfBidsPanel.tsx:20-82` |
| `?week=` / `?period=` / `?view=` | Old keys: `week` and `period` still pick the list period; `view` is ignored | `bidderFilters.ts:55-69,204-211`; `Bidders.tsx:23-26` |

Filter changes replace the history entry (`lib/useUrlFilters.ts:13,64`). Opening a bidder, a day or the overlay
pushes a new entry (`Bidders.tsx:55-66`), so the browser's Back closes them one at a time.

### 1.2 List view (top to bottom)

1. **Page header**: "Bidders" plus two buttons, **Download Bid Track** (the install steps are only in its hover
   `title`) and **Add bidder**. Both are hidden in the bidder view (`Bidders.tsx:282-297`, tooltip `:290`).
2. **Red banner** "⛔ N bidders need attention": one sentence per flagged bidder (inactive, rejects, no interviews,
   review backlog) with **Open profile** or **Review** links. Shows 8, then "Show all N". It can't be dismissed and
   ignores the period filter (`BidderAlerts.tsx:31-64`, `lib/bidderInsights.ts:115-130`, `Bidders.tsx:117-122`).
3. **Grey banner** "N bidders look unused." with an **Archive** chip per bidder (`BidderAlerts.tsx:66-84`).
   Admins on "All users" get neither banner (`Bidders.tsx:119`).
4. **Filter bar**, in this order: Owner (admin only), Show [All | Bidders | Self], Show archived switch, "Search
   bidders…", Date range [This pay week ▾] with ‹ label ›, and Clear (`biddersFilters.tsx:77-116`). Presets: This pay
   week, Last pay week, Last 2 pay weeks, This month, Last month, Custom (`bidderFilters.ts:31-38`). The label comes
   from the server, e.g. "Week ending Sat Nov 15" (`app/bids/week.py:83-85`).
5. **Totals strip** (one line): `N approved · $X pay │ N to review [Review all] │ N rejected │ Today N (M pending)`
   (`lib/bidderPage.ts:13-29`, `BiddersOverview.tsx:108-118`). Review all appears only when the period is a single
   pay week (`:113`). Today appears only for the current pay week (`app/routers/bids.py:472-474`).
6. **Comparison card** (open by default, Hide/Show remembered in the browser): "Your N bidders vs the platform
   average", a period chip, five cells (Bids per weekday, Days at 50+, Approval rate, Interviews per 100 bids, Cost per
   interview), then "Top bidders" with 5 lines and a standing chip (`BiddersBand.tsx:28-76`,
   `bidderInsights.ts:36-112`). It loads with its own request and only renders once that request has data
   (`BiddersOverview.tsx:74-80,120`).
7. **Records note** (month and custom only): "Bids before … were counted from screenshot folders and aren't included."
   (`BiddersOverview.tsx:131-135`).
8. **Table**: 17 columns in week mode, every header sortable, an ⓘ hover tip on 7 of them
   (`BiddersTable.tsx:265-280`). Rows have 2–3 lines per cell. A **Total** row follows, then the **Self** rows in the
   `<tfoot>` (`:374-399`).

```
Bidders                                              [Download Bid Track] [Add bidder]
┌ ⛔ 2 bidders need attention ─────────────────────────────────────────────────────────┐
│ Ana → 18 bids waiting for review since Nov 9.  Review                                │
│ Raj → 300 bids, no interviews: check the profile Dev-A and its target roles. Open profile│
└──────────────────────────────────────────────────────────────────────────────────────┘
┌ 1 bidder looks unused. Archive them to keep the list focused.                        ┐
│ [Lee  No bids in 2 weeks (last Oct 30)  (Archive)]                                   │
└──────────────────────────────────────────────────────────────────────────────────────┘
┌ SHOW [All|Bidders|Self]  (o) Show archived  [🔍 Search bidders…]                      ┐
│ Date range [This pay week ▾]  ‹ Week ending Sat Nov 15 ›                     [Clear] │
└──────────────────────────────────────────────────────────────────────────────────────┘
┌ 743 approved · $44.58 pay │ 18 to review [Review all] │ 2 rejected │ Today 0 (18 pending) ┐
┌ Your 5 bidders vs the platform average           [Week ending Sat Nov 15] [Hide]     ┐
│ Averages count only bidders with bids: 4 of yours, 23 on the platform (yours incl.)  │
│ [Bids/weekday 41][Days at 50+ 60% ▲][Approval 94%][Interviews/100 0.8][Cost/int $8]  │
│ Top bidders  Most bids  Ana 412  🏆 Best on the platform                             │
│              Best conversion  Raj 0.80 / 100  −0.10 per 100  top: Kim (Bo) 0.90 / 100│
│              … 3 more lines                                                          │
└──────────────────────────────────────────────────────────────────────────────────────┘
┌──────────────────────────────────────────────────────────────────────── scrolls → ───┐
│BIDDER          SUN MON TUE WED THU FRI SAT  BIDS  PAY   REVIEW 50+ DAYS   INTERVIEWS APPROVAL COST/INT. LAST BID ⋯│
│🇵🇭 Ana          52  61  45³  –   –   –   –   163   $9.06  3 →   67%       2          96%      $5        2h ago  ⋯│
│ Dev-A·$0.06/bid                             ↑12%              2 of 3 ·   0.80/100 ▲ 50 of 52 $9 paid           │
│ Active · @ana                                                 streak 1·best 2                                 │
│                                                               ●●◌◌◌◌◌                                         │
│ … one block like this per bidder                                                                              │
│Total            …                           740   $44.58 18    60%       5          94%      $8                │
│▾ Self · 2 profiles · Own applies from the extension · not in the totals   10 12 …  22  —  —  —  1  —  —  3h ago │
│     Dev-A        6   7 …                                                 13  —  —  —  1  —  —                 │
│     Dev-B        4   5 …                                                  9  —  —  —  0  —  —                 │
└──────────────────────────────────────────────────────────────────────────────────────┘
```

In month and custom mode the 7 day columns become one column per pay week ("Nov 2–8", "part"), the Review badge can't
be clicked, and the strip has no Review all or Today (`lib/bidderPage.ts:58-73`, `BiddersTable.tsx:311,322-326`).

**What clicking each part does**:
- Row → that bidder's view (`BiddersTable.tsx:289-290`).
- Day cell → the bidder's view with that day's panel open (`:305-309`).
- "N →" in Review → the overlay over that bidder's pending bids for the pay week (`:322-325`).
- ⋯ → Edit / New invite code / Reset login / History / Archive. For an archived bidder: History / Restore
  (`BidderActions.tsx:62-71`).
- Self row, day cell or profile sub-row → the Self panel (`BiddersTable.tsx:135-146,171-209`).

### 1.3 One bidder's view (`?bidder=`)

From top to bottom (`Bidders.tsx:180-183,246-259`; `BidderView.tsx:167-217`):

1. Page title "Bidders". The header buttons are gone.
2. **WeekNav**: ‹ "Week ending Sat Nov 15 · pay week" › plus a **This week** button when you're on a past week. The
   "· pay week" text is hidden on phones (`WeekNav.tsx:20-48`).
3. **Header panel**:
   - **← Team** button.
   - Flag, name, and the raw status badge (`active` / `invited` / `archived`).
   - "Profile X · resume names · $0.06 per approved bid".
   - ⋯ menu, only for your own bidders (`BidderView.tsx:169-191`).
4. **Tiles**:
   - Approved, with "$X pay" under it.
   - To review, with "oldest first" and a **Review pending** button.
   - Rejected, with "mostly <reason>".
   - Today, current week only (`BidderView.tsx:146-160`, `SummaryTiles.tsx:22`).
5. **Tabs** "This week | History" (`BidderView.tsx:195-217`):
   - **This week**: 7 day rows, Sun → Sat. Each shows the date, a Today badge, the window "Sat 6:30 PM → Sun 6:30 PM"
     (hidden on phones), an amber dot and Approved / Pending / Rejected chips, and ›. Future days are disabled
     (`DayRow.tsx:31-66`).
   - **History**: a table of stored weekly reports with Week ending, Approved, Pending, Rejected, Rate and Pay. A row
     opens that week in the "This week" tab (`HistoryTab.tsx:8-78`).

```
Bidders
[‹] Week ending Sat Nov 15 · pay week [›]   [This week]  (shown on past weeks)
┌──────────────────────────────────────────────────────────────────────────┐
│ [← Team]  🇵🇭 Ana  (active)                                            ⋯ │
│           Profile Dev-A · Ana_CV.pdf, Ana_CV_2.pdf · $0.06 per approved bid │
└──────────────────────────────────────────────────────────────────────────┘
┌ APPROVED ──┐┌ TO REVIEW ─────┐┌ REJECTED ────┐┌ TODAY ─────────┐
│ 160        ││ 3              ││ 2            ││ 45             │
│ $9.60 pay  ││ oldest first   ││ mostly Dupl. ││ 3 pending      │
│            ││[Review pending]││              ││                │
└────────────┘└────────────────┘└──────────────┘└────────────────┘
[ This week | History ]
┌──────────────────────────────────────────────────────────────────────────┐
│ Sun Nov 9          Sat 6:30 PM → Sun 6:30 PM   Approved 52 Pending 0 Rejected 0 › │
│ Mon Nov 10         Sun 6:30 PM → Mon 6:30 PM   Approved 61 Pending 0 Rejected 1 › │
│ Tue Nov 11 [Today] Mon 6:30 PM → Tue 6:30 PM ● Approved 45 Pending 3 Rejected 1 › │
│ Wed Nov 12 … Sat Nov 15 (future, disabled)                                  – │
└──────────────────────────────────────────────────────────────────────────┘
```

### 1.4 Day panel (right side panel, full width on phones)

The panel is laid out like this (`DayPanel.tsx:137-358`, `SidePanel.tsx:40-66`):
- **Title and subtitle**: "Tue Nov 11 · Ana" over "N bids".
- **Status chips**: Pending / Approved / Rejected / All, with counts. It opens on Pending when there are any
  (`:85-86`).
- **View toggle**: Table | Screenshots, remembered in the browser.
- **Hint line**: "Click a bid to review it full screen · tick rows to approve or reject several".
- **Approve all complete (N)**. The word "complete" is defined only in a hover `title` (`:196-206`).
- **Table**: checkbox, time, thumbnail, job title + URL, **Checks** (Submitted / Not marked submitted / Missing upload),
  Status, and ✓ / ✗ icon buttons (`:221-322`).

Ticking rows shows **Approve** and **Reject…**. Reject… opens the bulk-reject modal (5 reasons; "Other" isn't allowed
in bulk) (`:348-357`). ✗ on one row opens the **Reject bid** modal (`RejectDialog.tsx:38-84`). Approve all complete
opens a confirm (`BidderView.tsx:244-253`). Clicking a row opens the overlay at that bid and walks the shown list.

### 1.5 Review overlay (`mode=focus`)

A full-screen dark layer (`FocusReview.tsx:392-400`):
- **Toolbar**: Close (Esc), the progress line "Bid 3 of 12 pending · 4 approved · 1 rejected", the scope "Week ending
  … · Ana" or "… · All bidders", ← →, and Undo (U) (`FocusToolbar.tsx:28-49`, `FocusReview.tsx:418-440`).
- **Left side**: the screenshot of the current step, scrollable, with the step strip under it. It opens on the Submit
  screenshot (`StepViewer.tsx:14-18,66-140`).
- **Right side**: Bidder, a blue "The form should use" box (profile, resumes, tailored resume), Job, Job URL, Steps,
  Duration, First shot, Attached files, warning flags, Status, Reviewer and Note (`BidEvidence.tsx:51-138`).
- **Actions**: Approve (A) and Reject (R). Reject expands 6 reason buttons (keys 1–6) and a note field
  (`ReviewActions.tsx:33-92`).
- **Keyboard help line**, hidden on phones (`FocusReview.tsx:491-494`).

Each decision shows a 6-second toast with Undo. Afterwards the overlay moves to the next bid (`:235-289`). The end state
reads "All bids for <label> reviewed" with a **Back** button (`:442-453`).

### 1.6 Self panel

The Self panel reuses the day panel in read-only mode. Its title is "Self · [owner] · [profile] · <day or 'this pay
week'>" and its subtitle is "Your own applies from the Bid Track extension". The status chips are hidden with
`invisible`, so they still take up space. The Table / Screenshots toggle and the Checks and Status columns stay
(`SelfBidsPanel.tsx:13-51`, `DayPanel.tsx:141,178-179,282-295`). Clicking an apply opens a **modal** over the panel
with the job link and the step viewer (`SelfBidsPanel.tsx:52-80`).

### 1.7 All modals and dialogs

| Dialog | Opened from | Source |
|---|---|---|
| Add bidder / Edit bidder (Name, Country opt., Profile, Rate per bid; Edit also shows "Folder: …") | Header button; ⋯ → Edit | `BidderFormModal.tsx:106-165` |
| Invite code (code, Copy, "Copy instructions + code", Done; "You won't be able to see this code again") | After Add; ⋯ → New invite code; after Reset login | `InviteDialog.tsx:37-61` |
| Reset login confirm (danger) | ⋯ | `BidderActions.tsx:90-99` |
| Archive confirm, version 1 (danger, "They'll stop appearing in reports. History is kept.") | ⋯ | `BidderActions.tsx:101-110` |
| Archive confirm, version 2 (default tone, "They're signed out of the extension; you can restore them any time.") | Grey banner | `Bidders.tsx:313-322` |
| Restore confirm (two wordings) | ⋯ on an archived row | `BidderActions.tsx:112-123` |
| Reject bid (reason radios + note) | Day panel ✗ | `RejectDialog.tsx:38-84` |
| Reject N bids (bulk; 5 reasons) | Day panel, Reject… | `DayPanel.tsx:348-357` |
| Approve all complete confirm | Day panel | `BidderView.tsx:244-253` |
| Self apply screenshots (modal over a side panel) | Self panel row | `SelfBidsPanel.tsx:52-80` |
| ⋯ action menu (portal popover) | Row / bidder header | `components/ActionMenu.tsx` |

### 1.8 Loading, error and empty states

- **Loading**: skeletons on the list, bidder view and day panel (`BiddersOverview.tsx:98-103`;
  `Bidders.tsx:237-245`; `DayPanel.tsx:212-215`); "Loading bids..." in the overlay (`FocusReview.tsx:412-414`); "…"
  as the period label (`bidderFilters.ts:262`).
- **Errors**: each has a Retry ("Couldn't load bidders", "Couldn't load the week", "Couldn't load history", the
  overlay's "Try again", screenshots). Exceptions: the card and banners silently don't render on error
  (`BiddersOverview.tsx:120`, `Bidders.tsx:299`), and the day panel's error has no Retry (`DayPanel.tsx:210-211`).
- **Empty**:
  - "No bidders yet" + Add bidder. This changes to "No bidders in this period." when Show archived is on
    (`Bidders.tsx:225-229`).
  - Owner with no bidders: "This user has no (active) bidders" + Show all users (`:219-223`).
  - "No bidders match '…'" + Clear search (`BiddersOverview.tsx:137-141`).
  - Day panel: "No bid records this day." / "No pending bids this day." (`DayPanel.tsx:216-219`).
  - History: "No weekly reports yet — the first one posts at the next weekly cutoff." (`HistoryTab.tsx:28-30`).

---

## 2. The main jobs and their click paths today

Step counts are clicks or key presses, not counting reading or scrolling.

**A. Review today's pending bids.** You can't get a "today, all bidders" list.
- *Whole pay week, all bidders*: strip **Review all** (1) → A, or R+1–6, per bid → Esc (2). It walks every pending bid
  of the pay week, oldest first, not just today's. **2 + 1–2 per bid.**
- *One bidder, from the row*: **3 →** (1) → decide each bid → Esc (2). You land on the bidder's view, not the list,
  because `onReview` sets `bidder` (`Bidders.tsx:199`). Then **← Team** (3). **3 + per bid.**
- *Today only, per bidder*:
  - today's cell (1) → panel opens on Pending → Approve all complete (2) → Approve N (3);
  - click the first leftover bid (4) → decide → Esc (5);
  - ✕ (6) → ← Team (7).
  - **About 7 per bidder + per bid**, repeated for each bidder.
- *From the red banner*: **Review** opens the day panel on the oldest waiting day, not the overlay
  (`BidderAlerts.tsx:50-54`). Any later days take one more click each.

**B. Check whether a bidder is doing well.** Date range ▾ → Last month (2). Find the row (0–1). Read 5 dense cells,
some needing a horizontal scroll: Bids ↑↓%, 50+ days, Interviews, Approval, Cost / int. Hovering about 4 ⓘ icons
explains them. Opening the bidder (+1) shows only Approved / To review / Rejected for one pay week. **About 3 clicks + 4
hovers, and the answer only exists on the list.**

**C. Pay a bidder for the week.** The page has no pay flow and no "paid" marker.
- Date range ▾ → Last pay week (2).
- If the strip shows "to review" > 0: Review all (3) → decide → Esc (4).
- Read the row's Pay and pay outside the app.
- Alternative: bidder (1) → History (2) → Pay for "Week ending …".
- **2–4 clicks + manual bookkeeping.** The page opens on the open (unfinished) pay week by default
  (`bidderFilters.ts:39`).

**D. Add or invite a bidder.**
- Add bidder (1) → 4 fields (Rate starts blank) → Save (2) → Copy instructions + code (3) → paste it somewhere else →
  Done (4).
- The bidder also needs the extension: Download Bid Track (1). The install steps are only in a hover tooltip.
- New code later: ⋯ (1) → New invite code (2) → Copy (3) → Done (4).

**E. Archive a bidder.**
- ⋯ (1) → Archive (2) → confirm (3).
- Or grey banner Archive (1) → confirm (2).
- Restore: Show archived (1) → ⋯ (2) → Restore (3) → confirm (4).

**F. Look at own self bids per profile.**
- Scroll below Total, or Show: Self (1). With 2+ profiles the per-profile sub-rows are open by default.
- Profile sub-row (1) → panel → apply (2) → screenshots modal → close (3) → close panel (4).
- **About 4.** In month mode the cells can't be clicked, and a row click shows one pay week only (finding 12).

**G. An admin checking one owner's team.**
- Owner ▾ (1) → pick (2). The banners and card appear only now; on "All users" they're hidden.
- Bidder (3) → view with no ⋯ menu.
- Nothing explains why the admin can't edit or archive these bidders.
- **2–3.**

**Other jobs found in the code:** **H.** inspect one bid's proof: day cell (1) → bid (2) → ↑/↓ steps, F full size.
**I.** undo a decision: U or the 6 s toast in the overlay; the day panel's ✓ / ✗ have no undo. **J.** fix a bidder's
login: ⋯ → Reset login → confirm → copy → Done (5). **K.** change rate or profile: ⋯ → Edit → Save (3+). **L.** past
weeks: bidder (1) → History (2) → week row (3), landing on a tab still called "This week". **M.** act on the banners.

---

## 3. Friction findings, ranked by how much they hurt everyday use

**1. The list puts six blocks in front of the table, and the table is 17 columns of 2–3-line cells. Severity: high.**
- **What the user sees**: header, red banner, grey banner, filter bar, strip, card (open by default), records note,
  then the table (`Bidders.tsx:282-309`; `BiddersOverview.tsx:108-157`; `BiddersTable.tsx:265-280`).
- **Why it hurts**: the daily questions (who has pending bids, how today is going) sit below at least one screen of
  analysis. A single row stacks name, profile, rate and status, plus a 50+ cell with %, "N of M · streak · best" and a
  dot strip (`:291-299,329-337`).
- **Why it's slow**: for 7 non-technical users this reads as a dashboard to study, not a page to act on.

**2. Four ways into review, with two destinations and different exits. Severity: high.**
- **Entry points**:
  - Strip **Review all** → overlay, which returns to the list.
  - Row **N →** → overlay, which returns to the *bidder view* (`Bidders.tsx:199` sets `bidder`).
  - Banner **Review** → the day panel, not the overlay (`BidderAlerts.tsx:50-54`, `Bidders.tsx:302`).
  - Tile **Review pending** → overlay (`BidderView.tsx:156`).
- **Gaps**: no scope is "today". Month and Last 2 pay weeks give a non-clickable amber number with no way to review
  from there (`BiddersTable.tsx:326`, `BiddersOverview.tsx:113`).

**3. "Bids", "approved" and "pending" mean different things in neighbouring cells. Severity: high.**
- **Bids column**: approved + pending (`BiddersTable.tsx:21,316`).
- **Strip "approved" and "Today N"**: approved only (`bidderPage.ts:18,25`).
- **Week day cells**: approved, with a separate amber pending badge (`TeamWeekTable.tsx:11-26`).
- **Month pay-week cells**: approved + pending (`BiddersTable.tsx:311`).
- **Sorting a day column**: sorts by approved only (`:87`).
- **50+ days**: counts approved + pending (`:24`).
- **Pay**: approved only (`:22`).
- **Why it hurts**: nothing on screen says which is which, except hover tips.

**4. One row can show two different pay amounts. Severity: high.**
- **What the user sees**: in week mode, the Pay column uses the pay-week window, Sat 16:00 → Sat 16:00
  (`bidderPage.ts:38-42`). The "$X paid" under Cost / int. uses the report-day sum `r.pay` (`BiddersTable.tsx:361`).
  The server computes them differently (`app/routers/bids.py:461-471`).
- **Why it hurts**: the numbers can differ for the same bidder and week. "paid" suggests money already sent, and the
  app has no such record.

**5. No pay close-out flow. Severity: high.**
- **What the user sees**: the default period is the *open* pay week (`bidderFilters.ts:39`). To pay last week, you
  must know to pick "Last pay week".
- **Why it hurts**:
  - Pay counts approved bids only. Nothing next to Pay warns that pending bids are left out, even though pay is the
    bidder's money (`BiddersTable.tsx:319`).
  - The app has no paid marker and no per-week pay summary to copy.
  - The History tab shows one bidder at a time (`HistoryTab.tsx:32-77`).

**6. The bidder view lacks the bidder's performance, and drilling in loses the period. Severity: high.**
- **What the user sees**: the tiles are Approved / To review / Rejected / Today (`BidderView.tsx:149-160`). 50+ days,
  interviews, approval, cost per interview and last bid exist only in the list row.
- **Losing the period**: clicking a bidder while the list shows "Last month" opens the single pay week holding the
  month's last day (`BiddersOverview.tsx:82,147`). The bidder view's own WeekNav only steps pay weeks.
- **Why it hurts**: the screen meant for one bidder can't answer "is this bidder doing well?".

**7. The same thing goes by different names. Severity: medium.**
- **Pending**: "to review" (strip), "Review" (column), "To review" (tile), "Pending" (chips), "waiting for review"
  (banner) (`bidderPage.ts:19`; `BiddersTable.tsx:274`; `DayPanel.tsx:131`; `bidderInsights.ts:126`).
- **"This week"**: the tab label shows *any* week (`BidderView.tsx:196`), while WeekNav's **This week** means "jump to
  the current week" (`WeekNav.tsx:43-47`).
- **Week**: the period is "This pay week" in the filter but "Week ending …" in the labels. Elsewhere in the app a
  week runs Mon–Sun (`docs/…/2026-11-14-app-reorganization-design.md:156`).
- **Rate**: "$0.06/bid" (`BiddersTable.tsx:297`), "per approved bid" (`BidderView.tsx:187`), "Rate per bid"
  (`BidderFormModal.tsx:139`), "Rate" (`HistoryTab.tsx:41`).
- **Status**: "Active · @ana" in the list (`Bidders.tsx:30`), a raw `active` badge in the view (`BidderView.tsx:181`).
- **Back**: "← Team", "Back to the team", "Close", "Back" (`BidderView.tsx:175`; `Bidders.tsx:263`;
  `FocusToolbar.tsx:31`; `FocusReview.tsx:450`).
- **Self**: "bids" in the table, "applies" in the Self rows and panel (`BiddersTable.tsx:188`; `DayPanel.tsx:179`).
- **Pending colour**: amber in chips, grey in status badges (`DayPanel.tsx:15`; `BidEvidence.tsx:8`).

**8. The meaning of numbers lives in hover tooltips. Severity: medium.**
- **Where the tooltips are**:
  - Column ⓘ icons (`BiddersTable.tsx:247-251`).
  - The Bids split (`:315`) and the average per weekday (`:329`).
  - Dot meanings (`:41`) and the amber "stale" Last bid (`:365`).
  - ⚠ for "couldn't read" (`:77`; `TeamWeekTable.tsx:13`).
  - "complete" (`DayPanel.tsx:201`).
  - The Bid Track install steps (`Bidders.tsx:290`).
  - The ↑/↓ % under Bids has no tooltip at all (`BiddersTable.tsx:49-55`).
- **Why it hurts**: touch screens can't hover, and non-technical users don't hunt for ⓘ icons.

**9. The Saturday overlap goes unexplained on the list. Severity: medium.**
- **What happens**: day cells are report days that close at 18:30, while Bids / Pay use the pay week that closes at
  Sat 16:00 (`docs/…/bidders-single-page-design.md:93-98`). So the day cells don't add up to Bids on Saturday.
- **Why it hurts**: the tip that explained this exists only in `TeamWeekTable.tsx:49-51,69-71`, which the page no
  longer renders. Only its `DayCount` and `FOLDER_TIP` are still imported. `BiddersTable` has no equivalent.

**10. The overlay mislabels the week when opened from the list. Severity: medium. Likely, verify in the browser.**
- **What happens**: the list passes the pay week's *first* day, a Sunday (`BiddersOverview.tsx:82,114,148`). The overlay
  formats any week key as "Week ending <that day>" (`FocusReview.tsx:63-67`).
- **What the user sees**: "Week ending Sun Nov 9" in the overlay, while the filter bar says "Week ending Sat Nov 15".
  The end state repeats the wrong date (`:448`).

**11. The same information appears twice. Severity: medium.**
- **Strip vs Total row**: approved/pay/to review appear in both (`BiddersOverview.tsx:108-118`; `BiddersTable.tsx:383-385`).
- **Dot strip vs day columns**: in week mode, the dot strip in "50+ days" repeats the 7 day columns next to it
  (`:336`, which shows for ≤ 31 days).
- **Top bidders vs sorting**: the card's "Top bidders" repeats what sorting the table shows (`BiddersBand.tsx:48-74`).
- **Banner backlog vs Review column**: the banner's backlog sentence repeats the Review column.
- **History**: it's both a ⋯ item and a tab (`BidderActions.tsx:62,69`).

**12. Self applies are bolted onto the bidders table. Severity: medium.**
- **Empty cells**: 6 of the 9 metric cells are "—" (`BiddersTable.tsx:147-161`).
- **Wrong period in the panel**:
  - The panel says "this pay week" even when the list shows last week or a month (`SelfBidsPanel.tsx:14-16`).
  - In month mode it opens only the pay week holding the month's end (`BiddersOverview.tsx:153`), and the month
    cells can't be clicked (`BiddersTable.tsx:138`).
- **Irrelevant columns**: the panel shows a Status column where every row is "approved" (self bids are auto-approved).
  Its Checks column shows "Not marked submitted" even though self bids don't need a Submit screenshot (`DayPanel.tsx:282-295`;
  `docs/…/self-bids-extension-design.md:47,129`).
- **Wrong subtitle for admins**: "Your own applies" shows when an admin views another owner's (`SelfBidsPanel.tsx:38`).
- **Wrong empty text**: "No bid records this day." shows for a week scope (`DayPanel.tsx:218`).

**13. Jargon. Severity: medium.**
- **Terms in labels**: "50+ days", "streak · best", "/ 100", "Cost / int.", "Checks", "Not marked submitted",
  "Approve all complete", "folder count, not reviewed", "counted from screenshot folders", "platform average", "Self",
  "Reset login", and "Folder: … (url)" in the edit form (`BiddersTable.tsx:275-278,333,342`; `DayPanel.tsx:236`;
  `TeamWeekTable.tsx:8`; `BiddersOverview.tsx:133`; `BidderFormModal.tsx:155-159`).
- **The card's subtitle**: "Averages count only bidders with bids: X of yours, Y on the platform (yours included)."
  (`BiddersBand.tsx:32-35`).

**14. Narrow screens. Severity: medium.**
- **The table**: 17 columns scroll sideways with no sticky name column or header (`BiddersTable.tsx:261-262`;
  `index.css:112`), so you lose track of whose row it is.
- **The day panel**: its table has `min-w-[720px]` inside a full-width phone panel (`DayPanel.tsx:222`).
- **The overlay**: below `lg` it stacks a screenshot up to 70vh above the details and the Approve / Reject buttons
  (`FocusReview.tsx:459`; `StepViewer.tsx:94`). Every bid needs a scroll to act, and the key help is hidden
  (`FocusReview.tsx:491`).

**15. The bidder view's layout and navigation. Severity: medium.**
- **Order**: the WeekNav sits *above* the bidder's header and its ← Team button (`Bidders.tsx:180-183`;
  `BidderView.tsx:169-176`), so "back" isn't top-left.
- **Title**: the page title stays "Bidders" (`Bidders.tsx:283`).
- **History tab**: the tiles stay on screen showing the WeekNav's week while the tab lists every week
  (`BidderView.tsx:193-202`).
- **No profile link**: the profile name doesn't link to the profile (`:184-186`).

**16. The page shifts while loading. Severity: low. Guess on how noticeable it is.**
- **What happens**: the banners and the card each have their own request and appear only once loaded, *above* the
  table (`Bidders.tsx:118-122,299`; `BiddersOverview.tsx:74-80,120`).
- **Why it hurts**: the table jumps down after first paint, sometimes under the cursor.

**17. Management actions are hidden in ⋯. Severity: low.**
- **What the user sees**: Edit, invite code, reset and archive are only in the ⋯ menu (`BidderActions.tsx:62-71`).
- **Restore**: you must first turn on Show archived (`Bidders.tsx:97`).
- **Admins**: for other owners' bidders the ⋯ menu just isn't there, with no hint why (`Bidders.tsx:209-218`).

**18. Search narrows the rows but not the totals. Severity: low.**
- **What happens**: the strip and most Total-row cells keep the full team's numbers (`BiddersOverview.tsx:41,84`;
  `BiddersTable.tsx:383-389`). In month mode, though, the Total row's pay-week cells sum only the matching rows
  (`:380`, fed `shown` at `BiddersOverview.tsx:144`).
- **Why it hurts**: one Total row mixes filtered and unfiltered sums.

**19. Empty-state gaps. Severity: low.**
- **Show = Self with no self bids**: you get a bare table header and no message (`BiddersTable.tsx:226,375,392`;
  `BiddersOverview.tsx:86`).
- **"No bidders in this period."**: shows with Show archived on, though the list doesn't depend on the period
  (`Bidders.tsx:226`).
- **"No bidders yet"**: doesn't mention Bid Track or the invite step.

**20. The reject note must be typed before picking a reason, but it sits below the reasons. Severity: low.**
- **Where**: the overlay's reject area: the note field and its label "type it before picking a reason"
  (`ReviewActions.tsx:52-70`).
- **Why it hurts**: clicking a reason rejects at once, so a note typed afterwards is lost.

**21. The two archive confirms disagree. Severity: low.**
- **What the user sees**: one is danger-toned and says "stop appearing in reports" (`BidderActions.tsx:101-110`). The
  other is neutral and says "signed out of the extension; restore any time" (`Bidders.tsx:313-322`).

**22. A to-do looks like an error. Severity: low.**
- **What the user sees**: the review backlog shows in the red ⛔ banner with `role="alert"`, and it can't be dismissed
  (`BidderAlerts.tsx:31-36`). Every visit with pending bids opens on red.

**23. Onboarding friction. Severity: low.**
- **Rate**: blank, with no hint (`BidderFormModal.tsx:139-151`).
- **Profile**: not marked optional, though "No profile" is allowed (`:62-67,127-135`).
- **Invite text**: says "Install Bid Track" but doesn't link to the download (`InviteDialog.tsx:10-12`).

**24. Small state surprises. Severity: low.**
- **Sort is forgotten**: the table forgets its sort after visiting a bidder, because it's component state
  (`BiddersTable.tsx:221`) and the overview unmounts (`Bidders.tsx:195`).
- **Week carries over (guess, verify)**: the bidder view writes `week` (`Bidders.tsx:256`), and the list reads `week`
  as its period when no `range` is in the URL (`bidderFilters.ts:209-210`). So after browsing an older week in a
  bidder view, ← Team may open the list on that week, but only when the list was on the default preset.

---

## 4. What already works well (keep)

- **Filters in the URL**: they survive reload, Back and a bidder visit, and old links still work
  (`bidderFilters.ts:1-15`; `biddersFilters.tsx:42-45`).
- **The review overlay**: keyboard-first, opens on the Submit screenshot, prefetches the next bid's screenshots, keeps
  a 50-step undo, and shows a "Changed by …" notice when someone else decided first (`FocusReview.tsx:199-211,235-321`;
  `StepViewer.tsx:14-18`). It also parks focus so a held Enter can't act on the next bid unseen (`FocusReview.tsx:174-177`).
- **"The form should use" box**: puts the expected profile and resume next to the screenshot, which is the actual
  check a reviewer makes (`BidEvidence.tsx:64-88`).
- **Day panel**: opens on Pending, offers "Approve all complete" (re-checked by the server), bulk ticks, and a
  remembered Table / Screenshots view (`DayPanel.tsx:85-101`; `BidderView.tsx:115-134`).
- **Banners**: one plain sentence and one action each, and they clear themselves when the cause goes away
  (`bidderInsights.ts:115-136`).
- **Honest unknowns**: "—" and ⚠ instead of fake zeros for folder weeks and read failures (`bidderPage.ts:7-8`;
  `BiddersTable.tsx:72-80`).
- **Card verdicts**: a "too few to judge" threshold stops small samples being over-read (`bidderInsights.ts:17-32`).
- **Invite status**: invite expiry shows in red on the row (`Bidders.tsx:33-35`).
- **Invite sharing**: "Copy instructions + code" is one copy for a chat message (`InviteDialog.tsx:51-57`).
- **Today highlighting**: today's column and day row are highlighted (`BiddersTable.tsx:302`; `DayRow.tsx:31`).
- **Every column sortable**, and the per-profile Self split can be folded.
- **Errors**: almost every one comes with Retry.

---

## 5. Improvement themes

### Theme 1: One review inbox (one way in, one way out). Effort: medium

**Fixes** 2, 10, 22 and part of 5 and 14.
- **One entry block**: replace the strip's review item and the red backlog sentence with a "To review" block at the
  top of the list. It shows the pending count, the oldest day, a chip per bidder, and **Review all**. It works for any
  period, including leftovers from earlier weeks. Today the overlay takes a day or a week (`FocusReview.tsx:60`); a
  period scope would likely need a small server change (guess).
- **One destination**: every Review button (strip, row badge, banner, tile) opens the overlay.
- **One exit**: Close always returns to the screen it came from, so the list must not set `bidder`
  (`Bidders.tsx:199`).
- **Scope toggle**: the overlay gets **Today only / This week** and uses the server's period label.
- **Phones**: a sticky Approve / Reject bar at the bottom of the overlay.
- **Colour**: the backlog moves to amber "to do", not the red ⛔ error banner.

```
┌ To review: 18 pending · oldest Nov 9 ─────────────────────── [Review today (6)] [Review all (18)] ┐
│ Ana 12 · Raj 4 · Lee 2                                                                            │
└──────────────────────────────────────────────────────────────────────────────────────────────────┘
```

### Theme 2: A calmer list, with a "Week" lens by default and a "Performance" lens on demand. Effort: medium

**Fixes** 1, 11, 14, 16, 18.
- **Lens switch**: add a two-option switch next to the period, kept in the URL as `lens`.
  - *Week* (default): Bidder | the 7 days (approved, with a pending badge) | Approved | Pending | Pay | ⋯.
  - *Performance*: Bidder | Bids ↑↓ | Days at 50+ | Interviews (per 100) | Approval | Cost per interview | Last bid. It
    gets its own default period; Last month is a guess, so ask the owner.
- **The card**: moves into the Performance lens, collapsed to one summary line that expands.
- **Remove duplicates**: drop the dot strip in week mode and the strip/Total duplication.
- **Narrow screens**: a sticky name column.
- **Stop the jumps**: reserve space for the banners and the card.

```
Bidders                                                     [Add bidder]  ⋯ (Download Bid Track)
┌ To review: 18 pending … [Review all] ┐
[This pay week ▾] ‹ Week ending Sat Nov 15 ›   View: [Week | Performance]   [🔍]  Owner ▾
┌──────────────┬────┬────┬────┬────┬────┬────┬────┬─────────┬─────────┬────────┬──┐
│ Bidder       │Sun │Mon │Tue │Wed │Thu │Fri │Sat │Approved │Pending  │Pay     │  │
│ Ana  ·Dev-A  │ 52 │ 61 │45 3│  – │  – │  – │  – │  158    │ 3 →     │ $9.48  │⋯ │
│ Raj  ·Dev-B  │ 40 │ 38 │ 22 │  – │  – │  – │  – │  100    │ –       │ $6.00  │⋯ │
│ Total        │ 92 │ 99 │67 3│    │    │    │    │  258    │ 3       │ $15.48 │  │
└──────────────┴────┴────┴────┴────┴────┴────┴────┴─────────┴─────────┴────────┴──┘
Your own applies (Self) ▸ 22 this week · Dev-A 13 · Dev-B 9        (Theme 6)
```

### Theme 3: One name and one definition per number, with help you can tap. Effort: small

**Fixes** 3, 4, 7, 8, 9, 13, 21, 23.
- **Write a short glossary first**, then apply it everywhere:
  - **Pending**, never "to review" or "Review".
  - **Approved**.
  - **Bids** = approved + pending, used only where both are meant.
  - **Pay** = approved × rate within the pay week, the single source for every pay figure. Remove "$X paid" or source
    it from Pay.
  - **Pay week** (Sat 4 pm → Sat 4 pm).
  - **Self applies**.
  - **Back to Bidders**.
- **Small fixes**:
  - Rename the "This week" tab to "Days".
  - Use the list's status wording in the bidder view.
  - Use one rate wording: "$0.06 per approved bid".
  - Use one archive confirm.
  - Restore the Saturday ⓘ note on the list.
- **Help you can tap**: replace the hover-only ⓘ icons with a click-to-open "What do these numbers mean?" popover that
  works on touch.

### Theme 4: Make the bidder view the place for one bidder. Effort: medium

**Fixes** 6, 15, 17.
- **Header**: back at the top-left, then name, status in the list's wording, a profile link, and rate. Edit and
  New invite code / Reset login become visible buttons, with Archive left in ⋯.
- **Navigation**: the week navigation moves into the header.
- **Performance**: add a row of performance figures for a chosen period, with the platform comparison. Drilling in
  from a month keeps that month for this row.
- **Tabs**: **Days** | **Past weeks (pay)**. The tiles hide on Past weeks.
- **Page title**: the page title becomes the bidder's name.

```
[← Bidders]  🇵🇭 Ana · Active · @ana · Dev-A ↗ · $0.06 per approved bid   [Edit] [Invite code] ⋯
‹ Week ending Sat Nov 15 ›                         Performance: [Last month ▾]
┌ This week: 158 approved · $9.48 · 3 pending [Review] · 2 rejected (mostly Duplicate) ┐
┌ Last month: 50+ on 14 of 21 weekdays · 3 interviews (0.8 / 100 ▲) · 96% approved · $5 per interview ┐
[ Days | Past weeks (pay) ]
```

### Theme 5: Pay-week close-out. Effort: small for the summary; medium to large for "mark paid"

**Fixes** 5 and part of 4.
- **The card**: from Sat 4 pm Chicago until the owner dismisses it (when to drop it is the owner's call), show a
  "Last pay week is closed" card. It lists, per bidder: approved × rate = pay, and a warning for any pending bids
  ("not paid until reviewed", with a Review link). It ends with a total and **Copy pay summary** (plain text for chat
  or the payment app).
- **Data**: the existing `range=last_pay_week` data covers this.
- **Optional**: a **Mark paid** marker needs new storage and is a product decision.

```
┌ Pay week ending Sat Nov 15 is closed ──────────────────────────────── [Copy pay summary] ┐
│ Ana   158 approved × $0.06 = $9.48     ⚠ 3 pending, not paid until reviewed [Review]       │
│ Raj   100 approved × $0.06 = $6.00                                                        │
│ Total $15.48                                                                              │
└───────────────────────────────────────────────────────────────────────────────────────────┘
```

### Theme 6: Self applies as their own block. Effort: small

**Fixes** 12, 19 and part of 1 and 11.
- **Its own panel**: take the Self rows out of the bidders table's footer and give them a compact "Your own applies"
  panel under the table. It has one line per profile with the same time columns, total and interviews, and no "—"
  cells. Admins see one line per owner.
- **Correct period**: the panel opens the list's period, labelled with the server's label. In month mode a pay-week
  cell opens that pay week.
- **Drop the bid-only parts**: the read-only panel loses the hidden status chips and the Status and Checks columns.
- **Fix the wording**: the subtitle names the owner, the empty text says "No applies in this period", and "Show: Self"
  gets an empty message.
