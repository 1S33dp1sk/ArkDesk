// src/pages/World.tsx
// Arknet — World (Home Explorer). Full-bleed, screen-spanning, elegant motion + AI panel.
'use client';

import * as React from 'react';
import Section from '../ui/Section';
import { useNodeSnapshot } from '../hooks/useNode';

type Role = 'relay' | 'miner';
// type Health = { ok: boolean; version: string; abiRev: number; uptimeMs: number; features?: string[]; net?: { id: number; name: string } };
type StatusModel = { peers?: number; producerOn?: boolean; role?: Role | string; networkHeight?: number; nodeRunning?: boolean; rpc?: { host: string; port: number } };
type BlockItem = { height: number; ts: number };
type AiStats = { qps: number; activeJobs: number; trainers: number; gpuUtil: number; queued: number; datasets: number; model: string; tipHash: string };

export default function World(): React.ReactElement {
  const { health, status, tipHeight, mempool, role } = useNodeSnapshot();

  const [blocks, setBlocks] = React.useState<BlockItem[]>([]);
  const [tpsHist, setTpsHist] = React.useState<number[]>(Array(90).fill(0));
  const [peerHist, setPeerHist] = React.useState<number[]>(Array(90).fill(0));

  const [ai, setAi] = React.useState<AiStats>(() => synthAi());
  const [aiQpsHist, setAiQpsHist] = React.useState<number[]>(Array(90).fill(0));
  const [aiTrainHist, setAiTrainHist] = React.useState<number[]>(Array(90).fill(0));

  const lastHeightRef = React.useRef<number | null>(null);
  const lastTipTsRef = React.useRef<number>(Date.now());

  // Peer sparkline from status updates
  React.useEffect(() => {
    const p = Number(status?.peers ?? 0);
    setPeerHist(h => push(h, p, 90));
  }, [status?.peers]);

  // Blocks + TPS from tipHeight (single source of truth)
  React.useEffect(() => {
    const h = Number(tipHeight ?? 0);
    if (!Number.isFinite(h) || h <= 0) return;

    const prev = lastHeightRef.current;
    const now = Date.now();

    if (prev == null) {
      lastHeightRef.current = h;
      lastTipTsRef.current = now;
      return;
    }

    if (h > prev) {
      const delta = h - prev;
      const ts = now;
      const add: BlockItem[] = [];
      for (let i = prev + 1; i <= h; i++) add.push({ height: i, ts });
      setBlocks(b => trim(b.concat(add), 48));

      const seconds = Math.max(1, Math.round((now - lastTipTsRef.current) / 1000));
      setTpsHist(hist => push(hist, delta / seconds, 90));

      lastHeightRef.current = h;
      lastTipTsRef.current = now;
    }
  }, [tipHeight]);

  // Synthetic AI panel (optional, replace with real ai.stats later)
  React.useEffect(() => {
    const id = setInterval(() => {
      const target = synthAi(status as Partial<StatusModel> | undefined, mempool);
      setAi(cur => ({
        ...target,
        qps: lerp(cur.qps, target.qps, 0.25),
        gpuUtil: lerp(cur.gpuUtil, target.gpuUtil, 0.2),
        activeJobs: approachInt(cur.activeJobs, target.activeJobs),
        trainers: approachInt(cur.trainers, target.trainers),
        queued: approachInt(cur.queued, target.queued),
        datasets: approachInt(cur.datasets, target.datasets),
      }));
      setAiQpsHist(h => push(h, target.qps, 90));
      setAiTrainHist(h => push(h, target.activeJobs + target.queued * 0.4, 90));
    }, 1000);
    return () => clearInterval(id);
  }, [status?.peers, mempool]);

  const running = !!status?.nodeRunning;
  const netName = health?.net?.name ?? '—';
  const netId = health?.net?.id != null ? `#${health!.net!.id}` : '—';
  const rpc = status?.rpc ? `${status.rpc.host}:${status.rpc.port}` : '—';

  return (
    <div className="h-full w-full overflow-auto">
      {/* HERO — full-bleed */}
      <div className="relative mx-0 mb-6 border-b border-white/10 bg-white/[0.02] px-6 py-6">
        <GlassAura />
        <div className="relative grid gap-6 md:grid-cols-[1.2fr_.8fr]">
          <div>
            <div className="text-[12px] tracking-[.14em] text-white/60 uppercase">Arknet</div>
            <div className="text-[28px] font-semibold leading-tight">World</div>
            <div className="mt-1 text-[12px] text-white/70">
              Network <b className="text-white/90">{netName}</b> <span className="text-white/50">{netId}</span>
              <span className="mx-2">·</span> Node <b className={running ? 'text-emerald-400' : 'text-white/60'}>{running ? 'running' : 'stopped'}</b>
            </div>

            <div className="mt-5 grid gap-3 sm:grid-cols-4">
              <Kpi title="Height" value={tipHeight ?? status?.networkHeight ?? '…'} />
              <Kpi title="TPS" value={fmt(tpsHist[tpsHist.length - 1])}><Sparkline data={tpsHist} height={40} /></Kpi>
              <Kpi title="Peers" value={status?.peers ?? '…'}><Sparkline data={peerHist} height={40} /></Kpi>
              <Kpi title="Producer" value={status ? (status.producerOn ? 'on' : 'off') : '…'} />
            </div>

            <div className="mt-4 flex flex-wrap gap-2">
              <NavPill href="#explorer/blocks">Blocks</NavPill>
              <NavPill href="#explorer/txs">Transactions</NavPill>
              <NavPill href="#explorer/modules">Modules</NavPill>
              <NavPill href="#explorer/wallets">Wallets</NavPill>
              <NavPill href="#explorer/governance">Governance</NavPill>
              <NavPill href="#explorer/lineage">Model Lineage</NavPill>
            </div>
          </div>

          <RunePanel>
            <div className="flex items-center justify-between">
              <div className="text-[12px] tracking-widest uppercase text-white/60">Node Meta</div>
              <div className="flex items-center gap-2 text-[12px]">
                <StatusDot ok={!!Number(status?.peers ?? 0)} />
                <span className="text-white/70">{Number(status?.peers ?? 0) ? 'Connected' : 'Offline'}</span>
              </div>
            </div>

            {/* Tiny network viz */}
            <div className="mt-2 rounded-lg border border-white/10 bg-white/[0.02]">
              <MiniNetwork peers={status?.peers ?? 0} connected={!!Number(status?.peers ?? 0)} />
            </div>

            {/* Key facts */}
            <div className="mt-3 grid grid-cols-1 gap-2">
              <InfoRow
                label="RPC"
                value={<span className="font-mono text-[12px] tabular-nums">{rpc}</span>}
                copy={rpc !== '—' ? rpc : undefined}
              />
              <InfoRow label="Version" value={health?.version ?? '…'} />
              <InfoRow label="ABI" value={health?.abiRev ?? '…'} />
              <InfoRow label="Role" value={(role ?? '—').toString()} />
              <InfoRow
                label="Producer"
                value={
                  <span className={status?.producerOn ? 'text-emerald-400' : 'text-white/60'}>
                    {status ? (status.producerOn ? 'on' : 'off') : '…'}
                  </span>
                }
              />
              <InfoRow
                label="Features"
                value={
                  (health?.features ?? []).length ? (
                    <div className="flex flex-wrap gap-1.5">
                      {health!.features!.map(f => (
                        <span key={f} className="rounded border border-white/10 bg-white/5 px-1.5 py-[1px] text-[11px]">{f}</span>
                      ))}
                    </div>
                  ) : '—'
                }
              />
            </div>
          </RunePanel>
        </div>
      </div>

      {/* RUNWAY — full-bleed strip */}
      <div className="mx-0 mb-6 px-6">
        <Runway blocks={blocks} />
      </div>

      {/* GRID — fills width */}
      <div className="grid gap-4 px-6 lg:grid-cols-3">
        <Section title="Latest Blocks" padding="sm">
          <BlocksList items={blocks.slice(-14).reverse()} />
        </Section>

        <Section title="AI — Model & Training" padding="sm">
          <div className="grid gap-4 sm:grid-cols-[140px_1fr]">
            <Donut value={ai.gpuUtil} label="GPU" sub="utilization" />
            <div className="grid gap-3">
              <div className="grid grid-cols-3 gap-2 text-center">
                <MiniKpi label="QPS" value={fmt(ai.qps)} />
                <MiniKpi label="Jobs" value={ai.activeJobs} />
                <MiniKpi label="Trainers" value={ai.trainers} />
              </div>

              <div className="flex flex-wrap items-center gap-2 text-[12px] text-white/70">
                <span>Model <b className="text-white/90">{ai.model}</b></span>
                <span className="opacity-50">·</span>
                <span>Tip <b className="text-white/90">{ai.tipHash}</b></span>
                <span className="opacity-50">·</span>
                <Tag>Datasets {ai.datasets}</Tag>
                <Tag>Queued {ai.queued}</Tag>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <SparkCard title="Inference QPS"><Sparkline data={aiQpsHist} height={48} /></SparkCard>
                <SparkCard title="Training Activity"><Sparkline data={aiTrainHist} height={48} /></SparkCard>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <Meter label="GPU Util" value={ai.gpuUtil / 100} />
                <Meter label="Queue Saturation" value={clamp(ai.queued / 20, 0, 1)} />
              </div>

              <div className="flex gap-2">
                <NavPill href="#explorer/lineage">Open Lineage</NavPill>
                <NavPill href="#explorer/governance">Dataset Votes</NavPill>
              </div>
            </div>
          </div>
        </Section>

        <Section title="Mempool" padding="sm">
          <div className="flex items-end justify-between">
            <div className="text-2xl tabular-nums">{mempool ?? 0}</div>
            <div className="text-[12px] text-white/70">tx pending</div>
          </div>
          <div className="mt-2"><Sparkbar data={barsFrom(tpsHist, 36)} height={36} /></div>
          <div className="mt-3"><NavPill href="#explorer/txs">Open Transactions</NavPill></div>
        </Section>
      </div>

      <div className="h-6" />
    </div>
  );
}

/* ── visuals ── */

function GlassAura() {
  return (
    <div
      aria-hidden
      className="pointer-events-none absolute inset-0 -z-10 overflow-hidden [mask-image:radial-gradient(120%_120%_at_50%_0%,#000_28%,transparent_100%)]"
    >
      <div className="absolute -top-32 -left-24 h-[56vmin] w-[56vmin] rounded-full blur-[90px] opacity-50"
           style={{ background:'radial-gradient(circle, rgba(216,185,128,.34), transparent 70%)' }} />
      <div className="absolute -top-16 right-0 h-[48vmin] w-[48vmin] rounded-full blur-[100px] opacity-45"
           style={{ background:'radial-gradient(circle, rgba(144,216,255,.32), transparent 70%)' }} />

      {/* smoother, slower; disabled if prefers-reduced-motion */}
      <div
        className="absolute inset-0 opacity-[0.06] mix-blend-overlay aura-spin"
        style={{ background:'conic-gradient(from 210deg at 50% 10%, transparent 0 65%, rgba(255,255,255,.22) 75%, transparent 85%)' }}
      />

      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        .aura-spin { animation: spin 90s linear infinite; }
        @media (prefers-reduced-motion: reduce) {
          .aura-spin { animation: none !important; }
        }
      `}</style>
    </div>
  );
}

function RunePanel({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative overflow-hidden rounded-xl border border-white/10 bg-white/[0.03] p-4">
      {/* subtle tint only, no dashed rect */}
      <div aria-hidden className="pointer-events-none absolute inset-0 rounded-xl bg-gradient-to-b from-white/[0.03] to-transparent" />
      <div className="relative">{children}</div>
    </div>
  );
}

function InfoRow(props: { label: string; value: React.ReactNode; copy?: string }) {
  const { label, value, copy } = props;
  const [ok, setOk] = React.useState(false);
  const onCopy = async () => {
    if (!copy) return;
    try { await navigator.clipboard.writeText(copy); setOk(true); setTimeout(() => setOk(false), 900); } catch {}
  };
  return (
    <div className="grid grid-cols-[120px_1fr_auto] items-center gap-2 rounded-md bg-white/[0.02] px-2 py-1.5">
      <div className="text-[11px] uppercase tracking-wide text-white/50">{label}</div>
      <div className="min-w-0 truncate text-[13px] text-white/90">{value}</div>
      {copy ? (
        <button onClick={onCopy} className="rounded-md border border-white/10 px-2 py-1 text-[11px] text-white/70 hover:bg-white/5">
          {ok ? 'Copied' : 'Copy'}
        </button>
      ) : <span />}
    </div>
  );
}

function StatusDot({ ok }: { ok: boolean }) {
  return (
    <span
      className="inline-block h-2.5 w-2.5 rounded-full"
      style={{ background: ok ? '#22c55e' : '#9ca3af', boxShadow: ok ? '0 0 10px rgba(34,197,94,.7)' : 'none' }}
      aria-label={ok ? 'connected' : 'offline'}
    />
  );
}

function NavPill({ href, children }: { href: string; children: React.ReactNode }) {
  return <a href={href} className="rounded-md border border-white/10 px-3 py-1.5 text-[12px] hover:bg-white/5">{children}</a>;
}

function Kpi(props: { title: string; value: React.ReactNode; children?: React.ReactNode }) {
  const { title, value, children } = props;
  return (
    <div className="overflow-hidden rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3">
      <div className="text-[12px] text-white/65">{title}</div>
      <div className="mt-0.5 text-2xl tabular-nums">{value}</div>
      {children ? <div className="mt-2">{children}</div> : null}
    </div>
  );
}

function MiniKpi({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2">
      <div className="text-[11px] text-white/60">{label}</div>
      <div className="text-lg tabular-nums">{value}</div>
    </div>
  );
}

function Tag({ children }: { children: React.ReactNode }) {
  return <span className="rounded border border-white/10 bg-white/[0.04] px-2 py-[2px] text-[11px]">{children}</span>;
}

function SparkCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="overflow-hidden rounded-lg border border-white/10 bg-white/[0.03] p-3">
      <div className="mb-1 text-[11px] text-white/60">{title}</div>
      {children}
    </div>
  );
}

function Donut({ value, label, sub }: { value: number; label: string; sub?: string }) {
  const clamped = Math.max(0, Math.min(100, value));
  const R = 46, C = 2 * Math.PI * R, p = (clamped / 100) * C;
  return (
    <div className="grid place-items-center">
      <svg width="120" height="120" viewBox="0 0 120 120">
        <defs>
          <linearGradient id="g-donut" x1="1" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="rgba(144,216,255,1)" />
            <stop offset="100%" stopColor="rgba(216,185,128,1)" />
          </linearGradient>
        </defs>
        <g transform="translate(60,60)">
          <circle r={R} fill="none" stroke="rgba(255,255,255,.1)" strokeWidth="10" />
          <circle r={R} fill="none" stroke="url(#g-donut)" strokeWidth="10" strokeLinecap="round"
                  strokeDasharray={`${p} ${C - p}`} transform="rotate(-90)" />
        </g>
      </svg>
      <div className="mt-[-32px] text-center">
        <div className="text-xl tabular-nums">{Math.round(clamped)}%</div>
        <div className="text-[11px] text-white/60">{label}{sub ? ` · ${sub}` : ''}</div>
      </div>
    </div>
  );
}

/* ── responsive charts ── */

function useMeasure<T extends HTMLElement>(): [React.RefObject<T | null>, number, number] {
  const ref = React.useRef<T | null>(null);
  const [{ w, h }, set] = React.useState({ w: 0, h: 0 });
  React.useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(entries => {
      const r = entries[0]?.contentRect;
      if (r) set({ w: Math.max(1, r.width | 0), h: Math.max(1, r.height | 0) });
    });
    ro.observe(el);
    set({ w: el.clientWidth || 1, h: el.clientHeight || 1 });
    return () => ro.disconnect();
  }, []);
  return [ref, w, h];
}

function Sparkline({ data, height = 40 }: { data: number[]; height?: number }) {
  const [ref, w] = useMeasure<HTMLDivElement>();
  const h = height;
  const min = Math.min(...data), max = Math.max(...data);
  const norm = (v: number) => (max === min ? h/2 : h - ((v - min) / (max - min)) * (h - 6) - 3);
  const step = (w - 6) / Math.max(1, data.length - 1);
  const pts = data.map((v, i) => `${3 + i * step},${norm(v)}`).join(' ');
  const last = data[data.length - 1] ?? 0;
  return (
    <div ref={ref} className="w-full">
      <svg width={w} height={h}>
        <defs>
          <linearGradient id="g-line" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="rgba(144,216,255,.7)" />
            <stop offset="100%" stopColor="rgba(216,185,128,.5)" />
          </linearGradient>
        </defs>
        <polyline points={pts} fill="none" stroke="url(#g-line)" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
        <circle cx={3 + (data.length - 1) * step} cy={norm(last)} r="2" fill="white" />
      </svg>
    </div>
  );
}

function Sparkbar({ data, height = 36 }: { data: number[]; height?: number }) {
  const [ref, w] = useMeasure<HTMLDivElement>();
  const h = height;
  const max = Math.max(1, ...data);
  const bw = Math.max(2, Math.floor((w - data.length) / data.length));
  return (
    <div ref={ref} className="w-full">
      <svg width={w} height={h}>
        {data.map((v, i) => {
          const x = i * (bw + 1);
          const hh = Math.max(2, Math.round((v / max) * (h - 2)));
          return <rect key={i} x={x} y={h - hh} width={bw} height={hh} rx="1" fill="rgba(144,216,255,.65)" />;
        })}
      </svg>
    </div>
  );
}

function Meter({ label, value }: { label: string; value: number }) {
  const v = clamp(value, 0, 1);
  return (
    <div className="rounded-lg border border-white/10 bg-white/[0.03] p-3">
      <div className="mb-2 flex items-center justify-between text-[11px] text-white/60">
        <span>{label}</span>
        <span className="tabular-nums text-white/80">{Math.round(v * 100)}%</span>
      </div>
      <div className="h-2 w-full rounded-full bg-white/[0.08]">
        <div className="h-2 rounded-full" style={{ width: `${v * 100}%`, background: 'linear-gradient(90deg, rgba(144,216,255,1), rgba(216,185,128,1))' }} />
      </div>
    </div>
  );
}

/* ── blocks ── */

function Runway({ blocks }: { blocks: BlockItem[] }) {
  const row = blocks.slice(-18).reverse();
  return (
    <div className="relative overflow-hidden rounded-2xl border border-white/10 bg-white/[0.02] p-3">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(120%_60%_at_50%_-20%,rgba(255,255,255,.06),transparent_60%)]" />
      <div className="relative">
        <div className="mb-2 flex items-center gap-2 px-1 text-[12px] text-white/60">
          <span>Latest Blocks</span><span className="opacity-50">·</span><span>tap to open</span>
        </div>
        <div className="[perspective:1200px] overflow-hidden">
          <div
            className="runway-track whitespace-nowrap will-change-transform [transform-style:preserve-3d] [transform:rotateX(10deg)_translateZ(0)]"
          >
            {(row.length ? row : Array.from({ length: 12 }, (_, i) => ({ height: i + 1, ts: Date.now() }))).concat(row).map((b, i) => (
              <a
                key={`${b.height}-${i}`}
                href={`#/explorer/blocks/${b.height}`}
                className="mx-2 inline-flex min-w-[132px] items-center justify-between rounded-lg border border-white/10 bg-white/[0.04] px-3 py-2 text-[13px] hover:bg-white/[0.08]"
              >
                <span className="font-semibold tabular-nums">#{b.height}</span>
                <span className="text-white/60">{ago(b.ts)}</span>
              </a>
            ))}
          </div>

          <style>{`
            @keyframes runway { from { transform: translate3d(0,0,0); } to { transform: translate3d(-50%,0,0); } }
            .runway-track { animation: runway 22s linear infinite; }
            .runway-track:hover { animation-play-state: paused; }
            @media (prefers-reduced-motion: reduce) {
              .runway-track { animation: none !important; }
            }
          `}</style>
        </div>

      </div>
    </div>
  );
}

function BlocksList({ items }: { items: BlockItem[] }) {
  if (!items.length) return <div className="py-3 text-sm text-white/60">Waiting for blocks…</div>;
  return (
    <div className="divide-y divide-white/10">
      {items.map(b => (
        <a key={b.height} href={`#/explorer/blocks/${b.height}`} className="grid grid-cols-[1fr_auto_auto] items-center gap-3 rounded-md px-2 py-2 hover:bg-white/[0.03]">
          <span className="font-mono text-[13px] tabular-nums">#{b.height}</span>
          <span className="text-[12px] text-white/60">{ago(b.ts)}</span>
          <span className="text-[11px] text-white/50">{shortHash(b.height, b.ts)}</span>
        </a>
      ))}
    </div>
  );
}

function MiniNetwork({ peers, connected }: { peers: number; connected: boolean }) {
  const nodes = 8;
  const links: Array<[number, number]> = [];
  for (let i = 0; i < nodes; i++) links.push([i, (i + 1) % nodes]);
  for (let i = 0; i < nodes; i += 2) links.push([i, (i + 3) % nodes]);

  return (
    <svg className="block w-full" viewBox="0 0 260 160" aria-hidden>
      <defs>
        <radialGradient id="n-glow" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="rgba(216,185,128,.55)" />
          <stop offset="100%" stopColor="rgba(216,185,128,0)" />
        </radialGradient>
        <linearGradient id="g-line-mini" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="rgba(144,216,255,.8)" />
          <stop offset="100%" stopColor="rgba(216,185,128,.7)" />
        </linearGradient>
      </defs>
      <rect x="0" y="0" width="260" height="160" fill="transparent" />
      {links.map(([a, b], i) => {
        const A = ringPoint(a, nodes, 110, 80, 52);
        const B = ringPoint(b, nodes, 110, 80, 52);
        return (
          <g key={i}>
            <line x1={A.x} y1={A.y} x2={B.x} y2={B.y} stroke="rgba(255,255,255,.10)" strokeWidth="1" />
            <line x1={A.x} y1={A.y} x2={B.x} y2={B.y}
              stroke="url(#g-line-mini)" strokeWidth={1.5}
              opacity={Math.min(1, (peers / 48)) * (i % 3 === 0 ? 0.9 : 0.6)} />
          </g>
        );
      })}
      {Array.from({ length: nodes }).map((_, i) => {
        const P = ringPoint(i, nodes, 110, 80, 52);
        return (
          <g key={i}>
            <circle cx={P.x} cy={P.y} r="9" fill="url(#n-glow)" />
            <circle cx={P.x} cy={P.y} r="3.6" fill={connected ? '#7ee787' : '#9ca3af'} />
          </g>
        );
      })}
    </svg>
  );
}

/* ── utils ── */
function push<T>(arr: T[], v: T, cap: number) { const out = arr.slice(-cap + 1); out.push(v); return out; }
function trim<T>(xs: T[], cap: number) { return xs.length > cap ? xs.slice(-cap) : xs; }
function lerp(a: number, b: number, k: number) { return a + (b - a) * k; }
function clamp(n: number, min: number, max: number) { return Math.max(min, Math.min(max, n)); }
function approachInt(a: number, b: number) { return a + Math.sign(b - a) * Math.min(1, Math.abs(b - a)); }
function fmt(n: number) { return Number.isFinite(n) ? Math.round(n * 10) / 10 : '…'; }
function ago(ts: number) { const s = Math.max(0, ((Date.now() - ts) / 1000) | 0); if (s < 1) return 'now'; if (s < 60) return `${s | 0}s`; const m = (s / 60) | 0; return `${m}m`; }
function ringPoint(i: number, n: number, cx: number, cy: number, r: number) { const a = (i / n) * Math.PI * 2 - Math.PI / 2; return { x: cx + Math.cos(a) * r, y: cy + Math.sin(a) * r }; }
function barsFrom(xs: number[], n: number) { const take = xs.slice(-n); const min = Math.min(...take), max = Math.max(...take); return take.map(v => max === min ? 1 : ((v - min) / (max - min)) * 10 + 1); }
function shortHash(h: number, ts: number) { const x = (h ^ (ts & 0xffff)) >>> 0; return ('00000000' + x.toString(16)).slice(-8); }

function synthAi(s?: Partial<StatusModel>, mem?: number): AiStats {
  const peers = Number(s?.peers ?? 0);
  const base = 0.8 + Math.random() * 0.4;
  const qps = 2 + peers * 0.1 + (mem ?? 0) * 0.02 + Math.random() * 2;
  const trainers = Math.max(1, Math.round(peers * 0.15 + (Math.random() * 2)));
  const activeJobs = Math.max(0, Math.round((mem ?? 0) * 0.05) + Math.round(Math.random() * 3));
  const queued = Math.max(0, Math.round((mem ?? 0) * 0.03) + Math.round(Math.random() * 2));
  const gpuUtil = clamp(35 + peers * 1.2 + (mem ?? 0) * 0.4 + Math.random()*15, 5, 96);
  const datasets = 3 + (Math.round(Math.random() * 8));
  const model = 'ark:base-7b';
  const tipHash = 'm' + Math.random().toString(16).slice(2, 8) + '…' + Math.random().toString(16).slice(2, 6);
  return { qps: qps * base, activeJobs, trainers, gpuUtil, queued, datasets, model, tipHash };
}
