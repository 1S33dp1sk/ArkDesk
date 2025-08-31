// src/pages/Node.tsx
import React, { useEffect, useMemo, useRef, useState } from "react";
import Section from "../ui/Section";

/* types */
type Level = "trace" | "debug" | "info" | "warn" | "error";
type Seg = { label: string; pct: number };
type NodeCfg = { bindIp: string; port: number; netdir: string; log: Level };

/* atoms */
function Stat({ k, v, sub }: { k: string; v: React.ReactNode; sub?: string }) {
  return (
    <div className="glass p-4 rounded-lg border border-border">
      <div className="text-[12px] text-muted uppercase tracking-wide">{k}</div>
      <div className="mt-1 text-2xl font-semibold">{v}</div>
      {sub && <div className="mt-1 text-[12px] text-muted">{sub}</div>}
    </div>
  );
}
function ResourceBar({ label, value }: { label: string; value: number }) {
  const pct = Math.max(0, Math.min(100, value));
  return (
    <div className="flex items-center gap-3">
      <div className="w-24 text-[12px] text-muted">{label}</div>
      <div className="flex-1 h-2 bg-white/10 rounded-md overflow-hidden">
        <div className="h-full bg-primary/50" style={{ width: `${pct}%` }} />
      </div>
      <div className="w-10 text-[12px] text-muted text-right">{pct}%</div>
    </div>
  );
}
function SegProgress({ segs }: { segs: Seg[] }) {
  return (
    <div className="w-full">
      <div className="flex items-center gap-2">
        {segs.map((s) => (
          <div key={s.label} className="flex-1 min-w-0">
            <div className="text-[11px] text-muted mb-1">{s.label}</div>
            <div className="relative h-2 bg-white/10 rounded-md overflow-hidden">
              <div className="absolute inset-y-0 left-0 bg-primary/50" style={{ width: `${s.pct}%` }} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/* log viewer */
type LogLine = { t: string; lvl: Level; msg: string };
const lvls: Level[] = ["trace", "debug", "info", "warn", "error"];
const lvlTone: Record<Level, string> = {
  trace: "text-muted",
  debug: "text-muted",
  info: "text-text",
  warn: "text-warn",
  error: "text-danger",
};

export default function Node() {
  const [running, setRunning] = useState(false);
  const [peers, setPeers] = useState(0);
  const [tip, setTip] = useState(128);
  const [syncPct, setSyncPct] = useState(100);
  const [mempoolCount, setMempoolCount] = useState(162);
  const [cpu, setCpu] = useState(18);
  const [ram, setRam] = useState(42);
  const [disk, setDisk] = useState(12);
  const [segs] = useState<Seg[]>([
    { label: "headers", pct: 100 },
    { label: "bodies", pct: 100 },
    { label: "state", pct: 100 },
  ]);

  const [cfg, setCfg] = useState<NodeCfg>({ bindIp: "127.0.0.1", port: 8645, netdir: "./net", log: "info" });

  const [enabledLvls, setEnabledLvls] = useState<Record<Level, boolean>>({
    trace: false,
    debug: true,
    info: true,
    warn: true,
    error: true,
  });

  const [logs, setLogs] = useState<LogLine[]>([]);
  const logRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!running) return;
    const id = setInterval(() => {
      const now = new Date();
      const t = now.toLocaleTimeString();
      const sample: LogLine[] = [
        { t, lvl: "info", msg: `mempool: ${mempoolCount + Math.floor(Math.random() * 3 - 1)} items` },
        { t, lvl: "debug", msg: `peer set: ${peers + (Math.random() > 0.7 ? 1 : 0)}` },
        { t, lvl: "trace", msg: `rpc tick` },
      ];
      setLogs((xs) => [...xs.slice(-400), sample[Math.floor(Math.random() * sample.length)]]);
      setPeers((p) => Math.max(0, p + (Math.random() > 0.8 ? 1 : 0)));
      setMempoolCount((m) => Math.max(0, m + Math.floor(Math.random() * 3 - 1)));
      setCpu((c) => Math.max(6, Math.min(92, c + Math.floor(Math.random() * 7 - 3))));
      setRam((r) => Math.max(18, Math.min(88, r + Math.floor(Math.random() * 5 - 2))));
      setDisk((d) => Math.max(8, Math.min(80, d + Math.floor(Math.random() * 3 - 1))));
    }, 850);
    return () => clearInterval(id);
  }, [running, mempoolCount, peers]);

  useEffect(() => {
    logRef.current?.scrollTo({ top: logRef.current.scrollHeight });
  }, [logs]);

  const filtered = useMemo(() => logs.filter((l) => enabledLvls[l.lvl]), [logs, enabledLvls]);

  const start = () => {
    setRunning(true);
    setLogs((xs) => [...xs, { t: new Date().toLocaleTimeString(), lvl: "info", msg: "node started" }]);
  };
  const stop = () => {
    setRunning(false);
    setLogs((xs) => [...xs, { t: new Date().toLocaleTimeString(), lvl: "warn", msg: "node stopped" }]);
  };
  const restart = () => {
    stop();
    setTimeout(start, 220);
  };

  return (
    <div className="h-full min-h-0 overflow-auto p-4">
      <div className="grid grid-cols-[minmax(0,1.2fr)_minmax(360px,0.8fr)] gap-4">
        {/* left column */}
        <div className="grid grid-rows-[auto_auto_1fr] gap-4 min-h-0">
          <Section
            title="Node controls"
            actions={
              <div className="flex items-center gap-2">
                <span className={`h-2 w-2 rounded-full ${running ? "bg-success" : "bg-danger"}`} />
                <span className="text-sm">{running ? "running" : "stopped"}</span>
              </div>
            }
            rounded="lg"
            padding="md"
          >
            <div className="flex items-center gap-3">
              <button className="btn btn-primary px-4 py-2" onClick={start} disabled={running}>
                Start
              </button>
              <button className="btn px-4 py-2" onClick={stop} disabled={!running}>
                Stop
              </button>
              <button className="btn px-4 py-2" onClick={restart}>
                Restart
              </button>
              <div className="flex-1" />
              <div className="text-[12px] text-muted">log level</div>
              <select
                className="px-2 py-1 rounded-md bg-white/5 border border-border text-sm"
                value={cfg.log}
                onChange={(e) => setCfg((c) => ({ ...c, log: e.target.value as Level }))}
              >
                {lvls.map((l) => (
                  <option key={l} value={l}>
                    {l}
                  </option>
                ))}
              </select>
            </div>

            <div className="mt-4">
              <SegProgress segs={segs} />
            </div>

            <div className="mt-4 grid grid-cols-4 gap-4">
              <Stat k="Sync" v={`${syncPct}%`} sub="up to tip" />
              <Stat k="Tip" v={tip} sub="+1 soon" />
              <Stat k="Peers" v={peers} sub="connected" />
              <Stat k="Mempool" v={`${mempoolCount} tx`} sub="live" />
            </div>
          </Section>

          <Section
            title="Logs"
            actions={
              <div className="flex items-center gap-2">
                {lvls.map((l) => (
                  <label key={l} className="flex items-center gap-1 text-[12px]">
                    <input
                      type="checkbox"
                      checked={enabledLvls[l]}
                      onChange={(e) => setEnabledLvls((m) => ({ ...m, [l]: e.currentTarget.checked }))}
                    />
                    <span className={lvlTone[l]}>{l}</span>
                  </label>
                ))}
                <button className="btn px-2 py-1 text-[12px]" onClick={() => setLogs([])}>
                  Clear
                </button>
              </div>
            }
            rounded="lg"
            padding="md"
            scroll="y"          // body gets scrollbar if needed
          >
            <div
              ref={logRef}
              className="h-[340px] w-full overflow-auto rounded-md border border-border bg-black/20 font-mono text-[12px] p-2"
            >
              {filtered.length === 0 ? (
                <div className="text-muted">No logs.</div>
              ) : (
                filtered.map((l, i) => (
                  <div key={i} className="whitespace-pre leading-6">
                    <span className="text-muted">{l.t}</span>{" "}
                    <span className={`${lvlTone[l.lvl]} uppercase`}>{l.lvl}</span>{" "}
                    <span>{l.msg}</span>
                  </div>
                ))
              )}
            </div>
          </Section>

          <Section title="Block producer" rounded="lg" padding="md">
            <div className="grid grid-cols-3 gap-4">
              <div className="glass p-3 rounded-lg border border-border">
                <div className="text-[12px] text-muted">slot clock</div>
                <div className="mt-1 text-lg">00:00:03</div>
              </div>
              <div className="glass p-3 rounded-lg border border-border">
                <div className="text-[12px] text-muted">last seal</div>
                <div className="mt-1 text-lg">54 ms</div>
              </div>
              <div className="glass p-3 rounded-lg border border-border">
                <div className="text-[12px] text-muted">next</div>
                <div className="mt-1 text-lg">pending</div>
              </div>
            </div>
            <div className="mt-3 text-[12px] text-muted">Preview and seal blocks once the producer loop is enabled.</div>
          </Section>
        </div>

        {/* right rail */}
        <div className="grid grid-rows-[auto_auto_1fr] gap-4 min-h-0">
          <Section title="System" rounded="lg" padding="md">
            <div className="grid gap-3">
              <ResourceBar label="CPU" value={cpu} />
              <ResourceBar label="RAM" value={ram} />
              <ResourceBar label="Disk" value={disk} />
            </div>
          </Section>

          <Section title="Config" rounded="lg" padding="md" scroll="y">
            <div className="grid gap-3 text-sm">
              <div className="grid grid-cols-[120px_minmax(0,1fr)] items-center gap-3">
                <div className="text-muted">bind_ip</div>
                <input
                  value={cfg.bindIp}
                  onChange={(e) => setCfg((c) => ({ ...c, bindIp: e.currentTarget.value }))}
                  className="px-3 py-2 rounded-md bg-white/5 border border-border outline-none"
                />
              </div>
              <div className="grid grid-cols-[120px_minmax(0,1fr)] items-center gap-3">
                <div className="text-muted">port</div>
                <input
                  type="number"
                  value={cfg.port}
                  onChange={(e) => setCfg((c) => ({ ...c, port: parseInt(e.currentTarget.value || "0", 10) }))}
                  className="px-3 py-2 rounded-md bg-white/5 border border-border outline-none"
                />
              </div>
              <div className="grid grid-cols-[120px_minmax(0,1fr)] items-center gap-3">
                <div className="text-muted">netdir</div>
                <input
                  value={cfg.netdir}
                  onChange={(e) => setCfg((c) => ({ ...c, netdir: e.currentTarget.value }))}
                  className="px-3 py-2 rounded-md bg-white/5 border border-border outline-none"
                />
              </div>
            </div>
            <div className="mt-3 flex items-center gap-2">
              <button className="btn px-3 py-2">Snapshot</button>
              <button className="btn px-3 py-2">Open data dir</button>
            </div>
          </Section>

          <Section title="Tip header" rounded="lg" padding="md">
            <div className="p-2 rounded-md bg-white/5 border border-border font-mono text-[12px] break-all">
              fa8ece79e99636c482c34c2ad56e8fcd458655ab79f5c0019d7671763eaaf6fc
            </div>
          </Section>
        </div>
      </div>
    </div>
  );
}
