# Faith Space — Proof of Concept Coverage

Built by DevNexa as a **new technical proof of concept**. It is not a previously delivered production application. This file lists what the PoC proves, what it does not, and how each item can be checked.

## 1. What the PoC proves

The core media and community loop works end to end on a real stack (Next.js, FastAPI, PostgreSQL on Supabase), with no mocked buttons, fake progress or simulated playback.

**Creator records or uploads → Admin moderates → Viewer watches and engages → Everyone is notified.**

## 2. Covered features

| Area | What works | Where to see it |
|---|---|---|
| Accounts and roles | JWT login, bcrypt hashes, Admin / Creator / Viewer roles, login-first flow, API-level permission checks | `/login` |
| Recording | In-browser camera recording (MediaRecorder), permission handling, preview, retake, upload | `/upload` → Record |
| Upload | MP4/WebM video, MP3/M4A audio, audio or video podcast episodes, drag-and-drop, real progress bar, cancel, type and size validation | `/upload` |
| Playback | Vertical video feed (play/pause, mute, seek, fullscreen, next/prev); podcast player (seek, ±15 s, speed, volume, resume) | `/`, `/episodes/[id]` |
| Social engagement | Likes, comments, replies, delete own comment, follow/unfollow, creator profiles, reporting content | feed, `/profile/[id]` |
| Messaging | One-to-one direct messages, user search, unread badges, read receipts | `/messages` |
| Podcasts | Shows with cover images, audio and video episodes, search, edit/delete | `/podcasts` |
| Admin moderation | Pending queue, preview, approve, reject with reason, hide, restore, users, comments, reports, history, audit log | `/admin/*` |
| Notifications | In-app bell, unread count, mark read, history (approval, rejection, comment, hide events) | `/notifications` |
| Architecture | Interactive diagram separating implemented from proposed parts | `/architecture` |
| Data | PostgreSQL (Supabase) via SQLAlchemy and Alembic migrations (`0001`, `0002`), seeded demo data | `backend/` |

## 3. Security and integrity covered

- Passwords are hashed with bcrypt, and JWT is used for sessions.
- Role checks on every protected route, and ownership checks on edit and delete.
- Uploads are checked three ways: extension allow-list, declared MIME type and magic-byte sniffing. Size caps are enforced while streaming, and storage uses keys rather than file paths.
- Only **approved** media is public. Pending, rejected and hidden media is served only to its owner and admins.
- A moderation action writes the status change, moderation record, audit log and notification in **one transaction**.
- In-memory rate limiting on login, register, upload and messages.

## 4. Verification

| Check | Command | Last recorded result |
|---|---|---|
| Backend API tests (pytest, 38) | `cd backend; .venv\Scripts\python -m pytest -q` | 38 passed |
| End-to-end tests (Playwright, 10) | `cd frontend; npm run e2e` | 10 passed |
| Frontend type-check and build | `cd frontend; npm run build` | passed |

The e2e suite covers record → upload → pending → approve → real playback → like and comment → refresh persistence → notifications → hide → reject with reason → podcast upload, approval, search and play → direct messages.

The backend tests run on temporary SQLite. They do not run against Postgres. The e2e suite uses an isolated database and never touches the Supabase data.

## 5. Demo accounts

All passwords are `Demo1234!`.

| Role | Email |
|---|---|
| Admin | admin@faithspace.demo |
| Creator | creator@faithspace.demo, creator2@faithspace.demo |
| Viewer | viewer@faithspace.demo, viewer2@faithspace.demo |

Seeded content: approved videos, one two-person video podcast, a pending video and a pending podcast episode (to approve live), podcast shows with covers, comments, likes, follows, sample messages and one open report. The demo media are synthetic clips and synthesized voices, not real content.

## 6. Not covered (honest limits)

| Item | Status |
|---|---|
| **Marketplace (listings, checkout, orders)** | Not built and not in the original spec |
| Cloud media storage (Supabase Storage / S3, signed direct uploads) | Not built; media is on local disk |
| Server-side processing (FFmpeg, thumbnails, HLS, CDN, malware scanning, background workers) | Not built |
| Real-time messaging (WebSockets), group chats, attachments | Not built; messages refresh by polling every few seconds |
| Browser push notifications | Not built; in-app only |
| Refresh tokens, password reset, email verification | Not built |
| Redis-backed rate limiting | Not built; the limiter is in-memory, single process |

Testing gaps:
- Real-webcam recording is tested only with Chromium's fake camera.
- Upload cancel and avatar upload have no automated test.
- The admin users, comments and reports pages have no e2e test.
- WebM files from MediaRecorder carry no duration header, so seeking in long recordings can be imprecise until transcoding exists.

## 7. Path to production

1. Move media to S3 or Supabase Storage with presigned direct uploads.
2. Add background workers for FFmpeg normalisation, thumbnails, HLS and malware scanning, plus a CDN.
3. Move messaging to WebSockets or SSE, and add web push.
4. Add Redis rate limiting, refresh tokens, email verification and password reset, and observability.
5. If required, scope and build the marketplace (listings first, then payments and orders).

See [README.md](README.md), [backend/README.md](backend/README.md) and [frontend/README.md](frontend/README.md) for setup and run instructions.
