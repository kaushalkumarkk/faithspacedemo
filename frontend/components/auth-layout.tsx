import { Headphones, PlaySquare, ShieldCheck, Sparkles } from "lucide-react";

const points = [
  { icon: PlaySquare, title: "Short videos", body: "Record or upload reflections, music and stories." },
  { icon: Headphones, title: "Podcasts", body: "Publish episodes and listen with full playback controls." },
  { icon: ShieldCheck, title: "Moderated community", body: "Every upload is reviewed before it goes live." },
];

/** Split-screen shell for /login and /register: brand panel (desktop) + form column. */
export function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid min-h-dvh lg:grid-cols-[1.1fr_1fr]">
      <aside className="relative hidden overflow-hidden bg-gradient-to-br from-[hsl(256_70%_38%)] via-[hsl(262_65%_30%)] to-[hsl(244_50%_14%)] p-12 text-white lg:flex lg:flex-col lg:justify-between">
        <div aria-hidden className="absolute -right-24 -top-24 h-96 w-96 rounded-full bg-accent/30 blur-3xl" />
        <div aria-hidden className="absolute -bottom-32 -left-20 h-96 w-96 rounded-full bg-brand/40 blur-3xl" />
        <div className="relative flex items-center gap-2 font-display text-2xl font-semibold">
          <span className="grid h-10 w-10 place-items-center rounded-xl bg-white/15 backdrop-blur"><Sparkles className="h-5 w-5" aria-hidden /></span>
          Faith Space
        </div>
        <div className="relative max-w-md space-y-8">
          <h1 className="font-display text-5xl font-semibold leading-tight">A space for every tradition — and none.</h1>
          <ul className="space-y-5">
            {points.map((p) => (
              <li key={p.title} className="flex gap-4">
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-white/12 ring-1 ring-white/20"><p.icon className="h-5 w-5" aria-hidden /></span>
                <span><b className="block">{p.title}</b><span className="text-sm text-white/75">{p.body}</span></span>
              </li>
            ))}
          </ul>
        </div>
        <p className="relative text-xs text-white/60">Faith Space — Technical Proof of Concept · built by DevNexa</p>
      </aside>
      <div className="flex items-center justify-center bg-bg p-5 sm:p-10">
        <div className="w-full max-w-md animate-fade-up space-y-6">
          <div className="flex items-center gap-2 font-display text-2xl font-semibold lg:hidden">
            <span className="grid h-9 w-9 place-items-center rounded-xl bg-gradient-to-br from-brand to-accent text-white"><Sparkles className="h-4 w-4" aria-hidden /></span>
            Faith Space
          </div>
          {children}
        </div>
      </div>
    </div>
  );
}
