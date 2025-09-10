// src/pages/NodeSettings.tsx
import { useEffect, useMemo, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import Section from "../ui/Section";
import { Btn, Chip, Field, Input, Light } from "../ui/atoms";

type NodeRole = "relay" | "miner";

/** App settings, now RPC-first */
type Settings = {
  rpcHost: string;         // e.g., "127.0.0.1"
  rpcPort: number;         // e.g., 8645
  role: NodeRole;          // relay | miner (UI hint; actual mode comes from daemon)
  manageDaemon?: boolean;  // if true, UI can manage a local arkd binary
  arkdPath?: string | null; // optional path to arkd if we manage it
};

/** Live node view, polled from backend or directly from RPC */
type NodeStatus = {
  nodeRunning: boolean;
  connected: boolean;
  peers: number;
  networkHeight: number;
  role: NodeRole;
  rpcOk: boolean;
  rpcEndpoint: string; // derived "http://host:port"
};

/** Validation result for current RPC endpoint */
type ValidationReport = {
  rpcUrl: string;
  reachable: boolean;
  version?: string | null;
  network?: string | null;
  note?: string | null;
};

type CleanupReport = { removed: string[]; skipped: { path: string; reason: string }[] };
type Probe = { home: string; present: boolean; initialized: boolean; missing: string[] };

export default function NodeSettings({ onRoleSaved }: { onRoleSaved?: (r: NodeRole) => void }) {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [draft, setDraft] = useState<Settings | null>(null);

  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<NodeStatus | null>(null);
  const [report, setReport] = useState<ValidationReport | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const [probe, setProbe] = useState<Probe | null>(null);
  const [dangerLog, setDangerLog] = useState<string>("");
  const [token, setToken] = useState<string>("");
  const [dzBusy, setDzBusy] = useState(false);

  // Initial load
  useEffect(() => {
    (async () => {
      try {
        const s = await invoke<Settings>("get_settings");
        // lightweight defaults if older settings exist
        const norm: Settings = {
          rpcHost: s.rpcHost || "127.0.0.1",
          rpcPort: s.rpcPort || 8645,
          role: s.role || "relay",
          manageDaemon: s.manageDaemon ?? false,
          arkdPath: s.arkdPath ?? null,
        };
        setSettings(norm);
        setDraft(norm);

        // validate endpoint & probe install info
        setReport(await invoke<ValidationReport>("validate_rpc").catch(() => null));
        setProbe(await invoke<Probe>("probe_install").catch(() => null));
      } catch (e: any) {
        setErr(String(e));
      }
    })();
  }, []);

  // Poll node status
  useEffect(() => {
    let t: number | undefined, alive = true;
    const tick = async () => {
      try {
        const st = await invoke<NodeStatus>("get_status");
        if (!alive) return;
        setStatus(st);
      } catch {
        if (!alive) return;
        setStatus(null);
      } finally {
        if (alive) t = window.setTimeout(tick, 1500);
      }
    };
    tick();
    return () => { alive = false; if (t) clearTimeout(t); };
  }, []);

  // Debounced validation when RPC fields change
  useEffect(() => {
    if (!draft) return;
    const h = setTimeout(async () => {
      try {
        // optional: pass explicit params if your backend expects them
        const r = await invoke<ValidationReport>("validate_rpc", {
          host: draft.rpcHost,
          port: draft.rpcPort,
        });
        setReport(r);
      } catch {
        setReport(null);
      }
    }, 250);
    return () => clearTimeout(h);
  }, [draft?.rpcHost, draft?.rpcPort]);

  const dirty = useMemo(() => JSON.stringify(settings) !== JSON.stringify(draft), [settings, draft]);

  const onSave = async () => {
    if (!draft) return;
    setSaving(true);
    setErr(null);
    try {
      await invoke("save_settings", { settings: draft });
      setSettings(draft);
      // Re-validate and ping status
      setReport(await invoke<ValidationReport>("validate_rpc").catch(() => report));
      setStatus(await invoke<NodeStatus>("get_status").catch(() => status));
      if (settings?.role !== draft.role && onRoleSaved) onRoleSaved(draft.role);
    } catch (e: any) {
      setErr(String(e));
    } finally {
      setSaving(false);
    }
  };

  // Optional: browse arkd when manageDaemon is enabled
  const onBrowseArkd = async () => {
    if (!draft) return;
    try {
      const res = await open({
        directory: false,
        multiple: false,
        title: "Select arkd executable",
        filters: [{ name: "Arkd", extensions: ["exe", ""] }], // allows no-extension on *nix
      });
      if (!res) return;
      setDraft({ ...draft, arkdPath: String(res) });
    } catch (e: any) {
      setErr(String(e));
    }
  };

  const logCleanup = (r: CleanupReport) => {
    const removed = r.removed.length ? r.removed.join("\n") : "(none)";
    const skipped = r.skipped.length
      ? r.skipped.map(s => `${s.path} — ${s.reason}`).join("\n")
      : "(none)";
    setDangerLog(`Removed:\n${removed}\n\nSkipped:\n${skipped}`);
  };

  const removeSpurious = async (force: boolean) => {
    setDzBusy(true);
    try {
      const r = await invoke<CleanupReport>("cleanup_spurious_dirs", { force });
      logCleanup(r);
      setProbe(await invoke<Probe>("probe_install").catch(() => probe));
    } catch (e: any) {
      setDangerLog(String(e));
    } finally {
      setDzBusy(false);
    }
  };

  const uninstallArknet = async () => {
    setDzBusy(true);
    try {
      const r = await invoke<CleanupReport>("wipe_ark_home", { confirm: token });
      logCleanup(r);
      const p = await invoke<Probe>("probe_install").catch(() => null);
      setProbe(p as any);
      setTimeout(() => window.location.reload(), 250);
    } catch (e: any) {
      setDangerLog(String(e));
    } finally {
      setDzBusy(false);
    }
  };

  if (!draft) {
    return (
      <Section title="Node Settings" variant="card" surface={2} padding="lg" headerPadding="md">
        <div className="animate-pulse text-sm text-white/60">Loading…</div>
        {err ? <div className="mt-2 text-red-400 text-sm">{err}</div> : null}
      </Section>
    );
  }

  const rpcOk = !!report?.reachable;
  const rpcUrl = report?.rpcUrl || `http://${draft.rpcHost || "127.0.0.1"}:${draft.rpcPort || 8645}`;

  return (
    <>
      <Section
        title="Node Settings"
        variant="card"
        surface={2}
        padding="lg"
        headerPadding="md"
        actions={
          <div className="flex items-center gap-2">
            <Chip ok={rpcOk} label={rpcOk ? "RPC reachable" : "RPC not reachable"} />
            <Btn onClick={() => setDraft(settings!)} disabled={!dirty}>Revert</Btn>
            <Btn
              onClick={onSave}
              disabled={!dirty || saving}
              className="bg-primary/20 hover:bg-primary/30 border-primary/30"
              aria-busy={saving}
            >
              {saving ? "Saving…" : dirty ? "Save Changes" : "Saved"}
            </Btn>
          </div>
        }
      >
        <div className="grid gap-6 md:grid-cols-2">
          <Field label="RPC Host" hint="Local daemon: 127.0.0.1">
            <Input
              value={draft.rpcHost}
              onChange={(e) => setDraft({ ...draft, rpcHost: e.target.value })}
              spellCheck={false}
              placeholder="127.0.0.1"
            />
            {report ? (
              <div className="mt-2">
                <Light on={!!report.reachable} label={report.reachable ? "Reachable" : "Unreachable"} />
                {report.version ? <span className="ml-3 text-[12px] text-white/60">v{report.version}</span> : null}
                {report.network ? <span className="ml-3 text-[12px] text-white/60">{report.network}</span> : null}
                {report.note ? <div className="mt-1 text-[12px] text-white/50">{report.note}</div> : null}
              </div>
            ) : null}
          </Field>

          <Field label="RPC Port" hint="Default 8645">
            <Input
              type="number"
              min={1}
              max={65535}
              value={draft.rpcPort}
              onChange={(e) => setDraft({ ...draft, rpcPort: Number(e.target.value || 0) })}
            />
          </Field>

          <Field label="Role" hint="Relay (recommended) or Miner">
            <div className="flex items-center gap-4 text-[14px]">
              <label className="flex items-center gap-2">
                <input
                  type="radio"
                  checked={draft.role === "relay"}
                  onChange={() => setDraft({ ...draft, role: "relay" })}
                />
                <span>Relay</span>
              </label>
              <label className="flex items-center gap-2">
                <input
                  type="radio"
                  checked={draft.role === "miner"}
                  onChange={() => setDraft({ ...draft, role: "miner" })}
                />
                <span>Miner</span>
              </label>
            </div>
          </Field>

          <Field label="Manage Local Daemon (optional)" hint="Let the app start/stop a local arkd">
            <div className="flex items-center gap-3">
              <label className="flex items-center gap-2 text-[14px]">
                <input
                  type="checkbox"
                  checked={!!draft.manageDaemon}
                  onChange={(e) => setDraft({ ...draft, manageDaemon: e.target.checked })}
                />
                <span>Enable process management</span>
              </label>
            </div>
            {draft.manageDaemon ? (
              <div className="mt-2 flex items-center gap-2">
                <Input
                  value={draft.arkdPath || ""}
                  onChange={(e) => setDraft({ ...draft, arkdPath: e.target.value })}
                  spellCheck={false}
                  placeholder="Path to arkd executable"
                />
                <Btn onClick={onBrowseArkd}>Browse</Btn>
              </div>
            ) : null}
          </Field>
        </div>

        <div className="mt-4 text-[12px] text-white/60">
          Effective RPC: <span className="text-white/80 break-all">{rpcUrl}</span>
        </div>

        {err ? <div className="mt-3 text-rose-400 text-sm">{err}</div> : null}
      </Section>

      <Section title="Node Status" variant="card" surface={2} padding="lg" headerPadding="md">
        {!status ? (
          <div className="text-white/60 text-sm">No status yet…</div>
        ) : (
          <div className="grid gap-4 md:grid-cols-4">
            <div className="rounded-md border border-border p-3">
              <div className="text-[12px] text-white/60 mb-1">Process</div>
              <div className={"text-[15px] font-medium " + (status.nodeRunning ? "text-emerald-400" : "text-rose-400")}>
                {status.nodeRunning ? "Running" : "Down"}
              </div>
              <div className="text-[12px] text-white/50">{status.role === "miner" ? "Miner mode" : "Relay mode"}</div>
            </div>

            <div className="rounded-md border border-border p-3">
              <div className="text-[12px] text-white/60 mb-1">Network</div>
              <div className={"text-[15px] font-medium " + (status.connected ? "text-emerald-400" : "text-amber-300")}>
                {status.connected ? "Connected" : "No peers"}
              </div>
              <div className="text-[12px] text-white/50">Peers: {status.peers}</div>
            </div>

            <div className="rounded-md border border-border p-3">
              <div className="text-[12px] text-white/60 mb-1">Height</div>
              <div className="text-[15px] font-medium">{status.networkHeight}</div>
              <div className={"text-[12px] " + (status.rpcOk ? "text-white/50" : "text-rose-400")}>
                RPC {status.rpcOk ? "OK" : "error"}
              </div>
            </div>

            <div className="rounded-md border border-border p-3">
              <div className="text-[12px] text-white/60 mb-1">Endpoint</div>
              <div className="text-[12px] break-all text-white/70">{status.rpcEndpoint}</div>
              <div className="mt-2">
                <Light on={status.rpcOk} label="RPC reachable" />
              </div>
            </div>
          </div>
        )}
      </Section>

      <Section
        title="Danger Zone"
        variant="card"
        surface={2}
        padding="lg"
        headerPadding="md"
        footer={<div className="text-[12px] text-white/55">Arknet home: <span className="text-white/80 break-all">{probe?.home ?? "…"}</span></div>}
      >
        <div className="grid gap-4 md:grid-cols-[1fr,1fr]">
          <div className="space-y-3">
            <div className="text-[13px] text-white/70">Remove spurious folders created by earlier builds.</div>
            <div className="flex items-center gap-2">
              <Btn onClick={() => removeSpurious(false)} disabled={dzBusy}>Remove if empty</Btn>
              <Btn onClick={() => removeSpurious(true)} disabled={dzBusy}>Force remove</Btn>
            </div>
          </div>

          <div className="space-y-2">
            <div className="text-[13px] text-white/70">
              Type <code className="px-1 rounded bg-white/10">ARKNET-NUKE</code> to uninstall Arknet (deletes bin/, data/, logs/, config.json).
            </div>
            <div className="flex items-center gap-2">
              <Input value={token} onChange={(e) => setToken(e.target.value)} placeholder="Confirmation token" />
              <Btn
                onClick={uninstallArknet}
                disabled={dzBusy || token !== "ARKNET-NUKE"}
                className="border-rose-400/40 bg-rose-500/10 hover:bg-rose-500/20"
              >
                Uninstall Arknet
              </Btn>
            </div>
          </div>
        </div>

        <pre className="mt-4 text-[12px] whitespace-pre-wrap text-white/80">{dangerLog}</pre>
      </Section>
    </>
  );
}
