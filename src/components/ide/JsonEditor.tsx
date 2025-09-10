// src/components/ide/JsonEditor.tsx
import { useEffect, useMemo, useRef, useState } from "react";
import CodeEditor from "./CodeEditor";

/* -------- helpers -------- */
function computeLineColFromPos(text: string, pos: number) {
  let line = 1, col = 1;
  for (let i = 0; i < text.length && i < pos; i++) {
    if (text.charCodeAt(i) === 10) { line++; col = 1; } else { col++; }
  }
  return { line, col };
}
function tryParseJson(s: string): { ok: true; value: any } | { ok: false; error: string; pos?: number; line?: number; col?: number } {
  try {
    return { ok: true, value: JSON.parse(s) };
  } catch (e: any) {
    const msg = String(e?.message ?? "Invalid JSON");
    // V8/most browsers: "Unexpected token ... in JSON at position 123"
    const m = msg.match(/position\s+(\d+)/i);
    if (m) {
      const pos = parseInt(m[1], 10);
      const { line, col } = computeLineColFromPos(s, pos);
      return { ok: false, error: msg, pos, line, col };
    }
    return { ok: false, error: msg };
  }
}
function deepSortKeys(x: any): any {
  if (Array.isArray(x)) return x.map(deepSortKeys);
  if (x && typeof x === "object" && x.constructor === Object) {
    const out: Record<string, any> = {};
    for (const k of Object.keys(x).sort((a, b) => a.localeCompare(b))) out[k] = deepSortKeys(x[k]);
    return out;
  }
  return x;
}
const cx = (...xs: Array<string | false | null | undefined>) => xs.filter(Boolean).join(" ");

/* -------- component -------- */
export default function JsonEditor({
  value,
  onChange,
  readOnly = false,
  onCursorChange,
}: {
  value: string;
  onChange: (s: string) => void;
  readOnly?: boolean;
  onCursorChange?: (line: number, col: number) => void;
}) {
  const [v, setV] = useState(value);
  const [wrap, setWrap] = useState(false);
  const lastGood = useRef<string | null>(null);

  useEffect(() => setV(value), [value]);

  const parsed = useMemo(() => tryParseJson(v), [v]);
  const valid = parsed.ok;

  useEffect(() => {
    if (valid) lastGood.current = v;
  }, [valid, v]);

  const pretty = () => {
    if (!valid) return;
    const s = JSON.stringify((parsed as any).value, null, 2);
    setV(s);
    onChange(s);
  };
  const minify = () => {
    if (!valid) return;
    const s = JSON.stringify((parsed as any).value);
    setV(s);
    onChange(s);
  };
  const sortKeys = () => {
    if (!valid) return;
    const sorted = deepSortKeys((parsed as any).value);
    const s = JSON.stringify(sorted, null, 2);
    setV(s);
    onChange(s);
  };
  const copy = async () => {
    try { await navigator.clipboard.writeText(v); } catch {}
  };
  const restore = () => {
    if (lastGood.current) {
      setV(lastGood.current);
      onChange(lastGood.current);
    }
  };

  const lines = useMemo(() => Math.max(1, v.split("\n").length), [v]);

  return (
    <div className="h-full grid grid-rows-[auto_minmax(0,1fr)]">
      {/* Toolbar */}
      <div className="flex items-center gap-2 px-3 py-2 border-b border-border">
        <div
          className={cx(
            "inline-flex items-center gap-2 text-[12px] px-2 py-1 rounded-md",
            valid ? "text-muted bg-white/5" : "text-danger bg-danger/10"
          )}
          aria-live="polite"
        >
          <span
            className={cx(
              "inline-block w-2 h-2 rounded-full",
              valid ? "bg-success" : "bg-danger"
            )}
          />
          {valid ? "Valid JSON" : "Invalid JSON"}
          {!valid && (parsed as any).line != null && (
            <span className="ml-1 opacity-80">· line {(parsed as any).line}, col {(parsed as any).col}</span>
          )}
        </div>

        <div className="text-[12px] text-muted ml-2">
          {lines} {lines === 1 ? "line" : "lines"} · {v.length.toLocaleString()} chars
        </div>

        <div className="flex-1" />

        {!readOnly && (
          <>
            <button className={cx("soft-btn px-2 py-1 text-[12px]", valid ? "" : "opacity-50 pointer-events-none")} onClick={pretty} title="Format (2-space)">
              Format
            </button>
            <button className={cx("soft-btn px-2 py-1 text-[12px]", valid ? "" : "opacity-50 pointer-events-none")} onClick={minify} title="Minify">
              Minify
            </button>
            <button className={cx("soft-btn px-2 py-1 text-[12px]", valid ? "" : "opacity-50 pointer-events-none")} onClick={sortKeys} title="Sort keys (deep)">
              Sort keys
            </button>
            <div className="mx-1 w-px h-4 bg-border" />
            <button className="soft-btn px-2 py-1 text-[12px]" onClick={copy} title="Copy to clipboard">
              Copy
            </button>
            <button
              className={cx("soft-btn px-2 py-1 text-[12px]", lastGood.current ? "" : "opacity-50 pointer-events-none")}
              onClick={restore}
              title="Restore last valid"
            >
              Restore
            </button>
            <div className="mx-1 w-px h-4 bg-border" />
          </>
        )}

        <label className="inline-flex items-center gap-2 text-[12px]">
          <input type="checkbox" checked={wrap} onChange={(e) => setWrap(e.currentTarget.checked)} />
          Wrap
        </label>
      </div>

      {/* Editor */}
      <CodeEditor
        value={v}
        onChange={(s) => { setV(s); onChange(s); }}
        readOnly={readOnly}
        onCursorChange={onCursorChange}
        language="txt"       // JSON works well with our generic highlighter (strings, numbers, true/false)
        tabSize={2}
        lineNumbers
        wrap={wrap}
      />
    </div>
  );
}
