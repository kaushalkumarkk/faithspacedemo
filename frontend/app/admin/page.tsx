"use client";
import { useQuery } from "@tanstack/react-query";
import { ModerationList } from "@/components/moderation-list";
import { Card, ErrorState, PageHeader, Skeleton } from "@/components/ui";
import { api } from "@/lib/api";

interface Overview {
  users: number; creators: number; podcasts: number; comments: number; likes: number; open_reports: number; moderation_actions: number;
  videos: Record<string, number>; episodes: Record<string, number>;
}

function Stat({ label, value, tone }: { label: string; value: number; tone?: string }) {
  return (
    <Card className="p-4">
      <p className="text-xs text-muted">{label}</p>
      <p className={`font-display text-3xl font-semibold tabular-nums ${tone ?? ""}`}>{value}</p>
    </Card>
  );
}

export default function AdminOverview() {
  const q = useQuery({ queryKey: ["admin-overview"], queryFn: () => api<Overview>("/admin/overview"), refetchInterval: 10000 });
  return (
    <>
      <PageHeader title="Overview" subtitle="Live counts from the database." />
      {q.isLoading && <div className="grid grid-cols-2 gap-3 md:grid-cols-4">{Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-24" />)}</div>}
      {q.isError && <ErrorState error={q.error} retry={() => q.refetch()} />}
      {q.data && (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4" data-testid="overview-stats">
          <Stat label="Pending videos" value={q.data.videos.pending} tone="text-warn" />
          <Stat label="Pending episodes" value={q.data.episodes.pending} tone="text-warn" />
          <Stat label="Published videos" value={q.data.videos.approved} tone="text-success" />
          <Stat label="Published episodes" value={q.data.episodes.approved} tone="text-success" />
          <Stat label="Users" value={q.data.users} />
          <Stat label="Comments" value={q.data.comments} />
          <Stat label="Likes" value={q.data.likes} />
          <Stat label="Open reports" value={q.data.open_reports} tone={q.data.open_reports ? "text-danger" : ""} />
        </div>
      )}
      <h2 className="mb-3 mt-10 font-display text-xl font-semibold">Pending review queue</h2>
      <ModerationList type="all" filters={false} />
    </>
  );
}
