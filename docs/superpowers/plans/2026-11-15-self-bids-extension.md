# Self Bids via the Extension — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Owners sign into Bid Track with their platform login and one profile per Chrome profile; their applies are stored as self bids; a pilot shows tracked next to typed self bids; a setting later switches each (owner, profile) to tracked counts.

**Architecture:** Server first for the extension's needs (owner token bound to a profile, owner upload routes, `Bid.kind="self"`), then the extension (sign-in mode + uploads), then counts (pilot display, phase-2 write-through into the Daily Plan day), then the website (Daily Plan display, Bidders Self row).

**Tech Stack:** FastAPI, Beanie, pytest + mongomock-motor; Chrome MV3 extension (plain JS modules); React 18 / TS.

**Spec:** `docs/superpowers/specs/2026-11-15-self-bids-extension-design.md`.

**Worktrees:** server `scratchpad/run-backend-list` (`feat/self-bids-extension` from dev b7836d4); website `scratchpad/run-app-list` (`feat/self-bids-extension` from main); extension: a new worktree `scratchpad/run-bidtrack` (`feat/self-bids-extension` from 87bcc81) — the main `bid-track` checkout has someone's uncommitted server-URL change and is left alone.

## Global Constraints

- Owner extension token: `typ="ext-owner"`, `sub` = owner id, `pid` = profile id; refused by app routes; app tokens refused by `/ext/owner/*`; 14-day expiry, renewed on use like bidder tokens; refused once the owner is deactivated, an admin, or the profile is archived / not theirs.
- Self bid: `Bid.kind="self"`, `bidderId=None`, `ownerId`, `accountId`, `status="approved"`; never in pay, review queue, board, performance rows, insights, alerts.
- Storage keys for self bids: `self-<ownerId>/<YYYY-MM-DD>/<profile>/<job>/...` (same builder as bidders, folder = `self-<ownerId>`).
- Phase 1 (`SELF_BIDS_TRACKED_FROM` empty): nothing written to Daily Plans; tracked counts shown only.
- Phase 2: per (owner, profile) from its first tracked report day ≥ the setting: day value = tracked + "other applies" typed; written into `done.bidsSelfByProfile` and region totals.
- LinkedIn / Indeed stay excluded in the extension.

## Review Focus

- A bidder token on `/ext/owner/*` and an owner token on `/ext/*` bidder routes and on app routes → 401 (Task 1).
- Pending-review lists and bulk review never touch self bids (Task 2).
- A self bid with the same job captured twice → one bid (Task 2).
- Phase 2: an owner with two profiles, only one tracked → the other stays typed (Task 4).
- A profile archived after sign-in → uploads refused (Task 1/2).

---

### Task 1: Server — owner sign-in for the extension
Files: `app/security.py` (`create_ext_owner_token(owner_id, profile_id)`), `app/deps.py` (`get_current_ext_owner` → `ExtOwnerAuth(user, account, claims)`; `get_current_user` refuses `typ="ext-owner"`), `app/routers/bidder_ext.py` (`POST /ext/owner/profiles`, `POST /ext/owner/login`, `GET /ext/owner/me`), tests `tests_unit/test_ext_owner_auth.py`.
- [ ] Tests: profiles lists only the owner's active profiles (bad password 401, admin 403); login with a foreign / archived profile 403; token works on `/ext/owner/me` (name + profile), is refused by `get_current_user` and by `get_current_bidder`; a bidder token is refused by `/ext/owner/me`; archived profile after login → 401.
- [ ] Implement; run; commit.

### Task 2: Server — self bids recorded
Files: `app/models/bid.py` (`kind`, optional `bidderId`, `accountId`, partial unique indexes), `app/bids/records.py` (`record_self_screenshot`, `confirm_self_upload`), `app/routers/bidder_ext.py` (`POST /ext/owner/upload-url`, `POST /ext/owner/uploads/confirm`), `app/routers/bids.py` (owner-keyed lists and bulk review exclude `kind="self"`; bid detail / screenshots open a self bid for its owner and admins), tests `tests_unit/test_ext_owner_uploads.py`.
- [ ] Tests: upload-url creates one approved self bid (key prefix `self-<owner>/`, accountId from token), a second screenshot of the same job joins it; confirm marks uploaded; self bids absent from `/bids` review lists, bulk review, `/bids/week`, `/bids/performance` rows; bid detail opens for the owner.
- [ ] Implement; full suite; commit.

### Task 3: Extension — owner mode
Files (worktree `run-bidtrack`): `lib/api.js` (owner profiles / login / me, owner upload + confirm, auth kind stored with the token), `popup/popup.html|js|css` ("I'm the owner" sign-in → profile choice → "Name · Profile" + Sign out), `background.js` (upload calls by auth kind), `manifest.json` 3.5.0, README.
- [ ] Implement; `node --check` every file; manual checklist in the README section.
- [ ] Commit.

### Task 4: Server — counts (pilot and switch)
Files: `app/config.py` (`SELF_BIDS_TRACKED_FROM`), `app/self_bids.py` (`tracked_self_bids(owner_ids, account_ids, start, end)`, `switched_profiles(owner_id)`, `write_through(owner_id, account_id, day)`), `app/routers/daily_plans.py` (day response `trackedSelfByProfile`, `trackedProfiles`; save keeps "other" for tracked profiles), hook in `confirm_self_upload` (phase 2 only) + a recompute function, tests `tests_unit/test_self_bid_counts.py`.
- [ ] Tests: phase 1 → day shows tracked next to typed, plans unchanged; phase 2 → tracked profile's day value = tracked + other, written into `bidsSelfByProfile` and region totals, plan created if missing; untracked profile unchanged; days before the profile's first tracked day unchanged.
- [ ] Implement; full suite; commit.

### Task 5: Website + Bidders Self row
Files: server `app/bids/performance.py` / `app/routers/bids.py` (`self` rows for one owner's list: bids, interviews tagged self, no pay / review, not in totals); website Daily Plan page (typed · tracked display; tracked profiles show tracked read-only + "Other applies" input), `BiddersTable` Self row below Total; tests (server + node helpers).
- [ ] Implement; tests; build; commit.
