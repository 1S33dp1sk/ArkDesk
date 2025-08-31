// src/ui/Portal.tsx
import { ReactNode, useLayoutEffect, useMemo } from "react";
import { createPortal } from "react-dom";

export default function Portal({ children }: { children: ReactNode }) {
  const el = useMemo(() => {
    if (typeof document === "undefined") return null;
    const d = document.createElement("div");
    d.setAttribute("data-ark-portal", "");
    return d;
  }, []);

  useLayoutEffect(() => {
    if (!el || typeof document === "undefined") return;
    document.body.appendChild(el);
    return () => { document.body.removeChild(el); };
  }, [el]);

  if (!el) return null;
  return createPortal(children, el);
}
