// src/bridge/ark.ts
import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";

/* ---------- types ---------- */
export type Endpoint = {
  id: string;
  label: string;
  base: string;
  headers?: Record<string, string>;
  insecure?: boolean;
};
export type EndpointStore = { active_id?: string | null; items: Record<string, Endpoint> };

export type WatchTopic = { method: string; params?: any; every_ms?: number };

/* ---------- endpoints ---------- */
export const ArkEndpoints = {
  list: () => invoke<EndpointStore>("ark_endpoints_list"),
  upsert: (ep: Endpoint) => invoke<EndpointStore>("ark_endpoints_upsert", { ep }),
  remove: (id: string) => invoke<EndpointStore>("ark_endpoints_remove", { id }),
  setActive: (id: string) => invoke<EndpointStore>("ark_endpoints_set_active", { id }),
  probe: (base: string, headers?: Record<string, string>, insecure?: boolean) =>
    invoke<any>("ark_endpoint_probe", { base, headers, insecure }),
};

/* ---------- rpc + cache + watchers + runner ---------- */
export const Ark = {
  // legacy setter
  setRpcBase: (base: string) => invoke<void>("ark_config_set_rpc_base", { base }),

  // RPC via active endpoint
  rpc: <T = any>(method: string, params: any = {}, timeoutMs?: number) =>
    invoke<T>("ark_rpc", { method, params, timeout_ms: timeoutMs }),

  // RPC against an explicit base URL (bypasses active endpoint)
  rpcWith: <T = any>(
    method: string,
    params: any,
    base: string,
    headers?: Record<string, string>,
    insecure?: boolean,
    timeoutMs?: number
  ) =>
    invoke<T>("ark_rpc_with", {
      method,
      params,
      base,
      headers,
      insecure,
      timeout_ms: timeoutMs,
    }),

  // cache + watchers
  cacheRead: <T = any>(method: string) => invoke<T | null>("ark_cache_read", { method }),
  watchStart: (topics: WatchTopic[]) => invoke<void>("ark_watch_start", { topics }),
  watchStop: () => invoke<void>("ark_watch_stop"),

  // local node lifecycle
  run: (id = "arknet", binOverride?: string) =>
    invoke<void>("ark_run", { id, bin_override: binOverride }),
  runKill: (id = "arknet") => invoke<void>("ark_run_kill", { id }),
  runStatus: (id = "arknet") => invoke<string | null>("ark_run_status", { id }),
  bootstrapFetch: (url?: string, destDir?: string) =>
    invoke<void>("ark_bootstrap_fetch", { url, dest_dir: destDir }),
  bootstrapBuild: (srcDir?: string) => invoke<void>("ark_bootstrap_build", { src_dir: srcDir }),

  // events
  onRpcUpdate: (cb: (payload: any) => void): Promise<UnlistenFn> =>
    listen("ark:rpc:update", (e) => cb((e as any).payload)),
  onRpcError: (cb: (payload: any) => void): Promise<UnlistenFn> =>
    listen("ark:rpc:error", (e) => cb((e as any).payload)),
  onProcLog: (
    cb: (payload: { id: string; stream: "stdout" | "stderr"; line: string }) => void
  ): Promise<UnlistenFn> => listen("ark:proc:log", (e) => cb((e as any).payload)),
};
