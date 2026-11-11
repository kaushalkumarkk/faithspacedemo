"use client";
import Link from "next/link";
import { ShieldAlert } from "lucide-react";
import { useAuth } from "@/lib/auth";
import type { Role } from "@/lib/api";
import { Button, Skeleton } from "./ui";

/** Client-side guard for UX only — the API enforces the real permissions. */
export function Gate({ roles, children, members }: { roles?: Role[]; children: React.ReactNode; members?: boolean }) {
  const { user, loading } = useAuth();
  if (loading) return <div className="space-y-3"><Skeleton className="h-10 w-1/3" /><Skeleton className="h-64" /></div>;
  if (!user)
    return (
      <div className="mx-auto flex max-w-md flex-col items-center gap-3 py-20 text-center">
        <ShieldAlert className="h-8 w-8 text-muted" aria-hidden />
        <h2 className="font-display text-2xl">Please log in</h2>
        <p className="text-sm text-muted">You need an account to see this page.</p>
        <Link href="/login"><Button>Log in</Button></Link>
      </div>
    );
  if (members && user.is_guest)
    return (
      <div className="mx-auto flex max-w-md flex-col items-center gap-3 py-20 text-center" data-testid="guest-locked">
        <ShieldAlert className="h-8 w-8 text-accent" aria-hidden />
        <h2 className="font-display text-2xl">Create a free account</h2>
        <p className="text-sm text-muted">Guests can watch, like, comment and save videos. Messaging needs a full account.</p>
        <Link href="/register"><Button>Create account</Button></Link>
      </div>
    );
  if (roles && !roles.includes(user.role))
    return (
      <div className="mx-auto flex max-w-md flex-col items-center gap-3 py-20 text-center" data-testid="forbidden">
        <ShieldAlert className="h-8 w-8 text-danger" aria-hidden />
        <h2 className="font-display text-2xl">Not permitted</h2>
        <p className="text-sm text-muted">Your role (<b>{user.role}</b>) cannot access this page. Required: {roles.join(" or ")}.</p>
        <Link href="/"><Button variant="outline">Back to feed</Button></Link>
      </div>
    );
  return <>{children}</>;
}
