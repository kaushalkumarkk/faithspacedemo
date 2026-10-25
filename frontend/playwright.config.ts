import { defineConfig } from "@playwright/test";
import path from "node:path";

// Isolated ports + a throwaway database/storage dir so e2e never touches your dev data.
const API = "http://localhost:8100";
const WEB = "http://localhost:3100";
const backend = path.resolve(__dirname, "../backend");
const isWin = process.platform === "win32";
const py = isWin ? ".venv\\Scripts\\python" : ".venv/bin/python";
const e2eDir = path.join(backend, ".e2e");

export default defineConfig({
  testDir: "./e2e",
  timeout: 120_000,
  expect: { timeout: 20_000 },
  workers: 1,
  fullyParallel: false,
  reporter: [["list"]],
  use: {
    baseURL: WEB,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    permissions: ["camera", "microphone"],
    launchOptions: {
      args: ["--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream", "--autoplay-policy=no-user-gesture-required"],
    },
  },
  webServer: [
    {
      command: `${py} scripts/e2e_reset.py .e2e && ${py} -m alembic upgrade head && ${py} -m app.seed && ${py} -m uvicorn app.main:app --port 8100`,
      cwd: backend,
      url: `${API}/health`,
      reuseExistingServer: false,
      timeout: 120_000,
      env: {
        DATABASE_URL: `sqlite:///${path.join(e2eDir, "e2e.db").replace(/\\/g, "/")}`,
        STORAGE_DIR: path.join(e2eDir, "storage"),
        CORS_ORIGINS: WEB,
        LOGIN_RATE_LIMIT: "1000",
        BCRYPT_ROUNDS: "4",
      },
    },
    {
      command: "npx next dev -p 3100",
      url: `${WEB}/login`,
      reuseExistingServer: false,
      timeout: 180_000,
      env: { NEXT_PUBLIC_API_URL: API, NEXT_DIST_DIR: ".next-e2e" },
    },
  ],
});
