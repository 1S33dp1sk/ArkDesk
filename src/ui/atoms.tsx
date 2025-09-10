// src/ui/atoms.tsx
import React from "react";

export const Input = (p: React.InputHTMLAttributes<HTMLInputElement>) => (
  <input
    {...p}
    className={[
      "w-full rounded-md border bg-white/5 text-white placeholder-white/40",
      "border-border focus:outline-none focus:ring-1 focus:ring-primary/50",
      "px-3 py-2 text-[14px]"
    ].join(" ")}
  />
);

export const Btn = ({ className = "", ...rest }: React.ButtonHTMLAttributes<HTMLButtonElement>) => (
  <button
    {...rest}
    className={[
      "px-3 py-2 rounded-md border border-border bg-white/5 hover:bg-white/10",
      "text-[13px] tracking-wide disabled:opacity-60 disabled:pointer-events-none",
      className
    ].join(" ")}
  />
);

export const Chip = ({ ok, label, title }: { ok: boolean; label: string; title?: string }) => (
  <span
    title={title}
    className={[
      "inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] border",
      ok
        ? "bg-emerald-500/10 text-emerald-300 border-emerald-500/30"
        : "bg-rose-500/10 text-rose-300 border-rose-500/30",
    ].join(" ")}
  >
    <span className={["inline-block h-1.5 w-1.5 rounded-full", ok ? "bg-emerald-400" : "bg-rose-400"].join(" ")} />
    {label}
  </span>
);

export const Light = ({ on, label }: { on: boolean; label: string }) => (
  <div className="flex items-center gap-2">
    <span className={["h-2.5 w-2.5 rounded-full", on ? "bg-emerald-400" : "bg-rose-400"].join(" ")} aria-hidden />
    <span className="text-[12px] text-white/70">{label}</span>
  </div>
);

export const Field = ({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) => (
  <div className="space-y-1.5">
    <label className="block text-sm font-medium text-white/90">{label}</label>
    {children}
    {hint ? <p className="text-[12px] text-white/50">{hint}</p> : null}
  </div>
);

// IEC bytes formatter
export function formatBytes(input: number, base: 1000 | 1024 = 1024): string {
  if (!Number.isFinite(input)) return "0 B";
  const units = base === 1024
    ? ["B", "KiB", "MiB", "GiB", "TiB", "PiB", "EiB"]
    : ["B", "KB", "MB", "GB", "TB", "PB", "EB"];
  let n = Math.abs(input), i = 0;
  while (n >= base && i < units.length - 1) { n /= base; i++; }
  const fd = i === 0 ? 0 : 1;
  const val = input < 0 ? -n : n;
  return `${new Intl.NumberFormat(undefined, { minimumFractionDigits: fd, maximumFractionDigits: fd }).format(val)} ${units[i]}`;
}
