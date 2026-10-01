# Interviews redesign — design

Date: 2026-09-30
Repos: `engineers_app` (FE, branch `feat/transactions`), `engineers_backend` (BE, branch `feat/transactions`)
Status: approved in conversation; pending written-spec review

## 1. Goal

Make the Interviews area easier to use:

- Two tabs, **Interviews** and **Analyze**. Interviews has a **List** view (default) and a **Calendar** view, switched from a toggle at the top right.
- One clear create/edit flow instead of today's overlapping side panel, update modal, board drag and Focus-page composer.
- Rejected and canceled become **statuses**, not stages.
- The **#caller** Slack channel gets posts when caller rounds are created or updated, and a daily 6:00 AM ET reminder.

### Findings that shaped the design

- The current "List" tab is a kanban board and the "Live" tab is a stage-progress table. Neither is a list or a calendar.
- One `Interview` document is one application at a company. Its rounds live in `stageHistory`, and the top-level `stage`, `status` and `scheduledAt` mirror the last entry (the tip).
- 368 of 683 interviews have `stage: "rejected"`, which is always the tip entry. There are two meanings:
  - `rejected` + status `scheduled` (165) means **canceled**. The dashboard, leaderboard and weekly plan count it this way (`metrics.py:198`).
  - `rejected` + any other status (203) means **rejected after the previous round**.
- 124 rejected entries carry notes or transcripts, and 1,334 `interviewquestions` point at them. That content belongs to the previous round.
- 18 interviews have only a `rejected` entry.
- 113 earlier rounds (in 81 interviews) have no status, and every one of them has a later round after it. No latest round lacks a status once the rejected tips are resolved.
- There are existing Python 3.12 `str(enum)` bugs:
  - `applications.py:148`: the failed/no-show → pipeline rejected mapping never fires.
  - `metrics.py:912`: `interview_done` is never emitted.
  - `metrics.py:916`: the feed sends `"InterviewStatus.x"`.

## 2. Decisions

| Topic | Decision |
|---|---|
| Data model | Keep one `Interview` per application, with its rounds in `stageHistory` (approach 1A). No new collection. |
| Statuses | Five: `scheduled`, `completed`, `passed`, `rejected`, `canceled` |
| Stages | `intro`, `tech_round_1`, `tech_round_2`, `live_coding`, `system_design`, `home_assessment`, `cultural` (label "Hiring manager"), `panel`, `final`, `ai_interview` |
| Interviewer and caller | Stored per round |
| List view | Server-paginated table, one row per interview. Replaces the kanban. |
| Calendar view | Built in the app (approach 2A). Week (default) and Month views, click only, no drag. Replaces the Live table. |
| Form | One Application + Round form in one side panel, used everywhere |
| Phasing | One spec, three phases, each committed and deployable on its own |
| Branch | Continue in the existing `feat/transactions` worktrees |

## 3. Phase 1 — statuses, migration, dependent readers

### 3.1 Model (`app/models/interview.py`)

- `InterviewStatus` = scheduled, completed, passed, rejected, canceled.
- `InterviewStage` loses `rejected` and `tech`.
- Legacy status values are mapped on read and on write:
  - failed → rejected
  - no_show → canceled
  - rescheduled → scheduled
- Legacy stage values are mapped on read and on write:
  - tech, tech1 → tech_round_1
  - tech2 → tech_round_2
  - hiring_manager → **cultural**. This fixes the model/router disagreement: the model mapped it to `final`, the router to `cultural`.
  - offer → final
  - others → intro
- **Read-time safety net** for documents that haven't been migrated: a model validator runs the same normalisation as the migration (§3.2) in memory, so an unmigrated document loads cleanly. The single shared helper is `normalize_interview_doc(raw: dict) -> dict`, used by both the validator and the script.
- **Write-time compatibility** for stale clients:
  - `stage: "rejected"` with status `scheduled` sets the current round's status to `canceled`.
  - `stage: "rejected"` with any other status sets the current round's status to `rejected`.
  - Neither case adds a round.

### 3.2 Migration (`scripts/migrate_interview_statuses.py`)

- **Pattern:** follows `scripts/migrate_stage_notes.py`.
  - Dry run by default; `--apply` writes.
  - Idempotent.
  - Prints a count for each rule and lists the ids that hit rule 2.
- **Rules**, applied to each interview in order:
  1. **Rejected tip with a previous round:**
     - Remove the `rejected` entry.
     - The previous round's status becomes `canceled` if the old tip or top-level status was `scheduled`, otherwise `rejected`.
     - Append the removed entry's `note` and `transcript` to the previous round. If the previous round has text already, add it after a `\n\n---\n` separator.
     - Re-point `interviewquestions.stageId` from the removed entry's id to the previous round's id.
  2. **Rejected-only history (18 interviews):** the entry's stage becomes `intro`, and its status becomes `canceled` or `rejected` by the same test as rule 1.
  3. **Earlier rounds with no status:** set to `passed`.
  4. **Latest round with no status:** `completed` if its date has passed, otherwise `scheduled`. This is a safety net; it matches 0 documents today.
  5. **Map legacy values** in every entry (failed, no_show, rescheduled, tech, tech1, tech2, hiring_manager and so on).
  6. **Re-sync the top-level fields** `stage`, `status` and `scheduledAt` from the tip.
- **Run order:** deploy phase 1, run the dry run, review the counts with Pedro, then run `--apply`.

### 3.3 Backend readers

- **`metrics.py`:**
  - `_count_interview_rounds`: `canceled` = dated rounds in the window whose status is `canceled`.
  - Canceled rounds are not counted as held.
  - Drop `rejected` from `_ROUND_COUNT_EXCLUDED`.
  - `dashboard_feed`: use `.value`. The "done" statuses are completed, passed and rejected.
  - Expected effect: earlier real rounds of a canceled interview now count. Today they count 0.
- **`weekly_plans.py`:** inherits the new counts through `_interview_stats_by_user`. No logic change.
- **`applications.py` `attach_interview_to_app`:**
  - Use `.value`.
  - A round with status `rejected` sets Application outcome = rejected and moves the card to the rejected stage.
  - Interview stage never advances the card to `rejected`.
- **`slack_bot.py`:**
  - `_SKIP_STATUSES` = completed, passed, rejected, canceled.
  - Remove the dead `interview_update_is_noteworthy` or fold it into §4.4.
- **`prompts/interview_review.py`, `interview_analyze.py`, `ai_review.py`:** drop `rejected` from the stage labels. Status strings come from `.value`.
- **`interviews.py`:**
  - `STAGES` and `STATUSES` come from the enums.
  - Add the write-time compatibility from §3.1.
  - The list `stage` filter no longer expands `tech`.

### 3.4 Minimal FE changes (today's screens keep working)

- **`lib/stageBadge.ts`:** remove `rejected` from the stage lists and order. Add a single `INTERVIEW_STATUSES` list with labels and `statusBadgeClass`, and use it everywhere.
- **Board (`Interviews.tsx`):**
  - The Canceled column reads and writes `status: 'canceled'`.
  - Rejected cards are detected by `status === 'rejected'` and sit in their stage's column.
- **Live, Focus, Dashboard, Leaderboard, WeeklyPlan:** switch to the shared status helpers. The Dashboard shows labels, not raw keys.

### 3.5 Tests

- `tests_unit/test_interview_migration.py`, one test per rule:
  - rejected tip → canceled
  - rejected tip → rejected
  - notes/transcript merge, with and without existing text
  - question re-pointing (plan: a pure function that returns the id remaps, so it's testable without the database)
  - rejected-only → intro
  - no-status → passed
  - idempotency
- Unit tests for the legacy read/write mapping.
- Unit tests for `_count_interview_rounds` with canceled rounds.
- Fix the stale `tech1`/`tech2` expectations in `tests/test_interviews.py`.
- Integration tests are written but not run unless a test database is provided, the same as the transactions change.

## 4. Phase 2 — Application + Round form, CRUD, Slack caller

### 4.1 Fields

- **Application** (top-level): `accountId`\* (Profile), `companyName`\*, `appliedPosition`, `jobUrl`.
- **Round** (`InterviewStageEvent`), new fields added:
  - `stage`\*
  - `scheduledAt`\* (date + start time; default 10:00, or the clicked slot)
  - `endsAt` (default start + 1 h, edited as a duration)
  - `status` (default `scheduled`)
  - `interviewerName`
  - `caller: InterviewCaller | None`
  - `note`, `transcript` (paste or upload)
- **Stage picker:** one select, with tech rounds grouped under an optgroup labelled "Technical". No separate sub-stage control.
- **Times:** entered and shown in the browser's time zone, stored in UTC.
- **Migration step (phase 2 script, same dry-run/`--apply` pattern):** copy top-level `interviewerName` and `caller` onto the tip round.
  - Top-level `interviewerName` and `caller` become read-only mirrors of the tip for one release, then are removed.
  - `interview_caller.py`, `slack_bot.py`, `metrics.py` and `interviews.py` (47 references) switch to round-level callers.
  - The Slack digest query moves from `caller.enabled` / `caller.coworkerIds` to `stageHistory.caller.*`.

### 4.2 One form component, one side panel

`InterviewForm` has four modes and replaces `InterviewFormFields`, the update modal and `StageComposer`.

| Mode | Sections shown | API |
|---|---|---|
| New interview | Application + first round | `POST /interviews` `{application fields, round: {...}}` |
| Edit details | Application only, plus a read-only summary of the rounds | `PUT /interviews/:id` (application fields only) |
| Add next round | Round only, with a read-only application header. Stage defaults to the next in `INTERVIEW_STAGE_ORDER`. | `POST /interviews/:id/stages` `{..., markPreviousPassed}` |
| Edit round | Round only | `PATCH /interviews/:id/stages/:sid` |

- **Add next round** shows a checkbox, "Mark {previous stage} as Passed". It's checked by default when the previous round is `scheduled` or `completed`.
- **Quick status menu:** Completed, Passed, Rejected, Canceled on each round, in the side panel and in list rows. It sends a PATCH with `status` only.
- **Rescheduling** means editing the round's date and time. The status stays `scheduled`.
- **Delete** uses one shared `ConfirmDialog`:
  - Round delete says it also deletes that round's notes, transcript and extracted questions, and is blocked for the last round.
  - Interview delete states the number of rounds.
- **Permissions are unchanged:**
  - Any authenticated user sees every interview in the list and calendar.
  - The side panel is read-only for anyone other than the creator or an admin, and is filled from the list payload.
  - The full-screen page stays limited to admin, owner or caller coworker (`_can_view`).
  - Only the creator or an admin edits.
- **Removed:**
  - stage-movement badge editing and the whole-history PUT path
  - carrying the old round's note/transcript into a new round
  - `?edit=` and the read-mode modal
  - duplicated `savePanel`, status lists, badge palettes and delete dialogs
  - the Quill `editorStyles` and unused `interview-ai/*` panels
- **Focus page** (`/interview/:id`): keeps the round stepper and the autosaving Script/Notes/Questions workspace. Its add, edit and delete buttons open the shared side panel.
- **Transitional board behaviour until phase 3:** dropping a card on a column opens Add next round with that stage selected.

### 4.3 Backend API changes

- **`POST /interviews`:**
  - Accepts `round`.
  - The legacy flat shape (`stage`, `scheduledAt`, `status`, `interviewerName`, `caller`, `note`, `transcript`) is still accepted and mapped to `round`.
- **`PUT /interviews/:id`:** application fields. It still accepts the legacy `stage`/`status` payload through the §3.1 compatibility path. From phase 2 on, a whole-history rewrite (`stageHistory` in the body) is rejected with 400. No phase 2 client sends it; this stops a stale tab from silently deleting rounds.
- **`POST /interviews/:id/stages`:**
  - Adds `interviewerName`, `endsAt`, `caller`, `note`, `transcript` and `markPreviousPassed`.
  - It still rejects the same stage twice in a row.
- **`PATCH /interviews/:id/stages/:sid`:** the same new fields.
- **Tip re-sync:** after every round write, the top-level fields are re-synced from the tip, as today.

### 4.4 Slack caller channel (`SLACK_CALLER_CHANNEL_ID`, to be confirmed as #caller)

- **When a new post goes out:** a round with `caller.enabled` is created, whether on a new interview, via Add next round, or by enabling a caller on an existing round.
- **The "Caller needed" post contains:** profile, company, JD link, interviewer, stage, time with time zone, method, assigned caller, coworkers, and the owner @mentioned. The post's `ts` is stored on the round's `caller.slackChannelTs`.
- **Thread replies:** posted when these change, listing each change as `Field: old → new`: time, stage, status, method, method value, assigned caller, coworkers. Notes and transcript changes are not posted.
- **Cancel reply:** "Canceled" is posted in the thread when the round's status becomes `canceled`, the caller is disabled, or the round or interview is deleted.
- **Error handling:** Slack failures are logged and never fail the API request, as today.

### 4.5 Daily 6:00 AM ET caller reminder

- **Entry point:** a new `run_caller_channel_digest()` in `slack_bot.py`, called from `run_alert_tick()` (the Railway `*/5` cron via `python -m app.alerts_tick`).
- **Timing:** time zone `America/New_York` (follows DST). It runs on the first tick at or after 06:00 ET, and catches up until 12:00 ET if earlier ticks were missed.
- **Idempotency:**
  - Claim first: insert `SlackAlertLog(userId=<sentinel ObjectId 000…0>, kind="caller-digest:YYYY-MM-DD")`. The unique index prevents a double post.
  - Then post.
  - On a post failure, delete the claim so the next tick retries.
- **Content:**
  - Rounds whose ET date is today, with `caller.enabled` and status `scheduled`, across all users, sorted by start time.
  - A header with the count, then one line per round: time (ET), profile, company, stage, method, assigned caller, owner @mention.
- **Empty day:** posts "No caller interviews today."
- **Unchanged:** users' personal digest DMs.

### 4.6 Tests

- API tests for:
  - the new create shape and the legacy create shape
  - `markPreviousPassed` (checked, unchecked, previous round already passed)
  - PATCH of the new round fields
  - rejection of the history-rewrite PUT
- Unit tests for:
  - caller message text (created, updated diff, canceled)
  - the change detector (notes-only change → no post)
  - reminder round selection (ET day boundaries, around a DST change, status and caller filters)
  - claim/post-once, catch-up window, retry after failure, empty day
  - the phase 2 migration (interviewer and caller copied to the tip; idempotent)
- FE: type check, plus a manual click-through of every mode on :3001 against :8081.

## 5. Phase 3 — Interviews tab: List and Calendar

### 5.1 Tabs, routes, filters

- **`InterviewTabs`:** Interviews and Analyze. Analyze is unchanged.
- **Routes:**
  - `/interviews` → List
  - `/interviews/calendar` → Calendar
  - `/interviews/live` → redirect to `/interviews/calendar`
- **Header:** a List | Calendar segmented control at the top right, and one **New interview** button.
- **Shared filters:** User (default: me, with "All users"), Profile, Stage, Status.
  - Stored in URL query params and carried across the view switch.
  - List adds a Date range (presets + custom; default this week).
  - Region is dropped.

### 5.2 List view

- **Table columns:** Company / position, Profile, Stage, Latest round (date and time), Status (with the quick menu), Rounds (a dot trail coloured by status), Owner, and a ⋯ menu.
  - The Stage column shows a phone icon when the latest round has a caller.
  - The ⋯ menu offers Add next round, Open full screen and Delete.
- **Sorting:** on the server by company, stage, latest round date or status. Default: latest round, newest first.
- **Pagination:** on the server, using the existing `page`/`limit` parameters.
- **Date range:** matches interviews with any round in the range (`stageHistory` `$elemMatch` on `scheduledAt`). Stage and status filters apply to the latest round.
- **Row click:** opens the side panel with the application details, the rounds list with statuses, and actions.
- **Below `sm`:** rows render as cards.

### 5.3 Calendar view

- **Header:** ‹ Today ›, the range label, and a Week | Month control (Week is the default).
- **Week (Mon–Sun):**
  - Hour grid from 07:00 to 21:00, stretched to fit any round outside it, with a current-time line.
  - Blocks are sized by `endsAt − scheduledAt`.
  - Overlapping rounds are laid out side by side by a pure `layoutDayEvents(events)` function.
  - Rounds with no time (legacy date-only rounds stored at 12:00 UTC with no `endsAt`) go in an all-day row.
- **Month:** a 6-week grid, up to 3 rounds per day ("10:00 Acme · Intro"), and "+N more" switches to that week.
- **Styling:** colour by stage (`stageBadgeClass`) and a phone icon for callers. Canceled rounds are muted and struck through; rejected rounds have a red edge.
- **Interactions:**
  - Clicking a round opens the side panel in Edit round mode.
  - Clicking an empty slot or day opens New interview prefilled with that date and time (10:00 in Month view).
  - Each day header has a "+" button for keyboard users.
  - Every round is a focusable button.
- **Below `sm`:** the week renders as a day-by-day list.
- **New endpoint:** `GET /interviews/rounds?from&to&userId&accountId&stage&status` returns flattened rounds:
  - `{interviewId, roundId, stage, status, scheduledAt, endsAt, companyName, profileLabel, ownerId, ownerName, hasCaller}`
  - It filters on the server, using the same visibility as the list endpoint.

### 5.4 Removed

The kanban board, the Live stage table and their duplicated helpers. `@dnd-kit` stays, because Pipeline uses it.

### 5.5 Tests

- **BE:** `/interviews/rounds` range edges, filters and visibility; list-endpoint "any round in range" and sorting.
- **FE:** `layoutDayEvents` checked by a script covering the no-overlap, two-way, three-way and chained-overlap cases. Plus a type check and a click-through of both views, the Week/Month navigation and slot-click create.

## 6. Rollout

1. **Phase 1 commit.** Deploy the BE and then the FE; the order is safe thanks to the read/write compatibility. Run the migration dry run, review it, then run `--apply`.
2. **Phase 2 commit.** Deploy, then run the phase 2 migration (interviewer and caller onto the rounds) as a dry run and then `--apply`. Confirm `SLACK_CALLER_CHANNEL_ID` is #caller.
3. **Phase 3 commit.** Deploy.

A release after phase 2 removes the top-level `interviewerName`/`caller` mirrors.

## 7. Out of scope

- Merging interviews into Pipeline `Application` records.
- Drag-to-reschedule on the calendar.
- Changes to the Analyze tab beyond the stage/status label clean-up.
- A frontend unit-test runner.
