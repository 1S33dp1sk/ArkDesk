// src/services/nodeBus.ts
import { listen, type Event as TauriEvent, type UnlistenFn } from "@tauri-apps/api/event";

/* Event names (mirror Rust) */
export const EVT_HEALTH  = "node://health";
export const EVT_STATUS  = "node://status";
export const EVT_TIP     = "node://tip";
export const EVT_MEMPOOL = "node://mempool";
export const EVT_CAPS    = "node://caps";
export const EVT_STALE   = "node://stale";

/* Payload shapes (mirror Rust types.rs) */
export interface HostPort { host: string; port: number; }
export interface AdminNet { name: string; id: number; }

export interface AdminHealthz {
  ok: boolean;
  version: string;
  abiRev: number;
  uptimeMs: number;
  features?: string[];
  net?: AdminNet;
}

export interface AdminStatus {
  nodeRunning: boolean;
  connected: boolean;
  peers: number;
  networkHeight: number;
  role: "relay" | "miner" | string;
  producerOn: boolean;
  rpc: HostPort;
}

export interface ChainTip {
  height: number;
  block_id?: string | null;
  timestamp_ms?: number | null;
  [k: string]: unknown;
}

export interface MempoolInfo {
  txs?: number | null;
  bytes?: number | null;
  max_items?: number | null;
  max_bytes?: number | null;
  [k: string]: unknown;
}

export interface Stale {
  now_ms: number;
  admin_age_ms?: number | null;
  status_age_ms?: number | null;
  tip_age_ms?: number | null;
  mempool_age_ms?: number | null;
}

export interface BlockItem { height: number; ts: number }

export type Caps = string[];

/* Generic subscribe */
export async function onEvent<T>(
  name: string,
  cb: (payload: T, raw: TauriEvent<T>) => void
): Promise<UnlistenFn> {
  return listen<T>(name, (ev) => cb(ev.payload, ev));
}

/* One-shot helper */
export function once<T>(name: string): Promise<T> {
  return new Promise(async (resolve) => {
    const un = await onEvent<T>(name, (p) => { resolve(p); un(); });
  });
}
