# Person's week plan page — design (short)

Status: draft for approval · Prototype: `.superpowers/brainstorm/126610-1795451788/content/person-week.html` (A, with B's grid as an expander)

## Why

The Plans page "Week plan" card is a flat list. A person opening it mid-week can't tell what's left today, whether they're on pace, or how their routines went day by day. Half the target meters say "0 / — No goal set". The admin wants people to follow the plan they set; the page should make "what do I do now" obvious.

## Goals

- Today first: what's left today and one button to the day's standup.
- Targets show pace (where you should be by end of today), only targets that are set.
- Weekly goals as uniform compact rows (checkbox goals and number goals look alike).
- Routine × day grid for the week, folded by default ("Show week by day").
- Own items tagged MINE; "+ Add my own item" (admin-planned people) opens the Week panel.

## Non-goals

- No new editing surface: ticking still happens in the day standup (Day panel) / Home / Slack.
- No change to the Week panel, the team grid, or Home.

## Approaches

1. **Chosen: A with B expandable**, data from the existing week endpoint, plus a routine-by-day grid the server already computes for Home (`routines_grid`).
2. B only (week board) — rejected by the user.
3. Fetch Home's `/dashboard/week` for the grid instead of extending the week endpoint — rejected: a heavy call (interviews, percentiles) for one table; Mon–Fri only while plans run Mon–Sat.

## Design

**Backend** (`GET /weekly-plans/{week}`): add `routineDays` = `routines_grid(plan, by_date, days, today)` over the plan's days (Mon–Sat, plus Sunday if logged). Additive field; an older app ignores it.

**App** (`WeekGoalCard` rewritten, `Report.tsx` wiring):

- Header: "Week plan" + "Planned by your admin" chip (own view, `plansOwnWeek === false`); "Edit plan / View" button as today.
- Today bar (current week only): "Today · Wed Nov 25 · 2 of 5 done · standup not sent" + **Fill today's standup** (opens today's Day panel; "Open today" for an admin viewing someone). Counts from `days[today].itemsDone / itemsTotal / submitted`.
- Left column:
  - **Today's checklist**: each routine with today's state from `routineDays` (done ✓ / short "30 / 50" / not yet), MINE tag for `addedBy === 'self'`. Rows open today's Day panel. "+ Add my own item" for admin-planned people on a saved week (opens Week panel).
  - **Show week by day** (folded): the routine × day grid, same cell look as Home's table (`dayCell` exported from `WeekTable` and reused).
  - **Weekly goals**: one row each — box (check / text / choice / log done-ness) or short bar + "value / target" (count / hours).
- Right column:
  - **Targets**: only targets with a goal > 0; bar + pace tick at `target × elapsedDays / planDays` (elapsed = days up to and including today); "N behind" / "on pace" / "done". Self bids region split as one line when a split exists. Interviews note kept.
  - **Recap** (as now, 2 lines).
- Past / future weeks: no Today bar; checklist replaced by the grid unfolded.
- Older server without `routineDays`: checklist shows names only, no grid toggle.

The day list under the card (DayRow) stays as is.

## Calls made by me (check these)

- Checklist is read-only and opens the Day panel, not inline ticking (inline ticking would duplicate Home's autosave logic). Say if you want inline ticks.
- Pace uses the plan's days (6, Mon–Sat), not Home's 5.
- Backend change needed → deploy backend before app again.
