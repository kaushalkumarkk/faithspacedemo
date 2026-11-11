import { expect, test, type APIRequestContext, type Page } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";

test.describe.configure({ mode: "serial" });

const API = "http://localhost:8100";
const TITLE = `Guest flow clip ${Date.now()}`;
let videoId = 0;
let creatorToken = "";
let guest: Page;

async function token(request: APIRequestContext, who: string) {
  const r = await request.post(`${API}/auth/login`, { data: { email: `${who}@faithspace.demo`, password: "Demo1234!" } });
  expect(r.ok()).toBeTruthy();
  return (await r.json()).access_token as string;
}

test.beforeAll(async ({ browser, request }) => {
  creatorToken = await token(request, "creator");
  const adminToken = await token(request, "admin");
  const up = await request.post(`${API}/uploads`, {
    headers: { Authorization: `Bearer ${creatorToken}` },
    multipart: { kind: "video", file: { name: "guest.webm", mimeType: "video/webm", buffer: fs.readFileSync(path.join(__dirname, "fixtures/video-90s.webm")) } },
  });
  expect(up.ok()).toBeTruthy();
  const created = await request.post(`${API}/videos`, {
    headers: { Authorization: `Bearer ${creatorToken}` },
    data: { asset_id: (await up.json()).id, title: TITLE, category: "Community" },
  });
  expect(created.ok()).toBeTruthy();
  videoId = (await created.json()).id;
  const ok = await request.post(`${API}/admin/moderation/video/${videoId}/approve`, { headers: { Authorization: `Bearer ${adminToken}` } });
  expect(ok.ok()).toBeTruthy();
  guest = await (await browser.newContext()).newPage();
});

test.afterAll(async ({ request }) => {
  if (videoId) await request.delete(`${API}/videos/${videoId}`, { headers: { Authorization: `Bearer ${creatorToken}` } });
  await guest?.context().close();
});

test("login screen offers guest access and never shows an API address", async () => {
  await guest.goto("/login");
  await expect(guest.getByTestId("guest-login")).toBeVisible();
  await expect(guest.locator("body")).not.toContainText(/localhost|:8100|:8001|:8000/);
});

test("guest login: browse, no messaging, upgrade call-to-action", async () => {
  await guest.getByTestId("guest-login").click();
  await expect(guest.getByTestId("role-badge")).toHaveText("guest");
  await expect(guest.getByTestId("guest-upgrade")).toBeVisible();
  await expect(guest.getByRole("link", { name: "Messages" })).toHaveCount(0);
  await guest.goto("/messages");
  await expect(guest.getByTestId("guest-locked")).toBeVisible();
});

test("guest watching a video counts one view and shows it", async () => {
  await guest.goto(`/?v=${videoId}`);
  const reel = guest.getByTestId("reel").first();
  await expect(reel.getByTestId("reel-title")).toHaveText(TITLE);
  await expect.poll(() => reel.locator("video").evaluate((v: HTMLVideoElement) => v.currentTime), { timeout: 15_000 }).toBeGreaterThan(0.3);
  await guest.reload();
  await expect(guest.getByTestId("reel").first().getByTestId("reel-views")).toContainText("1 view");
});

test("guest saves a video, finds it under Saved, then removes it", async () => {
  await guest.goto(`/?v=${videoId}`);
  const reel = guest.getByTestId("reel").first();
  await reel.getByTestId("save-btn").click();
  await expect(reel.getByTestId("save-btn")).toHaveAttribute("aria-pressed", "true");

  await guest.goto("/saved");
  await expect(guest.getByTestId("saved-video").filter({ hasText: TITLE })).toBeVisible();
  await guest.getByTestId("saved-video").filter({ hasText: TITLE }).getByTestId("unsave-btn").click();
  await expect(guest.getByTestId("saved-video").filter({ hasText: TITLE })).toHaveCount(0);

  await guest.goto(`/?v=${videoId}`); // save again so the upgrade test can prove it survives
  await guest.getByTestId("reel").first().getByTestId("save-btn").click();
  await expect(guest.getByTestId("reel").first().getByTestId("save-btn")).toHaveAttribute("aria-pressed", "true");
});

test("guest cannot follow; profile asks for an account", async () => {
  const me = await guest.request.get(`${API}/videos/${videoId}`);
  const ownerId = (await me.json()).owner.id;
  await guest.goto(`/profile/${ownerId}`);
  await expect(guest.getByTestId("guest-cta")).toBeVisible();
  await expect(guest.getByTestId("follow-btn")).toHaveCount(0);
});

test("guest upgrades to a real account and keeps the saved video", async () => {
  await guest.getByTestId("guest-upgrade").click();
  await expect(guest).toHaveURL(/\/register/);
  await guest.getByLabel("Display name").fill("Upgraded Guest");
  await guest.getByLabel("Email").fill(`upgraded-${Date.now()}@example.com`);
  await guest.getByLabel("Password").fill("Password123!");
  await guest.getByRole("button", { name: "Create account" }).click();
  await expect(guest.getByTestId("role-badge")).toHaveText("viewer");
  await expect(guest.getByRole("link", { name: "Messages" }).first()).toBeVisible();

  await guest.goto("/saved");
  await expect(guest.getByTestId("saved-video").filter({ hasText: TITLE })).toBeVisible();
});
