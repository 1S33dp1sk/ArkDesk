// src/pages/Wallet.tsx
import React, { useMemo, useState, useRef, useEffect } from "react";
import Section from "../ui/Section";
import { useToast } from "../ui/Toaster";

/* ——— types ——— */
type Currency = "ARK" | "USD";
type Account = { label: string; address: string; balanceArk: number };
type TxRow = { id: string; when: string; dir: "in" | "out"; amountArk: number; peer: string; note?: string };

/* ——— utils ——— */
const cx = (...xs: Array<string | false | null | undefined>) => xs.filter(Boolean).join(" ");
const short = (s: string, a = 6, b = 4) => (s.length <= a + b ? s : `${s.slice(0, a)}…${s.slice(-b)}`);
const fmt = (n: number, max = 6) => n.toLocaleString(undefined, { maximumFractionDigits: max });
// const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));

/* ——— icons ——— */
const ArrowUp = (p: any) => (
  <svg width="14" height="14" viewBox="0 0 24 24" {...p}><path d="M12 19V6M7 11l5-5 5 5" stroke="currentColor" strokeWidth="1.8" fill="none" strokeLinecap="round"/></svg>
);
const ArrowDown = (p: any) => (
  <svg width="14" height="14" viewBox="0 0 24 24" {...p}><path d="M12 5v13M7 13l5 5 5-5" stroke="currentColor" strokeWidth="1.8" fill="none" strokeLinecap="round"/></svg>
);
const CopyIcon = (p: any) => (
  <svg width="14" height="14" viewBox="0 0 24 24" {...p}><rect x="9" y="9" width="10" height="10" rx="2" fill="currentColor" opacity=".18"/><rect x="5" y="5" width="10" height="10" rx="2" stroke="currentColor" fill="none"/></svg>
);
const QRIcon = (p: any) => (
  <svg width="14" height="14" viewBox="0 0 24 24" {...p}>
    <rect x="4" y="4" width="6" height="6" rx="1.5" stroke="currentColor" fill="none"/>
    <rect x="14" y="4" width="6" height="6" rx="1.5" stroke="currentColor" fill="none"/>
    <rect x="4" y="14" width="6" height="6" rx="1.5" stroke="currentColor" fill="none"/>
    <path d="M14 14h6v6h-6zM16 16h2v2h-2z" fill="currentColor"/>
  </svg>
);

/* ——— atoms ——— */
function Input(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className={cx("field px-3 py-2 focus:ring-1 focus:ring-white/30", props.className)}
    />
  );
}
function Chip({ active, children, onClick }: { active?: boolean; children: React.ReactNode; onClick?: () => void }) {
  return (
    <button
      onClick={onClick}
      className={cx(
        "px-2.5 py-1 rounded-md border text-[11px] tracking-wide transition",
        active ? "border-white/40 bg-white/10" : "border-border bg-white/5 hover:bg-white/10"
      )}
    >
      {children}
    </button>
  );
}
function Segmented<T extends string>({
  value, onChange, options, "aria-label": ariaLabel,
}: {
  value: T; onChange: (v: T) => void;
  options: { value: T; label: string }[]; "aria-label"?: string;
}) {
  return (
    <div role="group" aria-label={ariaLabel} className="inline-flex rounded-md border border-border overflow-hidden">
      {options.map((opt, i) => {
        const active = opt.value === value;
        return (
          <button
            key={opt.value}
            onClick={() => onChange(opt.value)}
            className={cx(
              "px-3 py-1 text-[12px] tracking-wide",
              active ? "bg-white/10" : "hover:bg-white/5",
              i > 0 && "border-l border-border"
            )}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}

/* ——— Tooltip (pretty, accessible) ——— */
function Tooltip({
  label,
  children,
  side = "top",
}: {
  label: React.ReactNode;
  children: React.ReactNode;
  side?: "top" | "bottom" | "left" | "right";
}) {
  const rootRef = useRef<HTMLSpanElement>(null);
  const [open, setOpen] = useState(false);

  // close when clicking outside
  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (!rootRef.current) return;
      if (!rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  const pos =
    side === "top"
      ? "bottom-full mb-2 left-1/2 -translate-x-1/2"
      : side === "bottom"
      ? "top-full mt-2 left-1/2 -translate-x-1/2"
      : side === "left"
      ? "right-full mr-2 top-1/2 -translate-y-1/2"
      : "left-full ml-2 top-1/2 -translate-y-1/2";

  const arrowPos =
    side === "top"
      ? "top-full left-1/2 -translate-x-1/2"
      : side === "bottom"
      ? "bottom-full left-1/2 -translate-x-1/2 rotate-180"
      : side === "left"
      ? "left-full top-1/2 -translate-y-1/2 -rotate-90"
      : "right-full top-1/2 -translate-y-1/2 rotate-90";

  return (
    <span
      ref={rootRef}
      className="relative inline-block group"
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
      onFocus={() => setOpen(true)}
      onBlur={() => setOpen(false)}
    >
      {/* trigger */}
      <button
        type="button"
        className="underline underline-offset-4 decoration-dotted text-[12px] text-muted hover:text-text focus:outline-none focus-visible:ring-1 focus-visible:ring-white/30 rounded-sm"
        aria-describedby="wallet-tooltip"
      >
        {children}
      </button>

      {/* tooltip */}
      <div
        role="tooltip"
        id="wallet-tooltip"
        className={cx(
          "pointer-events-none absolute z-50 min-w-[260px] max-w-[380px]",
          "transition duration-150",
          open ? "opacity-100 translate-y-0 visible" : "opacity-0 -translate-y-1 invisible",
          pos
        )}
      >
        {/* gradient border glow */}
        <div className="absolute -inset-[1.5px] rounded-xl opacity-70 bg-gradient-to-br from-primary/40 to-accent/40 blur-sm" />
        {/* panel */}
        <div className="relative rounded-lg border border-border surface-3 backdrop-blur-xl p-3 shadow-elev3">
          {label}
        </div>
        {/* arrow */}
        <div className={cx("absolute h-3 w-3 bg-white/10 border border-border rotate-45", arrowPos)} />
      </div>
    </span>
  );
}

/* ——— activity card ——— */
function ActivityItem({ t, rate }: { t: TxRow; rate: number }) {
  const isIn = t.dir === "in";
  return (
    <div className="flex items-center gap-3 p-3 rounded-md border border-border surface-1">
      <div className={cx("grid place-items-center w-8 h-8 rounded-md", isIn ? "bg-white/10 text-success" : "bg-white/10 text-danger")}>
        {isIn ? <ArrowDown/> : <ArrowUp/>}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <div className="font-medium">{isIn ? "Received" : "Sent"}</div>
          <div className="text-[12px] text-muted">{t.when}</div>
        </div>
        <div className="text-[12px] text-muted truncate">
          {isIn ? "from " : "to "}<span className="font-mono">{t.peer}</span>
        </div>
      </div>
      <div className="text-right">
        <div className="font-medium">{fmt(t.amountArk)} ARK</div>
        <div className="text-[12px] text-muted">${fmt(t.amountArk * rate, 2)}</div>
      </div>
    </div>
  );
}

/* ——— page ——— */
export default function Wallet() {
  const { toast } = useToast();

  const [rateUsdPerArk] = useState(2.5);
  const [accounts] = useState<Account[]>([
    { label: "Primary", address: "0x27f3a6761c0a2f7b8c4d93a6b2aa09e8c1e7f92d1a4bde0c9a01b52d3f8e12ab", balanceArk: 123.456789 },
    { label: "Ops",     address: "0xa1b2c3d4e5f60718293a4b5c6d7e8f90112233445566778899aabbccddeeff00", balanceArk: 42.0 },
  ]);
  const [acctIdx, setAcctIdx] = useState(0);
  const acct = accounts[acctIdx];

  const [currency, setCurrency] = useState<Currency>("ARK");
  const [to, setTo] = useState("");
  const [amount, setAmount] = useState<string>("");
  const [note, setNote] = useState("");
  const [speed, setSpeed] = useState<0 | 1 | 2>(1);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [gasLimit, setGasLimit] = useState<number | "">("");
  const [nonce, setNonce] = useState<number | "">("");

  const [activity] = useState<TxRow[]>([
    { id: "0x8d…fe21", when: "1m ago",  dir: "in",  amountArk: 2.5,  peer: "0x5c…ab3e" },
    { id: "0x7a…019b", when: "14m ago", dir: "out", amountArk: 0.75, peer: "0x1f…9910", note: "coffee" },
    { id: "0x1c…44aa", when: "2h ago",  dir: "out", amountArk: 20.0, peer: "0x9d…77cc" },
  ]);

  // const feeLabel = ["Eco", "Standard", "Fast"][speed];
  const feeGwei  = [8, 12, 18][speed];

  const balArk = acct.balanceArk;
  const balUsd = balArk * rateUsdPerArk;

  const amtArk = useMemo(() => {
    const n = parseFloat(amount);
    if (Number.isNaN(n) || n <= 0) return 0;
    return currency === "ARK" ? n : n / rateUsdPerArk;
  }, [amount, currency, rateUsdPerArk]);
  const amtUsd = amtArk * rateUsdPerArk;

  const validAddr = to.trim().startsWith("0x") && to.trim().length >= 10;
  const hasFunds  = amtArk > 0 && amtArk <= balArk;
  const canSend   = validAddr && hasFunds;

  const setAmtArk = (ark: number) => setAmount(ark > 0 ? String(ark) : "");
  const onMax = () => setAmtArk(Math.max(0, balArk - 0.0001));
  const addPct = (p: number) => setAmtArk(parseFloat((balArk * p).toFixed(6)));

  const copy = (s: string, label?: string) =>
    navigator.clipboard.writeText(s).then(() => toast({ message: label ?? "Copied", variant: "success" })).catch(() => {});

  const onSend = () => {
    if (!canSend) return;
    console.log("send", { from: acct.address, to, amtArk, feeGwei, gasLimit, nonce, note });
    toast({ message: "Transaction submitted (demo).", variant: "success" });
    setAmount(""); setNote("");
  };

  return (
    <div className="h-full min-h-0 overflow-auto p-4">
      <div className="mx-auto w-[min(1180px,100%)] grid gap-4">
        {/* Overview */}
        <Section
          title="Wallet"
          actions={
            <div className="flex items-center gap-3">
              <div className="text-[12px] text-muted">Account</div>
              <select
                className="px-2 py-1 rounded-md bg-white/5 border border-border text-sm"
                value={acctIdx}
                onChange={(e) => setAcctIdx(parseInt(e.target.value, 10))}
              >
                {accounts.map((a, i) => (
                  <option key={a.address} value={i}>
                    {a.label} — {short(a.address)}
                  </option>
                ))}
              </select>
            </div>
          }
          padding="md"
          rounded="lg"
          mode="auto"
        >
          <div className="grid gap-4 md:grid-cols-3">
            {/* Balance hero */}
            <div className="relative overflow-hidden rounded-lg border border-border p-4 surface-2">
              <div
                className="pointer-events-none absolute -inset-10 opacity-60 blur-2xl"
                style={{ background:
                  "radial-gradient(60% 60% at 20% 20%, rgba(106,169,255,.18), transparent 60%), radial-gradient(50% 50% at 80% 30%, rgba(181,156,255,.18), transparent 60%)" }}
              />
              <div className="relative z-10">
                <div className="text-[12px] text-muted mb-1">Balance</div>
                <div className="text-3xl font-semibold leading-none">{fmt(balArk)} ARK</div>
                <div className="mt-1 text-[12px] text-muted">≈ ${fmt(balUsd, 2)}</div>
                <div className="mt-3 flex items-center gap-2">
                  <Segmented
                    aria-label="Display currency"
                    value={currency}
                    onChange={setCurrency}
                    options={[{ value: "ARK", label: "ARK" }, { value: "USD", label: "USD" }]}
                  />
                  <Chip>1 ARK ≈ ${fmt(rateUsdPerArk, 2)}</Chip>
                </div>
              </div>
            </div>

            {/* Address */}
            <div className="glass rounded-lg border border-border p-4">
              <div className="text-[12px] text-muted mb-1">Address</div>
              <div className="font-mono text-sm break-all">{acct.address}</div>
              <div className="mt-2 flex items-center gap-2">
                <button className="btn px-3 py-1 text-sm" onClick={() => copy(acct.address, "Address copied")}>
                  <CopyIcon className="mr-1" /> Copy
                </button>
                <button className="btn px-3 py-1 text-sm"><QRIcon className="mr-1" /> Show QR</button>
              </div>
            </div>

            {/* Quick actions */}
            <div className="glass rounded-lg border border-border p-4 grid gap-2">
              <div className="text-[12px] text-muted mb-1">Quick actions</div>
              <div className="grid grid-cols-2 gap-2">
                <button className="btn w-full px-3 py-2">Receive</button>
                <button className="btn w-full px-3 py-2">Request</button>
              </div>
              <button className="btn w-full px-3 py-2">Buy ARK (demo)</button>
            </div>
          </div>
        </Section>

        {/* Workspace */}
        <div className="grid gap-4 md:grid-cols-[minmax(0,1.15fr)_minmax(0,.85fr)]">
          {/* Send */}
          <Section title="Send" padding="md" rounded="lg" mode="auto">
            <div className="grid gap-4">
              <div className="grid md:grid-cols-3 gap-4">
                <div className="md:col-span-2 grid gap-3">
                  <div>
                    <div className="text-[12px] text-muted mb-1">Recipient</div>
                    <Input placeholder="Paste address (starts with 0x…)" value={to} onChange={(e) => setTo(e.currentTarget.value)} />
                    {!validAddr && to && <div className="text-[12px] text-danger mt-1">Enter a valid address.</div>}
                  </div>

                  <div className="grid grid-cols-[1fr_auto] gap-2">
                    <div>
                      <div className="text-[12px] text-muted mb-1">Amount {currency === "ARK" ? "(ARK)" : "(USD)"}</div>
                      <Input placeholder="0.00" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.currentTarget.value)} />
                      {amount && <div className="text-[12px] text-muted mt-1">{currency === "ARK" ? `≈ $${fmt(amtUsd, 2)}` : `≈ ${fmt(amtArk)} ARK`}</div>}
                    </div>
                    <div className="grid gap-2 content-end">
                      <Segmented
                        aria-label="Amount currency"
                        value={currency}
                        onChange={setCurrency}
                        options={[{ value: "ARK", label: "ARK" }, { value: "USD", label: "USD" }]}
                      />
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <div className="text-[12px] text-muted mr-1">Presets</div>
                    <Chip onClick={() => addPct(0.1)}>10%</Chip>
                    <Chip onClick={() => addPct(0.25)}>25%</Chip>
                    <Chip onClick={() => addPct(0.5)}>Half</Chip>
                    <Chip onClick={onMax}>Max</Chip>
                  </div>

                  <div>
                    <div className="text-[12px] text-muted mb-1">Note (optional)</div>
                    <Input placeholder="Add a note for yourself" value={note} onChange={(e) => setNote(e.currentTarget.value)} />
                  </div>

                  <div>
                    <div className="text-[12px] text-muted mb-1">Delivery speed</div>
                    <div className="flex items-center gap-2">
                      <Segmented
                        aria-label="Delivery speed"
                        value={(["0","1","2"][speed] as "0"|"1"|"2")}
                        onChange={(v) => setSpeed(parseInt(v, 10) as 0|1|2)}
                        options={[{ value: "0", label: "Eco" }, { value: "1", label: "Standard" }, { value: "2", label: "Fast" }]}
                      />
                      <div className="text-[12px] text-muted ml-1">≈ {feeGwei} gwei</div>
                    </div>
                  </div>

                  <div className="flex items-center gap-3">
                    <button className={cx("btn btn-primary px-5 py-2 text-[15px] font-medium", canSend ? "" : "opacity-50 pointer-events-none")} onClick={onSend}>
                      Send
                    </button>
                    <button className="btn px-5 py-2 text-[15px] font-medium" onClick={() => copy(to || acct.address, "Copied")}>
                      Receive
                    </button>
                    {!hasFunds && amtArk > 0 && <span className="text-[12px] text-danger">Insufficient balance.</span>}

                    {/* The fancy tooltip trigger */}
                    <div className="ml-auto">
                      <Tooltip
                        side="top"
                        label={
                          <div className="text-sm leading-6">
                            <ol className="list-decimal pl-5 space-y-1.5">
                              <li>We create a payment from your selected account.</li>
                              <li>Your OS confirms with your key (keys stay on your device).</li>
                              <li>The network queues your transfer; faster speeds confirm sooner.</li>
                              <li>Once included, your balance and Activity update instantly.</li>
                            </ol>
                            <div className="mt-2 text-[12px] text-muted">ARK/USD switch is display-only.</div>
                          </div>
                        }
                      >
                        What happens next
                      </Tooltip>
                    </div>
                  </div>

                  <button
                    className="text-[12px] text-muted hover:text-text mt-1 underline underline-offset-4 w-fit"
                    onClick={() => setAdvancedOpen((v) => !v)}
                  >
                    {advancedOpen ? "Hide advanced" : "Show advanced"}
                  </button>

                  {advancedOpen && (
                    <div className="grid md:grid-cols-3 gap-3">
                      <div>
                        <div className="text-[12px] text-muted mb-1">Gas limit</div>
                        <Input inputMode="numeric" placeholder="auto" value={gasLimit === "" ? "" : String(gasLimit)} onChange={(e) => setGasLimit(e.currentTarget.value ? parseInt(e.currentTarget.value, 10) : "")} />
                      </div>
                      <div>
                        <div className="text-[12px] text-muted mb-1">Nonce</div>
                        <Input inputMode="numeric" placeholder="auto" value={nonce === "" ? "" : String(nonce)} onChange={(e) => setNonce(e.currentTarget.value ? parseInt(e.currentTarget.value, 10) : "")} />
                      </div>
                      <div>
                        <div className="text-[12px] text-muted mb-1">From</div>
                        <Input readOnly value={`${acct.label} — ${short(acct.address, 8, 6)}`} />
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </Section>

          {/* Right: Activity & friends */}
          <div className="grid gap-4 min-h-0">
            <Section title="Activity" padding="md" rounded="lg" scroll="y" mode="auto">
              <div className="grid gap-2 max-h-[420px] overflow-auto">
                {activity.map((t) => <ActivityItem key={t.id} t={t} rate={rateUsdPerArk} />)}
              </div>
            </Section>

            <Section title="Contacts" padding="md" rounded="lg" mode="auto">
              <div className="grid gap-2 text-sm">
                <div className="flex items-center gap-2">
                  <div className="w-7 h-7 rounded-full bg-white/10 grid place-items-center">A</div>
                  <div className="flex-1">
                    <div>alice</div>
                    <div className="text-[12px] text-muted font-mono">{short("0x5c6a…alice000000000000000000000000")}</div>
                  </div>
                  <button className="btn px-3 py-1 text-sm">Send</button>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-7 h-7 rounded-full bg-white/10 grid place-items-center">B</div>
                  <div className="flex-1">
                    <div>bob</div>
                    <div className="text-[12px] text-muted font-mono">{short("0x7f3b…bob00000000000000000000000000")}</div>
                  </div>
                  <button className="btn px-3 py-1 text-sm">Send</button>
                </div>
                <button className="btn w-full px-3 py-2 mt-1">Add contact</button>
              </div>
            </Section>

            <Section title="Preferences" padding="md" rounded="lg" mode="auto">
              <div className="flex items-center justify-between">
                <div className="text-[12px] text-muted">Display currency</div>
                <Segmented
                  aria-label="Display currency"
                  value={currency}
                  onChange={setCurrency}
                  options={[{ value: "ARK", label: "ARK" }, { value: "USD", label: "USD" }]}
                />
              </div>
              <div className="mt-3 text-[12px] text-muted">
                Changing display currency never alters what you send on-chain.
              </div>
            </Section>
          </div>
        </div>
      </div>
    </div>
  );
}
