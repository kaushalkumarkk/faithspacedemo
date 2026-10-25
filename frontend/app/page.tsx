"use client";
import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { ChevronDown, ChevronUp, Film } from "lucide-react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CommentsPanel } from "@/components/comments";
import { Reel } from "@/components/reel";
import { Button, EmptyState, ErrorState, Skeleton } from "@/components/ui";
import { api, type Page, type Video } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { cn } from "@/lib/utils";

function Feed() {
  const { user } = useAuth();
  const deep = Number(useSearchParams().get("v")) || null;
  const [active, setActive] = useState(0);
  const [muted, setMuted] = useState(true);
  const [commentsFor, setCommentsFor] = useState<number | null>(null);
  const scroller = useRef<HTMLDivElement>(null);

  const feed = useInfiniteQuery({
    queryKey: ["feed", user?.id ?? 0],
    initialPageParam: 1,
    queryFn: ({ pageParam }) => api<Page<Video>>(`/videos?page=${pageParam}&page_size=8`),
    getNextPageParam: (last) => (last.page * last.page_size < last.total ? last.page + 1 : undefined),
  });
  const deepVideo = useQuery({ queryKey: ["video", deep, user?.id ?? 0], queryFn: () => api<Video>(`/videos/${deep}`), enabled: !!deep });

  const videos = useMemo(() => {
    const list = feed.data?.pages.flatMap((p) => p.items) ?? [];
    if (deepVideo.data && !list.some((v) => v.id === deepVideo.data!.id)) return [deepVideo.data, ...list];
    // Move the deep-linked video to the front.
    if (deep) { const i = list.findIndex((v) => v.id === deep); if (i > 0) return [list[i], ...list.slice(0, i), ...list.slice(i + 1)]; }
    return list;
  }, [feed.data, deepVideo.data, deep]);

  const onScroll = useCallback(() => {
    const el = scroller.current;
    if (!el) return;
    const i = Math.round(el.scrollTop / el.clientHeight);
    setActive(i);
    if (i >= videos.length - 2 && feed.hasNextPage && !feed.isFetchingNextPage) feed.fetchNextPage();
  }, [videos.length, feed]);

  const go = (d: number) => scroller.current?.scrollTo({ top: Math.max(0, Math.min(videos.length - 1, active + d)) * scroller.current.clientHeight, behavior: "smooth" });

  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).closest("input,textarea,select")) return;
      if (e.key === "ArrowDown") go(1);
      if (e.key === "ArrowUp") go(-1);
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  });

  const height = "h-[calc(100dvh-3.5rem-3.5rem)] lg:h-[calc(100dvh-3.5rem)]";

  if (feed.isLoading) return <div className={cn("grid place-items-center p-4", height)}><Skeleton className="h-full w-full max-w-[460px]" /></div>;
  if (feed.isError) return <div className="p-6"><ErrorState error={feed.error} retry={() => feed.refetch()} /></div>;
  if (!videos.length)
    return (
      <div className="mx-auto max-w-lg px-4 py-16">
        <EmptyState title="No published videos yet" body="Videos appear here once a creator uploads one and an admin approves it."
          action={user && user.role !== "viewer" ? <Link href="/upload"><Button className="mt-2">Upload a video</Button></Link> : undefined} />
      </div>
    );

  return (
    <div className={cn("relative flex", height)}>
      <div ref={scroller} onScroll={onScroll} className="scroll-snap-y hide-scrollbar relative flex-1 overflow-y-scroll" data-testid="feed">
        {videos.map((v, i) => (
          <div key={v.id} className="h-full snap-start snap-always py-0 sm:py-2">
            {Math.abs(i - active) <= 1 ? (
              <Reel video={v} active={i === active} muted={muted} setMuted={setMuted} commentsOpen={commentsFor === v.id}
                onComments={() => setCommentsFor(commentsFor === v.id ? null : v.id)} />
            ) : <div className="mx-auto h-full max-w-[460px] bg-black/90 sm:rounded-2xl" />}
          </div>
        ))}
        {feed.isFetchingNextPage && <p className="py-4 text-center text-sm text-muted">Loading more…</p>}
      </div>

      <div className="absolute right-4 top-1/2 hidden -translate-y-1/2 flex-col gap-2 lg:flex" style={{ right: commentsFor ? "25rem" : "1rem" }}>
        <Button variant="secondary" size="icon" aria-label="Previous video" disabled={active === 0} onClick={() => go(-1)}><ChevronUp className="h-5 w-5" /></Button>
        <Button variant="secondary" size="icon" aria-label="Next video" disabled={active >= videos.length - 1} onClick={() => go(1)}><ChevronDown className="h-5 w-5" /></Button>
      </div>

      {commentsFor && (
        <aside className="fixed inset-x-0 bottom-14 z-50 h-[65dvh] animate-fade-up overflow-hidden rounded-t-2xl border border-line shadow-2xl lg:static lg:inset-auto lg:h-auto lg:w-96 lg:shrink-0 lg:animate-none lg:rounded-none lg:border-0 lg:border-l lg:shadow-none">
          <CommentsPanel videoId={commentsFor} onClose={() => setCommentsFor(null)} />
        </aside>
      )}
    </div>
  );
}

export default function Home() {
  return <Suspense fallback={<Skeleton className="m-4 h-96" />}><Feed /></Suspense>;
}
