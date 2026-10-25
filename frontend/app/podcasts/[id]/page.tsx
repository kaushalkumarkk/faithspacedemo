"use client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ImagePlus } from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useRef } from "react";
import { toast } from "sonner";
import { Cover } from "@/components/cover";
import { Avatar, Button, ErrorState, Skeleton, StatusBadge } from "@/components/ui";
import { api, uploadFile, type Episode, type Podcast } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { timeAgo } from "@/lib/utils";

export default function PodcastDetail() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const qc = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const changeCover = useMutation({
    mutationFn: async (f: File) => {
      if (!["image/png", "image/jpeg", "image/webp"].includes(f.type)) throw new Error("Cover must be a PNG, JPG or WebP image.");
      if (f.size > 5 * 1048576) throw new Error("Cover image must be 5 MB or smaller.");
      const asset = await uploadFile("image", f, f.name, () => {}).promise;
      return api(`/podcasts/${id}`, { method: "PATCH", json: { cover_asset_id: asset.id } });
    },
    onSuccess: () => { toast.success("Cover image updated"); qc.invalidateQueries({ queryKey: ["podcast", id] }); qc.invalidateQueries({ queryKey: ["podcasts"] }); },
    onError: (e) => toast.error((e as Error).message),
  });
  const q = useQuery({ queryKey: ["podcast", id], queryFn: () => api<{ podcast: Podcast; episodes: Episode[] }>(`/podcasts/${id}`) });
  if (q.isLoading) return <Skeleton className="h-72" />;
  if (q.isError) return <ErrorState error={q.error} retry={() => q.refetch()} />;
  const { podcast: p, episodes } = q.data!;
  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-5 sm:flex-row">
        <div className="shrink-0 space-y-2">
          <Cover url={p.cover_url} title={p.title} className="h-48 w-48" />
          {user?.id === p.owner.id && (
            <>
              <Button size="sm" variant="outline" className="w-48" loading={changeCover.isPending} onClick={() => fileRef.current?.click()} data-testid="change-cover"><ImagePlus className="h-4 w-4" />{p.cover_url ? "Change cover" : "Add cover image"}</Button>
              <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp" className="sr-only" aria-label="Cover image file" onChange={(e) => { const f = e.target.files?.[0]; if (f) changeCover.mutate(f); e.target.value = ""; }} />
            </>
          )}
        </div>
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
