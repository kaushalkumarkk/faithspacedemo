"use client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useState } from "react";
import { toast } from "sonner";
import { Button, Card, EmptyState, ErrorState, PageHeader, Skeleton, StatusBadge } from "@/components/ui";
import { api, type Page, type Report } from "@/lib/api";
import { cn, timeAgo } from "@/lib/utils";

export default function AdminReports() {
  const qc = useQueryClient();
  const [status, setStatus] = useState("open");
  const q = useQuery({ queryKey: ["admin-reports", status], queryFn: () => api<Page<Report>>(`/admin/reports?status=${status}&page_size=30`) });
  const done = () => {
    for (const k of ["admin-reports", "admin-overview", "mod-queue", "mod-history", "admin-comments", "feed"]) qc.invalidateQueries({ queryKey: [k] });
  };
  const resolve = useMutation({
    mutationFn: ({ id, resolution }: { id: number; resolution: string }) => api(`/admin/reports/${id}/resolve`, { method: "POST", json: { resolution } }),
    onSuccess: () => { toast.success("Report closed"); done(); },
    onError: (e) => toast.error((e as Error).message),
  });
  // "Take down" hides the reported video/episode (or deletes the comment), then resolves the report.
  const takeDown = useMutation({
    mutationFn: async (r: Report) => {
      if (r.target_type === "comment") await api(`/comments/${r.target_id}`, { method: "DELETE" });
      else await api(`/admin/moderation/${r.target_type}/${r.target_id}/hide`, { method: "POST", json: { reason: `Reported: ${r.reason}` } });
      await api(`/admin/reports/${r.id}/resolve`, { method: "POST", json: { resolution: "resolved" } });
    },
    onSuccess: () => { toast.success("Content taken down and report resolved"); done(); },
    onError: (e) => toast.error((e as Error).message),
  });
  const link = (r: Report) => (r.target_type === "video" ? `/?v=${r.target_id}` : r.target_type === "episode" ? `/episodes/${r.target_id}` : null);
  return (
    <>
      <PageHeader title="Reports" subtitle="Content flagged by users." />
      <div className="mb-4 flex gap-2 text-sm">
        {["open", "resolved", "dismissed", "all"].map((s) => (
          <button key={s} onClick={() => setStatus(s)} className={cn("rounded-full px-3 py-1 capitalize", status === s ? "bg-brand text-brand-fg" : "bg-elevated")}>{s}</button>
        ))}
      </div>
      {q.isLoading && <Skeleton className="h-32" />}
      {q.isError && <ErrorState error={q.error} retry={() => q.refetch()} />}
      {q.data?.items.length === 0 && <EmptyState title="No reports" body="Viewers can report a video from the flag button in the feed." />}
      <div className="space-y-2">
        {q.data?.items.map((r) => (
          <Card key={r.id} className="flex flex-wrap items-center gap-3 p-4" data-testid="report">
            <div className="min-w-0 basis-full sm:basis-0 sm:flex-1">
              <p className="text-xs uppercase text-muted">{r.target_type} · {timeAgo(r.created_at)} · by {r.reporter.display_name}</p>
              <p className="font-medium">{link(r) ? <Link href={link(r)!} className="hover:text-brand">{r.target_title}</Link> : r.target_title}</p>
              <p className="text-sm text-muted">“{r.reason}”</p>
            </div>
            <StatusBadge status={r.status} />
            {r.status === "open" && (
              <div className="flex gap-2">
                <Button size="sm" variant="danger" onClick={() => takeDown.mutate(r)} loading={takeDown.isPending && takeDown.variables?.id === r.id}>{r.target_type === "comment" ? "Delete comment" : "Take down"}</Button>
                <Button size="sm" variant="outline" onClick={() => resolve.mutate({ id: r.id, resolution: "dismissed" })}>Dismiss</Button>
              </div>
            )}
          </Card>
        ))}
      </div>
    </>
  );
}
