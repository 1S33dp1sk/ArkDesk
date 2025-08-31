// src/pages/Mempool.tsx
import React, { useEffect, useMemo, useState } from "react";
import Section from "../ui/Section";

/* types */
type Tx = { id: string; sender: string; gas: number; price: number; nonce: number; ageSec: number };
type Theme = "light" | "dark";

/* theme */
function useTheme(): [Theme, (t: Theme) => void] {
  const [theme, setTheme] = useState<Theme>(() => (document.documentElement.classList.contains("dark") ? "dark" : "light"));
  useEffect(() => {
    const root = document.documentElement;
    if (theme === "dark") root.classList.add("dark");
    else root.classList.remove("dark");
    localStorage.setItem("ark-theme", theme);
  }, [theme]);
  useEffect(() => {
    const v = (localStorage.getItem("ark-theme") as Theme | null) || theme;
    if (v !== theme) setTheme(v);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return [theme, setTheme];
}

/* atoms */
function Metric({ k, v, sub }: { k: string; v: React.ReactNode; sub?: string }) {
  return (
    <div className="glass rounded-lg border border-border p-3">
      <div className="text-[11px] text-muted uppercase tracking-wide">{k}</div>
      <div className="mt-1 text-xl font-semibold">{v}</div>
      {sub && <div className="mt-0.5 text-[12px] text-muted">{sub}</div>}
    </div>
  );
}
function Field({ k, v }: { k: string; v: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[110px_minmax(0,1fr)] gap-3 items-start text-sm">
      <div className="text-muted">{k}</div>
      <div className="font-mono break-all">{v}</div>
    </div>
  );
}
function InputNum(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      type="number"
      className={`w-full px-3 py-2 rounded-md bg-white/5 border border-border outline-none focus:ring-1 focus:ring-white/30 ${props.className ?? ""}`}
    />
  );
}
function Chip({ children }: { children: React.ReactNode }) {
  return <span className="px-2 py-1 rounded-md border border-border bg-white/5 text-[11px]">{children}</span>;
}
function SegControl({
  value,
  onChange,
  labels,
}: {
  value: number;
  onChange: (i: number) => void;
  labels: string[];
}) {
  return (
    <div className="inline-flex items-center rounded-md border border-border bg-white/5 p-0.5">
      {labels.map((l, i) => (
        <button
          key={l}
          className={`px-2.5 py-1 text-[12px] rounded ${i === value ? "bg-white/10" : "hover:bg-white/5"}`}
          onClick={() => onChange(i)}
        >
          {l}
        </button>
      ))}
    </div>
  );
}

/* helpers */
const byPriceDesc = (a: Tx, b: Tx) => b.price - a.price || a.nonce - b.nonce;
const groupBy = <T, K extends string | number>(xs: T[], f: (x: T) => K) =>
  xs.reduce<Record<K, T[]>>((m, x) => ((m[f(x)] ??= []).push(x), m), {} as any);

function selectTxs(params: { txs: Tx[]; baseFee: number; maxGas: number; maxTxs: number }) {
  const { txs, baseFee, maxGas, maxTxs } = params;
  const eligible = txs.filter(t => t.price >= baseFee).sort(byPriceDesc);
  const nextNonce = new Map<string, number>();
  const bySender = groupBy(eligible, t => t.sender);
  Object.keys(bySender).forEach(s => bySender[s].sort((a, b) => a.nonce - b.nonce));
  for (const [s, list] of Object.entries(bySender)) nextNonce.set(s, list[0]?.nonce ?? 0);

  const picked: Tx[] = [];
  let gasLeft = maxGas;

  const heads = Object.entries(bySender).map(([s, list]) => ({ s, idx: 0, list }));
  heads.sort((A, B) => (B.list[0]?.price ?? 0) - (A.list[0]?.price ?? 0));

  while (picked.length < maxTxs && gasLeft > 0) {
    let progressed = false;
    for (let i = 0; i < heads.length && picked.length < maxTxs && gasLeft > 0; i++) {
      const h = heads[i];
      while (h.idx < h.list.length) {
        const tx = h.list[h.idx];
        const expected = nextNonce.get(h.s)!;
        if (tx.nonce !== expected) break;
        if (tx.gas <= gasLeft) {
          picked.push(tx);
          gasLeft -= tx.gas;
          nextNonce.set(h.s, expected + 1);
          h.idx++;
          progressed = true;
          break;
        } else {
          h.idx++;
          progressed = true;
          break;
        }
      }
    }
    if (!progressed) break;
  }

  const totalGas = picked.reduce((a, t) => a + t.gas, 0);
  const avgPrice = picked.length ? Math.round(picked.reduce((a, t) => a + t.price, 0) / picked.length) : 0;
  return { picked, gasUsed: totalGas, avgPrice, eligibleCount: eligible.length };
}

function Histogram({ data }: { data: Tx[] }) {
  const buckets = useMemo(() => {
    if (data.length === 0) return [] as { k: string; v: number }[];
    const min = Math.min(...data.map(d => d.price));
    const max = Math.max(...data.map(d => d.price));
    const step = Math.max(1, Math.ceil((max - min + 1) / 8));
    const map = new Map<number, number>();
    for (const t of data) {
      const b = min + Math.floor((t.price - min) / step) * step;
      map.set(b, (map.get(b) ?? 0) + 1);
    }
    return [...map.entries()].sort((a, b) => a[0] - b[0]).map(([k, v]) => ({ k: `${k}-${k + step - 1}`, v }));
  }, [data]);
  const maxV = Math.max(1, ...buckets.map(b => b.v));
  return (
    <div className="flex items-end gap-3 h-28">
      {buckets.map(b => (
        <div key={b.k} className="flex flex-col items-center gap-1">
          <div
            className="w-8 bg-primary/50 rounded-sm transition-[height] duration-500 ease-out"
            style={{ height: `${(b.v / maxV) * 100}%` }}
          />
          <div className="text-[10px] text-muted">{b.k}</div>
        </div>
      ))}
    </div>
  );
}

/* page */
export default function Mempool() {
  const [theme, setTheme] = useTheme();

  // demo data; wire to RPC later
  const txs: Tx[] = [
    { id: "0xa1…88ef", sender: "0x8a…9c", gas: 21000, price: 18, nonce: 5, ageSec: 4 },
    { id: "0xa2…21aa", sender: "0x8a…9c", gas: 21000, price: 18, nonce: 6, ageSec: 3 },
    { id: "0x0f…aa91", sender: "0x4f…77", gas: 50000, price: 22, nonce: 12, ageSec: 8 },
    { id: "0x7a…9111", sender: "0xb1…e4", gas: 40000, price: 16, nonce: 44, ageSec: 13 },
    { id: "0x9c…19de", sender: "0x2c…10", gas: 90000, price: 15, nonce: 3, ageSec: 12 },
    { id: "0x5d…7312", sender: "0x2c…10", gas: 30000, price: 17, nonce: 4, ageSec: 6 },
    { id: "0x3a…00ab", sender: "0x4f…77", gas: 21000, price: 25, nonce: 13, ageSec: 2 },
  ];

  const [baseFee, setBaseFee] = useState(15);
  const [maxGas, setMaxGas] = useState(150_000);
  const [maxTxs, setMaxTxs] = useState(5);
  const [density, setDensity] = useState(1); // 0 compact / 1 cozy / 2 comfy
  const [query, setQuery] = useState("");

  const filteredTxs = useMemo(
    () =>
      txs.filter(
        t =>
          !query ||
          t.id.toLowerCase().includes(query.toLowerCase()) ||
          t.sender.toLowerCase().includes(query.toLowerCase())
      ),
    [txs, query]
  );

  const groups = useMemo(() => {
    const g = groupBy(filteredTxs, t => t.sender);
    Object.values(g).forEach(list => list.sort((a, b) => a.nonce - b.nonce));
    return g;
  }, [filteredTxs]);

  const preview = useMemo(() => selectTxs({ txs: filteredTxs, baseFee, maxGas, maxTxs }), [filteredTxs, baseFee, maxGas, maxTxs]);

  const rowPad = ["py-1", "py-2", "py-3"][density];

  return (
    <div className="h-full min-h-0 overflow-auto p-4">
      <div className="grid grid-cols-[minmax(0,1.2fr)_minmax(360px,0.8fr)] gap-4">
        {/* left */}
        <div className="grid grid-rows-[auto_auto_1fr] gap-4 min-h-0">
          <Section
            title="Selection controls"
            actions={
              <div className="flex items-center gap-2">
                <input
                  placeholder="Search tx or sender…"
                  className="px-3 py-1.5 rounded-md bg-white/5 border border-border text-sm"
                  value={query}
                  onChange={e => setQuery(e.currentTarget.value)}
                />
                <SegControl value={density} onChange={setDensity} labels={["Compact", "Cozy", "Comfy"]} />
                <div className="ml-2 text-[12px] text-muted">Theme</div>
                <SegControl value={theme === "dark" ? 1 : 0} onChange={i => setTheme(i ? "dark" : "light")} labels={["Light", "Dark"]} />
              </div>
            }
            padding="md"
            rounded="lg"
          >
            <div className="grid grid-cols-3 gap-3">
              <div>
                <div className="text-[12px] text-muted mb-1">base_fee</div>
                <InputNum value={baseFee} onChange={e => setBaseFee(parseInt(e.currentTarget.value || "0", 10))} />
              </div>
              <div>
                <div className="text-[12px] text-muted mb-1">max_gas</div>
                <InputNum value={maxGas} onChange={e => setMaxGas(parseInt(e.currentTarget.value || "0", 10))} />
              </div>
              <div>
                <div className="text-[12px] text-muted mb-1">max_txs</div>
                <InputNum value={maxTxs} onChange={e => setMaxTxs(parseInt(e.currentTarget.value || "0", 10))} />
              </div>
            </div>
            <div className="mt-3 grid grid-cols-3 gap-3">
              <Metric k="Pool" v={`${filteredTxs.length} tx`} sub="after filter" />
              <Metric k="Eligible" v={`${preview.eligibleCount} tx`} sub={`≥ ${baseFee} gwei`} />
              <Metric k="Preview" v={`${preview.picked.length} tx`} sub={`${preview.gasUsed.toLocaleString()} gas`} />
            </div>
          </Section>

          <Section title="Gas price histogram" actions={<span className="text-[12px] text-muted">live</span>} padding="md" rounded="lg">
            <Histogram data={filteredTxs} />
          </Section>

          <Section title="Senders & queues" padding="md" rounded="lg" scroll="y">
            <div className="grid grid-cols-2 gap-4 min-h-0">
              {Object.entries(groups).map(([sender, list]) => (
                <div key={sender} className="rounded-lg border border-border overflow-hidden">
                  <div className="px-3 py-2 border-b border-border flex items-center justify-between">
                    <div className="font-mono text-sm">{sender}</div>
                    <div className="text-[12px] text-muted">{list.length} tx</div>
                  </div>
                  <div className="max-h-56 overflow-auto">
                    <table className="w-full text-sm">
                      <thead className="sticky top-0 bg-black/5 backdrop-blur text-muted text-[12px] border-b border-border">
                        <tr className="[&>th]:text-left [&>th]:py-2 [&>th]:px-2">
                          <th>tx</th><th className="w-[80px]">nonce</th><th className="w-[90px]">gas</th><th className="w-[90px]">price</th><th className="w-[70px]">age</th>
                        </tr>
                      </thead>
                      <tbody className="[&>tr:hover]:bg-white/5">
                        {list.sort(byPriceDesc).map(tx => (
                          <tr key={tx.id} className={`border-b border-border/60 [&>td]:px-2 ${rowPad}`}>
                            <td className="font-mono">{tx.id}</td>
                            <td>{tx.nonce}</td>
                            <td>{tx.gas.toLocaleString()}</td>
                            <td>{tx.price} gwei</td>
                            <td className="text-muted">{tx.ageSec}s</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              ))}
            </div>
          </Section>
        </div>

        {/* right */}
        <div className="grid grid-rows-[auto_1fr] gap-4 min-h-0">
          <Section
            title="Selection preview"
            actions={<span className="text-[12px] text-muted">avg {preview.avgPrice} gwei · gas {preview.gasUsed.toLocaleString()}</span>}
            padding="md"
            rounded="lg"
            scroll="y"
          >
            <div className="rounded-md overflow-auto">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-black/5 backdrop-blur text-muted text-[12px] border-b border-border">
                  <tr className="[&>th]:text-left [&>th]:py-2 [&>th]:px-2">
                    <th>tx</th><th className="w-[120px]">sender</th><th className="w-[80px]">nonce</th><th className="w-[90px]">gas</th><th className="w-[90px]">price</th>
                  </tr>
                </thead>
                <tbody className="[&>tr:hover]:bg-white/5">
                  {preview.picked.map(tx => (
                    <tr key={tx.id} className={`border-b border-border/60 [&>td]:px-2 ${rowPad}`}>
                      <td className="font-mono">{tx.id}</td>
                      <td className="font-mono">{tx.sender}</td>
                      <td>{tx.nonce}</td>
                      <td>{tx.gas.toLocaleString()}</td>
                      <td>{tx.price} gwei</td>
                    </tr>
                  ))}
                  {preview.picked.length === 0 && (
                    <tr><td className="text-muted py-3 px-2" colSpan={5}>No eligible transactions for current constraints.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </Section>

          <Section title="Details" padding="md" rounded="lg">
            {preview.picked[0] ? (
              <>
                <Field k="tx_id" v={preview.picked[0].id} />
                <div className="grid grid-cols-3 gap-3 text-sm mt-2">
                  <Metric k="sender" v={<span className="font-mono">{preview.picked[0].sender}</span>} />
                  <Metric k="gas" v={preview.picked[0].gas.toLocaleString()} />
                  <Metric k="price" v={`${preview.picked[0].price} gwei`} />
                </div>
                <div className="grid grid-cols-3 gap-3 text-sm mt-3">
                  <Metric k="nonce" v={preview.picked[0].nonce} />
                  <Metric k="age" v={`${preview.picked[0].ageSec}s`} />
                  <Metric k="meets base_fee" v={preview.picked[0].price >= baseFee ? "yes" : "no"} />
                </div>
              </>
            ) : (
              <div className="text-sm text-muted">Pick a transaction from the preview.</div>
            )}
          </Section>
        </div>
      </div>
    </div>
  );
}
