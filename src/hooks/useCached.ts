// src/hooks/useCached.ts
import { useCallback, useEffect, useState } from "react";

type Opts = { ttlMs?: number; autoload?: boolean };

export function useCached<T>(key: string, loader: () => Promise<T>, opts: Opts = {}) {
  const { ttlMs = 3_600_000, autoload = true } = opts;

  const [data, setData] = useState<T | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ts, setTs] = useState<number | null>(null);

  // Hydrate from localStorage and return whether we had data + the ts we just read.
  const hydrate = useCallback((): { ok: boolean; ts: number | null } => {
    try {
      const raw = localStorage.getItem(key);
      if (!raw) return { ok: false, ts: null };
      const parsed = JSON.parse(raw) as { data: T; ts: number };
      setData(parsed.data);
      setTs(parsed.ts);
      return { ok: true, ts: parsed.ts };
    } catch {
      return { ok: false, ts: null };
    }
  }, [key]);

  const save = useCallback((d: T) => {
    const now = Date.now();
    setData(d);
    setTs(now);
    localStorage.setItem(key, JSON.stringify({ data: d, ts: now }));
  }, [key]);

  const refresh = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      const d = await loader();
      save(d);
    } catch (e: any) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }, [loader, save]);

  const invalidate = useCallback(() => {
    localStorage.removeItem(key);
    setTs(null);
    setData(null);              // important: clear in-memory value too
  }, [key]);

  useEffect(() => {
    if (!autoload) return;
    const { ok, ts: localTs } = hydrate();                 // <— use the freshly read ts
    const expired = !ok || !localTs || (Date.now() - localTs) > ttlMs;
    if (expired) { void refresh(); }                       // only refresh if truly stale
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, ttlMs, autoload]); // don’t depend on ts; we decide with localTs from hydrate()

  return { data, busy, error, ts, refresh, invalidate, save, setData };
}

export function formatAge(ts: number | null): string {
  if (!ts) return "never";
  const s = Math.floor((Date.now() - ts) / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return `${d}d ago`;
}
