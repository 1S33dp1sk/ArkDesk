// src/components/BackgroundFX.tsx
// Client-side, low-DOM, GPU-friendly background with subtle parallax & extra sheen — Arknet style.
'use client'

import * as React from 'react';

export default function BackgroundFX(): JSX.Element {
  const ref = React.useRef<HTMLDivElement>(null);

  // Pointer-parallax via CSS variables (motion-safe, rAF-lerped)
  React.useEffect(() => {
    const mql = window.matchMedia('(prefers-reduced-motion: reduce)');
    if (mql.matches) return;

    let raf = 0;
    let x = 0, y = 0, tx = 0, ty = 0;

    const onMove = (e: PointerEvent) => {
      tx = (e.clientX / window.innerWidth - 0.5) * 2;
      ty = (e.clientY / window.innerHeight - 0.5) * 2;
      if (!raf) loop();
    };

    const onLeave = () => {
      tx = 0; ty = 0;
      if (!raf) loop();
    };

    const loop = () => {
      x += (tx - x) * 0.06;
      y += (ty - y) * 0.06;
      if (ref.current) {
        ref.current.style.setProperty('--mx', x.toFixed(4));
        ref.current.style.setProperty('--my', y.toFixed(4));
      }
      if (Math.abs(tx - x) > 0.001 || Math.abs(ty - y) > 0.001) {
        raf = requestAnimationFrame(loop);
      } else {
        raf = 0;
      }
    };

    window.addEventListener('pointermove', onMove, { passive: true });
    window.addEventListener('pointerleave', onLeave, { passive: true });
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerleave', onLeave);
      if (raf) cancelAnimationFrame(raf);
    };
  }, []);

  return (
    <div
      ref={ref}
      aria-hidden
      className="pointer-events-none absolute inset-0 -z-10 overflow-hidden
                 [mask-image:radial-gradient(120%_120%_at_50%_40%,#000_60%,transparent_100%)]
                 [-webkit-mask-image:radial-gradient(120%_120%_at_50%_40%,#000_60%,transparent_100%)]"
      style={
        {
          // Brand-tunable variables (override in :root or theme)
          // --ark-aurora-1: hsl(220 95% 65% / 0.45);
          // --ark-aurora-2: hsl(270 90% 70% / 0.40);
          // --ark-aurora-3: hsl(200 85% 72% / 0.22);
          // --ark-grid:     hsla(0,0%,100%,0.18);
          // --mx / --my set at runtime for parallax
          ['--mx' as any]: 0,
          ['--my' as any]: 0
        } as React.CSSProperties
      }
    >
      {/* Aurora (parallax group) */}
      <div className="absolute inset-0 will-change-transform"
           style={{ transform: 'translate3d(calc(var(--mx,0)*12px), calc(var(--my,0)*10px), 0)' }}>
        <div
          className="absolute -top-48 -left-44 h-[72vmin] w-[72vmin] rounded-full blur-[120px]
                     opacity-50 will-change-transform motion-safe:animate-float"
          style={{ background: 'radial-gradient(closest-side, var(--ark-aurora-1, rgba(106,169,255,.45)), transparent 70%)' }}
        />
        <div
          className="absolute top-[6vh] -right-56 h-[60vmin] w-[60vmin] rounded-full blur-[120px]
                     opacity-45 will-change-transform motion-safe:animate-float"
          style={{
            background: 'radial-gradient(closest-side, var(--ark-aurora-2, rgba(181,156,255,.40)), transparent 70%)',
            animationDelay: '600ms'
          }}
        />
        {/* Subtle third glow for depth */}
        <div
          className="absolute bottom-[-20vh] left-[35%] h-[44vmin] w-[44vmin] rounded-full blur-[120px]
                     opacity-40 will-change-transform motion-safe:animate-float"
          style={{
            background: 'radial-gradient(closest-side, var(--ark-aurora-3, rgba(140,210,255,.22)), transparent 72%)',
            animationDelay: '1200ms'
          }}
        />
      </div>

      {/* Light beams (parallax, slight counter-shift) */}
      <div className="absolute inset-0 rotate-[8deg] will-change-transform"
           style={{ transform: 'translate3d(calc(var(--mx,0)*-6px), calc(var(--my,0)*-4px), 0)' }}>
        <div className="absolute top-1/3 -left-1/3 h-[3px] w-[130%]
                        bg-gradient-to-r from-transparent via-white/35 to-transparent
                        blur-[2px] motion-safe:animate-beam will-change-transform" />
        <div className="absolute top-[62%] -left-1/3 h-[2px] w-[130%]
                        bg-gradient-to-r from-transparent via-white/25 to-transparent
                        blur-[1px] motion-safe:animate-beam will-change-transform"
             style={{ animationDelay: '1.1s' }} />
      </div>

      {/* Dot grid + faint lines (single layer, combined backgrounds) */}
      <div
        className="absolute inset-0 opacity-25 will-change-transform"
        style={{
          transform: 'translate3d(calc(var(--mx,0)*2px), calc(var(--my,0)*2px), 0)',
          backgroundImage: [
            'radial-gradient(var(--ark-grid, rgba(255,255,255,0.18)) 1px, transparent 1.2px)',
            'linear-gradient(transparent 79px, rgba(255,255,255,0.035) 80px)',
            'linear-gradient(90deg, transparent 79px, rgba(255,255,255,0.035) 80px)'
          ].join(','),
          backgroundSize: '80px 80px, 80px 80px, 80px 80px',
          backgroundPosition: '24px 24px, 24px 24px, 24px 24px'
        }}
      />

      {/* Sheen sweep (uses built-in spin keyframes) */}
      <div
        className="absolute inset-0 opacity-[0.10] mix-blend-overlay will-change-transform motion-safe:animate-[spin_60s_linear_infinite]"
        style={{
          background: 'conic-gradient(from 220deg at 50% 40%, transparent 0 68%, rgba(255,255,255,.22) 78%, transparent 88%)'
        }}
      />

      {/* Film grain */}
      <div
        className="absolute inset-0 opacity-[0.035] mix-blend-overlay motion-safe:animate-grain"
        style={{
          backgroundImage:
            "url('data:image/svg+xml;utf8,<svg xmlns=%22http://www.w3.org/2000/svg%22 width=%2240%22 height=%22440%22><filter id=%22n%22><feTurbulence type=%22fractalNoise%22 baseFrequency=%220.8%22 numOctaves=%222%22/></filter><rect width=%2240%22 height=%22440%22 filter=%22url(%23n)%22 opacity=%220.7%22/></svg>')",
          backgroundSize: 'auto 100%'
        }}
      />
    </div>
  );
}
