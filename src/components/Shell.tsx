// src/components/Shell.tsx
import React, { useEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { ROUTES, pathTitle } from "../routes";

/* ——— theme hook (persists + reacts to system) ——— */
type Theme = "light" | "dark" | "system";

function useTheme() {
  const [pref, setPref] = useState<Theme>(() => {
    const v = localStorage.getItem("ark.theme");
    return (v === "light" || v === "dark" || v === "system") ? v : "system";
  });

  useEffect(() => {
    const apply = () => {
      const sysDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
      const actual: "light" | "dark" = pref === "system" ? (sysDark ? "dark" : "light") : pref;
      document.documentElement.dataset.theme = actual;   // consumed by your CSS vars
    };
    apply();

    localStorage.setItem("ark.theme", pref);
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => pref === "system" && apply();
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, [pref]);

  return { pref, setPref };
}

/* ——— icons ——— */
const Sun = (props: React.SVGProps<SVGSVGElement>) => (
  <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden {...props}>
    <circle cx="12" cy="12" r="4.5" stroke="currentColor" strokeWidth="1.5" fill="none" />
    <g stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
      <path d="M12 2.5v3" /><path d="M12 18.5v3" /><path d="M21.5 12h-3" /><path d="M5.5 12h-3" />
      <path d="M18.36 5.64l-2.12 2.12" /><path d="M7.76 16.24l-2.12 2.12" />
      <path d="M18.36 18.36l-2.12-2.12" /><path d="M7.76 7.76L5.64 5.64" />
    </g>
  </svg>
);
const Moon = (props: React.SVGProps<SVGSVGElement>) => (
  <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden {...props}>
    <path d="M20.5 13.2A8.5 8.5 0 1 1 10.8 3.5a7 7 0 1 0 9.7 9.7Z" fill="none" stroke="currentColor" strokeWidth="1.5" />
  </svg>
);
const Auto = (props: React.SVGProps<SVGSVGElement>) => (
  <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden {...props}>
    <path d="M3 12h18" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    <path d="M6.5 7.5 12 2l5.5 5.5M6.5 16.5 12 22l5.5-5.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" fill="none" />
  </svg>
);

/* ——— theme switcher ——— */
function ThemeSwitcher() {
  const { pref, setPref } = useTheme();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const onDoc = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  const icon = useMemo(() => (pref === "light" ? <Sun /> : pref === "dark" ? <Moon /> : <Auto />), [pref]);
  const label = pref === "system" ? "Auto" : pref[0].toUpperCase() + pref.slice(1);

  return (
    <div className="relative" ref={ref}>
      <button
        className="soft-btn px-2.5 py-1.5 text-sm flex items-center gap-2"
        onClick={() => setOpen(v => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        title={`Theme: ${label}`}
      >
        {icon}
        <span className="hidden sm:inline">{label}</span>
      </button>
      {open && (
        <div role="menu" className="absolute right-0 mt-2 w-40 glass rounded-md border border-border p-1">
          {(["light","dark","system"] as Theme[]).map(t => (
            <button
              key={t}
              onClick={() => { setPref(t); setOpen(false); }}
              className={`w-full text-left px-3 py-2 rounded-md hover:bg-white/10 ${pref === t ? "bg-white/10" : ""}`}
              role="menuitem"
            >
              {t === "light" ? "Light" : t === "dark" ? "Dark" : "System"}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/* ——— shell ——— */
export default function Shell({ children }: { children: React.ReactNode }) {
  const nav = useNavigate();
  const { pathname } = useLocation();
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const isHome = pathname === "/";

  useEffect(() => {
    const onDoc = (e: MouseEvent) => { if (!menuRef.current?.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  const back = () => (window.history.length > 1 ? nav(-1) : nav("/"));

  return (
    <div className="relative h-full">
      <header className="glass fixed left-4 right-4 top-4 z-40 h-12 px-3 rounded-md flex items-center gap-2 border border-border">
        <button
          onClick={back}
          disabled={isHome}
          className={`soft-btn px-2 py-1 ${isHome ? "opacity-50 pointer-events-none" : ""}`}
          aria-label="Back"
          title="Back"
        >
          ← Back
        </button>

        <div className="mx-2 text-sm text-muted">/</div>
        <div className="text-sm">{pathTitle(pathname)}</div>

        <div className="flex-1" />

        <ThemeSwitcher />

        <button className="soft-btn px-3 py-1 text-sm" title="Command Palette (⌘K)">⌘K</button>

        <div className="relative" ref={menuRef}>
          <button
            onClick={() => setOpen(v => !v)}
            className="soft-btn px-3 py-1 text-sm"
            aria-haspopup="menu"
            aria-expanded={open}
            title="Menu"
          >
            ☰
          </button>
          {open && (
            <nav role="menu" className="absolute right-0 mt-2 w-48 glass p-2 rounded-md border border-border">
              <div className="text-[11px] text-muted px-2 pb-1">Navigate</div>
              <ul className="grid">
                {ROUTES.filter(r => r.showInMenu).map(r => (
                  <li key={r.path}>
                    <Link
                      to={r.path}
                      onClick={() => setOpen(false)}
                      className={`block px-3 py-2 rounded-md hover:bg-white/10 ${pathname === r.path ? "bg-white/10" : ""}`}
                    >
                      {r.title}
                    </Link>
                  </li>
                ))}
              </ul>
              <div className="border-t border-border my-2" />
              <button className="w-full text-left px-3 py-2 rounded-md hover:bg-white/10">Settings</button>
              <button className="w-full text-left px-3 py-2 rounded-md hover:bg-white/10">About</button>
            </nav>
          )}
        </div>
      </header>

      <div className="h-full pt-20 px-4 pb-4">{children}</div>
    </div>
  );
}
