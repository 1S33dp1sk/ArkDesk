// src/ui/ProgressSheet.tsx
import React from "react";
import Portal from "./Portal";

export type ProgressSheetProps = {
  open: boolean;
  title?: string;
  subtitle?: string;
  progress?: number; // 0..100, if undefined → indeterminate
  details?: React.ReactNode;
  cancelText?: string;
  onCancel?: () => void;
};

export default function ProgressSheet(props: ProgressSheetProps) {
  const { open, title, subtitle, progress, details, cancelText = "Cancel", onCancel } = props;
  if (!open) return null;

  const pct = Math.max(0, Math.min(100, progress ?? 0));

  return (
    <Portal>
      <div className="fixed inset-0 z-[1000] pointer-events-none">
        <div className="absolute inset-0 bg-black/30" />
        <div className="absolute bottom-0 left-0 right-0 grid place-items-center p-4">
          <div className="pointer-events-auto glass border border-border rounded-t-md w-[min(720px,96vw)]">
            <div className="px-4 pt-4">
              <div className="text-sm">{title ?? "Working…"}</div>
              {subtitle && <div className="text-[12px] text-muted mt-0.5">{subtitle}</div>}
              <div className="mt-3 relative h-2 w-full overflow-hidden rounded-md bg-white/10">
                {progress == null ? (
                  <div className="absolute inset-y-0 left-0 w-1/3 bg-white/30 rounded-md animate-shimmer" />
                ) : (
                  <div className="h-full bg-white/40" style={{ width: `${pct}%` }} />
                )}
              </div>
              {details && <div className="mt-3 text-[12px] text-muted">{details}</div>}
            </div>
            <div className="px-4 py-3 border-t border-border flex items-center justify-end">
              {onCancel && (
                <button className="btn px-3 py-1.5 text-sm" onClick={onCancel}>
                  {cancelText}
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </Portal>
  );
}
