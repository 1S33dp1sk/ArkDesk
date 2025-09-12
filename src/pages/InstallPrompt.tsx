// src/pages/InstallPrompt.tsx
import { useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen, UnlistenFn } from "@tauri-apps/api/event";
import Section from "../ui/Section";

type CleanupReport = { removed: string[]; skipped: { path: string; reason: string }[] };
type Probe = { home: string; present: boolean; initialized: boolean; missing: string[] };
type InstallEvt = { step: number; total: number; label: string; done: boolean; ok: boolean };

type Preflight = {
  home: string;
  parent: string;
  parentExists: boolean;
  parentWritable: boolean;
  freeBytes: number;
  needBytes: number;
  spurious: string[];
  missingBins: string[];
  binsOk: boolean;
  missingWheels: string[];
  wheelsOk: boolean;
  // Windows-only (present but harmless elsewhere)
  missingDlls: string[];
  dllsOk: boolean;
  ok: boolean;
};

type SelfTest = {
  binPath: string;
  arkdOk: boolean;
  arkdStdout: string;
  arkdStderr: string;
  python: string;
  arkpyOk: boolean;
  arkpyVersion: string;
};

const Chip = ({ ok, label }: { ok: boolean; label: string }) => (
  <span
    className={[
      "inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] border",
      ok
        ? "bg-emerald-500/10 text-emerald-300 border-emerald-500/30"
        : "bg-rose-500/10 text-rose-300 border-rose-500/30",
    ].join(" ")}
  >
    <span className={["inline-block h-1.5 w-1.5 rounded-full", ok ? "bg-emerald-400" : "bg-rose-400"].join(" ")} />
    {label}
  </span>
);

function formatBytes(input: number, base: 1000 | 1024 = 1024): string {
  if (!Number.isFinite(input)) return "0 B";
  const units = base === 1024 ? ["B", "KiB", "MiB", "GiB", "TiB", "PiB", "EiB"] : ["B", "KB", "MB", "GB", "TB", "PB", "EB"];
  let n = Math.abs(input), i = 0;
  while (n >= base && i < units.length - 1) { n /= base; i++; }
  const fd = i === 0 ? 0 : 1;
  const val = input < 0 ? -n : n;
  return `${new Intl.NumberFormat(undefined, { minimumFractionDigits: fd, maximumFractionDigits: fd }).format(val)} ${units[i]}`;
}

export default function InstallPrompt({
  home,
  missing,
  onInstalled,
}: {
  home: string;
  missing: string[];
  onInstalled: () => void;
}) {
  const [probe, setProbe] = useState<Probe>({ home, present: false, initialized: false, missing });
  const [busy, setBusy] = useState(false);
  const [forceSpurious, setForceSpurious] = useState(false);
  const [log, setLog] = useState<string>("");

  const [preflight, setPreflight] = useState<Preflight | null>(null);
  const [selftest, setSelftest] = useState<SelfTest | null>(null);

  const [progress, setProgress] = useState<{ pct: number; label: string; active: boolean; done: boolean; visible: boolean; }>(
    { pct: 0, label: "", active: false, done: false, visible: false }
  );
  const unlistenRef = useRef<UnlistenFn | null>(null);
  const lastDllsOk = useRef<boolean | null>(null);

  useEffect(() => { setProbe({ home, present: false, initialized: false, missing }); }, [home, missing]);
  useEffect(() => { runPreflight(); }, []);
  useEffect(() => () => { if (unlistenRef.current) { unlistenRef.current(); unlistenRef.current = null; } }, []);

  // If DLL loader fails, auto-run selftest once to surface stderr immediately.
  useEffect(() => {
    if (!preflight) return;
    if (preflight.dllsOk === false && lastDllsOk.current !== false) {
      lastDllsOk.current = false;
      runSelftest().catch(() => {});
    } else {
      lastDllsOk.current = preflight.dllsOk;
    }
  }, [preflight]);

  const appendLog = (lines: string | string[]) =>
    setLog((prev) => (prev ? prev + "\n\n" : "") + (Array.isArray(lines) ? lines.join("\n") : lines));

  const runPreflight = async () => {
    try { setPreflight(await invoke<Preflight>("install_preflight")); }
    catch (e: any) { appendLog(String(e)); }
  };

  const recheck = async () => {
    const p = await invoke<Probe>("probe_install");
    setProbe(p);
    await runPreflight();
    if (p.initialized) onInstalled();
  };

  const runSelftest = async () => {
    try {
      const res = await invoke<SelfTest>("install_selftest");
      setSelftest(res);
      appendLog([
        "[selftest]",
        `arkdOk=${res.arkdOk}`,
        `arkpyOk=${res.arkpyOk} (v${res.arkpyVersion || "?"})`,
        res.arkdStdout?.trim() ? `arkd: ${res.arkdStdout.trim()}` : "",
        res.arkdStderr?.trim() ? `arkd(!): ${res.arkdStderr.trim()}` : "",
        `binPath=${res.binPath}`,
        `python=${res.python}`,
      ].filter(Boolean) as string[]);
    } catch (e: any) { appendLog(`selftest error: ${String(e)}`); }
  };

  const startInstall = async () => {
    if (unlistenRef.current) { unlistenRef.current(); unlistenRef.current = null; }
    setSelftest(null);
    setProgress({ pct: 0, label: "Starting…", active: true, done: false, visible: true });
    setBusy(true);

    unlistenRef.current = await listen<InstallEvt>("arknet://install_progress", (e) => {
      const { step, total, label, done } = e.payload;
      const pct = Math.min(100, Math.round((step / Math.max(1, total)) * 100));
      setProgress({ pct, label, active: !done, done, visible: true });
      if (done) {
        setBusy(false);
        setTimeout(async () => { await recheck(); await runSelftest(); }, 150);
        if (unlistenRef.current) { unlistenRef.current(); unlistenRef.current = null; }
      }
    });

    try { await invoke("install_arknet_progress"); }
    catch (e: any) {
      setBusy(false);
      setProgress({ pct: 0, label: "Error", active: false, done: false, visible: true });
      appendLog(String(e));
      if (unlistenRef.current) { unlistenRef.current(); unlistenRef.current = null; }
    }
  };

  const cleanupSpurious = async () => {
    setBusy(true);
    try {
      const r = await invoke<CleanupReport>("cleanup_spurious_dirs", { force: forceSpurious });
      const removed = r.removed.length ? r.removed.join("\n") : "(none)";
      const skipped = r.skipped.length ? r.skipped.map((s) => `${s.path} — ${s.reason}`).join("\n") : "(none)";
      setLog(`Removed:\n${removed}\n\nSkipped:\n${skipped}`);
      await recheck();
    } catch (e: any) { appendLog(String(e)); }
    finally { setBusy(false); }
  };

  const reveal = async () => { try { await invoke("reveal_ark_home"); } catch (e: any) { appendLog(String(e)); } };
  const copy = async (t: string) => { try { await navigator.clipboard.writeText(t); } catch {} };
  const clearLog = () => setLog("");

  // UI gating ignores DLL loader result; we only warn for it.
  const uiOk =
    preflight
      ? (preflight.parentExists &&
         preflight.parentWritable &&
         preflight.freeBytes >= preflight.needBytes &&
         preflight.binsOk &&
         preflight.wheelsOk)
      : false;

  const installDisabled = busy || !uiOk;

  const disabledReason = (() => {
    if (!preflight) return "";
    const reasons: string[] = [];
    if (!preflight.parentExists) reasons.push("parent folder missing");
    if (!preflight.parentWritable) reasons.push("parent not writable");
    if (preflight.freeBytes < preflight.needBytes) reasons.push(`need ≥ ${formatBytes(preflight.needBytes)} free (have ${formatBytes(preflight.freeBytes)})`);
    if (!preflight.binsOk) reasons.push(`binaries missing: ${preflight.missingBins?.length ? preflight.missingBins.join(", ") : "unknown"}`);
    if (!preflight.wheelsOk) reasons.push(`wheels missing: ${preflight.missingWheels?.length ? preflight.missingWheels.join(", ") : "unknown"}`);
    return reasons.join("; ");
  })();

  return (
    <div className="h-[calc(100vh-56px)] overflow-y-auto">
      <div className="p-6 max-w-[980px] mx-auto space-y-6">
        <Section
          variant="glass"
          surface={2}
          rounded="xl"
          padding="lg"
          headerPadding="md"
          title={
            <div className="flex items-center gap-3">
              <div className="h-8 w-8 rounded-lg bg-gradient-to-br from-primary/60 to-accent/60 grid place-items-center">
                <svg width="18" height="18" viewBox="0 0 56 56" aria-hidden>
                  <defs>
                    <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
                      <stop offset="0%" stopColor="#6aa9ff" />
                      <stop offset="100%" stopColor="#b59cff" />
                    </linearGradient>
                  </defs>
                  <path d="M28 10 L42 40 H36.5 L31.5 30 H24.5 L19.5 40 H14 L28 10 Z" fill="url(#g)" />
                </svg>
              </div>
              <div className="leading-tight">
                <div className="text-[12px] text-white/60">Arknet</div>
                <div className="text-lg font-semibold">{probe.initialized ? "Ready" : "Not initialized"}</div>
              </div>
            </div>
          }
          actions={
            <div className="flex items-center gap-2">
              <button onClick={recheck} className="px-3 py-2 rounded-md border border-border bg-white/5 hover:bg-white/10 text-[13px]">Re-check</button>
              <button onClick={reveal} className="px-3 py-2 rounded-md border border-border bg-white/5 hover:bg-white/10 text-[13px]">Reveal folder</button>
              <button
                onClick={startInstall}
                disabled={installDisabled}
                className="px-3 py-2 rounded-md border border-primary/30 bg-primary/20 hover:bg-primary/30 text-[13px] disabled:opacity-60"
                aria-busy={busy}
                title={disabledReason}
              >
                {busy ? "Setting up…" : "Install / Repair"}
              </button>
            </div>
          }
        >
          <div className="grid gap-6 md:grid-cols-[1.05fr_.95fr]">
            {/* Left column */}
            <div className="space-y-4">
              <div className="rounded-lg border border-border p-4">
                <div className="text-[12px] text-white/60 mb-1">Expected data directory</div>
                <code className="block text-[12px] break-all text-white/90">{probe.home}</code>

                {/* Preflight summary */}
                {preflight && (
                  <div className="mt-3 flex flex-wrap gap-2">
                    <Chip ok={preflight.parentExists} label="Parent exists" />
                    <Chip ok={preflight.parentWritable} label="Writable" />
                    <Chip ok={preflight.freeBytes >= preflight.needBytes} label={`Free ${formatBytes(preflight.freeBytes)} • Need ${formatBytes(preflight.needBytes)}`} />
                    <Chip ok={preflight.spurious.length === 0} label={preflight.spurious.length ? "Spurious detected" : "No spurious"} />
                    <Chip ok={preflight.binsOk} label={preflight.binsOk ? "Binaries bundled" : "Binaries missing"} />
                    <Chip ok={preflight.wheelsOk} label={preflight.wheelsOk ? "Wheels present" : "Wheels missing"} />
                    {"dllsOk" in preflight && <Chip ok={preflight.dllsOk} label={preflight.dllsOk ? "Loader OK" : "Loader failed"} />}
                    {selftest && (
                      <>
                        <Chip ok={selftest.arkdOk} label="arkd loads" />
                        <Chip ok={selftest.arkpyOk} label={`ArkPy import${selftest.arkpyVersion ? ` v${selftest.arkpyVersion}` : ""}`} />
                      </>
                    )}
                  </div>
                )}

                {/* Missing on disk (probe) */}
                {probe.missing?.length ? (
                  <details className="mt-3 group open:animate-fade-in">
                    <summary className="cursor-pointer text-[12px] text-white/70 select-none">Missing on disk</summary>
                    <ul className="mt-1 list-disc pl-5 text-[12px] text-white/80">
                      {probe.missing.map((m) => (<li key={m}>{m}</li>))}
                    </ul>
                  </details>
                ) : null}

                {/* Missing from bundle (bins) */}
                {preflight && !preflight.binsOk && preflight.missingBins.length ? (
                  <details className="mt-3 group open:animate-fade-in">
                    <summary className="cursor-pointer text-[12px] text-white/70 select-none">Missing from app bundle (binaries)</summary>
                    <ul className="mt-1 list-disc pl-5 text-[12px] text-white/80 break-all">
                      {preflight.missingBins.map((m) => (<li key={m}>{m}</li>))}
                    </ul>
                    <div className="mt-1 text-[11px] text-white/55">Place platform builds under <code>src-tauri/resources/bin/&lt;platform&gt;/</code> and rebuild.</div>
                  </details>
                ) : null}

                {/* Missing from bundle (wheels) */}
                {preflight && !preflight.wheelsOk && preflight.missingWheels.length ? (
                  <details className="mt-3 group open:animate-fade-in">
                    <summary className="cursor-pointer text-[12px] text-white/70 select-none">Missing from app bundle (wheels)</summary>
                    <ul className="mt-1 list-disc pl-5 text-[12px] text-white/80 break-all">
                      {preflight.missingWheels.map((m) => (<li key={m}>{m}</li>))}
                    </ul>
                    <div className="mt-1 text-[11px] text-white/55">Place wheels under <code>src-tauri/resources/wheels/</code> and rebuild.</div>
                  </details>
                ) : null}

                {/* DLL issues (Windows) */}
                {preflight && preflight.dllsOk === false ? (
                  <details className="mt-3 group open:animate-fade-in">
                    <summary className="cursor-pointer text-[12px] text-white/70 select-none">DLL issues</summary>
                    <ul className="mt-1 list-disc pl-5 text-[12px] text-white/80 break-all">
                      {preflight.missingDlls?.length
                        ? preflight.missingDlls.map((m) => (<li key={m}>{m}</li>))
                        : (<li>Loader check failed. Run <b>Self-test</b> for exact error (stderr).</li>)}
                    </ul>
                    <div className="mt-1 text-[11px] text-white/55">
                      Ensure required <code>.dll</code> files are beside the binaries in <code>resources/bin/windows/</code>.
                    </div>
                  </details>
                ) : null}

                {/* Progress (hidden until started) */}
                {progress.visible && (
                  <div className="mt-4">
                    <div className="text-[12px] text-white/60 mb-1">Installation progress</div>
                    <div className="w-full h-2 rounded-md bg-white/10 overflow-hidden">
                      <div
                        className="h-full rounded-md progress-stripes transition-[width] duration-500"
                        style={{ width: `${progress.pct}%` }}
                        aria-valuenow={progress.pct}
                        aria-valuemin={0}
                        aria-valuemax={100}
                        role="progressbar"
                      />
                    </div>
                    <div className="mt-1 text-[12px] text-white/70 min-h-[18px]">{progress.label || "—"}</div>
                  </div>
                )}

                {/* Actions row under progress */}
                <div className="mt-3 flex items-center gap-2">
                  <button
                    onClick={runSelftest}
                    disabled={busy}
                    className="px-3 py-1.5 rounded-md border border-border bg-white/5 hover:bg-white/10 text-[12px]"
                  >
                    Run self-test
                  </button>
                  <button
                    onClick={() => copy(log || "")}
                    className="px-3 py-1.5 rounded-md border border-border bg-white/5 hover:bg-white/10 text-[12px]"
                    disabled={!log}
                    title="Copy log to clipboard"
                  >
                    Copy log
                  </button>
                  <button
                    onClick={clearLog}
                    className="px-3 py-1.5 rounded-md border border-border bg-white/5 hover:bg-white/10 text-[12px]"
                    disabled={!log}
                  >
                    Clear log
                  </button>
                </div>
              </div>

              <div className="rounded-lg border border-border p-4">
                <div className="text-[12px] text-white/60 mb-2">Quick start</div>
                <ol className="list-decimal pl-5 space-y-1.5 text-[13px] text-white/80">
                  <li>Run <span className="px-1 rounded bg-white/10">Install / Repair</span>.</li>
                  <li>Open <span className="px-1 rounded bg-white/10">Settings</span> and set paths.</li>
                  <li>Start your node; watch status turn green.</li>
                </ol>
              </div>
            </div>

            {/* Right column */}
            <div className="space-y-4">
              <div className="rounded-lg border border-border p-4">
                <div className="text-[12px] text-white/60 mb-2">Maintenance</div>
                <div className="space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <div className="text-[13px] text-white/80">Remove spurious folders</div>
                    <div className="flex items-center gap-3">
                      <label className="text-[12px] text-white/70 flex items-center gap-2">
                        <input type="checkbox" checked={forceSpurious} onChange={(e) => setForceSpurious(e.target.checked)} />
                        Force
                      </label>
                      <button
                        onClick={cleanupSpurious}
                        disabled={busy}
                        className="px-3 py-2 rounded-md border border-border bg-white/5 hover:bg-white/10 text-[13px]"
                      >
                        Clean
                      </button>
                    </div>
                  </div>
                  {preflight?.spurious?.length ? (
                    <div className="text-[12px] text-white/70 mt-1 break-all">Found: {preflight.spurious.join(", ")}</div>
                  ) : null}
                  <p className="text-[12px] text-white/60">
                    Cleans accidental <code>./Arknet</code> or <code>./.arknet</code> in app working directory.
                  </p>
                </div>
              </div>

              <div className="rounded-lg border border-border p-3">
                <div className="flex items-center justify-between">
                  <div className="text-[12px] text-white/60 mb-1">Log</div>
                  {!!selftest && (
                    <div className="text-[11px] text-white/55">
                      Bin: <code className="opacity-80">{selftest.binPath}</code> • Py: <code className="opacity-80">{selftest.python}</code>
                    </div>
                  )}
                </div>
                <pre className="text-[12px] whitespace-pre-wrap text-white/85 min-h-[96px] max-h-[260px] overflow-y-auto">
                  {log || "(ready)"}
                </pre>
              </div>
            </div>
          </div>
        </Section>

        <Section
          variant="card"
          surface={2}
          rounded="xl"
          padding="lg"
          headerPadding="md"
          title="Next step"
          actions={
            <button
              onClick={onInstalled}
              disabled={!probe?.initialized}
              className="px-3 py-2 rounded-md border border-border bg-white/5 hover:bg-white/10 text-[13px] disabled:opacity-50"
              title={probe?.initialized ? "Open Settings" : "Install first"}
            >
              Open Settings
            </button>
          }
        >
          <div className="text-[13px] text-white/75">
            When initialization completes, configure ports, role (Relay / Miner), and paths on the Settings page.
          </div>
        </Section>
      </div>
    </div>
  );
}
