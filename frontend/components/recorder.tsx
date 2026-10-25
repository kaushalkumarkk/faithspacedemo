"use client";
import { Camera, CircleStop, RefreshCw, Video as VideoIcon } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { formatTime } from "@/lib/utils";
import { Button } from "./ui";

const MAX_SECONDS = 60;
const MIME_CANDIDATES = ["video/mp4;codecs=avc1,mp4a.40.2", "video/webm;codecs=vp9,opus", "video/webm;codecs=vp8,opus", "video/webm", "video/mp4"];

function describeError(e: unknown): string {
  const name = (e as DOMException)?.name;
  if (name === "NotAllowedError" || name === "SecurityError") return "Camera or microphone permission was denied. Allow access in your browser’s site settings, then try again.";
  if (name === "NotFoundError" || name === "OverconstrainedError") return "No camera or microphone was found on this device.";
  if (name === "NotReadableError") return "Your camera is in use by another application.";
  return "Could not start the camera: " + ((e as Error)?.message ?? "unknown error");
}

/** Browser camera recorder built on getUserMedia + MediaRecorder. Hands back a File for the normal upload flow. */
export function Recorder({ onRecorded }: { onRecorded: (file: File) => void }) {
  const [state, setState] = useState<"idle" | "starting" | "live" | "recording" | "review">("idle");
  const [error, setError] = useState<string | null>(null);
  const [secs, setSecs] = useState(0);
  const [reviewUrl, setReviewUrl] = useState<string | null>(null);
  const live = useRef<HTMLVideoElement>(null);
  const stream = useRef<MediaStream | null>(null);
  const rec = useRef<MediaRecorder | null>(null);
  const chunks = useRef<Blob[]>([]);
  const timer = useRef<ReturnType<typeof setInterval>>(undefined);
  const [supported, setSupported] = useState(true); // checked after mount to avoid an SSR/client mismatch
  useEffect(() => setSupported(!!navigator.mediaDevices?.getUserMedia && typeof MediaRecorder !== "undefined"), []);

  const stopStream = useCallback(() => { stream.current?.getTracks().forEach((t) => t.stop()); stream.current = null; }, []);
  useEffect(() => () => { stopStream(); clearInterval(timer.current); }, [stopStream]);
  useEffect(() => () => { if (reviewUrl) URL.revokeObjectURL(reviewUrl); }, [reviewUrl]);

  const openCamera = async () => {
    setError(null);
    setState("starting");
    try {
      const s = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "user", width: { ideal: 720 }, height: { ideal: 1280 } }, audio: true });
      stream.current = s;
      setState("live");
      requestAnimationFrame(() => { if (live.current) { live.current.srcObject = s; live.current.play().catch(() => {}); } });
    } catch (e) {
      setError(describeError(e));
      setState("idle");
    }
  };

  const start = () => {
    if (!stream.current) return;
    const mime = MIME_CANDIDATES.find((m) => MediaRecorder.isTypeSupported(m));
    try {
      const r = new MediaRecorder(stream.current, mime ? { mimeType: mime } : undefined);
      chunks.current = [];
      r.ondataavailable = (e) => e.data.size && chunks.current.push(e.data);
      r.onstop = () => {
        clearInterval(timer.current);
        const type = (r.mimeType || mime || "video/webm").split(";")[0];
        const blob = new Blob(chunks.current, { type });
        const ext = type === "video/mp4" ? "mp4" : "webm";
        const file = new File([blob], `recording-${Date.now()}.${ext}`, { type });
        stopStream();
        setReviewUrl(URL.createObjectURL(blob));
        setState("review");
        (window as any).__lastRecording = { size: file.size, type };
        pending.current = file;
      };
      r.start(1000);
      rec.current = r;
      setSecs(0);
      setState("recording");
      timer.current = setInterval(() => setSecs((s) => { if (s + 1 >= MAX_SECONDS) r.state === "recording" && r.stop(); return s + 1; }), 1000);
    } catch (e) {
      setError("Recording is not supported with this browser configuration: " + (e as Error).message);
    }
  };
  const pending = useRef<File | null>(null);
  const stop = () => rec.current?.state === "recording" && rec.current.stop();
  const retake = () => { setReviewUrl(null); pending.current = null; setState("idle"); openCamera(); };

  if (!supported)
    return <p role="alert" className="rounded-xl border border-warn/40 bg-warn/10 p-4 text-sm">Recording isn’t supported in this browser. Use a recent Chrome, Edge, Firefox or Safari — or upload a file instead.</p>;

  return (
    <div className="space-y-3" data-testid="recorder">
      <div className="relative mx-auto aspect-[9/16] max-h-[460px] overflow-hidden rounded-2xl bg-black">
        {(state === "live" || state === "recording") && <video ref={live} muted playsInline className="h-full w-full -scale-x-100 object-cover" aria-label="Camera preview" />}
        {state === "review" && reviewUrl && <video src={reviewUrl} controls playsInline className="h-full w-full object-contain" aria-label="Recording preview" data-testid="recording-preview" />}
        {(state === "idle" || state === "starting") && (
          <div className="grid h-full place-items-center p-6 text-center text-white/80"><div className="space-y-2"><Camera className="mx-auto h-8 w-8" /><p className="text-sm">{state === "starting" ? "Waiting for camera permission…" : "Record a short vertical video (up to 60s)"}</p></div></div>
        )}
        {state === "recording" && <span className="absolute left-3 top-3 flex items-center gap-1.5 rounded-full bg-black/60 px-2.5 py-1 text-xs text-white"><span className="h-2 w-2 animate-pulse rounded-full bg-red-500" />REC {formatTime(secs)}</span>}
      </div>
      {error && <p role="alert" className="rounded-xl border border-danger/40 bg-danger/10 p-3 text-sm">{error}</p>}
      <div className="flex flex-wrap justify-center gap-2">
        {state === "idle" && <Button type="button" onClick={openCamera}><Camera className="h-4 w-4" />Open camera</Button>}
        {state === "live" && <Button type="button" onClick={start} data-testid="rec-start"><VideoIcon className="h-4 w-4" />Start recording</Button>}
        {state === "recording" && <Button type="button" variant="danger" onClick={stop} data-testid="rec-stop"><CircleStop className="h-4 w-4" />Stop</Button>}
        {state === "review" && (
          <>
            <Button type="button" variant="outline" onClick={retake} data-testid="rec-retake"><RefreshCw className="h-4 w-4" />Retake</Button>
            <Button type="button" onClick={() => pending.current && onRecorded(pending.current)} data-testid="rec-use">Use this recording</Button>
          </>
        )}
      </div>
    </div>
  );
}
