# Faith Space API — Technical Proof of Concept (backend)

FastAPI · SQLAlchemy 2 · Alembic · Pydantic v2 · JWT (PyJWT) · bcrypt. Built by DevNexa as a **new technical proof of concept** — not a previously delivered production application.

## Setup (Windows PowerShell; on macOS/Linux use `source .venv/bin/activate`)

```powershell
cd backend
python -m venv .venv
.venv\Scripts\python -m pip install -r requirements.txt
copy .env.example .env          # then edit .env (see "Database" below)
.venv\Scripts\python -m alembic upgrade head      # create tables
.venv\Scripts\python -m app.seed_demo             # demo accounts + demo content
.venv\Scripts\python -m uvicorn app.main:app --reload --port 8000
```

Open http://localhost:8000/docs for the interactive OpenAPI docs. Health check: `GET /health`.

## Database (Supabase PostgreSQL)

The app reads `DATABASE_URL` from `backend/.env`.

```
DATABASE_URL=postgresql://postgres.zwyxbxlxzvfkdidbdafe:[YOUR-PASSWORD]@aws-0-ap-south-1.pooler.supabase.com:5432/postgres
```

* Replace `[YOUR-PASSWORD]` with the project's database password. **URL-encode special characters** (`@` → `%40`, `!` → `%21`).
* `.env` is git-ignored. **Never commit the password**; it is intentionally not written in this README. Rotate it in the Supabase dashboard if it was shared in chat or email.
* `postgresql://` is automatically mapped to the `psycopg` (v3) driver.
* Without a `DATABASE_URL` the API falls back to a local SQLite file, so it runs with no external service. A `docker-compose.yml` at the repo root offers a local PostgreSQL alternative.
* Verified: Alembic migration `0001` applied and demo data seeded against Supabase PostgreSQL 17.

Media files are stored on **local disk** (`STORAGE_DIR`, default `backend/storage/`), referenced by storage keys such as `video/<uuid>.webm`. Supabase *Storage* is not wired up (see roadmap).

## Demo accounts (all passwords: `Demo1234!`)

| Role | Email | Name |
|---|---|---|
| Admin | admin@faithspace.demo | Amara Admin |
| Creator | creator@faithspace.demo | Daniel Creator |
| Creator | creator2@faithspace.demo | Priya Creator |
| Viewer | viewer@faithspace.demo | Vera Viewer |
| Viewer | viewer2@faithspace.demo | Victor Viewer |

`python -m app.seed` creates only the accounts. `python -m app.seed_demo` also adds (from `seed_media/`, real playable files):
3 approved videos + **1 approved two-person video podcast** ("Faith Space Conversations — What does gratitude look like?") + **1 pending video**, 2 podcasts with 2 approved episodes + **1 pending episode**, comments/replies, likes, follows, notifications, one open report and matching moderation/audit records. It is idempotent. The pending items let you run the admin approval live.

`python -m app.seed_demo` also runs `app.seed_podcast_video` (can be run alone, idempotent). The conversation video is rendered by `frontend/scripts/make-conversation-video.mjs` from two Windows text-to-speech voices (David and Zira) with speaker highlighting and live captions; the output is `seed_media/gratitude-conversation.webm`.

Regenerate the media: `node ../frontend/scripts/make-demo-media.mjs seed_media` (WebM, via headless Chromium) and `python scripts/make_demo_audio.py seed_media` (MP3).

## API surface

| Area | Endpoints |
|---|---|
| Auth | `POST /auth/register`, `POST /auth/login`, `GET /auth/me` |
| Users | `GET /users` (admin), `GET /users/{id}`, `PATCH /users/me`, `PATCH /users/{id}/status` (admin), `POST/DELETE /users/{id}/follow` |
| Uploads/media | `POST /uploads` (multipart), `GET /uploads/limits`, `GET /media/{kind}/{name}` (HTTP Range) |
| Videos | `GET /videos` (public feed), `GET /videos/mine`, `POST/GET/PATCH/DELETE /videos[/{id}]` |
| Comments / likes | `GET/POST /videos/{id}/comments`, `DELETE /comments/{id}`, `POST/DELETE /videos/{id}/likes` |
| Podcasts | `GET/POST /podcasts`, `GET/PATCH/DELETE /podcasts/{id}`, `GET /podcasts/mine` |
| Episodes | `GET/POST /episodes`, `GET/PATCH/DELETE /episodes/{id}`, `GET /episodes/mine` |
| Notifications | `GET /notifications`, `GET /notifications/unread-count`, `POST /notifications/{id}/read`, `POST /notifications/read-all` |
| Moderation | `GET /admin/moderation/queue`, `POST /admin/moderation/{video\|episode}/{id}/{approve\|reject\|hide\|restore}`, `GET /admin/moderation/history` |
| Reports / audit | `POST /reports`, `GET /admin/reports`, `POST /admin/reports/{id}/resolve`, `GET /admin/audit-logs`, `GET /admin/comments`, `GET /admin/overview` |

Conventions: pagination via `page` / `page_size` → `{items,total,page,page_size}`; errors always `{"error":{"code","message","details"}}`; list endpoints support `q` search and filters.

## Security notes

* bcrypt password hashes; JWT bearer auth; role checks on every protected route; ownership checks on edit/delete.
* Uploads: extension allow-list **and** declared MIME check **and** magic-byte sniffing, streaming size caps (413), storage keys instead of paths, path-traversal guard, `nosniff` on media.
* Media access: only **approved** media is public; pending/rejected/hidden media is served only to the owner and admins (via `Authorization` header or `?token=` for `<video>`/`<audio>`), returning 404 otherwise.
* Moderation actions change status, write the moderation record, audit log and notification in **one transaction**.
* In-memory rate limiting on login/register and uploads (single process; use Redis in production).

## Tests

```powershell
.venv\Scripts\python -m pytest -q      # 35 tests, isolated temporary SQLite DB + storage
```

Covers: auth, unauthorized admin access, upload validation and limits, media retrieval + Range, approve/reject/hide/restore lifecycle with audit trail, likes, comments/replies/ownership, podcast publish/search/play, notifications, follows, reports, pagination, structured errors. Tests never touch your `.env` database.

## Known limits (proof of concept)

* No transcoding, thumbnails server-side, HLS, CDN, virus scanning or background workers (documented as roadmap in the root README).
* Signed direct-to-storage uploads are **not implemented**; uploads go through FastAPI.
* No refresh tokens / password reset / email verification.
* Browser push notifications are not implemented (in-app notifications only).
