// src/components/ide/Tabs.tsx
import React, {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";

export type TabDef = {
  key: string;
  label: string;
  icon?: React.ReactNode;
  badge?: number | string;
  disabled?: boolean;
  title?: string;          // tooltip
};

type Variant = "underline" | "segmented";
type Size = "sm" | "md" | "lg";

function cx(...xs: Array<string | false | null | undefined>) {
  return xs.filter(Boolean).join(" ");
}

export default function Tabs({
  tabs,
  active,
  onChange,
  variant = "underline",
  size = "md",
  align = "start", // "start" | "center" | "justify"
  idPrefix = "tabs",
}: {
  tabs: TabDef[];
  active: string;
  onChange: (k: string) => void;
  variant?: Variant;
  size?: Size;
  align?: "start" | "center" | "justify";
  idPrefix?: string;
}) {
  const listRef = useRef<HTMLDivElement>(null);
  const indicatorRef = useRef<HTMLDivElement>(null);
  const [showLeft, setShowLeft] = useState(false);
  const [showRight, setShowRight] = useState(false);

  const activeIndex = Math.max(
    0,
    tabs.findIndex((t) => t.key === active)
  );

  const sizes = useMemo(
    () => ({
      sm: "h-9 text-[13px] px-3",
      md: "h-10 text-sm px-3.5",
      lg: "h-11 text-[15px] px-4",
    }),
    []
  );

  // Update scroll hint gradients
  const updateOverflow = () => {
    const el = listRef.current;
    if (!el) return;
    const { scrollLeft, scrollWidth, clientWidth } = el;
    setShowLeft(scrollLeft > 2);
    setShowRight(scrollLeft + clientWidth < scrollWidth - 2);
  };

  // Center active tab when active changes
  const scrollActiveIntoView = (behavior: ScrollBehavior = "smooth") => {
    const wrap = listRef.current;
    if (!wrap) return;
    const btn = wrap.querySelector<HTMLButtonElement>(
      `[data-key="${CSS.escape(active)}"]`
    );
    if (!btn) return;
    const r = btn.getBoundingClientRect();
    const w = wrap.getBoundingClientRect();
    const offset = r.left - w.left - (w.width - r.width) / 2;
    wrap.scrollBy({ left: offset, behavior });
  };

  // Position/size underline indicator (for underline variant)
  const placeIndicator = () => {
    if (variant !== "underline") return;
    const wrap = listRef.current;
    const bar = indicatorRef.current;
    if (!wrap || !bar) return;
    const btn = wrap.querySelector<HTMLButtonElement>(
      `[data-key="${CSS.escape(active)}"]`
    );
    if (!btn) return;
    const r = btn.getBoundingClientRect();
    const w = wrap.getBoundingClientRect();
    const x = r.left - w.left + wrap.scrollLeft;
    bar.style.width = `${r.width}px`;
    bar.style.transform = `translateX(${x}px)`;
  };

  useLayoutEffect(() => {
    placeIndicator();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, variant, size, tabs.length]);

  useEffect(() => {
    const wrap = listRef.current;
    if (!wrap) return;

    const ro = new ResizeObserver(() => {
      updateOverflow();
      placeIndicator();
    });
    ro.observe(wrap);
    const onScroll = () => {
      updateOverflow();
      placeIndicator();
    };
    wrap.addEventListener("scroll", onScroll, { passive: true });

    // initial
    updateOverflow();
    placeIndicator();

    return () => {
      wrap.removeEventListener("scroll", onScroll);
      ro.disconnect();
    };
  }, []);

  useEffect(() => {
    // when active changes, ensure it's visible and indicator follows
    scrollActiveIntoView("smooth");
    placeIndicator();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active]);

  // Keyboard navigation (roving)
  const onKeyDown = (e: React.KeyboardEvent) => {
    if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(e.key)) return;
    e.preventDefault();
    const enabled = tabs.filter((t) => !t.disabled);
    const idx = Math.max(
      0,
      enabled.findIndex((t) => t.key === active)
    );
    let next = idx;
    if (e.key === "ArrowRight") next = (idx + 1) % enabled.length;
    if (e.key === "ArrowLeft") next = (idx - 1 + enabled.length) % enabled.length;
    if (e.key === "Home") next = 0;
    if (e.key === "End") next = enabled.length - 1;
    onChange(enabled[next].key);
  };

  const baseBtn =
    "relative inline-flex items-center gap-2 rounded-md whitespace-nowrap focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-white/30 transition";
  const uActive = "text-text";
  const uIdle = "text-muted hover:text-text";
  const uPad = sizes[size];

  const segWrap =
    "rounded-md border border-border p-1 bg-[var(--surface-1)]";
  const segBtn =
    "border border-transparent hover:border-border/60";
  const segActive =
    "bg-[var(--surface-2)] border-border text-text shadow-elev1";
  const segIdle = "text-muted";

  const containerBorder =
    variant === "underline" ? "border-b border-border" : "";

  return (
    <div
      className={cx(
        "relative",
        containerBorder,
        align === "center" && "grid place-items-center",
        align === "justify" && "grid"
      )}
      onKeyDown={onKeyDown}
    >
      {/* Scroll buttons (appear on overflow) */}
      {showLeft && (
        <EdgeButton side="left" onClick={() => listRef.current?.scrollBy({ left: -220, behavior: "smooth" })} />
      )}
      {showRight && (
        <EdgeButton side="right" onClick={() => listRef.current?.scrollBy({ left: 220, behavior: "smooth" })} />
      )}

      {/* Tablist */}
      <div
        role="tablist"
        aria-label="Tabs"
        ref={listRef}
        className={cx(
          "relative min-w-0 overflow-x-auto overflow-y-hidden no-scrollbar",
          "scroll-smooth",
          align === "justify" ? "w-full" : "max-w-full"
        )}
        // subtle edge fade using mask for platforms that support it
        style={{
          WebkitMaskImage:
            showLeft || showRight
              ? "linear-gradient(90deg, transparent 0, #000 16px, #000 calc(100% - 16px), transparent 100%)"
              : undefined,
          maskImage:
            showLeft || showRight
              ? "linear-gradient(90deg, transparent 0, #000 16px, #000 calc(100% - 16px), transparent 100%)"
              : undefined,
        }}
      >
        <div
          className={cx(
            "flex items-center gap-2 px-2",
            align === "center" && "justify-center",
            align === "justify" && "justify-between"
          )}
        >
          {variant === "segmented" ? (
            <div className={cx("flex items-center gap-1", segWrap)}>
              {tabs.map((t, i) => {
                const selected = t.key === active;
                return (
                  <button
                    key={t.key}
                    data-key={t.key}
                    role="tab"
                    aria-selected={selected}
                    aria-disabled={t.disabled || undefined}
                    tabIndex={selected ? 0 : -1}
                    title={t.title}
                    disabled={t.disabled}
                    onClick={() => !t.disabled && onChange(t.key)}
                    className={cx(
                      baseBtn,
                      uPad,
                      segBtn,
                      selected ? segActive : segIdle,
                      t.disabled && "opacity-50 pointer-events-none"
                    )}
                  >
                    {t.icon}
                    <span>{t.label}</span>
                    {t.badge != null && (
                      <span className="ml-1 text-[11px] px-1.5 py-0.5 rounded bg-white/10 border border-border">
                        {t.badge}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          ) : (
            <>
              {tabs.map((t) => {
                const selected = t.key === active;
                return (
                  <button
                    key={t.key}
                    data-key={t.key}
                    role="tab"
                    aria-selected={selected}
                    aria-controls={`${idPrefix}-${t.key}-panel`}
                    aria-disabled={t.disabled || undefined}
                    tabIndex={selected ? 0 : -1}
                    title={t.title}
                    disabled={t.disabled}
                    onClick={() => !t.disabled && onChange(t.key)}
                    className={cx(
                      baseBtn,
                      uPad,
                      selected ? uActive : uIdle,
                      t.disabled && "opacity-50 pointer-events-none"
                    )}
                  >
                    {t.icon}
                    <span>{t.label}</span>
                    {t.badge != null && (
                      <span className="ml-1 text-[11px] px-1.5 py-0.5 rounded bg-white/10 border border-border">
                        {t.badge}
                      </span>
                    )}
                  </button>
                );
              })}
              {/* underline indicator */}
              <div
                aria-hidden
                ref={indicatorRef}
                className="pointer-events-none absolute bottom-0 left-0 h-[2px] bg-gradient-to-r from-primary to-accent transition-[transform,width] duration-300 ease-out"
                style={{ width: 0, transform: "translateX(0)" }}
              />
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function EdgeButton({
  side,
  onClick,
}: {
  side: "left" | "right";
  onClick: () => void;
}) {
  const isLeft = side === "left";
  return (
    <button
      type="button"
      onClick={onClick}
      className={cx(
        "absolute top-1/2 -translate-y-1/2 z-10",
        "h-8 w-8 rounded-md border border-border backdrop-blur-md",
        "bg-[var(--surface-2)]/80 hover:bg-[var(--surface-2)]",
        "shadow-elev2",
        isLeft ? "left-1" : "right-1"
      )}
      aria-label={isLeft ? "Scroll tabs left" : "Scroll tabs right"}
      title={isLeft ? "Scroll left" : "Scroll right"}
    >
      <svg
        width="18"
        height="18"
        viewBox="0 0 24 24"
        className="mx-auto"
        aria-hidden
      >
        {isLeft ? (
          <path
            d="M14.5 5.5L8 12l6.5 6.5"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        ) : (
          <path
            d="M9.5 5.5L16 12l-6.5 6.5"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        )}
      </svg>
    </button>
  );
}
