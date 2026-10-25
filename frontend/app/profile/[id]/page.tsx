"use client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Camera, MessageSquare } from "lucide-react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { Avatar, Button, EmptyState, ErrorState, Input, Skeleton, Textarea } from "@/components/ui";
import { api, uploadFile, type Page, type User, type Video } from "@/lib/api";
import { useAuth } from "@/lib/auth";

export default function ProfilePage() {
  const { id } = useParams<{ id: string }>();
  const { user: me, refresh } = useAuth();
  const router = useRouter();
  const qc = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState("");
  const [bio, setBio] = useState("");

  const u = useQuery({ queryKey: ["user", id, me?.id ?? 0], queryFn: () => api<User>(`/users/${id}`) });
  const vids = useQuery({ queryKey: ["feed", "owner", id], queryFn: () => api<Page<Video>>(`/videos?owner_id=${id}&page_size=24`) });
  const follow = useMutation({
    mutationFn: () => api<User>(`/users/${id}/follow`, { method: u.data?.is_following ? "DELETE" : "POST" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["user", id] }), onError: (e) => toast.error((e as Error).message),
  });
  const save = useMutation({
    mutationFn: () => api("/users/me", { method: "PATCH", json: { display_name: name, bio } }),
    onSuccess: async () => { toast.success("Profile updated"); setEditing(false); await refresh(); qc.invalidateQueries({ queryKey: ["user", id] }); },
    onError: (e) => toast.error((e as Error).message),
  });
  const avatar = useMutation({
    mutationFn: async (f: File) => { const a = await uploadFile("image", f, f.name, () => {}).promise; return api("/users/me", { method: "PATCH", json: { avatar_asset_id: a.id } }); },
    onSuccess: async () => { toast.success("Avatar updated"); await refresh(); qc.invalidateQueries({ queryKey: ["user", id] }); }, onError: (e) => toast.error((e as Error).message),
  });

  if (u.isLoading) return <Skeleton className="h-48" />;
  if (u.isError) return <ErrorState error={u.error} retry={() => u.refetch()} />;
  const p = u.data!;
  const mine = me?.id === p.id;

  return (
    <div className="space-y-8">
      <div className="flex flex-col items-center gap-4 text-center sm:flex-row sm:items-start sm:text-left">
        <div className="relative">
          <Avatar name={p.display_name} url={p.avatar_url} size={96} />
          {mine && (<>
            <button aria-label="Change avatar" onClick={() => fileRef.current?.click()} className="absolute -bottom-1 -right-1 grid h-8 w-8 place-items-center rounded-full bg-brand text-brand-fg"><Camera className="h-4 w-4" /></button>
            <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp" className="sr-only" aria-label="Avatar file" onChange={(e) => e.target.files?.[0] && avatar.mutate(e.target.files[0])} />
          </>)}
        </div>
        <div className="flex-1 space-y-2">
          {editing ? (
            <div className="max-w-md space-y-2"><Input aria-label="Display name" value={name} onChange={(e) => setName(e.target.value)} /><Textarea aria-label="Bio" value={bio} onChange={(e) => setBio(e.target.value)} maxLength={500} />
              <div className="flex gap-2"><Button size="sm" onClick={() => save.mutate()} loading={save.isPending}>Save</Button><Button size="sm" variant="ghost" onClick={() => setEditing(false)}>Cancel</Button></div></div>
          ) : (<>
            <h1 className="font-display text-3xl font-semibold">{p.display_name}</h1>
            <p className="text-xs uppercase tracking-wide text-muted">{p.role}</p>
            <p className="max-w-lg text-sm text-muted">{p.bio || "No bio yet."}</p>
          </>)}
          <p className="text-sm"><b data-testid="follower-count">{p.follower_count}</b> followers · <b>{p.following_count}</b> following · <b>{p.video_count}</b> videos</p>
          {mine ? !editing && <Button size="sm" variant="outline" onClick={() => { setName(p.display_name); setBio(p.bio); setEditing(true); }}>Edit profile</Button>
            : <div className="flex flex-wrap gap-2">
                <Button size="sm" variant={p.is_following ? "outline" : "primary"} data-testid="follow-btn" loading={follow.isPending}
                  onClick={() => (me ? follow.mutate() : router.push("/login"))}>{p.is_following ? "Following" : "Follow"}</Button>
                <Button size="sm" variant="outline" data-testid="message-btn" onClick={() => router.push(`/messages?u=${p.id}`)}><MessageSquare className="h-4 w-4" />Message</Button>
              </div>}
        </div>
      </div>
      <section>
        <h2 className="mb-3 font-display text-xl font-semibold">Videos</h2>
        {vids.isLoading && <Skeleton className="h-40" />}
        {vids.data?.items.length === 0 && <EmptyState title="No published videos yet" />}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {vids.data?.items.map((v) => (
            <Link key={v.id} href={`/?v=${v.id}`} className="group relative aspect-[9/16] overflow-hidden rounded-xl bg-black">
              <video src={`${process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000"}${v.video_url}#t=0.5`} preload="metadata" muted className="h-full w-full object-cover opacity-90 transition group-hover:opacity-100" />
              <span className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 p-2 text-xs text-white">{v.title}</span>
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}
