# Caller Rounds in the Interview Pane Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`) syntax.

**Goal:** On the Caller interviews tab, a round click opens the normal interview side pane, scrolled to that round, and a caller can be assigned inline from the pane.

**Architecture:** A new `RoundCallerPicker` component handles showing and assigning the caller. `InterviewSummary`, in both its full view and its summary-only view, renders it for caller rounds. A new `focusRoundId` prop on `InterviewPanel` and `InterviewSummary` scrolls to the clicked round and highlights it. `InterviewsPage` routes caller-round clicks and the `?round=` deep link to the pane, and `CallerRoundDialog` is deleted.

**Tech Stack:** React 18, TypeScript, SWR, vitest + Testing Library.

**Spec:** `docs/superpowers/specs/2026-11-16-caller-rounds-in-pane-design.md`

## Global Constraints
- No backend changes. Assign through the existing `api.assignRoundCaller(interviewId, roundId, callerIdOrEmpty)`. It returns the saved interview.
- The picker shows only when `useCallers().canManage` is true.
- The picker's options come from `callerPickerOptions` in `src/lib/useCallers`, exactly as `CallerRoundDialog` builds them today (`people`, `external`, `ownerId`, `currentUserId`, `savedId`, `savedName`).
- Toasts:
  - `Caller assigned` / `Caller removed` on success.
  - `Failed to assign the caller` on error.
- The Self interviews behaviour doesn't change.
- `npm run lint`, `npm run build`, `npx vitest run` and `npm run test:node` all exit 0.

## Review Focus
- **Someone else's interview** (`summaryOnly`) opened by an interview manager: the picker appears and saves, and the pane stays view-only otherwise.
- **After a save, the pane shows the new caller at once**, without closing. The Caller interviews list or calendar refreshes too.
- **A round that is no longer caller-enabled, or an unknown `roundId`** in `?round=`: the pane opens on the interview with no highlight, and nothing crashes.
- **Non-managers** see no picker anywhere in the pane.
- **Keyboard:** Change caller, the select and Cancel are all reachable. Escape inside the picker must not close the whole pane, or Cancel must exist.

---

### Task 1: Caller rounds open in the pane with an inline caller picker

**Files:**
- Create: `src/components/interview/RoundCallerPicker.tsx`
- Create: `src/components/interview/RoundCallerPicker.test.tsx`
- Modify: `src/components/interview/InterviewSummary.tsx`. This covers `SummaryOnlyView`, the Next/Last round card around `:205-230` and the rounds list around `:342-349`.
- Modify: `src/components/interview/InterviewPanel.tsx`
- Modify: `src/pages/interviews/InterviewsPage.tsx`
- Modify: `src/pages/interviews/CallerRoundsList.tsx` (doc comment only)
- Delete: `src/components/interview/CallerRoundDialog.tsx`
- Test: `src/pages/interviews/InterviewsPage.test.tsx`

**Interfaces:**
- **Produces:** `RoundCallerPicker({ interview, roundId, onSaved }: { interview: Interview; roundId: string; onSaved: (saved: Interview) => void })`.
  - It renders the caller dot and name. "No caller yet" is shown when the round is unassigned (use `isUnassigned` and `CALLER_DOT` / `UNASSIGNED_CHIP` from `lib/callerColors`).
  - For managers, a `Change caller` button sits next to it (`Assign caller` when the round is unassigned). The button swaps in a `Select`, labelled `Caller for <stage label>`, and a `Cancel` button.
  - Choosing an option saves immediately with `api.assignRoundCaller`. Then it calls `onSaved` and collapses.
- **Produces:**
  - `InterviewPanel` takes a new optional prop `focusRoundId?: string`.
  - `InterviewSummary`'s `SummaryProps` takes new props: `focusRoundId?: string`, `onCallerSaved: (saved: Interview) => void`, and `canManageCallers` is not needed, because the picker reads `useCallers` itself.
  - `SummaryOnlyView` takes `{ iv, tz, focusRoundId?, onCallerSaved, user, onConfirm }`. It shows the confirmed badge plus `Mark confirmed` / `Unconfirm` when `canConfirm(user, iv, round)` holds and `!isTbdRound(round)` and `needsConfirmBadge(...)` holds.
- **Consumes:** `InterviewPanel`'s existing `applySaved` and `setRoundConfirmed`.

- [ ] **Step 1: Write the failing tests**
  - `RoundCallerPicker.test.tsx` (mock `useCallers` and `api.assignRoundCaller`):
    - `manager changes the caller and it saves at once`:
      - `canManage: true`.
      - Click `Change caller`, pick `Ana`.
      - `assignRoundCaller` is called with `('iv1', 'r1', '<ana id>')`.
      - `onSaved` receives the returned interview.
      - The select is gone afterwards.
    - `unassigned round says Assign caller`: the name text reads `No caller yet`, and the button reads `Assign caller`.
    - `non-manager sees the name only`: `canManage: false` gives no button.
    - `Cancel closes the picker without saving`.
  - `InterviewsPage.test.tsx`:
    - `a caller round click opens the interview pane on that round`:
      - On `/interviews/callers`, with `listCallerRounds` mocked to return one row and its interview.
      - Clicking the row opens `role="dialog"`, named by the company, with the full pane footer or a view-only footer.
      - No `Modal` titled `<company> · <stage>` appears.
      - The focused round's `li` has `data-focused="true"`.
    - `?round=iv1:r1 opens the pane`: with `getInterview` mocked, the pane opens with `r1` focused.
- [ ] **Step 2: Run** `npx vitest run src/components/interview/RoundCallerPicker.test.tsx src/pages/interviews/InterviewsPage.test.tsx`. Expect FAIL.
- [ ] **Step 3: Implement**
  - The picker as specified above.
  - `InterviewSummary`:
    - Replace the caller text in the spotlight card with `<RoundCallerPicker>` and keep the method, Mark confirmed and Join/Copy link beside it. Do the same in the rounds list and in `SummaryOnlyView`.
    - A focused round `li` gets `data-focused="true"` and a visible ring (`ring-2 ring-sky-400 rounded-lg`). On mount, and when `focusRoundId` changes, it calls `scrollIntoView({ block: 'center' })`. Guard the call: jsdom lacks it.
  - `InterviewPanel`:
    - Pass `focusRoundId` and `onCallerSaved={applySaved}`.
    - Pass `user` and `onConfirm={setRoundConfirmed}` to the summary-only view too.
  - `InterviewsPage`:
    - `PanelState` gains `focusRoundId?`.
    - The callers list and calendar `onOpenRound` call `setPanel({ interview: iv, mode: 'view', focusRoundId: roundId })`.
    - `?round=` sets the panel the same way.
    - Remove `callerRound` state and the dialog.
  - Delete `CallerRoundDialog.tsx`.
- [ ] **Step 4: Run** the same two files, then the full checks: lint, build, vitest and test:node. Expect PASS, with exit codes 0.
- [ ] **Step 5: Commit** `feat(interviews): caller rounds open in the interview pane, with an inline caller picker`
