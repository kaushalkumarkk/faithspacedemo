"use client";
import { AlertCircle, Inbox, Loader2 } from "lucide-react";
import * as React from "react";
import { mediaSrc, type Status } from "@/lib/api";
import { cn, initials } from "@/lib/utils";

/* shadcn/ui-style primitives (hand-written, same API conventions: variant/size props, cn() merging). */

type BtnProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "ghost" | "danger" | "outline";
  size?: "sm" | "md" | "lg" | "icon";
  loading?: boolean;
};
export const Button = React.forwardRef<HTMLButtonElement, BtnProps>(function Button(
  { className, variant = "primary", size = "md", loading, children, disabled, ...p }, ref,
) {
  const v = {
    primary: "bg-brand text-brand-fg hover:brightness-110 shadow-sm",
    secondary: "bg-elevated text-fg hover:bg-line",
    ghost: "hover:bg-elevated text-fg",
    danger: "bg-danger text-white hover:brightness-110",
    outline: "border border-line hover:bg-elevated text-fg",
  }[variant];
  const s = { sm: "h-8 px-3 text-sm", md: "h-10 px-4 text-sm", lg: "h-12 px-6 text-base", icon: "h-10 w-10" }[size];
  return (
    <button
      ref={ref}
      disabled={disabled || loading}
      className={cn("inline-flex items-center justify-center gap-2 rounded-xl font-medium transition active:scale-[.98] disabled:opacity-50 disabled:pointer-events-none", v, s, className)}
      {...p}
    >
      {loading && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
      {children}
    </button>
  );
});

const fieldBase = "w-full rounded-xl border border-line bg-surface px-3 text-sm placeholder:text-muted/70 focus-visible:border-brand disabled:opacity-60";
export const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(function Input({ className, ...p }, ref) {
  return <input ref={ref} className={cn(fieldBase, "h-10", className)} {...p} />;
});
export const Textarea = React.forwardRef<HTMLTextAreaElement, React.TextareaHTMLAttributes<HTMLTextAreaElement>>(function Textarea({ className, ...p }, ref) {
  return <textarea ref={ref} className={cn(fieldBase, "py-2 min-h-[88px]", className)} {...p} />;
});
export const Select = React.forwardRef<HTMLSelectElement, React.SelectHTMLAttributes<HTMLSelectElement>>(function Select({ className, ...p }, ref) {
  return <select ref={ref} className={cn(fieldBase, "h-10", className)} {...p} />;
});

export function Field({ label, error, hint, children }: { label: string; error?: string; hint?: string; children: React.ReactNode }) {
  const id = React.useId();
  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="text-sm font-medium">{label}</label>
      {React.isValidElement(children) ? React.cloneElement(children as React.ReactElement<any>, { id, "aria-invalid": !!error, "aria-describedby": error ? id + "-e" : undefined }) : children}
      {hint && !error && <p className="text-xs text-muted">{hint}</p>}
      {error && <p id={id + "-e"} role="alert" className="text-xs text-danger">{error}</p>}
    </div>
  );
}

export const Card = ({ className, ...p }: React.HTMLAttributes<HTMLDivElement>) => (
  <div className={cn("rounded-2xl border border-line bg-surface", className)} {...p} />
);

export const Skeleton = ({ className }: { className?: string }) => <div aria-hidden className={cn("skeleton rounded-xl", className)} />;

const statusStyle: Record<string, string> = {
  pending: "bg-warn/15 text-warn", approved: "bg-success/15 text-success", rejected: "bg-danger/15 text-danger",
  hidden: "bg-muted/15 text-muted", open: "bg-warn/15 text-warn", resolved: "bg-success/15 text-success", dismissed: "bg-muted/15 text-muted",
};
export const StatusBadge = ({ status }: { status: Status | string }) => (
  <span className={cn("inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium capitalize", statusStyle[status] ?? "bg-elevated")}>{status}</span>
);
export const Badge = ({ className, ...p }: React.HTMLAttributes<HTMLSpanElement>) => (
  <span className={cn("inline-flex items-center rounded-full bg-elevated px-2.5 py-0.5 text-xs font-medium text-muted", className)} {...p} />
);

export function Avatar({ name, url, size = 36 }: { name: string; url?: string | null; size?: number }) {
  return url ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={mediaSrc(url)} alt="" width={size} height={size} style={{ width: size, height: size }} className="rounded-full object-cover bg-elevated" />
  ) : (
    <span aria-hidden style={{ width: size, height: size, fontSize: size * 0.38 }}
      className="inline-flex shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-brand to-accent font-semibold text-white">
      {initials(name)}
    </span>
  );
}

export function EmptyState({ title, body, action }: { title: string; body?: string; action?: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-line px-6 py-14 text-center">
      <Inbox className="h-8 w-8 text-muted" aria-hidden />
      <p className="font-medium">{title}</p>
      {body && <p className="max-w-sm text-sm text-muted">{body}</p>}
      {action}
    </div>
  );
}

export function ErrorState({ error, retry }: { error: unknown; retry?: () => void }) {
  return (
    <div role="alert" className="flex flex-col items-center gap-3 rounded-2xl border border-danger/30 bg-danger/5 px-6 py-10 text-center">
      <AlertCircle className="h-7 w-7 text-danger" aria-hidden />
      <p className="text-sm">{error instanceof Error ? error.message : "Something went wrong."}</p>
      {retry && <Button variant="outline" size="sm" onClick={retry}>Try again</Button>}
    </div>
  );
}

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: string; actions?: React.ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="font-display text-3xl font-semibold tracking-tight">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-muted">{subtitle}</p>}
      </div>
      {actions}
    </div>
  );
}

export function Modal({ open, onClose, title, children }: { open: boolean; onClose: () => void; title: string; children: React.ReactNode }) {
  React.useEffect(() => {
    if (!open) return;
    const h = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", h);
    return () => document.removeEventListener("keydown", h);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[90] grid place-items-center bg-black/60 p-4" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div role="dialog" aria-modal="true" aria-label={title} className="w-full max-w-md animate-fade-up rounded-2xl border border-line bg-surface p-5 shadow-2xl">
        <h2 className="mb-3 font-display text-xl font-semibold">{title}</h2>
        {children}
      </div>
    </div>
  );
}
