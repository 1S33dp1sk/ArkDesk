// src/components/ide/SplitPane.tsx
import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";

type Dir = "horizontal" | "vertical";

function clamp(n: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, n));
}

export default function SplitPane({
  dir = "horizontal",
  initialA = 260,
  minA = 180,
  minB = 240,
  gutterSize = 8,
  storageKey,                 // persist size (px) under this key
  snap,                       // optional snap points (px, from start)
  onResize,                   // callback when size changes
  ariaLabel = "Resize panel",
  children,
}: {
  dir?: Dir;
  initialA?: number;
  minA?: number;
  minB?: number;
  gutterSize?: number;
  storageKey?: string;
  snap?: number[];
  onResize?: (aPx: number) => void;
  ariaLabel?: string;
  children: [React.ReactNode, React.ReactNode];
}) {
  const isH = dir === "horizontal";
  const ref = useRef<HTMLDivElement>(null);

  // read persisted size once
  const readStored = () => {
    if (!storageKey) return null;
    try {
      const v = localStorage.getItem(storageKey);
      return v ? parseFloat(v) : null;
    } catch {
      return null;
    }
  };

  const [a, setA] = useState<number>(() => readStored() ?? initialA);
  const [dragging, setDragging] = useState(false);

  // clamp on mount & whenever container resizes
  const clampToBounds = useCallback(
    (val: number) => {
      const rect = ref.current?.getBoundingClientRect();
      if (!rect) return val;
      const maxA = (isH ? rect.width : rect.height) - minB - gutterSize;
      return clamp(val, minA, maxA);
    },
    [isH, minA, minB, gutterSize]
  );

  useLayoutEffect(() => {
    setA((prev) => clampToBounds(prev));
  }, [clampToBounds]);

  // persist & notify
  useEffect(() => {
    if (storageKey) {
      try { localStorage.setItem(storageKey, String(a)); } catch {}
    }
    onResize?.(a);
  }, [a, onResize, storageKey]);

  // re-clamp on window resize
  useEffect(() => {
    const onR = () => setA((prev) => clampToBounds(prev));
    window.addEventListener("resize", onR);
    return () => window.removeEventListener("resize", onR);
  }, [clampToBounds]);

  // drag with Pointer Events (mouse + touch)
  const startDrag = (clientXY: number) => {
    const rect = ref.current!.getBoundingClientRect();
    const base = a;
    const size = isH ? rect.width : rect.height;
    const maxA = size - minB - gutterSize;

    const onMove = (ev: PointerEvent) => {
      const cur = isH ? ev.clientX : ev.clientY;
      const delta = cur - clientXY;
      setA(clamp(base + delta, minA, maxA));
    };
    const onUp = (ev: PointerEvent) => {
      setDragging(false);
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);

      // snap to nearest, if provided
      if (snap && snap.length) {
        const maxAllowed = maxA;
        const clampedSnaps = snap
          .map((p) => clamp(p, minA, maxAllowed))
          .sort((x, y) => x - y);
        const nearest = clampedSnaps.reduce((best, v) =>
          Math.abs(v - a) < Math.abs(best - a) ? v : best, clampedSnaps[0]);
        if (Math.abs(nearest - a) <= 12) setA(nearest);
      }
      document.body.classList.remove("select-none", isH ? "cursor-col-resize" : "cursor-row-resize");
    };

    setDragging(true);
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    document.body.classList.add("select-none", isH ? "cursor-col-resize" : "cursor-row-resize");
  };

  const onSeparatorPointerDown: React.PointerEventHandler<HTMLDivElement> = (e) => {
    // only left mouse / primary pointer
    if (e.button !== 0 && e.pointerType === "mouse") return;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    startDrag(isH ? e.clientX : e.clientY);
  };

  // keyboard resizing
  const onSeparatorKeyDown: React.KeyboardEventHandler<HTMLDivElement> = (e) => {
    const step = e.shiftKey ? 40 : 10;
    const rect = ref.current!.getBoundingClientRect();
    const size = isH ? rect.width : rect.height;
    const maxA = size - minB - gutterSize;

    if (isH) {
      if (e.key === "ArrowLeft") { e.preventDefault(); setA((v) => clamp(v - step, minA, maxA)); }
      if (e.key === "ArrowRight"){ e.preventDefault(); setA((v) => clamp(v + step, minA, maxA)); }
    } else {
      if (e.key === "ArrowUp")   { e.preventDefault(); setA((v) => clamp(v - step, minA, maxA)); }
      if (e.key === "ArrowDown") { e.preventDefault(); setA((v) => clamp(v + step, minA, maxA)); }
    }

    // Home / End to collapse to edges
    if (e.key === "Home") { e.preventDefault(); setA(minA); }
    if (e.key === "End")  { e.preventDefault(); setA(maxA); }
  };

  // double-click: reset / collapse (Alt = collapse start, Shift = collapse end)
  const onSeparatorDoubleClick: React.MouseEventHandler<HTMLDivElement> = (e) => {
    const rect = ref.current!.getBoundingClientRect();
    const size = isH ? rect.width : rect.height;
    const maxA = size - minB - gutterSize;

    if (e.altKey) { setA(minA); return; }
    if (e.shiftKey) { setA(maxA); return; }
    setA(clampToBounds(readStored() ?? initialA)); // reset to stored or initial
  };

  // styles
  const template = isH
    ? { gridTemplateColumns: `${a}px ${gutterSize}px 1fr` }
    : { gridTemplateRows: `${a}px ${gutterSize}px 1fr` };

  return (
    <div
      ref={ref}
      className={`min-h-0 min-w-0 grid ${isH ? "grid-cols-[auto_var(--gutter)_1fr]" : "grid-rows-[auto_var(--gutter)_1fr]"}`}
      style={{ ...(template as any), ["--gutter" as any]: `${gutterSize}px` }}
    >
      <div className="min-w-0 min-h-0">{children[0]}</div>

      <div
        role="separator"
        aria-orientation={isH ? "vertical" : "horizontal"}
        aria-label={ariaLabel}
        aria-valuemin={0}
        tabIndex={0}
        onPointerDown={onSeparatorPointerDown}
        onKeyDown={onSeparatorKeyDown}
        onDoubleClick={onSeparatorDoubleClick}
        title="Drag to resize (⇧ for bigger steps, ⌥ double-click to collapse, ⇧ double-click to collapse opposite)"
        className={[
          "relative group",
          // visual line
          "bg-white/5 dark:bg-white/10",
          isH ? "cursor-col-resize" : "cursor-row-resize",
          // hit target larger than visual line
          isH ? "after:absolute after:-left-2 after:-right-2 after:inset-y-0" : "after:absolute after:-top-2 after:-bottom-2 after:inset-x-0",
          "after:content-[''] after:block",
          // hover/active feedback
          "hover:bg-white/10 active:bg-white/20",
          dragging ? (isH ? "bg-white/20" : "bg-white/20") : "",
          "transition-colors"
        ].join(" ")}
      >
        {/* handle dots */}
        <div
          className={[
            "absolute rounded-md opacity-60 group-hover:opacity-100",
            isH
              ? "top-1/2 -translate-y-1/2 left-1/2 -translate-x-1/2 h-8 w-1.5"
              : "left-1/2 -translate-x-1/2 top-1/2 -translate-y-1/2 w-8 h-1.5",
            "bg-border"
          ].join(" ")}
          aria-hidden
        />
      </div>

      <div className="min-w-0 min-h-0">{children[1]}</div>
    </div>
  );
}
