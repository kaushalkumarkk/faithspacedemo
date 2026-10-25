"use client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Bell, GitBranch, Headphones, LayoutDashboard, LogIn, LogOut, Moon, PlaySquare, PlusSquare, Sparkles, Sun, UserRound, Video,
} from "lucide-react";
import { useTheme } from "next-themes";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { api, type Notification, type Page } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { cn, timeAgo } from "@/lib/utils";
import { Avatar, Button } from "./ui";

export function Logo({ className }: { className?: string }) {
  return (
    <Link href="/" className={cn("flex items-center gap-2 font-display text-xl font-semibold", className)}>
      <span className="grid h-8 w-8 place-items-center rounded-xl bg-gradient-to-br from-brand to-accent text-white"><Sparkles className="h-4 w-4" aria-hidden /></span>
      Faith Space
    </Link>
  );
}

function useNav() {
  const { user } = useAuth();
  const items = [
    { href: "/", label: "Watch", icon: PlaySquare, mobile: true },
    { href: "/podcasts", label: "Podcasts", icon: Headphones, mobile: true },
  ];
  if (user && user.role !== "viewer") {
    items.push({ href: "/upload", label: "Create", icon: PlusSquare, mobile: true });
    items.push({ href: "/studio", label: "My studio", icon: Video, mobile: false });
  }
  if (user) items.push({ href: "/notifications", label: "Notifications", icon: Bell, mobile: true });
  if (user?.role === "admin") items.push({ href: "/admin", label: "Admin", icon: LayoutDashboard, mobile: true });
  return items;
}

const isActive = (path: string, href: string) => (href === "/" ? path === "/" : path.startsWith(href));

function NotificationBell() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const router = useRouter();
  const count = useQuery({ queryKey: ["unread"], queryFn: () => api<{ count: number }>("/notifications/unread-count"), refetchInterval: 8000, enabled: !!user });
  const list = useQuery({
    queryKey: ["notifications", "recent"], queryFn: () => api<Page<Notification>>("/notifications?page_size=6"), enabled: !!user && open,
  });
  const read = useMutation({
    mutationFn: (id: number) => api(`/notifications/${id}/read`, { method: "POST" }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["unread"] }); qc.invalidateQueries({ queryKey: ["notifications"] }); },
  });
  useEffect(() => {
    const h = (e: MouseEvent) => ref.current && !ref.current.contains(e.target as Node) && setOpen(false);
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);
  if (!user) return null;
  const n = count.data?.count ?? 0;
  return (
    <div className="relative" ref={ref}>
      <Button variant="ghost" size="icon" aria-label={`Notifications${n ? `, ${n} unread` : ""}`} aria-expanded={open} onClick={() => setOpen((o) => !o)} data-testid="bell">
        <Bell className="h-5 w-5" />
        {n > 0 && (
          <span data-testid="unread-count" className="absolute right-1 top-1 grid h-4 min-w-4 place-items-center rounded-full bg-danger px-1 text-[10px] font-bold text-white">{n > 9 ? "9+" : n}</span>
        )}
      </Button>
      {open && (
        <div role="dialog" aria-label="Notifications" className="absolute right-0 z-50 mt-2 w-[min(22rem,calc(100vw-2rem))] animate-fade-up overflow-hidden rounded-2xl border border-line bg-surface shadow-xl">
          <div className="flex items-center justify-between border-b border-line px-4 py-3">
            <span className="font-medium">Notifications</span>
            <Link href="/notifications" onClick={() => setOpen(false)} className="text-sm text-brand">View all</Link>
          </div>
          <ul className="max-h-80 overflow-y-auto">
            {list.isLoading && <li className="p-4 text-sm text-muted">Loading…</li>}
            {list.data?.items.length === 0 && <li className="p-6 text-center text-sm text-muted">Nothing yet.</li>}
            {list.data?.items.map((x) => (
              <li key={x.id}>
                <button
                  className={cn("w-full border-b border-line/60 px-4 py-3 text-left text-sm hover:bg-elevated", !x.is_read && "bg-brand/5")}
                  onClick={() => { if (!x.is_read) read.mutate(x.id); setOpen(false); if (x.link) router.push(x.link); }}
                >
                  <span className="flex items-start gap-2">
                    {!x.is_read && <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-brand" aria-label="unread" />}
                    <span><span className="block">{x.message}</span><span className="text-xs text-muted">{timeAgo(x.created_at)}</span></span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  return (
    <Button variant="ghost" size="icon" aria-label="Toggle theme" onClick={() => setTheme(resolvedTheme === "dark" ? "light" : "dark")}>
      {mounted && resolvedTheme === "light" ? <Moon className="h-5 w-5" /> : <Sun className="h-5 w-5" />}
    </Button>
  );
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const path = usePathname();
  const nav = useNav();
  const { user, logout } = useAuth();
  const router = useRouter();
  const bare = path === "/login" || path === "/register";
  const immersive = path === "/";
  const { loading } = useAuth();

  // Login-first: everything except /login and /register requires a session.
  useEffect(() => {
    if (loading) return;
    if (!user && !bare) router.replace("/login");
    if (user && bare) router.replace(user.role === "admin" ? "/admin" : user.role === "creator" ? "/upload" : "/");
  }, [loading, user, bare, router]);

  if (bare && (loading || !user)) return <>{children}</>;
  if (loading || !user)
    return (
      <div className="grid min-h-dvh place-items-center bg-bg" role="status" aria-label="Loading">
        <Logo className="animate-pulse text-2xl" />
      </div>
    );
  if (bare) return null; // redirecting away from /login

  return (
    <div className="min-h-dvh lg:pl-64">
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-2 focus:top-2 focus:z-[100] focus:rounded-lg focus:bg-brand focus:px-3 focus:py-2 focus:text-brand-fg">Skip to content</a>
      {/* Desktop sidebar */}
      <aside className="fixed inset-y-0 left-0 hidden w-64 flex-col border-r border-line bg-surface p-4 lg:flex">
        <Logo className="px-2 py-2" />
        <nav aria-label="Main" className="mt-6 flex flex-1 flex-col gap-1">
          {nav.map((i) => (
            <Link key={i.href} href={i.href} aria-current={isActive(path, i.href) ? "page" : undefined}
              className={cn("flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition hover:bg-elevated", isActive(path, i.href) && "bg-brand/10 text-brand")}>
              <i.icon className="h-5 w-5" aria-hidden />{i.label}
            </Link>
          ))}
          <div className="my-3 border-t border-line" />
          <Link href="/architecture" className={cn("flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm hover:bg-elevated", path === "/architecture" && "bg-brand/10 text-brand")}><GitBranch className="h-5 w-5" aria-hidden />Architecture</Link>
        </nav>
        <div className="rounded-xl bg-accent/10 p-3 text-xs text-muted"><b className="text-accent">Technical Proof of Concept</b><br />Built by DevNexa for evaluation. Not a delivered production app.</div>
      </aside>

      <header className="sticky top-0 z-40 flex h-14 items-center gap-2 border-b border-line bg-bg/85 px-3 backdrop-blur lg:px-6">
        <Logo className="lg:hidden" />
        <span className="ml-1 hidden rounded-full bg-accent/15 px-3 py-1 text-xs font-medium text-accent sm:inline">Faith Space — Technical Proof of Concept</span>
        <div className="ml-auto flex items-center gap-1">
          <ThemeToggle />
          <NotificationBell />
          {user ? (
            <>
              <Link href={`/profile/${user.id}`} className="flex items-center gap-2 rounded-xl px-2 py-1 hover:bg-elevated" aria-label="My profile">
                <Avatar name={user.display_name} url={user.avatar_url} size={28} />
                <span className="hidden text-sm font-medium md:block">{user.display_name}<span className="ml-2 rounded-full bg-elevated px-2 py-0.5 text-[10px] uppercase text-muted" data-testid="role-badge">{user.role}</span></span>
              </Link>
              <Button variant="ghost" size="icon" aria-label="Log out" onClick={() => { logout(); router.push("/login"); }}><LogOut className="h-5 w-5" /></Button>
            </>
          ) : (
            <Link href="/login"><Button size="sm"><LogIn className="h-4 w-4" />Log in</Button></Link>
          )}
        </div>
      </header>

      <main id="main" className={cn(bare ? "" : immersive ? "pb-16 lg:pb-0" : "mx-auto max-w-6xl px-4 py-6 pb-28 lg:px-8 lg:pb-10")}>{children}</main>

      {/* Mobile bottom nav */}
      <nav aria-label="Primary mobile" className="fixed inset-x-0 bottom-0 z-40 flex border-t border-line bg-surface/95 pb-[env(safe-area-inset-bottom)] backdrop-blur lg:hidden">
        {nav.filter((i) => i.mobile).slice(0, 5).map((i) => (
          <Link key={i.href} href={i.href} aria-current={isActive(path, i.href) ? "page" : undefined}
            className={cn("flex flex-1 flex-col items-center gap-0.5 py-2 text-[11px]", isActive(path, i.href) ? "text-brand" : "text-muted")}>
            <i.icon className="h-5 w-5" aria-hidden />{i.label}
          </Link>
        ))}
        {!user && <Link href="/login" className="flex flex-1 flex-col items-center gap-0.5 py-2 text-[11px] text-muted"><UserRound className="h-5 w-5" aria-hidden />Log in</Link>}
      </nav>
    </div>
  );
}
