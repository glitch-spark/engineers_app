# Profile Tab UX Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the profile page's Profile tab lead with fixed resumes and tailoring, name the profile in the header
with a setup strip, save prompts in one place without losing edits, and load the profile once.

**Architecture:** `AccountEdit.tsx` loads the profile once with SWR and passes it down; small pure helpers
(`src/lib/profileSetup.ts`) decide the strip, the warnings, "tailoring set up?" and the prompts' dirty state and are
tested with Node's test runner; the existing sections (`ResumesSection`, `ResumeUnitsEditor`, `PromptEvalBlock`) are
reshaped, not rewritten.

**Tech Stack:** React 18 + TypeScript + SWR + Tailwind on Vite; Node 24 test runner (`node --test`).

**Spec:** `docs/superpowers/specs/2026-11-14-profile-tab-ux-design.md` (this worktree:
`C:/Users/ADMINI~1/AppData/Local/Temp/2/claude/409b0cc9221f9860/d4b3fc45-0895-4b25-8af0-e23ddd50123e/scratchpad/run-app-profile`,
branch `feat/profile-tab-ux` from `main`).

## Global Constraints

- Website only: no API or server change; what is saved and when Job Applies uses it stays the same.
- Checks: `npm test && npm run lint && npm run build` (run `npm ci` once in this worktree first).
- `src/lib/profileSetup.ts` uses **type-only imports** (Node loads it directly); it must not import `promptRoles.ts`
  or anything else at runtime — read roles as `p.roles?.length ? p.roles : p.role ? [p.role] : []`.
- `npm test` = `node --test "tests/*.test.mjs"` (same line as on `feat/profile-metrics-ux`; identical on merge).
- Copy (exact): section titles `Fixed resumes`, `Tailoring`, `More`; fixed-resume description `Sent as is when one
  scores above the Job Applies run's minimum.`; tailoring description `The unit whose roles fit the job: its draft
  rewritten by its prompt.`; empty lines `No fixed resumes.` + `Upload PDFs`, `No tailoring set up.` + `Set up
  tailoring`; blank name `A profile needs a name`; warnings `"{name}" unit has no tailor draft` and `"{name}" unit
  has no roles, so Job Applies never suggests it`; More fold `More: screening answers, cover letter, prompt eval`.
- The tab order and Metrics tab are unchanged; the New profile page is unchanged.

## Review Focus

1. Edit only the screening (or cover-letter) prompt, then Save: it saves and the state returns to `Saved` — pinned in
   Task 1 (`promptsDirty`) and Task 4's click-through.
2. A profile saved before units existed (no `resumePrompts`, only `resumePromptBody` / `styleTemplate`): it reads as
   one unit, counts as set up when it has a body or template — pinned in Task 1.
3. Upload or delete a fixed resume, or save prompts: the header strip's counts update without a reload — pinned in
   Task 3 / Task 4 verify steps (`mutate`).
4. Blur the name field unchanged, blank, and changed: no toast, restore + message, one "Profile renamed" — Task 2.
5. Unsaved prompt edits then reload / close tab: the browser's leave warning appears; after Save it doesn't — Task 4.

---

### Task 1: Setup helpers and the test script

**Files:**
- Create: `src/lib/profileSetup.ts`, `tests/profileSetup.test.mjs`
- Modify: `package.json` (`"test": "node --test \"tests/*.test.mjs\""`)

**Interfaces:**
- Produces (`src/lib/profileSetup.ts`):
  - `type PromptsState = { prompts: ResumePrompt[]; defaultId: string; screeningPrompt: string; coverLetterPrompt: string }`
  - `promptsOf(acc: ProfileDoc): PromptsState` — moved from `AccountEdit.tsx` (legacy profile → one unit `id:
    'default'` named from the body's heading: move `legacyPromptName` logic as a local copy), plus screening / cover.
  - `tailoringSetUp(prompts: ResumePrompt[]): boolean` — any unit with a non-blank `templateHtml` or `body`.
  - `setupStrip(acc: ProfileDoc, state: PromptsState): { parts: string[]; warnings: string[]; archived: boolean }` —
    parts: country, region (when set), `N fixed resume(s)`, and when tailoring is set up `N tailoring unit(s)
    (default: Name)`; warnings per Global Constraints copy (no-draft: has roles or body but no template; no-roles:
    non-default unit with no roles).
  - `promptsDirty(saved: PromptsState, current: PromptsState): { changed: boolean; dirtyUnitIds: string[]; moreChanged: boolean }`
    — unit dirty when name / roles / body / template / templateName differ or it's new; `changed` also when a unit
    was deleted, the default moved, or screening / cover changed; `moreChanged` = screening or cover changed.
  - `type ProfileDoc = { name?; country?; region?; archived?; resumes?: unknown[]; resumePromptBody?; styleTemplate?;
    styleTemplateName?; pageFormat?; resumePrompts?: ResumePrompt[]; defaultPromptId?; screeningPrompt?;
    coverLetterPrompt? }` (all optional, nullable strings).

- [ ] **Step 1: Write the failing tests** (`node:test`, `node:assert/strict`):
  `legacy profile reads as one set-up unit` (body only → `prompts.length 1`, `tailoringSetUp` true; nothing at all →
  false) · `strip counts and default` (2 resumes, 3 units, default Backend, US, Americas → parts `['US', 'Americas',
  '2 fixed resumes', '3 tailoring units (default: Backend)']`; 1 resume → `1 fixed resume`) · `no tailoring: no units
  part` · `warnings` (unit QA with roles and no template → `"QA" unit has no tailor draft`; non-default unit with no
  roles → the no-roles warning; the default unit with no roles → none) · `screening-only edit is a change`
  (`changed true, dirtyUnitIds [], moreChanged true`) · `unit edit, delete and default move` each give `changed` ·
  `same state is not a change` · `archived flag passes through`.
- [ ] **Step 2: Run, expect FAIL** — `npm test` → `Cannot find module .../profileSetup.ts`.
- [ ] **Step 3: Implement** `src/lib/profileSetup.ts`.
- [ ] **Step 4: Run, expect PASS** — `npm test && npm run lint`.
- [ ] **Step 5: Commit** — `feat(profile tab): setup strip, tailoring and dirty-state helpers`

### Task 2: One load, header, strip and details

**Files:**
- Modify: `src/pages/AccountEdit.tsx`

**Interfaces:**
- Consumes: Task 1 (`promptsOf`, `setupStrip`, `ProfileDoc`).
- Produces: inside `AccountEditPage`, `const { data: account, mutate } = useSWR(isNew ? null : ['account', id], () =>
  api.getAccount(id!) as Promise<ProfileDoc>)`; children get `account` and `onSaved(doc: ProfileDoc)` which calls
  `mutate(doc, { revalidate: false })`.

- [ ] **Step 1:** Replace the `useEffect` load with the SWR load (load error: toast + navigate to `/accounts`, as
  today). `PageHeader title={account.name || 'Profile'}`.
- [ ] **Step 2:** Under the header, the strip: muted line `parts.join(' · ')`, an `Archived` chip when archived,
  then amber warning lines (each with an `AlertTriangle` icon). Shown on both tabs.
- [ ] **Step 3:** Details row without its section description; name saves on blur only when `name.trim() !==
  account.name`; blank → restore `account.name` and show `A profile needs a name` under the field (cleared on the
  next edit); successful rename → `onSaved`. Country / region unchanged except they call `onSaved` with the result.
- [ ] **Step 4: Verify** — `npm run lint && npm run build` exit 0.
- [ ] **Step 5: Commit** — `feat(profile tab): profile name as title, setup strip, details save only on change`

### Task 3: Fixed resumes

**Files:**
- Modify: `src/components/ResumesSection.tsx`, `src/pages/AccountEdit.tsx`

**Interfaces:**
- Consumes: Task 2 `account`, `onSaved`.
- Produces: `ResumesSection({ accountId, initial: unknown[] | undefined, onSaved: (doc: ProfileDoc) => void })` — no
  own `getAccount`; after upload / delete calls `onSaved(saved)`.

- [ ] **Step 1:** Section titled `Fixed resumes` with the Global Constraints description; the Upload button moves into
  the section header row; the "one resume per stack" wording goes.
- [ ] **Step 2:** None: the whole section is one line `No fixed resumes.` + `Upload PDFs` button (same input).
- [ ] **Step 3: Verify** — `npm run lint && npm run build`. (Upload → strip count is in the user's Task 6 list.)
- [ ] **Step 4: Commit** — `feat(profile tab): fixed resumes section, one-line when empty`

### Task 4: Tailoring with one save

**Files:**
- Modify: `src/pages/AccountEdit.tsx` (the prompts block becomes `TailoringSection`; state lifted to the page so
  Tailoring and More share it), `src/components/prompts/ResumeUnitsEditor.tsx`

**Interfaces:**
- Consumes: Task 1 (`promptsOf`, `promptsDirty`, `tailoringSetUp`, `PromptsState`), Task 2 (`account`, `onSaved`).
- Produces: page-level `const [draft, setDraft] = useState<PromptsState>()` initialised from `promptsOf(account)`
  once per profile id, `saved` = `promptsOf(account)`; `savePrompts(): Promise<void>` (the existing
  `updateAccount` body, then `onSaved`); `ResumeUnitsEditor` props gain `onDeleteRequest(id)` and lose the Eval aside.

- [ ] **Step 1:** Tailoring is always open (remove the Prompts fold and its localStorage key), titled `Tailoring` with
  its description; the Save button and `Unsaved · N unit(s)` / `Unsaved` / `Saved` sit in the section header and use
  `promptsDirty(saved, draft)`.
- [ ] **Step 2:** `ResumeUnitsEditor`: remove the Eval aside and its imports; grid `lg:grid-cols-2`; delete opens the
  app's `ConfirmDialog` (title `Delete the "{name}" unit?`, danger) instead of `window.confirm`.
- [ ] **Step 3:** `tailoringSetUp(draft.prompts)` false and not opened this visit → one line `No tailoring set up.` +
  `Set up tailoring` (opens the editor).
- [ ] **Step 4:** `beforeunload` listener while `changed`, removed when saved / unmounted.
- [ ] **Step 5: Verify** — `npm test && npm run lint && npm run build`. (Saving is checked by the user in Task 6:
  the local backend writes to the live DB.)
- [ ] **Step 6: Commit** — `feat(profile tab): tailoring always open with one save and a leave warning`

### Task 5: More

**Files:**
- Modify: `src/pages/AccountEdit.tsx`, `src/components/promptEval/PromptEvalBlock.tsx`

**Interfaces:**
- Consumes: Task 4 shared `draft` / `setDraft` / `savePrompts` / dirty state.
- Produces: `PromptEvalBlock({ accountId, embedded?: boolean })` — `embedded` renders the content without its own fold.

- [ ] **Step 1:** A `More` fold (remembered in localStorage key `profileEdit.moreOpen`, closed by default) with the
  label from Global Constraints and an `Unsaved` marker when `moreChanged`; inside: Screening Q&A prompt, Cover letter
  prompt (as today, bound to `draft`), a Save button (same `savePrompts`), then `<PromptEvalBlock embedded />`.
- [ ] **Step 2: Verify** — `npm run lint && npm run build`.
- [ ] **Step 3: Commit** — `feat(profile tab): screening, cover letter and prompt eval under More`

### Task 6: Ready for the user's click-through

The local backend (8080, Slack off) writes to the **live DB**, and this session has no browser: the executor does no
saving, uploading or renaming; the user clicks through.

- [ ] **Step 1:** Stop the dev server on 3001 (it serves `run-app`) and start one from this worktree on 3001 (the
  local backend's CORS allows 3001); `curl` the page and `src/pages/AccountEdit.tsx` module → 200.
- [ ] **Step 2:** Read-only data check: count active profiles with only fixed resumes, only tailoring (a unit with a
  template or body), both, neither — so the user can pick one of each to look at.
- [ ] **Step 3:** Hand the user this list: a profile with only fixed resumes, only tailoring, both; the strip and
  warnings; rename blur unchanged (no toast) / blank (restored + message); with an edit they're happy to keep or undo:
  a screening-only edit + Save → `Saved`; unsaved edit + reload → warning; Metrics tab still opens.
- [ ] **Step 4:** No commit; note results in the ledger.
