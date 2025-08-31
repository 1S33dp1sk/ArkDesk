// src/ui/Section.tsx
import React, { forwardRef, ReactNode } from "react";

type Scroll = "none" | "x" | "y" | "both";
type Pad = "none" | "sm" | "md" | "lg";
type Round = "md" | "lg" | "xl" | "2xl";
type Mode = "auto" | "light" | "dark";
type Variant = "card" | "glass" | "plain";
type Surface = 0 | 1 | 2 | 3 | 4;

export type SectionProps = {
  as?: keyof JSX.IntrinsicElements;
  title?: ReactNode;
  actions?: ReactNode;
  footer?: ReactNode;
  scroll?: Scroll;
  padding?: Pad;
  headerPadding?: Pad;
  footerPadding?: Pad;
  rounded?: Round;
  border?: boolean;
  mode?: Mode;                 // "auto" = inherit, or force "light"/"dark" via data-theme
  variant?: Variant;           // visual style preset
  surface?: Surface;           // surface depth (uses .surface-*)
  id?: string;
  children: ReactNode;
  className?: string;
  headerClassName?: string;
  bodyClassName?: string;
  footerClassName?: string;
  "aria-busy"?: boolean;
};

const padMap: Record<Pad, string> = { none: "p-0", sm: "p-3", md: "p-4", lg: "p-6" };
const roundMap: Record<Round, string> = { md: "rounded-md", lg: "rounded-lg", xl: "rounded-xl", "2xl": "rounded-2xl" };
const scrollMap: Record<Scroll, string> = {
  none: "overflow-visible",
  x: "overflow-x-auto",
  y: "overflow-y-auto",
  both: "overflow-auto",
};

export const Section = forwardRef<HTMLDivElement, SectionProps>(function Section(
  {
    as = "section",
    title,
    actions,
    footer,
    scroll = "none",
    padding = "md",
    headerPadding = "sm",
    footerPadding = "sm",
    rounded = "lg",
    border = true,
    mode = "auto",
    variant = "card",
    surface = 1,
    id,
    children,
    className = "",
    headerClassName = "",
    bodyClassName = "",
    footerClassName = "",
    ...rest
  },
  ref
) {
  const Comp: any = as;

  // Variant base classes
  const variantBase =
    variant === "glass"
      ? "glass" // your glass already uses blur + border; background is tokenized via CSS vars in index.css
      : variant === "plain"
      ? ""      // inherit container background
      : "card"; // default: card (tokenized background, subtle shadow)

  return (
    <Comp
      id={id}
      ref={ref}
      // If mode is forced, scope CSS variables by setting data-theme on this subtree.
      {...(mode !== "auto" ? { "data-theme": mode } : {})}
      className={[
        "min-w-0 min-h-0 flex flex-col",
        variantBase,
        // surface depth (controls background via CSS vars)
        `surface-${surface}`,
        roundMap[rounded],
        border ? "border border-border" : "",
        className,
      ].join(" ")}
      {...rest}
    >
      {(title != null || actions != null) && (
        <header
          className={[
            "flex items-center justify-between",
            border ? "border-b border-border" : "",
            padMap[headerPadding],
            "text-[13px] tracking-wide",
            headerClassName,
          ].join(" ")}
        >
          <div className="text-muted">{title}</div>
          {actions}
        </header>
      )}

      <div
        className={[
          "min-w-0 min-h-0",
          padMap[padding],
          scrollMap[scroll],
          bodyClassName,
        ].join(" ")}
      >
        {children}
      </div>

      {footer != null && (
        <footer
          className={[
            border ? "border-t border-border" : "",
            padMap[footerPadding],
            footerClassName,
          ].join(" ")}
        >
          {footer}
        </footer>
      )}
    </Comp>
  );
});

export default Section;
