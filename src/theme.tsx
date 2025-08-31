// src/theme.tsx
import React, { createContext, useContext, useEffect, useMemo, useState } from "react";

type Theme = "light" | "dark" | "auto";
type Ctx = { theme: Theme; setTheme: (t: Theme) => void; toggle: () => void };

const THEME_KEY = "arknet.theme";
const ThemeCtx = createContext<Ctx | null>(null);

function resolveAuto(prefersDark: boolean): "light" | "dark" {
  return prefersDark ? "dark" : "light";
}

function applyTheme(theme: Theme) {
  const root = document.documentElement;
  if (theme === "auto") {
    const prefersDark = window.matchMedia?.("(prefers-color-scheme: dark)")?.matches ?? true;
    root.dataset.theme = resolveAuto(prefersDark);
  } else {
    root.dataset.theme = theme;
  }
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  // default to dark on first load
  const [theme, setTheme] = useState<Theme>(() => {
    try {
      return (localStorage.getItem(THEME_KEY) as Theme) || "dark";
    } catch {
      return "dark";
    }
  });

  // apply + persist
  useEffect(() => {
    applyTheme(theme);
    try {
      localStorage.setItem(THEME_KEY, theme);
    } catch {}
  }, [theme]);

  // react to system change when in auto
  useEffect(() => {
    if (theme !== "auto" || !window.matchMedia) return;
    const m = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => applyTheme("auto");
    m.addEventListener?.("change", onChange);
    return () => m.removeEventListener?.("change", onChange);
  }, [theme]);

  const ctx = useMemo<Ctx>(
    () => ({
      theme,
      setTheme,
      toggle: () => setTheme((t) => (t === "dark" ? "light" : "dark")),
    }),
    [theme]
  );

  return <ThemeCtx.Provider value={ctx}>{children}</ThemeCtx.Provider>;
}

export function useTheme() {
  const ctx = useContext(ThemeCtx);
  if (!ctx) throw new Error("useTheme must be used within ThemeProvider");
  return ctx;
}

export function ThemeToggle({ size = "md" }: { size?: "sm" | "md" }) {
  const { theme, toggle, setTheme } = useTheme();
  const isDark = (document.documentElement.dataset.theme || theme) === "dark";

  const cls =
    size === "sm"
      ? "soft-btn h-8 px-2 rounded-md text-[12px]"
      : "soft-btn h-9 px-3 rounded-md text-sm";

  return (
    <div className="relative inline-flex items-center gap-1">
      <button
        onClick={toggle}
        className={cls}
        aria-label="Toggle theme"
        title={`Switch to ${isDark ? "light" : "dark"} mode`}
      >
        <span aria-hidden>{isDark ? "🌙" : "☀️"}</span>
      </button>
      {/* quick menu (optional): click-to-cycle presets */}
      <div className="hidden md:flex items-center gap-1 ml-1">
        <button
          onClick={() => setTheme("light")}
          className={`soft-btn h-8 px-2 text-[11px] ${theme === "light" ? "bg-white/10" : ""}`}
          title="Light"
        >
          Light
        </button>
        <button
          onClick={() => setTheme("dark")}
          className={`soft-btn h-8 px-2 text-[11px] ${theme === "dark" ? "bg-white/10" : ""}`}
          title="Dark"
        >
          Dark
        </button>
        <button
          onClick={() => setTheme("auto")}
          className={`soft-btn h-8 px-2 text-[11px] ${theme === "auto" ? "bg-white/10" : ""}`}
          title="Auto"
        >
          Auto
        </button>
      </div>
    </div>
  );
}
