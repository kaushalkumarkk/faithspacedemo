import { Headphones } from "lucide-react";
import { mediaSrc } from "@/lib/api";

export function Cover({ url, title, className = "h-40 w-full" }: { url: string | null; title: string; className?: string }) {
  return url ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={mediaSrc(url)} alt={`${title} cover`} className={`${className} rounded-xl object-cover`} />
  ) : (
    <div aria-hidden className={`${className} grid place-items-center rounded-xl bg-gradient-to-br from-brand/80 to-accent/80 text-white`}><Headphones className="h-8 w-8" /></div>
  );
}
