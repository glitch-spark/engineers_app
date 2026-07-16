# Generated screening drawer — improve-ui audit

## Design language
- Audited surface: `ScreeningPanel` in [`Generated.tsx`](../src/pages/Generated.tsx)
- Design sources: `.drawer` in `index.css`; Modal parity expected for overlays
- Documented decisions: Right-side drawer 480px on `sm+`, zinc borders, `btn-icon` close
- Governing owners: `Generated.tsx` `ScreeningPanel`, `.drawer` class
- Explicit exceptions: None documented

## Findings
| # | Problem | Evidence | Proposed change | Scope | Confidence |
| --- | --- | --- | --- | --- | --- |
| 1 | Drawer has no enter transition; appears abruptly | `.drawer` in `index.css` has no transform/transition | Add slide-in-from-right transition with `is-open` hook + reduced-motion guard | `index.css`, `Generated.tsx` | High |
| 2 | Drawer lacks modal a11y parity (no focus trap, Escape, scroll lock) | `ScreeningPanel` only has backdrop `onClick`; no `role="dialog"` | Mirror Modal: `role="dialog"`, `aria-modal`, labelled header, Escape, focus trap, body overflow hidden | `Generated.tsx` | High |
| 3 | Header/footer padding inconsistent with Modal chrome | Drawer uses `px-4 py-3` header vs Modal `px-6 py-5` | Align to `px-6 py-4` header and `p-6` footer for rhythm | `Generated.tsx` | Medium |

## Improve first
Add drawer slide transition + modal a11y parity — biggest UX gap vs the shared Modal component.

## Implementation plan (for executor)
1. Extend `.drawer` + `.drawer-overlay` in `index.css`.
2. Refactor `ScreeningPanel` with `useId`, `useRef`, focus/escape effect matching `Modal.tsx`.
3. Normalize header/footer spacing.
