"use client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Check, CheckCheck, Search, Send } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Gate } from "@/components/gate";
import { Avatar, Button, EmptyState, ErrorState, Input, PageHeader, Skeleton } from "@/components/ui";
import { api, type Conversation, type Message, type User } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { cn, formatDateTime, timeAgo } from "@/lib/utils";

function NewChat({ onPick }: { onPick: (u: User) => void }) {
  const [q, setQ] = useState("");
  const [dq, setDq] = useState("");
  useEffect(() => { const t = setTimeout(() => setDq(q), 250); return () => clearTimeout(t); }, [q]);
  const res = useQuery({ queryKey: ["user-search", dq], queryFn: () => api<User[]>(`/users/search?q=${encodeURIComponent(dq)}`), enabled: dq.trim().length >= 2 });
  return (
    <div className="relative border-b border-line p-3">
      <Search className="absolute left-6 top-6 h-4 w-4 text-muted" aria-hidden />
      <Input type="search" aria-label="Find people to message" placeholder="Find someone to message…" className="pl-9" value={q} onChange={(e) => setQ(e.target.value)} data-testid="msg-search" />
      {dq.trim().length >= 2 && (
        <ul className="absolute inset-x-3 top-14 z-10 overflow-hidden rounded-xl border border-line bg-surface shadow-lg">
          {res.isLoading && <li className="p-3 text-sm text-muted">Searching…</li>}
          {res.data?.length === 0 && <li className="p-3 text-sm text-muted">No one found.</li>}
          {res.data?.map((u) => (
            <li key={u.id}>
              <button className="flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-elevated" onClick={() => { setQ(""); setDq(""); onPick(u); }} data-testid="msg-search-result">
                <Avatar name={u.display_name} url={u.avatar_url} size={28} /><span className="text-sm font-medium">{u.display_name}</span><span className="ml-auto text-xs capitalize text-muted">{u.role}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function Thread({ other, onBack }: { other: User; onBack: () => void }) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [text, setText] = useState("");
  const bottom = useRef<HTMLDivElement>(null);
  const q = useQuery({ queryKey: ["thread", other.id], queryFn: () => api<Message[]>(`/messages/with/${other.id}`), refetchInterval: 4000 });
  const send = useMutation({
    mutationFn: () => api<Message>(`/messages/with/${other.id}`, { method: "POST", json: { body: text.trim() } }),
    onSuccess: () => { setText(""); qc.invalidateQueries({ queryKey: ["thread", other.id] }); qc.invalidateQueries({ queryKey: ["conversations"] }); },
    onError: (e) => toast.error((e as Error).message),
  });
  // reading a thread marks it read on the server; refresh the badges
  useEffect(() => { if (q.data) { qc.invalidateQueries({ queryKey: ["msg-unread"] }); qc.invalidateQueries({ queryKey: ["conversations"] }); } }, [q.dataUpdatedAt]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { bottom.current?.scrollIntoView({ block: "end" }); }, [q.data?.length]);

  const lastMine = q.data ? [...q.data].reverse().find((m) => m.sender_id === user?.id)?.id : undefined;
  const submit = () => { if (text.trim() && !send.isPending) send.mutate(); };

  return (
    <section className="flex h-full min-h-0 flex-col" aria-label={`Conversation with ${other.display_name}`}>
      <header className="flex items-center gap-3 border-b border-line p-3">
        <Button variant="ghost" size="icon" className="lg:hidden" aria-label="Back to conversations" onClick={onBack}><ArrowLeft className="h-5 w-5" /></Button>
        <Avatar name={other.display_name} url={other.avatar_url} size={36} />
        <div><p className="font-medium leading-tight" data-testid="thread-name">{other.display_name}</p><p className="text-xs capitalize text-muted">{other.role}</p></div>
      </header>
      <div className="min-h-0 flex-1 space-y-2 overflow-y-auto p-4" data-testid="thread">
        {q.isLoading && <Skeleton className="h-12" />}
        {q.isError && <ErrorState error={q.error} retry={() => q.refetch()} />}
        {q.data?.length === 0 && <p className="py-10 text-center text-sm text-muted">No messages yet. Say hello 👋</p>}
        {q.data?.map((m) => {
          const mine = m.sender_id === user?.id;
          return (
            <div key={m.id} className={cn("flex flex-col", mine ? "items-end" : "items-start")}>
              <div title={formatDateTime(m.created_at)} data-testid="message" className={cn("max-w-[80%] whitespace-pre-wrap break-words rounded-2xl px-3.5 py-2 text-sm", mine ? "rounded-br-md bg-brand text-brand-fg" : "rounded-bl-md bg-elevated")}>{m.body}</div>
              <span className="mt-0.5 flex items-center gap-1 text-[10px] text-muted">
                {timeAgo(m.created_at)}
                {mine && m.id === lastMine && (m.read_at ? <span className="flex items-center gap-0.5 text-success" data-testid="seen"><CheckCheck className="h-3 w-3" />Seen</span> : <span className="flex items-center gap-0.5"><Check className="h-3 w-3" />Sent</span>)}
              </span>
            </div>
          );
        })}
        <div ref={bottom} />
      </div>
      <form onSubmit={(e) => { e.preventDefault(); submit(); }} className="flex items-end gap-2 border-t border-line p-3">
        <textarea aria-label="Write a message" rows={1} maxLength={2000} value={text} onChange={(e) => setText(e.target.value)} placeholder="Write a message…"
          onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); submit(); } }}
          className="max-h-32 min-h-10 flex-1 resize-none rounded-xl border border-line bg-bg px-3 py-2 text-sm" data-testid="msg-input" />
        <Button type="submit" size="icon" aria-label="Send message" loading={send.isPending} disabled={!text.trim()} data-testid="msg-send"><Send className="h-4 w-4" /></Button>
      </form>
    </section>
  );
}

function Inbox() {
  const router = useRouter();
  const params = useSearchParams();
  const selected = Number(params.get("u")) || null;
  const convos = useQuery({ queryKey: ["conversations"], queryFn: () => api<Conversation[]>("/messages/conversations"), refetchInterval: 6000 });
  const picked = useQuery({ queryKey: ["user", String(selected)], queryFn: () => api<User>(`/users/${selected}`), enabled: !!selected });
  const other = picked.data;
  const open = (id: number) => router.push(`/messages?u=${id}`);

  return (
    <>
      <PageHeader title="Messages" subtitle="Private one-to-one conversations. Updates every few seconds." />
      <div className="grid h-[calc(100dvh-15rem)] min-h-[420px] overflow-hidden rounded-2xl border border-line bg-surface lg:grid-cols-[320px_1fr] lg:h-[calc(100dvh-12rem)]">
        <aside className={cn("flex min-h-0 flex-col border-line lg:border-r", selected ? "hidden lg:flex" : "flex")}>
          <NewChat onPick={(u) => open(u.id)} />
          <div className="min-h-0 flex-1 overflow-y-auto">
            {convos.isLoading && <div className="space-y-2 p-3">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-14" />)}</div>}
            {convos.isError && <div className="p-3"><ErrorState error={convos.error} retry={() => convos.refetch()} /></div>}
            {convos.data?.length === 0 && <div className="p-4"><EmptyState title="No conversations yet" body="Search for someone above, or tap Message on a profile." /></div>}
            {convos.data?.map((c) => (
              <button key={c.user.id} onClick={() => open(c.user.id)} data-testid="conversation" aria-current={selected === c.user.id}
                className={cn("flex w-full items-center gap-3 border-b border-line/60 px-3 py-3 text-left hover:bg-elevated", selected === c.user.id && "bg-brand/10")}>
                <Avatar name={c.user.display_name} url={c.user.avatar_url} size={40} />
                <span className="min-w-0 flex-1">
                  <span className="flex items-baseline justify-between gap-2"><span className="truncate text-sm font-medium">{c.user.display_name}</span><span className="shrink-0 text-[10px] text-muted">{timeAgo(c.last_at)}</span></span>
                  <span className={cn("block truncate text-xs", c.unread_count ? "font-semibold text-fg" : "text-muted")}>{c.last_message}</span>
                </span>
                {c.unread_count > 0 && <span data-testid="conv-unread" className="grid h-5 min-w-5 place-items-center rounded-full bg-brand px-1.5 text-[11px] font-bold text-brand-fg">{c.unread_count}</span>}
              </button>
            ))}
          </div>
        </aside>
        <div className={cn("min-h-0", selected ? "block" : "hidden lg:block")}>
          {other ? <Thread key={other.id} other={other} onBack={() => router.push("/messages")} />
            : selected && picked.isLoading ? <Skeleton className="m-4 h-24" />
            : selected && picked.isError ? <div className="p-6"><ErrorState error={picked.error} /></div>
            : <div className="grid h-full place-items-center p-6"><EmptyState title="Select a conversation" body="Pick someone from the list, or search for a person to start a new chat." /></div>}
        </div>
      </div>
    </>
  );
}

export default function MessagesPage() {
  return <Gate><Suspense fallback={<Skeleton className="h-96" />}><Inbox /></Suspense></Gate>;
}
