import { expect, test, type Browser, type Page } from "@playwright/test";
import path from "node:path";

test.describe.configure({ mode: "serial" });

const TITLE = `E2E reflection ${Date.now()}`;
const COMMENT = "Thank you for sharing this — e2e comment";
const EPISODE = `E2E episode ${Date.now()}`;

async function loginAs(browser: Browser, who: "admin" | "creator" | "viewer"): Promise<Page> {
  const ctx = await browser.newContext({ permissions: ["camera", "microphone"] });
  const page = await ctx.newPage();
  await page.goto("/login");
  await page.getByTestId(`demo-${who}`).click();
  await expect(page.getByTestId("role-badge")).toHaveText(who);
  return page;
}

let creator: Page, admin: Page, viewer: Page;

test.beforeAll(async ({ browser }) => {
  creator = await loginAs(browser, "creator");
  admin = await loginAs(browser, "admin");
  viewer = await loginAs(browser, "viewer");
});
test.afterAll(async () => { await Promise.all([creator, admin, viewer].map((p) => p?.context().close())); });

test("viewer cannot open admin pages; unsupported upload is rejected client-side", async () => {
  await viewer.goto("/admin");
  await expect(viewer.getByTestId("forbidden")).toBeVisible();

  await creator.goto("/upload");
  await creator.getByTestId("video-file-input").setInputFiles(path.join(__dirname, "fixtures/not-media.txt"));
  await expect(creator.getByTestId("file-error")).toContainText("Unsupported file");
});

test("A. creator records a real video and submits it for moderation", async () => {
  await creator.goto("/upload");
  await creator.getByRole("tab", { name: "Record" }).click();
  await creator.getByRole("button", { name: "Open camera" }).click();
  await creator.getByTestId("rec-start").click();
  await creator.waitForTimeout(3500);
  await creator.getByTestId("rec-stop").click();
  await expect(creator.getByTestId("recording-preview")).toBeVisible();
  await creator.getByTestId("rec-use").click();
  await expect(creator.getByTestId("selected-preview")).toBeVisible();

  await creator.getByLabel("Title").fill(TITLE);
  await creator.getByLabel("Description").fill("Recorded by the Playwright fake camera.");
  await creator.getByLabel("Category").selectOption("Reflection");
  await creator.getByTestId("submit-video").click();
  await expect(creator.getByTestId("upload-done")).toBeVisible();

  await creator.goto("/studio");
  await expect(creator.getByTestId("studio-video").filter({ hasText: TITLE })).toContainText("pending");
});

test("pending video is NOT in the public feed", async () => {
  await viewer.goto("/");
  await expect(viewer.getByText("No published videos yet")).toBeVisible();
});

test("B. admin sees it in the pending queue and approves it", async () => {
  await admin.goto("/admin");
  const item = admin.getByTestId("mod-item").filter({ hasText: TITLE });
  await expect(item).toBeVisible();
  await item.getByRole("button", { name: /Preview/ }).click();
  await expect(item.getByTestId("mod-preview")).toBeVisible();
  await item.getByTestId("approve").click();
  await expect(item).toHaveCount(0);

  await admin.goto("/admin/history");
  await expect(admin.getByTestId("history-row").filter({ hasText: TITLE })).toContainText("approve");
});

test("C. viewer plays the published video, likes, comments, and it persists after refresh", async () => {
  await viewer.goto("/");
  const reel = viewer.getByTestId("reel").first();
  await expect(reel.getByTestId("reel-title")).toHaveText(TITLE);

  // really playing: currentTime advances
  const video = reel.locator("video");
  await expect.poll(() => video.evaluate((v: HTMLVideoElement) => v.currentTime), { timeout: 15_000 }).toBeGreaterThan(0.3);

  await reel.getByTestId("like-btn").click();
  await expect(reel.getByTestId("like-count")).toHaveText("1");

  await reel.getByTestId("comments-btn").click();
  await viewer.getByLabel("Write a comment").fill(COMMENT);
  await viewer.getByRole("button", { name: "Post comment" }).click();
  await expect(viewer.getByTestId("comment").filter({ hasText: COMMENT })).toBeVisible();

  await viewer.reload();
  const reel2 = viewer.getByTestId("reel").first();
  await expect(reel2.getByTestId("like-btn")).toHaveAttribute("aria-pressed", "true");
  await expect(reel2.getByTestId("like-count")).toHaveText("1");
  await expect(reel2.getByTestId("comment-count")).toHaveText("1");
  await reel2.getByTestId("comments-btn").click();
  await expect(viewer.getByTestId("comment").filter({ hasText: COMMENT })).toBeVisible();
});

test("E. creator gets persisted notifications (approval + comment) and can mark them read", async () => {
  await creator.goto("/notifications");
  const rows = creator.getByTestId("notification");
  await expect(rows.filter({ hasText: "was approved" })).toHaveCount(1);
  await expect(rows.filter({ hasText: "commented on" })).toHaveCount(1);
  await expect(creator.getByTestId("unread-count")).toHaveText("2");

  await rows.filter({ hasText: "commented on" }).getByTestId("mark-read").click();
  await expect(creator.getByTestId("unread-count")).toHaveText("1");
  await creator.getByTestId("mark-all").click();
  await expect(creator.getByTestId("unread-count")).toHaveCount(0);
});

test("admin hides the video: it disappears from the public feed and is audited", async () => {
  await admin.goto("/admin/videos");
  const item = admin.getByTestId("mod-item").filter({ hasText: TITLE });
  await item.getByTestId("hide").click();
  await expect(item.getByText("hidden", { exact: true })).toBeVisible();

  await viewer.goto("/");
  await expect(viewer.getByText("No published videos yet")).toBeVisible();

  await admin.goto("/admin/history");
  await expect(admin.getByTestId("history-row").filter({ hasText: TITLE }).first()).toContainText("hide");
  await creator.goto("/notifications");
  await expect(creator.getByTestId("notification").filter({ hasText: "unpublished" })).toHaveCount(1);
});

test("admin rejects a second video with a reason; creator sees the reason", async () => {
  await creator.goto("/upload");
  await creator.getByRole("tab", { name: "Record" }).click();
  await creator.getByRole("button", { name: "Open camera" }).click();
  await creator.getByTestId("rec-start").click();
  await creator.waitForTimeout(2000);
  await creator.getByTestId("rec-stop").click();
  await creator.getByTestId("rec-use").click();
  await creator.getByLabel("Title").fill("Reject me");
  await creator.getByLabel("Category").selectOption("Music");
  await creator.getByTestId("submit-video").click();
  await expect(creator.getByTestId("upload-done")).toBeVisible();

  await admin.goto("/admin");
  const item = admin.getByTestId("mod-item").filter({ hasText: "Reject me" });
  await item.getByTestId("reject").click();
  await admin.getByLabel("Rejection reason").fill("Not suitable for the demo");
  await admin.getByTestId("confirm-reject").click();
  await expect(item).toHaveCount(0);

  await creator.goto("/studio");
  await expect(creator.getByTestId("studio-video").filter({ hasText: "Reject me" })).toContainText("Not suitable for the demo");
  await viewer.goto("/");
  await expect(viewer.getByText("No published videos yet")).toBeVisible();
});

test("D. podcast: creator uploads MP3, admin approves, viewer finds, plays and seeks", async () => {
  await creator.goto("/upload");
  await creator.getByTestId("tab-podcast").click();
  await creator.getByLabel("Podcast show").selectOption("new");
  await creator.getByLabel("Podcast title").fill("E2E Show");
  await creator.getByLabel("Category").first().selectOption("Wellness");
  await creator.getByTestId("audio-file-input").setInputFiles(path.join(__dirname, "fixtures/tone.mp3"));
  await creator.getByLabel("Episode title").fill(EPISODE);
  await creator.getByTestId("submit-episode").click();
  await expect(creator.getByTestId("upload-done")).toBeVisible();

  await viewer.goto("/podcasts");
  await viewer.getByTestId("podcast-search").fill(EPISODE);
  await expect(viewer.getByText(`No episodes match`)).toBeVisible(); // pending → not public

  await admin.goto("/admin/podcasts");
  const item = admin.getByTestId("mod-item").filter({ hasText: EPISODE });
  await item.getByTestId("approve").click();
  await expect(item.getByText("approved", { exact: true })).toBeVisible();

  await viewer.goto("/podcasts");
  await viewer.getByTestId("podcast-search").fill(EPISODE);
  await viewer.getByTestId("episode-row").filter({ hasText: EPISODE }).click();
  await expect(viewer.getByTestId("episode-title")).toHaveText(EPISODE);

  const audio = viewer.locator("audio");
  await viewer.getByTestId("play-toggle").click();
  await expect.poll(() => audio.evaluate((a: HTMLAudioElement) => a.currentTime), { timeout: 15_000 }).toBeGreaterThan(0.5);
  await viewer.getByTestId("seek").fill("4");
  await expect.poll(() => audio.evaluate((a: HTMLAudioElement) => a.currentTime)).toBeGreaterThan(3.5);
  await viewer.getByTestId("speed").selectOption("1.5");
  expect(await audio.evaluate((a: HTMLAudioElement) => a.playbackRate)).toBe(1.5);

  // resume within session
  await viewer.getByTestId("play-toggle").click(); // pause
  await viewer.reload();
  await expect.poll(() => viewer.locator("audio").evaluate((a: HTMLAudioElement) => a.currentTime)).toBeGreaterThan(3);
});

test("F. direct messages: viewer writes to creator, unread badge, reply, read receipt", async () => {
  const HELLO = `Hello from e2e ${Date.now()}`;
  const REPLY = `Reply from creator ${Date.now()}`;

  await viewer.goto("/messages");
  await viewer.getByTestId("msg-search").fill("Daniel");
  await viewer.getByTestId("msg-search-result").first().click();
  await expect(viewer.getByTestId("thread-name")).toHaveText("Daniel Creator");
  await viewer.getByTestId("msg-input").fill(HELLO);
  await viewer.getByTestId("msg-send").click();
  await expect(viewer.getByTestId("message").filter({ hasText: HELLO })).toBeVisible();

  await creator.goto("/messages");
  await expect(creator.getByTestId("msg-badge")).toHaveText("1");
  await expect(creator.getByTestId("conv-unread")).toHaveText("1");
  await creator.getByTestId("conversation").first().click();
  await expect(creator.getByTestId("message").filter({ hasText: HELLO })).toBeVisible();
  await expect(creator.getByTestId("msg-badge")).toHaveCount(0); // opening the thread marks it read
  await creator.getByTestId("msg-input").fill(REPLY);
  await creator.getByTestId("msg-input").press("Enter");

  await expect(viewer.getByTestId("message").filter({ hasText: REPLY })).toBeVisible({ timeout: 15_000 }); // polling
  await viewer.reload();
  await viewer.getByTestId("conversation").first().click();
  await expect(viewer.getByTestId("message").filter({ hasText: HELLO })).toBeVisible(); // persisted
});
