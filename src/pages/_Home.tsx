// src/pages/Home.tsx
import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";

/* ——— helpers ——— */
type Persona = "new" | "dev";
type Item = { key: string; title: string; subtitle: string; to: string; icon: React.ReactNode; persona?: Persona[] };
const cx = (...xs: Array<string | false | null | undefined>) => xs.filter(Boolean).join(" ");

/* ——— Logo ——— */
function Logo({ size = 44 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 56 56" aria-hidden>
      <defs>
        <linearGradient id="g-home" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#6aa9ff" />
          <stop offset="100%" stopColor="#b59cff" />
        </linearGradient>
      </defs>
      <circle cx="28" cy="28" r="24" fill="url(#g-home)" opacity="0.18" />
      <path d="M28 10 L42 40 H36.5 L31.5 30 H24.5 L19.5 40 H14 L28 10 Z" fill="url(#g-home)" />
    </svg>
  );
}

/* ——— Icons (no deps) ——— */
function RingCompassIcon() {
  return (
    <svg width="36" height="36" viewBox="0 0 120 120" className="shrink-0 transition-transform group-hover:-rotate-3">
      <defs>
        <linearGradient id="grad-explore" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#6aa9ff" />
          <stop offset="100%" stopColor="#b59cff" />
        </linearGradient>
      </defs>
      <circle cx="60" cy="60" r="45" stroke="url(#grad-explore)" strokeWidth="3" fill="none" />
      <path d="M60 34 L74 86 L60 74 L46 86 Z" fill="url(#grad-explore)" opacity=".85" />
    </svg>
  );
}
function WalletIcon() {
  return (
    <svg width="36" height="36" viewBox="0 0 120 120" className="shrink-0">
      <defs>
        <linearGradient id="grad-wallet" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#a3b8ff" />
          <stop offset="100%" stopColor="#caa9ff" />
        </linearGradient>
      </defs>
      <rect x="24" y="34" width="72" height="52" rx="12" fill="url(#grad-wallet)" opacity=".18" />
      <rect x="28" y="38" width="64" height="44" rx="10" stroke="url(#grad-wallet)" strokeWidth="3" fill="none" />
      <circle cx="82" cy="60" r="5" fill="url(#grad-wallet)" />
    </svg>
  );
}
function StackIcon() {
  return (
    <svg width="36" height="36" viewBox="0 0 120 120" className="shrink-0">
      <defs>
        <linearGradient id="grad-mempool" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#6aa9ff" />
          <stop offset="100%" stopColor="#9fe0ff" />
        </linearGradient>
      </defs>
      <path d="M60 26 L98 44 L60 62 L22 44 Z" fill="url(#grad-mempool)" opacity=".25" />
      <path d="M60 46 L98 64 L60 82 L22 64 Z" fill="url(#grad-mempool)" opacity=".4" />
      <path d="M60 66 L98 84 L60 102 L22 84 Z" fill="url(#grad-mempool)" />
    </svg>
  );
}
function ServerIcon() {
  return (
    <svg width="36" height="36" viewBox="0 0 120 120" className="shrink-0">
      <defs>
        <linearGradient id="grad-node" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#b59cff" />
          <stop offset="100%" stopColor="#6aa9ff" />
        </linearGradient>
      </defs>
      <rect x="28" y="30" width="64" height="24" rx="6" stroke="url(#grad-node)" strokeWidth="3" fill="none" />
      <rect x="28" y="66" width="64" height="24" rx="6" stroke="url(#grad-node)" strokeWidth="3" fill="none" />
      <circle cx="82" cy="42" r="4" fill="url(#grad-node)" />
      <circle cx="82" cy="78" r="4" fill="url(#grad-node)" />
    </svg>
  );
}
function CodeIcon() {
  return (
    <svg width="36" height="36" viewBox="0 0 120 120" className="shrink-0 transition-transform group-hover:scale-[1.03]">
      <defs>
        <linearGradient id="grad-ide" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#9ad0ff" />
          <stop offset="100%" stopColor="#b59cff" />
        </linearGradient>
      </defs>
      <path d="M44 36 L28 60 L44 84" stroke="url(#grad-ide)" strokeWidth="6" fill="none" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M76 36 L92 60 L76 84" stroke="url(#grad-ide)" strokeWidth="6" fill="none" strokeLinecap="round" strokeLinejoin="round" />
      <rect x="18" y="24" width="84" height="72" rx="12" stroke="url(#grad-ide)" strokeWidth="2" fill="none" opacity=".5" />
    </svg>
  );
}

/* ——— Atoms ——— */
function Kbd({ children }: { children: React.ReactNode }) {
  return <span className="px-2 py-1 rounded-md border border-border bg-white/5 text-[11px]">{children}</span>;
}
function Chip({ children }: { children: React.ReactNode }) {
  return <span className="px-2.5 py-1 rounded-md border border-border bg-white/5 text-[11px] tracking-wide">{children}</span>;
}
function PillToggle({ value, onChange }: { value: Persona; onChange: (v: Persona) => void }) {
  return (
    <div className="p-1 rounded-full border border-border bg-white/5 inline-flex text-[12px]" role="tablist" aria-label="Persona">
      <button
        role="tab"
        aria-selected={value === "new"}
        className={cx("px-3 py-1 rounded-full", value === "new" ? "bg-white/10 border border-white/20" : "hover:bg-white/5")}
        onClick={() => onChange("new")}
      >
        New to Arknet
      </button>
      <button
        role="tab"
        aria-selected={value === "dev"}
        className={cx("px-3 py-1 rounded-full", value === "dev" ? "bg-white/10 border border-white/20" : "hover:bg-white/5")}
        onClick={() => onChange("dev")}
      >
        Developer
      </button>
    </div>
  );
}

/* ——— Card ——— */
function NavCard({ item }: { item: Item }) {
  const nav = useNavigate();
  return (
    <button
      onClick={() => nav(item.to)}
      className={cx(
        "group relative glass p-4 rounded-xl text-left w-full border border-border transition",
        "hover:bg-white/10 focus-visible:ring-1 focus-visible:ring-white/30 outline-none"
      )}
    >
      <div
        className="absolute -inset-px rounded-xl pointer-events-none opacity-0 group-hover:opacity-100 transition"
        style={{ background: "radial-gradient(60% 60% at 20% 0%, rgba(106,169,255,.18), transparent 60%)" }}
      />
      <div className="relative flex items-center gap-3">
        {item.icon}
        <div>
          <div className="text-[13px] tracking-wide text-muted">{item.subtitle}</div>
          <div className="text-lg font-semibold">{item.title}</div>
        </div>
        <div className="ml-auto opacity-0 group-hover:opacity-100 transition text-muted">↵</div>
      </div>
    </button>
  );
}

/* ——— Starter Miner (DevNet, friendly) ——— */
function StarterMiner() {
  const [running, setRunning] = useState(false);
  const [mode, setMode] = useState<"eco" | "standard" | "turbo">("standard");
  const [hashrate, setHashrate] = useState(0);   // kH/s (simulated)
  const [shares, setShares] = useState(0);
  const [progress, setProgress] = useState(0);   // 0..100

  // simple simulated miner loop
  useEffect(() => {
    if (!running) return;
    const base = mode === "eco" ? 0.6 : mode === "standard" ? 1 : 1.6;
    const tick = () => {
      // random wobble
      const nextRate = Math.max(0.2, base + (Math.random() - 0.5) * 0.2);
      setHashrate((nextRate * 120) | 0); // ~kH/s
      setProgress((p) => {
        const inc = mode === "turbo" ? 4 : mode === "standard" ? 2 : 1;
        const np = p + inc + Math.random() * 1.2;
        if (np >= 100) {
          setShares((s) => s + 1);
          return 0;
        }
        return np;
      });
    };
    const id = window.setInterval(tick, 400);
    return () => window.clearInterval(id);
  }, [running, mode]);

  return (
    <div className="glass p-4 rounded-xl border border-border relative overflow-hidden">
      <div
        aria-hidden
        className={cx(
          "pointer-events-none absolute -inset-10 blur-3xl transition-opacity",
          running ? "opacity-60" : "opacity-0"
        )}
        style={{
          background:
            "radial-gradient(40% 40% at 25% 20%, rgba(106,169,255,.18), transparent 60%), radial-gradient(36% 36% at 85% 35%, rgba(181,156,255,.14), transparent 60%)",
        }}
      />
      <div className="relative z-10">
        <div className="flex items-center justify-between">
          <div className="text-[12px] text-muted">Starter Miner · DevNet</div>
          <div className="flex items-center gap-1">
            {(["eco", "standard", "turbo"] as const).map((m) => (
              <button
                key={m}
                className={cx(
                  "px-2 py-0.5 rounded-md border text-[11px]",
                  mode === m ? "border-white/40 bg-white/10" : "border-border bg-white/5 hover:bg-white/10"
                )}
                onClick={() => setMode(m)}
                title={`Mode: ${m}`}
              >
                {m}
              </button>
            ))}
          </div>
        </div>

        <div className="mt-3 grid grid-cols-[auto,1fr] gap-3 items-center">
          <div className={cx("h-12 w-12 rounded-full grid place-items-center", running ? "bg-white/10" : "bg-white/5")}>
            <svg width="28" height="28" viewBox="0 0 24 24" className={running ? "animate-spin-slow" : ""} aria-hidden>
              <defs>
                <linearGradient id="g-miner" x1="0" y1="0" x2="1" y2="1">
                  <stop offset="0%" stopColor="#6aa9ff" />
                  <stop offset="100%" stopColor="#b59cff" />
                </linearGradient>
              </defs>
              <circle cx="12" cy="12" r="9" stroke="url(#g-miner)" strokeWidth="2" fill="none" opacity=".85" />
            </svg>
          </div>
          <div>
            <div className="text-[12px] text-muted">Hashrate</div>
            <div className="text-xl font-semibold">{hashrate.toLocaleString()} kH/s</div>
          </div>
        </div>

        <div className="mt-3">
          <div className="text-[12px] text-muted mb-1">Finding share</div>
          <div className="h-2 w-full rounded-md bg-white/10 overflow-hidden">
            <div className="h-full bg-white/30" style={{ width: `${Math.min(100, progress).toFixed(0)}%` }} />
          </div>
          <div className="mt-1 text-[12px] text-muted">Shares accepted: {shares}</div>
        </div>

        <div className="mt-3 flex items-center gap-2">
          <button
            className={cx("btn px-4 py-2 text-sm", running ? "" : "btn-primary")}
            onClick={() => setRunning((v) => !v)}
          >
            {running ? "Pause" : "Start mining"}
          </button>
          <span className="text-[11px] text-muted">
            DevNet rewards for learning. Low CPU usage. No wallet funds required.
          </span>
        </div>
      </div>
    </div>
  );
}

/* ——— Page ——— */
export default function Home() {
  const [persona, setPersona] = useState<Persona>("new");

  const items: Item[] = useMemo(
    () => [
      { key: "wallet",  title: "Wallet",  subtitle: "Send · receive · contacts", to: "/wallet",  icon: <WalletIcon />,      persona: ["new", "dev"] },
      { key: "explore", title: "Explore", subtitle: "Blocks · transactions",      to: "/explore", icon: <RingCompassIcon />, persona: ["new", "dev"] },
      { key: "mempool", title: "Mempool", subtitle: "Queues · selection",         to: "/mempool", icon: <StackIcon />,       persona: ["dev"] },
      { key: "node",    title: "Node",    subtitle: "Control · logs",             to: "/node",    icon: <ServerIcon />,      persona: ["dev"] },
      { key: "ide",     title: "IDE",     subtitle: "Editor · Deploy · RPC",      to: "/ide",     icon: <CodeIcon />,        persona: ["dev"] },
      { key: "arkai",  title: "ArkAI",  subtitle: "Decentralized assistant", to: "/arkai",  icon: <RingCompassIcon /> },
    ],
    []
  );

  const visible = items.filter((x) => !x.persona || x.persona.includes(persona));

  return (
    <div className="relative h-full p-4">
      {/* background glow */}
      <div
        aria-hidden
        className="pointer-events-none absolute -z-10 top-[-10%] left-1/2 -translate-x-1/2 h-[580px] w-[580px] blur-[90px] opacity-60"
        style={{ background: "radial-gradient(closest-side, rgba(106,169,255,.22), transparent 70%)" }}
      />

      {/* SCROLLABLE SECTION for small screens */}
      <section className="glass h-full rounded-2xl border border-border grid grid-rows-[auto_minmax(0,1fr)]">
        {/* sticky-ish header area */}
        <div className="px-6 py-5 md:px-8 md:py-6 border-b border-border">
          <header className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <Logo />
              <div>
                <div className="text-sm text-muted">Arknet Desktop</div>
                <h1 className="text-2xl md:text-3xl font-semibold tracking-tight">
                  <span className="bg-gradient-to-br from-primary to-accent bg-clip-text text-transparent">
                    Command Center
                  </span>
                </h1>
              </div>
            </div>
            <div className="hidden md:flex items-center gap-3 text-[12px] text-muted">
              <Kbd>⌘K</Kbd>
              <span>Palette</span>
              <span className="mx-1 opacity-50">·</span>
              <PillToggle value={persona} onChange={setPersona} />
            </div>
          </header>
        </div>

        {/* scrollable content */}
        <div className="min-h-0 overflow-auto px-6 py-6 md:px-8 md:py-8">
          {/* hero */}
          <div className="grid md:grid-cols-[1fr_auto] gap-6 md:gap-10 items-center">
            <div>
              <p className="text-base md:text-[17px] text-muted">
                Spin up a node, ship transactions, explore blocks, and build programs — all in one place.
              </p>
              <div className="mt-4 flex flex-wrap items-center gap-2">
                <Chip>Beginner-friendly</Chip>
                <Chip>Keyboard-first</Chip>
                <Chip>60fps Motion</Chip>
                <Chip>High Contrast</Chip>
              </div>

              {/* primary CTAs */}
              <div className="mt-6 md:mt-8 flex flex-wrap items-center gap-3 md:gap-4">
                <CTA persona={persona} />
                <span className="text-[12px] text-muted">Switch personas anytime.</span>
              </div>
            </div>

            <div className="relative hidden md:block">
              <div
                className="h-[220px] w-[220px] rounded-full blur-[56px] opacity-55"
                style={{ background: "radial-gradient(closest-side, rgba(106,169,255,.32), transparent 70%)" }}
              />
              <div className="absolute inset-0 grid place-items-center">
                <svg width="168" height="168" viewBox="0 0 120 120" className="animate-float">
                  <defs>
                    <linearGradient id="ring" x1="0" y1="0" x2="1" y2="1">
                      <stop offset="0%" stopColor="#6aa9ff" />
                      <stop offset="100%" stopColor="#b59cff" />
                    </linearGradient>
                  </defs>
                  <circle cx="60" cy="60" r="50" stroke="url(#ring)" strokeWidth="2" fill="none" opacity=".65" />
                </svg>
              </div>
            </div>
          </div>

          {/* nav grid */}
          <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {visible.map((it) => (
              <NavCard key={it.key} item={it} />
            ))}
          </div>

          {/* quick start + status (+ miner for NEW) */}
          <div className="mt-8 grid gap-4 xl:grid-cols-[minmax(0,1.2fr)_minmax(320px,.8fr)]">
            <div className="glass p-4 rounded-xl border border-border">
              <div className="flex items-center justify-between">
                <div className="text-[12px] text-muted">Quick start</div>
                <span className="text-[11px] text-muted">{persona === "new" ? "For newcomers" : "For developers"}</span>
              </div>
              {persona === "new" ? <QuickStartNew /> : <QuickStartDev />}
            </div>

            <div className="grid gap-4">
              <div className="glass p-4 rounded-xl border border-border grid gap-2">
                <div className="text-[12px] text-muted mb-1">Network status</div>
                <div className="grid grid-cols-2 gap-3">
                  <Stat label="Tip" value="128" hint="Latest finalized block height" />
                  <Stat label="Peers" value="14" hint="Connected peers" />
                  <Stat label="Sync" value="✓" hint="Node is synced" />
                  <Stat label="Latency" value="34ms" hint="Round-trip to best peer" />
                </div>
                <div className="mt-2 text-[12px] text-muted">
                  Press <Kbd>⌘K</Kbd> to jump anywhere.
                </div>
              </div>

              {persona === "new" && <StarterMiner />}
            </div>
          </div>

          {/* footer hint */}
          <div className="mt-8 flex items-center justify-between text-[12px] text-muted">
            <span>Smooth 60fps · native-grade design</span>
            <span>Everything is keyboard-first</span>
          </div>
        </div>
      </section>
    </div>
  );
}

/* ——— Pieces ——— */
function CTA({ persona }: { persona: Persona }) {
  const nav = useNavigate();
  if (persona === "new") {
    return (
      <div className="flex items-center gap-3">
        <button className="btn btn-primary px-6 py-3 text-[15px] font-medium" onClick={() => nav("/wallet")}>
          Open Wallet
        </button>
        <button className="btn px-6 py-3 text-[15px] font-medium" onClick={() => nav("/explore")}>
          Explore Blocks
        </button>
      </div>
    );
  }
  return (
    <div className="flex items-center gap-3">
      <button className="btn btn-primary px-6 py-3 text-[15px] font-medium" onClick={() => nav("/ide")}>
        Open IDE
      </button>
      <button className="btn px-6 py-3 text-[15px] font-medium" onClick={() => nav("/node")}>
        Manage Node
      </button>
    </div>
  );
}

function Bullet({ children }: { children: React.ReactNode }) {
  return <li className="flex items-start gap-2"><span className="mt-[6px] h-1.5 w-1.5 rounded-full bg-white/30" />{children}</li>;
}

function QuickStartNew() {
  return (
    <ol className="list-none grid gap-2 mt-2 text-sm">
      <Bullet><span className="text-muted">1.</span>&nbsp;Open <span className="font-medium">Wallet</span> and create / import an address.</Bullet>
      <Bullet><span className="text-muted">2.</span>&nbsp;Use <span className="font-medium">Receive</span> to get ARK (test funds).</Bullet>
      <Bullet><span className="text-muted">3.</span>&nbsp;Try the <span className="font-medium">Starter Miner</span> (DevNet) to see how blocks are made.</Bullet>
      <Bullet><span className="text-muted">4.</span>&nbsp;Send a small <span className="font-medium">PAY</span> to a friend & watch in <span className="font-medium">Explore</span>.</Bullet>
    </ol>
  );
}

function QuickStartDev() {
  return (
    <ol className="list-none grid gap-2 mt-2 text-sm">
      <Bullet><span className="text-muted">1.</span>&nbsp;Open <span className="font-medium">IDE</span>, edit <code className="font-mono">/programs</code>.</Bullet>
      <Bullet><span className="text-muted">2.</span>&nbsp;Compile and deploy via <code className="font-mono">deploy.json</code>.</Bullet>
      <Bullet><span className="text-muted">3.</span>&nbsp;Inspect blocks in <span className="font-medium">Explore</span> & mempool.</Bullet>
      <Bullet><span className="text-muted">4.</span>&nbsp;Use the <span className="font-medium">RPC Playground</span> to test calls.</Bullet>
    </ol>
  );
}

function Stat({ label, value, hint }: { label: string; value: string; hint: string }) {
  return (
    <div className="relative group">
      <div className="text-[12px] text-muted">{label}</div>
      <div className="text-lg font-semibold">{value}</div>
      <div
        role="tooltip"
        className="pointer-events-none absolute left-0 top-full mt-1 min-w-[160px] rounded-md border border-border bg-white/60 dark:bg-white/5 px-2 py-1 text-[11px] text-muted shadow-elev2 opacity-0 group-hover:opacity-100 transition"
      >
        {hint}
      </div>
    </div>
  );
}

/* ——— tiny animation util ——— */
declare global {
  interface CSSStyleDeclaration {
    // just to make TS happy; no-op
  }
}
