"use client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Avatar, Button, ErrorState, Input, PageHeader, Select, Skeleton } from "@/components/ui";
import { api, type Page, type User } from "@/lib/api";
import { useAuth } from "@/lib/auth";

export default function AdminUsers() {
  const { user: me } = useAuth();
  const qc = useQueryClient();
  const [q, setQ] = useState("");
  const [dq, setDq] = useState("");
  const [role, setRole] = useState("");
  const [page, setPage] = useState(1);
  useEffect(() => { const t = setTimeout(() => { setDq(q); setPage(1); }, 250); return () => clearTimeout(t); }, [q]);
  const users = useQuery({ queryKey: ["admin-users", dq, role, page], queryFn: () => api<Page<User>>(`/users?q=${encodeURIComponent(dq)}&role=${role}&page=${page}&page_size=15`) });
  const toggle = useMutation({
    mutationFn: (u: User) => api(`/users/${u.id}/status`, { method: "PATCH", json: { is_active: !u.is_active } }),
    onSuccess: () => { toast.success("User updated"); qc.invalidateQueries({ queryKey: ["admin-users"] }); },
    onError: (e) => toast.error((e as Error).message),
  });
  return (
    <>
      <PageHeader title="Users" subtitle="Suspended users cannot log in or use their existing token." />
      <div className="mb-4 flex flex-col gap-2 sm:flex-row">
        <Input type="search" aria-label="Search users" placeholder="Search name or email…" value={q} onChange={(e) => setQ(e.target.value)} />
        <Select aria-label="Role" className="sm:w-40" value={role} onChange={(e) => { setRole(e.target.value); setPage(1); }}>
          <option value="">All roles</option><option>viewer</option><option>creator</option><option>admin</option>
        </Select>
      </div>
      {users.isLoading && <Skeleton className="h-64" />}
      {users.isError && <ErrorState error={users.error} retry={() => users.refetch()} />}
      {users.data && (
        <div className="overflow-x-auto rounded-2xl border border-line bg-surface">
          <table className="w-full text-sm">
            <thead className="border-b border-line text-left text-xs text-muted"><tr><th className="p-3">User</th><th className="p-3">Role</th><th className="p-3">Status</th><th className="p-3 text-right">Action</th></tr></thead>
            <tbody>
              {users.data.items.map((u) => (
                <tr key={u.id} className="border-b border-line/60 last:border-0">
                  <td className="p-3"><div className="flex items-center gap-2"><Avatar name={u.display_name} url={u.avatar_url} size={28} /><div><p className="font-medium">{u.display_name}</p><p className="text-xs text-muted">{u.email}</p></div></div></td>
                  <td className="p-3 capitalize">{u.role}</td>
                  <td className="p-3">{u.is_active ? <span className="text-success">Active</span> : <span className="text-danger">Suspended</span>}</td>
                  <td className="p-3 text-right">{u.id !== me?.id && <Button size="sm" variant={u.is_active ? "outline" : "primary"} onClick={() => toggle.mutate(u)}>{u.is_active ? "Suspend" : "Reinstate"}</Button>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {users.data && users.data.total > 15 && (
        <div className="mt-4 flex items-center justify-center gap-3 text-sm">
          <Button size="sm" variant="outline" disabled={page === 1} onClick={() => setPage(page - 1)}>Previous</Button><span>Page {page}</span>
          <Button size="sm" variant="outline" disabled={page * 15 >= users.data.total} onClick={() => setPage(page + 1)}>Next</Button>
        </div>
      )}
    </>
  );
}
