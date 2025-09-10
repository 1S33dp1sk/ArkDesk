// src/pages/MinerSettings.tsx
import { useEffect, useMemo, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import Section from "../ui/Section";
import { Btn, Chip, Field, Input, formatBytes } from "../ui/atoms";
import { useCached, formatAge } from "../hooks/useCached";

type NodeRole = "relay" | "miner";
type Settings = { arkPyPath: string; role: NodeRole };
type ValidationReport = { arkPyExists: boolean };
type GpuInfo = { name: string; vramMb: number; vramBytes: number; driver?: string | null };
type HostProbe = {
  os: "windows" | "linux" | "darwin" | "unknown";
  arch: string;
  pythonOk: boolean;
  pythonVersion: string | null;
  pipOk: boolean;
  arkPyOk: boolean;
  arkPyVersion: string | null;
  cudaOk: boolean;
  gpus: GpuInfo[];
  warnings?: string[];
};

const SmallSpinner = () => (
  <span
    className="inline-block h-3 w-3 align-[-2px] rounded-full border border-white/30 border-t-transparent"
    style={{ animation: "ark-spin 900ms linear infinite" }}
    aria-hidden
  />
);

if (typeof document !== "undefined" && !document.getElementById("ark-spin-style")) {
  const el = document.createElement("style");
  el.id = "ark-spin-style";
  el.textContent = "@keyframes ark-spin{to{transform:rotate(360deg)}}";
  document.head.appendChild(el);
}

export default function MinerSettings() {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [draft, setDraft] = useState<Settings | null>(null);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [diagLog, setDiagLog] = useState<string>("");

  // Load settings once
  useEffect(() => {
    (async () => {
      try {
        const s = await invoke<Settings>("get_settings");
        setSettings(s);
        setDraft(s);
      } catch (e: any) {
        setErr(String(e));
        const fallback = { arkPyPath: "", role: "miner" } as Settings;
        setSettings(fallback);
        setDraft(fallback);
      }
    })();
  }, []);

  // Cached validation (key depends on arkPyPath, small TTL)
  const vKey = `arknet.miner.validation:${draft?.arkPyPath ?? ""}`;
  const { data: report, busy: reportBusy, refresh: refreshValidation, ts: vTs, invalidate: invV } =
    useCached<ValidationReport>(
      vKey,
      async () => invoke<ValidationReport>("validate_settings"),
      { ttlMs: 10 * 60 * 1000, autoload: !!draft } // 10m
    );

  // Cached host probe (longer TTL)
  const { data: host, busy: hostBusy, refresh: refreshHost, ts: hTs, invalidate: invH } =
    useCached<HostProbe>(
      "arknet.miner.host_probe",
      async () => invoke<HostProbe>("host_probe"),
      { ttlMs: 6 * 60 * 60 * 1000, autoload: true } // 6h
    );

  // When arkPyPath changes, invalidate validation cache to force fresh check on next refresh/autoload
  useEffect(() => { invV(); /* don’t auto-refresh immediately to keep page snappy */ }, [draft?.arkPyPath]); // eslint-disable-line

  const dirty = useMemo(() => JSON.stringify(settings) !== JSON.stringify(draft), [settings, draft]);

  const onBrowseArkPy = async () => {
    try {
      const res = await open({
        directory: false,
        multiple: false,
        title: "Select ArkPy entrypoint",
        filters: [{ name: "Python", extensions: ["py", "pyw", "pyz"] }],
      });
      if (!res || !draft) return;
      setDraft({ ...draft, arkPyPath: String(res) });
    } catch (e: any) {
      setErr(String(e));
    }
  };

  const onSave = async () => {
    if (!draft) return;
    setSaving(true);
    try {
      await invoke("save_settings", { settings: draft });
      setSettings(draft);
      await refreshValidation();
    } catch (e: any) {
      setErr(String(e));
    } finally {
      setSaving(false);
    }
  };

  const triggerRecheck = async () => {
    await Promise.all([refreshValidation(), refreshHost()]);
  };

  const installArkPy = async () => {
    try {
      setDiagLog("(installing ArkPy…)");
      await invoke("install_arkpy");
      await triggerRecheck();
      setDiagLog("ArkPy installed.");
    } catch (e: any) {
      setDiagLog(String(e));
    }
  };

  const locatePython = async () => {
    try {
      setDiagLog("(locating Python…) ");
      const p = await invoke<string | null>("locate_python").catch(() => null);
      setDiagLog(p ? `Python: ${p}` : "Python not found.");
      await triggerRecheck();
    } catch (e: any) {
      setDiagLog(String(e));
    }
  };

  if (!draft) {
    return (
      <Section title="Miner" variant="card" surface={2} padding="lg" headerPadding="md">
        <div className="text-sm text-white/70 flex items-center gap-2"><SmallSpinner /> Loading…</div>
        {err ? <div className="mt-2 text-rose-400 text-sm">{err}</div> : null}
      </Section>
    );
  }

  const topBytes =
    (host?.gpus?.[0]?.vramBytes ?? 0) ||
    ((host?.gpus?.[0]?.vramMb ?? 0) * 1024 * 1024);

  const has16GB = topBytes >= 16 * 1024 * 1024 * 1024;
  const minerReady = !!host && host.pythonOk && host.pipOk && host.arkPyOk && host.cudaOk && has16GB;

  return (
    <>
      <Section
        title="Miner Setup"
        variant="card"
        surface={2}
        padding="lg"
        headerPadding="md"
        actions={
          <div className="flex items-center gap-2">
            {(hostBusy || reportBusy) ? (
              <span className="text-[12px] text-white/60 flex items-center gap-2">
                <SmallSpinner /> probing…
              </span>
            ) : null}
            <Chip ok={!!minerReady} label={minerReady ? "Ready" : "Not ready"} />
            <Btn onClick={triggerRecheck} disabled={hostBusy || reportBusy}>Re-check</Btn>
            <Btn onClick={installArkPy} disabled={!!host?.arkPyOk || hostBusy}>Install ArkPy</Btn>
            <Btn onClick={locatePython} disabled={hostBusy}>Locate Python</Btn>
            <Btn
              onClick={onSave}
              disabled={!dirty || saving}
              className="bg-primary/20 hover:bg-primary/30 border-primary/30"
              aria-busy={saving}
              title={saving ? "Saving…" : ""}
            >
              {saving ? (<span className="inline-flex items-center gap-2"><SmallSpinner /> Saving…</span>) : (dirty ? "Save Changes" : "Saved")}
            </Btn>
          </div>
        }
        footer={
          <div className="text-[12px] text-white/55 flex flex-wrap gap-4">
            <span>Host probe: {formatAge(hTs)}</span>
            <span>Validation: {formatAge(vTs)}</span>
            <button
              className="underline underline-offset-2 hover:text-white/80"
              onClick={() => { invH(); invV(); }}
              title="Clear cached diagnostics"
            >
              Clear cache
            </button>
          </div>
        }
      >
        <div className="grid gap-6 md:grid-cols-2">
          <Field label="ArkPy Path" hint="Python script or module entrypoint">
            <div className="flex gap-2">
              <Input
                value={draft.arkPyPath}
                onChange={(e) => setDraft({ ...draft, arkPyPath: e.target.value })}
                spellCheck={false}
              />
              <Btn onClick={onBrowseArkPy} disabled={hostBusy || reportBusy}>Browse</Btn>
            </div>
            <div className="mt-2 flex items-center gap-2">
              {reportBusy ? (
                <span className="text-[12px] text-white/60 flex items-center gap-2"><SmallSpinner /> validating…</span>
              ) : report ? (
                <Chip ok={report.arkPyExists} label={report.arkPyExists ? "File found" : "File not found"} />
              ) : null}
            </div>
          </Field>

          <Field label="Python" hint="Interpreter & pip">
            <div className="flex items-center gap-2">
              {hostBusy ? (
                <span className="text-[12px] text-white/60 flex items-center gap-2"><SmallSpinner /> probing…</span>
              ) : (
                <>
                  <Chip ok={!!host?.pythonOk} label={host?.pythonOk ? (host?.pythonVersion || "OK") : "Missing"} />
                  <Chip ok={!!host?.pipOk} label={host?.pipOk ? "pip OK" : "pip missing"} />
                </>
              )}
            </div>
          </Field>

          <Field label="ArkPy" hint="Miner library">
            <div className="flex items-center gap-2">
              {hostBusy ? (
                <span className="text-[12px] text-white/60 flex items-center gap-2"><SmallSpinner /> probing…</span>
              ) : (
                <Chip ok={!!host?.arkPyOk} label={host?.arkPyOk ? (host?.arkPyVersion || "Installed") : "Not installed"} />
              )}
            </div>
          </Field>

          <Field label="GPU & Compute" hint="CUDA/Metal/ROCm, ≥16 GiB VRAM recommended">
            <div className="flex items-center gap-2">
              {hostBusy ? (
                <span className="text-[12px] text-white/60 flex items-center gap-2"><SmallSpinner /> probing…</span>
              ) : (
                <>
                  <Chip ok={!!host?.cudaOk} label={host?.cudaOk ? "Compute OK" : "Unsupported"} />
                  <Chip ok={has16GB} label={has16GB ? "≥ 16 GiB VRAM" : "< 16 GiB VRAM"} />
                </>
              )}
            </div>
            <div className="mt-2 text-[12px] text-white/60">
              {hostBusy
                ? "Probing…"
                : host?.gpus?.length
                ? `Top GPU: ${host.gpus[0].name} • ${formatBytes(topBytes)} VRAM${host.gpus[0].driver ? ` • Driver ${host.gpus[0].driver}` : ""}`
                : host
                ? "No discrete GPU detected"
                : "Probing…"}
            </div>
          </Field>
        </div>

        <div className="mt-4 rounded-md border border-border p-3">
          <div className="text-[12px] text-white/60 mb-1">Diagnostics</div>
          <pre className="text-[12px] whitespace-pre-wrap text-white/85 min-h-[72px]">
            {(hostBusy ? "(probing…)\n" : "") +
              (reportBusy ? "(validating…)\n" : "") +
              (host?.warnings?.length ? host.warnings.join("\n") + "\n" : "") +
              (diagLog || "(ready)")}
          </pre>
          {err ? <div className="mt-2 text-rose-400 text-sm">{err}</div> : null}
        </div>
      </Section>
    </>
  );
}
