import { expect, test, type Browser, type Page } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";

test.describe.configure({ mode: "serial" });

const API = "http://localhost:8100";
const VIDEO_90S_TITLE = `90s Journey ${Date.now()}`;

async function loginAs(
  browser: Browser,
  who: "admin" | "creator" | "viewer",
  opts: { viewport?: { width: number; height: number }; hasTouch?: boolean } = {},
): Promise<Page> {
  const ctx = await browser.newContext({
    permissions: ["camera", "microphone"],
    ...opts,
  });
  const page = await ctx.newPage();
  await page.goto("/login");
  await page.getByTestId(`demo-${who}`).click();
  await expect(page).not.toHaveURL(/\/login/);
  return page;
}

let creator: Page, admin: Page, viewer: Page;
let phone1: Page, phone2: Page;

test.beforeAll(async ({ browser }) => {
  creator = await loginAs(browser, "creator");
  admin = await loginAs(browser, "admin");
  viewer = await loginAs(browser, "viewer");
  // Two mobile phone contexts (390x844) for two-phone messaging
  phone1 = await loginAs(browser, "viewer", { viewport: { width: 390, height: 844 }, hasTouch: true });
  phone2 = await loginAs(browser, "creator", { viewport: { width: 390, height: 844 }, hasTouch: true });
});

test.afterAll(async () => {
  await Promise.all([creator, admin, viewer, phone1, phone2].map((p) => p?.context().close()));
});

test("1. 90-second video upload with persisted thumbnail", async () => {
  await creator.goto("/upload");
  await creator.getByTestId("video-file-input").setInputFiles(path.join(__dirname, "fixtures/video-90s.webm"));

  await expect(creator.getByTestId("selected-preview")).toBeVisible();
  await expect(creator.getByTestId("selected-duration")).toContainText("1:30");
  await expect(creator.getByTestId("thumb-preview")).toBeVisible();

  await creator.getByLabel("Title").fill(VIDEO_90S_TITLE);
  await creator.getByLabel("Description").fill("Full 90-second video with auto-captured thumbnail.");
  await creator.getByLabel("Category").selectOption("Reflection");
  await creator.getByTestId("submit-video").click();
  await expect(creator.getByTestId("upload-done")).toBeVisible();

  await creator.goto("/studio");
  const studioRow = creator.getByTestId("studio-video").filter({ hasText: VIDEO_90S_TITLE });
  await expect(studioRow).toContainText("pending");
  await expect(studioRow).toContainText("1:30");
  await expect(studioRow.getByTestId("studio-thumb")).toBeVisible();

  // Admin sees thumbnail + 1:30 duration in queue and approves it
  await admin.goto("/admin");
  const modItem = admin.getByTestId("mod-item").filter({ hasText: VIDEO_90S_TITLE });
  await expect(modItem).toBeVisible();
  await expect(modItem.getByTestId("mod-thumb")).toBeVisible();
  await expect(modItem).toContainText("1:30");
  await modItem.getByTestId("approve").click();
  await expect(modItem).toHaveCount(0);

  // Viewer sees poster thumbnail & 1:30 duration in feed
  await viewer.goto("/");
  const reel = viewer.getByTestId("reel").first();
  await expect(reel.getByTestId("reel-title")).toHaveText(VIDEO_90S_TITLE);
  await expect(reel.getByTestId("reel-duration")).toHaveText("1:30");
  await expect(reel.locator("video")).toHaveAttribute("poster", /\/media\/image\//);
});

test("2. scrolling through at least 20 videos in the vertical feed", async ({ request }) => {
  const creatorToken = await creator.evaluate(() => localStorage.getItem("fs_token"));
  const adminToken = await admin.evaluate(() => localStorage.getItem("fs_token"));
  const videoBytes = fs.readFileSync(path.join(__dirname, "fixtures/video-90s.webm"));
  const thumbBytes = fs.readFileSync(path.join(__dirname, "fixtures/thumb-90s.png"));

  // Publish 20 more videos (21+ total approved)
  for (let i = 1; i <= 20; i++) {
    const upVid = await request.post(`${API}/uploads`, {
      headers: { Authorization: `Bearer ${creatorToken}` },
      multipart: { kind: "video", file: { name: `scroll-${i}.webm`, mimeType: "video/webm", buffer: videoBytes } },
    });
    expect(upVid.ok()).toBeTruthy();
    const vidAsset = await upVid.json();

    const upThumb = await request.post(`${API}/uploads`, {
      headers: { Authorization: `Bearer ${creatorToken}` },
      multipart: { kind: "image", file: { name: `thumb-${i}.png`, mimeType: "image/png", buffer: thumbBytes } },
    });
    expect(upThumb.ok()).toBeTruthy();
    const thumbAsset = await upThumb.json();

    const created = await request.post(`${API}/videos`, {
      headers: { Authorization: `Bearer ${creatorToken}` },
      data: {
        asset_id: vidAsset.id,
        thumbnail_asset_id: thumbAsset.id,
        duration_seconds: 90,
        title: `Scroll Feed Clip #${i}`,
        category: "Community",
      },
    });
    expect(created.ok()).toBeTruthy();
    const video = await created.json();

    const app = await request.post(`${API}/admin/moderation/video/${video.id}/approve`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    expect(app.ok()).toBeTruthy();
  }

  await viewer.goto("/");
  await expect(viewer.getByTestId("feed-counter")).toContainText("/ 21");

  // Scroll step-by-step through at least 20 videos (indices 0 -> 20)
  for (let step = 1; step <= 20; step++) {
    await viewer.evaluate((idx) => {
      const el = document.querySelector('[data-testid="feed"]') as HTMLElement;
      el.scrollTo({ top: idx * el.clientHeight, behavior: "instant" as ScrollBehavior });
    }, step);
    await expect(viewer.getByTestId("feed-counter")).toHaveText(`${step + 1} / 21`);
  }
  await expect(viewer.getByTestId("reel").filter({ hasText: VIDEO_90S_TITLE })).toBeVisible();
});

test("3. messaging between two phones (390x844 mobile viewports)", async () => {
  const msg1 = `Phone 1 hello ${Date.now()}`;
  const msg2 = `Phone 2 reply ${Date.now()}`;

  await phone1.goto("/messages");
  await phone1.getByTestId("msg-search").fill("Daniel");
  await phone1.getByTestId("msg-search-result").first().click();
  await expect(phone1.getByTestId("thread-name")).toHaveText("Daniel Creator");

  // Ensure composer is inside the mobile viewport
  const inputBox = await phone1.getByTestId("msg-input").boundingBox();
  expect(inputBox).not.toBeNull();
  expect(inputBox!.y + inputBox!.height).toBeLessThanOrEqual(844);

  await phone1.getByTestId("msg-input").fill(msg1);
  await phone1.getByTestId("msg-send").click();
  await expect(phone1.getByTestId("message").filter({ hasText: msg1 })).toBeVisible();

  await phone2.goto("/messages");
  await phone2.getByTestId("conversation").filter({ hasText: "Vera Viewer" }).click();
  await expect(phone2.getByTestId("message").filter({ hasText: msg1 })).toBeVisible();
  await phone2.getByTestId("msg-input").fill(msg2);
  await phone2.getByTestId("msg-send").click();
  await expect(phone2.getByTestId("message").filter({ hasText: msg2 })).toBeVisible();

  await expect(phone1.getByTestId("message").filter({ hasText: msg2 })).toBeVisible({ timeout: 15_000 });
  await expect(phone2.getByTestId("seen")).toBeVisible({ timeout: 15_000 });
});

test("4. reporting (video, comment, and message)", async () => {
  // Report a message on Phone 1
  await phone1.getByTestId("report-message-btn").first().click();
  await phone1.getByLabel("Reason").fill("Inappropriate message test");
  await phone1.getByTestId("submit-msg-report").click();
  await expect(phone1.getByText("Report sent to moderators")).toBeVisible();

  // Comment + report a video from feed
  await viewer.goto("/");
  const reel = viewer.getByTestId("reel").first();
  await reel.getByTestId("report-video-btn").click();
  await viewer.getByLabel("Reason").fill("Flagged video for review");
  await viewer.getByTestId("submit-report").click();
  await expect(viewer.getByText("Report sent to moderators")).toBeVisible();

  // Admin sees both reports
  await admin.goto("/admin/reports");
  await expect(admin.getByTestId("report").filter({ hasText: "Flagged video for review" })).toBeVisible();
  await expect(admin.getByTestId("report").filter({ hasText: "Inappropriate message test" })).toBeVisible();
});

test("5. blocking and unblocking a user across feed and two-phone chat", async () => {
  // Block Daniel Creator from Phone 1 messaging header
  await phone1.getByTestId("block-user-btn").click();
  await expect(phone1.getByTestId("msg-blocked-banner")).toBeVisible();
  await expect(phone1.getByTestId("msg-input")).toHaveCount(0);

  // Phone 2 also sees messaging blocked
  await phone2.reload();
  await expect(phone2.getByTestId("msg-blocked-banner")).toBeVisible();

  // Viewer feed hides Daniel Creator's videos
  await viewer.goto("/");
  await expect(viewer.getByText("No published videos yet")).toBeVisible();

  // Viewer unblocks from own profile's Blocked users card
  await viewer.getByLabel("My profile").click();
  await expect(viewer.getByTestId("blocked-users-card")).toBeVisible();
  await viewer.getByTestId("blocked-user-row").getByRole("button", { name: "Unblock" }).click();
  await expect(viewer.getByTestId("blocked-users-card")).toHaveCount(0);

  await viewer.goto("/");
  await expect(viewer.getByTestId("reel").first()).toBeVisible();
});

test("6. admin permanent removal of reported video, queue video, and user", async ({ request }) => {
  // Admin permanently removes the reported video from /admin/reports
  await admin.goto("/admin/reports");
  const vidReport = admin.getByTestId("report").filter({ hasText: "Flagged video for review" });
  const reportedTitle = await vidReport.locator("a").first().textContent();
  await vidReport.getByTestId("report-remove").click();
  await expect(vidReport).toHaveCount(0);

  // Verify it is gone from /admin/videos and recorded as delete in history
  await admin.goto("/admin/history");
  await expect(admin.getByTestId("history-row").filter({ hasText: reportedTitle!.trim() }).first()).toContainText("delete");

  // Register a throwaway user, then permanently remove them via /admin/users
  const tempEmail = `remove-${Date.now()}@example.com`;
  const reg = await request.post(`${API}/auth/register`, {
    data: { email: tempEmail, password: "Password123!", display_name: "Temp RemoveMe", role: "creator" },
  });
  expect(reg.ok()).toBeTruthy();

  await admin.goto("/admin/users");
  await admin.getByLabel("Search users").fill("Temp RemoveMe");
  const userRow = admin.getByTestId("admin-user-row").filter({ hasText: "Temp RemoveMe" });
  await expect(userRow).toBeVisible();
  await userRow.getByTestId("remove-user").click();
  await admin.getByTestId("confirm-remove-user").click();
  await expect(userRow).toHaveCount(0);
});
