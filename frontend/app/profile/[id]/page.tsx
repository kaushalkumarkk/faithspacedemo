"use client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Ban, Camera, Flag, MessageSquare, ShieldCheck } from "lucide-react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { Avatar, Button, Card, EmptyState, ErrorState, Input, Modal, Skeleton, Textarea } from "@/components/ui";
import { api, mediaSrc, uploadFile, type Page, type User, type Video } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { formatTime } from "@/lib/utils";

export default function ProfilePage() {
  const { id } = useParams<{ id: string }>();
  const { user: me, refresh } = useAuth();
  const router = useRouter();
  const qc = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState("");
  const [bio, setBio] = useState("");
  const [reportOpen, setReportOpen] = useState(false);
  const [reportReason, setReportReason] = useState("");

  const u = useQuery({ queryKey: ["user", id, me?.id ?? 0], queryFn: () => api<User>(`/users/${id}`) });
  const vids = useQuery({ queryKey: ["feed", "owner", id], queryFn: () => api<Page<Video>>(`/videos?owner_id=${id}&page_size=24`) });
  const mine = me?.id === Number(id);
  const blockedList = useQuery({
    queryKey: ["blocked-users", me?.id ?? 0],
    queryFn: () => api<User[]>("/users/blocks"),
    enabled: !!mine,
  });

  const follow = useMutation({
    mutationFn: () => api<User>(`/users/${id}/follow`, { method: u.data?.is_following ? "DELETE" : "POST" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["user", id] }), onError: (e) => toast.error((e as Error).message),
  });
  const block = useMutation({
    mutationFn: (targetId: number | string = id) => api<User>(`/users/${targetId}/block`, { method: "POST" }),
    onSuccess: () => {
      toast.success("User blocked");
      qc.invalidateQueries({ queryKey: ["user", id] });
      qc.invalidateQueries({ queryKey: ["feed"] });
      qc.invalidateQueries({ queryKey: ["blocked-users"] });
    },
    onError: (e) => toast.error((e as Error).message),
  });
  const unblock = useMutation({
    mutationFn: (targetId: number | string = id) => api<User>(`/users/${targetId}/block`, { method: "DELETE" }),
    onSuccess: () => {
      toast.success("User unblocked");
      qc.invalidateQueries({ queryKey: ["user", id] });
      qc.invalidateQueries({ queryKey: ["feed"] });
      qc.invalidateQueries({ queryKey: ["blocked-users"] });
    },
    onError: (e) => toast.error((e as Error).message),
  });
  const reportUser = useMutation({
    mutationFn: () => api("/reports", { method: "POST", json: { target_type: "user", target_id: Number(id), reason: reportReason } }),
    onSuccess: () => { toast.success("Report sent to moderators"); setReportOpen(false); setReportReason(""); },
    onError: (e) => toast.error((e as Error).message),
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
            : <div className="flex flex-wrap justify-center gap-2 sm:justify-start">
                {me?.is_guest ? (
                  <Link href="/register" data-testid="guest-cta" className="text-sm font-medium text-brand">Create a free account to follow or message {p.display_name}</Link>
                ) : !p.is_blocked && !p.blocked_by_target && (
                  <>
                    <Button size="sm" variant={p.is_following ? "outline" : "primary"} data-testid="follow-btn" loading={follow.isPending}
                      onClick={() => (me ? follow.mutate() : router.push("/login"))}>{p.is_following ? "Following" : "Follow"}</Button>
                    <Button size="sm" variant="outline" data-testid="message-btn" onClick={() => router.push(`/messages?u=${p.id}`)}><MessageSquare className="h-4 w-4" />Message</Button>
                  </>
                )}
                {me && !me.is_guest && (
                  <>
                    <Button
                      size="sm"
                      variant={p.is_blocked ? "secondary" : "outline"}
                      data-testid="block-btn"
                      loading={block.isPending || unblock.isPending}
                      onClick={() => (p.is_blocked ? unblock.mutate(p.id) : block.mutate(p.id))}
                    >
                      {p.is_blocked ? <><ShieldCheck className="h-4 w-4" />Unblock</> : <><Ban className="h-4 w-4 text-danger" />Block</>}
                    </Button>
                    <Button size="sm" variant="ghost" data-testid="report-user-btn" onClick={() => { setReportReason(""); setReportOpen(true); }}>
                      <Flag className="h-4 w-4" />Report
                    </Button>
                  </>
                )}
              </div>}
          {(p.is_blocked || p.blocked_by_target) && (
            <p className="text-xs text-danger" data-testid="blocked-banner">
              {p.is_blocked ? "You have blocked this user. Their videos and messages are hidden." : "You cannot interact with this user."}
            </p>
          )}
        </div>
      </div>

      {mine && blockedList.data && blockedList.data.length > 0 && (
        <Card className="p-4" data-testid="blocked-users-card">
          <h2 className="mb-3 font-display text-lg font-semibold">Blocked users</h2>
          <div className="space-y-2">
            {blockedList.data.map((bu) => (
              <div key={bu.id} className="flex items-center justify-between gap-3 rounded-xl bg-elevated px-3 py-2" data-testid="blocked-user-row">
                <div className="flex items-center gap-2">
                  <Avatar name={bu.display_name} url={bu.avatar_url} size={28} />
                  <span className="text-sm font-medium">{bu.display_name}</span>
                </div>
                <Button size="sm" variant="outline" onClick={() => unblock.mutate(bu.id)} loading={unblock.isPending}>Unblock</Button>
              </div>
            ))}
          </div>
        </Card>
      )}

      <section>
        <h2 className="mb-3 font-display text-xl font-semibold">Videos</h2>
        {vids.isLoading && <Skeleton className="h-40" />}
        {vids.data?.items.length === 0 && <EmptyState title={p.is_blocked ? "Videos hidden (user blocked)" : "No published videos yet"} />}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {vids.data?.items.map((v) => (
            <Link key={v.id} href={`/?v=${v.id}`} className="group relative aspect-[9/16] overflow-hidden rounded-xl bg-black" data-testid="profile-video">
              {v.thumbnail_url ? (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img src={mediaSrc(v.thumbnail_url)} alt={v.title} className="h-full w-full object-cover opacity-90 transition group-hover:opacity-100" />
              ) : (
                <video src={`${mediaSrc(v.video_url)}#t=0.5`} preload="metadata" muted className="h-full w-full object-cover opacity-90 transition group-hover:opacity-100" />
              )}
              {v.duration_seconds != null && (
                <span className="absolute right-2 top-2 rounded bg-black/70 px-1.5 py-0.5 text-[10px] font-medium tabular-nums text-white">{formatTime(v.duration_seconds)}</span>
              )}
              <span className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 p-2 text-xs text-white">{v.title}</span>
            </Link>
          ))}
        </div>
      </section>

      <Modal open={reportOpen} onClose={() => setReportOpen(false)} title={`Report ${p.display_name}`}>
        <form onSubmit={(e) => { e.preventDefault(); reportUser.mutate(); }} className="space-y-3">
          <Textarea aria-label="Reason" required minLength={3} maxLength={300} value={reportReason} onChange={(e) => setReportReason(e.target.value)} placeholder="Describe the issue with this account…" />
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={() => setReportOpen(false)}>Cancel</Button>
            <Button type="submit" loading={reportUser.isPending} disabled={reportReason.trim().length < 3} data-testid="submit-user-report">Send report</Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
