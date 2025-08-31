// src/pages/IDE.tsx — Ark IDE (no Solidity), with status bar + autosave
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import SplitPane from "../components/ide/SplitPane";
import Tabs, { TabDef } from "../components/ide/Tabs";
import CodeEditor from "../components/ide/CodeEditor";
import JsonEditor from "../components/ide/JsonEditor";
import StatusBar from "../components/ide/StatusBar";
import { useToast } from "../ui/Toaster";
import { useConfirm } from "../ui/Confirm";

/* ------------------------------ types ------------------------------ */
type Lang = "ark" | "c" | "json" | "txt";
type FileNode = {
  path: string;
  name: string;
  kind: "file" | "dir";
  children?: FileNode[];
  content?: string;
  language?: Lang;
};

/* --------------------------- demo project -------------------------- */
const demoProject: FileNode = {
  path: "/",
  name: "ark-project",
  kind: "dir",
  children: [
    {
      path: "/programs",
      name: "programs",
      kind: "dir",
      children: [
        {
          path: "/programs/PayHook.ark",
          name: "PayHook.ark",
          kind: "file",
          language: "ark",
          content: `# ark v0 (demo only)
# A tiny hook that inspects PAY txs and logs a line.
fn on_tx_pay(sender: addr32, to: addr32, value: u64) {
    assert(value > 0)
    log("pay", value)
}
`,
        },
      ],
    },
    {
      path: "/tx_templates",
      name: "tx_templates",
      kind: "dir",
      children: [
        {
          path: "/tx_templates/pay.json",
          name: "pay.json",
          kind: "file",
          language: "json",
          content: `{
  "type": "PAY",
  "to":   "0x00000000000000000000000000000000000000ab",
  "value": 1,
  "gas_price": 12,
  "gas_limit": 21000,
  "nonce": 0
}`,
        },
      ],
    },
    {
      path: "/deploy.json",
      name: "deploy.json",
      kind: "file",
      language: "json",
      content: `{
  "network":   "BaseNet",
  "program":   "PayHook",
  "artifact":  "build/PayHook.arkbin",
  "init_args": [],
  "gas_limit": 120000
}`,
    },
    {
      path: "/README.md",
      name: "README.md",
      kind: "file",
      language: "txt",
      content: "Ark IDE demo project (no Solidity). Programs live under /programs.",
    },
  ],
};

/* ------------------------------ helpers ---------------------------- */
function findFile(root: FileNode, path: string): FileNode | null {
  if (root.path === path) return root;
  if (!root.children) return null;
  for (const c of root.children) {
    const r = findFile(c, path);
    if (r) return r;
  }
  return null;
}

function cloneProject(root: FileNode): FileNode {
  return JSON.parse(JSON.stringify(root));
}

/* ------------------------------ icons ------------------------------ */
function FolderIcon({ open }: { open?: boolean }) {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden className="shrink-0">
      <path
        d={open ? "M3 7h6l2 2h10v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7z" : "M3 6h6l2 2h10v2H3z"}
        fill="currentColor"
        opacity=".22"
      />
      <rect x="3" y="8" width="18" height="10" rx="2" ry="2" stroke="currentColor" fill="none" opacity=".5" />
    </svg>
  );
}
function FileIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden className="shrink-0">
      <path d="M6 4h7l5 5v11a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z" fill="currentColor" opacity=".18" />
      <path d="M13 4v5h5" stroke="currentColor" fill="none" opacity=".6" />
    </svg>
  );
}

/* collapsible tree */
function Tree({
  node,
  active,
  onOpen,
  openDirs,
  setOpenDirs,
  depth = 0,
}: {
  node: FileNode;
  active: string;
  onOpen: (path: string) => void;
  openDirs: Set<string>;
  setOpenDirs: (s: Set<string>) => void;
  depth?: number;
}) {
  const toggle = (p: string) => {
    const next = new Set(openDirs);
    if (next.has(p)) next.delete(p);
    else next.add(p);
    setOpenDirs(next);
  };

  if (node.kind === "file") {
    const isActive = active === node.path;
    return (
      <button
        onClick={() => onOpen(node.path)}
        className={`w-full text-left px-2 py-1.5 rounded-md truncate flex items-center gap-2 ${
          isActive ? "bg-white/10" : "hover:bg-white/5"
        }`}
        style={{ paddingLeft: 8 + depth * 12 }}
        title={node.name}
      >
        <FileIcon />
        <span className="font-mono text-[12px]">{node.name}</span>
      </button>
    );
  }

  const isOpen = openDirs.has(node.path);
  return (
    <div>
      <button
        onClick={() => toggle(node.path)}
        className="w-full text-left px-2 py-1.5 rounded-md hover:bg-white/5 flex items-center gap-2"
        style={{ paddingLeft: 8 + depth * 12 }}
        title={node.name}
      >
        <FolderIcon open={isOpen} />
        <span className="text-[12px] text-muted">{node.name}</span>
        <span className="ml-auto text-[11px] text-muted">{node.children?.length ?? 0}</span>
      </button>
      {isOpen && (
        <div className="grid">
          {node.children?.map((c) => (
            <Tree
              key={c.path}
              node={c}
              active={active}
              onOpen={onOpen}
              openDirs={openDirs}
              setOpenDirs={setOpenDirs}
              depth={depth + 1}
            />
          ))}
        </div>
      )}
    </div>
  );
}

/* -------------------------------- IDE ------------------------------ */
export default function IDE() {
  const { toast } = useToast();
  const confirm = useConfirm();

  // project + file buffer
  const [project, setProject] = useState<FileNode>(demoProject);
  const [activeFile, setActiveFile] = useState<string>("/programs/PayHook.ark");
  const fnode = useMemo(() => findFile(project, activeFile)!, [project, activeFile]);
  const [buffer, setBuffer] = useState<string>(fnode?.content ?? "");
  useEffect(() => setBuffer(fnode?.content ?? ""), [fnode?.content]);

  // tree open state
  const [openDirs, setOpenDirs] = useState<Set<string>>(new Set<string>(["/", "/programs", "/tx_templates"]));

  // status + autosave
  const [cursor, setCursor] = useState<{ line: number; col: number }>({ line: 1, col: 1 });
  const [autosave, setAutosave] = useState<boolean>(() => {
    const s = localStorage.getItem("ark:ide:autosave");
    return s ? s === "1" : false;
  });
  useEffect(() => {
    localStorage.setItem("ark:ide:autosave", autosave ? "1" : "0");
  }, [autosave]);

  // tabs
  const tabs: TabDef[] = useMemo(
    () => [
      { key: "editor", label: "Editor" },
      { key: "deploy", label: "Deploy" },
      { key: "rpc", label: "RPC Playground" },
    ],
    []
  );
  const [tab, setTab] = useState<string>(() => localStorage.getItem("ark:ide:tab") || "editor");
  useEffect(() => localStorage.setItem("ark:ide:tab", tab), [tab]);

  // output panel
  const [bottomOpen, setBottomOpen] = useState<boolean>(() => {
    const s = localStorage.getItem("ark:ide:bottomOpen");
    return s ? s === "1" : true;
  });
  useEffect(() => localStorage.setItem("ark:ide:bottomOpen", bottomOpen ? "1" : "0"), [bottomOpen]);
  const [output, setOutput] = useState<string>("");

  // dirty tracking
  const dirty = buffer !== (fnode?.content ?? "");
  const tryOpenFile = async (path: string) => {
    if (path === activeFile) return;
    if (dirty && !autosave) {
      const ok = await confirm({
        title: "Discard unsaved changes?",
        message: `You have unsaved changes in ${fnode?.name}. Save or discard before switching.`,
        confirmText: "Discard",
        cancelText: "Cancel",
        extra: { secondary: "Save & Switch" },
      });
      // If Confirm supports extra callback; simple handling:
      if (!ok) return; // cancel
      // discard
    }
    setActiveFile(path);
  };

  // save + kb + autosave
  const save = useCallback(() => {
    setProject((p) => {
      const next = cloneProject(p);
      const n = findFile(next, activeFile);
      if (n && n.kind === "file") n.content = buffer;
      return next;
    });
    toast({ variant: "success", message: "Saved." });
  }, [activeFile, buffer, toast]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const isMac = /Mac|iPod|iPhone|iPad/.test(navigator.platform);
      if ((isMac ? e.metaKey : e.ctrlKey) && e.key.toLowerCase() === "s") {
        e.preventDefault();
        save();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [save]);

  useEffect(() => {
    if (!autosave) return;
    const id = window.setTimeout(() => {
      if (dirty) save();
    }, 500);
    return () => window.clearTimeout(id);
  }, [buffer, activeFile, autosave, dirty, save]);

  // actions
  const runCompile = () => {
    setBottomOpen(true);
    setOutput((o) => `${o}${o ? "\n" : ""}Compiling with arkc…\nprograms/PayHook.ark: OK\nArtifacts → build/PayHook.arkbin\n`);
    toast({ message: "Compiled artifacts.", variant: "success" });
  };

  const runDeploy = async (cfg: { network: string; program: string; artifact: string; gas_limit: number }) => {
    const ok = await confirm({
      title: "Deploy program?",
      message: `Network: ${cfg.network}\nProgram: ${cfg.program}\nArtifact: ${cfg.artifact}\nGas limit: ${cfg.gas_limit}`,
      confirmText: "Deploy",
    });
    if (!ok) return;
    setBottomOpen(true);
    setOutput((o) => `${o}${o ? "\n" : ""}Deploying…\nSubmitted tx 0xabc…123\nWaiting for inclusion…\nProgram ID 0x8a…009c deployed.\n`);
    toast({ message: "Deployment submitted.", variant: "default" });
  };

  const runRPC = async (method: string, params: unknown) => {
    setBottomOpen(true);
    setOutput((o) => `${o}${o ? "\n" : ""}→ ${method} ${JSON.stringify(params)}\n← 200 OK\n{ "result": "stub" }\n`);
  };

  const copyOutput = async () => {
    try {
      await navigator.clipboard.writeText(output);
      toast({ message: "Output copied.", variant: "success" });
    } catch {
      toast({ message: "Copy failed.", variant: "destructive" });
    }
  };

  const clearOutput = () => setOutput("");

  /* render */
  return (
    <div className="h-full grid grid-rows-[auto_minmax(0,1fr)_auto]">
      {/* Top bar */}
      <div className="glass border-b border-border h-12 px-3 flex items-center gap-2">
        <div className="text-sm">IDE</div>
        {dirty && <span className="text-[11px] px-2 py-0.5 rounded-md border border-border bg-white/5">● unsaved</span>}
        <div className="flex-1" />
        <button className="btn px-3 py-1.5 text-sm" onClick={save} title="Save (⌘/Ctrl+S)">
          Save
        </button>
        <button className="btn px-3 py-1.5 text-sm" onClick={runCompile}>
          Compile
        </button>
      </div>

      {/* Middle */}
      <SplitPane dir="horizontal" minA={220} minB={360} initialA={260}>
        {/* Left: tree */}
        <div className="h-full p-3 overflow-auto">
          <div className="text-[12px] text-muted mb-2">Project</div>
          <Tree
            node={project}
            active={activeFile}
            onOpen={tryOpenFile}
            openDirs={openDirs}
            setOpenDirs={setOpenDirs}
          />
        </div>

        {/* Right: tabs + editors + status */}
        <div className="h-full grid grid-rows-[auto_minmax(0,1fr)_auto]">
          <div className="border-b border-border">
            <Tabs tabs={tabs} active={tab} onChange={setTab} />
          </div>
          <div className="min-h-0">
            {tab === "editor" && (
              <EditorPane
                node={fnode}
                value={buffer}
                onChange={setBuffer}
                onCursorChange={(line, col) => setCursor({ line, col })}
              />
            )}
            {tab === "deploy" && <DeployPane project={project} onDeploy={runDeploy} />}
            {tab === "rpc" && <RpcPane onRun={runRPC} />}
          </div>
          <StatusBar
            path={fnode.path}
            line={cursor.line}
            col={cursor.col}
            autosave={autosave}
            onToggleAutosave={() => setAutosave((v) => !v)}
          />
        </div>
      </SplitPane>

      {/* Bottom output */}
      <div className="border-t border-border">
        <div className="flex items-center justify-between px-3 py-2">
          <div className="text-[12px] text-muted">Output</div>
          <div className="flex items-center gap-2">
            <button className="soft-btn px-2 py-1 text-[12px]" onClick={copyOutput}>
              Copy
            </button>
            <button className="soft-btn px-2 py-1 text-[12px]" onClick={clearOutput}>
              Clear
            </button>
            <button className="soft-btn px-2 py-1 text-[12px]" onClick={() => setBottomOpen((v) => !v)}>
              {bottomOpen ? "Hide" : "Show"}
            </button>
          </div>
        </div>
        {bottomOpen && (
          <div className="h-40 overflow-auto font-mono text-[12px] px-3 pb-3">
            <pre className="whitespace-pre-wrap">{output || "—"}</pre>
          </div>
        )}
      </div>
    </div>
  );
}

/* ---------------------------- panes ---------------------------- */
function EditorPane({
  node,
  value,
  onChange,
  onCursorChange,
}: {
  node: FileNode;
  value: string;
  onChange: (s: string) => void;
  onCursorChange: (line: number, col: number) => void;
}) {
  const lang = node.language ?? "txt";
  return (
    <div className="h-full grid grid-rows-[auto_minmax(0,1fr)]">
      <div className="flex items-center gap-2 px-3 py-2">
        <div className="text-[12px] text-muted truncate">{node.path}</div>
        <div className="ml-auto text-[12px] text-muted">{lang.toUpperCase()}</div>
      </div>
      <div className="min-h-0">
        {lang === "json" ? (
          <JsonEditor value={value} onChange={onChange} onCursorChange={onCursorChange} />
        ) : (
          <CodeEditor value={value} onChange={onChange} onCursorChange={onCursorChange} />
        )}
      </div>
    </div>
  );
}

function DeployPane({
  project,
  onDeploy,
}: {
  project: FileNode;
  onDeploy: (cfg: { network: string; program: string; artifact: string; gas_limit: number }) => void;
}) {
  const deployFile = findFile(project, "/deploy.json");
  const [form, setForm] = useState(() => {
    try {
      return JSON.parse(deployFile?.content || "{}");
    } catch {
      return {};
    }
  });
  const [gas, setGas] = useState<number>(form?.gas_limit ?? 120000);
  const networks = ["BaseNet", "DevNet"];
  const programs = (findFile(project, "/programs")?.children || [])
    .filter((x) => x.kind === "file" && x.name.endsWith(".ark"))
    .map((x) => x.name.replace(".ark", ""));
  const artifacts = [`build/${(form.program ?? programs[0] ?? "Program")}.arkbin`];

  return (
    <div className="h-full grid grid-cols-[minmax(0,1fr)_minmax(300px,360px)] gap-3 p-3">
      <div className="glass p-3 rounded-md">
        <div className="text-[12px] text-muted mb-2">deploy.json</div>
        <JsonEditor value={deployFile?.content || "{}"} onChange={() => {}} readOnly />
      </div>
      <div className="glass p-3 rounded-md grid gap-3 h-full">
        <div>
          <div className="text-[12px] text-muted mb-1">network</div>
          <select
            className="w-full px-3 py-2 rounded-md bg-white/5 border border-border text-sm"
            value={form.network ?? networks[0]}
            onChange={(e) => setForm((f: any) => ({ ...f, network: e.target.value }))}
          >
            {networks.map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </div>
        <div>
          <div className="text-[12px] text-muted mb-1">program</div>
          <select
            className="w-full px-3 py-2 rounded-md bg-white/5 border border-border text-sm"
            value={form.program ?? programs[0]}
            onChange={(e) => setForm((f: any) => ({ ...f, program: e.target.value }))}
          >
            {programs.map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </div>
        <div>
          <div className="text-[12px] text-muted mb-1">artifact</div>
          <select
            className="w-full px-3 py-2 rounded-md bg-white/5 border border-border text-sm"
            value={form.artifact ?? artifacts[0]}
            onChange={(e) => setForm((f: any) => ({ ...f, artifact: e.target.value }))}
          >
            {artifacts.map((a) => (
              <option key={a} value={a}>
                {a}
              </option>
            ))}
          </select>
        </div>
        <div>
          <div className="text-[12px] text-muted mb-1">gas_limit</div>
          <input
            type="number"
            className="w-full px-3 py-2 rounded-md bg-white/5 border border-border text-sm"
            value={gas}
            onChange={(e) => setGas(parseInt(e.currentTarget.value || "0", 10))}
          />
        </div>
        <div className="flex-1" />
        <button
          className="btn btn-primary px-4 py-2"
          onClick={() =>
            onDeploy({
              network: form.network ?? networks[0],
              program: form.program ?? programs[0],
              artifact: form.artifact ?? artifacts[0],
              gas_limit: gas,
            })
          }
        >
          Deploy
        </button>
      </div>
    </div>
  );
}

function RpcPane({ onRun }: { onRun: (method: string, params: unknown) => void }) {
  const methods = ["chain.tip", "chain.header", "mempool.info", "mempool.select", "tx.submit", "state.get"];
  const [method, setMethod] = useState(methods[0]);
  const [payload, setPayload] = useState<string>('{"params": []}');
  const valid = useMemo(() => {
    try {
      JSON.parse(payload);
      return true;
    } catch {
      return false;
    }
  }, [payload]);

  return (
    <div className="h-full grid grid-cols-[minmax(0,1.2fr)_minmax(300px,.8fr)] gap-3 p-3">
      <div className="glass p-3 rounded-md grid grid-rows-[auto_minmax(0,1fr)_auto] gap-3">
        <div className="grid grid-cols-[minmax(0,1fr)_200px] gap-2">
          <div>
            <div className="text-[12px] text-muted mb-1">method</div>
            <select
              className="w-full px-3 py-2 rounded-md bg-white/5 border border-border text-sm"
              value={method}
              onChange={(e) => setMethod(e.target.value)}
            >
              {methods.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
          </div>
          <div>
            <div className="text-[12px] text-muted mb-1">preset</div>
            <select
              className="w-full px-3 py-2 rounded-md bg-white/5 border border-border text-sm"
              onChange={(e) => setPayload(e.target.value)}
            >
              <option value='{"params": []}'>Empty</option>
              <option value='{"params": [{"block_id":"0xfa8e…6fc"}]}'>Header by id</option>
              <option value='{"params": [{"base_fee":12,"max_gas":200000,"max_txs":64}] }'>Select preview</option>
              <option value='{"params": [{"tx":{"type":"PAY","to":"0x..","value":1,"gas_price":12,"gas_limit":21000,"nonce":0}}]}'>
                Submit PAY
              </option>
            </select>
          </div>
        </div>
        <JsonEditor value={payload} onChange={setPayload} />
        <div className="flex items-center justify-between">
          <div className={`text-[12px] ${valid ? "text-muted" : "text-danger"}`}>{valid ? "Ready" : "Invalid JSON"}</div>
          <button
            className={`btn px-4 py-2 ${valid ? "btn-primary" : "opacity-50 pointer-events-none"}`}
            onClick={() => onRun(method, JSON.parse(payload))}
          >
            Run
          </button>
        </div>
      </div>
      <div className="glass p-3 rounded-md">
        <div className="text-[12px] text-muted mb-2">Tips</div>
        <ul className="text-sm list-disc pl-5 space-y-1">
          <li>
            Programs live under <code className="font-mono">/programs</code> (.ark).
          </li>
          <li>
            Use <code className="font-mono">deploy.json</code> to configure network/artifact.
          </li>
          <li>Results print in the Output panel below.</li>
        </ul>
      </div>
    </div>
  );
}
