"use client";
import { UploadCloud } from "lucide-react";
import { useRef, useState } from "react";
import { cn } from "@/lib/utils";

export function FileDrop({ accept, label, hint, onFile, disabled, testId }: {
  accept: string; label: string; hint: string; onFile: (f: File) => void; disabled?: boolean; testId?: string;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  return (
    <div
      onDragOver={(e) => { e.preventDefault(); setOver(true); }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => { e.preventDefault(); setOver(false); const f = e.dataTransfer.files?.[0]; if (f && !disabled) onFile(f); }}
      className={cn("flex flex-col items-center gap-2 rounded-2xl border-2 border-dashed border-line p-8 text-center transition", over && "border-brand bg-brand/5", disabled && "opacity-50")}
    >
      <UploadCloud className="h-8 w-8 text-muted" aria-hidden />
      <p className="font-medium">{label}</p>
      <p className="text-xs text-muted">{hint}</p>
      <button type="button" disabled={disabled} onClick={() => input.current?.click()} className="mt-1 rounded-xl bg-elevated px-4 py-2 text-sm font-medium hover:bg-line">Choose file</button>
      <input ref={input} type="file" accept={accept} className="sr-only" data-testid={testId} aria-label={label} tabIndex={-1}
        onChange={(e) => { const f = e.target.files?.[0]; if (f) onFile(f); e.target.value = ""; }} />
    </div>
  );
}

export function ProgressBar({ pct, label }: { pct: number; label: string }) {
  return (
    <div role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct} className="space-y-1" data-testid="upload-progress">
      <div className="flex justify-between text-xs text-muted"><span>{label}</span><span>{pct}%</span></div>
      <div className="h-2 overflow-hidden rounded-full bg-elevated"><div className="h-full rounded-full bg-brand transition-all" style={{ width: `${pct}%` }} /></div>
    </div>
  );
}
