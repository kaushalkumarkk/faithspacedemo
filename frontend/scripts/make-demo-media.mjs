// Generates real, playable WebM demo clips (canvas animation recorded with MediaRecorder in headless Chromium).
// Usage: node scripts/make-demo-media.mjs ../backend/seed_media
import { chromium } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";

const out = path.resolve(process.argv[2] ?? "../backend/seed_media");
fs.mkdirSync(out, { recursive: true });

const clips = [
  { file: "morning-light.webm", title: "Morning Light", sub: "A 5-second reflection", a: "#6d4aff", b: "#ffb347" },
  { file: "shared-table.webm", title: "The Shared Table", sub: "Community & hospitality", a: "#0f9d8a", b: "#f6d365" },
  { file: "breath-and-stillness.webm", title: "Breath & Stillness", sub: "A short wellness pause", a: "#2b5876", b: "#a18cd1" },
  { file: "song-of-gratitude.webm", title: "Song of Gratitude", sub: "Music across traditions", a: "#c94b4b", b: "#4b134f" },
];

const browser = await chromium.launch();
const page = await browser.newPage();
for (const c of clips) {
  const b64 = await page.evaluate(async (c) => {
    const cv = document.createElement("canvas");
    cv.width = 360; cv.height = 640;
    const ctx = cv.getContext("2d");
    const stream = cv.captureStream(30);
    const rec = new MediaRecorder(stream, { mimeType: "video/webm;codecs=vp8" });
    const chunks = [];
    rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);
    const done = new Promise((r) => (rec.onstop = r));
    rec.start(500);
    const t0 = performance.now();
    await new Promise((resolve) => {
      const draw = () => {
        const t = (performance.now() - t0) / 1000;
        const g = ctx.createLinearGradient(0, 0, 360, 640);
        g.addColorStop(0, c.a); g.addColorStop(1, c.b);
        ctx.fillStyle = g; ctx.fillRect(0, 0, 360, 640);
        for (let i = 0; i < 6; i++) { // slow drifting circles
          ctx.beginPath();
          ctx.fillStyle = `rgba(255,255,255,${0.08 + i * 0.02})`;
          ctx.arc(180 + Math.sin(t * 0.8 + i) * 120, 320 + Math.cos(t * 0.6 + i * 1.3) * 200, 40 + i * 14, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.fillStyle = "#fff"; ctx.textAlign = "center";
        ctx.font = "bold 38px Georgia, serif"; ctx.fillText(c.title, 180, 300);
        ctx.font = "20px sans-serif"; ctx.fillText(c.sub, 180, 340);
        ctx.font = "13px sans-serif"; ctx.globalAlpha = 0.7; ctx.fillText("Faith Space demo clip", 180, 600); ctx.globalAlpha = 1;
        if (t < 6) requestAnimationFrame(draw); else resolve();
      };
      draw();
    });
    rec.stop();
    await done;
    const buf = new Uint8Array(await new Blob(chunks, { type: "video/webm" }).arrayBuffer());
    let s = ""; for (let i = 0; i < buf.length; i += 0x8000) s += String.fromCharCode(...buf.subarray(i, i + 0x8000));
    return btoa(s);
  }, c);
  fs.writeFileSync(path.join(out, c.file), Buffer.from(b64, "base64"));
  console.log("wrote", c.file);
}
await browser.close();
