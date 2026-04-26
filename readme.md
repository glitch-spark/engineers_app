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