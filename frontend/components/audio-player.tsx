"use client";
import { AlertTriangle, Loader2, Pause, Play, RotateCcw, RotateCw, Volume2, VolumeX } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { mediaSrc, type Episode } from "@/lib/api";
import { formatTime } from "@/lib/utils";
import { Button } from "./ui";

const SPEEDS = [0.75, 1, 1.25, 1.5, 2];
const posKey = (id: number) => `fs_pos_${id}`;

/** Real HTML5 audio player. Position is remembered per episode for the browser session (sessionStorage). */
export function AudioPlayer({ episode }: { episode: Episode }) {
  const a = useRef<HTMLMediaElement>(null);
  const [playing, setPlaying] = useState(false);
  const [t, setT] = useState(0);
  const [dur, setDur] = useState(0);
  const [vol, setVol] = useState(1);
  const [rate, setRate] = useState(1);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const lastSave = useRef(0);

  useEffect(() => {
    const el = a.current;
    if (!el) return;
    const saved = Number(sessionStorage.getItem(posKey(episode.id)) ?? 0);
    const restore = () => { if (saved > 1 && saved < el.duration - 1) { el.currentTime = saved; setT(saved); } };
    el.addEventListener("loadedmetadata", restore, { once: true });
    return () => el.removeEventListener("loadedmetadata", restore);
  }, [episode.id]);

  const toggle = () => { const el = a.current; if (el) el.paused ? el.play().catch(() => setFailed(true)) : el.pause(); };
  const seekTo = (v: number) => { if (a.current) { a.current.currentTime = Math.max(0, Math.min(dur || v, v)); setT(a.current.currentTime); } };

  return (
    <div className="rounded-2xl border border-line bg-surface p-4 sm:p-5" data-testid="audio-player">
      {(() => {
        const common = {
          src: mediaSrc(episode.audio_url, episode.status), preload: "metadata" as const,
          onLoadedMetadata: (e: React.SyntheticEvent<HTMLMediaElement>) => { const d = e.currentTarget.duration; setDur(isFinite(d) ? d : e.currentTarget.seekable.length ? e.currentTarget.seekable.end(e.currentTarget.seekable.length - 1) : 0); setLoading(false); },
          onCanPlay: () => setLoading(false), onWaiting: () => setLoading(true), onPlaying: () => setLoading(false),
          onPlay: () => setPlaying(true), onPause: () => setPlaying(false),
          onEnded: () => { setPlaying(false); sessionStorage.removeItem(posKey(episode.id)); },
          onError: () => { setFailed(true); setLoading(false); },
          onTimeUpdate: (e: React.SyntheticEvent<HTMLMediaElement>) => {
            const c = e.currentTarget.currentTime;
            setT(c);
            if (!isFinite(e.currentTarget.duration)) setDur(e.currentTarget.seekable.length ? e.currentTarget.seekable.end(e.currentTarget.seekable.length - 1) : c);
            if (Math.abs(c - lastSave.current) > 1) { lastSave.current = c; sessionStorage.setItem(posKey(episode.id), String(c)); }
          },
        };
        return episode.is_video ? (
          <video ref={a as React.RefObject<HTMLVideoElement>} {...common} playsInline onClick={toggle} data-testid="episode-video"
            className="mb-4 aspect-video w-full cursor-pointer rounded-xl bg-black object-contain" />
        ) : (
          <audio ref={a as React.RefObject<HTMLAudioElement>} {...common} />
        );
      })()}
      {failed ? (
        <div role="alert" className="flex items-center gap-3 text-sm"><AlertTriangle className="h-5 w-5 text-warn" />This episode couldn’t be played.
          <Button size="sm" variant="outline" onClick={() => { setFailed(false); setLoading(true); a.current?.load(); }}>Retry</Button></div>
      ) : (
        <>
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="icon" aria-label="Back 15 seconds" data-testid="back15" onClick={() => seekTo(t - 15)}><RotateCcw className="h-5 w-5" /></Button>
            <Button size="icon" className="h-14 w-14 rounded-full" aria-label={playing ? "Pause" : "Play"} data-testid="play-toggle" onClick={toggle}>
              {loading && !playing ? <Loader2 className="h-6 w-6 animate-spin" /> : playing ? <Pause className="h-6 w-6" /> : <Play className="h-6 w-6 translate-x-0.5" />}
            </Button>
            <Button variant="ghost" size="icon" aria-label="Forward 15 seconds" data-testid="fwd15" onClick={() => seekTo(t + 15)}><RotateCw className="h-5 w-5" /></Button>
            <div className="ml-auto flex items-center gap-2">
              <label className="sr-only" htmlFor="speed">Playback speed</label>
              <select id="speed" value={rate} onChange={(e) => { const r = Number(e.target.value); setRate(r); if (a.current) a.current.playbackRate = r; }}
                className="h-9 rounded-lg border border-line bg-surface px-2 text-sm" data-testid="speed">{SPEEDS.map((s) => <option key={s} value={s}>{s}×</option>)}</select>
            </div>
          </div>
          <div className="mt-4 flex items-center gap-3 text-xs tabular-nums text-muted">
            <span data-testid="current-time" className="w-10 text-right">{formatTime(t)}</span>
            <input type="range" aria-label="Seek" data-testid="seek" min={0} max={dur || 0} step={0.1} value={Math.min(t, dur || 0)} onChange={(e) => seekTo(Number(e.target.value))} className="h-1.5 flex-1" />
            <span className="w-10">{formatTime(dur)}</span>
          </div>
          <div className="mt-3 flex items-center gap-2 text-muted">
            <button aria-label={vol === 0 ? "Unmute" : "Mute"} onClick={() => { const v = vol === 0 ? 1 : 0; setVol(v); if (a.current) a.current.volume = v; }}>
              {vol === 0 ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
            </button>
            <input type="range" aria-label="Volume" min={0} max={1} step={0.05} value={vol} className="h-1 w-28" onChange={(e) => { const v = Number(e.target.value); setVol(v); if (a.current) a.current.volume = v; }} />
          </div>
        </>
      )}
    </div>
  );
}
