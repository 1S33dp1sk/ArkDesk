// src/bridge/useRpc.ts
import { useEffect, useState } from "react";
import { Ark, type RpcUpdate } from "./ark";

export function useRpc<T = unknown>(method: string, key = "default", initial?: T) {
  const cacheKey = `${method}:${key}`;

  const [data, setData] = useState<T | undefined>(initial);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let unlisten: (() => void) | undefined;
    let cancelled = false;

    (async () => {
      try {
        // cacheRead takes a single composite key
        const cached = await Ark.cacheRead<T>(cacheKey);
        if (!cancelled && cached != null) setData(cached);

        // subscribe to live updates
        const stop = await Ark.onRpcUpdate((ev: RpcUpdate) => {
          if (ev.method === method && (ev.key ?? "default") === key) {
            setData(ev.value as T);
          }
        });
        unlisten = stop;

        if (!cancelled) setLoading(false);
      } catch (e: any) {
        if (!cancelled) {
          setError(String(e?.message ?? e));
          setLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
      try { unlisten?.(); } catch { /* ignore */ }
    };
  }, [cacheKey, method, key]);

  return { data, loading, error };
}
