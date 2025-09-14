// src/pages/Block.tsx
'use client';

import * as React from 'react';
import Section from '../ui/Section';
import { rpc } from '../services/rpc';

type Props = { height: number };

/* Shape (liberal) returned by chain.block */
type ChainBlock = {
  height: number;
  block_id?: string;
  id?: string;
  hash?: string;
  parent_id?: string;
  parent_hash?: string;
  timestamp?: number;      // seconds or ms (varies)
  timestamp_ms?: number;   // sometimes ms
  ts_ms?: number;          // older builds
  txs?: Array<string | Record<string, any>>;
  next_offset?: number;
  [k: string]: any;
};

export default function BlockPage({ height }: Props) {
  const [blk, setBlk] = React.useState<ChainBlock | null>(null);
  const [err, setErr] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(true);

  const [loadingMore, setLoadingMore] = React.useState(false);

  // refresh when height changes
  React.useEffect(() => {
    let alive = true;
    setLoading(true);
    setErr(null);
    setBlk(null);

    (async () => {
      try {
        // First attempt: explicit options
        const params = { height, full: false, limit: 200, offset: 0 };
        let b = await rpc<ChainBlock>('chain.block', params);
        if (!alive) return;

        // Some builds require fewer params; fallback if empty/minimal result
        if (!b || (!b.txs && b.next_offset === undefined)) {
          b = await rpc<ChainBlock>('chain.block', { height });
          if (!alive) return;
        }

        setBlk(b ?? null);
      } catch (e: any) {
        if (!alive) return;
        setErr(normalizeErr(e));
      } finally {
        if (alive) setLoading(false);
      }
    })();

    return () => { alive = false; };
  }, [height]);

  // Load more TXs if server paginated
  async function loadMore() {
    if (!blk || blk.next_offset == null) return;
    setLoadingMore(true);
    setErr(null);
    try {
      const more = await rpc<ChainBlock>('chain.block', {
        height,
        full: false,
        limit: 200,
        offset: blk.next_offset,
      });
      // merge txs + advance pagination via server-provided next_offset
      const nextTxs = (blk.txs ?? []).concat(more?.txs ?? []);
      setBlk(prev => ({
        ...(prev as any),
        ...(more || {}),
        txs: nextTxs,
      }));
    } catch (e: any) {
      setErr(normalizeErr(e));
    } finally {
      setLoadingMore(false);
    }
  }

  const txs = blk?.txs ?? [];
  const blockId = first(blk?.block_id, blk?.id, blk?.hash);
  const parent = first(blk?.parent_id, blk?.parent_hash);
  const ts = readTimestamp(blk);
  const nextOffset = blk?.next_offset;

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="mb-3 flex items-center justify-between text-sm text-white/70">
        <a href="#/world" className="hover:underline">← Back</a>
        <div className="flex items-center gap-2">
          <a
            className="rounded-md border border-white/10 px-2 py-1 hover:bg-white/5"
            href={`#/explorer/blocks/${Math.max(0, height - 1)}`}
          >
            Prev
          </a>
          <a
            className="rounded-md border border-white/10 px-2 py-1 hover:bg-white/5"
            href={`#/explorer/blocks/${height + 1}`}
          >
            Next
          </a>
          <button
            onClick={() => hardRefresh(setLoading, setErr, setBlk, height)}
            className="rounded-md border border-white/10 px-2 py-1 hover:bg-white/5"
          >
            Refresh
          </button>
        </div>
      </div>

      <Section title="Explorer" variant="card" surface={2} padding="lg" headerPadding="md">
        <div className="text-lg font-semibold">Block #{height}</div>
      </Section>

      <div className="grid gap-4 mt-4 lg:grid-cols-2">
        <Section title="Summary" padding="md" surface={2} variant="card">
          {loading ? (
            <Skeleton lines={6} />
          ) : err ? (
            <div className="text-sm text-rose-300 break-all">{err}</div>
          ) : blk ? (
            <div className="grid gap-2 text-[13px]">
              <KV k="Height" v={String(blk.height)} />
              <KV k="Block ID" v={short(blockId)} mono copy={blockId} />
              <KV
                k="Parent"
                v={short(parent)}
                mono
                copy={parent}
                link={parent ? `#/explorer/blocks/${height - 1}` : undefined}
              />
              <KV k="Timestamp" v={ts ? new Date(ts).toLocaleString() : '—'} />
              <KV k="Tx Count" v={String(txs.length)} />
              {typeof nextOffset === 'number' && (
                <KV k="More TXs" v={`next_offset=${nextOffset}`} />
              )}
            </div>
          ) : (
            <div className="text-sm text-white/60">Not found.</div>
          )}
        </Section>

        <Section title="Transactions" padding="md" surface={2} variant="card">
          {loading ? (
            <Skeleton lines={6} />
          ) : txs.length > 0 ? (
            <>
              <div className="divide-y divide-white/10">
                {txs.map((t, i) => {
                  const id = txIdOf(t);
                  const kind = txKindOf(t);
                  return (
                    <a
                      key={i}
                      href={id ? `#/explorer/txs/${id}` : '#/explorer/txs'}
                      className="flex items-center justify-between gap-3 px-2 py-2 hover:bg-white/[0.03] rounded-md"
                    >
                      <div className="min-w-0">
                        <div className="font-mono text-[12px] truncate">{id ? id : '(unknown id)'}</div>
                        {kind != null && (
                          <div className="text-[11px] text-white/50 mt-[2px]">kind {kind}</div>
                        )}
                      </div>
                      <span className="text-[11px] text-white/50">open</span>
                    </a>
                  );
                })}
              </div>

              {typeof nextOffset === 'number' && (
                <div className="mt-3">
                  <button
                    onClick={loadMore}
                    disabled={loadingMore}
                    className="rounded-md border border-white/10 px-3 py-1.5 text-[12px] hover:bg-white/5 disabled:opacity-60"
                  >
                    {loadingMore ? 'Loading…' : 'Load more'}
                  </button>
                </div>
              )}
            </>
          ) : (
            <div className="text-sm text-white/60">—</div>
          )}
        </Section>
      </div>

      <Section title="Raw JSON" padding="md" surface={2} variant="card" className="mt-4">
        <pre className="max-h-[400px] overflow-auto text-[12px] leading-[1.4] whitespace-pre-wrap break-words">
{blk ? JSON.stringify(blk, null, 2) : 'null'}
        </pre>
      </Section>
    </div>
  );
}

/* ───────────────────── UI bits ───────────────────── */

function KV({
  k, v, mono, copy, link,
}: { k: string; v?: string; mono?: boolean; copy?: string; link?: string }) {
  const [ok, setOk] = React.useState(false);
  const onCopy = async () => {
    if (!copy) return;
    try { await navigator.clipboard.writeText(copy); setOk(true); setTimeout(() => setOk(false), 900); } catch {}
  };
  const text = v ?? '—';
  const body = link && v ? <a href={link} className="hover:underline">{text}</a> : text;

  return (
    <div className="grid grid-cols-[120px_1fr_auto] items-center gap-2 rounded-md bg-white/[0.03] px-2 py-1.5">
      <div className="text-[11px] uppercase tracking-wide text-white/50">{k}</div>
      <div className={["min-w-0 truncate text-[13px] text-white/90", mono ? "font-mono" : ""].join(" ")}>
        {body}
      </div>
      {copy ? (
        <button onClick={onCopy} className="rounded-md border border-white/10 px-2 py-1 text-[11px] text-white/70 hover:bg-white/5">
          {ok ? 'Copied' : 'Copy'}
        </button>
      ) : <span />}
    </div>
  );
}

function Skeleton({ lines = 5 }: { lines?: number }) {
  return (
    <div className="animate-pulse space-y-2">
      {Array.from({ length: lines }).map((_, i) => (
        <div key={i} className="h-4 rounded bg-white/[0.08]" />
      ))}
    </div>
  );
}

/* ───────────────────── helpers ───────────────────── */

function first<T>(...xs: (T | undefined | null)[]): T | undefined {
  for (const x of xs) if (x != null) return x as T;
  return undefined;
}

function short(s?: string) {
  if (!s) return '—';
  if (s.length <= 14) return s;
  return `${s.slice(0, 8)}…${s.slice(-6)}`;
}

function readTimestamp(b?: ChainBlock | null): number | undefined {
  if (!b) return undefined;
  const raw = first(b.timestamp_ms, b.ts_ms, b.timestamp);
  if (raw == null) return undefined;
  // If value looks like seconds, convert to ms
  return raw > 1e12 ? raw : raw * 1000;
}

function txIdOf(t: string | Record<string, any>): string {
  if (typeof t === 'string') return t;
  return t?.id || t?.tx_id || t?.hash || t?.txid || '';
}

function txKindOf(t: string | Record<string, any>): number | undefined {
  if (typeof t === 'string') return undefined;
  const k = t?.kind;
  return typeof k === 'number' ? k : undefined;
}

function normalizeErr(e: any): string {
  if (typeof e === 'string') return e;
  if (e?.message) return e.message;
  try { return JSON.stringify(e); } catch { return String(e); }
}

async function hardRefresh(
  setLoading: (b: boolean) => void,
  setErr: (s: string | null) => void,
  setBlk: (b: ChainBlock | null) => void,
  height: number,
) {
  setLoading(true);
  setErr(null);
  setBlk(null);
  try {
    const b = await rpc<ChainBlock>('chain.block', { height, full: false, limit: 200, offset: 0 });
    setBlk(b ?? null);
  } catch (e: any) {
    setErr(normalizeErr(e));
  } finally {
    setLoading(false);
  }
}
