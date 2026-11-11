"use client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Bookmark, BookmarkX, Eye } from "lucide-react";
import Link from "next/link";
import { toast } from "sonner";
import { Gate } from "@/components/gate";
import { Button, Card, EmptyState, ErrorState, PageHeader, Skeleton } from "@/components/ui";
import { api, mediaSrc, type Video } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { formatTime } from "@/lib/utils";

function Saved() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["saved", user?.id ?? 0], queryFn: () => api<Video[]>("/videos/saved") });
  const remove = useMutation({
    mutationFn: (id: number) => api(`/videos/${id}/save`, { method: "DELETE" }),
    onSuccess: () => { toast.success("Removed from saved"); qc.invalidateQueries({ queryKey: ["saved"] }); qc.invalidateQueries({ queryKey: ["feed"] }); },
    onError: (e) => toast.error((e as Error).message),
  });
  return (
    <>
      <PageHeader title="Saved videos" subtitle="Videos you bookmarked to watch again." />
      {q.isLoading && <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="aspect-[9/16]" />)}</div>}
      {q.isError && <ErrorState error={q.error} retry={() => q.refetch()} />}
      {q.data?.length === 0 && (
        <EmptyState title="Nothing saved yet" body="Tap the bookmark on any video to keep it here." action={<Link href="/"><Button size="sm"><Bookmark className="h-4 w-4" />Browse videos</Button></Link>} />
      )}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {q.data?.map((v) => (
          <Card key={v.id} className="overflow-hidden p-0" data-testid="saved-video">
            <Link href={`/?v=${v.id}`} className="group relative block aspect-[9/16] bg-black">
              {v.thumbnail_url ? (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img src={mediaSrc(v.thumbnail_url)} alt={v.title} className="h-full w-full object-cover opacity-90 transition group-hover:opacity-100" />
              ) : (
                <video src={`${mediaSrc(v.video_url)}#t=0.5`} preload="metadata" muted className="h-full w-full object-cover opacity-90 transition group-hover:opacity-100" />
              )}
              {v.duration_seconds != null && <span className="absolute right-2 top-2 rounded bg-black/70 px-1.5 py-0.5 text-[10px] font-medium tabular-nums text-white">{formatTime(v.duration_seconds)}</span>}
              <span className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 p-2 text-xs text-white">
                <span className="block font-medium">{v.title}</span>
                <span className="inline-flex items-center gap-1 text-white/75"><Eye className="h-3 w-3" aria-hidden />{v.view_count ?? 0} · {v.owner.display_name}</span>
              </span>
            </Link>
            <div className="p-2">
              <Button variant="ghost" size="sm" className="w-full" onClick={() => remove.mutate(v.id)} data-testid="unsave-btn"><BookmarkX className="h-4 w-4" />Remove</Button>
            </div>
          </Card>
        ))}
      </div>
    </>
  );
}

export default function SavedPage() {
  return <Gate><Saved /></Gate>;
}
