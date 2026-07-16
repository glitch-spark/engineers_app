# Modal — improve-ui audit

## Design language
- Audited surface: Shared [`Modal.tsx`](../src/components/Modal.tsx) used across Transactions, Users, Interviews
- Design sources: [`index.css`](../src/index.css) — `.panel-elevated`, `.section-title`, `.btn-icon`
- Documented decisions: Zinc palette, rounded-xl panels, 24px horizontal padding in modal chrome
- Governing owners: `Modal.tsx`, global `.panel-elevated` / animation tokens in `tailwind.config.cjs`
- Explicit exceptions: None documented

## Findings
| # | Problem | Evidence | Proposed change | Scope | Confidence |
| --- | --- | --- | --- | --- | --- |
| 1 | Modal backdrop uses `backdrop-blur-sm`, a paint-heavy filter on a full-viewport layer | `Modal.tsx` line 67: `bg-zinc-900/40 backdrop-blur-sm` | Replace with opaque scrim `bg-zinc-900/50` (no blur) per motion-perf guidance | `Modal.tsx` | High |
| 2 | Modal panel opens instantly without compositor-friendly scale transition | Panel uses Tailwind `animate-fade-in-up` once; no `prefers-reduced-motion` guard on overlay+panel pair | Apply `t-modal` + `is-open` pattern from transitions-dev; add reduced-motion guard in `index.css` | `Modal.tsx`, `index.css` | High |
| 3 | Overlay is a `<button>` without dialog association | Backdrop is separate from `role="dialog"` panel | Keep button backdrop; ensure Escape + focus trap already on panel (present); no change needed for association | — | — |

## Improve first
Remove backdrop blur and adopt `t-modal` open transition — improves perceived quality on low-end GPUs without changing visual identity.

## Implementation plan (for executor)
1. Add `--modal-*` tokens and `.t-modal` / `.modal-overlay` rules to `index.css` with `prefers-reduced-motion` guard.
2. In `Modal.tsx`: mount with `requestAnimationFrame` → add `is-open` on overlay + panel; remove `backdrop-blur-sm`.
3. Verify focus trap, Escape, and body scroll lock remain intact.
