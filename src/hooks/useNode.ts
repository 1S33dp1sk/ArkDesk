// src/hooks/useNode.ts
import { useEffect, useRef, useState } from "react";
import type {
  AdminHealthz, AdminStatus, ChainTip, MempoolInfo, Caps, Stale
} from "../services/nodeBus";
import {
  EVT_HEALTH, EVT_STATUS, EVT_TIP, EVT_MEMPOOL, EVT_CAPS, EVT_STALE, onEvent
} from "../services/nodeBus";

/* ── base event hook ── */
function useTauriEvent<T>(event: string) {
  const [data, setData] = useState<T | undefined>(undefined);
  const [ts, setTs] = useState<number | undefined>(undefined);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    let un: (() => void) | undefined;
    (async () => {
      un = await onEvent<T>(event, (payload) => {
        if (!mounted.current) return;
        setData(payload);
        setTs(Date.now());
      });
    })();
    return () => { mounted.current = false; un?.(); };
  }, [event]);

  return { data, updatedAt: ts, ready: data !== undefined };
}

/* ── typed streams ── */
export const useHealth  = () => useTauriEvent<AdminHealthz>(EVT_HEALTH);
export const useStatus  = () => useTauriEvent<AdminStatus>(EVT_STATUS);
export const useTip     = () => useTauriEvent<ChainTip>(EVT_TIP);
export const useMempool = () => useTauriEvent<MempoolInfo>(EVT_MEMPOOL);
export const useCaps    = () => useTauriEvent<Caps>(EVT_CAPS);
export const useStale   = () => useTauriEvent<Stale>(EVT_STALE);

/* ── helpers ── */
function push<T>(arr: T[], v: T, cap: number) {
  const out = arr.length >= cap ? arr.slice(arr.length - cap + 1) : arr.slice();
  out.push(v);
  return out;
}

export function useHistory(value: number | undefined, cap = 90) {
  const [hist, setHist] = useState<number[]>(Array(cap).fill(0));
  useEffect(() => {
    if (value === undefined || Number.isNaN(value)) return;
    setHist((h) => push(h, value, cap));
  }, [value, cap]);
  return hist;
}

/* Keep a single, monotonic height from both sources */
export function useStableHeight() {
  const { data: tip } = useTip();
  const { data: status } = useStatus();
  const last = useRef<number>(0);
  const [height, setHeight] = useState<number | null>(null);

  useEffect(() => {
    const candidates = [
      Number(tip?.height ?? 0),
      Number(status?.networkHeight ?? 0),
    ].filter(n => Number.isFinite(n) && n > 0);

    if (!candidates.length) return;
    const next = Math.max(...candidates);
    if (next >= last.current) {
      last.current = next;
      setHeight(next);
    }
    // else: drop regressive samples
  }, [tip?.height, status?.networkHeight]);

  return height;
}

/* Blocks feed derived from stable height; mempool from mempool info */
type BlockItem = { height: number; ts: number };
export function useBlocksAndMempool(capBlocks = 64) {
  const stableHeight = useStableHeight();
  const { data: mp } = useMempool();

  const [blocks, setBlocks] = useState<BlockItem[]>([]);
  const lastHeight = useRef<number | undefined>(undefined);

  useEffect(() => {
    const h = Number(stableHeight ?? 0);
    if (!Number.isFinite(h) || h <= 0) return;

    const prev = lastHeight.current;
    if (prev == null) { lastHeight.current = h; return; }

    if (h > prev) {
      const ts = Date.now();
      const add: BlockItem[] = [];
      for (let i = prev + 1; i <= h; i++) add.push({ height: i, ts });
      setBlocks((b) => {
        const next = b.concat(add);
        return next.length > capBlocks ? next.slice(-capBlocks) : next;
      });
      lastHeight.current = h;
    }
  }, [stableHeight, capBlocks]);

  const mempool = Math.max(0, Number(mp?.txs ?? mp?.size ?? 0));
  return { blocks, mempool, height: stableHeight };
}

/* Peer & TPS histories */
export function usePeerHistory(cap = 90) {
  const { data: status } = useStatus();
  return useHistory(status?.peers ?? 0, cap);
}

export function useTpsHistory(cap = 90) {
  const { data: status } = useStatus();
  const { data: mp } = useMempool();
  const peers = Number(status?.peers ?? 0);
  const mem = Math.max(0, Number(mp?.txs ?? mp?.size ?? 0));
  const tps = 2 + peers * 0.08 + Math.min(6, mem / 40);
  return useHistory(tps, cap);
}

/* Display role: prefer producerOn -> miner/relay */
export function useDisplayRole(): "relay" | "miner" | undefined {
  const { data: status } = useStatus();
  if (!status) return undefined;
  return status.producerOn ? "miner" : "relay";
}

/* Aggregated snapshot with plain values */
export function useNodeSnapshot() {
  const hEvt  = useHealth();
  const sEvt  = useStatus();
  const tEvt  = useTip();
  // const mEvt  = useMempool();
  const stale = useStale();
  const caps  = useCaps();

  const { blocks, mempool, height } = useBlocksAndMempool();
  const peerHist = usePeerHistory();
  const tpsHist  = useTpsHistory();
  const role     = useDisplayRole();

  return {
    health: hEvt.data,
    status: sEvt.data,
    tip: tEvt.data,
    mempool: mempool,
    tipHeight: height ?? null,
    role,
    blocks, peerHist, tpsHist,
    stale: stale.data,
    caps: caps.data,
    ready: !!(hEvt.data && sEvt.data && height),
  };
}
