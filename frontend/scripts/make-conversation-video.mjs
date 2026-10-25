// Renders a two-person conversation video: per-line WAVs (two TTS voices) + animated speaker UI + captions.
// Usage: node scripts/make-conversation-video.mjs <dir with lines.json + wavs> <out.webm>
import { chromium } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";

const dir = path.resolve(process.argv[2]);
const outPath = path.resolve(process.argv[3]);
const raw = fs.readFileSync(path.join(dir, "lines.json"), "utf8").replace(/^﻿/, "");
const lines = JSON.parse(raw).map((l) => ({ speaker: l.speaker, text: l.text, b64: fs.readFileSync(l.file).toString("base64") }));

const browser = await chromium.launch({ args: ["--autoplay-policy=no-user-gesture-required"] });
const page = await browser.newPage();
const b64 = await page.evaluate(async (lines) => {
  const ac = new AudioContext();
  const bufs = [];
  for (const l of lines) bufs.push(await ac.decodeAudioData(Uint8Array.from(atob(l.b64), (c) => c.charCodeAt(0)).buffer));
  const analyser = ac.createAnalyser();
  analyser.fftSize = 64;
  const dest = ac.createMediaStreamDestination();
  analyser.connect(dest);

  // schedule lines back-to-back with a short natural pause
  const GAP = 0.45, LEAD = 0.6;
  let at = LEAD;
  const sched = lines.map((l, i) => { const s = { ...l, start: at, end: at + bufs[i].duration }; at += bufs[i].duration + GAP; return s; });
  const total = at + 0.4;

  const W = 640, H = 360;
  const cv = document.createElement("canvas");
  cv.width = W; cv.height = H;
  const ctx = cv.getContext("2d");
  const stream = cv.captureStream(30);
  dest.stream.getAudioTracks().forEach((t) => stream.addTrack(t));
  const rec = new MediaRecorder(stream, { mimeType: "video/webm;codecs=vp8,opus", videoBitsPerSecond: 1_200_000 });
  const chunks = [];
  rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);
  const stopped = new Promise((r) => (rec.onstop = r));
  const freq = new Uint8Array(analyser.frequencyBinCount);

  const people = {
    Priya: { x: 175, color: "#ff8fa3", dark: "#7a2342", initials: "PC", role: "Host" },
    Daniel: { x: 465, color: "#6ec1ff", dark: "#17426b", initials: "DC", role: "Guest" },
  };
  const wrap = (text, max) => {
    const words = text.split(" "); const out = []; let cur = "";
    for (const w of words) { if (ctx.measureText(cur + " " + w).width > max && cur) { out.push(cur); cur = w; } else cur = cur ? cur + " " + w : w; }
    if (cur) out.push(cur); return out;
  };

  rec.start(1000);
  const t0 = ac.currentTime + 0.1;
  const t0ms = performance.now();
  bufs.forEach((b, i) => {
    const s = ac.createBufferSource(); s.buffer = b; s.connect(analyser); s.start(t0 + sched[i].start);
  });
  await new Promise((resolve) => {
    const draw = () => {
      const t = (performance.now() - t0ms) / 1000 - 0.1;
      analyser.getByteFrequencyData(freq);
      const level = Math.min(1, (freq.reduce((a, b) => a + b, 0) / freq.length / 255) * 2.2);
      const cur = sched.find((s) => t >= s.start && t <= s.end + 0.05);
      const g = ctx.createLinearGradient(0, 0, W, H);
      g.addColorStop(0, "#1d1650"); g.addColorStop(1, "#4a2a6d");
      ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
      ctx.textAlign = "center"; ctx.fillStyle = "#fff";
      ctx.font = "bold 22px Georgia, serif"; ctx.fillText("Faith Space Conversations", W / 2, 38);
      ctx.font = "13px sans-serif"; ctx.fillStyle = "rgba(255,255,255,.7)"; ctx.fillText("What does gratitude look like?  ·  video podcast", W / 2, 58);

      for (const [name, p] of Object.entries(people)) {
        const speaking = cur?.speaker === name;
        const r = 52;
        if (speaking) {
          ctx.beginPath(); ctx.fillStyle = p.color + "44"; ctx.arc(p.x, 150, r + 10 + level * 26, 0, Math.PI * 2); ctx.fill();
          ctx.lineWidth = 3; ctx.strokeStyle = p.color; ctx.beginPath(); ctx.arc(p.x, 150, r + 5, 0, Math.PI * 2); ctx.stroke();
        }
        ctx.beginPath(); ctx.fillStyle = speaking ? p.color : p.color + "88"; ctx.arc(p.x, 150, r, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = p.dark; ctx.font = "bold 34px sans-serif"; ctx.fillText(p.initials, p.x, 162);
        // simple mouth that opens while speaking
        if (speaking) { ctx.fillStyle = p.dark; ctx.beginPath(); ctx.ellipse(p.x, 184, 12, 3 + level * 9, 0, 0, Math.PI * 2); ctx.fill(); }
        ctx.fillStyle = "#fff"; ctx.font = "bold 16px sans-serif"; ctx.fillText(name, p.x, 232);
        ctx.fillStyle = "rgba(255,255,255,.6)"; ctx.font = "12px sans-serif"; ctx.fillText(p.role, p.x, 248);
      }
      // caption
      ctx.fillStyle = "rgba(0,0,0,.45)"; ctx.fillRect(30, 262, W - 60, 70);
      if (cur) {
        ctx.fillStyle = "#fff"; ctx.font = "15px sans-serif";
        const rows = wrap(cur.text, W - 100).slice(0, 3);
        rows.forEach((r, i) => ctx.fillText(r, W / 2, 285 + i * 20 - (rows.length - 1) * 6));
      }
      ctx.fillStyle = "rgba(255,255,255,.25)"; ctx.fillRect(30, 346, W - 60, 3);
      ctx.fillStyle = "#ffb347"; ctx.fillRect(30, 346, (W - 60) * Math.max(0, Math.min(1, t / total)), 3);
      if (t < total) requestAnimationFrame(draw); else resolve();
    };
    draw();
  });
  rec.stop();
  await stopped;
  await ac.close();
  const out = new Uint8Array(await new Blob(chunks, { type: "video/webm" }).arrayBuffer());
  let s = ""; for (let i = 0; i < out.length; i += 0x8000) s += String.fromCharCode(...out.subarray(i, i + 0x8000));
  return btoa(s);
}, lines);
fs.writeFileSync(outPath, Buffer.from(b64, "base64"));
console.log("wrote", outPath, fs.statSync(outPath).size, "bytes");
await browser.close();
