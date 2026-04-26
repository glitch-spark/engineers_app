# Acme Admin App (Next.js 14 + Auth.js + MongoDB)

## Setup
1) Install deps
```bash
npm i
```
2) Copy env
```
cp .env.example .env.local
```
3) Fill `.env.local`:
```
MONGODB_URI=your-atlas-or-local-uri
AUTH_SECRET=openssl rand -base64 32
NEXTAUTH_URL=http://localhost:3000
```
4) Run
```bash
npm run dev
```

- First user who registers becomes **admin**.
- Slack webhook is optional (set `SLACK_WEBHOOK_URL` to enable notifications on new transactions).

## Notes
- All auth uses **AUTH_SECRET** consistently (middleware, API, auth).
- Sidebar + topbar UI, modal-based Add/Edit for Accounts & Transactions.
- Dashboard shows an empty state until transactions exist.


**Note:** Transactions are not linked to Accounts anymore. Each transaction is owned by the logged-in user (userId).

## Deploy to Vercel

`vercel.json` already pins the build command (`vite build`), output directory (`dist`), and an SPA fallback rewrite that sends every unknown path to `/index.html` so client-side routing works on a hard refresh.

### Required environment variable

Set this in the Vercel dashboard under **Project Settings → Environment Variables** (Production + Preview + Development as needed):

| Name | Example | Notes |
|---|---|---|
| `VITE_API_BASE_URL` | `https://api.engineersapp.example` | The FastAPI host this SPA talks to. Must include scheme; no trailing slash. Read at build time by Vite, so a redeploy is required after changing it. |

For local dev the same var lives in `.env.development` (already committed, defaults to `http://localhost:8000` for the local FastAPI). `.env.production` is a stub — Vercel's environment-variable setting overrides it at build time, which is why the file ships empty.

### CORS

Whatever value you set for `VITE_API_BASE_URL` must also appear in the FastAPI backend's `FRONTEND_ORIGIN` env var, otherwise the browser will block every request. Order: deploy backend → grab the SPA's eventual Vercel URL → set it as `FRONTEND_ORIGIN` on the backend → redeploy backend → deploy SPA.

> ⚠️ The rest of this README still describes the old Next.js + Auth.js + MongoDB setup and is stale post-split. Setup, env vars, and "first user becomes admin" all live on the FastAPI side now (`engineers_backend/`). A cleanup pass on this file is pending.