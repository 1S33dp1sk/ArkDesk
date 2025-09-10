// src/components/BackgroundFX.tsx

export default function BackgroundFX() {
  return (
    <div className="absolute inset-0 -z-10 overflow-hidden">
      {/* Aurora blobs */}
      <div
        aria-hidden
        className="absolute -top-40 -left-40 h-[700px] w-[700px] rounded-full blur-[120px] opacity-40 animate-float"
        style={{ background: "radial-gradient(closest-side, rgba(106,169,255,.45), transparent 70%)" }}
      />
      <div
        aria-hidden
        className="absolute top-10 right-[-200px] h-[560px] w-[560px] rounded-full blur-[120px] opacity-35 animate-float"
        style={{ background: "radial-gradient(closest-side, rgba(181,156,255,.40), transparent 70%)", animationDelay: "600ms" }}
      />
      {/* Light beams */}
      <div className="pointer-events-none absolute inset-0 rotate-[8deg]">
        <div className="absolute top-1/3 -left-1/3 h-[3px] w-[120%] bg-gradient-to-r from-transparent via-white/35 to-transparent blur-[2px] animate-beam" />
        <div className="absolute top-[60%] -left-1/3 h-[2px] w-[120%] bg-gradient-to-r from-transparent via-white/25 to-transparent blur-[1px] animate-beam" style={{ animationDelay: "1.4s" }} />
      </div>
      {/* Subtle dot grid */}
      <svg className="absolute inset-0 opacity-25" width="100%" height="100%">
        {Array.from({ length: 160 }).map((_, i) => {
          const cols = 16, gap = 80;
          const x = (i % cols) * gap + 24, y = Math.floor(i / cols) * gap + 24;
          return <circle key={i} cx={x} cy={y} r="1.1" fill="white" className="animate-glow" style={{ animationDelay: `${(i%7)*120}ms` }} />;
        })}
      </svg>
      {/* Noise film */}
      <div
        aria-hidden
        className="absolute inset-0 opacity-[0.03] mix-blend-overlay"
        style={{ backgroundImage: "url('data:image/svg+xml;utf8,<svg xmlns=%22http://www.w3.org/2000/svg%22 width=%2240%22 height=%2240%22><filter id=%22n%22><feTurbulence type=%22fractalNoise%22 baseFrequency=%220.9%22 numOctaves=%222%22/></filter><rect width=%2240%22 height=%2240%22 filter=%22url(%23n)%22 opacity=%220.6%22/></svg>')" }}
      />
    </div>
  );
}
