// src/App.tsx
import React, { useEffect, useMemo, useState } from "react";
import BackgroundFX from "./components/BackgroundFX";
import AppRouter from "./AppRouter";
import { ThemeToggle } from "./theme"; // uses your existing theme.tsx toggle

type Phase = "landing" | "main";

function Chip({ children }: { children: React.ReactNode }) {
  return (
    <span className="px-2.5 py-1 rounded-md border border-border bg-white/5 text-[11px] tracking-wide">
      {children}
    </span>
  );
}

function LogoMark() {
  return (
    <div className="relative">
      <svg width="44" height="44" viewBox="0 0 56 56" className="animate-float" aria-hidden>
        <defs>
          <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#6aa9ff" />
            <stop offset="100%" stopColor="#b59cff" />
          </linearGradient>
        </defs>
        <circle cx="28" cy="28" r="24" fill="url(#g)" opacity="0.18" />
        <path d="M28 10 L42 40 H36.5 L31.5 30 H24.5 L19.5 40 H14 L28 10 Z" fill="url(#g)" />
      </svg>
      <span
        className="pointer-events-none absolute inset-0 rounded-full blur-xl opacity-60"
        style={{
          background:
            "radial-gradient(60% 60% at 50% 50%, rgba(106,169,255,.25), rgba(181,156,255,.08) 60%, transparent 70%)",
        }}
      />
    </div>
  );
}

export default function App() {
  const [phase, setPhase] = useState<Phase>("landing");
  const [animating, setAnimating] = useState(false);
  const [grow, setGrow] = useState(false);

  // Default to dark if nothing set yet
  useEffect(() => {
    const root = document.documentElement;
    if (!root.dataset.theme) {
      root.dataset.theme = "dark";
      try {
        localStorage.setItem("arknet.theme", "dark");
      } catch {}
    }
  }, []);

  // Optional: Enter to start
  useEffect(() => {
    if (phase !== "landing") return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Enter") handleStart();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase]);

  // Ring animation values
  const r = 50;
  const C = useMemo(() => 2 * Math.PI * r, []);
  const arcStart = useMemo(() => 0.26 * C, [C]);

  const handleStart = (route?: string) => {
    if (route) {
      // when AppRouter mounts, we’ll land on this route
      window.location.hash = route.startsWith("#") ? route : `#${route}`;
    }
    setAnimating(true);
    requestAnimationFrame(() => setGrow(true));
  };

  const onRingTransitionEnd: React.TransitionEventHandler<SVGCircleElement> = (e) => {
    if (e.propertyName !== "stroke-dasharray") return;
    setPhase("main");
  };

  if (phase === "main") {
    return <AppRouter />;
  }

  return (
    <div className="relative h-full overflow-hidden">
      <BackgroundFX />
      {/* Floating Dev Harness button (landing only) */}
      <button
        type="button"
        onClick={() => handleStart("/dev")}
        className="fixed bottom-4 right-4 z-50 px-3 py-1.5 rounded-full border border-border
                   bg-white/5 hover:bg-white/10 text-[12px] tracking-wide shadow-elev2
                   backdrop-blur-md"
        title="Open Dev Harness"
        aria-label="Open Dev Harness"
      >
        Dev
      </button>

      <main className="h-full grid place-items-center p-6">
        <section className="glass w-[min(980px,94vw)] p-8 md:p-12 rounded-lg relative overflow-hidden">
          {/* Accent halo */}
          <div
            aria-hidden
            className="pointer-events-none absolute -inset-24 opacity-60 blur-3xl"
            style={{
              background:
                "radial-gradient(40% 40% at 25% 20%, rgba(106,169,255,.18), transparent 60%), radial-gradient(36% 36% at 85% 35%, rgba(181,156,255,.22), transparent 60%), radial-gradient(30% 30% at 50% 110%, rgba(119,225,255,.14), transparent 70%)",
            }}
          />

          {/* Top bar */}
          <header className="relative z-10 flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <LogoMark />
              <div>
                <div className="text-sm text-muted">Enter the</div>
                <h1 className="text-2xl md:text-3xl font-semibold tracking-tight leading-tight">
                  <span className="bg-gradient-to-br from-primary to-accent bg-clip-text text-transparent">
                    Arknet Arena
                  </span>
                </h1>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button className="soft-btn px-3 py-2 text-sm" aria-label="Open Command Palette" title="Palette (⌘K)">
                ⌘K
              </button>
              <ThemeToggle size="sm" /> {/* small, subtle theme switch */}
            </div>
          </header>

          {/* Hero */}
          <div className="relative z-10 mt-8 md:mt-10 grid items-center gap-8 md:grid-cols-[1fr,auto]">
            <div>
              <p className="text-base md:text-lg text-muted">
                Spin up. Sync fast. Ship blocks. Full node or relay — your call.
              </p>

              <div className="mt-4 flex flex-wrap gap-2">
                <Chip>Zero-fluff UI</Chip>
                <Chip>60fps Motion</Chip>
                <Chip>Keyboard-first</Chip>
                <Chip>High Contrast</Chip>
              </div>

              {/* Primary CTAs — Non-dev & Dev */}
              <div className="mt-6 md:mt-8 flex flex-wrap items-center gap-3 md:gap-4">
                <button
                  className="btn btn-primary px-6 py-3 text-[15px] font-medium ring-1 ring-white/10 hover:ring-white/20 transition-transform active:scale-[.98]"
                  onClick={() => handleStart("/wallet")}
                >
                  Open Dashboard
                </button>
                <button
                  className="btn px-6 py-3 text-[15px] font-medium ring-1 ring-white/10 hover:ring-white/20 transition-transform active:scale-[.98]"
                  onClick={() => handleStart("/ide")}
                >
                  Open IDE
                </button>
                <span className="text-[12px] text-muted">Press Enter to start · You can switch anytime.</span>
              </div>

              {/* Status / progress hint */}
              <div className="mt-8">
                <div className="relative h-2 w-full overflow-hidden rounded-md bg-white/10">
                  <div className="absolute inset-y-0 left-0 w-1/2 bg-white/20" />
                </div>
                <div className="mt-2 text-[12px] text-muted">Bootstrap complete · assets live</div>
              </div>
            </div>

            {/* Accent orb — animates from arc → full ring on click */}
            <div
              className={`relative hidden md:block transition-opacity duration-200 ${
                animating ? "opacity-100" : "opacity-0"
              }`}
            >
              <div
                className="h-[220px] w-[220px] rounded-full blur-[56px] opacity-55"
                style={{ background: "radial-gradient(closest-side, rgba(106,169,255,.32), transparent 70%)" }}
              />
              <div className="absolute inset-0 grid place-items-center">
                <svg width="168" height="168" viewBox="0 0 120 120" aria-hidden>
                  <defs>
                    <linearGradient id="ring" x1="0" y1="0" x2="1" y2="1">
                      <stop offset="0%" stopColor="#6aa9ff" />
                      <stop offset="100%" stopColor="#b59cff" />
                    </linearGradient>
                  </defs>
                  <g
                    style={{
                      transform: grow ? "rotate(360deg)" : "rotate(-90deg)",
                      transformOrigin: "50% 50%",
                      transition: "transform 900ms cubic-bezier(.3,0,.2,1)",
                    }}
                  >
                    <circle
                      cx="60"
                      cy="60"
                      r={r}
                      stroke="url(#ring)"
                      strokeWidth="2"
                      fill="none"
                      opacity=".9"
                      style={{
                        strokeDasharray: `${grow ? C : arcStart} ${C}`,
                        transition: "stroke-dasharray 900ms cubic-bezier(.3,0,.2,1)",
                      }}
                      onTransitionEnd={onRingTransitionEnd}
                    />
                  </g>
                </svg>
              </div>
            </div>
          </div>

          {/* Bottom meta */}
          <div className="relative z-10 mt-8 flex items-center justify-between text-[12px] text-muted">
            <span>Native-grade design · 60fps</span>
            <div className="flex items-center gap-3">
              <button
                className="soft-btn px-2 py-1"
                title="Skip intro"
                onClick={() => {
                  setPhase("main");
                }}
              >
                Skip
              </button>
              <span>MVP shell · wired for speed</span>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}
