// src/ui/CopyTooltip.tsx
import React, { useEffect, useRef, useState } from "react";

type Props = {
  value: string;
  children: React.ReactElement<{ onClick?: any }>;
  label?: string;          // e.g., "Copy", defaults to "Copy"
  copiedLabel?: string;    // e.g., "Copied!", defaults to "Copied"
  placement?: "top" | "bottom" | "left" | "right";
};

export default function CopyTooltip({ value, children, label = "Copy", copiedLabel = "Copied", placement = "top" }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const [copied, setCopied] = useState(false);
  const [hover, setHover] = useState(false);

  useEffect(() => {
    if (!copied) return;
    const id = window.setTimeout(() => setCopied(false), 1200);
    return () => window.clearTimeout(id);
  }, [copied]);

  const onClick = async (e: React.MouseEvent) => {
    e.stopPropagation();
    try { await navigator.clipboard.writeText(value); setCopied(true); } catch {}
  };

  const tip = copied ? copiedLabel : label;

  return (
    <div
      ref={ref}
      className="relative inline-flex"
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      onFocus={() => setHover(true)}
      onBlur={() => setHover(false)}
    >
      {React.cloneElement(children, { onClick })}
      {(hover || copied) && (
        <div
          className={`absolute ${
            placement === "top" ? "bottom-full mb-2 left-1/2 -translate-x-1/2"
            : placement === "bottom" ? "top-full mt-2 left-1/2 -translate-x-1/2"
            : placement === "left" ? "right-full mr-2 top-1/2 -translate-y-1/2"
            : "left-full ml-2 top-1/2 -translate-y-1/2"
          }`}
        >
          <div className="glass border border-border rounded-md px-2 py-1 text-[11px] text-muted whitespace-nowrap shadow-elev1">
            {tip}
          </div>
        </div>
      )}
    </div>
  );
}
