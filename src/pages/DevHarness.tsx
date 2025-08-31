// src/pages/DevHarness.tsx
import React, { useEffect, useMemo, useState } from "react";
import Section from "../ui/Section";
import { Ark, ArkEndpoints, type WatchTopic } from "../bridge/ark";

/* ----------------------------- small atoms ----------------------------- */

function StatusDot({ color = "bg-zinc-400", pulse = false }: { color?: string; pulse?: boolean }) {
  return (
    <span className={`inline-block h-2.5 w-2.5 rounded-full ${color} ${pulse ? "animate-pulse" : ""}`} />
  );
}
function Chip({
  children,
  tone = "default",
  className = "",
}: {
  children: React.ReactNode;
  tone?: "default" | "ok" | "warn" | "bad" | "info";
  className?: string;
}) {
  const map: Record<string, string> = {
    default: "border-border bg-white/5 text-muted",
    ok: "border-emerald-400/60 bg-emerald-400/10 text-emerald-300",
    warn: "border-amber-400/60 bg-amber-400/10 text-amber-300",
    bad: "border-rose-400/60 bg-rose-400/10 text-rose-300",
    info: "border-sky-400/60 bg-sky-400/10 text-sky-300",
  };
  return (
    <span className={`px-2.5 py-1 rounded-md border text-[11px] tracking-wide ${map[tone]} ${className}`} >
      {children}
    </span>
  );
}
function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-1 gap-2 md:grid-cols-[180px_minmax(0,1fr)] md:gap-4 items-start">
      <div className="text-[12px] text-muted">{label}</div>
      <div>{children}</div>
    </div>
  );
}
function Kpi({ label, value, sub }: { label: string; value: React.ReactNode; sub?: React.ReactNode }) {
  return (
    <div className="glass rounded-2xl border border-border p-4 md:p-5">
      <div className="text-[12px] text-muted">{label}</div>
      <div className="text-xl md:text-2xl font-semibold mt-0.5">{value}</div>
      {sub && <div className="mt-1 text-[12px] text-muted">{sub}</div>}
    </div>
  );
}

/* -------------------------------- page -------------------------------- */

type ConnState = "disconnected" | "connecting" | "connected" | "error";

export default function DevHarness() {
  const [base, setBase] = useState("http://127.0.0.1:7070");

  // endpoint + protocol info
  const [endpoints, setEndpoints] = useState<any>(null);
  const [probe, setProbe] = useState<any>(null);
  const [conn, setConn] = useState<ConnState>("disconnected");
  const [latencyMs, setLatencyMs] = useState<number | null>(null);
  const [autoPing, setAutoPing] = useState(false);

  // rpc
  const [rpcOut, setRpcOut] = useState<string>("");
  const [updatesCount, setUpdatesCount] = useState(0);
  const [lastUpdateAt, setLastUpdateAt] = useState<number | null>(null);
  const [watching, setWatching] = useState(false);

  // runner
  const [runStatus, setRunStatus] = useState<string | null>(null);
  const [logs, setLogs] = useState<string>("");

  // live event listeners
  useEffect(() => {
    let unsubs: Array<() => void> = [];
    (async () => {
      unsubs.push(
        await Ark.onRpcUpdate((p) => {
          setUpdatesCount((n) => n + 1);
          setLastUpdateAt(Date.now());
          setRpcOut((s) => s + "\nUPDATE " + JSON.stringify(p));
        })
      );
      unsubs.push(
        await Ark.onRpcError((p) => {
          setRpcOut((s) => s + "\nERROR  " + JSON.stringify(p));
          setConn("error");
        })
      );
      unsubs.push(
        await Ark.onProcLog((l) => setLogs((s) => s + `[${l.stream}] ${l.line}\n`))
      );
    })();
    return () => {
      unsubs.forEach((u) => u());
    };
  }, []);

  // connection helpers
  const ping = async () => {
    try {
      setConn("connecting");
      const t0 = performance.now();
      const r = await ArkEndpoints.probe(base);
      const t1 = performance.now();
      setLatencyMs(Math.max(0, Math.round(t1 - t0)));
      setProbe(r);
      setConn("connected");
    } catch (e) {
      setConn("error");
    }
  };
  useEffect(() => {
    if (!autoPing) return;
    let id: any;
    (async function loop() {
      await ping();
      id = setTimeout(loop, 3000);
    })();
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoPing, base]);

  const addEndpoint = async () => {
    await ArkEndpoints.upsert({ id: "local", label: "Local Ark", base, headers: {}, insecure: false });
    const s = await ArkEndpoints.setActive("local");
    setEndpoints(s);
    await ping();
  };

  // rpc helpers
  const callRpc = async (method: string, params: any = {}) => {
    const r = await Ark.rpc(method, params);
    setRpcOut((s) => s + `\n${method} -> ${JSON.stringify(r)}`);
  };

  const startWatch = async () => {
    const topics: WatchTopic[] = [
      { method: "node.summary", every_ms: 1500 },
      { method: "fees.quote", every_ms: 3000 },
    ];
    await Ark.watchStart(topics);
    setWatching(true);
  };
  const stopWatch = async () => {
    await Ark.watchStop();
    setWatching(false);
  };

  // runner helpers
  const refreshRunStatus = async () => setRunStatus(await Ark.runStatus("arknet"));
  const doBootstrap = async () => { await Ark.bootstrapFetch(); await Ark.bootstrapBuild(); };
  const runNode = async () => { await Ark.run("arknet"); await refreshRunStatus(); };
  const killNode = async () => { await Ark.runKill("arknet"); await refreshRunStatus(); };

  // derived UI
  const connColor =
    conn === "connected" ? "bg-emerald-400"
      : conn === "connecting" ? "bg-amber-400"
      : conn === "error" ? "bg-rose-400"
      : "bg-zinc-400";

  const connLabel =
    conn === "connected" ? "Connected"
      : conn === "connecting" ? "Connecting…"
      : conn === "error" ? "Error"
      : "Disconnected";

  const lastUpdateAgo =
    lastUpdateAt ? `${Math.max(0, Math.round((Date.now() - lastUpdateAt) / 1000))}s ago` : "—";

  const networkChip = useMemo(() => {
    const n = probe?.result?.network || probe?.network || probe?.result?.protocol ? probe : null;
    const net = n?.result?.network ?? n?.network ?? "—";
    const proto = n?.result?.protocol ?? n?.protocol ?? "—";
    return { net, proto };
  }, [probe]);

  return (
    <div className="h-full min-h-0 overflow-hidden p-4 md:p-6">
      <div className="mx-auto h-full max-w-[1100px]">
        <Section
          title={
            <div className="flex items-center gap-3">
              <span className="text-muted">Developer Harness</span>
              <span className="hidden md:inline text-muted">·</span>
              <div className="hidden md:flex items-center gap-2">
                <StatusDot color={connColor} pulse={conn === "connecting"} />
                <span className="text-[12px]">{connLabel}</span>
                <span className="text-[12px] text-muted">({latencyMs ?? "—"} ms)</span>
              </div>
            </div>
          }
          actions={
            <div className="flex items-center gap-2">
              <Chip tone="info" className="hidden sm:inline">watch updates: {updatesCount}</Chip>
              <Chip tone="default" className="hidden sm:inline">last update: {lastUpdateAgo}</Chip>
              <label className="inline-flex items-center gap-2 text-[12px] px-2 py-1 rounded-md border border-border bg-white/5">
                <input
                  type="checkbox"
                  className="accent-sky-400"
                  checked={autoPing}
                  onChange={(e) => setAutoPing(e.target.checked)}
                />
                Auto ping
              </label>
            </div>
          }
          variant="glass"
          surface={1}
          rounded="2xl"
          padding="lg"
          scroll="y"
          className="h-full relative overflow-hidden"
          bodyClassName="space-y-8 md:space-y-10"
        >
          {/* Accent header halo */}
          <div
            aria-hidden
            className="pointer-events-none absolute -z-10 -top-32 left-0 right-0 h-56 blur-3xl opacity-60"
            style={{
              background:
                "radial-gradient(60% 60% at 20% 0%, rgba(106,169,255,.22), transparent 60%), radial-gradient(50% 50% at 80% 20%, rgba(181,156,255,.22), transparent 60%)",
            }}
          />

          {/* KPIs */}
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Kpi
              label="Status"
              value={<span className="flex items-center gap-2"><StatusDot color={connColor} pulse={conn==="connecting"} /> {connLabel}</span>}
              sub={latencyMs != null ? `${latencyMs} ms` : "—"}
            />
            <Kpi label="Network" value={<span className="font-mono">{networkChip.net}</span>} sub={`protocol ${networkChip.proto}`} />
            <Kpi label="Watchers" value={watching ? "Running" : "Stopped"} sub={<span className="text-[12px]">{updatesCount} updates</span>} />
            <Kpi label="Local Node" value={runStatus ?? "—"} sub={<span className="text-[12px]">runner id: arknet</span>} />
          </div>

          {/* Remote Endpoint */}
          <div className="rounded-2xl border border-border p-5 md:p-6 space-y-4">
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-2">
              <div className="text-[12px] text-muted">Remote Endpoint</div>
              <div className="flex flex-wrap items-center gap-2">
                <Chip tone={conn === "connected" ? "ok" : conn === "error" ? "bad" : "default"}>{connLabel}</Chip>
                {latencyMs != null && <Chip tone="info">{latencyMs} ms</Chip>}
                <Chip tone="default">protocol {networkChip.proto}</Chip>
              </div>
            </div>
            <Row label="Base URL">
              <input
                className="w-full px-3 py-2.5 rounded-md bg-white/5 border border-border outline-none focus:ring-1 focus:ring-white/30"
                value={base}
                onChange={(e) => setBase(e.target.value)}
                placeholder="http://127.0.0.1:7070"
              />
            </Row>
            <div className="pt-1 flex flex-wrap gap-2">
              <button className="btn btn-primary px-4 py-2.5" onClick={addEndpoint}>Save & Activate</button>
              <button className="btn px-4 py-2.5" onClick={ping}>Ping (protocol.version)</button>
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              <pre className="text-xs opacity-80 whitespace-pre-wrap rounded-md border border-border p-3 bg-white/5">{JSON.stringify(probe, null, 2)}</pre>
              <pre className="text-xs opacity-80 whitespace-pre-wrap rounded-md border border-border p-3 bg-white/5">{JSON.stringify(endpoints, null, 2)}</pre>
            </div>
          </div>

          {/* RPC Playground */}
          <div className="rounded-2xl border border-border p-5 md:p-6 space-y-4">
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-2">
              <div className="text-[12px] text-muted">RPC Playground</div>
              <div className="flex items-center gap-2">
                <Chip tone="info">live</Chip>
                <Chip tone="default">updates: {updatesCount}</Chip>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <button className="btn px-4 py-2.5" onClick={() => callRpc("rpc.list", {})}>rpc.list</button>
              <button className="btn px-4 py-2.5" onClick={() => callRpc("protocol.version", {})}>protocol.version</button>
              <button className="btn px-4 py-2.5" onClick={() => callRpc("node.summary", {})}>node.summary</button>
              <button className="btn px-4 py-2.5" onClick={() => callRpc("fees.quote", {})}>fees.quote</button>
              <button className="btn px-4 py-2.5" onClick={() => callRpc("chain.blocks", { limit: 5 })}>chain.blocks</button>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <div className="text-[12px] text-muted mb-1">Output / Updates</div>
                <textarea className="w-full h-64 p-3 font-mono text-xs rounded-md bg-white/5 border border-border outline-none" value={rpcOut} readOnly />
              </div>
              <div>
                <div className="text-[12px] text-muted mb-1">Cache snapshot (node.summary)</div>
                <div className="flex items-center gap-2">
                  <button
                    className="btn px-4 py-2.5"
                    onClick={async () => {
                      const snap = await Ark.cacheRead("node.summary");
                      setRpcOut((s) => s + "\nCACHE node.summary -> " + JSON.stringify(snap));
                    }}
                  >
                    Read cache
                  </button>
                  {watching ? (
                    <button className="btn px-4 py-2.5" onClick={stopWatch}>
                      <span className="flex items-center gap-2"><StatusDot color="bg-amber-400" pulse /> Stop Watch</span>
                    </button>
                  ) : (
                    <button className="btn px-4 py-2.5" onClick={startWatch}>
                      <span className="flex items-center gap-2"><StatusDot color="bg-emerald-400" /> Start Watch</span>
                    </button>
                  )}
                </div>
                <div className="mt-3 grid gap-2">
                  <div className="text-[12px] text-muted">Tips</div>
                  <ul className="list-disc pl-5 text-sm space-y-1">
                    <li>Use <code className="font-mono">watchStart</code> to stream node.summary & fees.quote.</li>
                    <li>Open DevTools (⌥⌘I) to watch event payloads.</li>
                  </ul>
                </div>
              </div>
            </div>
          </div>

          {/* Local Runner */}
          <div className="rounded-2xl border border-border p-5 md:p-6 space-y-4">
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-2">
              <div className="text-[12px] text-muted">Local Runner</div>
              <div className="flex items-center gap-2">
                <Chip tone={runStatus ? "ok" : "default"}>{runStatus ?? "not running"}</Chip>
                <button className="soft-btn px-2.5 py-1.5 text-[12px]" onClick={refreshRunStatus}>Refresh</button>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <button className="btn px-4 py-2.5" onClick={doBootstrap}>Fetch & Build Arknet</button>
              <button className="btn px-4 py-2.5" onClick={runNode}>
                <span className="flex items-center gap-2"><StatusDot color="bg-emerald-400" /> Run</span>
              </button>
              <button className="btn px-4 py-2.5" onClick={killNode}>
                <span className="flex items-center gap-2"><StatusDot color="bg-rose-400" /> Kill</span>
              </button>
            </div>
            <div>
              <div className="text-[12px] text-muted mb-1">Logs</div>
              <textarea className="w-full h-56 p-3 font-mono text-xs rounded-md bg-white/5 border border-border outline-none" value={logs} readOnly />
            </div>
          </div>
        </Section>
      </div>
    </div>
  );
}
