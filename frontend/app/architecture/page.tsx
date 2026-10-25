"use client";
import "@xyflow/react/dist/style.css";
import { Background, Controls, MarkerType, ReactFlow, type Edge, type Node } from "@xyflow/react";
import { useTheme } from "next-themes";
import { PageHeader } from "@/components/ui";

type Kind = "built" | "partial" | "proposed";
const style = (k: Kind): React.CSSProperties => ({
  padding: 10, borderRadius: 12, fontSize: 12, width: 190, textAlign: "center", lineHeight: 1.35,
  border: k === "proposed" ? "2px dashed hsl(var(--warn))" : k === "partial" ? "2px solid hsl(var(--warn))" : "2px solid hsl(var(--success))",
  background: "hsl(var(--surface))", color: "hsl(var(--fg))",
});
const n = (id: string, x: number, y: number, label: string, sub: string, k: Kind): Node => ({
  id, position: { x, y }, data: { label: (<div><b>{label}</b><div style={{ opacity: 0.7 }}>{sub}</div></div>) }, style: style(k), draggable: false,
});

const nodes: Node[] = [
  n("web", 330, 0, "Next.js frontend", "App Router · TanStack Query · RHF+Zod", "built"),
  n("rec", 30, 0, "Browser media APIs", "MediaRecorder · HTML5 video/audio", "built"),
  n("api", 330, 130, "FastAPI backend", "REST · validation · rate limits", "built"),
  n("auth", 30, 130, "Authentication", "JWT · bcrypt · roles", "built"),
  n("mod", 630, 130, "Moderation service", "queue · approve/reject/hide · audit log", "built"),
  n("ev", 630, 260, "Notification events", "comment · reply · approve · reject · follow", "built"),
  n("db", 330, 260, "Relational DB", "SQLAlchemy + Alembic · SQLite (verified) / PostgreSQL (configured)", "partial"),
  n("store", 30, 260, "Media storage", "local disk behind storage keys", "built"),
  n("deliv", 30, 390, "Media delivery", "/media with HTTP Range · access by moderation status", "built"),
  n("s3", 330, 390, "S3 / Supabase adapter", "signed direct-to-storage uploads", "proposed"),
  n("worker", 630, 390, "Background workers", "queue · retryable processing", "proposed"),
  n("ffmpeg", 630, 500, "FFmpeg + HLS", "transcode · thumbnails · adaptive streaming", "proposed"),
  n("av", 330, 500, "Malware scanning", "ClamAV on ingest · retention policy", "proposed"),
  n("cdn", 30, 500, "CDN", "edge caching of media", "proposed"),
  n("push", 930, 260, "Web push", "service worker + VAPID", "proposed"),
];
const e = (id: string, source: string, target: string, label?: string, dashed = false): Edge => ({
  id, source, target, label, animated: !dashed, markerEnd: { type: MarkerType.ArrowClosed },
  style: dashed ? { strokeDasharray: "6 4", stroke: "hsl(var(--warn))" } : undefined, labelStyle: { fontSize: 10 }, labelBgStyle: { fill: "transparent" },
});
const edges: Edge[] = [
  e("1", "rec", "web", "capture"), e("2", "web", "api", "REST + JWT"), e("3", "auth", "api", "verify"),
  e("4", "api", "mod"), e("5", "mod", "ev", "emits"), e("6", "api", "db", "SQL"), e("7", "api", "store", "uploads"),
  e("8", "store", "deliv"), e("9", "deliv", "web", "playback"), e("10", "ev", "db", "persist"),
  e("11", "api", "s3", "", true), e("12", "api", "worker", "", true), e("13", "worker", "ffmpeg", "", true), e("14", "worker", "av", "", true), e("15", "s3", "cdn", "", true), e("16", "ev", "push", "", true),
];

export default function Architecture() {
  const { resolvedTheme } = useTheme();
  return (
    <>
      <PageHeader title="Architecture" subtitle="Creator → Web app → FastAPI → Storage → Database → Moderation → Published feed → Playback" />
      <div className="mb-3 flex flex-wrap gap-4 text-xs" aria-label="Legend">
        <span className="flex items-center gap-2"><i className="inline-block h-3 w-5 rounded border-2 border-success" />Implemented &amp; tested</span>
        <span className="flex items-center gap-2"><i className="inline-block h-3 w-5 rounded border-2 border-warn" />Implemented, partly verified</span>
        <span className="flex items-center gap-2"><i className="inline-block h-3 w-5 rounded border-2 border-dashed border-warn" />Proposed for production (not built)</span>
      </div>
      <div className="h-[640px] overflow-hidden rounded-2xl border border-line bg-surface" data-testid="flow">
        <ReactFlow nodes={nodes} edges={edges} fitView proOptions={{ hideAttribution: true }} colorMode={resolvedTheme === "light" ? "light" : "dark"} nodesConnectable={false} aria-label="Architecture diagram">
          <Background /><Controls showInteractive={false} />
        </ReactFlow>
      </div>
      <p className="mt-3 text-sm text-muted">Local demo uses direct backend uploads with strict limits. SQLite runs locally; PostgreSQL is supported via <code>DATABASE_URL</code> but was not exercised in this environment. See the README “Production roadmap” for details.</p>
    </>
  );
}
