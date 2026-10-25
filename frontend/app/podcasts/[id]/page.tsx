"use client";
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useParams } from "next/navigation";
import { Cover } from "@/components/cover";
import { Avatar, ErrorState, Skeleton, StatusBadge } from "@/components/ui";
import { api, type Episode, type Podcast } from "@/lib/api";
import { timeAgo } from "@/lib/utils";

export default function PodcastDetail() {
  const { id } = useParams<{ id: string }>();
  const q = useQuery({ queryKey: ["podcast", id], queryFn: () => api<{ podcast: Podcast; episodes: Episode[] }>(`/podcasts/${id}`) });
  if (q.isLoading) return <Skeleton className="h-72" />;
  if (q.isError) return <ErrorState error={q.error} retry={() => q.refetch()} />;
  const { podcast: p, episodes } = q.data!;
  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-5 sm:flex-row">
        <Cover url={p.cover_url} title={p.title} className="h-48 w-48 shrink-0" />
        <div className="space-y-2">
          <p className="text-xs uppercase tracking-wide text-muted">{p.category}</p>
          <h1 className="font-display text-3xl font-semibold">{p.title}</h1>
          <Link href={`/profile/${p.owner.id}`} className="inline-flex items-center gap-2 text-sm"><Avatar name={p.owner.display_name} url={p.owner.avatar_url} size={24} />{p.owner.display_name}</Link>
          <p className="max-w-xl text-sm text-muted">{p.description}</p>
        </div>
      </div>
      <ul className="space-y-2">
        {episodes.length === 0 && <li className="text-sm text-muted">No published episodes yet.</li>}
        {episodes.map((e) => (
          <li key={e.id}><Link href={`/episodes/${e.id}`} className="flex items-center justify-between rounded-2xl border border-line bg-surface p-4 hover:bg-elevated">
            <div><p className="font-medium">{e.title}</p><p className="text-xs text-muted">{e.published_at ? timeAgo(e.published_at) : "unpublished"}</p></div>
            {e.status !== "approved" && <StatusBadge status={e.status} />}
          </Link></li>
        ))}
      </ul>
    </div>
  );
}
