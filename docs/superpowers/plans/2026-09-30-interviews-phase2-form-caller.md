# Interviews Phase 2 — Application + Round Form, Per-Round Caller, #caller Slack — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** One Application + Round form in one side panel used everywhere; interviewer and caller stored per round; #caller posts for round create/update/cancel and a 6:00 AM ET daily reminder.

**Architecture:**
- **Backend.** Round fields are added to `InterviewStageEvent`. `resolve_interview` (phase 1) gains a rule that copies the top-level interviewer/caller onto the latest round, and the top level becomes a mirror of the latest round, so existing readers of `iv.caller` (the DM digest, `_can_view`) keep working. Round writes go through the existing per-round endpoints, extended.
- **Slack.** Caller posts are keyed by round. Change detection is a pure diff of round snapshots. The daily reminder is a pure selector plus a claim-first sender, called from the existing 5-minute cron.
- **Frontend.** A new `src/components/interview/` folder holds the form, the side panel and the confirm dialog. The old `InterviewFormFields`/`InterviewSidePanel`/update modal/`StageComposer` are removed.

**Tech Stack:** FastAPI, Beanie, pytest (unit only); React 18 + TS + SWR + Tailwind.

**Spec:** `docs/superpowers/specs/2026-09-30-interviews-redesign-design.md` §4. Phase 1 (commits BE `6062415`/`66941cb`, FE `5953694`/`f7f82c4`) is already in place.

## Global Constraints

- **Worktrees:** BE `C:\Users\Administrator\Documents\Engineer\engineers_backend-transactions`, FE `C:\Users\Administrator\Documents\Engineer\engineers_app-transactions`, both on branch `feat/transactions`.
- **Uncommitted transactions files:** never stage them (BE `app/routers/transactions.py`, `tests/test_transactions.py`; FE `src/pages/Transactions.tsx`, `src/lib/dateRangePresets.ts`, `src/api/endpoints.ts`).
  - Task 5 must edit `src/api/endpoints.ts`, which contains transactions hunks. Commit only the interview hunks, using `git add -p`, or apply the interview hunks with `git apply --cached` from a filtered diff. Verify with `git diff --cached src/api/endpoints.ts`, which should show no transactions lines.
- **Commits:** one commit per repo at the end (Task 8). End each with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- **Slack is off locally:** before any manual API check, set `SLACK_BOT_TOKEN=` (empty) in the **worktree's** `engineers_backend-transactions/.env` and restart :8081, so nothing posts to the real #caller channel. Record the change in the ledger. Pedro restores the token himself.
- **Database:** the dev DB is real. Only reads and dry runs. No `--apply`; Pedro runs both migrations after phase 3.
- **Tests:**
  - BE unit tests: `.venv/Scripts/python -m pytest -q tests_unit --ignore=tests_unit/test_resume_experience_roles.py --ignore=tests_unit/test_style_serializer.py --ignore=tests_unit/test_template_annotate_removals.py`
  - Integration tests in `tests/` are written, not run.
  - FE type check: 6 errors already exist; no new ones allowed.
  - The FE has no test runner. Pure FE helpers go in `src/lib/*.ts` and are checked with an esbuild + node assertion script in the session scratchpad, the same method used for the transactions period math.
- **Values:**
  - Status default for a new round: `scheduled`.
  - Duration default: 60 minutes.
  - Default start time: `10:00`.
  - Stage picker order: `INTERVIEW_STAGE_ORDER`, with `tech_round_1, tech_round_2, live_coding, system_design, home_assessment` under an optgroup labelled `Technical`.
  - Reminder time zone: `America/New_York`.
  - Reminder window: 06:00 ≤ now < 12:00 ET.
  - Reminder claim key: `SlackAlertLog(userId=ObjectId("000000000000000000000000"), kind="caller-digest:YYYY-MM-DD")`.
- **The DM digest stays on the top-level mirror:** each user's personal DM digest and `_can_view` keep reading the top-level `iv.caller`, which mirrors the latest round's caller for this release (spec §4.1). The spec's move of the digest query to `stageHistory.caller.*` happens when the mirror is removed, one release later. Only the #caller channel reminder (Task 4) queries rounds.
- **Caller time = round start:** a caller request no longer has its own date/time. `caller.startsAt` is always the round's `scheduledAt`, and `caller.timezone` only controls how Slack displays times (default: the owner's `slackTimezone`, else `America/New_York`). This follows from rounds now having a required start time (spec §4.1); the old separate caller time field is removed.

## Review Focus

1. **Editing only a round's notes/transcript on a caller round** → no Slack thread reply. Pinned in Task 2 (`test_notes_only_change_has_no_lines`).
2. **Marking a caller round Canceled, turning its caller off, or deleting the round or the interview** → exactly one "Canceled" thread reply, and never a new "Caller needed" post. Pinned in Task 2/3 (`test_cancel_kinds`).
3. **A 6:00 AM tick that runs twice**, or one that fails to post → one post per ET day, with a retry on the next tick after a failure. Pinned in Task 4.
4. **A round at 23:30 ET, or 00:30 ET, on DST-change days** → assigned to its ET calendar day. Pinned in Task 4.
5. **"Add next round" when the previous round is already Passed/Rejected/Canceled** → the previous status is untouched even with `markPreviousPassed=true`. Pinned in Task 3.

---

### Task 1: Round fields and copying interviewer/caller onto the latest round

**Files:**
- Modify: `app/models/interview.py`: move `CallerMethod`/`InterviewCaller` above `InterviewStageEvent`; add round fields.
- Modify: `app/interview_normalize.py` (`resolve_interview`)
- Test: `tests_unit/test_interview_normalize.py` (append)

**Interfaces:**
- Produces:
  - `InterviewStageEvent` gains `interviewerName: Optional[str] = None`, `endsAt: Optional[datetime] = None`, `caller: Optional[InterviewCaller] = None`.
  - `resolve_interview` rule 7, `round_fields_copied`, runs after rule 6:
    - If top-level `interviewerName` is set and the tip has none, copy it to the tip.
    - If top-level `caller` is set and the tip has none, copy it to the tip.
    - If top-level `endsAt` is set and the tip has none, copy it.
    - Then mirror: top-level `interviewerName`/`caller` are set to the tip's values.
    - Counted once per interview when anything changed.
  - Migration `_FIELDS` adds `interviewerName` and `caller`.

- [ ] **Step 1: Write failing tests:**
  - `test_round_fields_copied_to_tip`: top `interviewerName="Dana"`, `caller={"enabled": True, "callerName": "Sam"}`, `endsAt` set → the tip has all three, and `rules["round_fields_copied"] == 1`.
  - `test_round_fields_not_overwritten`: a tip that already has `interviewerName="Lee"` keeps `"Lee"`, and the top-level mirror becomes `"Lee"`.
  - `test_round_fields_idempotent`: resolving the output again fires 0 rules.
  - `test_stage_event_accepts_round_fields`: `InterviewStageEvent(stage="intro", at=NOW, interviewerName="D", caller={"enabled": True})` validates.
- [ ] **Step 2: Run them.** Expected: FAIL (`KeyError`/assertion on `interviewerName` in the tip).
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** the `test_interview_normalize.py` and `test_interview_question_remap.py` unit tests. Expected: PASS. Then rerun the migration dry run (read-only) and record `round_fields_copied` (expected ≈ the number of interviews that have an interviewer or caller).

---

### Task 2: Per-round caller helpers (pure)

**Files:**
- Modify: `app/interview_caller.py`
- Test: create `tests_unit/test_interview_caller.py`

**Interfaces:**
- Produces:
  - `CallerIn` drops `time` and `date`; extra keys are ignored (pydantic default).
  - `build_round_caller(body: CallerIn, *, starts_at: datetime, owner_id, valid_coworker_ids: set[str], default_tz: Optional[str], previous: Optional[InterviewCaller]) -> InterviewCaller`
    - The same validation as `build_caller`, but `startsAt = starts_at` (aware UTC).
    - It keeps `previous.slackChannelTs`.
    - Disabled → `previous.model_copy(update={"enabled": False})`, or `InterviewCaller(enabled=False)`.
  - `build_caller` and `resync_caller_day` are deleted, and their call sites move to `build_round_caller` in Task 3.
  - `RoundCallerSnapshot = dict` with keys `time` (aware UTC or None), `stage`, `status`, `method`, `link`, `caller`, `coworkers` (a sorted tuple of id strings).
  - `round_caller_snapshot(entry: InterviewStageEvent) -> Optional[dict]`: None when `entry.caller` is missing or disabled.
  - `caller_post_kind(prev: Optional[dict], new: Optional[dict], *, round_deleted: bool = False) -> Optional[str]` returns `"created"`, `"updated"`, `"canceled"` or `None`:
    - prev None and new not None → `created` (unless new status is `canceled` → None)
    - prev not None and (new None or `round_deleted` or new status `canceled` while prev status wasn't) → `canceled`
    - both present and different → `updated`
    - otherwise None
  - `caller_change_lines(prev: dict, new: dict, *, fmt_time: Callable[[datetime], str], label: Callable[[str, Any], str]) -> list[str]`: one `"<Field>: <old> → <new>"` line per differing key, in the order Time, Stage, Status, Method, Link, Caller assigned, Coworkers. `label(key, value)` renders stage, status and coworker values.

- [ ] **Step 1: Write failing tests** (plain `InterviewStageEvent`/`InterviewCaller` objects; valid ids from `ObjectId()`):
  - `test_build_round_caller_uses_round_start`: `starts_at=2026-10-01T14:00Z` gives `caller.startsAt == starts_at`; unknown coworker → `CallerError`; the owner is dropped from coworkers; invalid method → `CallerError`.
  - `test_build_round_caller_disabled_keeps_ts`: previous with `slackChannelTs="1.2"` and `enabled=False` gives `enabled is False` and `slackChannelTs == "1.2"`.
  - `test_caller_post_kind_matrix`: `(None, s) → "created"`, `(s, s) → None`, `(s, s_time_changed) → "updated"`, `(s, None) → "canceled"`, `(s, s_status_canceled) → "canceled"`, `(s, s, round_deleted=True) → "canceled"`, `(None, s_canceled) → None`.
  - `test_notes_only_change_has_no_lines` *(Review Focus 1)*: two snapshots from entries that differ only in `note`/`transcript` → `caller_post_kind` returns None, and `caller_change_lines(...) == []`.
  - `test_change_lines_format`: time 10:00→11:30 and caller TBD→Dana give `["Time: <fmt old> → <fmt new>", "Caller assigned: TBD → Dana"]`.
  - `test_cancel_kinds` *(Review Focus 2)*: status→canceled, caller disabled and round_deleted each yield `"canceled"`, and none yield `"created"`.
- [ ] **Step 2: Run them.** Expected: `ImportError`.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `test_interview_caller.py`. Expected: PASS.

---

### Task 3: Interview API — create/update/round endpoints and caller posts

**Files:**
- Modify: `app/routers/interviews.py`:
  - request models (130-180)
  - `_apply_caller`, `_post_caller_channel`, `_after_save` (179-235, 398-418)
  - `_sync_top_from_tip` (the top-level mirror)
  - `create_interview`, `update_interview`, `add_interview_stage`, `update_interview_stage`, `delete_interview_stage`, `delete_interview`
- Modify: `app/slack_bot.py`: `notify_caller_channel` becomes `notify_round_caller` (see Interfaces); `caller_channel_text` takes the round.
- Test: `tests_unit/test_interview_rounds.py` (new, pure helpers); `tests/test_interviews.py` (append; written, not run)

**Interfaces:**
- Consumes: Task 1 fields; Task 2 helpers.
- Produces:
  - `RoundIn(BaseModel)`: `stage: str`, `scheduledAt: str`, `endsAt: Optional[str]`, `status: Optional[str] = "scheduled"`, `interviewerName: Optional[str]`, `note: Optional[str] = ""`, `transcript: Optional[str] = ""`, `caller: Optional[CallerIn]`.
  - `InterviewCreate` gains `round: Optional[RoundIn]`. When `round` is absent, the legacy flat fields (`stage`, `scheduledAt`, `endsAt`, `status`, `interviewerName`, `caller`, `note`, `transcript`) are mapped into a `RoundIn`. `accountId` and `companyName` are required (400 `"companyName is required"`).
  - `InterviewUpdate`: application fields (`accountId`, `companyName`, `appliedPosition`, `jobUrl`, `mainTechStack`), plus the phase 1 legacy `stage`/`status` compatibility path. A body containing `stageHistory` gets 400 `"edit rounds with /interviews/{id}/stages"`.
  - `StageCreate` gains `endsAt`, `interviewerName`, `caller: Optional[CallerIn]` and `markPreviousPassed: bool = False`. Its status defaults to `scheduled`.
  - `StagePatch` gains `endsAt`, `interviewerName` and `caller`.
  - Pure helpers in `interviews.py`, tested in `tests_unit/test_interview_rounds.py`:
    - `mark_previous_passed(history: list[InterviewStageEvent]) -> bool`: sets `history[-1].status = passed` only when it is `scheduled`/`completed`; returns whether it changed. Call it **before** appending the new round.
    - `round_ends_at(start: datetime, ends: Optional[datetime]) -> datetime`: `ends` when after `start`, else `start + 1h`.
  - `_sync_top_from_tip(iv)` additionally mirrors `interviewerName`, `caller` and `endsAt` from the tip.
  - `async def _sync_caller_posts(iv, before: dict[str, Optional[dict]], *, deleted_round_ids: set[str] = frozenset())`:
    - `before` maps round id → `round_caller_snapshot`, taken before the write.
    - For each round in `before ∪ current`, compute `caller_post_kind`, then call `notify_round_caller(iv, entry, kind, lines)`.
    - Store the returned ts on `entry.caller.slackChannelTs` and save via `_save_interview` when it changed.
    - It replaces `_post_caller_channel` and the caller branch of `_after_save`.
    - `delete_interview` calls it with every round as deleted, before deleting.
  - `slack_bot.notify_round_caller(iv, entry, kind: str, lines: list[str]) -> Optional[str]`:
    - `created` posts a new parent message.
    - `updated` posts a thread reply with the header `:pencil2: *Caller details updated* by <owner>` plus `lines`.
    - `canceled` posts a thread reply `:no_entry: *Canceled* — <stage> · <time>`.
    - With no parent ts, `updated` falls back to `created`, and `canceled` is skipped.
    - It never raises.

- [ ] **Step 1: Write failing unit tests** in `tests_unit/test_interview_rounds.py`:
  - `test_mark_previous_passed_only_from_scheduled_or_completed` *(Review Focus 5)*: scheduled→passed (True), completed→passed (True); passed, rejected and canceled are unchanged (False); an empty history returns False.
  - `test_round_ends_at_defaults_one_hour`.
  - `test_sync_top_mirrors_round_fields`: `SimpleNamespace` iv with a tip that has `interviewerName` and a caller → after `_sync_top_from_tip`, the top level equals the tip's.
- [ ] **Step 2: Run them.** Expected: `ImportError`.
- [ ] **Step 3: Implement** the request models, helpers and handler changes above:
  - **create:** build the first round from `RoundIn`, then `build_round_caller(starts_at=round start)`, then insert, then `_sync_caller_posts(iv, before={})`.
  - **add stage:** `before` snapshot; `if body.markPreviousPassed: mark_previous_passed(...)`; append; sync the top level; save; sync posts.
  - **patch stage:** `before` snapshot; apply the fields (the caller is rebuilt with `starts_at` = the entry's `scheduledAt`, so moving the round moves the caller time); save; sync posts.
  - **delete stage:** sync posts with `deleted_round_ids={sid}` before removing the round.
- [ ] **Step 4: Run** all unit tests. Expected: PASS. `pyflakes app/routers/interviews.py app/slack_bot.py app/interview_caller.py` clean (warnings that already existed may remain).
- [ ] **Step 5: Add integration tests** (not run):
  - `test_create_with_round_shape`
  - `test_create_legacy_flat_shape_still_works`
  - `test_put_with_stage_history_returns_400`
  - `test_add_round_mark_previous_passed`
  - `test_add_round_keeps_rejected_previous_when_mark_true`
  - `test_patch_round_interviewer_and_caller`
  - `test_patch_round_date_moves_caller_start`
- [ ] **Step 6: Update existing tests** in `tests/test_interviews.py` that send `stageHistory` in PUT bodies: rewrite them to the stage endpoints, or delete them when they only exercised the removed badge editing. List each one in the ledger.

---

### Task 4: 6:00 AM ET caller reminder

**Files:**
- Modify: `app/slack_bot.py` (new functions, plus the call in `run_alert_tick`)
- Test: `tests_unit/test_caller_digest.py` (new)

**Interfaces:**
- Consumes: Task 1 round fields.
- Produces:
  - `CALLER_DIGEST_TZ = "America/New_York"`, `CALLER_DIGEST_SENTINEL = PydanticObjectId("000000000000000000000000")`.
  - `caller_digest_due(now: datetime) -> Optional[date]`: the ET date when `06:00 <= now_ET < 12:00`, else None.
  - `select_caller_rounds(interviews: list, day: date) -> list[tuple[Interview, InterviewStageEvent]]`: rounds with `caller.enabled`, `normalize_status(status) == "scheduled"`, and `scheduledAt` (aware UTC; naive treated as UTC) whose ET date equals `day`. Sorted by start.
  - `caller_digest_text(rows, *, profiles: dict[str, str], owners: dict[str, str]) -> str`:
    - Header `:telephone_receiver: *Caller interviews today — N*` (or `*No caller interviews today.*` when empty).
    - Then one line per round: `h:mm AM ET · profile · company · stage · method · caller · owner`.
  - `async def run_caller_channel_digest(now: datetime, *, load=..., claim=..., release=..., post=...) -> str` returns `"not_due"`, `"already_sent"`, `"posted"`, `"post_failed"` or `"not_configured"`. The dependencies are injectable callables, with real implementations as the defaults:
    - `load(start_utc, end_utc)` → interviews with a round in range
    - `claim(day_key)` → bool, inserting the sentinel log and returning False on a duplicate key
    - `release(day_key)` → deletes the claim
    - `post(text)` → bool
  - `run_alert_tick()` calls it first, and adds `caller_digest: <result>` to its returned dict.
- The query for `load` is `{"stageHistory": {"$elemMatch": {"caller.enabled": True, "scheduledAt": {"$gte": start, "$lt": end}}}}` on the ET day's UTC bounds.

- [ ] **Step 1: Write failing tests** (fakes for load/claim/release/post; no DB):
  - `test_due_window`: 05:59 ET → None; 06:00 ET → that date; 11:59 → date; 12:00 → None.
  - `test_select_et_day_boundaries_and_dst` *(Review Focus 4)*: 2026-11-01 (DST ends) — a round at 23:30 ET on Oct 31 isn't selected for Nov 1; a round at 00:30 ET on Nov 1 is; 2026-03-08 has the same checks.
  - `test_select_only_scheduled_caller_rounds`: canceled, completed and caller-disabled rounds are excluded.
  - `test_digest_posts_once` *(Review Focus 3)*: two runs at 06:05 and 06:10 give `"posted"` then `"already_sent"`, and `post` is called once.
  - `test_digest_releases_claim_on_failure`: `post` returns False → `"post_failed"`, `release` called; the next run posts.
  - `test_empty_day_posts_no_interviews`: `post` receives text containing `No caller interviews today`.
- [ ] **Step 2: Run them.** Expected: `ImportError`.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `test_caller_digest.py`, `test_slack_bot.py` and `test_alerts_tick.py`. Expected: PASS.

---

### Task 5: FE API types

**Files:**
- Modify: `src/api/endpoints.ts`: `InterviewStageEntry` (584-593), `InterviewStageInput`, `createInterview`, `addInterviewStage`; interview hunks only (see Global Constraints).
- Modify: `src/components/InterviewEditPanel.tsx`: the `Interview`/`InterviewCaller` types move to `src/components/interview/types.ts` and are re-exported.

**Interfaces:**
- Produces:
  - `InterviewStageEntry` adds `interviewerName?: string | null; endsAt?: string | null; caller?: InterviewCaller | null`.
  - `RoundInput = { stage: string; scheduledAt: string; endsAt?: string; status?: string; interviewerName?: string; note?: string; transcript?: string; caller?: CallerInput }`
  - `CallerInput = { enabled: boolean; callerName?: string; timezone?: string; method?: string; methodValue?: string; coworkerIds?: string[] }`
  - `createInterview(body: { accountId: string; companyName: string; appliedPosition?: string; jobUrl?: string; round: RoundInput })`
  - `addInterviewStage(id, body: RoundInput & { markPreviousPassed?: boolean })`
  - `updateInterviewStage(id, sid, body: Partial<RoundInput>)`
  - `updateInterview(id, body: { accountId?: string; companyName?: string; appliedPosition?: string; jobUrl?: string } | { status: string })`

- [ ] **Step 1:** Implement.
- [ ] **Step 2:** Type check. Expected: only errors in the callers that Task 6/7 replace, plus the 6 that already exist. Record the count.

---

### Task 6: Form, side panel and confirm dialog components

**Files (create):**
- `src/components/interview/types.ts`: moved types
- `src/lib/interviewForm.ts`: pure form helpers
- `src/components/interview/StagePicker.tsx`
- `src/components/interview/RoundFields.tsx`: stage, date, time, duration, status, interviewer, caller, notes, transcript
- `src/components/interview/ApplicationFields.tsx`: profile, company, position, job URL
- `src/components/interview/CallerFields.tsx`: moved from `InterviewEditPanel.tsx`; time/date inputs removed, time zone kept
- `src/components/interview/InterviewForm.tsx`: modes `new | editDetails | addRound | editRound`
- `src/components/interview/InterviewPanel.tsx`: side panel, with application summary, rounds list, quick status menu and actions
- `src/components/ConfirmDialog.tsx`

**Interfaces:**
- Produces (pure, `src/lib/interviewForm.ts`):
  - `type RoundFormState = { stage: string; date: string; time: string; durationMin: number; status: InterviewStatusValue; interviewerName: string; note: string; transcript: string; callerEnabled: boolean; callerName: string; callerTimezone: string; callerMethod: string; callerMethodValue: string; callerCoworkerIds: string[] }`
  - `type ApplicationFormState = { accountId: string; companyName: string; appliedPosition: string; jobUrl: string }`
  - `blankRound(opts?: { date?: string; time?: string; stage?: string }): RoundFormState`: defaults to today, `10:00`, 60 minutes, `scheduled`.
  - `roundFromEntry(e: InterviewStageEntry): RoundFormState`: local date/time from `scheduledAt`; duration from `endsAt`, defaulting to 60.
  - `roundPayload(r: RoundFormState): RoundInput`: local date + time → ISO UTC; `endsAt` = start + duration.
  - `nextStage(history: { stage: string }[]): string`: the next value in `INTERVIEW_STAGE_ORDER` after the tip that isn't used yet; `''` when there is none.
  - `missingFields(mode, app, round): string[]`: labels from `Profile`, `Company`, `Stage`, `Date`, `Start time`, depending on the mode.
- **Component contracts:**
  - `<InterviewForm mode interview? initialRound? onSaved(iv) onCancel />`: owns the API call for its mode.
    - `addRound` shows the checkbox `Mark {stageLabel(prev)} as Passed`, checked when the previous status is scheduled/completed. It sends `markPreviousPassed`.
  - `<InterviewPanel interviewId | interview, open, onClose, onChanged, initialMode?, initialRoundId?, prefill? />`: one component opened from the board, Live, Focus and (phase 3) List/Calendar.
    - It is read-only unless the user is the creator or an admin.
    - It shows rounds newest first, each with its stage badge, date and time, status badge plus the quick menu (Completed/Passed/Rejected/Canceled → `updateInterviewStage(id, sid, { status })`), and Edit/Delete.
    - Actions: `Add next round`, `Edit details`, `Open full screen`, `Delete interview`.
  - `<ConfirmDialog open title body confirmLabel tone="danger" onConfirm onCancel />`.
    - Round delete body: `"Deletes this round's notes, transcript and extracted questions."`, and the button is disabled for the last round, with the hint `"An interview needs at least one round."`.
    - Interview delete body: `"Deletes this interview and its N rounds."`
- **Transcript:** a textarea plus the existing upload button (`TranscriptUploadButton` moves to `interview/`), so text can be pasted or uploaded.

- [ ] **Step 1: Write the node assertion script** `scratchpad/interview-form-check.mjs` for `src/lib/interviewForm.ts`, bundled with esbuild like the period-math check. Cover:
  - `blankRound()` defaults
  - `roundPayload` for `2026-10-01`, `10:00`, 45 min in the browser time zone → `endsAt − scheduledAt == 45 min`
  - `roundFromEntry` round trip
  - `nextStage` after `intro` → `tech_round_1`, skipping used stages, `''` after `ai_interview` when every stage is used
  - `missingFields('new', blankApp, blankRound({}))` includes `Profile` and `Company`
  - Run it. Expected: FAIL (module missing).
- [ ] **Step 2: Implement** `src/lib/interviewForm.ts`, then rerun. Expected: all pass.
- [ ] **Step 3: Implement the components.** Type check: no new errors in the new files.

---

### Task 7: Wire the panel everywhere, remove old surfaces

**Files:**
- Modify: `src/pages/Interviews.tsx`:
  - The create modal becomes `<InterviewPanel initialMode="new">`.
  - Card click opens `InterviewPanel`.
  - Board drop on a stage column opens `InterviewPanel initialMode="addRound" prefill={{ stage }}`, replacing the date/sub-stage move modal. Canceled column: unchanged, via `cancelInterview`.
  - Delete uses `ConfirmDialog`.
  - Remove `editorStyles`, `?edit=`/read mode, the update modal, `savePanel` and the move modal.
- Modify: `src/pages/InterviewsLive.tsx`: the pencil opens `InterviewPanel`; delete uses `ConfirmDialog`; remove `savePanel`.
- Modify: `src/pages/InterviewFocus.tsx`:
  - Remove `StageComposer`. Add, Edit and Delete round open `InterviewPanel` (`initialMode` `addRound`/`editRound`, `initialRoundId`).
  - The header gets `Edit details`.
  - Delete uses `ConfirmDialog`.
  - Keep the stepper and the autosaving Script/Notes/Questions workspace.
- Modify: `src/components/InterviewEditPanel.tsx`: delete `InterviewFormFields`, `InterviewSidePanel`, `CallerFields`, `buildSaveBody`, `interviewToForm`, `withCurrentStageInHistory` and the other helpers that nothing uses any more. Keep `CallerBadge`, `StageMovementTrail` and `formatScheduledDate`, re-exporting from `interview/` where they moved.
- Delete: `src/pages/interview-ai/AiReviewPanel.tsx` and `ReviewIdeasPanel.tsx`, once `grep` confirms nothing imports them.

- [ ] **Step 1: Implement.**
- [ ] **Step 2: Type check.** Expected: exactly the 6 errors that already exist.
- [ ] **Step 3: Grep checks:**
  - `grep -rn "InterviewFormFields\|InterviewSidePanel\|StageComposer\|buildSaveBody\|editorStyles" src` → no matches
  - `grep -rn "stageHistory" src/pages/Interviews.tsx src/components/interview` → no write payloads (reads are fine)

---

### Task 8: Verify end to end and commit

- [ ] **Step 1:** BE unit suite: all pass. Record the count.
- [ ] **Step 2: Slack off.** Blank `SLACK_BOT_TOKEN` in the worktree `.env`, restart :8081, and confirm `Application startup complete`.
- [ ] **Step 3: API round trip** (read-mostly; one throwaway interview, deleted at the end), with a staff token as before, against :8081:
  1. create with `round`
  2. add round with `markPreviousPassed`
  3. patch round interviewer/caller/date
  4. quick status canceled
  5. delete round
  6. delete interview

  Assert each response's rounds and statuses. Assert that `notify_round_caller` returned without posting: the logs show `slack_bot` skipped as unconfigured.
- [ ] **Step 4: FE check.** The modules serve with 200 on :3001; type check at 6. Pedro does the visual check.
- [ ] **Step 5: Commit the BE** (explicit paths) and **the FE** (explicit paths; interview hunks only in `endpoints.ts`). Check `git status` afterwards: only the transactions files remain modified.
