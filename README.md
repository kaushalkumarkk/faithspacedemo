# Faith Space — Technical Proof of Concept

An inclusive multi-faith media & community platform: short videos, podcasts, comments/likes, in-app notifications and an admin moderation dashboard — **real integrated functionality, not mock-ups**.

> This is a **new technical proof of concept built by DevNexa**. It is not a previously delivered production application.

* Backend: [backend/README.md](backend/README.md) · Frontend: [frontend/README.md](frontend/README.md)

## Quick start

Prerequisites: Node 20+, Python 3.11+.

```powershell
# 1) Backend (terminal 1)
cd backend
python -m venv .venv
.venv\Scripts\python -m pip install -r requirements.txt
copy .env.example .env            # set DATABASE_URL (Supabase) — or delete the line to use local SQLite
.venv\Scripts\python -m alembic upgrade head
.venv\Scripts\python -m app.seed_demo
.venv\Scripts\python -m uvicorn app.main:app --reload --port 8000

# 2) Frontend (terminal 2)
cd frontend
npm install --legacy-peer-deps
copy .env.example .env.local
npm run dev                       # http://localhost:3000
```

### Database: Supabase PostgreSQL

```
DATABASE_URL=postgresql://postgres.zwyxbxlxzvfkdidbdafe:[YOUR-PASSWORD]@aws-0-ap-south-1.pooler.supabase.com:5432/postgres
```

Put it in `backend/.env` (git-ignored) with the real password, **URL-encoded** (`@`→`%40`, `!`→`%21`). The password is deliberately not stored in any README or committed file. Media files are stored on local disk (Supabase Storage is a roadmap item). No Supabase? Remove `DATABASE_URL` for SQLite, or `docker compose up -d` and use the local Postgres URL in `.env.example`.

## Demo accounts (password `Demo1234!`)

| Role | Email |
|---|---|
| Admin | admin@faithspace.demo |
| Creator | creator@faithspace.demo / creator2@faithspace.demo |
| Viewer | viewer@faithspace.demo / viewer2@faithspace.demo |

`python -m app.seed_demo` also loads sample content (real playable WebM/MP3 generated for the demo): 3 approved videos, **1 approved two-person video podcast** ("Faith Space Conversations — What does gratitude look like?", two synthesized voices with live captions), **1 pending video**, 2 podcasts with 2 approved episodes and **1 pending episode**, comments, likes, follows, notifications and one open report. The pending items are there so you can approve live.

## Live demo script

Suggested scenarios, all executable from the UI:

* **A Creator**: log in → `/upload` → record with the camera or drop an MP4/WebM → submit (real progress bar) → shows as *pending* in My studio.
* **B Admin**: `/admin` → preview in the pending queue → Approve (or Reject with a reason) → `/admin/history`.
* **C Viewer**: `/` → watch, seek, like, comment/reply → refresh: everything persists.
* **D Podcasts**: creator uploads MP3/M4A → admin approves → viewer searches `/podcasts` → plays, seeks, changes speed.
* **E Notifications**: viewer comments → creator's bell shows the unread count → `/notifications` → mark read.

Tip: use two browser profiles (or a private window) so Admin and Creator/Viewer stay logged in side by side.

## Architecture

```mermaid
flowchart LR
  subgraph Browser
    UI[Next.js App Router<br/>TanStack Query · RHF+Zod]
    MR[MediaRecorder / HTML5 video+audio]
  end
  UI -->|REST + JWT| API[FastAPI]
  MR --> UI
  API --> AUTH[Auth: JWT + bcrypt + roles]
  API --> MOD[Moderation + audit log]
  MOD --> EV[Notification events]
  API --> DB[(PostgreSQL / Supabase<br/>SQLAlchemy + Alembic)]
  EV --> DB
  API -->|storage keys| ST[(Media storage: local disk)]
  ST -->|"/media + HTTP Range"| UI
  API -. proposed .-> S3[S3 / Supabase Storage<br/>signed uploads]
  API -. proposed .-> W[Workers: FFmpeg, HLS,<br/>thumbnails, AV scan]
  S3 -. proposed .-> CDN[CDN]
  EV -. proposed .-> PUSH[Web push]
```

Solid = implemented; dashed = proposed. The same diagram (interactive) is at `/architecture`.

**Media flow:** Creator → Web app → FastAPI (`POST /uploads`: extension + MIME + magic-byte validation, size caps) → storage (key `video/<uuid>.webm`) → DB (`media_assets`, `videos` = *pending*) → admin approval → public feed → `/media/...` with HTTP Range. Hidden/rejected/pending media is not publicly retrievable.

## Tests

| Suite | Command | Result (last run) |
|---|---|---|
| Backend (pytest, 38 tests) | `cd backend; .venv\Scripts\python -m pytest -q` | 38 passed |
| E2E (Playwright, 10 tests) | `cd frontend; npm run e2e` | 10 passed |
| Frontend build + type-check | `cd frontend; npm run build` | passed |

## Feature verification checklist

| # | Requirement | Status | Evidence |
|---|---|---|---|
| 1 | JWT login/logout, 3 roles, hashed passwords, session persistence | ✅ | pytest, e2e |
| 2 | Role-based API permissions; non-admin blocked from admin APIs/pages | ✅ | pytest (parametrized), e2e |
| 3 | Browser video recording (permission handling, preview, retake, upload) | ✅ Chromium w/ fake camera | e2e; *real-webcam use not machine-tested* |
| 4 | Video file upload: MP4/WebM, drag-drop, validation, real progress, cancel | ✅ | pytest (validation), e2e (record→upload); progress/cancel implemented via XHR, manually verifiable |
| 5 | Vertical feed: play/pause, mute, seek, fullscreen, next/prev, error states | ✅ | e2e (playback advances) |
| 6 | Likes, comments, replies, delete own, counts, persist after refresh | ✅ | pytest, e2e |
| 7 | Follow/unfollow, creator profiles, avatar | ✅ | pytest (follow); avatar upload not covered by an automated test |
| 8 | Podcast upload/edit/delete, search, player (seek, speed, volume, resume) | ✅ | pytest, e2e |
| 9 | Admin: overview, users, videos, podcasts, comments, reports, history | ✅ | pytest + e2e (queue/approve/reject/hide/history); users/comments/reports pages are not e2e-tested |
| 10 | Critical acceptance flow (upload→queue→approve→feed→hide→audit, across sessions) | ✅ | pytest + e2e |
| 11 | In-app notifications: bell, unread, mark read, history, persisted | ✅ | pytest, e2e |
| 12 | Architecture page | ✅ | build; manual |
| 12b | Direct messages (1:1, unread badges, read receipts; polling not WebSockets) | ✅ | pytest, e2e |
| 13 | PostgreSQL (Supabase) with Alembic migration + seeded data | ✅ migration + seed applied to Supabase; API test-suite runs on SQLite | manual |
| 14 | Rate limiting, MIME/ext/magic-byte validation, safe media serving | ✅ (in-memory limiter) | pytest |
| 15 | Signed direct-to-storage uploads / Supabase Storage / S3 | ❌ not implemented | roadmap |
| 16 | Browser push notifications | ❌ not implemented | roadmap |
| 17 | FFmpeg, thumbnails (server), HLS, CDN, malware scan, workers | ❌ not implemented | roadmap |

## Production roadmap (not built)

1. **Storage**: S3/Supabase Storage with presigned direct uploads; keep storage keys; lifecycle/retention + deletion policy.
2. **Workers** (Celery/RQ/Cloud Tasks): retryable post-upload jobs with status on `media_assets`.
3. **FFmpeg**: normalise to H.264/AAC, extract poster thumbnails, fix WebM duration/cues, loudness-normalise audio.
4. **HLS** adaptive streaming + **CDN** (signed URLs for pending media instead of `?token=`).
5. **Real-time messaging** (WebSockets/SSE or Supabase Realtime), group chats, attachments, blocking/reporting of messages. **Malware scanning** (ClamAV) before an asset can become visible.
6. Redis-backed rate limiting, refresh tokens, email verification/password reset, web push (service worker + VAPID), observability.

## Known limitations

* MediaRecorder WebM files have no duration header; the player falls back to the seekable range, and seeking inside very long recordings may be imprecise until transcoding exists.
* Local-disk media means the Supabase database and the media files live in different places — copy `backend/storage` with the DB if you move machines.
* Demo media are synthetic animated clips and tones created for the demo, not real content.
* The UI primitives are shadcn/ui-style hand-written components rather than the shadcn CLI output.
