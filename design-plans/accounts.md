# Accounts (Profiles) — improve-ui audit

## Design language
- Audited surface: [`Accounts.tsx`](../src/pages/Accounts.tsx) — search toolbar, profiles table, Generate checkbox column
- Design sources: Same table/toolbar tokens as Transactions; row click navigates to detail
- Documented decisions: `table-row cursor-pointer` for navigable rows; checkbox stops propagation
- Governing owners: `Accounts.tsx`, global `.table-row`
- Explicit exceptions: None documented

## Findings
| # | Problem | Evidence | Proposed change | Scope | Confidence |
| --- | --- | --- | --- | --- | --- |
| 1 | Clear-search control is icon-only without accessible name | Search clear `<button>` has no `aria-label` | Add `aria-label="Clear search"` | `Accounts.tsx` | High |
| 2 | Generate checkbox column alignment feels off-center vs header | `text-center` on cell but checkbox is bare input | Wrap checkbox in `flex justify-center` container | `Accounts.tsx` | Medium |
| 3 | Table cell padding inconsistent with toolbar rhythm | `px-3 py-2` on cells | Use `px-4 py-2.5` to match Transactions polish | `Accounts.tsx` | Medium |

## Improve first
Add `aria-label` on clear-search — minimal fix, high a11y impact.

## Implementation plan (for executor)
1. `aria-label` on clear search button.
2. Center Generate checkbox in flex wrapper.
3. Align table padding to `px-4 py-2.5`.
4. Add `transition-colors` on `table-row` for smoother hover (polish).
