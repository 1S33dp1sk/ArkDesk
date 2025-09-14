// src/pages/Tx.tsx
'use client';

import * as React from 'react';
import { invoke } from '@tauri-apps/api/core';
import Section from '../ui/Section';
import { useNodeSnapshot } from '../hooks/useNode';

type TxView = {
  id?: string;
  hash?: string;
  status?: 'pending' | 'confirmed' | string;
  time?: number | string;              // unix ms or iso
  timestamp?: number | string;         // alt
  blockHeight?: number | null;
  block?: { height?: number; hash?: string } | null;
  from?: string | null;
  to?: string | null;
  amount?: number | string | null;
  value?: number | string | null;
  fee?: number | string | null;
  gasUsed?: number | string | null;
  gasLimit?: number | string | null;
  size?: number | string | null;
  nonce?: number | string | null;
  events?: any[];
  logs?: any[];
  raw?: any;
  [k: string]: any;
};

export default function TxPage({ id }: { id: string }) {
  const { tipHeight } = useNodeSnapshot();
  const [tx, setTx] = React.useState<TxView | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [err, setErr] = React.useState<string | null>(null);
  const [expanded, setExpanded] = React.useState(false);

  const prettyId = id;

  const fetchTx = React.useCallback(async () => {
    setErr(null);
    try {
      // Preferred: a single backend command that uses NodeBridge.rpc().call("tx.get",{id})
      const v = await invoke<any>('rpc_tx_lookup', { id: prettyId });
      setTx(normalizeTx(v, prettyId));
      setLoading(false);
    } catch (e: any) {
      setErr(String(e));
      setLoading(false);
    }
  }, [prettyId]);

  // initial load
  React.useEffect(() => {
    setLoading(true);
    setTx(null);
    fetchTx();
  }, [fetchTx]);

  // while pending, poll quickly until confirmed
  React.useEffect(() => {
    if (!tx) return;
    const isPending = !getBlockHeight(tx);
    if (!isPending) return;
    const t = setInterval(fetchTx, 2000);
    return () => clearInterval(t);
  }, [tx, fetchTx]);

  // recompute confirmations as chain tip increases
  const confirmations = React.useMemo(() => {
    const h = getBlockHeight(tx);
    if (!h || !tipHeight) return 0;
    return Math.max(0, Number(tipHeight) - Number(h) + 1);
  }, [tx, tipHeight]);

  const statusBadge = renderStatus(tx, confirmations);

  return (
    <div className="p-6 mx-auto max-w-6xl">
      <Hero hash={prettyId} status={statusBadge} onRefresh={fetchTx} loading={loading} />

      {loading ? (
        <Section variant="card" surface={2} padding="lg" headerPadding="md" title="Loading transaction">
          <div className="animate-pulse text-sm text-white/60">Querying node…</div>
        </Section>
      ) : err ? (
        <Section variant="card" surface={2} padding="lg" headerPadding="md" title="Couldn’t load transaction">
          <div className="text-sm text-rose-300/90">{err}</div>
          <div className="mt-2 text-xs text-white/60">
            Make sure you’ve added a Tauri command <code className="font-mono">rpc_tx_lookup</code> that calls your node’s RPC.
          </div>
        </Section>
      ) : !tx ? (
        <Section variant="card" surface={2} padding="lg" headerPadding="md" title="Not found">
          <div className="text-sm text-white/70">No transaction data returned.</div>
        </Section>
      ) : (
        <>
          <div className="grid gap-4 lg:grid-cols-[1.2fr_.8fr]">
            {/* Left: core facts */}
            <Section title="Overview" variant="card" surface={2} padding="lg" headerPadding="md">
              <div className="grid gap-3 sm:grid-cols-2">
                <KV label="Status" value={statusBadge} />
                <KV label="Confirmations" value={confirmations ? confirmations.toString() : '0'} />
                <KV label="Block" value={blockLink(tx)} />
                <KV label="Timestamp" value={formatTime(tx)} />
                <KV label="From" value={<MonoCopy text={tx.from} />} />
                <KV label="To" value={<MonoCopy text={tx.to} />} />
                <KV label="Amount" value={formatAmount(tx)} />
                <KV label="Fee" value={formatFee(tx)} />
                <KV label="Gas (used / limit)" value={formatGas(tx)} />
                <KV label="Size" value={formatSize(tx)} />
                <KV label="Nonce" value={fmtMaybe(tx.nonce)} />
                <KV label="ID" value={<MonoCopy text={tx.id || tx.hash || id} short />} full />
              </div>
            </Section>

            {/* Right: live meta */}
            <Section title="Live" variant="card" surface={2} padding="lg" headerPadding="md">
              <div className="grid gap-3">
                <MiniKpi label="Tip height" value={tipHeight ?? '—'} />
                <MiniKpi label="Confirmations" value={confirmations ?? 0} />
                <MiniKpi label="Status" value={plainStatus(tx)} />
              </div>
            </Section>
          </div>

          {/* Events / Logs */}
          <Section title="Events" variant="card" surface={2} padding="md" headerPadding="md">
            <EventsList tx={tx} />
          </Section>

          {/* Raw JSON */}
          <Section title="Raw JSON" variant="card" surface={2} padding="md" headerPadding="md">
            <div className="mb-2 flex items-center justify-end">
              <button
                onClick={() => setExpanded(x => !x)}
                className="rounded-md border border-white/10 bg-white/[0.05] px-2 py-1 text-[12px] hover:bg-white/[0.08]"
              >
                {expanded ? 'Collapse' : 'Expand'}
              </button>
            </div>
            <RawViewer data={tx.raw ?? tx} expanded={expanded} />
          </Section>
        </>
      )}
    </div>
  );
}

/* ───────────────────────── Components ───────────────────────── */

function Hero(props: { hash: string; status: React.ReactNode; onRefresh: () => void; loading: boolean }) {
  const { hash, status, onRefresh, loading } = props;
  const onCopy = async () => {
    try { await navigator.clipboard.writeText(hash); } catch {}
  };
  const onShare = async () => {
    const url = `#/explorer/txs/${hash}`;
    try { await navigator.clipboard.writeText(url); } catch {}
  };
  return (
    <div className="relative mb-5 overflow-hidden rounded-2xl border border-white/10 bg-white/[0.03]">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-10 opacity-70"
        style={{
          background:
            'radial-gradient(110% 130% at 0% 0%, rgba(144,216,255,.08), transparent 60%), radial-gradient(120% 120% at 100% 0%, rgba(216,185,128,.08), transparent 60%)',
        }}
      />
      <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
        <div className="min-w-0">
          <div className="text-[12px] uppercase tracking-[.14em] text-white/60">Transaction</div>
          <div className="mt-0.5 flex items-center gap-3">
            <code className="max-w-[70vw] truncate font-mono text-[13px] text-white/90 md:max-w-[48rem]">{hash}</code>
            <span>{status}</span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={onCopy} className="rounded-md border border-white/10 px-2 py-1 text-[12px] hover:bg-white/5">Copy</button>
          <button onClick={onShare} className="rounded-md border border-white/10 px-2 py-1 text-[12px] hover:bg-white/5">Share</button>
          <button
            onClick={onRefresh}
            disabled={loading}
            className="rounded-md border border-white/10 px-2 py-1 text-[12px] hover:bg-white/5 disabled:opacity-50"
          >
            {loading ? 'Refreshing…' : 'Refresh'}
          </button>
        </div>
      </div>
    </div>
  );
}

function KV({ label, value, full }: { label: string; value: React.ReactNode; full?: boolean }) {
  return (
    <div className={full ? 'sm:col-span-2' : ''}>
      <div className="text-[11px] uppercase tracking-wide text-white/60">{label}</div>
      <div className="mt-0.5 min-w-0 truncate text-[13px] text-white/90">{value ?? '—'}</div>
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

function StatusBadge({ tone, text }: { tone: 'pending' | 'ok' | 'fail' | 'info'; text: string }) {
  const bg =
    tone === 'ok' ? 'bg-emerald-500/20 text-emerald-300 border-emerald-400/30' :
    tone === 'pending' ? 'bg-amber-500/20 text-amber-300 border-amber-400/30' :
    tone === 'fail' ? 'bg-rose-500/20 text-rose-300 border-rose-400/30' :
    'bg-white/10 text-white/80 border-white/20';
  return <span className={`inline-flex items-center rounded-md border px-2 py-[2px] text-[11px] ${bg}`}>{text}</span>;
}

function MonoCopy({ text, short }: { text?: string | null; short?: boolean }) {
  if (!text) return <>—</>;
  const disp = short ? shorten(text, 10, 10) : text;
  const copy = async () => { try { await navigator.clipboard.writeText(text); } catch {} };
  return (
    <span className="inline-flex items-center gap-2">
      <code className="font-mono text-[12px]">{disp}</code>
      <button onClick={copy} className="rounded border border-white/10 px-1 py-[1px] text-[10px] text-white/70 hover:bg-white/5">Copy</button>
    </span>
  );
}

function EventsList({ tx }: { tx: TxView }) {
  const ev = Array.isArray(tx.events) ? tx.events : Array.isArray(tx.logs) ? tx.logs : [];
  if (!ev.length) return <div className="py-2 text-sm text-white/60">No events.</div>;
  return (
    <div className="divide-y divide-white/10 rounded-md border border-white/10">
      {ev.map((e, i) => (
        <div key={i} className="grid gap-2 p-3 sm:grid-cols-[120px_1fr]">
          <div className="text-[11px] uppercase tracking-wide text-white/60">#{i + 1}</div>
          <pre className="overflow-auto rounded bg-black/30 p-2 text-[12px] leading-relaxed text-white/85">
            {JSON.stringify(e, null, 2)}
          </pre>
        </div>
      ))}
    </div>
  );
}

function RawViewer({ data, expanded }: { data: any; expanded: boolean }) {
  const body = JSON.stringify(data, null, 2);
  return (
    <div className="rounded-md border border-white/10 bg-black/30">
      <pre className={`overflow-auto p-3 text-[12px] leading-relaxed ${expanded ? 'max-h-[64vh]' : 'max-h-[28vh]'} whitespace-pre-wrap break-words`}>
        {body}
      </pre>
    </div>
  );
}

/* ───────────────────────── Formatters ───────────────────────── */

function getBlockHeight(tx: TxView | null): number | undefined {
  if (!tx) return undefined;
  return Number(
    tx.blockHeight ??
    tx.block?.height ??
    (tx as any).block_height ??
    (tx as any).blockheight ??
    undefined
  ) || undefined;
}

function renderStatus(tx: TxView | null, conf: number) {
  const p = plainStatus(tx);
  if (p === 'Confirmed') return <StatusBadge tone="ok" text={`Confirmed (${conf})`} />;
  if (p === 'Pending') return <StatusBadge tone="pending" text="Pending" />;
  if (p === 'Failed') return <StatusBadge tone="fail" text="Failed" />;
  return <StatusBadge tone="info" text={p} />;
}

function plainStatus(tx: TxView | null) {
  if (!tx) return '—';
  const bh = getBlockHeight(tx);
  const st = String(tx.status || '').toLowerCase();
  if (bh || st === 'confirmed' || st === 'success') return 'Confirmed';
  if (st === 'failed' || st === 'reverted' || st === 'error') return 'Failed';
  return 'Pending';
}

function blockLink(tx: TxView) {
  const h = getBlockHeight(tx);
  const bh = h ? `#${h}` : '—';
  return h ? <a className="underline decoration-white/30 hover:decoration-white" href={`#/explorer/blocks/${h}`}>{bh}</a> : bh;
}

function formatTime(tx: TxView) {
  const t = tx.time ?? tx.timestamp ?? (tx as any)['time_ms'] ?? (tx as any)['ts'];
  if (!t) return '—';
  const n0 = typeof t === 'string' ? Date.parse(t) : Number(t);
  const n = Number.isFinite(n0) && n0 < 1e12 ? n0 * 1000 : n0;
  if (!Number.isFinite(n)) return String(t);
  const d = new Date(n);
  return d.toLocaleString();
}

function formatAmount(tx: TxView) {
  const raw = tx.amount ?? tx.value;
  if (raw == null) return '—';
  const n = Number(raw);
  if (!Number.isFinite(n)) return String(raw);
  return `${n} ARK`;
}

function formatFee(tx: TxView) {
  const raw = tx.fee ?? (tx as any)['feePaid'] ?? (tx as any)['paid'];
  if (raw == null) return '—';
  const n = Number(raw);
  if (!Number.isFinite(n)) return String(raw);
  return `${n} ARK`;
}

function formatGas(tx: TxView) {
  const used = tx.gasUsed ?? (tx as any)['gas_used'];
  const lim  = tx.gasLimit ?? (tx as any)['gas_limit'];
  const u = used == null ? '—' : String(used);
  const l = lim == null ? '—' : String(lim);
  return `${u} / ${l}`;
}

function formatSize(tx: TxView) {
  const s = tx.size ?? (tx as any)['bytes'] ?? null;
  if (s == null) return '—';
  const n = Number(s);
  if (!Number.isFinite(n)) return String(s);
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(2)} MB`;
}

function fmtMaybe(v: any) {
  if (v == null) return '—';
  return String(v);
}

function shorten(s: string, head = 8, tail = 8) {
  if (s.length <= head + tail + 3) return s;
  return s.slice(0, head) + '…' + s.slice(-tail);
}

/* ───────────────────────── Normalizer ───────────────────────── */

function normalizeTx(input: any, idGuess?: string): TxView {
  if (!input || typeof input !== 'object') return { id: idGuess, raw: input };
  const o = input as Record<string, any>;

  // common id/hash fields
  const id = o.id ?? o.txid ?? o.hash ?? o.tx_hash ?? idGuess;
  const hash = o.hash ?? o.txid ?? o.tx_hash ?? id ?? idGuess;

  // block height & block object
  const blockHeight =
    o.blockHeight ?? o.block_height ?? o.blockheight ?? o.blockNumber ?? o.height ?? o.block?.height ?? null;

  const block = o.block ?? (blockHeight != null ? { height: Number(blockHeight) || undefined, hash: o.blockHash ?? o.block_hash } : null);

  // participants
  const from = o.from ?? o.sender ?? o.src ?? null;
  const to = o.to ?? o.recipient ?? o.dst ?? null;

  // value, fee, gas
  const amount = o.amount ?? o.value ?? o.outputs_value ?? null;
  const fee = o.fee ?? o.feePaid ?? o.paid ?? o.networkFee ?? null;
  const gasUsed = o.gasUsed ?? o.gas_used ?? o.receipt?.gasUsed ?? null;
  const gasLimit = o.gasLimit ?? o.gas_limit ?? o.gas ?? null;

  // time
  const time = o.time ?? o.timestamp ?? o.time_ms ?? o.ts ?? o.blockTime ?? o.block_time;

  // events/logs
  const events = Array.isArray(o.events) ? o.events : Array.isArray(o.logs) ? o.logs : o.receipt?.logs ?? [];

  // other
  const size = o.size ?? o.bytes ?? null;
  const nonce = o.nonce ?? o.sequence ?? null;
  const status =
    (typeof o.status === 'string' ? o.status :
      o.status?.success === true || o.status === 1 ? 'confirmed' :
      o.status?.success === false || o.status === 0 ? 'failed' :
      o.blockHeight || o.blockNumber ? 'confirmed' : 'pending') as TxView['status'];

  return {
    id,
    hash,
    status,
    time,
    timestamp: o.timestamp,
    blockHeight: blockHeight != null ? Number(blockHeight) : null,
    block,
    from,
    to,
    amount,
    value: o.value,
    fee,
    gasUsed,
    gasLimit,
    size,
    nonce,
    events,
    logs: Array.isArray(o.logs) ? o.logs : undefined,
    raw: o,
  };
}
