# Caller rounds open in the interview pane — design (short)

Approved by the user 2026-11-16.

## Intent
Self interviews and Caller interviews should work almost the same way. Clicking a caller round opens the normal
interview side pane, not a separate popup. Assigning a caller should be easy from that pane. The one difference
between the two tabs: callers can be assigned on caller interviews.

## Decisions
- **One side pane on both tabs.** Clicking a caller round in the Caller interviews list or calendar opens the same
  `InterviewPanel` as Self interviews. The pane opens scrolled to that round, and the round is highlighted.
  `CallerRoundDialog` is removed.
- **Assigning a caller from the pane.**
  - Every caller round in the pane shows its caller, with an inline **Change caller** picker. Picking a caller saves
    it immediately; there is no Edit round step.
  - The Next round card gets the same picker, plus the existing **Mark confirmed** button.
  - The picker covers both the full view and the view-only summary of someone else's interview. Interview managers
    (Puma) assign callers on other owners' interviews, which are view-only for them otherwise.
- **Who can assign: unchanged.** The picker shows only when `useCallers().canManage` is true (admins and interview
  managers). Everyone else sees the caller's name as today.
- **Download brief** stays where it is in the pane.
- **Slack "Assign caller" link.** The link (`?round=<interviewId>:<roundId>` on `/interviews/callers`) keeps its URL.
  It now opens the pane on that round.
- **Self interviews: no change.**

## Approaches considered
1. **Pane with an inline picker.** Chosen: one pane and one way to work.
2. **Keep the popup and add an "Open interview" link.** Rejected: two different UIs remain.
3. **Assign through Edit round in the pane.** Rejected: too many clicks, and Edit round is closed to managers on
   others' interviews.

## Non-goals
- Merging the Self and Caller tabs. The user will revisit this later.
- Any change to the backend or to permissions.

## Left to the builder
- How the picker looks: a compact select with a Cancel link. It must stay keyboard accessible.
- How the focused round is highlighted.

## Interaction with other work
The coordination-actions plan (`backend-reorg/docs/superpowers/plans/2026-11-16-coordination-channel-actions.md`)
also edits `InterviewPanel` and `InterviewSummary`. It builds on this change.
