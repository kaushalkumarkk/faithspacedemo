"use client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Bell, CheckCheck, CheckCircle2, Heart, MessageCircle, ShieldX, UserPlus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Gate } from "@/components/gate";
import { Button, EmptyState, ErrorState, PageHeader, Skeleton } from "@/components/ui";
import { api, type Notification, type Page } from "@/lib/api";
import { cn, timeAgo } from "@/lib/utils";

const icons: Record<string, React.ElementType> = { comment: MessageCircle, reply: MessageCircle, approved: CheckCircle2, rejected: ShieldX, hidden: ShieldX, follow: UserPlus, like: Heart };

function Inner() {
  const qc = useQueryClient();
  const router = useRouter();
  const [unreadOnly, setUnreadOnly] = useState(false);
  const [page, setPage] = useState(1);
  const q = useQuery({ queryKey: ["notifications", "list", unreadOnly, page], queryFn: () => api<Page<Notification>>(`/notifications?page=${page}&page_size=15&unread_only=${unreadOnly}`) });
  const done = () => { qc.invalidateQueries({ queryKey: ["notifications"] }); qc.invalidateQueries({ queryKey: ["unread"] }); };
  const read = useMutation({ mutationFn: (id: number) => api(`/notifications/${id}/read`, { method: "POST" }), onSuccess: done });
  const readAll = useMutation({ mutationFn: () => api("/notifications/read-all", { method: "POST" }), onSuccess: done });

  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader title="Notifications" subtitle="Stored in the database — they persist across sessions and devices."
        actions={<Button variant="outline" size="sm" onClick={() => readAll.mutate()} loading={readAll.isPending} data-testid="mark-all"><CheckCheck className="h-4 w-4" />Mark all read</Button>} />
      <div className="mb-4 flex gap-2 text-sm">
        {[false, true].map((u) => <button key={String(u)} onClick={() => { setUnreadOnly(u); setPage(1); }} className={cn("rounded-full px-3 py-1", unreadOnly === u ? "bg-brand text-brand-fg" : "bg-elevated")}>{u ? "Unread" : "All"}</button>)}
      </div>
      {q.isLoading && <div className="space-y-2">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-16" />)}</div>}
      {q.isError && <ErrorState error={q.error} retry={() => q.refetch()} />}
      {q.data?.items.length === 0 && <EmptyState title="You’re all caught up" body="Comments, replies and moderation decisions on your content will appear here." />}
      <ul className="space-y-2">
        {q.data?.items.map((n) => {
          const Icon = icons[n.type] ?? Bell;
          return (
            <li key={n.id} data-testid="notification" data-read={n.is_read} className={cn("flex items-start gap-3 rounded-2xl border border-line p-4", n.is_read ? "bg-surface" : "bg-brand/5")}>
              <Icon className={cn("mt-0.5 h-5 w-5 shrink-0", n.is_read ? "text-muted" : "text-brand")} aria-hidden />
              <button className="min-w-0 flex-1 text-left" onClick={() => n.link && router.push(n.link)}>
                <p className="text-sm">{n.message}</p><p className="mt-0.5 text-xs text-muted">{timeAgo(n.created_at)}</p>
              </button>
              {!n.is_read && <Button size="sm" variant="outline" onClick={() => read.mutate(n.id)} data-testid="mark-read">Mark read</Button>}
            </li>
          );
        })}
      </ul>
      {q.data && q.data.total > q.data.page_size && (
        <div className="mt-4 flex items-center justify-center gap-3 text-sm">
          <Button size="sm" variant="outline" disabled={page === 1} onClick={() => setPage(page - 1)}>Previous</Button>
          <span>Page {page}</span>
          <Button size="sm" variant="outline" disabled={page * q.data.page_size >= q.data.total} onClick={() => setPage(page + 1)}>Next</Button>
        </div>
      )}
    </div>
  );
}
export default function NotificationsPage() { return <Gate><Inner /></Gate>; }
