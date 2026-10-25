"use client";
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useParams } from "next/navigation";
import { Cover } from "@/components/cover";
import { AudioPlayer } from "@/components/audio-player";
import { ErrorState, Skeleton, StatusBadge } from "@/components/ui";
import { api, type Episode } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { formatDateTime, timeAgo } from "@/lib/utils";

export default function EpisodePage() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const q = useQuery({ queryKey: ["episode", id, user?.id ?? 0], queryFn: () => api<Episode>(`/episodes/${id}`) });
  if (q.isLoading) return <Skeleton className="h-96" />;
  if (q.isError) return <ErrorState error={q.error} retry={() => q.refetch()} />;
  const e = q.data!;
  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <Cover url={e.cover_url} title={e.podcast_title} className="mx-auto h-64 w-64" />
      <div className="space-y-2 text-center">
        <Link href={`/podcasts/${e.podcast_id}`} className="text-sm text-brand">{e.podcast_title}</Link>
        <h1 className="font-display text-3xl font-semibold" data-testid="episode-title">{e.title}</h1>
        <p className="text-sm text-muted">{e.owner.display_name} · Uploaded {formatDateTime(e.created_at)} · {e.published_at ? `published ${timeAgo(e.published_at)}` : "not published"} {e.status !== "approved" && <StatusBadge status={e.status} />}</p>
      </div>
      {e.rejection_reason && <p className="rounded-xl bg-danger/10 p-3 text-sm text-danger">Rejected: {e.rejection_reason}</p>}
      <AudioPlayer episode={e} />
      <p className="whitespace-pre-wrap text-sm leading-relaxed">{e.description}</p>
    </div>
  );
}
