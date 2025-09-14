// src/services/rpc.ts
import { invoke } from "@tauri-apps/api/core";

export async function rpc<T>(method: string, params: any = {}): Promise<T> {
  try {
    // Calls the tauri command we registered in Rust
    const out = await invoke<any>("rpc_call", { method, params });
    return out as T;
  } catch (e: any) {
    // Normalize errors so UI shows something useful
    const msg =
      typeof e === "string" ? e :
      e?.message ? e.message :
      JSON.stringify(e);
    throw new Error(msg);
  }
}
// Expose in dev for quick console tests:
declare global {
  interface Window { arkrpc?: typeof rpc }
}
if (typeof window !== 'undefined') (window as any).arkrpc = rpc;
