# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

A technical proof of concept (built by DevNexa for client demos) of a multi-faith media and community platform: short-video feed, podcasts, likes/comments/follows, direct messages, in-app notifications and admin moderation. The product name appears as both "Faith Space" (web, seed data, e2e) and "ConnectSphere" (API title, mobile, `DEMO_CREDENTIALS.md`). It is a PoC, never a delivered production app, and the UI and docs must not claim otherwise. Never add fake buttons, fake progress or success, or simulated media, and don't claim tests passed unless they were actually run.

Three apps share one API:
- `backend/` — FastAPI + SQLAlchemy 2 + Alembic + Pydantic v2
- `frontend/` — Next.js 15 App Router web app (TypeScript, Tailwind, TanStack Query, RHF + Zod)
- `mobile/` — Expo SDK 58 / React Native client using expo-router (`mobile/src/app`). Read `mobile/AGENTS.md` before touching Expo APIs.

The login page also offers "Continue as guest" (web and mobile). `DEMO_CREDENTIALS.md` lists the demo accounts (all use password `Demo1234!`) and the ports.

## Commands

Windows / PowerShell; the backend venv is `backend/.venv`.

```powershell
# Backend (cd backend)
.venv\Scripts\python -m pip install -r requirements.txt
.venv\Scripts\python -m alembic upgrade head          # create/upgrade schema
.venv\Scripts\python -m app.seed_demo                 # accounts + demo content (idempotent); app.seed = accounts only
.venv\Scripts\python -m uvicorn app.main:app --reload --port 8001
.venv\Scripts\python -m pytest -q                     # all backend tests
.venv\Scripts\python -m pytest -q tests/test_api.py -k "<name substring>"   # one test

# Frontend (cd frontend)
npm install --legacy-peer-deps      # --legacy-peer-deps is required (peer-dep conflict)
npm run dev                         # http://localhost:3000
npm run lint                        # this is `tsc --noEmit`, there is no ESLint
npm run build
npm run e2e                         # Playwright; first time: npx playwright install chromium
npx playwright test -g "<title substring>"                                  # one e2e test

# Mobile (cd mobile)
npx expo start        # also: npx expo lint, npx tsc --noEmit
```

- The API port is 8001 (`frontend/.env.local` sets `NEXT_PUBLIC_API_URL=http://localhost:8001`). `frontend/.env.example` and older docs still say 8000, so copy it and change the port.
- Stopping a dev server on Windows: `Get-NetTCPConnection -LocalPort <port>` then `Stop-Process`. `pkill` doesn't exist in the Bash tool here.
- In the Bash tool, don't pass quoted multi-line text through heredocs; write files with the Write/Edit tools.

## Configuration and data

- `backend/.env` is git-ignored and holds `DATABASE_URL` (Supabase Postgres, with the password URL-encoded: `@`→`%40`, `!`→`%21`). Without it the API falls back to a local SQLite file. `config.py` rewrites `postgresql://` to `postgresql+psycopg://`. **Never write the real password into READMEs or any committed file**; docs use `[YOUR-PASSWORD]`.
- Demo seed scripts (`seed.py` → `seed_demo.py` → `seed_podcast_video.py`) are idempotent and use real playable files from `backend/seed_media/`. `backend/scripts/clear_content.py --yes` is destructive. It wipes all content, including anything a user uploaded manually, so don't run it without being asked.
- Media lives on local disk (`STORAGE_DIR`, default `backend/storage/`) and is referenced by storage keys like `video/<uuid>.webm`. The Supabase database and the media files live in different places. Supabase Storage/S3, signed uploads, push notifications and WebSockets are NOT implemented. Messaging is polling, so don't describe it as real-time.

## Backend architecture

- `app/main.py` wires routers and the global error shape: every error is `{"error": {"code", "message", "details"}}`. Raise `HTTPException(detail={"code", "message"})` to get a custom code. Lists use `page`/`page_size` → `{items,total,page,page_size}`.
- `app/routers/*` are thin; shared logic is in `app/services.py` (`notify`, `audit`, `*_out` serializers, `get_asset_owned`, block helpers). `deps.py` has `current_user` and role guards.
- **Moderation state machine**: `pending → approved/rejected`, `approved ↔ hidden`. Videos and episodes both go through it. A status change, its `ModerationAction`, `AuditLog` and `Notification` must be written in **one transaction**. Preserve this in any new moderation path.
- **Media pipeline**: `POST /uploads` validates extension, declared MIME and magic bytes, caps size while streaming (413), then creates a `MediaAsset` with a storage key. `Video`/`Episode` rows then reference the asset (an asset may be used by only one of them). `GET /media/{kind}/{name}` serves files with HTTP Range. Only **approved** media is public; otherwise it's owner/admin only, via the Authorization header or `?token=` (because `<video>`/`<audio>` can't send headers), with 404 otherwise.
- A `Video` can also reference a separate `thumbnail_asset_id` (an uploaded image asset; there is no server-side thumbnail generation). Episodes accept audio **or** video assets (`EpisodeOut.is_video`). Users can block each other (`user_blocks`), and blocks filter user search and messaging.
- **Guests**: `POST /auth/guest` makes a throwaway viewer (`users.is_guest`, synthetic `guest-<id>@guest.local` email, random password). Guests can browse, like, comment and save, but `member_user` (in `deps.py`) rejects them with `guest_restricted` on messages, follow, block and user search. `POST /auth/upgrade` converts the guest in place, so activity is kept. Guest rows are never purged. `Video.view_count` is incremented by `POST /videos/{id}/view`, throttled to one count per viewer per video per 30 min (not unique-viewer analytics). `GET /videos/saved` lists bookmarks.
- Rate limiting is in-memory (single process). `BCRYPT_ROUNDS` is configurable (4 in tests).
- **Migrations**: Alembic versions in `alembic/versions/` (0001 schema, 0002 messages, 0003 thumbnails + user blocks, 0004 guest accounts + view counts + bookmarks). Write them in batch mode so they run on both SQLite and Postgres. A model change needs a migration.
- Tests (`tests/`) run on a temporary SQLite DB and storage dir and never touch `.env`'s database; they don't exercise Postgres.

## Frontend architecture

- `lib/api.ts` is the single API layer (typed `api()`, XHR-based `uploadFile()` for real progress/abort, `mediaSrc()` that appends `?token=` for unapproved media) and holds the shared types. `lib/auth.tsx` is the auth context (JWT in localStorage).
- `components/shell.tsx` (AppShell) is the **client-side login gate**: unauthenticated users are redirected to `/login` first. It's UX only; the API is the real enforcement. It also holds the sidebar/mobile nav, notification bell and Messages unread badge.
- `components/ui.tsx` holds hand-written shadcn-style primitives (not shadcn CLI output). Shared media components: `reel.tsx` (snap-scroll video feed), `audio-player.tsx` (audio *or* video episodes), `recorder.tsx` (MediaRecorder), `moderation-list.tsx` (used by every `/admin/*` page).
- Data fetching is TanStack Query; messages poll at 4–6s and unread counts at ~8s.
- Gotchas: Next 15 needs **TypeScript 5.x** (TS 7 breaks it); a page file may only export `default` and Next-permitted names; use `useEffect` for browser-capability detection to avoid hydration mismatches.
- Both `next dev` and the e2e build read `NEXT_DIST_DIR`. e2e uses `.next-e2e` so it can't corrupt the dev server's `.next` (running e2e against `.next` caused ENOENT/500 errors).

## E2E tests

`playwright.config.ts` starts its own isolated stack: API on **8100**, web on **3100**, a throwaway SQLite DB and storage in `backend/.e2e` (reset by `scripts/e2e_reset.py`), Chromium's fake camera, and `workers: 1`. Specs in `e2e/` run serially against shared state (`workflow.spec.ts` is the creator → admin → viewer flow; `deal-close.spec.ts` covers the 90-second video / thumbnails flow). Don't run them in parallel and don't point them at your dev DB.

## Known scope limits (don't claim otherwise)

No marketplace/checkout/orders, no FFmpeg/HLS/CDN/malware scanning/background workers, no refresh tokens or password reset, and no real-webcam test coverage (only the fake camera).
