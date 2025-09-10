// src/pages/Home.tsx
import { useEffect, useRef, useState, useCallback } from "react";
import { listen } from "@tauri-apps/api/event";
import { invoke } from "@tauri-apps/api/core";
import Section from "../ui/Section";

type Role = "relay" | "miner";
type Health = { ok: boolean; version: string; abiRev: number; uptimeMs: number; features?: string[]; net?: { id: number; name: string } };
type StatusModel = { nodeRunning: boolean; connected: number|boolean; peers: number; networkHeight: number; role: Role; producerOn: boolean; rpc?: { host: string; port: number } };
type LogEvt = { ts_ms: number; stream: "stdout" | "stderr" | "sys"; line: string };
type StatusEvt = { kind: "starting" | "started" | "stopped" | "error"; msg: string; pid?: number | null; exe?: string | null };

const EVT_HEALTH = "node://health";
const EVT_STATUS = "node://status";
const EVT_NODE_LOG = "node://log";

export default function Home() {
  const [health, setHealth] = useState<Health | null>(null);
  const [status, setStatus] = useState<StatusModel | null>(null);
  const [busy, setBusy] = useState<"start" | "stop" | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const [logLines, setLogLines] = useState<string[]>([]);
  const logRef = useRef<HTMLDivElement>(null);
  const autoScrollRef = useRef(true);
  const initRef = useRef(false);

  const normalizeLogPayload = useCallback((p: unknown): string[] => {
    if (p == null) return [];
    if (typeof p === "string") return [p];
    if (Array.isArray(p)) return p.flatMap(normalizeLogPayload);
    const o = p as Partial<LogEvt> & Record<string, unknown>;
    const ts = Number(o.ts_ms ?? Date.now());
    const stream = typeof o.stream === "string" ? o.stream : "log";
    const line = typeof o.line === "string" ? o.line : JSON.stringify(o);
    return [`[${ts}][${stream}] ${line}`];
  }, []);

  const dedupeConcat = (prev: string[], added: string[]) => {
    const out = prev.concat(added);
    const merged: string[] = [];
    for (const l of out) {
      if (!merged.length || merged[merged.length - 1] !== l) merged.push(l);
    }
    return merged.length > 2000 ? merged.slice(-2000) : merged;
  };

  const appendLogs = useCallback((payload: unknown) => {
    const lines = normalizeLogPayload(payload);
    if (!lines.length) return;
    setLogLines((prev) => dedupeConcat(prev, lines));
  }, [normalizeLogPayload]);

  useEffect(() => {
    if (initRef.current) return;
    initRef.current = true;

    let unsubs: Array<() => void> = [];
    (async () => {
      unsubs.push(await listen<Health>(EVT_HEALTH, (e) => setHealth(e.payload)));

      unsubs.push(
        await listen<StatusEvt>(EVT_STATUS, (e) => {
          const { kind, msg, pid } = e.payload;
          if (kind === "started") setStatus((s) => ({ ...(s ?? ({} as StatusModel)), nodeRunning: true } as StatusModel));
          if (kind === "stopped" || kind === "error") setStatus((s) => ({ ...(s ?? ({} as StatusModel)), nodeRunning: false } as StatusModel));
          appendLogs({ ts_ms: Date.now(), stream: "sys", line: `${kind}${pid ? ` pid=${pid}` : ""}: ${msg}` });
        })
      );

      unsubs.push(await listen<any>(EVT_NODE_LOG, (e) => appendLogs(e.payload)));

      try {
        const running = await invoke<boolean>("node_is_running");
        setStatus((s) => ({ ...(s ?? ({} as StatusModel)), nodeRunning: !!running } as StatusModel));
      } catch {}

      try {
        const tail = await invoke<any>("node_log_tail", { n: 400 });
        const lines = normalizeLogPayload(tail);
        setLogLines(lines);
      } catch {}
    })();

    return () => { unsubs.forEach((u) => u()); unsubs = []; };
  }, [appendLogs, normalizeLogPayload]);

  useEffect(() => {
    if (!status?.nodeRunning) return;
    const t = setInterval(async () => {
      try {
        const tail = await invoke<any>("node_log_tail", { n: 400 });
        const lines = normalizeLogPayload(tail);
        const merged: string[] = [];
        for (const l of lines) {
          if (!merged.length || merged[merged.length - 1] !== l) merged.push(l);
        }
        setLogLines(merged.length > 2000 ? merged.slice(-2000) : merged);
      } catch {}
    }, 1500);
    return () => clearInterval(t);
  }, [status?.nodeRunning, normalizeLogPayload]);

  useEffect(() => {
    const el = logRef.current;
    if (autoScrollRef.current && el) el.scrollTop = el.scrollHeight;
  }, [logLines]);

  const uptime = health ? `${Math.floor(health.uptimeMs / 1000)}s` : "—";
  const rpcStr = status?.rpc ? `${status.rpc.host}:${status.rpc.port}` : "—";
  const netStr = health?.net ? `${health.net.name ?? "net"} (#${health.net.id})` : "—";

  const onStart = async () => {
    setErr(null); setBusy("start");
    try { await invoke("node_start"); } catch (e: any) { setErr(String(e)); } finally { setBusy(null); }
  };
  const onStop = async () => {
    setErr(null); setBusy("stop");
    try { await invoke("node_stop"); } catch (e: any) { setErr(String(e)); } finally { setBusy(null); }
  };
  const onRevealLogs = async () => {
    setErr(null);
    try { await invoke("reveal_ark_home"); } catch (e: any) { setErr(String(e)); }
  };
  const onClearLogs = useCallback(async () => {
    setErr(null);
    try { await invoke("node_log_clear"); } catch {}
    setLogLines([]);
  }, []);

  const running = !!status?.nodeRunning;
  const startDisabled = running || busy === "start";
  const stopDisabled = !running || busy === "stop";

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Node Overview</h1>
        <div className="inline-flex items-center gap-1 rounded-lg border border-border bg-white/5 p-1">
          <a href="#settings" className="px-3 py-1.5 rounded-md text-[13px] hover:bg-white/5">Settings</a>
        </div>
      </div>

      {err ? (
        <Section variant="card" padding="md">
          <div className="text-xs text-red-300">Error: {err}</div>
        </Section>
      ) : null}

      <div className="grid gap-4 md:grid-cols-3">
        <Section title="Health" padding="md">
          <div className="space-y-1 text-sm">
            <div>OK: <b>{health?.ok ? "yes" : health ? "no" : "…"}</b></div>
            <div>Version: <b>{health?.version ?? "…"}</b></div>
            <div>ABI: <b>{health?.abiRev ?? "…"}</b></div>
            <div>Uptime: <b>{uptime}</b></div>
          </div>
        </Section>
        <Section title="Network" padding="md">
          <div className="space-y-1 text-sm">
            <div>Net: <b>{netStr}</b></div>
            <div>Peers: <b>{status?.peers ?? "…"}</b></div>
            <div>Connected: <b>{status ? (Number(status.connected) ? "yes" : "no") : "…"}</b></div>
            <div>Height: <b>{status?.networkHeight ?? "…"}</b></div>
          </div>
        </Section>
        <Section title="RPC" padding="md">
          <div className="space-y-1 text-sm">
            <div>Endpoint: <b>{rpcStr}</b></div>
            <div>Role: <b>{status?.role ?? "…"}</b></div>
            <div>Producer: <b>{status ? (status.producerOn ? "on" : "off") : "…"}</b></div>
            <div>Node: <b className={running ? "text-emerald-400" : "text-white/60"}>{running ? "running" : "stopped"}</b></div>
          </div>
        </Section>
      </div>

      <Section title="Controls" padding="md">
        <div className="flex flex-wrap gap-2 items-center">
          <button onClick={onStart} disabled={startDisabled} className={`px-3 py-1.5 rounded-md text-sm border ${startDisabled ? "opacity-60" : "hover:bg-white/5"}`}>
            {busy === "start" ? "Starting…" : "Start Node"}
          </button>
          <button onClick={onStop} disabled={stopDisabled} className={`px-3 py-1.5 rounded-md text-sm border ${stopDisabled ? "opacity-60" : "hover:bg-white/5"}`}>
            {busy === "stop" ? "Stopping…" : "Stop Node"}
          </button>
          <button onClick={onRevealLogs} className="px-3 py-1.5 rounded-md text-sm border hover:bg-white/5">
            Open Logs Folder
          </button>
          <button onClick={onClearLogs} className="px-3 py-1.5 rounded-md text-sm border hover:bg-white/5">
            Clear Logs
          </button>
        </div>
      </Section>

      <Section title="Logs" padding="sm">
        <div
          ref={logRef}
          className="h-64 w-full overflow-auto rounded-md bg-black/50 p-3 font-mono text-[12px] leading-[1.35]"
          onWheel={() => {
            const el = logRef.current;
            if (!el) return;
            const atBottom = Math.abs(el.scrollHeight - el.scrollTop - el.clientHeight) < 4;
            autoScrollRef.current = atBottom;
          }}
        >
          {logLines.length === 0 ? (
            <div className="text-white/50">No logs yet…</div>
          ) : (
            logLines.map((l, i) => <div key={i} className="whitespace-pre-wrap break-words">{l}</div>)
          )}
        </div>
      </Section>

      <Section title="Features" padding="md">
        <div className="flex flex-wrap gap-2">
          {(health?.features ?? []).length ? (
            health!.features!.map((f) => (
              <span key={f} className="px-2 py-0.5 rounded-md border border-border bg-white/5 text-xs">{f}</span>
            ))
          ) : (
            <span className="text-xs text-white/60">—</span>
          )}
        </div>
      </Section>
    </div>
  );
}
