# Transactions — improve-ui audit

## Design language
- Audited surface: [`Transactions.tsx`](../src/pages/Transactions.tsx) — toolbar, table, add/edit modal
- Design sources: `.toolbar`, `.table-wrap`, `.table-head`, `.table-row`, `.input` in `index.css`
- Documented decisions: `space-y-6` page stack, `PageHeader` + toolbar pattern shared with Accounts
- Governing owners: page-local markup; global table + form tokens
- Explicit exceptions: None documented

## Findings
| # | Problem | Evidence | Proposed change | Scope | Confidence |
| --- | --- | --- | --- | --- | --- |
| 1 | Modal form fields lack visible labels (placeholder-only) | Date, amount, description, notes inputs have no `<label>` | Add `form-label` labels with `htmlFor`; use `space-y-4` in form stack | `Transactions.tsx` | High |
| 2 | Table cell padding tighter than design-system toolbar rhythm | `th`/`td` use `px-3 py-2` while toolbar uses `px-4 py-3` | Standardize table cells to `px-4 py-2.5` | `Transactions.tsx` | Medium |
| 3 | Action icon buttons use `title` only | Edit/delete buttons lack `aria-label` | Add `aria-label` on icon-only action buttons | `Transactions.tsx` | High |

## Improve first
Label the modal form fields — improves scanability and satisfies accessible-name requirements without visual redesign.

## Implementation plan (for executor)
1. Wrap modal fields in labelled groups with `form-label`.
2. Bump table cell padding to `px-4 py-2.5`.
3. Add `aria-label` to row action icon buttons.
