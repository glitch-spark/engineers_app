# Interviews Phase 1 — Statuses, Migration, Readers — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make rejected/canceled real round statuses, migrate existing interviews, and make every backend and frontend reader use the new values.

**Architecture:**
- One pure module, `app/interview_normalize.py`, owns all legacy→new mapping and the per-interview resolution rules.
- The same function is used by the `Interview` model on read (the safety net for unmigrated documents), by the router on write (compatibility for stale clients), and by the migration script. The rules exist in exactly one place.
- Readers (metrics, pipeline, Slack, prompts, FE) switch to status-based logic.

**Tech Stack:** FastAPI, Beanie/Motor, pytest (unit tests only, no database); React + TS (Vite).

**Spec:** `docs/superpowers/specs/2026-09-30-interviews-redesign-design.md` §3 (phase 1). Phases 2 and 3 get their own plans after this lands.

## Global Constraints

- **Repos:**
  - BE worktree: `C:\Users\Administrator\Documents\Engineer\engineers_backend-transactions`
  - FE worktree: `C:\Users\Administrator\Documents\Engineer\engineers_app-transactions`
  - Both are on branch `feat/transactions`.
- **Uncommitted work:** both worktrees hold uncommitted **transactions** changes (`app/routers/transactions.py`, `tests/test_transactions.py`, `src/pages/Transactions.tsx`, `src/lib/dateRangePresets.ts`, `src/api/endpoints.ts`). Never stage those. Always `git add` explicit paths.
- **Commits:** one commit per repo at the end of the phase (Task 7), as agreed with Pedro. End every commit message with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- **Status values**, exactly: `scheduled`, `completed`, `passed`, `rejected`, `canceled`.
- **Stage values**, exactly: `intro`, `tech_round_1`, `tech_round_2`, `live_coding`, `system_design`, `home_assessment`, `cultural`, `panel`, `final`, `ai_interview`.
- **Legacy status map:** `failed→rejected`, `no_show→canceled`, `rescheduled→scheduled`.
- **Legacy stage map:** `tech→tech_round_1`, `tech1→tech_round_1`, `tech2→tech_round_2`, `hiring_manager→cultural`, `offer→final`, `others→intro`.
- **Enums to text:** never `str(enum)`; use `.value` (Python 3.12 `str()` yields `"InterviewStatus.x"`).
- **Running tests:**
  - Unit tests: `cd engineers_backend-transactions && .venv/Scripts/python -m pytest -q tests_unit/<file>`.
  - Three unrelated `tests_unit` files already fail to import on `dev`: `test_resume_experience_roles.py`, `test_style_serializer.py`, `test_template_annotate_removals.py`. Ignore them.
  - Integration tests (`tests/`) need `MONGODB_URI_TEST`, which is not available. Write them, don't run them (Pedro's decision).
- **Database access:** the dev database (`EngineerDB`) is shared and real. Only read-only queries and migration dry runs are allowed. Never `--apply` without Pedro's explicit go-ahead.
- **FE type check:** `npx tsc -b --noEmit` must show no errors beyond the 6 that already exist (in `InterviewPrepLibrary.tsx`, `Interviews.tsx:1188`, `InterviewsLive.tsx:356`).

## Review Focus

1. **A stale browser tab** still sends `stage:"rejected"` (e.g. drag to Canceled) after deploy. Expect the current round to become canceled or rejected with no 400 and no new round. Pinned in Task 3.
2. **An unmigrated document** with a history status `failed`/`no_show`/`rescheduled`, or stage `rejected`, loads. Expect no validation error, and the values it presents are already mapped. Pinned in Tasks 1 and 2.
3. **Re-running the migration** after `--apply`. Expect zero changes and zero question remaps. Pinned in Task 1 (idempotency test).
4. **Timezone-aware vs naive `scheduledAt`** in the rule 4 comparison. Expect no `TypeError`; aware values are compared as UTC. Pinned in Task 1.
5. **Questions whose `stageId` is `None`, or points at a surviving round.** Expect them never to be remapped; only ids of removed rejected entries appear in `question_remap`. Pinned in Task 1.

---

### Task 1: Pure normalisation and resolution module

**Files:**
- Create: `app/interview_normalize.py`
- Test: `tests_unit/test_interview_normalize.py`

**Interfaces:**
- Produces:
  - `STATUS_VALUES: tuple[str, ...]` and `STAGE_VALUES: tuple[str, ...]`, the exact lists from Global Constraints.
  - `normalize_status(value: Any) -> Optional[str]`: accepts enum, `"InterviewStatus.x"` or plain strings; applies the legacy map; `""`/`None` → `None`; unknown values are returned unchanged (callers validate).
  - `normalize_stage(value: Any) -> Optional[str]`: same contract with the stage map and the `"InterviewStage."` prefix. `"rejected"` is returned as `"rejected"`; only `resolve_interview` and `translate_legacy_write` interpret it.
  - `@dataclass class Resolution: doc: dict; question_remap: dict[str, str]; rules: collections.Counter`
  - `resolve_interview(raw: dict, *, now: datetime) -> Resolution`: pure; deep-copies `raw` and never mutates it.
  - `RULES` names used as `Counter` keys:
    - `legacy_value_mapped`
    - `rejected_to_canceled`
    - `rejected_to_rejected`
    - `rejected_only_to_intro`
    - `earlier_none_to_passed`
    - `latest_none_to_completed`
    - `latest_none_to_scheduled`
    - `top_resynced`

**How `resolve_interview` works.** History entries are dicts with `id`, `stage`, `status`, `scheduledAt`, `note`, `transcript` (other keys are preserved). Rules apply in this order:

1. Map the legacy status/stage in every history entry and in top-level `stage`/`status` (`legacy_value_mapped`, counted once per changed value).
2. **Empty history but top-level `stage` is set:** treat the top level as a one-entry history for rules 3–4 only when top-level stage is `rejected`. In that case set top-level `stage="intro"`, and set `status` to `canceled` if it was `scheduled`, otherwise `rejected` (`rejected_only_to_intro`). Otherwise leave empty-history docs alone.
3. **Tip entry with stage `rejected`:**
   - Let `was_scheduled = (tip.status or raw.get("status")) == "scheduled"`, and `new_status = "canceled" if was_scheduled else "rejected"`.
   - **If a previous entry exists:** pop the tip. Set `prev.status = new_status`. Set `prev.note = merge(prev.note, tip.note)` and `prev.transcript = merge(prev.transcript, tip.transcript)`, where `merge(a, b) = a if not b.strip() else b if not a.strip() else f"{a}\n\n---\n{b}"`. Add `question_remap[tip.id] = prev.id` when `tip.id` is truthy. Count `rejected_to_canceled` or `rejected_to_rejected`.
   - **Otherwise:** set `tip.stage = "intro"` and `tip.status = new_status` (`rejected_only_to_intro`).
   - Repeat while the tip is still `rejected`. The data has 0 mid-history rejected entries, but a loop is safe.
4. **Every non-tip entry with `status is None`** → `"passed"` (`earlier_none_to_passed`).
5. **Tip with `status is None`:**
   - Compare the tip's `scheduledAt` (fall back to top-level) with `now`, both converted to naive UTC; aware values go through `.astimezone(timezone.utc).replace(tzinfo=None)`.
   - Past or missing → `completed`; future → `scheduled`.
6. **Re-sync:** set top-level `stage`/`status` from the tip. Set top-level `scheduledAt` to the tip's when the tip's is set and its UTC date differs. Count `top_resynced` only if something changed.

- [ ] **Step 1: Write the failing tests** in `tests_unit/test_interview_normalize.py`. Use plain dicts; `NOW = datetime(2026, 9, 30, 12)`. Test names and core assertions:
  - `test_normalize_status_maps_legacy`: `failed→rejected`, `no_show→canceled`, `rescheduled→scheduled`, `"InterviewStatus.passed"→passed`, `""→None`.
  - `test_normalize_stage_maps_legacy`: `tech→tech_round_1`, `tech2→tech_round_2`, `hiring_manager→cultural`, `offer→final`, `"InterviewStage.panel"→panel`, `rejected→rejected`.
  - `test_rejected_tip_scheduled_becomes_canceled_on_previous`: history `[intro(id a, status completed), rejected(id b, status scheduled)]` gives:
    - `doc["stageHistory"]` has length 1, and `[0]["status"] == "canceled"`
    - `doc["stage"] == "intro"`, `doc["status"] == "canceled"`
    - `question_remap == {"b": "a"}`
    - `rules["rejected_to_canceled"] == 1`
  - `test_rejected_tip_completed_becomes_rejected_on_previous`: same shape with tip status `completed` gives previous status `rejected` and `rules["rejected_to_rejected"] == 1`.
  - `test_rejected_tip_failed_maps_then_rejects`: tip status `failed` gives previous status `rejected`.
  - `test_rejected_tip_uses_top_status_when_tip_status_none`: tip status None, top-level `status: "scheduled"` gives `canceled`.
  - `test_rejected_merges_note_and_transcript`:
    - prev note `""`, tip note `"N"` → `"N"`
    - prev transcript `"A"`, tip transcript `"B"` → `"A\n\n---\nB"`
    - whitespace-only tip text leaves prev unchanged
  - `test_rejected_only_history_becomes_intro`: `[rejected(status completed)]` gives entry stage `intro`, status `rejected`, `question_remap == {}`, and `rules["rejected_only_to_intro"] == 1`.
  - `test_empty_history_top_level_rejected_becomes_intro`.
  - `test_earlier_none_becomes_passed_latest_untouched`: `[intro(None), tech_round_1(completed)]` gives `["passed", "completed"]`.
  - `test_latest_none_past_completed_future_scheduled`: tip scheduledAt `2026-09-29` → `completed`; `2026-10-02` → `scheduled`.
  - `test_latest_none_with_aware_datetime` *(Review Focus 4)*: tip scheduledAt `datetime(2026,10,2,tzinfo=timezone.utc)` → `scheduled`, with no exception.
  - `test_remap_only_contains_removed_ids` *(Review Focus 5)*: the keys of `question_remap` are exactly the removed rejected ids, never surviving ids and never `None` (tip id missing → no entry).
  - `test_resolve_is_idempotent` *(Review Focus 3)*: `r2 = resolve_interview(r1.doc, now=NOW)` gives `r2.doc == r1.doc`, `r2.question_remap == {}`, `sum(r2.rules.values()) == 0`.
  - `test_resolve_does_not_mutate_input`: `raw` is unchanged after the call (compare with a `copy.deepcopy` taken before).

- [ ] **Step 2: Run to verify failure.** Run: `.venv/Scripts/python -m pytest -q tests_unit/test_interview_normalize.py`. Expected: collection error `ModuleNotFoundError: app.interview_normalize`.

- [ ] **Step 3: Implement `app/interview_normalize.py`** with the interfaces above. It must not import from `app.models` or `app.routers` (no cycles; the model imports this module).

- [ ] **Step 4: Run to verify pass.** Same command. Expected: all pass.

---

### Task 2: Model enums and read-time safety net

**Files:**
- Modify: `app/models/interview.py` (the enums at lines 15-47, `InterviewStageEvent` at 57-79, `Interview._coerce_legacy_stage`/`_migrate_legacy_fields` at 124-138)
- Test: `tests_unit/test_interview_normalize.py` (append)

**Interfaces:**
- Consumes: Task 1 `normalize_status`, `normalize_stage`, `resolve_interview`.
- Produces:
  - `InterviewStatus` with exactly the 5 values; `InterviewStage` with exactly the 10 values (drop `rejected`, `tech`).
  - `InterviewStageEvent.status` accepts legacy strings through a `field_validator("status", mode="before")` → `normalize_status`.
  - `Interview` `model_validator(mode="before")`: when `data` is a dict, return `resolve_interview(data, now=datetime.now(timezone.utc)).doc`, after the existing `interviewName` fallback.
  - `_LEGACY_STAGE_MAP` and `_coerce_legacy_stage` are removed; `normalize_stage` covers them.

- [ ] **Step 1: Write failing tests** (append):
  - `test_stage_event_accepts_legacy_status` *(Review Focus 2)*: `InterviewStageEvent(stage="intro", at=NOW, status="no_show").status == InterviewStatus.canceled`; the same for `failed→rejected` and `rescheduled→scheduled`.
  - `test_enums_match_spec`: `[s.value for s in InterviewStatus] == list(STATUS_VALUES)` and `[s.value for s in InterviewStage] == list(STAGE_VALUES)`.
- [ ] **Step 2: Run to verify failure.** Expected: the `no_show` case fails, because the current enum keeps `no_show`.
- [ ] **Step 3: Implement** the model changes listed under Interfaces. `Interview` can't be validated without a DB (`CollectionWasNotInitialized`), so its hook stays a one-line call to the tested `resolve_interview`.
- [ ] **Step 4: Run** `pytest -q tests_unit/test_interview_normalize.py tests_unit/test_interview_stages.py`. Expected: all pass. Update any `test_interview_stages.py` assertion that uses a removed enum member, using the Global Constraints maps.
- [ ] **Step 5: Smoke-load real documents, read-only.** Run a scratch script (in the session scratchpad, not the repo) that loads every interview through Beanie after `init_db()` and prints `loaded N, errors 0`. Expected: `loaded 683, errors 0` (the count may have grown).

---

### Task 3: Router write compatibility and validation

**Files:**
- Modify: `app/routers/interviews.py`:
  - `_stage_value`/`_normalize_stage` (45-71): delegate to `normalize_stage`
  - `create_interview` (605-680), `update_interview` (683-844), the stage create/patch handlers (846-950): apply `translate_legacy_write`
- Modify: `tests/test_interviews.py`: fix the stale `tech1`/`tech2` expectations at lines ~49, 67, 77 to `tech_round_1`/`tech_round_2`; add the compatibility tests (written, not run).
- Test: `tests_unit/test_interview_normalize.py` (append)

**Interfaces:**
- Consumes: Task 1.
- Produces: `translate_legacy_write(stage: Optional[str], status: Optional[str]) -> tuple[Optional[str], Optional[str]]`, added to `app/interview_normalize.py`. It returns `(stage_to_apply, status_to_apply)`:
  - `stage` normalises to `"rejected"` → `(None, "canceled")` if `normalize_status(status) == "scheduled"`, else `(None, "rejected")`. `None` stage means "do not change stage, do not append a round".
  - Otherwise → `(normalize_stage(stage), normalize_status(status))`.
  - `""` inputs pass through as `""`, because the router treats `""` as "clear".

**Handler wiring**
- **create and PUT:** run `translate_legacy_write` on `body.stage`/`body.status` before any use. A translated `None` stage with a status means: set the status on the tip, and don't touch the stage or history.
- **POST `/{id}/stages`:** `stage="rejected"` → 400 `"rejected is a status; set status on the current round"`.
- **PATCH `/{id}/stages/{sid}`:** `stage="rejected"` → keep the entry's stage and set its status from the translation.
- **Validation:** after translation, status must be in `STATUS_VALUES` (else the existing 400 `"invalid status"`), and stage must be in `STAGE_VALUES` (else 400 `"invalid stage"`).
- **Deferred:** keep the list-filter `tech` expansion (469-496) for now; the phase 1 board still sends `stage=tech`. It's removed in phase 3.

- [ ] **Step 1: Write failing unit tests** (append):
  - `test_translate_rejected_scheduled_is_canceled`: `translate_legacy_write("rejected", "scheduled") == (None, "canceled")` *(Review Focus 1)*
  - `test_translate_rejected_other_is_rejected`: `("rejected", "completed") → (None, "rejected")`; `("rejected", None) → (None, "rejected")`
  - `test_translate_maps_legacy_pair`: `("tech2", "no_show") → ("tech_round_2", "canceled")`
  - `test_translate_passes_empty_strings`: `("", "") → ("", "")`
- [ ] **Step 2: Run.** Expected: FAIL with `ImportError: cannot import name 'translate_legacy_write'`.
- [ ] **Step 3: Implement** `translate_legacy_write`, then the handler wiring above.
- [ ] **Step 4: Add integration tests** to `tests/test_interviews.py` (not run):
  - `test_put_legacy_rejected_scheduled_sets_canceled_without_new_round`: create intro; PUT `{"stage": "rejected", "status": "scheduled"}` gives `status == "canceled"`, `stage == "intro"`, `len(stageHistory) == 1`.
  - `test_put_legacy_failed_status_maps_to_rejected`.
  - `test_post_stage_rejected_returns_400`.
- [ ] **Step 5: Verify** with `pytest -q tests_unit/test_interview_normalize.py tests_unit/test_interview_stages.py`: all pass. Then run `python -c "import app.main"` and `pyflakes app/routers/interviews.py`: clean.

---

### Task 4: Migration script

**Files:**
- Create: `scripts/migrate_interview_statuses.py`

**Interfaces:**
- Consumes: Task 1 `resolve_interview`, `Resolution`.
- Produces:
  - CLI `python -m scripts.migrate_interview_statuses [--apply]`.
  - Pure helper `changed_fields(raw: dict, doc: dict) -> dict` returns the `$set` payload of top-level keys among `stage`, `status`, `scheduledAt`, `stageHistory` whose values differ.

**Script behaviour**
- Follow `scripts/migrate_stage_notes.py`: docstring with run instructions, the repo root on `sys.path`, `AsyncIOMotorClient(get_settings().MONGODB_URI).get_default_database()`.
- Use **raw motor collections, not Beanie**, because Beanie's read hook (Task 2) would hide the differences.
- For each raw interview: `res = resolve_interview(raw, now=datetime.now(timezone.utc))`, then `payload = changed_fields(raw, res.doc)`.
- **With `--apply`:**
  - `update_one({"_id": raw["_id"]}, {"$set": payload})` when `payload` is non-empty.
  - For each `old, new` in `res.question_remap`: `interviewquestions.update_many({"interviewId": raw["_id"], "stageId": old}, {"$set": {"stageId": new}})`.
- **Output:** print the mode, `scanned`, `changed`, the totals of each rule (summed `Counter`), the question remap count (entries, plus matched docs in apply mode) and the `_id`s that hit `rejected_only_to_intro`.
- Exit code 0.

- [ ] **Step 1: Write a unit test** `tests_unit/test_interview_normalize.py::test_changed_fields_only_diff`: an identical doc gives `{}`; a changed `status` and `stageHistory` give only those two keys.
- [ ] **Step 2: Run to verify failure**, then implement `changed_fields` and the script. Run to verify pass.
- [ ] **Step 3: Dry run against the dev DB (read-only).** Run `PYTHONPATH=. .venv/Scripts/python -m scripts.migrate_interview_statuses`. Expected:
  - `mode=dry-run`
  - `scanned` ≈ 683
  - `rejected_to_canceled + rejected_to_rejected + rejected_only_to_intro == 368`
  - `rejected_only_to_intro == 18`
  - `earlier_none_to_passed == 113`
  - `latest_none_* == 0`
  - question remap entries ≈ the number of rejected entries with an id
  - Record the output to show Pedro. **Do not run `--apply`.**

---

### Task 5: Backend readers

**Files:**
- Modify: `app/routers/metrics.py`: `_ROUND_COUNT_EXCLUDED` (76-80), `_dated_rounds` (165-182), `_count_interview_rounds` (185-215), `dashboard_feed` (908-917)
- Modify: `app/routers/applications.py`: `attach_interview_to_app` (123-161)
- Modify: `app/slack_bot.py`: `_SKIP_STATUSES` (315-321); delete the unused `interview_update_is_noteworthy` (351-371) and its tests in `tests_unit/test_slack_bot.py:200-218`. Phase 2 replaces it.
- Modify: `app/prompts/interview_review.py:9-22` (drop the `rejected` label), `app/routers/ai_review.py:80-81` (keep `.value`)
- Test: create `tests_unit/test_interview_metrics.py`

**Interfaces:**
- Produces:
  - `_dated_rounds(iv) -> list[tuple[str, Optional[datetime], Optional[str]]]`: `(stage, scheduledAt, status)` per history entry, using the same dedupe and tip logic as today. The tip status comes from the entry, falling back to `iv.status`.
  - `_count_interview_rounds(iv, start, end) -> tuple[int, int, dict[str, int]]`, with the same signature:
    - A round whose status is `canceled` and whose date is in range adds 1 to `canceled`, and is not counted or broken down.
    - Other in-range rounds are counted unless their stage is in `_ROUND_COUNT_EXCLUDED = {"ai_interview", "home_assessment"}`.
    - The stage-rejected branch is deleted.
  - `interview_status_value(status: Any) -> Optional[str]` in `app/interview_normalize.py` (Task 1 module): `normalize_status` plus `.value` handling, used by readers.
  - `dashboard_feed`:
    - `kind = "interview_done" if interview_status_value(iv.status) in ("completed", "passed", "rejected") else "interview_past"`
    - `status = interview_status_value(iv.status)`
  - `pipeline_outcome_for_status(status: Any) -> Optional[str]` in `app/routers/applications.py`: returns `"rejected"` for `rejected`, else `None`.
    - `attach_interview_to_app` uses it: when it returns `"rejected"` and `app.outcome == "active"`, set the outcome and `_advance_stage(... KanbanStage.rejected ...)` as today.
    - The interview stage no longer maps to `rejected`, because `rejected` isn't a stage any more.
  - `_SKIP_STATUSES = {completed, passed, rejected, canceled}`.

- [ ] **Step 1: Write failing tests** in `tests_unit/test_interview_metrics.py`, using `SimpleNamespace` interviews like `tests_unit/test_interview_stages.py` does. Window: Sep 28 – Oct 4, 2026.
  - `test_canceled_round_counts_as_canceled_not_held`: history `[intro(Sep 29, passed), tech_round_1(Oct 1, canceled)]` → `(1, 1, breakdown intro=1)`.
  - `test_earlier_rounds_of_canceled_interview_now_count`: the same interview with intro in range gives `rounds == 1`. The old code returned 0; this is the documented behaviour change.
  - `test_ai_and_home_assessment_excluded`.
  - `test_out_of_range_canceled_not_counted`.
  - `test_dashboard_status_is_plain_string`: `interview_status_value(InterviewStatus.passed) == "passed"`; `interview_status_value("failed") == "rejected"`.
  - `test_pipeline_outcome_for_status`: `rejected → "rejected"`; `canceled`, `passed`, `None` → `None`.
- [ ] **Step 2: Run to verify failure.**
- [ ] **Step 3: Implement** the Interfaces.
- [ ] **Step 4: Run** `pytest -q tests_unit/test_interview_metrics.py tests_unit/test_slack_bot.py tests_unit/test_interview_normalize.py tests_unit/test_interview_stages.py`. Expected: all pass. Then `pyflakes` on the touched files: clean.

---

### Task 6: Frontend phase 1 (today's screens on the new values)

**Files:**
- Modify: `src/lib/stageBadge.ts`: remove `rejected` from `BOARD_FORM_STAGES` (11), `INTERVIEW_STAGES` (85) and `INTERVIEW_STAGE_ORDER` (100); add status helpers
- Modify: `src/pages/Interviews.tsx`:
  - `STATUSES`/`statusBadgeClass`/`boardStatus*` (322-362) → shared helpers
  - canceled/rejected detection (184-210, 308-320, 527-571, 729)
  - drop on Canceled (1127-1165)
  - `ROUND_COUNT_EXCLUDED` (401) → `['ai_interview', 'home_assessment']`
- Modify: `src/pages/InterviewsLive.tsx` (79-106, 167, 305): canceled/rejected by status
- Modify: `src/pages/InterviewFocus.tsx` (42-88): `STATUS_OPTIONS` and tones → shared helpers
- Modify: `src/components/InterviewEditPanel.tsx` (127-130): `FORM_STATUSES` → all 5 statuses
- Modify: `src/pages/Dashboard.tsx` (296, 338): show `stageLabel(...)` and `interviewStatusLabel(...)` instead of raw keys

**Interfaces:**
- Produces, in `stageBadge.ts`:
  - `INTERVIEW_STATUSES = [{value:'scheduled',label:'Scheduled'},{value:'completed',label:'Completed'},{value:'passed',label:'Passed'},{value:'rejected',label:'Rejected'},{value:'canceled',label:'Canceled'}] as const`
  - `type InterviewStatusValue`
  - `normalizeInterviewStatus(s?: string | null): InterviewStatusValue | ''` (legacy map as in Global Constraints)
  - `interviewStatusLabel(s?: string | null): string` (`'—'` when empty)
  - `interviewStatusBadgeClass(s?: string | null): string`:
    - scheduled: the blue classes from today's `statusBadgeClass`
    - completed: zinc
    - passed: emerald
    - rejected: the red classes today's `stageBadgeClass('rejected')` uses
    - canceled: zinc-muted with `line-through`
- **Board rules:**
  - `isCanceledInterview(iv) = normalizeInterviewStatus(iv.status) === 'canceled'`
  - `isRejectedFail(iv) = normalizeInterviewStatus(iv.status) === 'rejected'`
  - A card's column is `canceled` if canceled, otherwise its stage column (rejected cards keep their stage column and the red corner).
  - Dropping on Canceled sends `updateInterview(id, { status: 'canceled' })`, with no `stage`, no date modal and no new round.
  - Round stats count `canceled` by the round's status.

- [ ] **Step 1: Implement** the helpers, then replace every local status list and palette in the four pages with them. The goal: after this task, `grep -rn "'no_show'\|'failed'\|'rescheduled'" src` finds matches only inside `normalizeInterviewStatus`.
- [ ] **Step 2: Type check.** Run `npx tsc -b --noEmit 2>&1 | grep -c "error TS"`. Expected: `6` (the errors that already exist; none new).
- [ ] **Step 3: Check against unmigrated data.** Make sure the FE dev server on :3001 serves the modules (`curl -s -o /dev/null -w "%{http_code}" http://localhost:3001/src/pages/Interviews.tsx` → `200`). With the BE on :8081 running Task 2's read hook, fetch `/interviews?limit=500` with a short-lived staff token (read-only, same method as the transactions check). Assert:
  - no `stage == "rejected"`
  - every `status` is in the 5 values
  - there are ≈165 `canceled` and ≈203 `rejected` among interviews whose raw stage was rejected

  Pedro does the visual check in the browser.

---

### Task 7: Final verification and commits

**Files:** none new.

- [ ] **Step 1: BE unit suite.** Run `.venv/Scripts/python -m pytest -q tests_unit --ignore=tests_unit/test_resume_experience_roles.py --ignore=tests_unit/test_style_serializer.py --ignore=tests_unit/test_template_annotate_removals.py`. Expected: all pass (136 earlier, plus the new tests).
- [ ] **Step 2: Grep checks** in the BE:
  - `grep -rn "str(iv.status)\|str(interview.status)" app` → no matches
  - `grep -rn '"rejected"' app/routers/metrics.py` → no matches
- [ ] **Step 3: Restart the BE server on :8081** (uvicorn `--reload` has hung on Windows before; stop and start it) and confirm `Application startup complete`.
- [ ] **Step 4: Commit the BE** (explicit paths only):

```bash
git add app/interview_normalize.py app/models/interview.py app/routers/interviews.py app/routers/metrics.py \
  app/routers/applications.py app/slack_bot.py app/prompts/interview_review.py app/routers/ai_review.py \
  scripts/migrate_interview_statuses.py tests_unit/test_interview_normalize.py tests_unit/test_interview_metrics.py \
  tests_unit/test_interview_stages.py tests_unit/test_slack_bot.py tests/test_interviews.py
git commit -m "Make rejected and canceled interview statuses, with a migration and status-based metrics

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

- [ ] **Step 5: Commit the FE** (explicit paths only):

```bash
git add src/lib/stageBadge.ts src/pages/Interviews.tsx src/pages/InterviewsLive.tsx src/pages/InterviewFocus.tsx \
  src/components/InterviewEditPanel.tsx src/pages/Dashboard.tsx docs/superpowers/plans/2026-09-30-interviews-phase1-statuses.md
git commit -m "Use the five interview statuses across the Interviews pages and Dashboard

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

- [ ] **Step 6: Confirm** that `git status --short` in both worktrees shows only the transactions files still modified.
- [ ] **Step 7: Report to Pedro:** the migration dry-run counts, and a request for the go-ahead to run `--apply`.
