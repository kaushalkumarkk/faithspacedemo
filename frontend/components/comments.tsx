"use client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CornerDownRight, Send, Trash2, X } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { toast } from "sonner";
import { api, type Comment } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { timeAgo } from "@/lib/utils";
import { Avatar, Button, ErrorState, Skeleton } from "./ui";

export function CommentsPanel({ videoId, onClose }: { videoId: number; onClose: () => void }) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [body, setBody] = useState("");
  const [replyTo, setReplyTo] = useState<Comment | null>(null);
  const q = useQuery({ queryKey: ["comments", videoId], queryFn: () => api<Comment[]>(`/videos/${videoId}/comments`) });

  const invalidate = () => { qc.invalidateQueries({ queryKey: ["comments", videoId] }); qc.invalidateQueries({ queryKey: ["feed"] }); };
  const add = useMutation({
    mutationFn: () => api(`/videos/${videoId}/comments`, { method: "POST", json: { body: body.trim(), parent_id: replyTo?.id ?? null } }),
    onSuccess: () => { setBody(""); setReplyTo(null); invalidate(); },
    onError: (e) => toast.error((e as Error).message),
  });
  const del = useMutation({
    mutationFn: (id: number) => api(`/comments/${id}`, { method: "DELETE" }),
    onSuccess: () => { toast.success("Comment deleted"); invalidate(); },
    onError: (e) => toast.error((e as Error).message),
  });

  const Row = ({ c, nested }: { c: Comment; nested?: boolean }) => (
    <li className={nested ? "ml-9" : ""} data-testid="comment">
      <div className="flex gap-2.5">
        <Avatar name={c.author.display_name} url={c.author.avatar_url} size={28} />
        <div className="min-w-0 flex-1">
          <p className="text-sm"><Link href={`/profile/${c.author.id}`} className="font-medium hover:underline">{c.author.display_name}</Link> <span className="text-xs text-muted">{timeAgo(c.created_at)}</span></p>
          <p className="whitespace-pre-wrap break-words text-sm">{c.body}</p>
          <div className="mt-1 flex gap-3 text-xs text-muted">
            {user && !nested && <button className="hover:text-fg" onClick={() => setReplyTo(c)}>Reply</button>}
            {user && (user.id === c.author.id || user.role === "admin") && (
              <button className="inline-flex items-center gap-1 hover:text-danger" aria-label="Delete comment" onClick={() => del.mutate(c.id)}><Trash2 className="h-3 w-3" />Delete</button>
            )}
          </div>
        </div>
      </div>
      {c.replies.length > 0 && <ul className="mt-3 space-y-3">{c.replies.map((r) => <Row key={r.id} c={r} nested />)}</ul>}
    </li>
  );

  return (
    <section aria-label="Comments" className="flex h-full flex-col bg-surface text-fg">
      <header className="flex items-center justify-between border-b border-line px-4 py-3">
        <h2 className="font-medium">Comments</h2>
        <Button variant="ghost" size="icon" aria-label="Close comments" onClick={onClose}><X className="h-5 w-5" /></Button>
      </header>
      <div className="flex-1 overflow-y-auto px-4 py-3">
        {q.isLoading && <div className="space-y-3">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-12" />)}</div>}
        {q.isError && <ErrorState error={q.error} retry={() => q.refetch()} />}
        {q.data?.length === 0 && <p className="py-10 text-center text-sm text-muted">No comments yet. Start the conversation.</p>}
        <ul className="space-y-4">{q.data?.map((c) => <Row key={c.id} c={c} />)}</ul>
      </div>
      <footer className="border-t border-line p-3">
        {user ? (
          <form onSubmit={(e) => { e.preventDefault(); if (body.trim()) add.mutate(); }} className="space-y-2">
            {replyTo && (
              <p className="flex items-center gap-1 text-xs text-muted"><CornerDownRight className="h-3 w-3" />Replying to {replyTo.author.display_name}
                <button type="button" className="ml-auto underline" onClick={() => setReplyTo(null)}>cancel</button></p>
            )}
            <div className="flex gap-2">
              <input aria-label="Write a comment" value={body} onChange={(e) => setBody(e.target.value)} maxLength={1000} placeholder="Add a comment…"
                className="h-10 flex-1 rounded-xl border border-line bg-bg px-3 text-sm" />
              <Button type="submit" size="icon" aria-label="Post comment" loading={add.isPending} disabled={!body.trim()}><Send className="h-4 w-4" /></Button>
            </div>
          </form>
        ) : (
          <p className="text-center text-sm text-muted"><Link href="/login" className="text-brand">Log in</Link> to comment.</p>
        )}
      </footer>
    </section>
  );
}
