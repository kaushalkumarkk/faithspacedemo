"use client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Trash2 } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { toast } from "sonner";
import { Button, Card, EmptyState, ErrorState, PageHeader, Skeleton } from "@/components/ui";
import { api, type AdminComment, type Page } from "@/lib/api";
import { timeAgo } from "@/lib/utils";

export default function AdminComments() {
  const qc = useQueryClient();
  const [page, setPage] = useState(1);
  const q = useQuery({ queryKey: ["admin-comments", page], queryFn: () => api<Page<AdminComment>>(`/admin/comments?page=${page}&page_size=15`) });
  const del = useMutation({
    mutationFn: (id: number) => api(`/comments/${id}`, { method: "DELETE" }),
    onSuccess: () => { toast.success("Comment deleted"); qc.invalidateQueries({ queryKey: ["admin-comments"] }); qc.invalidateQueries({ queryKey: ["mod-history"] }); },
    onError: (e) => toast.error((e as Error).message),
  });
  return (
    <>
      <PageHeader title="Comments" subtitle="Admin deletions are recorded in moderation history." />
      {q.isLoading && <Skeleton className="h-40" />}
      {q.isError && <ErrorState error={q.error} retry={() => q.refetch()} />}
      {q.data?.items.length === 0 && <EmptyState title="No comments yet" />}
      <div className="space-y-2">
        {q.data?.items.map((c) => (
          <Card key={c.id} className="flex items-start gap-3 p-4" data-testid="admin-comment">
            <div className="min-w-0 flex-1">
              <p className="text-sm"><b>{c.author.display_name}</b> on <Link className="text-brand" href={`/?v=${c.video_id}`}>{c.video_title}</Link> <span className="text-xs text-muted">· {timeAgo(c.created_at)}</span></p>
              <p className="mt-1 break-words text-sm">{c.body}</p>
            </div>
            <Button size="sm" variant="danger" aria-label={`Delete comment by ${c.author.display_name}`} onClick={() => del.mutate(c.id)}><Trash2 className="h-4 w-4" />Delete</Button>
          </Card>
        ))}
      </div>
      {q.data && q.data.total > 15 && (
        <div className="mt-4 flex items-center justify-center gap-3 text-sm">
          <Button size="sm" variant="outline" disabled={page === 1} onClick={() => setPage(page - 1)}>Previous</Button><span>Page {page}</span>
          <Button size="sm" variant="outline" disabled={page * 15 >= q.data.total} onClick={() => setPage(page + 1)}>Next</Button>
        </div>
      )}
    </>
  );
}
