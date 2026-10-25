// Renders podcast cover art PNGs (600x600) with headless Chromium canvas.
// Usage: node scripts/make-covers.mjs ../backend/seed_media
import { chromium } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";

const out = path.resolve(process.argv[2] ?? "../backend/seed_media");
fs.mkdirSync(out, { recursive: true });
const covers = [
  { file: "cover-stillness.png", title: "Stillness\nSessions", sub: "Short guided pauses", a: "#1f6f78", b: "#a8e6cf", glyph: "wave" },
  { file: "cover-open-door.png", title: "Open Door\nDialogues", sub: "Conversations across traditions", a: "#4b2a8a", b: "#ff9a6b", glyph: "door" },
];

const browser = await chromium.launch();
const page = await browser.newPage();
for (const c of covers) {
  const dataUrl = await page.evaluate((c) => {
    const S = 600, cv = document.createElement("canvas");
    cv.width = cv.height = S;
    const ctx = cv.getContext("2d");
    const g = ctx.createLinearGradient(0, 0, S, S);
    g.addColorStop(0, c.a); g.addColorStop(1, c.b);
    ctx.fillStyle = g; ctx.fillRect(0, 0, S, S);
    ctx.fillStyle = "rgba(255,255,255,0.10)";
    for (let i = 0; i < 5; i++) { ctx.beginPath(); ctx.arc(S * (0.15 + i * 0.2), S * (0.2 + (i % 2) * 0.5), 90 + i * 22, 0, Math.PI * 2); ctx.fill(); }
    ctx.strokeStyle = "rgba(255,255,255,0.85)"; ctx.lineWidth = 7; ctx.lineCap = "round";
    if (c.glyph === "wave") {
      for (let i = 0; i < 15; i++) { const h = 20 + Math.abs(Math.sin(i * 0.7)) * 110; ctx.beginPath(); ctx.moveTo(110 + i * 27, 190 - h / 2); ctx.lineTo(110 + i * 27, 190 + h / 2); ctx.stroke(); }
    } else {
      ctx.beginPath(); ctx.roundRect(230, 90, 140, 200, [70, 70, 0, 0]); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(300, 90); ctx.lineTo(300, 290); ctx.stroke();
      ctx.fillStyle = "rgba(255,255,255,0.85)"; ctx.beginPath(); ctx.arc(345, 195, 7, 0, Math.PI * 2); ctx.fill();
    }
    ctx.fillStyle = "#fff"; ctx.textAlign = "center";
    ctx.font = "bold 62px Georgia, serif";
    c.title.split("\n").forEach((line, i) => ctx.fillText(line, S / 2, 400 + i * 66));
    ctx.font = "22px sans-serif"; ctx.globalAlpha = 0.85; ctx.fillText(c.sub, S / 2, 555);
    return cv.toDataURL("image/png");
  }, c);
  fs.writeFileSync(path.join(out, c.file), Buffer.from(dataUrl.split(",")[1], "base64"));
  console.log("wrote", c.file);
}
await browser.close();
