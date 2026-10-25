"use client";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Card, EmptyState, ErrorState, PageHeader, Skeleton, StatusBadge } from "@/components/ui";
import { api, type AuditLog, type ModAction, type Page } from "@/lib/api";
import { cn, timeAgo } from "@/lib/utils";

const tone: Record<string, string> = { approve: "approved", restore: "approved", reject: "rejected", hide: "hidden", delete: "rejected" };

export default function AdminHistory() {
  const [tab, setTab] = useState<"moderation" | "audit">("moderation");
  const hist = useQuery({ queryKey: ["mod-history"], queryFn: () => api<Page<ModAction>>("/admin/moderation/history?page_size=50"), refetchInterval: 10000 });
  const audit = useQuery({ queryKey: ["audit"], queryFn: () => api<Page<AuditLog>>("/admin/audit-logs?page_size=50"), enabled: tab === "audit" });
  return (
    <>
      <PageHeader title="Moderation history" subtitle="Every moderation decision and system event, newest first." />
      <div className="mb-4 inline-flex rounded-xl bg-elevated p-1" role="tablist">
        {(["moderation", "audit"] as const).map((t) => (
          <button key={t} role="tab" aria-selected={tab === t} onClick={() => setTab(t)} className={cn("rounded-lg px-4 py-1.5 text-sm font-medium", tab === t && "bg-surface shadow-sm")}>
            {t === "moderation" ? "Moderation actions" : "Audit log"}
          </button>
        ))}
      </div>
      {tab === "moderation" ? (
        <>
          {hist.isLoading && <Skeleton className="h-40" />}
          {hist.isError && <ErrorState error={hist.error} retry={() => hist.refetch()} />}
          {hist.data?.items.length === 0 && <EmptyState title="No moderation actions yet" />}
          <div className="space-y-2">
            {hist.data?.items.map((a) => (
              <Card key={a.id} className="flex flex-wrap items-center gap-3 p-4" data-testid="history-row">
                <StatusBadge status={tone[a.action] ?? "pending"} />
                <span className="text-sm font-semibold uppercase">{a.action}</span>
                <div className="min-w-0 basis-full sm:basis-0 sm:flex-1">
                  <p className="break-words text-sm"><span className="text-muted">{a.target_type}</span> “{a.target_title}”</p>
                  {a.reason && <p className="text-xs text-muted">Reason: {a.reason}</p>}
                </div>
                <p className="text-xs text-muted">{a.admin.display_name} · {timeAgo(a.created_at)}</p>
              </Card>
            ))}
          </div>
        </>
      ) : (
        <>
          {audit.isLoading && <Skeleton className="h-40" />}
          {audit.isError && <ErrorState error={audit.error} retry={() => audit.refetch()} />}
          <div className="overflow-x-auto rounded-2xl border border-line bg-surface">
            <table className="w-full text-sm">
              <thead className="border-b border-line text-left text-xs text-muted"><tr><th className="p-3">When</th><th className="p-3">Actor</th><th className="p-3">Action</th><th className="p-3">Entity</th></tr></thead>
              <tbody>
                {audit.data?.items.map((a) => (
                  <tr key={a.id} className="border-b border-line/60 last:border-0" data-testid="audit-row">
                    <td className="whitespace-nowrap p-3 text-muted">{timeAgo(a.created_at)}</td>
                    <td className="p-3">{a.actor?.display_name ?? "system"}</td>
                    <td className="p-3 font-mono text-xs">{a.action}</td>
                    <td className="p-3">{a.entity_type} #{a.entity_id}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </>
  );
}
