// src/App.tsx
import { useEffect, useMemo, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import BackgroundFX from "./components/BackgroundFX";
import { ThemeToggle } from "./theme";
import Section from "./ui/Section";
import InstallPrompt from "./pages/InstallPrompt";
import SettingsPage from "./pages/Settings";
import Home from "./pages/Home";
import World from "./pages/World";
import BlockPage from "./pages/Block"; // real page
import TxPage from "./pages/Tx";

type Probe = {
  home: string;
  present: boolean;
  initialized: boolean;
  missing: string[];
};

/* ───────────────────────── Router ───────────────────────── */

type TopRoute = "home" | "world" | "settings";
type Route =
  | { name: TopRoute }
  | { name: "block"; height: number }
  | { name: "txs" }
  | { name: "tx"; id: string };

function parseHash(): Route {
  const raw = (location.hash || "#/home").toLowerCase();
  // normalize to "#/..."
  const h = raw.startsWith("#/") ? raw.slice(2) : raw.startsWith("#") ? raw.slice(1) : raw;

  // explorer/blocks/:height
  if (h.startsWith("explorer/blocks/")) {
    const seg = h.split("/");
    const height = Number(seg[2] ?? 0);
    if (Number.isFinite(height) && height > 0) return { name: "block", height };
  }

  // explorer/txs or explorer/txs/:id
  if (h === "explorer/txs") return { name: "txs" };
  if (h.startsWith("explorer/txs/")) {
    const id = decodeURIComponent(h.split("/")[2] || "");
    if (id) return { name: "tx", id };
  }

  // top-level pages
  if (h === "world") return { name: "world" };
  if (h === "settings") return { name: "settings" };
  return { name: "home" };
}

function toHash(r: Route): string {
  switch (r.name) {
    case "home": return "#/home";
    case "world": return "#/world";
    case "settings": return "#/settings";
    case "block": return `#/explorer/blocks/${r.height}`;
    case "txs": return "#/explorer/txs";
    case "tx": return `#/explorer/txs/${encodeURIComponent(r.id)}`;
  }
}

/* ───────────────────────── App ───────────────────────── */

export default function App() {
  const [probe, setProbe] = useState<Probe | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [route, setRoute] = useState<Route>(parseHash());

  const go = (r: Route | TopRoute) => {
    const target: Route = typeof r === "string" ? { name: r } : r;
    setRoute(target); // state-first so UI updates even if hashchange is swallowed
    const h = toHash(target);
    if ((location.hash || "").toLowerCase() !== h.toLowerCase()) location.hash = h;
  };

  const runProbe = async () => {
    try {
      setErr(null);
      const p = await invoke<Probe>("probe_install");
      setProbe(p);
      // Respect current hash; do not force navigation
      setRoute(parseHash());
    } catch (e: any) {
      setErr(String(e));
      setProbe(null);
    }
  };

  useEffect(() => {
    const root = document.documentElement;
    if (!root.dataset.theme) {
      root.dataset.theme = "dark";
      try { localStorage.setItem("arknet.theme", "dark"); } catch {}
    }
    runProbe();
    const onHash = () => setRoute(parseHash());
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  const nav = useMemo(() => {
    if (!probe?.initialized) return null;
    const base = "px-3 py-1.5 rounded-md text-[13px] border";
    const active = "bg-white/10 border-border";
    const idle = "border-transparent hover:bg-white/5";
    const top = route.name === "home" || route.name === "world" || route.name === "settings" ? route.name : "home";
    return (
      <div className="inline-flex items-center gap-1 rounded-lg border border-border bg-white/5 p-1">
        <button onClick={() => go("home")} className={[base, top === "home" ? active : idle].join(" ")}>Overview</button>
        <button onClick={() => go("world")} className={[base, top === "world" ? active : idle].join(" ")}>World</button>
        <button onClick={() => go("settings")} className={[base, top === "settings" ? active : idle].join(" ")}>Settings</button>
      </div>
    );
  }, [probe?.initialized, route]);

  /* ───────────────────────── Render ───────────────────────── */

  const renderRouted = () => {
    switch (route.name) {
      case "settings": return <SettingsPage />;
      case "world": return <World />;
      case "block": return <BlockPage height={route.height} />;
      case "txs":
        return (
          <div className="p-6 max-w-5xl mx-auto">
            <Section title="Transactions" variant="card" surface={2} padding="lg" headerPadding="md">
              <div className="text-sm text-white/70">
                Paste a transaction id into the URL like{" "}
                <code className="font-mono text-[12px]">#/explorer/txs/&lt;tx-id&gt;</code>, or click a tx from a block.
              </div>
            </Section>
          </div>
        );
      case "tx":
        return <TxPage id={route.id} />;
      case "home":
      default:
        return <Home />;
    }
  };

  return (
    <div className="relative h-full overflow-hidden">
      <BackgroundFX />
      <header className="fixed inset-x-0 top-0 z-40 flex items-center justify-between gap-4 px-5 py-3">
        <div className="flex items-center gap-3">
          <div className="text-sm font-medium text-white/80">Arknet</div>
          {nav}
        </div>
        <ThemeToggle size="sm" />
      </header>

      <main className="h-full pt-[56px]">
        {!probe ? (
          <div className="p-6 max-w-xl mx-auto">
            <Section title="Checking environment…" variant="card" surface={2} padding="lg" headerPadding="md">
              <div className="text-sm text-white/70">{err ?? "Probing Arknet directories…"}</div>
            </Section>
          </div>
        ) : probe.initialized ? (
          renderRouted()
        ) : (
          <InstallPrompt home={probe.home} missing={probe.missing} onInstalled={runProbe} />
        )}
      </main>
    </div>
  );
}
