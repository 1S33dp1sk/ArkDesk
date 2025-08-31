// src/pages/Explore.tsx
import React, { useEffect, useMemo, useRef, useState } from "react";
import Section from "../ui/Section";

/* utils */
const short = (s: string, a = 6, b = 6) => (s.length <= a + b ? s : `${s.slice(0, a)}…${s.slice(-b)}`);
const kb = (n: number) => `${n} KB`;
const cx = (...xs: Array<string | false | null | undefined>) => xs.filter(Boolean).join(" ");
const copy = (s: string) => navigator.clipboard.writeText(s).catch(() => {});

/* tiny atoms */
function Input(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className={cx(
        "w-full px-3 py-2 rounded-md bg-white/5 border border-border outline-none",
        "focus:ring-1 focus:ring-white/30",
        props.className
      )}
    />
  );
}
function Metric({ k, v, sub }: { k: string; v: React.ReactNode; sub?: string }) {
  return (
    <div className="glass rounded-lg border border-border p-3">
      <div className="text-[11px] text-muted uppercase tracking-wide">{k}</div>
      <div className="mt-1 text-xl font-semibold">{v}</div>
      {sub && <div className="mt-0.5 text-[12px] text-muted">{sub}</div>}
    </div>
  );
}

/* page */
type TxLite = { id: string; gas: number; gp: number };
type BlockRow = {
  height: number;
  block_id: string;
  parent: string;
  slot: number;
  epoch: number;
  ai_epoch: number;
  state_root: string;
  flags: number;
  body_len: number;
  ext_len: number;
  time: string;
  txs: TxLite[];
};

export default function ExplorerPro() {
  const [q, setQ] = useState("");
  const [sel, setSel] = useState<number>(0);
  const [minTx, setMinTx] = useState(0);
  const [density, setDensity] = useState<0 | 1 | 2>(1); // 0 compact / 1 cozy / 2 comfy
  const tableRef = useRef<HTMLTableSectionElement>(null);

  const blocks: BlockRow[] = useMemo(
    () => [
      {
        height: 130,
        block_id: "4a8e3f20c9b6a2d1efb7c8aa0d06b7b8a7c64c4f9a2dd9f1bb06e90c33aabf11",
        parent: "fa8ece79e99636c482c34c2ad56e8fcd458655ab79f5c0019d7671763eaaf6fc",
        slot: 130,
        epoch: 0,
        ai_epoch: 0,
        state_root: "0000000000000000000000000000000000000000000000000000000000000000",
        flags: 0,
        body_len: 68_000,
        ext_len: 512,
        time: "12:04:03",
        txs: [
          { id: "0xaa11bb22cc33dd44ee55ff66778899aabbccddeeff0011223344556677889900", gas: 21000, gp: 14 },
          { id: "0x1199aa00bbccddeeff0011223344556677889900aabbccddeeff001122334455", gas: 50000, gp: 18 },
        ],
      },
      {
        height: 129,
        block_id: "ab3c2f9176a90d3e1c4c5e77890acb22a1f90123ac0e44bb9988776655aa11bb",
        parent: "9f1e0d2c4b6a8a7e5d3c2b1a0987ffedccbbaa11223344556677889900aabbcc",
        slot: 129,
        epoch: 0,
        ai_epoch: 0,
        state_root: "0000000000000000000000000000000000000000000000000000000000000000",
        flags: 0,
        body_len: 61_000,
        ext_len: 384,
        time: "12:03:36",
        txs: [{ id: "0x0f33aa91bb22cc33dd44ee55ff66778899aabbccddeeff0011223344556677", gas: 90000, gp: 11 }],
      },
      {
        height: 128,
        block_id: "fa8ece79e99636c482c34c2ad56e8fcd458655ab79f5c0019d7671763eaaf6fc",
        parent: "0000000000000000000000000000000000000000000000000000000000000000",
        slot: 128,
        epoch: 0,
        ai_epoch: 0,
        state_root: "0000000000000000000000000000000000000000000000000000000000000000",
        flags: 0,
        body_len: 82_000,
        ext_len: 640,
        time: "12:03:18",
        txs: [],
      },
    ],
    []
  );

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    return blocks.filter(
      (b) =>
        b.txs.length >= minTx &&
        (!s ||
          String(b.height).includes(s) ||
          b.block_id.toLowerCase().includes(s) ||
          b.parent.toLowerCase().includes(s))
    );
  }, [blocks, q, minTx]);

  useEffect(() => {
    if (sel > filtered.length - 1) setSel(Math.max(0, filtered.length - 1));
  }, [filtered.length, sel]);

  const selBlock = filtered.length ? filtered[Math.max(0, Math.min(sel, filtered.length - 1))] : null;
  const rowPad = ["py-1", "py-2", "py-3"][density];

  const avgTxPerBlock = useMemo(
    () => (filtered.length ? Math.round(filtered.reduce((a, b) => a + b.txs.length, 0) / filtered.length) : 0),
    [filtered]
  );
  const avgGp = useMemo(() => {
    const all = filtered.flatMap((b) => b.txs.map((t) => t.gp));
    return all.length ? Math.round(all.reduce((a, b) => a + b, 0) / all.length) : 0;
  }, [filtered]);

  const onKey = (e: React.KeyboardEvent) => {
    if (!filtered.length) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setSel((i) => Math.min(i + 1, filtered.length - 1));
      queueMicrotask(() => {
        const row = tableRef.current?.querySelectorAll("tr[data-row]")?.[Math.min(sel + 1, filtered.length - 1)];
        row && (row as HTMLElement).scrollIntoView({ block: "nearest" });
      });
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSel((i) => Math.max(i - 1, 0));
      queueMicrotask(() => {
        const row = tableRef.current?.querySelectorAll("tr[data-row]")?.[Math.max(sel - 1, 0)];
        row && (row as HTMLElement).scrollIntoView({ block: "nearest" });
      });
    }
  };

  return (
    <div className="h-full min-h-0 overflow-auto p-4" onKeyDown={onKey} tabIndex={0}>
      {/* toolbar */}
      <div className="glass rounded-md px-4 py-2.5 flex items-center gap-3 border border-border">
        <div className="text-sm tracking-wide">Explorer</div>
        <div className="text-muted text-[12px]">Blocks · Transactions</div>
        <div className="flex-1" />
        <div className="w-[360px]">
          <Input
            placeholder="Search height / block_id / parent…"
            value={q}
            onChange={(e) => {
              setQ(e.currentTarget.value);
              setSel(0);
            }}
          />
        </div>
        <div className="ml-3 grid grid-cols-[auto_120px] items-center gap-2">
          <div className="text-[12px] text-muted">min txs</div>
          <input
            type="range"
            min={0}
            max={10}
            step={1}
            value={minTx}
            onChange={(e) => setMinTx(parseInt(e.currentTarget.value, 10))}
          />
        </div>
        <div className="ml-3 grid grid-cols-[auto_auto_auto] gap-1 rounded-md border border-border bg-white/5 p-0.5">
          {["Compact", "Cozy", "Comfy"].map((l, i) => (
            <button
              key={l}
              className={cx("px-2 py-1 text-[12px] rounded", density === i ? "bg-white/10" : "hover:bg-white/5")}
              onClick={() => setDensity(i as 0 | 1 | 2)}
            >
              {l}
            </button>
          ))}
        </div>
      </div>

      {/* layout */}
      <div className="grid grid-cols-[minmax(520px,1fr)_minmax(420px,460px)] gap-4 min-h-0 mt-4">
        {/* blocks table */}
        <Section title="Blocks" actions={<span className="text-[12px] text-muted">{filtered.length} shown</span>} padding="md" rounded="lg">
          <div className="overflow-auto rounded-md min-w-[700px]">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-black/5 dark:bg-white/5 backdrop-blur text-muted text-[12px] border-b border-border">
                <tr className="[&>th]:text-left [&>th]:py-2 [&>th]:px-2">
                  <th className="w-[88px]">Height</th>
                  <th>Block ID</th>
                  <th className="w-[100px]">Txs</th>
                  <th className="w-[100px]">Body</th>
                  <th className="w-[100px]">Ext</th>
                  <th className="w-[84px]">Time</th>
                  <th className="w-[84px]">Copy</th>
                </tr>
              </thead>
              <tbody ref={tableRef as any} className="[&>tr:hover]:bg-white/5">
                {filtered.map((b, i) => {
                  const active = sel === i;
                  return (
                    <tr
                      key={b.block_id}
                      data-row
                      onClick={() => setSel(i)}
                      className={cx(
                        "cursor-pointer border-b border-border/60 [&>td]:px-2",
                        rowPad,
                        active && "bg-white/10"
                      )}
                    >
                      <td className="font-medium">{b.height}</td>
                      <td className="font-mono">{short(b.block_id)}</td>
                      <td>{b.txs.length}</td>
                      <td>{kb(Math.floor(b.body_len / 1024))}</td>
                      <td>{kb(Math.floor(b.ext_len / 1024))}</td>
                      <td className="text-muted">{b.time}</td>
                      <td>
                        <button className="soft-btn px-2 py-1 text-[12px]" onClick={(e) => (e.stopPropagation(), copy(b.block_id))}>
                          Copy ID
                        </button>
                      </td>
                    </tr>
                  );
                })}
                {filtered.length === 0 && (
                  <tr>
                    <td className="text-muted py-3 px-2" colSpan={7}>
                      No blocks match.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {/* quick metrics */}
          <div className="mt-4 grid grid-cols-3 gap-3">
            <Metric k="Avg tx/block" v={avgTxPerBlock} />
            <Metric k="Avg gas price" v={`${avgGp} gwei`} />
            <Metric k="Selection" v={filtered.length ? `${filtered[0].height} → ${filtered[filtered.length - 1].height}` : "—"} />
          </div>
        </Section>

        {/* details */}
        <Section
          title="Block details"
          actions={
            selBlock && (
              <div className="flex items-center gap-2">
                <span className="text-[12px] text-muted">height {selBlock.height}</span>
                <button className="btn px-2 py-1 text-[12px]" onClick={() => copy(selBlock.block_id)}>
                  Copy ID
                </button>
              </div>
            )
          }
          padding="md"
          rounded="lg"
          scroll="y"
        >
          {selBlock ? (
            <div className="grid gap-3">
              <dl className="grid gap-2">
                <div className="grid grid-cols-[140px_minmax(0,1fr)_auto] items-start text-sm">
                  <dt className="text-muted">block_id</dt>
                  <dd className="font-mono break-all">{selBlock.block_id}</dd>
                  <button className="soft-btn px-2 py-1 text-[12px]" onClick={() => copy(selBlock.block_id)}>
                    Copy
                  </button>
                </div>
                <div className="grid grid-cols-[140px_minmax(0,1fr)_auto] items-start text-sm">
                  <dt className="text-muted">parent</dt>
                  <dd className="font-mono break-all">{selBlock.parent}</dd>
                  <button className="soft-btn px-2 py-1 text-[12px]" onClick={() => copy(selBlock.parent)}>
                    Copy
                  </button>
                </div>
              </dl>

              <div className="grid grid-cols-3 gap-3 text-sm">
                <div className="glass p-3 rounded-md">
                  <div className="text-[12px] text-muted">slot</div>
                  <div className="mt-1">{selBlock.slot}</div>
                </div>
                <div className="glass p-3 rounded-md">
                  <div className="text-[12px] text-muted">epoch</div>
                  <div className="mt-1">{selBlock.epoch}</div>
                </div>
                <div className="glass p-3 rounded-md">
                  <div className="text-[12px] text-muted">flags</div>
                  <div className="mt-1">{selBlock.flags}</div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3 text-sm">
                <div className="glass p-3 rounded-md">
                  <div className="text-[12px] text-muted">state_root</div>
                  <div className="mt-1 font-mono break-all">{selBlock.state_root}</div>
                </div>
                <div className="glass p-3 rounded-md">
                  <div className="text-[12px] text-muted">sizes</div>
                  <div className="mt-1 font-mono">{selBlock.body_len} body · {selBlock.ext_len} ext</div>
                </div>
              </div>

              <div className="border-t border-border pt-3 mt-1" />

              <div className="text-[13px] tracking-wide text-muted mb-2">Transactions</div>
              <div className="rounded-md overflow-auto">
                {selBlock.txs.length === 0 ? (
                  <div className="text-sm text-muted">No transactions.</div>
                ) : (
                  <table className="w-full text-sm">
                    <thead className="text-muted text-[12px] border-b border-border">
                      <tr className="[&>th]:text-left [&>th]:py-2 [&>th]:px-2">
                        <th>tx_id</th>
                        <th className="w-[110px]">gas</th>
                        <th className="w-[110px]">gas_price</th>
                        <th className="w-[80px]">copy</th>
                      </tr>
                    </thead>
                    <tbody className="[&>tr:hover]:bg-white/5">
                      {selBlock.txs.map((t) => (
                        <tr key={t.id} className="border-b border-border/60 [&>td]:py-2 [&>td]:px-2">
                          <td className="font-mono">{short(t.id, 10, 10)}</td>
                          <td>{t.gas.toLocaleString()}</td>
                          <td>{t.gp} gwei</td>
                          <td>
                            <button className="soft-btn px-2 py-1 text-[12px]" onClick={() => copy(t.id)}>
                              Copy
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </div>
          ) : (
            <div className="text-sm text-muted">Select a block.</div>
          )}
        </Section>
      </div>
    </div>
  );
}
