// src/hooks/useNode.ts
import { useEffect, useRef, useState } from "react";
import type {
  AdminHealthz, AdminStatus, ChainTip, MempoolInfo, Caps, Stale, BlockItem
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

/* Keep a numeric history with cap; update when value changes */
export function useHistory(value: number | undefined, cap = 90) {
  const [hist, setHist] = useState<number[]>(Array(cap).fill(0));
  useEffect(() => {
    if (value === undefined || Number.isNaN(value)) return;
    setHist((h) => push(h, value, cap));
  }, [value, cap]);
  return hist;
}

/* Blocks feed derived from tips; mempool count from mempool info */
export function useBlocksAndMempool(capBlocks = 64) {
  const { data: tip } = useTip();
  const { data: mp }  = useMempool();
  const [blocks, setBlocks] = useState<BlockItem[]>([]);
  const lastHeight = useRef<number | undefined>(undefined);

  useEffect(() => {
    if (!tip?.height) return;
    const h = tip.height;
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
  }, [tip, capBlocks]);

  const mempool = Math.max(0, Number(mp?.txs ?? 0));
  return { blocks, mempool };
}

/* Peer & TPS histories derived from status/mempool/blocks */
export function usePeerHistory(cap = 90) {
  const { data: status } = useStatus();
  return useHistory(status?.peers ?? 0, cap);
}

export function useTpsHistory(cap = 90) {
  const { data: status } = useStatus();
  const { data: mp } = useMempool();
  const peers = Number(status?.peers ?? 0);
  const mem = Math.max(0, Number(mp?.txs ?? 0));
  // Lightweight heuristic: base + peers factor + mempool pressure
  const tps = 2 + peers * 0.08 + Math.min(6, mem / 40);
  return useHistory(tps, cap);
}

/* Aggregated snapshot for pages that want a single hook */
export function useNodeSnapshot() {
  const health  = useHealth();
  const status  = useStatus();
  const tip     = useTip();
  const mempool = useMempool();
  const stale   = useStale();
  const caps    = useCaps();

  const { blocks, mempool: memCount } = useBlocksAndMempool();
  const peerHist = usePeerHistory();
  const tpsHist  = useTpsHistory();

  return {
    health, status, tip, mempool, stale, caps,
    blocks, memCount, peerHist, tpsHist,
    ready: health.ready && status.ready && tip.ready,
  };
}
