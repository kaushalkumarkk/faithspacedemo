"use client";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, Flag, Heart, Loader2, Maximize, MessageCircle, Pause, Play, Volume2, VolumeX } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { api, mediaSrc, type Video } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { cn, formatDateTime, formatTime, timeAgo } from "@/lib/utils";
import { Avatar, Button, Modal, StatusBadge, Textarea } from "./ui";

// MediaRecorder WebM files often report duration=Infinity; fall back to the seekable range.
function realDuration(v: HTMLVideoElement): number {
  if (isFinite(v.duration)) return v.duration;
  return v.seekable.length ? v.seekable.end(v.seekable.length - 1) : v.currentTime;
}

export function Reel({ video, active, muted, setMuted, onComments, commentsOpen }: {
  video: Video; active: boolean; muted: boolean; setMuted: (m: boolean) => void; onComments: () => void; commentsOpen: boolean;
}) {
  const { user } = useAuth();
  const router = useRouter();
  const qc = useQueryClient();
  const vref = useRef<HTMLVideoElement>(null);
  const wrap = useRef<HTMLDivElement>(null);
  const [playing, setPlaying] = useState(false);
  const [buffering, setBuffering] = useState(true);
  const [failed, setFailed] = useState(false);
  const [t, setT] = useState(0);
  const [dur, setDur] = useState(0);
  const [report, setReport] = useState(false);
  const [reason, setReason] = useState("");

  // Play only the reel that is in view.
  useEffect(() => {
    const el = vref.current;
    if (!el || failed) return;
    if (active) el.play().catch(() => setPlaying(false));
    else { el.pause(); }
  }, [active, failed]);

  const toggle = () => { const el = vref.current; if (!el) return; el.paused ? el.play().catch(() => {}) : el.pause(); };

  const like = useMutation({
    mutationFn: () => api(`/videos/${video.id}/likes`, { method: video.liked_by_me ? "DELETE" : "POST" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["feed"] }),
    onError: (e) => toast.error((e as Error).message),
  });
  const submitReport = useMutation({
    mutationFn: () => api("/reports", { method: "POST", json: { target_type: "video", target_id: video.id, reason } }),
    onSuccess: () => { toast.success("Report sent to moderators"); setReport(false); setReason(""); },
    onError: (e) => toast.error((e as Error).message),
  });
  const needAuth = (fn: () => void) => () => (user ? fn() : (toast.info("Log in to do that"), router.push("/login")));

  return (
    <div ref={wrap} data-testid="reel" data-video-id={video.id} className="relative mx-auto h-full w-full max-w-[460px] overflow-hidden bg-black sm:rounded-2xl">
      <video
        ref={vref}
        src={mediaSrc(video.video_url, video.status)}
        className="h-full w-full object-contain"
        loop playsInline preload={active ? "auto" : "metadata"} muted={muted}
        onPlay={() => setPlaying(true)} onPause={() => setPlaying(false)}
        onWaiting={() => setBuffering(true)} onCanPlay={() => setBuffering(false)} onPlaying={() => setBuffering(false)}
        onLoadedMetadata={(e) => setDur(realDuration(e.currentTarget))}
        onTimeUpdate={(e) => { setT(e.currentTarget.currentTime); if (!isFinite(e.currentTarget.duration)) setDur(realDuration(e.currentTarget)); }}
        onError={() => { setFailed(true); setBuffering(false); }}
        onClick={toggle}
      />
      {buffering && !failed && <div className="pointer-events-none absolute inset-0 grid place-items-center"><Loader2 className="h-9 w-9 animate-spin text-white/80" aria-label="Loading video" /></div>}
      {failed && (
        <div role="alert" className="absolute inset-0 grid place-items-center bg-black/80 p-6 text-center text-white">
          <div className="space-y-3"><AlertTriangle className="mx-auto h-8 w-8 text-accent" /><p className="text-sm">This video couldn’t be played.</p>
            <Button size="sm" variant="secondary" onClick={() => { setFailed(false); setBuffering(true); vref.current?.load(); }}>Retry</Button></div>
        </div>
      )}
      {!playing && !buffering && !failed && (
        <button onClick={toggle} aria-label="Play" className="absolute inset-0 m-auto grid h-16 w-16 place-items-center rounded-full bg-black/50 text-white backdrop-blur"><Play className="h-8 w-8 translate-x-0.5" /></button>
      )}

      {/* right action rail */}
      <div className="absolute bottom-24 right-3 flex flex-col items-center gap-4 text-white">
        <button aria-label={video.liked_by_me ? "Unlike" : "Like"} aria-pressed={video.liked_by_me} data-testid="like-btn" onClick={needAuth(() => like.mutate())} className="flex flex-col items-center gap-1">
          <span className="grid h-11 w-11 place-items-center rounded-full bg-black/45 backdrop-blur"><Heart className={cn("h-6 w-6", video.liked_by_me && "animate-pop fill-red-500 text-red-500")} /></span>
          <span className="text-xs font-medium" data-testid="like-count">{video.like_count}</span>
        </button>
        <button aria-label="Comments" data-testid="comments-btn" onClick={onComments} className="flex flex-col items-center gap-1">
          <span className={cn("grid h-11 w-11 place-items-center rounded-full bg-black/45 backdrop-blur", commentsOpen && "bg-brand")}><MessageCircle className="h-6 w-6" /></span>
          <span className="text-xs font-medium" data-testid="comment-count">{video.comment_count}</span>
        </button>
        <button aria-label={muted ? "Unmute" : "Mute"} onClick={() => setMuted(!muted)} className="grid h-11 w-11 place-items-center rounded-full bg-black/45 backdrop-blur">
          {muted ? <VolumeX className="h-5 w-5" /> : <Volume2 className="h-5 w-5" />}
        </button>
        <button aria-label="Full screen" onClick={() => (document.fullscreenElement ? document.exitFullscreen() : wrap.current?.requestFullscreen?.())} className="grid h-11 w-11 place-items-center rounded-full bg-black/45 backdrop-blur"><Maximize className="h-5 w-5" /></button>
        <button aria-label="Report video" onClick={needAuth(() => setReport(true))} className="grid h-9 w-9 place-items-center rounded-full bg-black/45 backdrop-blur"><Flag className="h-4 w-4" /></button>
      </div>

      {/* caption */}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/85 via-black/40 to-transparent p-4 pb-7 pr-20 text-white">
        <Link href={`/profile/${video.owner.id}`} className="pointer-events-auto mb-2 flex items-center gap-2">
          <Avatar name={video.owner.display_name} url={video.owner.avatar_url} size={32} />
          <span className="text-sm font-semibold">{video.owner.display_name}</span>
          {video.status !== "approved" && <StatusBadge status={video.status} />}
        </Link>
        <h2 className="text-base font-semibold leading-tight" data-testid="reel-title">{video.title}</h2>
        {video.description && <p className="mt-1 line-clamp-2 text-sm text-white/80">{video.description}</p>}
        <div className="mt-2 flex flex-wrap items-center gap-2 text-xs"><span className="rounded-full bg-white/15 px-2 py-0.5">{video.category}</span>
          <time dateTime={video.created_at} title={`Uploaded ${formatDateTime(video.created_at)}`} className="text-white/75" data-testid="uploaded-at">Uploaded {formatDateTime(video.created_at)} · {timeAgo(video.created_at)}</time></div>
      </div>

      {/* seek bar */}
      <div className="absolute inset-x-0 bottom-0 flex items-center gap-2 px-3 pb-1.5 text-[10px] text-white/80">
        <span className="w-8 text-right tabular-nums">{formatTime(t)}</span>
        <input type="range" aria-label="Seek" min={0} max={dur || 0} step={0.1} value={Math.min(t, dur || 0)} className="h-1 flex-1"
          onChange={(e) => { if (vref.current) vref.current.currentTime = Number(e.target.value); setT(Number(e.target.value)); }} />
        <span className="w-8 tabular-nums">{formatTime(dur)}</span>
      </div>

      <Modal open={report} onClose={() => setReport(false)} title="Report this video">
        <form onSubmit={(e) => { e.preventDefault(); submitReport.mutate(); }} className="space-y-3">
          <Textarea aria-label="Reason" required minLength={3} maxLength={300} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="What’s wrong with this video?" />
          <div className="flex justify-end gap-2"><Button type="button" variant="ghost" onClick={() => setReport(false)}>Cancel</Button><Button type="submit" loading={submitReport.isPending} disabled={reason.trim().length < 3}>Send report</Button></div>
        </form>
      </Modal>
    </div>
  );
}
