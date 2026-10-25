# Faith Space — Technical Proof of Concept (frontend)

Next.js 15 (App Router) · TypeScript · Tailwind CSS 3 · shadcn/ui-style components (hand-written primitives in `components/ui.tsx`) · Lucide · TanStack Query · React Hook Form + Zod · React Flow (architecture page) · Sonner toasts · next-themes (dark/light).

Built by DevNexa as a **new technical proof of concept**; every page is labelled accordingly.

## Run

Start the backend first (see [../backend/README.md](../backend/README.md)), then:

```powershell
cd frontend
npm install --legacy-peer-deps
copy .env.example .env.local      # NEXT_PUBLIC_API_URL=http://localhost:8000
npm run dev                       # http://localhost:3000
```

Production build: `npm run build && npm start`. Type-check: `npm run lint`.

> `--legacy-peer-deps` is needed for a peer-dependency conflict in the resolver tree. TypeScript is pinned to 5.x because Next 15 does not support TypeScript 7.

## Demo logins (password `Demo1234!`)

`admin@faithspace.demo` · `creator@faithspace.demo` · `creator2@faithspace.demo` · `viewer@faithspace.demo` · `viewer2@faithspace.demo`

The login page has one-click Admin / Creator / Viewer buttons. To keep Creator, Admin and Viewer signed in simultaneously use separate browser profiles / private windows (the session lives in each browser's localStorage).

## Pages

| Route | Purpose |
|---|---|
| `/` | Vertical short-video feed (snap scroll, play/pause, mute, seek, full-screen, next/prev, like, comments, report) |
| `/upload` | Creator: upload or **record** a video (MediaRecorder), or upload a podcast episode — real progress + cancel |
| `/studio` | Creator: own videos/episodes with moderation status, edit, delete |
| `/podcasts`, `/podcasts/[id]`, `/episodes/[id]` | Browse/search, show page, audio player (seek, ±15 s, speed, volume, resume within session) |
| `/messages` | Direct messages: conversation list, user search, thread, unread badges, read receipts (polls every 4–8 s; no WebSockets yet) |
| `/notifications` | Notification history, mark read / mark all |
| `/profile/[id]` | Profile, avatar, follow/unfollow |
| `/admin/*` | Overview + pending queue, Users, Videos, Podcasts, Comments, Reports, Moderation history + audit log |
| `/architecture` | React Flow diagram: implemented vs proposed components |

Layout: sidebar on desktop, bottom navigation on mobile, skeleton/empty/error states everywhere, accessible forms (labels, `aria-*`, focus rings, skip link, reduced-motion).

## End-to-end tests (Playwright)

```powershell
npx playwright install chromium     # once
npm run e2e
```

Starts an isolated backend (port 8100, throwaway SQLite DB in `backend/.e2e`) and frontend (port 3100), uses Chromium's fake camera, and runs the full creator → admin → viewer workflow: record + upload → pending → approve → real playback (`currentTime` advances) → like + comment → refresh persistence → notifications + mark read → hide (disappears from feed, audited) → reject with reason → MP3 podcast upload/approve/search/play/seek/resume. It never touches your Supabase data.

**Last run: 9/9 passed.**

## Notes

* Unapproved media is fetched with `?token=` because `<video>`/`<audio>` cannot send auth headers; the API only honours it for the owner/admin.
* The thumbnail shown on the upload form is captured client-side from the selected file (preview only; server-side thumbnails need FFmpeg — roadmap).
* Browser recording needs a secure context (`localhost` is fine) and camera permission; unsupported browsers / denied permission show a clear message.
