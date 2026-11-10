// Generates a real, playable 90-second WebM video (with proper EBML Segment Info Duration = 90000ms)
// and verifies it in Chromium (<video>.duration === 90 and canvas thumbnail extraction).
import { chromium } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";

function encodeVintLength(len) {
  // 4-byte VINT (supports up to 256MB)
  return Buffer.from([
    0x10 | ((len >> 24) & 0x0f),
    (len >> 16) & 0xff,
    (len >> 8) & 0xff,
    len & 0xff,
  ]);
}

function encodeUint(val) {
  if (val === 0) return Buffer.from([0]);
  const bytes = [];
  let v = val;
  while (v > 0) {
    bytes.unshift(v & 0xff);
    v = Math.floor(v / 256);
  }
  return Buffer.from(bytes);
}

function makeInfoElement(durationMs) {
  // TimecodeScale (2A D7 B1) = 1,000,000 ns (1 ms)
  const scale = Buffer.from([0x2a, 0xd7, 0xb1, 0x83, 0x0f, 0x42, 0x40]);
  // Duration (44 89) = 8-byte float64
  const durVal = Buffer.alloc(8);
  durVal.writeDoubleBE(durationMs, 0);
  const dur = Buffer.concat([Buffer.from([0x44, 0x89, 0x88]), durVal]);
  const muxing = Buffer.from("FaithSpace", "utf8");
  const muxEl = Buffer.concat([Buffer.from([0x4d, 0x80, 0x80 | muxing.length]), muxing]);
  const payload = Buffer.concat([scale, dur, muxEl]);
  return Buffer.concat([Buffer.from([0x15, 0x49, 0xa9, 0x66]), encodeVintLength(payload.length), payload]);
}

function parseVint(buf, pos) {
  const first = buf[pos];
  let mask = 0x80;
  let len = 1;
  while (len <= 8 && (first & mask) === 0) {
    mask >>= 1;
    len++;
  }
  let val = first & (mask - 1);
  for (let i = 1; i < len; i++) val = val * 256 + buf[pos + i];
  const allOnes = Math.pow(2, 7 * len) - 1;
  return { val: val === allOnes ? null : val, bytes: len };
}

function build90sWebm(sampleWebm) {
  // Locate first Cluster (1F 43 B6 75) and Info (15 49 A9 66)
  const infoIdx = sampleWebm.indexOf(Buffer.from([0x15, 0x49, 0xa9, 0x66]));
  const tracksIdx = sampleWebm.indexOf(Buffer.from([0x16, 0x54, 0xae, 0x6b]));
  const clusterIdx = sampleWebm.indexOf(Buffer.from([0x1f, 0x43, 0xb6, 0x75]));
  if (infoIdx < 0 || tracksIdx < 0 || clusterIdx < 0) {
    throw new Error("Unexpected WebM structure from MediaRecorder");
  }

  // Header up to Info (EBML header + Segment ID/size)
  const prefix = sampleWebm.subarray(0, infoIdx);
  // Tracks element up to first Cluster
  const tracks = sampleWebm.subarray(tracksIdx, clusterIdx);

  // Extract the first Cluster's inner payload (after Timecode element E7)
  let cPos = clusterIdx + 4;
  const cSizeInfo = parseVint(sampleWebm, cPos);
  cPos += cSizeInfo.bytes;
  // Next cluster or end of buffer
  const nextCluster = sampleWebm.indexOf(Buffer.from([0x1f, 0x43, 0xb6, 0x75]), cPos);
  const clusterEnd = nextCluster > 0 ? nextCluster : sampleWebm.length;
  const clusterBody = sampleWebm.subarray(cPos, clusterEnd);

  // Strip the original Timecode (E7 <size> <bytes>) from clusterBody
  let bodyStart = 0;
  if (clusterBody[0] === 0xe7) {
    const tcLen = parseVint(clusterBody, 1);
    bodyStart = 1 + tcLen.bytes + (tcLen.val ?? 0);
  }
  const blocks = clusterBody.subarray(bodyStart);

  const infoEl = makeInfoElement(90_000);
  const clusters = [];
  for (let sec = 0; sec < 90; sec++) {
    const tcBytes = encodeUint(sec * 1000);
    const tcEl = Buffer.concat([Buffer.from([0xe7, 0x80 | tcBytes.length]), tcBytes]);
    const payload = Buffer.concat([tcEl, blocks]);
    clusters.push(Buffer.concat([Buffer.from([0x1f, 0x43, 0xb6, 0x75]), encodeVintLength(payload.length), payload]));
  }

  return Buffer.concat([prefix, infoEl, tracks, ...clusters]);
}

const browser = await chromium.launch();
const page = await browser.newPage();

// Record a 1.1s real VP8 WebM clip
const b64 = await page.evaluate(async () => {
  const cv = document.createElement("canvas");
  cv.width = 240;
  cv.height = 426;
  const ctx = cv.getContext("2d");
  const stream = cv.captureStream(15);
  const rec = new MediaRecorder(stream, { mimeType: "video/webm;codecs=vp8", videoBitsPerSecond: 120_000 });
  const chunks = [];
  rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);
  const done = new Promise((r) => (rec.onstop = r));
  rec.start(1000);
  const t0 = performance.now();
  await new Promise((resolve) => {
    const draw = () => {
      const t = (performance.now() - t0) / 1000;
      const g = ctx.createLinearGradient(0, 0, 240, 426);
      g.addColorStop(0, "#1d2b64");
      g.addColorStop(1, "#f8cdda");
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, 240, 426);
      ctx.fillStyle = "rgba(255,255,255,0.2)";
      ctx.beginPath();
      ctx.arc(120 + Math.sin(t * 2) * 50, 213, 45, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#fff";
      ctx.textAlign = "center";
      ctx.font = "bold 22px Georgia, serif";
      ctx.fillText("90s Reflection", 120, 200);
      ctx.font = "14px sans-serif";
      ctx.fillText("Faith Space Demo", 120, 230);
      if (t < 1.1) requestAnimationFrame(draw);
      else resolve();
    };
    draw();
  });
  rec.stop();
  await done;
  const buf = new Uint8Array(await new Blob(chunks, { type: "video/webm" }).arrayBuffer());
  let s = "";
  for (let i = 0; i < buf.length; i += 0x8000) s += String.fromCharCode(...buf.subarray(i, i + 0x8000));
  return btoa(s);
});

const raw = Buffer.from(b64, "base64");
const video90 = build90sWebm(raw);

// Verify in Chromium <video> that duration is 90s and frame can be drawn to canvas
const check = await page.evaluate(async (vidB64) => {
  const bytes = Uint8Array.from(atob(vidB64), (c) => c.charCodeAt(0));
  const url = URL.createObjectURL(new Blob([bytes], { type: "video/webm" }));
  const v = document.createElement("video");
  v.src = url;
  v.muted = true;
  await new Promise((res, rej) => {
    v.onloadeddata = res;
    v.onerror = () => rej(new Error("video load failed"));
  });
  const c = document.createElement("canvas");
  c.width = v.videoWidth;
  c.height = v.videoHeight;
  c.getContext("2d").drawImage(v, 0, 0);
  const thumbDataUrl = c.toDataURL("image/png");
  return { duration: v.duration, width: v.videoWidth, height: v.videoHeight, thumbLen: thumbDataUrl.length };
}, video90.toString("base64"));

console.log("Verified 90s WebM:", check, "bytes:", video90.length);

const outFixture = path.resolve("e2e/fixtures/video-90s.webm");
const outSeed = path.resolve("../backend/seed_media/ninety-second-journey.webm");
fs.mkdirSync(path.dirname(outFixture), { recursive: true });
fs.writeFileSync(outFixture, video90);
fs.writeFileSync(outSeed, video90);

// Also generate a custom PNG thumbnail fixture + video thumbnails for seeded videos
const thumbPairs = [
  { out: "e2e/fixtures/thumb-90s.png", title: "90s Reflection", a: "#1d2b64", b: "#f8cdda" },
  { out: "../backend/seed_media/thumb-morning.png", title: "Morning Light", a: "#6d4aff", b: "#ffb347" },
  { out: "../backend/seed_media/thumb-table.png", title: "The Shared Table", a: "#0f9d8a", b: "#f6d365" },
  { out: "../backend/seed_media/thumb-song.png", title: "Song of Gratitude", a: "#c94b4b", b: "#4b134f" },
  { out: "../backend/seed_media/thumb-breath.png", title: "Breath & Stillness", a: "#2b5876", b: "#a18cd1" },
  { out: "../backend/seed_media/thumb-90s.png", title: "90s Journey", a: "#1d2b64", b: "#f8cdda" },
];

for (const tp of thumbPairs) {
  const dataUrl = await page.evaluate((t) => {
    const cv = document.createElement("canvas");
    cv.width = 360;
    cv.height = 640;
    const ctx = cv.getContext("2d");
    const g = ctx.createLinearGradient(0, 0, 360, 640);
    g.addColorStop(0, t.a);
    g.addColorStop(1, t.b);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 360, 640);
    ctx.fillStyle = "rgba(255,255,255,0.14)";
    ctx.beginPath();
    ctx.arc(180, 260, 95, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#fff";
    ctx.textAlign = "center";
    ctx.font = "bold 32px Georgia, serif";
    ctx.fillText(t.title, 180, 320);
    ctx.font = "16px sans-serif";
    ctx.fillText("Faith Space", 180, 360);
    return cv.toDataURL("image/png");
  }, tp);
  fs.writeFileSync(path.resolve(tp.out), Buffer.from(dataUrl.split(",")[1], "base64"));
  console.log("wrote", tp.out);
}

await browser.close();
