"use client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Eye, EyeOff, RotateCcw, X } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { api, mediaSrc, type ModItem, type Page } from "@/lib/api";
import { cn, formatDateTime, timeAgo } from "@/lib/utils";
import { Avatar, Button, Card, EmptyState, ErrorState, Modal, Skeleton, StatusBadge, Textarea } from "./ui";

const STATUS_FILTERS = ["pending", "approved", "rejected", "hidden", "all"];

export function ModerationList({ type, initialStatus = "pending", filters = true }: { type: "video" | "episode" | "all"; initialStatus?: string; filters?: boolean }) {
  const qc = useQueryClient();
  const [status, setStatus] = useState(initialStatus);
  const [page, setPage] = useState(1);
  const [rejecting, setRejecting] = useState<ModItem | null>(null);
  const [reason, setReason] = useState("");
  const [open, setOpen] = useState<string | null>(null);
  const q = useQuery({ queryKey: ["mod-queue", type, status, page], queryFn: () => api<Page<ModItem>>(`/admin/moderation/queue?type=${type}&status=${status}&page=${page}&page_size=10`), refetchInterval: 10000 });

  const act = useMutation({
    mutationFn: ({ it, action, body }: { it: ModItem; action: string; body?: unknown }) =>
      api(`/admin/moderation/${it.type}/${it.id}/${action}`, { method: "POST", json: body }),
    onSuccess: (_d, v) => {
      const past: Record<string, string> = { approve: "approved", reject: "rejected", hide: "hidden", restore: "restored" };
      toast.success(`“${v.it.title}” ${past[v.action]}`);
      qc.invalidateQueries({ queryKey: ["mod-queue"] }); qc.invalidateQueries({ queryKey: ["admin-overview"] }); qc.invalidateQueries({ queryKey: ["mod-history"] }); qc.invalidateQueries({ queryKey: ["feed"] });
    },
    onError: (e) => toast.error((e as Error).message),
  });

  return (
    <div>
      {filters && (
        <div className="mb-4 flex flex-wrap gap-2 text-sm" role="tablist" aria-label="Status filter">
          {STATUS_FILTERS.map((s) => <button key={s} role="tab" aria-selected={status === s} onClick={() => { setStatus(s); setPage(1); }} className={cn("rounded-full px-3 py-1 capitalize", status === s ? "bg-brand text-brand-fg" : "bg-elevated")}>{s}</button>)}
        </div>
      )}
      {q.isLoading && <div className="space-y-2">{[0, 1].map((i) => <Skeleton key={i} className="h-24" />)}</div>}
      {q.isError && <ErrorState error={q.error} retry={() => q.refetch()} />}
      {q.data?.items.length === 0 && <EmptyState title={status === "pending" ? "Queue is clear" : "Nothing here"} body={status === "pending" ? "New uploads waiting for review will appear here." : undefined} />}
      <div className="space-y-3">
        {q.data?.items.map((it) => {
          const key = `${it.type}-${it.id}`;
          return (
            <Card key={key} className="p-4" data-testid="mod-item" data-title={it.title}>
              <div className="flex flex-wrap items-start gap-3">
                <div className="min-w-0 basis-full space-y-1 sm:basis-0 sm:flex-1">
                  <div className="flex flex-wrap items-center gap-2"><span className="rounded bg-elevated px-1.5 py-0.5 text-[10px] font-semibold uppercase">{it.type}</span><StatusBadge status={it.status} /><span className="text-xs text-muted">{it.category}</span></div>
                  <p className="break-words font-medium">{it.title}</p>
                  <p className="text-xs text-muted">Uploaded {formatDateTime(it.created_at)} · {timeAgo(it.created_at)}</p>
                  <p className="flex items-center gap-1.5 text-xs text-muted"><Avatar name={it.owner.display_name} url={it.owner.avatar_url} size={18} />{it.owner.display_name}</p>
                  {it.rejection_reason && <p className="text-sm text-danger">Reason: {it.rejection_reason}</p>}
                </div>
                <div className="flex w-full flex-wrap gap-2 sm:w-auto">
                  <Button size="sm" variant="outline" onClick={() => setOpen(open === key ? null : key)} aria-label={`Preview ${it.title}`}><Eye className="h-4 w-4" />Preview</Button>
                  {(it.status === "pending" || it.status === "rejected" || it.status === "hidden") && (
                    <Button size="sm" data-testid="approve" loading={act.isPending && act.variables?.it === it} onClick={() => act.mutate({ it, action: it.status === "pending" ? "approve" : "restore" })}>
                      {it.status === "pending" ? <Check className="h-4 w-4" /> : <RotateCcw className="h-4 w-4" />}{it.status === "pending" ? "Approve" : "Restore"}</Button>
                  )}
                  {it.status === "pending" && <Button size="sm" variant="danger" data-testid="reject" onClick={() => { setRejecting(it); setReason(""); }}><X className="h-4 w-4" />Reject</Button>}
                  {it.status === "approved" && <Button size="sm" variant="secondary" data-testid="hide" onClick={() => act.mutate({ it, action: "hide", body: {} })}><EyeOff className="h-4 w-4" />Hide</Button>}
                </div>
              </div>
              {open === key && (
                <div className="mt-3 flex justify-center rounded-xl bg-black p-2">
                  {it.type === "video" || it.mime_type.startsWith("video/")
                    ? <video src={mediaSrc(it.media_url, it.status === "approved" ? "pending" : it.status)} controls playsInline className="max-h-[420px] rounded-lg" data-testid="mod-preview" />
                    : <audio src={mediaSrc(it.media_url, "pending")} controls className="w-full" data-testid="mod-preview" />}
                </div>
              )}
            </Card>
          );
        })}
      </div>
      {q.data && q.data.total > q.data.page_size && (
        <div className="mt-4 flex items-center justify-center gap-3 text-sm">
          <Button size="sm" variant="outline" disabled={page === 1} onClick={() => setPage(page - 1)}>Previous</Button><span>Page {page}</span>
          <Button size="sm" variant="outline" disabled={page * q.data.page_size >= q.data.total} onClick={() => setPage(page + 1)}>Next</Button>
        </div>
      )}
      <Modal open={!!rejecting} onClose={() => setRejecting(null)} title={`Reject “${rejecting?.title ?? ""}”`}>
        <form onSubmit={(e) => { e.preventDefault(); if (rejecting) act.mutate({ it: rejecting, action: "reject", body: { reason } }, { onSuccess: () => setRejecting(null) }); }} className="space-y-3">
          <Textarea aria-label="Rejection reason" required minLength={3} maxLength={500} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Tell the creator why (shown to them)…" />
          <div className="flex justify-end gap-2"><Button type="button" variant="ghost" onClick={() => setRejecting(null)}>Cancel</Button><Button type="submit" variant="danger" loading={act.isPending} disabled={reason.trim().length < 3} data-testid="confirm-reject">Reject</Button></div>
        </form>
      </Modal>
    </div>
  );
}
