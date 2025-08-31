// src/components/BootScreen.tsx
import React from "react";

export default function BootScreen() {
  return (
    <div className="h-full relative overflow-hidden">
      <AuroraBg />
      <div className="absolute inset-0 grid place-items-center p-6">
        <div className="glass w-full max-w-[560px] px-8 py-10 relative">
          <Logo />
          <div className="mt-6 flex items-center gap-4">
            <ProgressRing size={84} stroke={10} />
            <div>
              <div className="text-lg font-medium tracking-tight">Starting Arknet</div>
              <div className="text-muted text-sm">Preparing UI · Checking environment</div>
            </div>
          </div>

          <div className="mt-6 relative h-2 rounded-md overflow-hidden bg-[rgba(255,255,255,0.06)]">
            <div className="absolute inset-y-0 left-0 w-1/2 bg-[rgba(255,255,255,0.12)] animate-[width_2.4s_cubic-bezier(.3,0,.2,1)_infinite_alternate]"></div>
            <div className="absolute inset-0 -translate-x-1/2 w-1/2 bg-gradient-to-r from-transparent via-white/25 to-transparent animate-shimmer"></div>
          </div>

          <div className="mt-4 grid grid-cols-3 gap-3 text-xs text-muted">
            <Chip>UI</Chip><Chip>Fonts</Chip><Chip>Theme</Chip>
            <Chip>Panels</Chip><Chip>Icons</Chip><Chip>Locale</Chip>
            <Chip>Router</Chip><Chip>State</Chip><Chip>Ready</Chip>
          </div>

          <div className="mt-8 flex items-center justify-between">
            <span className="text-muted text-sm">macOS design · calm motion</span>
            <span className="text-muted text-sm">Arknet · MVP</span>
          </div>
        </div>
      </div>
    </div>
  );
}

function Chip({ children }: { children: React.ReactNode }) {
  return (
    <div className="px-2.5 py-1 rounded-md border border-border bg-[rgba(255,255,255,0.03)]">
      {children}
    </div>
  );
}

function Logo() {
  return (
    <div className="flex items-center gap-3">
      <div className="relative">
        <svg width="56" height="56" viewBox="0 0 56 56" className="animate-float">
          <defs>
            <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor="#6aa9ff" />
              <stop offset="100%" stopColor="#b59cff" />
            </linearGradient>
          </defs>
          <circle cx="28" cy="28" r="24" fill="url(#g)" opacity="0.18" />
          <path d="M28 10 L42 40 H36.5 L31.5 30 H24.5 L19.5 40 H14 L28 10 Z" fill="url(#g)"/>
        </svg>
        <div className="absolute inset-0 rounded-full blur-xl opacity-60 animate-glow"
             style={{ background: "radial-gradient(60% 60% at 50% 50%, rgba(106,169,255,.25), rgba(181,156,255,.08) 60%, transparent 70%)" }} />
      </div>
      <div>
        <div className="text-2xl font-semibold tracking-tight leading-none">Arknet</div>
        <div className="text-muted text-sm">Loading environment…</div>
      </div>
    </div>
  );
}

function ProgressRing({ size = 84, stroke = 10 }: { size?: number; stroke?: number }) {
  const R = (size - stroke) / 2;
  const C = 2 * Math.PI * R;
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      <circle cx={size/2} cy={size/2} r={R} stroke="rgba(255,255,255,0.12)" strokeWidth={stroke} fill="none" />
      <circle cx={size/2} cy={size/2} r={R} stroke="url(#ringGrad)" strokeWidth={stroke} fill="none"
              strokeLinecap="round" strokeDasharray={C} className="animate-sweep"
              style={{ transform: "rotate(-90deg)", transformOrigin: "50% 50%" }}/>
      <defs>
        <linearGradient id="ringGrad" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#6aa9ff" />
          <stop offset="100%" stopColor="#b59cff" />
        </linearGradient>
      </defs>
    </svg>
  );
}

function AuroraBg() {
  return (
    <div className="absolute inset-0">
      <div className="absolute inset-0"
           style={{ background: "radial-gradient(1200px 600px at 10% 10%, rgba(106,169,255,.20), transparent 60%), radial-gradient(900px 480px at 90% 30%, rgba(181,156,255,.16), transparent 60%)" }} />
      <DotGrid />
    </div>
  );
}

function DotGrid() {
  const dots = Array.from({ length: 140 });
  return (
    <div className="absolute inset-0 opacity-30">
      <svg className="w-full h-full">
        {dots.map((_, i) => {
          const x = (i % 14) * 80 + 20;
          const y = Math.floor(i / 14) * 80 + 20;
          return <circle key={i} cx={x} cy={y} r="1.2" fill="white" className="animate-glow" style={{ animationDelay: `${(i%7)*120}ms` }} />;
        })}
      </svg>
    </div>
  );
}
