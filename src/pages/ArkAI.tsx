// src/pages/ArkAI.tsx
import React, { useEffect, useMemo, useRef, useState } from "react";
import Section from "../ui/Section";

/* ---------------- types ---------------- */
type Role = "user" | "ai" | "system";
type Msg = { id: string; role: Role; content: string; ts: number };
type Model = "arkai-mini" | "arkai-base" | "arkai-12b" | "arkai-12b-q";

/* ---------------- utils ---------------- */
const cx = (...xs: Array<string | false | null | undefined>) => xs.filter(Boolean).join(" ");
const rid = () => Math.random().toString(36).slice(2);
const LS_KEY = "arknet.arkai.chat.v1";

/** demo stream (system is used silently, never rendered) */
function* cannedStream(prompt: string, model: Model, temperature: number, _system: string): Generator<string> {
  const answers = [
    `Welcome 👋 I’m ArkAI. Ask me about Wallet, Mempool, Explorer, or the IDE and I’ll walk you through it.`,
    `On Arknet, the mempool picks by price with per-sender nonce order. Try the Mempool page to preview selection.`,
    `To send ARK: Wallet → paste address → amount → fee → Send. Keys never leave your device.`,
    `Spin up the Starter Miner on DevNet to watch blocks land—no special hardware needed.`,
    `Open the IDE to edit /programs, then Compile → Deploy → inspect results in Output.`,
  ];
  const chosen = answers[(prompt.length + model.length + Math.round(temperature * 10)) % answers.length];
  for (const w of chosen.split(" ")) yield w + " ";
}

/* ---------------- small atoms ---------------- */
function Avatar({ who }: { who: Role }) {
  if (who === "ai") {
    return (
      <div className="h-8 w-8 rounded-full grid place-items-center bg-white/10 border border-border">
        <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden>
          <defs>
            <linearGradient id="g-ai" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor="#6aa9ff" />
              <stop offset="100%" stopColor="#b59cff" />
            </linearGradient>
          </defs>
          <path d="M12 3a9 9 0 1 0 .001 18.001A9 9 0 0 0 12 3zm-1 5h2v6h-2V8zm0 8h2v2h-2v-2z" fill="url(#g-ai)" />
        </svg>
      </div>
    );
  }
  return <div className="h-8 w-8 rounded-full bg-white/15 grid place-items-center font-semibold">U</div>;
}
function Bubble({ role, children }: { role: Role; children: React.ReactNode }) {
  const isAI = role === "ai";
  return (
    <div
      className={cx(
        "max-w-[min(680px,90%)] rounded-xl px-3.5 py-2.5 text-sm leading-6 shadow-elev2 border",
        isAI ? "bg-gradient-to-br from-white/6 to-accent/5 border-border" : "bg-white/10 border-white/20"
      )}
    >
      <div className="whitespace-pre-wrap">{children}</div>
    </div>
  );
}
function Kbd({ children }: { children: React.ReactNode }) {
  return <span className="px-2 py-1 rounded-md border border-border bg-white/5 text-[11px]">{children}</span>;
}

/* ----------- cooler controls: dropdown + slider ----------- */
function useClickOutside<T extends HTMLElement>(open: boolean, onClose: () => void) {
  const ref = useRef<T>(null);
  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) onClose();
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open, onClose]);
  return ref;
}

function ModelSelect({
  value,
  onChange,
  options,
}: {
  value: Model;
  onChange: (m: Model) => void;
  options: Model[];
}) {
  const [open, setOpen] = useState(false);
  const ref = useClickOutside<HTMLDivElement>(open, () => setOpen(false));
  const label = value;

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((v) => !v)}
        className="soft-btn h-8 px-3 text-[12px] rounded-md flex items-center gap-1"
        title="Model"
        aria-haspopup="menu"
        aria-expanded={open}
      >
        <span className="font-mono">{label}</span>
        <svg width="14" height="14" viewBox="0 0 24 24" className={cx("transition", open && "rotate-180")}>
          <path d="M7 10l5 5 5-5z" fill="currentColor" />
        </svg>
      </button>
      {open && (
        <div
          role="menu"
          className="absolute right-0 mt-2 w-44 glass rounded-md border border-border p-1 z-10"
        >
          {options.map((opt) => {
            const active = opt === value;
            return (
              <button
                key={opt}
                onClick={() => {
                  onChange(opt);
                  setOpen(false);
                }}
                className={cx(
                  "w-full text-left px-3 py-2 rounded-md text-[12.5px] font-mono",
                  active ? "bg-white/10" : "hover:bg-white/5"
                )}
              >
                {opt}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

function TempSlider({
  value,
  onChange,
  min = 0,
  max = 2,
  step = 0.1,
  width = 160,
}: {
  value: number;
  onChange: (v: number) => void;
  min?: number;
  max?: number;
  step?: number;
  width?: number | string;
}) {
  const pct = Math.max(0, Math.min(100, ((value - min) / (max - min)) * 100));
  return (
    <div className="flex items-center gap-2">
      <span className="text-[11px] text-muted select-none hidden md:inline">temp</span>
      <div className="relative" style={{ width }}>
        {/* custom track + fill */}
        <div className="absolute left-0 right-0 top-1/2 -translate-y-1/2 h-[6px] rounded-full bg-white/10 overflow-hidden">
          <div
            className="h-full bg-gradient-to-r from-primary to-accent"
            style={{ width: `${pct}%` }}
          />
        </div>
        {/* slider (native, transparent) */}
        <input
          type="range"
          min={min}
          max={max}
          step={step}
          value={value}
          onChange={(e) => onChange(parseFloat(e.currentTarget.value))}
          className="relative z-10 w-full h-6 appearance-none bg-transparent cursor-pointer"
          title="Temperature"
        />
        {/* value pill */}
        <div
          className="absolute -top-7 translate-x-[-50%] px-2 py-0.5 rounded-md border border-border bg-white/5 text-[11px]"
          style={{ left: `calc(${pct}% )` }}
        >
          {value.toFixed(1)}
        </div>
      </div>
    </div>
  );
}

/* ---------------- page ---------------- */
export default function ArkAI() {
  // settings (system used internally, never rendered or stored)
  const [model, setModel] = useState<Model>("arkai-base");
  const [temp, setTemp] = useState(0.7);
  const [maxTokens, setMaxTokens] = useState(512);
  const [systemOpen, setSystemOpen] = useState(false);
  const [system, setSystem] = useState("You are ArkAI, a helpful, concise assistant for Arknet.");

  // chat state — filter out any legacy system messages
  const [msgs, setMsgs] = useState<Msg[]>(() => {
    try {
      const raw = localStorage.getItem(LS_KEY);
      const arr: Msg[] = raw ? JSON.parse(raw) : [];
      return arr.filter((m) => m.role !== "system");
    } catch {
      return [];
    }
  });
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const abortRef = useRef<{ abort: boolean }>({ abort: false });
  const listRef = useRef<HTMLDivElement>(null);

  // persist (never store system role)
  useEffect(() => {
    try {
      localStorage.setItem(LS_KEY, JSON.stringify(msgs.filter((m) => m.role !== "system")));
    } catch {}
  }, [msgs]);

  // autoscroll
  useEffect(() => {
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [msgs, streaming]);

  const canSend = input.trim().length > 0 && !streaming;

  const send = async (preset?: string) => {
    const text = (preset ?? input).trim();
    if (!text || streaming) return;
    setInput("");

    // Add user + empty AI (no system in transcript)
    const u: Msg = { id: rid(), role: "user", content: text, ts: Date.now() };
    setMsgs((m) => [...m, u, { id: rid(), role: "ai", content: "", ts: Date.now() }]);

    setStreaming(true);
    abortRef.current.abort = false;
    await new Promise((r) => setTimeout(r, 120)); // tiny latency

    // Stream using internal system prompt
    const gen = cannedStream(text, model, temp, system);

    for (const chunk of gen) {
      if (abortRef.current.abort) break;
      setMsgs((m) => {
        const copy = m.slice();
        for (let i = copy.length - 1; i >= 0; i--) {
          if (copy[i].role === "ai") {
            copy[i] = { ...copy[i], content: (copy[i].content + chunk).slice(0, maxTokens * 8) };
            break;
          }
        }
        return copy;
      });
      // eslint-disable-next-line no-await-in-loop
      await new Promise((r) => setTimeout(r, 18 + Math.random() * 24));
    }
    setStreaming(false);
  };

  const stop = () => {
    abortRef.current.abort = true;
    setStreaming(false);
  };

  const clear = () => {
    setMsgs([]);
    setInput("");
  };

  const quickPrompts = useMemo(
    () => [
      "What is Arknet and how do I start?",
      "Show me how to send a transaction safely.",
      "How does the mempool selection work here?",
      "Help me compile & deploy a program in the IDE.",
    ],
    []
  );

  return (
    <div className="h-full grid grid-rows-[auto_minmax(0,1fr)_auto]">
      {/* Top toolbar — cooler dropdown + slider */}
      <div className="glass h-12 px-2 md:px-3 border-b border-border flex items-center gap-2">
        <div className="text-sm">ArkAI</div>
        <div className="mx-2 text-muted">/</div>
        <div className="text-[12px] text-muted hidden sm:block">Assistant</div>

        <div className="flex-1" />

        {/* model dropdown */}
        <ModelSelect
          value={model}
          onChange={(m) => setModel(m)}
          options={["arkai-mini", "arkai-base", "arkai-12b", "arkai-12b-q"]}
        />

        {/* temperature slider */}
        <div className="hidden sm:block">
          <TempSlider value={temp} onChange={setTemp} />
        </div>

        {/* max tokens (compact) */}
        <div className="hidden md:flex items-center gap-1 ml-1">
          <span className="text-[11px] text-muted">max</span>
          <input
            type="number"
            className="w-[84px] px-2 py-1 rounded-md bg-white/5 border border-border text-sm"
            value={maxTokens}
            onChange={(e) => setMaxTokens(Math.max(16, Math.min(8192, parseInt(e.currentTarget.value || "0", 10))))}
            title="max_tokens"
          />
        </div>

        {/* compact actions */}
        <div className="hidden md:flex items-center gap-2 ml-2">
          <button className="soft-btn px-2 py-1 text-[12px]" onClick={() => setSystemOpen((v) => !v)} title="System prompt">
            System
          </button>
          <button className="soft-btn px-2 py-1 text-[12px]" onClick={clear} title="New chat">
            New
          </button>
        </div>
      </div>

      {/* Middle */}
      <div className="min-h-0 grid grid-rows-[auto_minmax(0,1fr)]">
        {systemOpen && (
          <div className="border-b border-border p-3">
            <div className="text-[12px] text-muted mb-1">system (used internally, not shown in chat)</div>
            <textarea
              className="w-full field p-2 font-mono text-[12px] rounded-md"
              rows={3}
              value={system}
              onChange={(e) => setSystem(e.currentTarget.value)}
            />
          </div>
        )}
        <div ref={listRef} className="min-h-0 overflow-auto p-3">
          <Section padding="none" rounded="xl" border={false} className="p-3">
            <div className="grid gap-4">
              {msgs.length === 0 && (
                <div className="text-[13px] text-muted">
                  Ask anything about Arknet. Try{" "}
                  <button onClick={() => send("What is Arknet and how do I start?")} className="underline underline-offset-4">
                    getting started
                  </button>{" "}
                  or hit <Kbd>⌘K</Kbd> to explore.
                </div>
              )}
              {msgs.map((m) => (
                <div key={m.id} className={cx("flex gap-2", m.role === "user" ? "justify-end" : "justify-start")}>
                  {m.role !== "user" && <Avatar who={m.role} />}
                  <Bubble role={m.role}>{m.content}</Bubble>
                  {m.role === "user" && <Avatar who={m.role} />}
                </div>
              ))}
              {/* no explicit 'thinking…' bubble — hidden as requested */}
            </div>

            {/* quick prompts */}
            <div className="mt-6 flex flex-wrap gap-2">
              {quickPrompts.map((q) => (
                <button key={q} className="soft-btn px-2 py-1 text-[12px]" onClick={() => send(q)}>
                  {q}
                </button>
              ))}
            </div>
          </Section>
        </div>
      </div>

      {/* Composer */}
      <div className="border-t border-border">
        <div className="p-2 md:p-3 grid grid-cols-[1fr_auto] gap-2 items-end">
          <textarea
            placeholder="Ask ArkAI… (Shift+Enter for newline)"
            value={input}
            onChange={(e) => setInput(e.currentTarget.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                if (canSend) send();
              }
            }}
            className="field px-3 py-2 rounded-md bg-white/5 border border-border outline-none focus:ring-1 focus:ring-white/30 min-h-[44px] max-h-[180px]"
          />
          <div className="flex items-center gap-2">
            {streaming ? (
              <button className="btn px-4 py-2" onClick={stop} title="Stop generation">
                Stop
              </button>
            ) : (
              <button
                className={cx("btn px-4 py-2", canSend ? "btn-primary" : "opacity-50 pointer-events-none")}
                onClick={() => send()}
                title="Send (Enter)"
              >
                Send
              </button>
            )}
          </div>
        </div>
        <div className="px-3 pb-3 text-[11px] text-muted">
          Streaming via decentralized inference RPC (simulated). Model: <span className="font-mono">{model}</span> · temp {temp.toFixed(1)} ·
          max_tokens {maxTokens}
        </div>
      </div>
    </div>
  );
}
