"use client";
import { useQuery } from "@tanstack/react-query";
import { Play, Search } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { Cover } from "@/components/cover";
import { EmptyState, ErrorState, Input, PageHeader, Select, Skeleton } from "@/components/ui";
import { api, CATEGORIES, mediaSrc, type Episode, type Page, type Podcast } from "@/lib/api";
import { timeAgo } from "@/lib/utils";

export default function PodcastsPage() {
  const [q, setQ] = useState("");
  const [dq, setDq] = useState("");
  const [cat, setCat] = useState("");
  useEffect(() => { const t = setTimeout(() => setDq(q), 250); return () => clearTimeout(t); }, [q]);

  const shows = useQuery({ queryKey: ["podcasts", dq, cat], queryFn: () => api<Page<Podcast>>(`/podcasts?q=${encodeURIComponent(dq)}&category=${cat}&page_size=24`) });
  const eps = useQuery({ queryKey: ["episodes", dq, cat], queryFn: () => api<Page<Episode>>(`/episodes?q=${encodeURIComponent(dq)}&category=${cat}&page_size=20`) });

  return (
    <>
      <PageHeader title="Podcasts" subtitle="Conversations, teachings and music from across the community." />
      <div className="mb-8 flex flex-col gap-2 sm:flex-row">
        <div className="relative flex-1"><Search className="absolute left-3 top-3 h-4 w-4 text-muted" aria-hidden />
          <Input type="search" aria-label="Search episodes" placeholder="Search episodes and shows…" className="pl-9" value={q} onChange={(e) => setQ(e.target.value)} data-testid="podcast-search" /></div>
        <Select aria-label="Category" className="sm:w-48" value={cat} onChange={(e) => setCat(e.target.value)}><option value="">All categories</option>{CATEGORIES.map((c) => <option key={c}>{c}</option>)}</Select>
      </div>

      <h2 className="mb-3 font-display text-xl font-semibold">Shows</h2>
      {shows.isLoading && <div className="grid grid-cols-2 gap-4 md:grid-cols-4">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-52" />)}</div>}
      {shows.isError && <ErrorState error={shows.error} retry={() => shows.refetch()} />}
      {shows.data?.items.length === 0 && <EmptyState title="No shows found" body="Shows appear after a creator’s first episode is approved." />}
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        {shows.data?.items.map((p) => (
          <Link key={p.id} href={`/podcasts/${p.id}`} className="group space-y-2 rounded-2xl border border-line bg-surface p-3 transition hover:-translate-y-0.5 hover:shadow-lg">
            <Cover url={p.cover_url} title={p.title} />
            <p className="truncate font-medium group-hover:text-brand">{p.title}</p>
            <p className="truncate text-xs text-muted">{p.owner.display_name} · {p.episode_count} ep</p>
          </Link>
        ))}
      </div>

      <h2 className="mb-3 mt-10 font-display text-xl font-semibold">Episodes</h2>
      {eps.isLoading && <div className="space-y-2">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-20" />)}</div>}
      {eps.isError && <ErrorState error={eps.error} retry={() => eps.refetch()} />}
      {eps.data?.items.length === 0 && <EmptyState title={dq ? `No episodes match “${dq}”` : "No episodes yet"} />}
      <ul className="space-y-2">
        {eps.data?.items.map((e) => (
          <li key={e.id}>
            <Link href={`/episodes/${e.id}`} data-testid="episode-row" className="flex items-center gap-3 rounded-2xl border border-line bg-surface p-3 transition hover:bg-elevated">
              <Cover url={e.cover_url} title={e.podcast_title} className="h-16 w-16 shrink-0" />
              <div className="min-w-0 flex-1"><p className="truncate font-medium">{e.title}</p><p className="truncate text-sm text-muted">{e.podcast_title} · {e.owner.display_name}</p>
                <p className="text-xs text-muted">{e.published_at ? timeAgo(e.published_at) : ""}</p></div>
              <span className="grid h-10 w-10 place-items-center rounded-full bg-brand text-brand-fg"><Play className="h-4 w-4 translate-x-0.5" /></span>
            </Link>
          </li>
        ))}
      </ul>
    </>
  );
}
