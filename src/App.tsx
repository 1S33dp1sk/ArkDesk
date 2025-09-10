// src/App.tsx
import  { useEffect, useMemo, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import BackgroundFX from "./components/BackgroundFX";
import { ThemeToggle } from "./theme";
import Section from "./ui/Section";
import InstallPrompt from "./pages/InstallPrompt";
import SettingsPage from "./pages/Settings";
import Home from "./pages/Home";

type Probe = {
  home: string;
  present: boolean;
  initialized: boolean;
  missing: string[];
};

type Route = "home" | "settings";

function currentRoute(): Route {
  return location.hash === "#settings" ? "settings" : "home";
}

export default function App() {
  const [probe, setProbe] = useState<Probe | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [route, setRoute] = useState<Route>(currentRoute());

  const runProbe = async () => {
    try {
      setErr(null);
      const p = await invoke<Probe>("probe_install");
      setProbe(p);
      // If we just finished installing, default to the overview
      if (p.initialized && currentRoute() !== "settings") {
        location.hash = "#home";
        setRoute("home");
      }
    } catch (e: any) {
      setErr(String(e));
      setProbe(null);
    }
  };

  useEffect(() => {
    // default theme on first load
    const root = document.documentElement;
    if (!root.dataset.theme) {
      root.dataset.theme = "dark";
      try { localStorage.setItem("arknet.theme", "dark"); } catch {}
    }
    // initial probe
    runProbe();

    // hash router
    const onHash = () => setRoute(currentRoute());
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  const nav = useMemo(() => {
    if (!probe?.initialized) return null;
    return (
      <div className="inline-flex items-center gap-1 rounded-lg border border-border bg-white/5 p-1">
        <a
          href="#home"
          className={[
            "px-3 py-1.5 rounded-md text-[13px]",
            route === "home" ? "bg-white/10 border border-border" : "hover:bg-white/5",
          ].join(" ")}
        >
          Overview
        </a>
        <a
          href="#settings"
          className={[
            "px-3 py-1.5 rounded-md text-[13px]",
            route === "settings" ? "bg-white/10 border border-border" : "hover:bg-white/5",
          ].join(" ")}
        >
          Settings
        </a>
      </div>
    );
  }, [probe?.initialized, route]);

  return (
    <div className="relative h-full overflow-hidden">
      <BackgroundFX />
      <header className="fixed inset-x-0 top-0 z-40 flex items-center justify-between gap-4 px-5 py-3">
        <div className="flex items-center gap-3">
          <div className="text-sm text-white/80 font-medium">Arknet</div>
          {nav}
        </div>
        <ThemeToggle size="sm" />
      </header>

      <main className="h-full pt-[56px]">
        {!probe ? (
          <div className="p-6 max-w-xl mx-auto">
            <Section title="Checking environment…" variant="card" surface={2} padding="lg" headerPadding="md">
              <div className="text-sm text-white/70">
                {err ?? "Probing Arknet directories…"}
              </div>
            </Section>
          </div>
        ) : probe.initialized ? (
          route === "settings" ? <SettingsPage /> : <Home />
        ) : (
          <InstallPrompt home={probe.home} missing={probe.missing} onInstalled={runProbe} />
        )}
      </main>
    </div>
  );
}
