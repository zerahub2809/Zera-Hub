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

ZERA AI has no provider requirement at startup. With no key configured, `/ai` clearly reports that live responses are unavailable and does not send chat content. To connect an OpenAI-compatible provider later, configure `AI_API_KEY` (or `OPENAI_API_KEY`) server-side, optionally set `AI_BASE_URL` (defaults to `https://api.openai.com/v1`) and `AI_MODEL` (or `OPENAI_MODEL`). Chat history is private to the authenticated account and only user-submitted prompts are sent to the provider.

## Community
The authenticated community supports text/code posts, optional image uploads (2 MB maximum; JPEG, PNG, GIF, WebP, or AVIF), technology tags, links, reactions, bookmarks, comments, replies, author editing/deletion, topic discovery, trending sorting, and public-post assistance through ZERA AI. Production post and interaction data is persisted using the existing MongoDB-backed application state.

Community API routes are under `/api/community`: public `GET /posts`, `GET /posts/:postId`, and `GET /topics`; authenticated `POST /posts`, `PATCH`/`DELETE /posts/:postId`, `POST /posts/:postId/image`, `PUT /posts/:postId/reaction`, `PUT /posts/:postId/bookmark`, `GET /bookmarks`, and post comment/reply routes. Comments and replies can be edited by their authors and deleted by their author or the post author.

ZERA AI routes are under `/api/ai`: public `GET /status`; authenticated `GET`/`POST /conversations`, `GET`/`DELETE /conversations/:id`, and `POST /conversations/:id/messages`. Authenticated `POST /api/ai/chat` accepts the existing bearer token and an optional owned `conversationId`; when supplied, it saves the user and assistant messages to that account's history.

## Developer profiles and jobs
ZERA HUB uses the existing account and bearer-token authentication flow for professional profiles, connections, job listings, and applications. Profile and marketplace records are saved through the existing application state persistence (MongoDB in production and the existing local JSON store in local development).

Public discovery and detail endpoints:
- `GET /api/platform/developers` — filter with `search`, `skill`, `technology`, `experience`, `location`, and `availability`.
- `GET /api/platform/developers/:id`
- `GET /api/platform/jobs` — filter with `search`, `skills`, `experience`, `employmentType`, `workMode`, `location`, `minSalary`, `maxSalary`, and `currency`.
- `GET /api/platform/jobs/:id`

Authenticated endpoints include `GET`/`PATCH /api/platform/profile`, `GET /api/platform/connections`, `POST`/`DELETE /api/platform/connections/:userId`, `POST /api/platform/jobs`, `GET /api/platform/jobs/mine`, `PATCH /api/platform/jobs/:id`, and `POST /api/platform/jobs/:id/applications`. Applicants can retrieve their own applications from `GET /api/platform/applications/mine`. Only the job owner can use `GET /api/platform/jobs/:id/applications` and `PATCH /api/platform/applications/:id` to review applicants and change status. Salary ranges use an optional three-letter currency code and are not tied to a particular country.

## Admin
Private route: `/admindev2809`

The route is not linked in the public navigation. Admin credentials are read server-side from `.env` and should be protected with MFA/strong operational controls before production.

Admin APIs require a server-verified administrator token. The control center exposes users, developer/hirer accounts, profile projects, jobs, applications, community posts/comments, reports, platform statistics, login activity and audit logs. User and content moderation changes require a reason and are persisted as moderation/audit records. A restricted account is temporarily blocked for 24 hours; repeated medium/high-risk community content can also trigger that temporary restriction after three signals in a rolling day. Warnings and review-required states do not disable account access. Reports can be created for profiles, posts, comments/replies and jobs through authenticated `POST /api/reports`; report submissions are rate-limited and duplicate open reports are rejected.

For production, configure the backend's `CLIENT_URL` to the frontend origin. The backend also explicitly permits `https://zera-hub0.vercel.app` and the local Vite origin so the deployed control center can send its existing admin bearer token across origins.

## Trust & Safety
The backend uses a layered rule-based risk detector for credential requests, crypto payment scams, unrealistic financial claims, suspicious/shortened links, link bursts, repetitive patterns and excessive capitalization. Medium-risk community content is held for admin review; high/critical items are blocked and logged. Repeated signals can cause a temporary—not permanent—restriction. Production deployment should still add a stronger moderation pipeline, human review, appeals, link scanning and continuous monitoring.

## Important production note
This is a working foundation, not a claim that every enterprise feature is production-hardened. Before public launch, add a managed database, HTTPS, secure cookies/session rotation, MFA for admins, stronger moderation, file scanning, object storage, background jobs, backups, observability and a formal security review.
