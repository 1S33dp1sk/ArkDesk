// src/ui/Confirm.tsx  — ensure NAMED exports (no default)
import React, { createContext, useContext, useMemo, useState } from "react";
import Portal from "./Portal";

type ConfirmOpts = {
  title?: string;
  message?: string;
  confirmText?: string;
  cancelText?: string;
  danger?: boolean;
};
type Ctx = (opts: ConfirmOpts) => Promise<boolean>;

const ConfirmCtx = createContext<Ctx | null>(null);

export function useConfirm() {
  const ctx = useContext(ConfirmCtx);
  if (!ctx) throw new Error("useConfirm must be used within <ConfirmProvider>");
  return ctx;
}

export function ConfirmProvider({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const [opts, setOpts] = useState<ConfirmOpts>({});
  const [resolver, setResolver] = useState<(v: boolean) => void>(() => () => {});

  const confirm = useMemo<Ctx>(() => (o) => {
    setOpts(o);
    setOpen(true);
    return new Promise<boolean>((res) => setResolver(() => res));
  }, []);

  const decide = (v: boolean) => {
    setOpen(false);
    resolver(v);
  };

  const danger = !!opts.danger;

  return (
    <ConfirmCtx.Provider value={confirm}>
      {children}
      {open && (
        <Portal>
          <div className="fixed inset-0 z-[1000]">
            <div className="absolute inset-0 bg-black/40" onClick={() => decide(false)} />
            <div className="absolute inset-0 grid place-items-center p-4">
              <div className="glass border border-border rounded-md w-[min(520px,94vw)] overflow-hidden">
                <header className="px-4 py-3 border-b border-border">
                  <div className="text-sm">{opts.title ?? "Are you sure?"}</div>
                </header>
                <div className="p-4 text-sm text-muted">
                  {opts.message ?? "This action cannot be easily undone."}
                </div>
                <footer className="px-4 py-3 border-t border-border flex items-center justify-end gap-2">
                  <button className="btn px-3 py-1.5 text-sm" onClick={() => decide(false)}>
                    {opts.cancelText ?? "Cancel"}
                  </button>
                  <button
                    className={`btn px-3 py-1.5 text-sm ${danger ? "bg-red-500/80 hover:bg-red-500/90" : "btn-primary"}`}
                    onClick={() => decide(true)}
                  >
                    {opts.confirmText ?? (danger ? "Delete" : "Confirm")}
                  </button>
                </footer>
              </div>
            </div>
          </div>
        </Portal>
      )}
    </ConfirmCtx.Provider>
  );
}
