# Report page — Goal vs Done (revision 2: simplified)

Date: 2026-09-30 (revised same day)
Repos: `engineers_backend`, `engineers_app`. Branch `feat/cleanup` in both.

Revision 2 replaces the first design (profiles/LinkedIn per region, overrides, tomorrow's goal). Those were judged overwhelming.

## Goal

Weekly and daily plans track only **bids (self, bidder)**, **interviews (self, caller)** and **notes**, plus free-form goal lines. Goals are typed: the week's goal when the weekly plan is set, each day's goal once at the start of that day. During/after the day the person follows up with what was actually done. Interviews are never typed — they come from the Interviews page.

## What is tracked

| | Goal (typed) | Done |
|---|---|---|
| Week | bids self, bidder · interviews self, caller · goal lines | bids = sum of the week's logged days · interviews = interview records (self vs caller per round, with stages) · ticks on goal lines · recap notes |
| Day | bids self, bidder · goal lines | bids self, bidder (typed) · interviews from records (read-only, stage chips) · ticks on goal lines · follow-up notes |

- No interview goal per day. No overrides anywhere: interview Done and weekly Done are always automatic.
- Goal lines: free text, ≤ 20 per day/week, ≤ 200 chars; each has a tick box (done/not done).
- Example week: Bids self 750, bidder 500; Interviews self 10, caller 5; lines "Profile update", "LinkedIn creation". Example day: Bids self 150, bidder 100; lines "Seek caller", "LinkedIn creation daily", "Bidder review".

## Definitions (unchanged)

Week = Monday start, Mon–Sat working days, Sunday belongs to the week that just ended. `DailyPlan.date`/`WeeklyPlan.weekStart` are naive midnights. Interview rounds are counted with `app.interview_rounds` (canceled rounds, AI interviews, home assessments excluded); a round is a **caller** round when the round has an enabled caller (the latest round falls back to the interview-level caller), else **self**; a round's day is its local date in `APP_TIMEZONE`.

## Data model

```python
class Counts(BaseModel):          # all ints >= 0
    bidsSelf: int = 0
    bidsBidder: int = 0
    interviewsSelf: int = 0
    interviewsCaller: int = 0

class ChecklistItem(BaseModel):
    text: str        # 1..200 chars, trimmed
    done: bool = False
```

**DailyPlan** (`dailyplans`, unique `(userId, date)`): `goal: Counts` (only bids used), `goalItems: list[ChecklistItem]`, `done: Counts` (only bids stored; interviews are computed), `notes: str` (≤ 2000), `loggedAt: Optional[datetime]` (set the first time a follow-up — Done — is saved), Slack fields. Legacy fold (pre Goal-vs-Done documents): bids hands-on/by bidder → `done.bidsSelf/bidsBidder`, today's items → ticked goal lines, free text → notes, `loggedAt = createdAt` when there was any content; old typed interview counts are dropped.

**WeeklyPlan** (`weeklyplans`): `weekStart`, `goal: Counts`, `goalItems`, `recapNotes: str` (≤ 4000), plus `year/weekNumber/startDate/endDate`. Legacy fold: `weekStart` from `startDate`; bids/interviews metric targets → `goal.bidsSelf/interviewsSelf`; old plan text and recap text → `recapNotes` (joined by a blank line).

## Automatic values

- Day interviews: self/caller counts and stage breakdown per local day from interview records.
- Day Done = typed bids + automatic interviews.
- Week Done = bids summed over the week's logged days (Mon–Sun) + interviews over the week window.

## API

Writes owner-only (admins 403); reads by owner or admin (staff reading others 403; unknown user 404; bad id 400). Strict `YYYY-MM-DD` (422 otherwise); `weekStart` must be a Monday.

- `GET /daily-plans?weekStart=&userId=` → `{weekStart, days: [DayOut]}` (Mon–Sat, plus Sunday when it has an entry).
- `GET /daily-plans/{date}?userId=` → `DayOut`.
- `PUT /daily-plans/{date}` body `{goal: {bidsSelf, bidsBidder}, goalItems, done?: {bidsSelf, bidsBidder}, notes}` → `DayOut`. `done` present = follow-up: sets `loggedAt` (first time) and posts/edits the Slack message. Goal-only saves never post.
- `DELETE /daily-plans/{date}`.
- `DayOut = {date, exists, userId, goal, goalItems, done, interviews: {self, caller, stages: {self: {group: n}, caller: {...}}}, notes, loggedAt}`.
- `GET /weekly-plans/{weekStart}?userId=` → `WeekOut = {weekStart, exists, userId, goal, goalItems, recapNotes, done, stages, days: [{date, logged, goal, done, itemsDone, itemsTotal}]}`.
- `PUT /weekly-plans/{weekStart}` body `{goal, goalItems, recapNotes}`; `DELETE`; `GET /weekly-plans/{weekStart}/previous-goals` → `{goal | null, goalItems (unticked, reset)}`.
- `GET /reports/team?weekStart=` (admin) → `{weekStart, users: [{userId, name, email, goal, done, itemsDone, itemsTotal, lastLoggedDate, hasWeeklyPlan}]}`; `lastLoggedDate` looks back across weeks.

## Slack daily post

Evening only: sent when the follow-up is saved, edited in place on later follow-up saves. Text:

```
:spiral_note_pad: *Daily plan* — @person
*10/1 (Thu)*
Bids: self 140/150 · bidder 100/100
Interviews: self 2 · caller 1
✓ Seek caller
○ Bidder review
<follow-up notes>
<link|Open Report>
```

## Consumers

- Dashboard: bids from logged days' `done`; interviews Done always from interview records; weekly targets from `WeeklyPlan.goal`; unmigrated legacy daily documents still count.
- Leaderboard and daily-bids alert: targets from `WeeklyPlan.goal` (unchanged).

## Frontend

- Week board (unchanged layout): week summary card, Mon–Sat rows, side panels, admin team table.
- Week summary: Bids self/bidder `done/goal`, Interviews self/caller `done/goal`, `Goals n/m done`, recap indicator.
- Day row: `Bids 240/250 ▼10 · Interviews 3 (2 self · 1 caller) · Goals 2/3`; today without a goal → `Set goal`; today with a goal but no follow-up → `Follow up`; future days → goal or `Set goal`.
- Day panel: before follow-up (today/future) shows Goal (bids + lines) with **Save goal**; today/past shows Goal | Done (bids typed, interviews read-only with stage chips), ticks, follow-up notes, **Save follow-up**. Future days: goal only.
- Week panel: goal counts (bids, interviews), goal lines with ticks, Done read-only, recap notes, **Use last week's goals**.
- Team table: Bids, Interviews, Goals done, Last follow-up (⚠ when a working day was missed, current week only).

## Migration (`scripts/migrate_plans_goal_done.py`, dry-run default, `--apply`, idempotent)

Daily: done bids from hands-on/by bidder; today's items → ticked goal lines (merged with lines carried from the previous day); text → notes; `loggedAt = createdAt` when there was content; old interview counts dropped; previous day's plan-for-tomorrow → next working day's goal bids + unticked goal lines (never overwriting a non-empty goal). Weekly: `weekStart`, goal from bids/interviews targets, plan + recap text → `recapNotes`; duplicates reported.

## Out of scope

Profiles/LinkedIn tracking, overrides, tomorrow's goal, morning Slack post, reminders.

## Revision 3 (goals set once a week)

- The weekly plan holds both the **week goal** (bids self/bidder, interviews self/caller, week goal lines) and a **daily goal** (bids self/bidder, daily goal lines) that applies to every working day (Mon–Sat). Both are set once at the start of the week; the week panel shows them in two columns.
- A day has **no goal inputs**: it shows the week's daily goal (read-only) and its follow-up records bids done, ticks on the daily goal lines and notes. `PUT /daily-plans/{date}` is the follow-up only (`{goalItems, done, notes}`); future days → 422. Each save posts/edits the day's Slack message.
- A followed-up day keeps its own copy of the goal it was compared against, so changing the daily goal mid-week doesn't rewrite past days. Older per-day goals (from migrated data) are kept as that day's copy.
- `WeeklyPlan` gains `dailyGoal` and `dailyGoalItems`; `WeekOut` and `previous-goals` return them.
