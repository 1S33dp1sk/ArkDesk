// src/ui/Toaster.tsx
import React, { createContext, useContext, useMemo, useRef, useState } from "react";
import Portal from "./Portal";

type Variant = "default" | "success" | "warn" | "danger";
type Toast = {
  id: number;
  title?: string;
  message: string;
  variant?: Variant;
  action?: { label: string; onClick: () => void };
  duration?: number; // ms
};

type Ctx = {
  toast: (t: Omit<Toast, "id">) => number;
  dismiss: (id: number) => void;
};
const ToastCtx = createContext<Ctx | null>(null);

export function useToast() {
  const ctx = useContext(ToastCtx);
  if (!ctx) throw new Error("useToast must be used within <ToasterProvider>");
  return ctx;
}

export function ToasterProvider({ children, max = 3 }: { children: React.ReactNode; max?: number }) {
  const [items, setItems] = useState<Toast[]>([]);
  const seq = useRef(1);

  const ctx = useMemo<Ctx>(() => ({
    toast: (t) => {
      const id = seq.current++;
      const item: Toast = { id, duration: 3500, variant: "default", ...t };
      setItems((xs) => {
        const next = [...xs, item];
        return next.length > max ? next.slice(next.length - max) : next;
      });
      if (item.duration && item.duration > 0) {
        window.setTimeout(() => {
          setItems((xs) => xs.filter((x) => x.id !== id));
        }, item.duration);
      }
      return id;
    },
    dismiss: (id) => setItems((xs) => xs.filter((x) => x.id !== id)),
  }), [max]);

  return (
    <ToastCtx.Provider value={ctx}>
      {children}
      <Portal>
        <ol className="fixed right-4 top-4 z-[1000] flex w-[min(420px,92vw)] flex-col gap-2">
          {items.map((t) => (
            <li key={t.id} className="glass border border-border rounded-md shadow-elev2 overflow-hidden">
              <div className="px-3 py-2.5 flex items-start gap-3">
                <Icon variant={t.variant ?? "default"} />
                <div className="min-w-0 flex-1">
                  {t.title && <div className="text-sm font-medium">{t.title}</div>}
                  <div className="text-sm text-muted break-words">{t.message}</div>
                </div>
                {t.action && (
                  <button className="btn px-2 py-1 text-[12px]" onClick={t.action.onClick}>
                    {t.action.label}
                  </button>
                )}
                <button className="soft-btn px-2 py-1 text-[12px]" onClick={() => ctx.dismiss(t.id)}>✕</button>
              </div>
              <div className="h-[2px] bg-white/10">
                <div className="h-full bg-white/40 animate-[shrink_3.5s_linear_forwards]" />
              </div>
            </li>
          ))}
        </ol>
      </Portal>
    </ToastCtx.Provider>
  );
}

function Icon({ variant }: { variant: Variant }) {
  const tone = variant === "success" ? "#7CFFAF" : variant === "warn" ? "#FFD27C" : variant === "danger" ? "#FF7C7C" : "#9DB4D0";
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" className="mt-0.5 shrink-0">
      <circle cx="12" cy="12" r="10" fill={tone} opacity="0.18" />
      <path d={variant === "success"
        ? "M9.3 12.7l-1.6-1.6-1.4 1.4 3 3 7-7-1.4-1.4z"
        : variant === "warn"
        ? "M11 7h2v7h-2zM11 16h2v2h-2z"
        : variant === "danger"
        ? "M7.8 6.4l9.8 9.8-1.4 1.4L6.4 7.8zM6.4 16.2L16.2 6.4l1.4 1.4-9.8 9.8z"
        : "M11 11h2v6h-2zM11 7h2v2h-2z"} fill={tone} />
    </svg>
  );
}

/* tailwind keyframes suggestion:
  theme.extend.keyframes.shrink = { from:{width:'100%'}, to:{width:'0%'} }
*/
