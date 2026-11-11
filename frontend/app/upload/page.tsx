"use client";
import { zodResolver } from "@hookform/resolvers/zod";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Camera, CheckCircle2, FileVideo, Headphones, Mic, Video as VideoIcon, X } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import { FileDrop, ProgressBar } from "@/components/file-drop";
import { Gate } from "@/components/gate";
import { Recorder } from "@/components/recorder";
import { Button, Card, Field, Input, PageHeader, Select, Textarea } from "@/components/ui";
import { api, CATEGORIES, ApiError, uploadFile, type Podcast } from "@/lib/api";
import { cn, formatBytes, formatTime } from "@/lib/utils";

const VIDEO_TYPES = ["video/mp4", "video/webm"];
const AUDIO_TYPES = ["audio/mpeg", "audio/mp3", "audio/mp4", "audio/x-m4a", "audio/m4a"];
const IMAGE_TYPES = ["image/png", "image/jpeg", "image/webp"];
const MAX_VIDEO = 250, MAX_AUDIO = 60, MAX_IMAGE = 5; // MB — mirrors backend defaults; the server is authoritative.

function validate(file: File, kind: "video" | "audio" | "episode"): string | null {
  const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
  const okExt = kind === "video" ? ["mp4", "webm"] : kind === "audio" ? ["mp3", "m4a"] : ["mp3", "m4a", "mp4", "webm"];
  const okType = kind === "video" ? VIDEO_TYPES : kind === "audio" ? AUDIO_TYPES : [...AUDIO_TYPES, ...VIDEO_TYPES];
  if (!okExt.includes(ext) || (file.type && !okType.includes(file.type))) return `Unsupported file. Allowed: ${okExt.map((e) => "." + e).join(", ")}.`;
  if (file.size > (kind === "audio" ? MAX_AUDIO : MAX_VIDEO) * 1048576) return `File is too large (${formatBytes(file.size)}). Limit is ${kind === "audio" ? MAX_AUDIO : MAX_VIDEO} MB.`;
  if (file.size === 0) return "That file is empty.";
  return null;
}

/* ---------------- video ---------------- */
const videoSchema = z.object({
  title: z.string().min(2, "Title needs at least 2 characters").max(150),
  description: z.string().max(2000).optional(),
  category: z.string().min(1, "Choose a category"),
});
type VideoForm = z.infer<typeof videoSchema>;

function VideoUpload() {
  const qc = useQueryClient();
  const [file, setFile] = useState<File | null>(null);
  const [mode, setMode] = useState<"file" | "record">("file");
  const [fileError, setFileError] = useState<string | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [thumbUrl, setThumbUrl] = useState<string | null>(null);
  const [thumbBlob, setThumbBlob] = useState<Blob | null>(null);
  const [thumbName, setThumbName] = useState<string>("thumbnail.jpg");
  const [thumbError, setThumbError] = useState<string | null>(null);
  const [customThumb, setCustomThumb] = useState(false);
  const [durationSec, setDurationSec] = useState<number | null>(null);
  const [pct, setPct] = useState(0);
  const [phase, setPhase] = useState<"idle" | "saving" | "done">("idle");
  // The video uploads in the background the moment it is chosen, so the form can be filled in while the bytes move.
  const [bg, setBg] = useState<"idle" | "uploading" | "ready" | "error">("idle");
  const [err, setErr] = useState<string | null>(null);
  const [assetId, setAssetId] = useState<number | null>(null);
  const [thumbAssetId, setThumbAssetId] = useState<number | null>(null);
  const videoUp = useRef<{ cancel: () => void; promise: Promise<number> } | null>(null);
  const thumbUp = useRef<{ cancel: () => void; promise: Promise<number> } | null>(null);

  const startVideoUpload = (f: File) => {
    videoUp.current?.cancel();
    setPct(0); setBg("uploading"); setAssetId(null); setErr(null);
    const up = uploadFile("video", f, f.name, setPct);
    const rec = { cancel: up.cancel, promise: up.promise.then((a) => a.id) };
    videoUp.current = rec;
    rec.promise.then((id) => { if (videoUp.current === rec) { setAssetId(id); setBg("ready"); } }).catch((e: ApiError) => {
      if (videoUp.current !== rec) return;
      videoUp.current = null;
      if (e.code === "aborted") return setBg("idle");
      setBg("error"); setErr(e.message); toast.error(e.message);
    });
  };

  const startThumbUpload = (blob: Blob, name: string) => {
    thumbUp.current?.cancel();
    const up = uploadFile("image", blob, name, () => {});
    const rec = { cancel: up.cancel, promise: up.promise.then((a) => a.id) };
    thumbUp.current = rec;
    rec.promise.then((id) => { if (thumbUp.current === rec) setThumbAssetId(id); }).catch(() => { if (thumbUp.current === rec) thumbUp.current = null; });
  };

  // Upload each new thumbnail right away as well (it is small), and stop everything if the page is left.
  useEffect(() => {
    if (!thumbBlob) { thumbUp.current?.cancel(); thumbUp.current = null; return; }
    startThumbUpload(thumbBlob, thumbName);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [thumbBlob, thumbName]);
  useEffect(() => () => { videoUp.current?.cancel(); thumbUp.current?.cancel(); }, []);

  const removeFile = () => {
    videoUp.current?.cancel(); videoUp.current = null;
    setFile(null); setAssetId(null); setThumbAssetId(null); setBg("idle"); setPct(0);
  };
  const previewVideoRef = useRef<HTMLVideoElement>(null);
  const { register, handleSubmit, reset, formState: { errors } } = useForm<VideoForm>({ resolver: zodResolver(videoSchema), defaultValues: { category: "" } });

  useEffect(() => {
    if (!file) { setPreview(null); setThumbUrl(null); setThumbBlob(null); return; }
    const url = URL.createObjectURL(file);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  useEffect(() => {
    return () => {
      if (thumbUrl && thumbUrl.startsWith("blob:")) URL.revokeObjectURL(thumbUrl);
    };
  }, [thumbUrl]);

  const captureFrame = (v: HTMLVideoElement, force = false) => {
    if (customThumb && !force) return;
    if (!v.videoWidth || !v.videoHeight) return;
    try {
      const c = document.createElement("canvas");
      c.width = v.videoWidth; c.height = v.videoHeight;
      c.getContext("2d")?.drawImage(v, 0, 0);
      c.toBlob((blob) => {
        if (!blob) return;
        setThumbBlob(blob);
        setThumbName("thumbnail.jpg");
        setThumbAssetId(null);
        setCustomThumb(false);
        setThumbUrl(URL.createObjectURL(blob));
      }, "image/jpeg", 0.8);
    } catch { /* tainted/unsupported: no auto-thumbnail */ }
  };

  const readDuration = (v: HTMLVideoElement) => {
    const d = isFinite(v.duration) && v.duration > 0
      ? Math.round(v.duration)
      : (v.seekable.length ? Math.round(v.seekable.end(v.seekable.length - 1)) : null);
    if (d && d > 0) setDurationSec((prev) => prev ?? d);
  };

  const pick = (f: File, recordedDuration?: number) => {
    const e = validate(f, "video");
    setFileError(e);
    setErr(null); setAssetId(null); setThumbAssetId(null); setPhase("idle"); setPct(0);
    setCustomThumb(false); setThumbError(null); setThumbBlob(null); setThumbUrl(null);
    setDurationSec(recordedDuration && recordedDuration > 0 ? recordedDuration : null);
    setFile(e ? null : f);
    if (e) { videoUp.current?.cancel(); videoUp.current = null; setBg("idle"); } else startVideoUpload(f);
  };

  const pickThumbnail = (f: File | null) => {
    if (!f) return;
    if (!IMAGE_TYPES.includes(f.type) || f.size > MAX_IMAGE * 1048576) {
      setThumbError(`Thumbnail must be a PNG, JPG or WebP up to ${MAX_IMAGE} MB.`);
      return;
    }
    setThumbError(null);
    setCustomThumb(true);
    setThumbBlob(f);
    setThumbName(f.name);
    setThumbAssetId(null);
    setThumbUrl(URL.createObjectURL(f));
  };

  const submit = async (v: VideoForm) => {
    if (!file) return setFileError("Choose or record a video first.");
    setErr(null);
    setPhase("saving");
    try {
      if (!videoUp.current) startVideoUpload(file); // first attempt failed or was cancelled: try again
      const id = await videoUp.current!.promise;
      let tid: number | null = null;
      if (thumbBlob) {
        if (!thumbUp.current) startThumbUpload(thumbBlob, thumbName);
        tid = await thumbUp.current!.promise;
      }
      await api("/videos", {
        method: "POST",
        json: {
          asset_id: id,
          thumbnail_asset_id: tid,
          duration_seconds: durationSec,
          title: v.title,
          description: v.description ?? "",
          category: v.category,
        },
      });
      setPhase("done");
      qc.invalidateQueries({ queryKey: ["my-videos"] });
      toast.success("Uploaded — your video is pending moderation");
    } catch (e) {
      setPhase("idle");
      const msg = (e as ApiError).code === "aborted" ? "Upload cancelled." : (e as Error).message;
      setErr(msg);
      if ((e as ApiError).code !== "aborted") toast.error(msg);
    }
  };

  if (phase === "done")
    return (
      <Card className="mx-auto max-w-lg space-y-3 p-8 text-center" data-testid="upload-done">
        <CheckCircle2 className="mx-auto h-10 w-10 text-success" />
        <h2 className="font-display text-2xl">Submitted for moderation</h2>
        <p className="text-sm text-muted">Your video and thumbnail are stored and <b>pending</b>. It will appear in the public feed only after an admin approves it.</p>
        <div className="flex justify-center gap-2">
          <Link href="/studio"><Button>View in my studio</Button></Link>
          <Button variant="outline" onClick={() => { removeFile(); setThumbBlob(null); setThumbUrl(null); setDurationSec(null); setPhase("idle"); reset(); }}>Upload another</Button>
        </div>
      </Card>
    );

  const busy = phase === "saving";
  return (
    <form onSubmit={handleSubmit(submit)} className="grid gap-6 lg:grid-cols-2" noValidate>
      <div className="space-y-3">
        <div className="inline-flex rounded-xl bg-elevated p-1" role="tablist" aria-label="Video source">
          {([["file", "Upload file", FileVideo], ["record", "Record", VideoIcon]] as const).map(([m, label, Icon]) => (
            <button key={m} type="button" role="tab" aria-selected={mode === m} onClick={() => setMode(m)} disabled={busy}
              className={cn("flex items-center gap-2 rounded-lg px-4 py-1.5 text-sm font-medium", mode === m && "bg-surface shadow-sm")}><Icon className="h-4 w-4" />{label}</button>
          ))}
        </div>
        {mode === "record" && !file && <Recorder onRecorded={(f, secs) => { pick(f, secs); setMode("file"); }} />}
        {(mode === "file" || file) && !file && (
          <FileDrop accept=".mp4,.webm,video/mp4,video/webm" label="Drag & drop a video here" hint={`MP4 or WebM · up to 90s / ${MAX_VIDEO} MB`} onFile={(f) => pick(f)} testId="video-file-input" />
        )}
        {fileError && <p role="alert" className="text-sm text-danger" data-testid="file-error">{fileError}</p>}
        {file && preview && (
          <div className="space-y-3">
            <div className="mx-auto aspect-[9/16] max-h-[420px] overflow-hidden rounded-2xl bg-black">
              <video
                ref={previewVideoRef}
                src={preview}
                controls
                playsInline
                className="h-full w-full object-contain"
                onLoadedMetadata={(e) => readDuration(e.currentTarget)}
                onLoadedData={(e) => { readDuration(e.currentTarget); captureFrame(e.currentTarget); }}
                data-testid="selected-preview"
              />
            </div>
            <div className="flex items-center gap-3 rounded-xl bg-elevated p-2.5 text-sm">
              {thumbUrl && (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img src={thumbUrl} alt="Thumbnail preview" data-testid="thumb-preview" className="h-14 w-10 shrink-0 rounded object-cover" />
              )}
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium">{file.name}</p>
                <p className="text-xs text-muted">
                  {formatBytes(file.size)} · {file.type || "video"}
                  {durationSec !== null && <span data-testid="selected-duration"> · {formatTime(durationSec)}</span>}
                </p>
              </div>
              {!busy && <Button type="button" variant="ghost" size="icon" aria-label="Remove file" onClick={removeFile}><X className="h-4 w-4" /></Button>}
            </div>

            <div className="rounded-xl border border-line bg-surface p-3 text-sm space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-medium">Thumbnail</span>
                <div className="flex flex-wrap gap-2">
                  <Button type="button" size="sm" variant="outline" disabled={busy} onClick={() => previewVideoRef.current && captureFrame(previewVideoRef.current, true)} data-testid="capture-frame-btn">
                    <Camera className="h-3.5 w-3.5" />Capture current frame
                  </Button>
                </div>
              </div>
              <input type="file" aria-label="Custom thumbnail" accept="image/png,image/jpeg,image/webp" disabled={busy} className="block w-full text-xs text-muted" data-testid="thumb-file-input"
                onChange={(e) => pickThumbnail(e.target.files?.[0] ?? null)} />
              {thumbError && <p role="alert" className="text-xs text-danger">{thumbError}</p>}
              <p className="text-xs text-muted">Auto-captured from the video, or upload a custom PNG/JPG/WebP thumbnail.</p>
            </div>
          </div>
        )}
      </div>

      <Card className="space-y-4 self-start p-5">
        <Field label="Title" error={errors.title?.message}><Input maxLength={150} {...register("title")} disabled={busy} /></Field>
        <Field label="Description" error={errors.description?.message}><Textarea maxLength={2000} {...register("description")} disabled={busy} /></Field>
        <Field label="Category" error={errors.category?.message}>
          <Select {...register("category")} disabled={busy}><option value="">Select…</option>{CATEGORIES.map((c) => <option key={c}>{c}</option>)}</Select>
        </Field>
        {bg === "uploading" && <ProgressBar pct={pct} label={busy ? "Finishing upload" : "Uploading in the background — fill in the details meanwhile"} />}
        {bg === "ready" && file && <p className="flex items-center gap-1.5 text-sm text-success" data-testid="video-ready"><CheckCircle2 className="h-4 w-4" />Video uploaded ({formatBytes(file.size)}). Add details and submit.</p>}
        {phase === "saving" && bg !== "uploading" && <p className="text-sm text-muted">Saving…</p>}
        {err && <p role="alert" className="rounded-lg bg-danger/10 p-2 text-sm text-danger" data-testid="upload-error">{err}</p>}
        <div className="flex gap-2">
          <Button type="submit" className="flex-1" loading={busy} disabled={!file} data-testid="submit-video">{bg === "uploading" ? "Submit when upload finishes" : "Submit for moderation"}</Button>
          {bg === "uploading" && <Button type="button" variant="outline" onClick={removeFile} data-testid="cancel-upload">Cancel</Button>}
        </div>
        <p className="text-xs text-muted">Videos are reviewed by a moderator before they are published.</p>
      </Card>
    </form>
  );
}

/* ---------------- podcast ---------------- */
const epSchema = z.object({
  podcast_id: z.string().min(1, "Choose a show"),
  show_title: z.string().optional(),
  show_description: z.string().optional(),
  show_category: z.string().optional(),
  title: z.string().min(2, "Episode title needs at least 2 characters").max(150),
  description: z.string().max(3000).optional(),
}).superRefine((v, ctx) => {
  if (v.podcast_id === "new") {
    if (!v.show_title || v.show_title.length < 2) ctx.addIssue({ code: "custom", path: ["show_title"], message: "Podcast title needs at least 2 characters" });
    if (!v.show_category) ctx.addIssue({ code: "custom", path: ["show_category"], message: "Choose a category" });
  }
});
type EpForm = z.infer<typeof epSchema>;

function PodcastUpload() {
  const qc = useQueryClient();
  const shows = useQuery({ queryKey: ["my-podcasts"], queryFn: () => api<Podcast[]>("/podcasts/mine") });
  const [audio, setAudio] = useState<File | null>(null);
  const [cover, setCover] = useState<File | null>(null);
  const [coverUrl, setCoverUrl] = useState<string | null>(null);
  const [coverError, setCoverError] = useState<string | null>(null);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [pct, setPct] = useState(0);
  const [phase, setPhase] = useState<"idle" | "cover" | "uploading" | "saving" | "done">("idle");
  const [err, setErr] = useState<string | null>(null);
  const cancelRef = useRef<(() => void) | null>(null);
  const { register, handleSubmit, watch, reset, formState: { errors } } = useForm<EpForm>({ resolver: zodResolver(epSchema), defaultValues: { podcast_id: "" } });
  const isNew = watch("podcast_id") === "new";

  useEffect(() => { if (!cover) { setCoverUrl(null); return; } const u = URL.createObjectURL(cover); setCoverUrl(u); return () => URL.revokeObjectURL(u); }, [cover]);
  useEffect(() => { if (!audio) { setAudioUrl(null); return; } const u = URL.createObjectURL(audio); setAudioUrl(u); return () => URL.revokeObjectURL(u); }, [audio]);

  const submit = async (v: EpForm) => {
    if (!audio) return setFileError("Choose an audio file first.");
    setErr(null);
    try {
      let podcastId = Number(v.podcast_id);
      if (v.podcast_id === "new") {
        let coverId: number | null = null;
        if (cover) { setPhase("cover"); coverId = (await uploadFile("image", cover, cover.name, () => {}).promise).id; }
        const p = await api<Podcast>("/podcasts", { method: "POST", json: { title: v.show_title, description: v.show_description ?? "", category: v.show_category, cover_asset_id: coverId } });
        podcastId = p.id;
      }
      setPhase("uploading"); setPct(0);
      const isVid = /\.(mp4|webm)$/i.test(audio.name);
      const up = uploadFile(isVid ? "video" : "audio", audio, audio.name, setPct);
      cancelRef.current = up.cancel;
      const asset = await up.promise;
      setPhase("saving");
      await api("/episodes", { method: "POST", json: { podcast_id: podcastId, asset_id: asset.id, title: v.title, description: v.description ?? "" } });
      setPhase("done");
      qc.invalidateQueries({ queryKey: ["my-podcasts"] }); qc.invalidateQueries({ queryKey: ["my-episodes"] });
      toast.success("Episode uploaded — pending moderation");
    } catch (e) {
      setPhase("idle");
      const msg = (e as ApiError).code === "aborted" ? "Upload cancelled." : (e as Error).message;
      setErr(msg);
      if ((e as ApiError).code !== "aborted") toast.error(msg);
    }
  };

  if (phase === "done")
    return (
      <Card className="mx-auto max-w-lg space-y-3 p-8 text-center" data-testid="upload-done">
        <CheckCircle2 className="mx-auto h-10 w-10 text-success" />
        <h2 className="font-display text-2xl">Episode submitted</h2>
        <p className="text-sm text-muted">Stored and <b>pending</b> moderator approval before listeners can find it.</p>
        <div className="flex justify-center gap-2"><Link href="/studio"><Button>View in my studio</Button></Link><Button variant="outline" onClick={() => { setAudio(null); setCover(null); setPhase("idle"); reset(); }}>Upload another</Button></div>
      </Card>
    );

  const busy = phase !== "idle";
  return (
    <form onSubmit={handleSubmit(submit)} className="grid gap-6 lg:grid-cols-2" noValidate>
      <div className="space-y-3">
        {!audio ? (
          <FileDrop accept=".mp3,.m4a,.mp4,.webm,audio/mpeg,audio/mp4,video/mp4,video/webm" label="Drag & drop an episode (audio or video)" hint={`Audio: MP3 / M4A up to ${MAX_AUDIO} MB · Video: MP4 / WebM up to ${MAX_VIDEO} MB`} testId="audio-file-input"
            onFile={(f) => { const e = validate(f, "episode"); setFileError(e); setAudio(e ? null : f); }} />
        ) : (
          <div className="space-y-2 rounded-2xl border border-line p-4">
            <div className="flex items-center gap-2"><Mic className="h-5 w-5 text-brand" /><div className="min-w-0 flex-1"><p className="truncate font-medium">{audio.name}</p><p className="text-xs text-muted">{formatBytes(audio.size)}</p></div>
              {!busy && <Button type="button" variant="ghost" size="icon" aria-label="Remove file" onClick={() => setAudio(null)}><X className="h-4 w-4" /></Button>}</div>
            {audioUrl && (/\.(mp4|webm)$/i.test(audio.name) ? <video src={audioUrl} controls playsInline className="aspect-video w-full rounded-lg bg-black" /> : <audio src={audioUrl} controls className="w-full" />)}
          </div>
        )}
        {fileError && <p role="alert" className="text-sm text-danger">{fileError}</p>}
      </div>
      <Card className="space-y-4 self-start p-5">
        <Field label="Podcast show" error={errors.podcast_id?.message}>
          <Select {...register("podcast_id")} disabled={busy}>
            <option value="">Select…</option>
            {shows.data?.map((s) => <option key={s.id} value={s.id}>{s.title}</option>)}
            <option value="new">＋ Create a new podcast…</option>
          </Select>
        </Field>
        {isNew && (
          <div className="space-y-3 rounded-xl bg-elevated p-3">
            <Field label="Podcast title" error={errors.show_title?.message}><Input {...register("show_title")} disabled={busy} /></Field>
            <Field label="Podcast description"><Textarea {...register("show_description")} disabled={busy} /></Field>
            <Field label="Category" error={errors.show_category?.message}><Select {...register("show_category")} disabled={busy}><option value="">Select…</option>{CATEGORIES.map((c) => <option key={c}>{c}</option>)}</Select></Field>
            <Field label="Cover image (optional)" hint="PNG, JPG or WebP up to 5 MB">
              <div className="flex items-center gap-3">
                {coverUrl && /* eslint-disable-next-line @next/next/no-img-element */ <img src={coverUrl} alt="Cover preview" className="h-16 w-16 rounded-lg object-cover" data-testid="cover-preview" />}
                <input type="file" accept="image/png,image/jpeg,image/webp" disabled={busy} className="text-sm" data-testid="cover-input"
                  onChange={(e) => {
                    const f = e.target.files?.[0] ?? null;
                    if (f && (!["image/png", "image/jpeg", "image/webp"].includes(f.type) || f.size > 5 * 1048576)) { setCoverError("Cover must be a PNG, JPG or WebP up to 5 MB."); setCover(null); } else { setCoverError(null); setCover(f); }
                  }} />
              </div>
              {coverError && <p role="alert" className="mt-1 text-xs text-danger">{coverError}</p>}
            </Field>
          </div>
        )}
        <Field label="Episode title" error={errors.title?.message}><Input {...register("title")} disabled={busy} /></Field>
        <Field label="Episode description"><Textarea {...register("description")} disabled={busy} /></Field>
        {phase === "uploading" && <ProgressBar pct={pct} label="Uploading audio" />}
        {err && <p role="alert" className="rounded-lg bg-danger/10 p-2 text-sm text-danger">{err}</p>}
        <div className="flex gap-2">
          <Button type="submit" className="flex-1" loading={busy} disabled={!audio} data-testid="submit-episode">Upload & submit for moderation</Button>
          {phase === "uploading" && <Button type="button" variant="outline" onClick={() => cancelRef.current?.()}>Cancel</Button>}
        </div>
      </Card>
    </form>
  );
}

export default function UploadPage() {
  const [tab, setTab] = useState<"video" | "podcast">("video");
  return (
    <Gate roles={["creator", "admin"]}>
      <PageHeader title="Create" subtitle="Everything you upload is stored for real and goes through moderation before publishing." />
      <div className="mb-6 inline-flex rounded-xl bg-elevated p-1" role="tablist">
        <button role="tab" aria-selected={tab === "video"} onClick={() => setTab("video")} className={cn("flex items-center gap-2 rounded-lg px-4 py-1.5 text-sm font-medium", tab === "video" && "bg-surface shadow-sm")}><VideoIcon className="h-4 w-4" />Video</button>
        <button role="tab" aria-selected={tab === "podcast"} onClick={() => setTab("podcast")} className={cn("flex items-center gap-2 rounded-lg px-4 py-1.5 text-sm font-medium", tab === "podcast" && "bg-surface shadow-sm")} data-testid="tab-podcast"><Headphones className="h-4 w-4" />Podcast episode</button>
      </div>
      {tab === "video" ? <VideoUpload /> : <PodcastUpload />}
    </Gate>
  );
}
