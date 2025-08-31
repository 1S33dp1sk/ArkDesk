import { useEffect, useState } from "react";
import { Ark, RpcUpdate } from "./ark";

export function useRpc<T = any>(method: string, key = "default", initial?: T) {
  const [data, setData] = useState<T | undefined>(initial);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let unlisten: (() => void) | undefined;
    (async () => {
      try {
        const cached = await Ark.cacheRead<T>(method, key);
        if (cached != null) setData(cached);
        const sub = await Ark.onRpcUpdate((ev: RpcUpdate) => {
          if (ev.method === method && ev.key === key) setData(ev.value);
        });
        unlisten = () => (sub as any)(); // tauri unlisten
        setLoading(false);
      } catch (e: any) {
        setError(String(e?.message || e));
        setLoading(false);
      }
    })();
    return () => { if (unlisten) unlisten(); };
  }, [method, key]);

  return { data, loading, error };
}
