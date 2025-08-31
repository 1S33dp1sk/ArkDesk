// src/pages/HomePro.tsx
import React from "react";

/* ─────────────────────────── helpers ─────────────────────────── */
function shortId(id: string) { return `${id.slice(0, 6)}…${id.slice(-4)}`; }
function pct(n: number) { return Math.max(0, Math.min(100, n)); }

/* ───────────────────────── components ───────────────────────── */
function StatTile(props: { label: string; value: React.ReactNode; sub?: string; intent?: "ok"|"warn"|"bad"; }) {
  const tone = props.intent === "ok" ? "text-success" : props.intent === "warn" ? "text-warn" : props.intent === "bad" ? "text-danger" : "text-text";
  return (
    <div className="glass p-4 rounded-md">
      <div className="text-[12px] text-muted uppercase tracking-wide">{props.label}</div>
      <div className={`mt-1 text-2xl font-semibold ${tone}`}>{props.value}</div>
      {props.sub && <div className="mt-1 text-[12px] text-muted">{props.sub}</div>}
    </div>
  );
}

function Sparkline({ data, w=220, h=48 }: { data: number[]; w?: number; h?: number }) {
  if (!data.length) return null;
  const max = Math.max(...data), min = Math.min(...data);
  const norm = (v: number, i: number) => {
    const x = (i/(data.length-1)) * (w-8) + 4;
    const y = h - 4 - ((v - min) / (max - min || 1)) * (h-8);
    return `${x},${y}`;
  };
  const pts = data.map(norm).join(" ");
  return (
    <svg width={w} height={h} className="block">
      <defs>
        <linearGradient id="sline" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#6aa9ff" />
          <stop offset="100%" stopColor="#b59cff" />
        </linearGradient>
      </defs>
      <polyline points={pts} fill="none" stroke="url(#sline)" strokeWidth="2" />
    </svg>
  );
}

function SectionCard({ title, right, children }: { title: string; right?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="glass rounded-md overflow-hidden">
      <header className="flex items-center justify-between border-b border-border px-4 py-2.5">
        <div className="text-[13px] tracking-wide text-muted">{title}</div>
        {right}
      </header>
      <div className="p-4">{children}</div>
    </section>
  );
}

function ResourceBar({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex items-center gap-3">
      <div className="w-24 text-[12px] text-muted">{label}</div>
      <div className="flex-1 h-2 bg-white/10 rounded-md overflow-hidden">
        <div className="h-full bg-primary/50" style={{ width: `${pct(value)}%` }} />
      </div>
      <div className="w-10 text-[12px] text-muted text-right">{pct(value)}%</div>
    </div>
  );
}

/* ─────────────────────────── page ──────────────────────────── */
export default function HomePro() {
  // fake data for layout (wire to RPC later)
  const headersPerSec = [41, 42, 40, 39, 44, 46, 43, 45, 47, 46, 48, 49];
  const mempoolDepth  = [120, 118, 130, 150, 142, 138, 160, 152, 149, 155, 162, 158];
  const ioWrites      = [22, 25, 23, 28, 26, 24, 27, 29, 31, 28, 27, 30];

  const blocks = [
    { height: 128, id: "fa8ece79e99636c482c34c2ad56e8fcd458655ab79f5c0019d7671763eaaf6fc", txs: 12, sizeKB: 82, appendMs: 54, time: "12:03:18" },
    { height: 127, id: "ab3c2f9176a90d3e1c4c5e77890acb22a1f90123ac0e44bb9988776655aa11bb", txs: 9,  sizeKB: 61, appendMs: 49, time: "12:03:14" },
    { height: 126, id: "9f1e0d2c4b6a8a7e5d3c2b1a0987ffedccbbaa11223344556677889900aabbcc", txs: 15, sizeKB: 95, appendMs: 62, time: "12:03:11" },
  ];
  const mempool = [
    { sender: "0x8a…9c", tx: "0xa1b2…88ef", gas: 21_000, price: 12, nonce: 5,  age: "4s"  },
    { sender: "0x4f…77", tx: "0x0f33…aa91", gas: 50_000, price: 18, nonce: 12, age: "8s"  },
    { sender: "0x2c…10", tx: "0x9c72…19de", gas: 90_000, price: 11, nonce: 3,  age: "12s" },
    { sender: "0xb1…e4", tx: "0x7aa0…9111", gas: 40_000, price: 16, nonce: 44, age: "13s" },
  ];

  return (
    <div className="h-full grid grid-cols-[220px_minmax(0,1fr)_320px] grid-rows-[56px_minmax(0,1fr)] gap-4 p-4">
      {/* nav */}
      <aside className="glass rounded-md row-span-2 p-3">
        <div className="text-[11px] text-muted px-2 mb-2">Navigation</div>
        <nav className="flex flex-col gap-1">
          {["Dashboard","Wallet","Explorer","Mempool","Node","Relay","Editor","Dev Tools","Settings"].map((x,i)=>(
            <button key={i} className={`text-left px-3 py-2 rounded-md hover:bg-white/10 ${i===0?"bg-white/10":""}`}>{x}</button>
          ))}
        </nav>
        <div className="mt-4 border-t border-border pt-3">
          <button className="w-full px-3 py-2 rounded-md border border-border hover:bg-white/10 text-left">⌘K Palette</button>
        </div>
      </aside>

      {/* topbar */}
      <header className="glass rounded-md col-span-2 flex items-center justify-between px-4">
        <div className="flex items-center gap-3">
          <span className="h-2 w-2 rounded-full bg-success" />
          <div className="text-sm">Online</div>
          <div className="text-muted text-[12px]">Role: full_node · BaseNet</div>
        </div>
        <div className="flex items-center gap-4 text-sm">
          <div className="text-muted">Tip</div><div>128</div>
          <div className="text-muted">Peers</div><div>14</div>
          <div className="text-muted">Sync</div><div>100%</div>
        </div>
      </header>

      {/* main center */}
      <main className="grid grid-rows-[auto_auto_1fr] gap-4">
        {/* stats row */}
        <div className="grid grid-cols-4 gap-4">
          <StatTile label="Sync" value="100%" sub="Up to tip" intent="ok" />
          <StatTile label="Tip Height" value="128" sub="+1 in 3s" />
          <StatTile label="Mempool" value="162 tx" sub="Depth ↑ 4" intent="warn" />
          <StatTile label="Base Fee" value="15 gwei" sub="Est. 13–18" />
        </div>

        {/* charts row */}
        <div className="grid grid-cols-3 gap-4">
          <SectionCard title="Headers / sec" right={<span className="text-[12px] text-muted">1m</span>}>
            <Sparkline data={headersPerSec} />
          </SectionCard>
          <SectionCard title="Mempool depth" right={<span className="text-[12px] text-muted">1m</span>}>
            <Sparkline data={mempoolDepth} />
          </SectionCard>
          <SectionCard title="Blockstore writes (MB/s)" right={<span className="text-[12px] text-muted">1m</span>}>
            <Sparkline data={ioWrites} />
          </SectionCard>
        </div>

        {/* tables */}
        <div className="grid grid-cols-2 gap-4 min-h-0">
          <SectionCard title="Recent blocks">
            <div className="overflow-auto rounded-md">
              <table className="w-full text-sm">
                <thead className="text-muted text-[12px] border-b border-border">
                  <tr className="[&>th]:text-left [&>th]:py-2">
                    <th>Height</th><th>Block ID</th><th>Txs</th><th>Size</th><th>Append</th><th>Time</th>
                  </tr>
                </thead>
                <tbody className="[&>tr:hover]:bg-white/5">
                  {blocks.map((b)=>(
                    <tr key={b.height} className="[&>td]:py-2 border-b border-border/60">
                      <td>{b.height}</td>
                      <td className="font-mono">{shortId(b.id)}</td>
                      <td>{b.txs}</td>
                      <td>{b.sizeKB} KB</td>
                      <td>{b.appendMs} ms</td>
                      <td className="text-muted">{b.time}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </SectionCard>

          <SectionCard title="Mempool (top)">
            <div className="overflow-auto rounded-md">
              <table className="w-full text-sm">
                <thead className="text-muted text-[12px] border-b border-border">
                  <tr className="[&>th]:text-left [&>th]:py-2">
                    <th>Sender</th><th>Tx</th><th>Gas</th><th>Price</th><th>Nonce</th><th>Age</th>
                  </tr>
                </thead>
                <tbody className="[&>tr:hover]:bg-white/5">
                  {mempool.map((m,i)=>(
                    <tr key={i} className="[&>td]:py-2 border-b border-border/60">
                      <td className="font-mono">{m.sender}</td>
                      <td className="font-mono">{m.tx}</td>
                      <td>{m.gas.toLocaleString()}</td>
                      <td>{m.price} gwei</td>
                      <td>{m.nonce}</td>
                      <td className="text-muted">{m.age}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </SectionCard>
        </div>
      </main>

      {/* right rail */}
      <aside className="glass rounded-md p-4 grid gap-4 overflow-auto">
        <div className="text-[13px] text-muted">System</div>
        <ResourceBar label="CPU"  value={42} />
        <ResourceBar label="RAM"  value={63} />
        <ResourceBar label="Disk" value={28} />
        <div className="border-t border-border my-1" />
        <div className="text-[13px] text-muted">Quick actions</div>
        <div className="grid gap-2">
          <button className="w-full px-3 py-2 rounded-md border border-border hover:bg-white/10 text-left">Start Producer</button>
          <button className="w-full px-3 py-2 rounded-md border border-border hover:bg-white/10 text-left">Snapshot</button>
          <button className="w-full px-3 py-2 rounded-md border border-border hover:bg-white/10 text-left">Open RPC Playground</button>
        </div>
        <div className="border-t border-border my-2" />
        <div className="text-[13px] text-muted">Tip header</div>
        <div className="p-2 rounded-md bg-white/5 font-mono text-[12px] break-all">
          fa8ece79e99636c482c34c2ad56e8fcd458655ab79f5c0019d7671763eaaf6fc
        </div>
      </aside>
    </div>
  );
}
