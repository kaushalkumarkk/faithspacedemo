# ConnectSphere — Login Credentials & Backend URLs

## Demo Login Credentials

All demo accounts share the same password: **`Demo1234!`**

| Role | Name | Email | Password | Use For |
|---|---|---|---|---|
| **Admin** | Amara Admin | `admin@faithspace.demo` | `Demo1234!` | Moderation queue, reports, permanent content/user removal |
| **Creator 1** | Daniel Creator | `creator@faithspace.demo` | `Demo1234!` | Uploading 90s videos + thumbnails, Studio, Phone 2 messaging |
| **Creator 2** | Priya Creator | `creator2@faithspace.demo` | `Demo1234!` | Additional creator content & messaging |
| **Viewer 1** | Vera Viewer | `viewer@faithspace.demo` | `Demo1234!` | Scrolling 20+ videos, liking/commenting, reporting, blocking, Phone 1 messaging |
| **Viewer 2** | Victor Viewer | `viewer2@faithspace.demo` | `Demo1234!` | Second viewer account |

> **Two-phone messaging demo:** Log in as **`viewer@faithspace.demo`** on Phone 1 and **`creator@faithspace.demo`** on Phone 2 (both with password `Demo1234!`).

---

## Backend API URLs & Configuration

The ConnectSphere FastAPI backend runs on port **`8001`** (`0.0.0.0:8001`).

- **Localhost (Web / iOS Simulator):** `http://localhost:8001`
- **Android Emulator:** `http://10.0.2.2:8001`
- **Physical Phones (Expo Go on same Wi-Fi):** Automatically inferred from your Expo host (`http://<YOUR_PC_LAN_IP>:8001`), or set `EXPO_PUBLIC_API_URL=http://<YOUR_PC_LAN_IP>:8001` in `mobile/.env`
- **Web App (`frontend/.env.local`):** `NEXT_PUBLIC_API_URL=http://localhost:8001`
- **API Health Check:** `http://localhost:8001/health`
- **Interactive API Docs:** `http://localhost:8001/docs`

## Starting the Apps

```powershell
# 1. Backend (if not already running)
cd backend
.venv\Scripts\python -m uvicorn app.main:app --host 0.0.0.0 --port 8001

# 2. Expo Go Mobile App (SDK 58)
cd mobile
npx expo start

# 3. Web App (optional)
cd frontend
npm run dev
```
