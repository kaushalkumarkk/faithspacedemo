"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Gate } from "@/components/gate";
import { cn } from "@/lib/utils";

const tabs = [
  ["/admin", "Overview"], ["/admin/users", "Users"], ["/admin/videos", "Videos"], ["/admin/podcasts", "Podcasts"],
  ["/admin/comments", "Comments"], ["/admin/reports", "Reports"], ["/admin/history", "Moderation history"],
];

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const path = usePathname();
  return (
    <Gate roles={["admin"]}>
      <nav aria-label="Admin sections" className="hide-scrollbar -mx-4 mb-6 flex gap-1 overflow-x-auto border-b border-line px-4">
        {tabs.map(([href, label]) => (
          <Link key={href} href={href} aria-current={path === href ? "page" : undefined}
            className={cn("whitespace-nowrap border-b-2 px-3 py-2.5 text-sm font-medium", path === href ? "border-brand text-brand" : "border-transparent text-muted hover:text-fg")}>{label}</Link>
        ))}
      </nav>
      {children}
    </Gate>
  );
}
