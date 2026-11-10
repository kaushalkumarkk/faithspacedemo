import { chromium } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";

const mobileAssets = path.resolve("../mobile/assets/images");
fs.mkdirSync(mobileAssets, { recursive: true });

const browser = await chromium.launch();
const page = await browser.newPage();

async function renderIcon({ size, bg, monochrome = false, padding = 0.16 }) {
  const dataUrl = await page.evaluate(({ size, bg, monochrome, padding }) => {
    const cv = document.createElement("canvas");
    cv.width = cv.height = size;
    const ctx = cv.getContext("2d");

    if (bg === "gradient") {
      const g = ctx.createLinearGradient(0, 0, size, size);
      g.addColorStop(0, "#120E24");
      g.addColorStop(0.55, "#23194D");
      g.addColorStop(1, "#0E2A3A");
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, size, size);
    } else if (bg && bg !== "transparent") {
      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, size, size);
    }

    const cx = size / 2;
    const cy = size / 2;
    const r = size * (0.5 - padding);

    // Outer sphere gradient or monochrome
    const sphereGrad = ctx.createLinearGradient(cx - r, cy - r, cx + r, cy + r);
    if (monochrome) {
      sphereGrad.addColorStop(0, "#FFFFFF");
      sphereGrad.addColorStop(1, "#FFFFFF");
    } else {
      sphereGrad.addColorStop(0, "#7C5CFF");
      sphereGrad.addColorStop(0.55, "#4F7BFF");
      sphereGrad.addColorStop(1, "#22D3EE");
    }

    // Outer glow ring
    ctx.save();
    ctx.strokeStyle = sphereGrad;
    ctx.lineWidth = size * 0.06;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.arc(cx, cy, r * 0.92, 0.45, Math.PI * 2 - 0.45);
    ctx.stroke();

    // Tilted orbital connection ellipses
    ctx.lineWidth = size * 0.036;
    ctx.globalAlpha = monochrome ? 0.9 : 0.85;
    for (const angle of [-Math.PI / 5, Math.PI / 5]) {
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(angle);
      ctx.beginPath();
      ctx.ellipse(0, 0, r * 0.78, r * 0.34, 0, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }

    // Center glowing core + 3 connection nodes
    ctx.globalAlpha = 1;
    ctx.fillStyle = sphereGrad;
    ctx.beginPath();
    ctx.arc(cx, cy, r * 0.22, 0, Math.PI * 2);
    ctx.fill();

    const nodes = [
      [cx + r * 0.76, cy - r * 0.34],
      [cx - r * 0.65, cy - r * 0.46],
      [cx - r * 0.56, cy + r * 0.58],
    ];
    for (const [nx, ny] of nodes) {
      ctx.beginPath();
      ctx.fillStyle = monochrome ? "#FFFFFF" : "#22D3EE";
      ctx.arc(nx, ny, r * 0.11, 0, Math.PI * 2);
      ctx.fill();
      if (!monochrome) {
        ctx.beginPath();
        ctx.fillStyle = "#FFFFFF";
        ctx.arc(nx, ny, r * 0.05, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.restore();

    return cv.toDataURL("image/png");
  }, { size, bg, monochrome, padding });

  return Buffer.from(dataUrl.split(",")[1], "base64");
}

fs.writeFileSync(path.join(mobileAssets, "icon.png"), await renderIcon({ size: 1024, bg: "gradient", padding: 0.18 }));
fs.writeFileSync(path.join(mobileAssets, "logo.png"), await renderIcon({ size: 512, bg: "gradient", padding: 0.16 }));
fs.writeFileSync(path.join(mobileAssets, "splash-icon.png"), await renderIcon({ size: 512, bg: "transparent", padding: 0.14 }));
fs.writeFileSync(path.join(mobileAssets, "android-icon-foreground.png"), await renderIcon({ size: 512, bg: "transparent", padding: 0.24 }));
fs.writeFileSync(path.join(mobileAssets, "android-icon-monochrome.png"), await renderIcon({ size: 512, bg: "transparent", monochrome: true, padding: 0.24 }));
fs.writeFileSync(path.join(mobileAssets, "favicon.png"), await renderIcon({ size: 96, bg: "gradient", padding: 0.14 }));

// Solid deep-indigo Android adaptive icon background
const bgUrl = await page.evaluate(() => {
  const cv = document.createElement("canvas");
  cv.width = cv.height = 512;
  const ctx = cv.getContext("2d");
  const g = ctx.createLinearGradient(0, 0, 512, 512);
  g.addColorStop(0, "#120E24");
  g.addColorStop(1, "#0E2A3A");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 512, 512);
  return cv.toDataURL("image/png");
});
fs.writeFileSync(path.join(mobileAssets, "android-icon-background.png"), Buffer.from(bgUrl.split(",")[1], "base64"));

await browser.close();
console.log("Generated ConnectSphere icons & logos in", mobileAssets);
