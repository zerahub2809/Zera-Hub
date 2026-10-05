# ZERA HUB

ZERA HUB — Grow Ideas. Build Tomorrow.

This build is a real multi-page React + Express foundation. Home is the only landing page. The navigation routes to separate pages for About, Developers, Services, Projects, Community, ZERA AI, Collaborate, Jobs and Contact.

## Run it

### Fastest way on Windows
Double-click `start.bat`.

It installs dependencies if needed, creates `.env` from `.env.example`, starts the Express API and Vite frontend, and opens the site.

### Manual
```bash
npm install
npm run server
# in another terminal
npm run dev
```

Open `http://localhost:5173`.

## Environment
Copy `.env.example` to `.env` and set:
- `JWT_SECRET` to a long random secret.
- `ADMIN_PASSWORD` to a strong private admin password.
- `OPENAI_API_KEY` if you want live ZERA AI responses.
- `OPENAI_MODEL` to the model you want to use.

Do not put private AI keys in React/Vite source code. The browser calls `/api/ai/chat`; the server calls the AI provider.

## Admin
Private route: `/admindev2809`

The route is not linked in the public navigation. Admin credentials are read server-side from `.env` and should be protected with MFA/strong operational controls before production.

Admin can view users, reports and moderation actions, suspend/activate accounts, and change public brand configuration/logo URL. A protected logo upload endpoint is also included.

## Trust & Safety
The backend contains a starting rule-based risk detector for credential requests, crypto payment scams, unrealistic financial claims, link bursts and related patterns. High/critical messages and posts can be blocked automatically and logged. Production deployment should add a stronger moderation pipeline, human review, appeals, audit logs, rate limits, link scanning and continuous monitoring.

## Important production note
This is a working foundation, not a claim that every enterprise feature is production-hardened. Before public launch, add a managed database, HTTPS, secure cookies/session rotation, MFA for admins, stronger moderation, file scanning, object storage, background jobs, backups, observability and a formal security review.
