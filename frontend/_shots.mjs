import { chromium } from "@playwright/test";
const out = "C:/Users/rajsh/AppData/Local/Temp/perf/shots/";
const b = await chromium.launch({ args: ["--autoplay-policy=no-user-gesture-required"] });
async function run(name, viewport, email, pages) {
  const ctx = await b.newContext({ viewport });
  const p = await ctx.newPage();
  await p.goto("http://localhost:3000/login");
  if (!email) { await p.screenshot({ path: out + name + "-login.png" }); }
  else {
    await p.getByLabel("Email").fill(email); await p.getByLabel("Password").fill("Demo1234!");
    await p.getByRole("button", { name: "Log in" }).click(); await p.waitForTimeout(2500);
    for (const [slug, url] of pages) { await p.goto("http://localhost:3000" + url); await p.waitForTimeout(2500); await p.screenshot({ path: out + name + "-" + slug + ".png" }); }
  }
  await ctx.close();
}
await run("d", { width: 1366, height: 800 }, null, []);
await run("d", { width: 1366, height: 800 }, "viewer@faithspace.demo", [["feed", "/"], ["podcasts", "/podcasts"], ["messages", "/messages"], ["saved", "/saved"]]);
await run("d", { width: 1366, height: 800 }, "admin@faithspace.demo", [["admin", "/admin"]]);
await run("d", { width: 1366, height: 800 }, "creator@faithspace.demo", [["upload", "/upload"], ["studio", "/studio"]]);
await run("m", { width: 390, height: 844 }, null, []);
await run("m", { width: 390, height: 844 }, "viewer@faithspace.demo", [["feed", "/"], ["messages", "/messages"]]);
await b.close();
