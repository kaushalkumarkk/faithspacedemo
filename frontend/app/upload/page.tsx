"use client";
import { zodResolver } from "@hookform/resolvers/zod";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, FileVideo, Headphones, Mic, Video as VideoIcon, X } from "lucide-react";
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
import { cn, formatBytes } from "@/lib/utils";

const VIDEO_TYPES = ["video/mp4", "video/webm"];
const AUDIO_TYPES = ["audio/mpeg", "audio/mp3", "audio/mp4", "audio/x-m4a", "audio/m4a"];
const MAX_VIDEO = 100, MAX_AUDIO = 60; // MB — mirrors backend defaults; the server is authoritative.

function validate(file: File, kind: "video" | "audio"): string | null {
  const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
  const okExt = kind === "video" ? ["mp4", "webm"] : ["mp3", "m4a"];
  const okType = kind === "video" ? VIDEO_TYPES : AUDIO_TYPES;
  if (!okExt.includes(ext) || (file.type && !okType.includes(file.type))) return `Unsupported file. Allowed: ${okExt.map((e) => "." + e).join(", ")}.`;
  if (file.size > (kind === "video" ? MAX_VIDEO : MAX_AUDIO) * 1048576) return `File is too large (${formatBytes(file.size)}). Limit is ${kind === "video" ? MAX_VIDEO : MAX_AUDIO} MB.`;
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
  const [thumb, setThumb] = useState<string | null>(null);
  const [pct, setPct] = useState(0);
  const [phase, setPhase] = useState<"idle" | "uploading" | "saving" | "done">("idle");
  const [err, setErr] = useState<string | null>(null);
  const [assetId, setAssetId] = useState<number | null>(null);
  const cancelRef = useRef<(() => void) | null>(null);
  const { register, handleSubmit, reset, formState: { errors } } = useForm<VideoForm>({ resolver: zodResolver(videoSchema), defaultValues: { category: "" } });

  useEffect(() => {
    if (!file) { setPreview(null); setThumb(null); return; }
    const url = URL.createObjectURL(file);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  // Thumbnail preview: grab a frame from the selected file (preview only; not persisted).
  const grabThumb = (v: HTMLVideoElement) => {
    try {
      const c = document.createElement("canvas");
      c.width = v.videoWidth; c.height = v.videoHeight;
      c.getContext("2d")?.drawImage(v, 0, 0);
      setThumb(c.toDataURL("image/jpeg", 0.7));
    } catch { /* tainted/unsupported: no thumbnail */ }
  };

  const pick = (f: File) => {
    const e = validate(f, "video");
    setFileError(e);
    setErr(null); setAssetId(null); setPhase("idle"); setPct(0);
    setFile(e ? null : f);
  };

  const submit = async (v: VideoForm) => {
    if (!file) return setFileError("Choose or record a video first.");
    setErr(null);
    try {
      let id = assetId;
      if (id === null) {
        setPhase("uploading"); setPct(0);
        const up = uploadFile("video", file, file.name, setPct);
        cancelRef.current = up.cancel;
        id = (await up.promise).id;
        setAssetId(id);
      }
      setPhase("saving");
      await api("/videos", { method: "POST", json: { asset_id: id, title: v.title, description: v.description ?? "", category: v.category } });
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
        <p className="text-sm text-muted">Your video is stored and <b>pending</b>. It will appear in the public feed only after an admin approves it.</p>
        <div className="flex justify-center gap-2">
          <Link href="/studio"><Button>View in my studio</Button></Link>
          <Button variant="outline" onClick={() => { setFile(null); setAssetId(null); setPhase("idle"); reset(); }}>Upload another</Button>
        </div>
      </Card>
    );

  const busy = phase === "uploading" || phase === "saving";
  return (
    <form onSubmit={handleSubmit(submit)} className="grid gap-6 lg:grid-cols-2" noValidate>
      <div className="space-y-3">
        <div className="inline-flex rounded-xl bg-elevated p-1" role="tablist" aria-label="Video source">
          {([["file", "Upload file", FileVideo], ["record", "Record", VideoIcon]] as const).map(([m, label, Icon]) => (
            <button key={m} type="button" role="tab" aria-selected={mode === m} onClick={() => setMode(m)} disabled={busy}
              className={cn("flex items-center gap-2 rounded-lg px-4 py-1.5 text-sm font-medium", mode === m && "bg-surface shadow-sm")}><Icon className="h-4 w-4" />{label}</button>
          ))}
        </div>
        {mode === "record" && !file && <Recorder onRecorded={(f) => { pick(f); setMode("file"); }} />}
        {(mode === "file" || file) && !file && (
          <FileDrop accept=".mp4,.webm,video/mp4,video/webm" label="Drag & drop a video here" hint={`MP4 or WebM · up to ${MAX_VIDEO} MB`} onFile={pick} testId="video-file-input" />
        )}
        {fileError && <p role="alert" className="text-sm text-danger" data-testid="file-error">{fileError}</p>}
        {file && preview && (
          <div className="space-y-2">
            <div className="mx-auto aspect-[9/16] max-h-[420px] overflow-hidden rounded-2xl bg-black">
              <video src={preview} controls playsInline className="h-full w-full object-contain" onLoadedData={(e) => grabThumb(e.currentTarget)} data-testid="selected-preview" />
            </div>
            <div className="flex items-center gap-3 rounded-xl bg-elevated p-2 text-sm">
              {thumb && /* eslint-disable-next-line @next/next/no-img-element */ <img src={thumb} alt="Thumbnail preview" className="h-14 w-10 rounded object-cover" />}
              <div className="min-w-0 flex-1"><p className="truncate font-medium">{file.name}</p><p className="text-xs text-muted">{formatBytes(file.size)} · {file.type || "video"}</p></div>
              {!busy && <Button type="button" variant="ghost" size="icon" aria-label="Remove file" onClick={() => { setFile(null); setAssetId(null); }}><X className="h-4 w-4" /></Button>}
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
        {phase === "uploading" && <ProgressBar pct={pct} label="Uploading" />}
        {phase === "saving" && <p className="text-sm text-muted">Saving…</p>}
        {err && <p role="alert" className="rounded-lg bg-danger/10 p-2 text-sm text-danger" data-testid="upload-error">{err}</p>}
        <div className="flex gap-2">
          <Button type="submit" className="flex-1" loading={busy} disabled={!file} data-testid="submit-video">{assetId && err ? "Retry submit" : "Upload & submit for moderation"}</Button>
          {phase === "uploading" && <Button type="button" variant="outline" onClick={() => cancelRef.current?.()} data-testid="cancel-upload">Cancel</Button>}
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
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [pct, setPct] = useState(0);
  const [phase, setPhase] = useState<"idle" | "cover" | "uploading" | "saving" | "done">("idle");
  const [err, setErr] = useState<string | null>(null);
  const cancelRef = useRef<(() => void) | null>(null);
  const { register, handleSubmit, watch, reset, formState: { errors } } = useForm<EpForm>({ resolver: zodResolver(epSchema), defaultValues: { podcast_id: "" } });
  const isNew = watch("podcast_id") === "new";

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
      const up = uploadFile("audio", audio, audio.name, setPct);
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
          <FileDrop accept=".mp3,.m4a,audio/mpeg,audio/mp4" label="Drag & drop an audio episode" hint={`MP3 or M4A · up to ${MAX_AUDIO} MB`} testId="audio-file-input"
            onFile={(f) => { const e = validate(f, "audio"); setFileError(e); setAudio(e ? null : f); }} />
        ) : (
          <div className="space-y-2 rounded-2xl border border-line p-4">
            <div className="flex items-center gap-2"><Mic className="h-5 w-5 text-brand" /><div className="min-w-0 flex-1"><p className="truncate font-medium">{audio.name}</p><p className="text-xs text-muted">{formatBytes(audio.size)}</p></div>
              {!busy && <Button type="button" variant="ghost" size="icon" aria-label="Remove file" onClick={() => setAudio(null)}><X className="h-4 w-4" /></Button>}</div>
            {audioUrl && <audio src={audioUrl} controls className="w-full" />}
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
              <input type="file" accept="image/png,image/jpeg,image/webp" onChange={(e) => setCover(e.target.files?.[0] ?? null)} disabled={busy} className="text-sm" />
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
