// src/pages/Settings.tsx
import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import Section from "../ui/Section";
import NodeSettings from "./NodeSettings";
import MinerSettings from "./MinerSettings";

type NodeRole = "relay" | "miner";
type Settings = { role: NodeRole };
type Tab = "node" | "miner";

export default function SettingsPage() {
  const [tab, setTab] = useState<Tab>("node");

  useEffect(() => {
    (async () => {
      try {
        const s = await invoke<Settings>("get_settings");
        setTab(s.role === "miner" ? "miner" : "node");
      } catch {
        setTab("node");
      }
    })();
  }, []);

  return (
    <div className="h-[calc(100vh-56px)] overflow-y-auto">
      <div className="sticky top-0 z-10 bg-transparent/60 backdrop-blur-md">
        <div className="px-6 pt-4">
          <div className="inline-flex items-center gap-1 rounded-lg border border-border bg-white/5 p-1">
            <button onClick={() => setTab("node")}  className={["px-3 py-1.5 rounded-md text-[13px]", tab==="node" ? "bg-white/10 border border-border":"hover:bg-white/5"].join(" ")}>Node</button>
            <button onClick={() => setTab("miner")} className={["px-3 py-1.5 rounded-md text-[13px]", tab==="miner"? "bg-white/10 border border-border":"hover:bg-white/5"].join(" ")}>Miner</button>
          </div>
        </div>
      </div>

      <div className="p-6 max-w-6xl mx-auto space-y-6">
        {tab === "node"
          ? <NodeSettings onRoleSaved={(newRole) => newRole === "miner" && setTab("miner")} />
          : <MinerSettings />}
        <Section variant="plain" border={false} padding="sm">
          <div className="text-[12px] text-white/50">Tip: switch tabs anytime; your changes are saved per page.</div>
        </Section>
      </div>
    </div>
  );
}
