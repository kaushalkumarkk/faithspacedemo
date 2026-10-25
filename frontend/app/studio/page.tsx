"use client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Pencil, Trash2 } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { toast } from "sonner";
import { Gate } from "@/components/gate";
import { Button, Card, EmptyState, ErrorState, Field, Input, Modal, PageHeader, Skeleton, StatusBadge, Textarea } from "@/components/ui";
import { api, type Episode, type Video } from "@/lib/api";
import { cn, formatDateTime, timeAgo } from "@/lib/utils";

type Editing = { kind: "video" | "episode"; id: number; title: string; description: string } | null;

function Studio() {
  const qc = useQueryClient();
  const [tab, setTab] = useState<"videos" | "episodes">("videos");
  const [edit, setEdit] = useState<Editing>(null);
  const videos = useQuery({ queryKey: ["my-videos"], queryFn: () => api<Video[]>("/videos/mine") });
  const episodes = useQuery({ queryKey: ["my-episodes"], queryFn: () => api<Episode[]>("/episodes/mine") });
  const refresh = () => { qc.invalidateQueries({ queryKey: ["my-videos"] }); qc.invalidateQueries({ queryKey: ["my-episodes"] }); qc.invalidateQueries({ queryKey: ["feed"] }); };

  const del = useMutation({
    mutationFn: ({ kind, id }: { kind: string; id: number }) => api(`/${kind}s/${id}`, { method: "DELETE" }),
    onSuccess: () => { toast.success("Deleted"); refresh(); }, onError: (e) => toast.error((e as Error).message),
  });
  const save = useMutation({
    mutationFn: (e: NonNullable<Editing>) => api(`/${e.kind}s/${e.id}`, { method: "PATCH", json: { title: e.title, description: e.description } }),
    onSuccess: () => { toast.success("Saved — edits to published content are re-reviewed"); setEdit(null); refresh(); }, onError: (e) => toast.error((e as Error).message),
  });

  const Row = ({ kind, id, title, subtitle, status, reason, created, link }: { kind: "video" | "episode"; id: number; title: string; subtitle?: string; status: string; reason: string | null; created: string; link: string }) => {
    const item = (kind === "video" ? videos.data?.find((v) => v.id === id) : episodes.data?.find((e) => e.id === id))!;
    return (
      <Card className="flex flex-wrap items-center gap-3 p-4" data-testid={`studio-${kind}`}>
        <div className="min-w-0 basis-full sm:basis-0 sm:flex-1"><Link href={link} className="font-medium hover:text-brand">{title}</Link><p className="text-xs text-muted">{subtitle ? `${subtitle} · ` : ""}Uploaded {formatDateTime(created)} · {timeAgo(created)}</p>
          {reason && <p className="mt-1 text-sm text-danger">Reason: {reason}</p>}</div>
        <StatusBadge status={status} />
        <Button variant="ghost" size="icon" aria-label={`Edit ${title}`} onClick={() => setEdit({ kind, id, title, description: item.description })}><Pencil className="h-4 w-4" /></Button>
        <Button variant="ghost" size="icon" aria-label={`Delete ${title}`} onClick={() => confirm(`Delete “${title}” permanently?`) && del.mutate({ kind, id })}><Trash2 className="h-4 w-4 text-danger" /></Button>
      </Card>
    );
  };

  const active = tab === "videos" ? videos : episodes;
  return (
    <>
      <PageHeader title="My studio" subtitle="Everything you’ve uploaded and where it is in moderation." actions={<Link href="/upload"><Button>New upload</Button></Link>} />
      <div className="mb-5 inline-flex rounded-xl bg-elevated p-1" role="tablist">
        {(["videos", "episodes"] as const).map((t) => <button key={t} role="tab" aria-selected={tab === t} onClick={() => setTab(t)} className={cn("rounded-lg px-4 py-1.5 text-sm font-medium capitalize", tab === t && "bg-surface shadow-sm")}>{t}</button>)}
      </div>
      {active.isLoading && <div className="space-y-2">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-16" />)}</div>}
      {active.isError && <ErrorState error={active.error} retry={() => active.refetch()} />}
      {active.data?.length === 0 && <EmptyState title={`No ${tab} yet`} action={<Link href="/upload"><Button size="sm">Upload one</Button></Link>} />}
      <div className="space-y-2">
        {tab === "videos" && videos.data?.map((v) => <Row key={v.id} kind="video" id={v.id} title={v.title} status={v.status} reason={v.rejection_reason} created={v.created_at} link={`/?v=${v.id}`} />)}
        {tab === "episodes" && episodes.data?.map((e) => <Row key={e.id} kind="episode" id={e.id} title={e.title} subtitle={e.podcast_title} status={e.status} reason={e.rejection_reason} created={e.created_at} link={`/episodes/${e.id}`} />)}
      </div>
      <Modal open={!!edit} onClose={() => setEdit(null)} title="Edit details">
        {edit && (
          <form onSubmit={(ev) => { ev.preventDefault(); save.mutate(edit); }} className="space-y-3">
            <Field label="Title"><Input value={edit.title} minLength={2} onChange={(e) => setEdit({ ...edit, title: e.target.value })} required /></Field>
            <Field label="Description"><Textarea value={edit.description} onChange={(e) => setEdit({ ...edit, description: e.target.value })} /></Field>
            <div className="flex justify-end gap-2"><Button type="button" variant="ghost" onClick={() => setEdit(null)}>Cancel</Button><Button type="submit" loading={save.isPending}>Save</Button></div>
          </form>
        )}
      </Modal>
    </>
  );
}

export default function StudioPage() {
  return <Gate roles={["creator", "admin"]}><Studio /></Gate>;
}
