# Profile page → Profile tab: fixed resumes and tailoring first

Date: 2026-11-14 · engineers_app branch `feat/profile-tab-ux` (from `main`). Website only; no server change.

## Why

The Profile tab is where owners **maintain a profile's fixed resumes and its tailoring (tailor resume draft = the HTML
template, plus the tailoring prompt)** (user). A profile can have several of each, and most profiles use only one
kind (user). Today those two jobs share the tab with equal-weight details, two folded blocks and a "Coming soon"
panel; prompt edits can be lost; and the header doesn't say which profile you're on.

## Goals, non-goals, anti-goals

- Goals: fixed resumes and tailoring are the two main sections; the kind a profile doesn't use takes one line; one
  clear save for tailoring with nothing lost; the header names the profile and shows what's set up.
- Non-goals: stack labels on fixed resumes; pairing fixed resumes with units (Job Applies picks them independently:
  fixed resumes by score, units by role); the Metrics tab; the New profile page; Prompt eval's own screens.
- Anti-goals: a page whose sections move around per profile; any change to what is saved or how Job Applies uses it.

## Approaches (user picked 1)

1. **One page, empty kind collapsed to a one-line invitation** — picked.
2. Separate tabs (Profile | Fixed resumes | Tailoring | Metrics) — more clicks to see the other kind exists; details
   and "More" would be a thin tab.
3. Like 1 but the used kind moves to the top — the page changes shape per profile.

## The tab, top to bottom

```
←  Matthew (Puma)                                          [Profile | Metrics]
   US · Americas · 2 fixed resumes · 3 tailoring units (default: Backend)
   ⚠ "QA" unit has no tailor draft                       (warnings only when any)

Details   Name [Matthew (Puma)   ]  Country [US ▾]  Region [Americas ▾]

Fixed resumes                                                  [Upload PDFs]
  Sent as is when one scores above the Job Applies run's minimum.
  backend_resume.pdf     612 words · Nov 3, 2026      👁 ⬇ 🗑
  fullstack_resume.pdf   540 words · Oct 28, 2026     👁 ⬇ 🗑
  — or, with none: "No fixed resumes. [Upload PDFs]" on one line

Tailoring                                    Unsaved · 1 unit   [Save]
  The unit whose roles fit the job: its draft rewritten by its prompt.
  [Backend ★] [Fullstack •] [QA] [+ Add unit]
  Name · Roles · Set as default · Delete
  ┌ Tailor draft (HTML template) ─────┐┌ Tailoring prompt ──────────────┐
  └───────────────────────────────────┘└────────────────────────────────┘
  — or, with no draft and no prompt in any unit:
    "No tailoring set up. [Set up tailoring]" on one line (opens the editor)

▸ More: screening answers, cover letter, prompt eval      (folded, remembered)
```

### Header and status strip

- Page title = the profile name (also the browser tab title), back to Profiles.
- Under it, one muted line: country · region (when set) · `N fixed resume(s)` · `N tailoring unit(s) (default:
  Name)`; `Archived` chip when the profile is archived.
- Warnings (amber, only when any): a unit with roles or a prompt but no tailor draft; a non-default unit with no
  roles (Job Applies can never suggest it). My call: just these two; nothing about fixed resumes (an empty list is a
  valid choice).

### Details

- One compact row as today (name, country, region), no section description.
- Name saves on blur **only when it changed**; a blank name restores the saved one with an inline "A profile needs a
  name" message; the toast says "Profile renamed" only after a real rename. Country and region keep saving on change.

### Fixed resumes

- Today's `ResumesSection`, retitled "Fixed resumes", description as in the sketch; the hint about "one resume per
  stack" goes. Upload button in the section header.
- None: the section is one line with the Upload button (and the drop of files works the same).

### Tailoring

- Today's `ResumeUnitsEditor`, **always open** (the Prompts fold goes), titled "Tailoring". The "Coming soon" Eval
  panel is removed; the draft and the prompt split the width 1:1 on large screens.
- "Not set up" = every unit has an empty draft and an empty prompt: one line + "Set up tailoring", which opens the
  editor for this visit.
- **One save model for everything prompt-related** (units, default, screening, cover letter): one dirty state, shown
  as `Unsaved · N unit(s)` / `Unsaved` / `Saved` next to the Save button in the Tailoring header; the More section
  shows `Unsaved` on its fold when its prompts changed, and its own Save button saves the same state. A
  `beforeunload` warning while anything is unsaved (the app's `BrowserRouter` can't block in-app navigation; noted,
  not solved).
- Deleting a unit uses the app's `ConfirmDialog`, not `window.confirm`.

### More (folded, remembered per browser)

- Screening Q&A answering prompt, Cover letter prompt (as today), then Prompt eval (today's block, without its own
  fold: it lives inside More).

## Data loading

The page loads the profile **once** (SWR, key `['account', id]`) and hands it to the sections; `ResumesSection` and
the prompts state take it instead of each calling `getAccount` (today three calls, each with every resume's text).
After a save, the section updates that cached copy (`mutate`) so the header strip stays right.

## Testing

`npm run lint && npm run build`; the pure helpers (status strip counts and warnings, "tailoring set up?", prompt
dirty state) in a type-only-import module tested with `npm test` (the Node test runner added on
`feat/profile-metrics-ux`; if that branch isn't merged first, this branch adds the same script). Then click through
locally: a profile with only fixed resumes, one with only tailoring, one with both, a new profile; rename blur with
and without a change; edit only the screening prompt and save; reload with unsaved edits.

## Left to the builder

Exact spacing, icons, the strip's wrapping on mobile, the empty-state wording beyond the strings above.
