// src/components/ide/CodeEditor.tsx
import React, { useEffect, useMemo, useRef, useState } from "react";

/* ------------------------- helpers ------------------------- */
function caretLineCol(text: string, idx: number) {
  let line = 1, col = 1;
  for (let i = 0; i < idx && i < text.length; i++) {
    if (text.charCodeAt(i) === 10) { line++; col = 1; } else { col++; }
  }
  return { line, col };
}
function clamp(n: number, lo: number, hi: number) { return Math.max(lo, Math.min(hi, n)); }
function getLineStart(text: string, idx: number) {
  let i = idx;
  while (i > 0 && text[i - 1] !== "\n") i--;
  return i;
}
function getLineEnd(text: string, idx: number) {
  let i = idx;
  while (i < text.length && text[i] !== "\n") i++;
  return i;
}
function replaceRange(s: string, start: number, end: number, insert: string) {
  return s.slice(0, start) + insert + s.slice(end);
}
function escapeHtml(s: string) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/* very small C-like highlighter (works fine for plain code too) */
function highlight(code: string) {
  // order matters: comments first to avoid coloring inside them
  let s = escapeHtml(code);

  // block comments
  s = s.replace(/\/\*[\s\S]*?\*\//g, (m) => `<span class="token-comment">${m}</span>`);
  // line comments
  s = s.replace(/(^|[^:])\/\/.*$/gm, (m) => m.replace(/\/\/.*$/, (x) => `<span class="token-comment">${x}</span>`));

  // strings
  s = s.replace(/"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|`(?:\\.|[^`\\])*`/g, (m) => `<span class="token-string">${m}</span>`);
  // numbers
  s = s.replace(/\b(?:0x[0-9a-fA-F]+|\d+(\.\d+)?)\b/g, (m) => `<span class="token-number">${m}</span>`);
  // keywords (C-ish & common)
  s = s.replace(
    /\b(?:if|else|for|while|do|return|break|continue|switch|case|default|struct|typedef|const|static|void|char|short|int|long|float|double|unsigned|signed|bool|true|false|include|define)\b/g,
    (m) => `<span class="token-kw">${m}</span>`
  );
  // function names (foo(...)
  s = s.replace(/\b([A-Za-z_]\w*)(?=\s*\()/g, (m) => `<span class="token-fn">${m}</span>`);
  return s;
}

/* ------------------------- component ------------------------- */
export default function CodeEditor({
  value,
  onChange,
  readOnly = false,
  onCursorChange,
  language = "c",   // optional hint; currently C-like generic
  tabSize = 2,
  lineNumbers = true,
  wrap = false,
}: {
  value: string;
  onChange: (s: string) => void;
  readOnly?: boolean;
  onCursorChange?: (line: number, col: number) => void;
  language?: "c" | "txt";
  tabSize?: number;
  lineNumbers?: boolean;
  wrap?: boolean;
}) {
  const area = useRef<HTMLTextAreaElement>(null);
  const gutter = useRef<HTMLDivElement>(null);
  const scroller = useRef<HTMLDivElement>(null);

  const [val, setVal] = useState(value);
  useEffect(() => setVal(value), [value]);

  const [selStart, setSelStart] = useState(0);
  const linesCount = useMemo(() => Math.max(1, val.split("\n").length), [val]);

  const { line: caretLine } = useMemo(() => caretLineCol(val, selStart), [val, selStart]);

  // keep gutter scroll synced
  useEffect(() => {
    const el = scroller.current;
    if (!el || !gutter.current) return;
    const onScroll = () => { gutter.current!.scrollTop = el.scrollTop; };
    el.addEventListener("scroll", onScroll);
    return () => el.removeEventListener("scroll", onScroll);
  }, []);

  const emitCursor = () => {
    const ta = area.current;
    if (!ta || !onCursorChange) return;
    const { line, col } = caretLineCol(val, ta.selectionStart ?? 0);
    onCursorChange(line, col);
  };

  useEffect(() => { emitCursor(); /* initial */ }, []); // eslint-disable-line

  // input behaviors
  const applyAndPersist = (newVal: string, caret: number) => {
    setVal(newVal);
    onChange(newVal);
    requestAnimationFrame(() => {
      if (area.current) {
        area.current.selectionStart = area.current.selectionEnd = caret;
        setSelStart(caret);
        emitCursor();
      }
    });
  };

  const handleKeyDown: React.KeyboardEventHandler<HTMLTextAreaElement> = (e) => {
    const ta = area.current!;
    const start = ta.selectionStart ?? 0;
    const end = ta.selectionEnd ?? 0;
    const hasSel = start !== end;

    // Cmd/Ctrl + / → toggle line comment (//)
    if ((e.metaKey || e.ctrlKey) && e.key === "/") {
      e.preventDefault();
      const s0 = getLineStart(val, start);
      // const s1 = getLineStart(val, end);
      const first = s0;
      const last = getLineEnd(val, end);
      const block = val.slice(first, last);
      const allCommented = block.split("\n").every((ln) => ln.trim().startsWith("//") || ln.trim() === "");
      const updated = block
        .split("\n")
        .map((ln) =>
          allCommented ? ln.replace(/^(\s*)\/\/ ?/, "$1") : ln.replace(/^(\s*)/, "$1// ")
        )
        .join("\n");
      const newVal = replaceRange(val, first, last, updated);
      const newCaret = allCommented ? clamp(start - 3, first, first + updated.length) : start + 3;
      applyAndPersist(newVal, newCaret);
      return;
    }

    // Cmd/Ctrl + D → duplicate line
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "d") {
      e.preventDefault();
      const l0 = getLineStart(val, start);
      const l1 = getLineEnd(val, end);
      const block = val.slice(l0, l1);
      const newVal = replaceRange(val, l1, l1, "\n" + block);
      const newCaret = end + 1 + block.length;
      applyAndPersist(newVal, newCaret);
      return;
    }

    // Tab / Shift+Tab → indent / outdent
    if (e.key === "Tab") {
      e.preventDefault();
      const IND = " ".repeat(tabSize);
      if (hasSel) {
        const l0 = getLineStart(val, start);
        const l1 = getLineEnd(val, end);
        const block = val.slice(l0, l1);
        const updated = block
          .split("\n")
          .map((ln) => (e.shiftKey ? ln.replace(new RegExp("^ {1," + tabSize + "}"), "") : IND + ln))
          .join("\n");
        const delta = updated.length - block.length;
        const newVal = replaceRange(val, l0, l1, updated);
        const newStart = e.shiftKey ? Math.max(l0, start - tabSize) : start + tabSize;
        const newEnd = end + delta;
        setVal(newVal);
        onChange(newVal);
        requestAnimationFrame(() => {
          area.current!.selectionStart = newStart;
          area.current!.selectionEnd = newEnd;
          setSelStart(newEnd);
          emitCursor();
        });
      } else {
        const newVal = replaceRange(val, start, end, IND);
        applyAndPersist(newVal, start + tabSize);
      }
      return;
    }

    // Enter → keep indentation, add one level if line ends with '{'
    if (e.key === "Enter") {
      e.preventDefault();
      const l0 = getLineStart(val, start);
      const cur = val.slice(l0, start);
      const indent = (cur.match(/^\s+/)?.[0] ?? "");
      const extra = /{\s*$/.test(cur) ? " ".repeat(tabSize) : "";
      const insert = "\n" + indent + extra;
      const newVal = replaceRange(val, start, end, insert);
      applyAndPersist(newVal, start + insert.length);
      return;
    }

    // Auto-pairs
    const pairs: Record<string, string> = { "(": ")", "[": "]", "{": "}", '"': '"', "'": "'", "`": "`" };
    if (pairs[e.key] && !e.metaKey && !e.ctrlKey && !e.altKey) {
      e.preventDefault();
      const open = e.key;
      const close = pairs[e.key];
      const sel = val.slice(start, end);
      let insert = open + (sel || "") + close;
      const newCaret = sel ? end + 2 : start + 1;
      const newVal = replaceRange(val, start, end, insert);
      applyAndPersist(newVal, newCaret);
      return;
    }
    // Smart skip over closing if already present
    if (")]}\"'`".includes(e.key) && !hasSel) {
      const ahead = val[start];
      if (ahead === e.key) {
        e.preventDefault();
        applyAndPersist(val, start + 1);
        return;
      }
    }
  };

  const handleChange: React.ChangeEventHandler<HTMLTextAreaElement> = (e) => {
    const s = e.currentTarget.value;
    setVal(s);
    onChange(s);
  };
  const handleSelect: React.ReactEventHandler<HTMLTextAreaElement> = () => {
    if (!area.current) return;
    setSelStart(area.current.selectionStart ?? 0);
    emitCursor();
  };

  // highlighted view (behind transparent textarea)
  const highlightedHtml = useMemo(() => {
    const activeIdx = caretLine - 1;
    const raw = highlight(val);
    // split by lines and tag active line for subtle background
    const parts = raw.split("\n").map((ln, i) => {
      const cls = i === activeIdx ? "hl-line active" : "hl-line";
      return `<div class="${cls}">${ln || "&nbsp;"}</div>`;
    });
    return parts.join("");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [val, caretLine, language]);

  return (
    <div className="h-full border-t border-border grid grid-cols-[48px_minmax(0,1fr)]">
      {/* gutter */}
      {lineNumbers ? (
        <div ref={gutter} className="bg-white/5 border-r border-border overflow-hidden">
          <pre className="select-none text-right pr-2 py-2 font-mono text-[12px] leading-5">
            {Array.from({ length: linesCount }).map((_, i) => (
              <div key={i}>{i + 1}</div>
            ))}
          </pre>
        </div>
      ) : (
        <div />
      )}

      {/* code layers */}
      <div ref={scroller} className={`relative overflow-auto ${wrap ? "whitespace-pre-wrap" : "whitespace-pre"}`}>
        {/* highlighted code */}
        <pre
          className={`pointer-events-none px-2 py-2 font-mono text-[12.5px] leading-5 text-transparent select-none`}
          aria-hidden
        >
          {/* Use a background gradient line for active line via CSS class; text is colored via spans */}
          <code
            className="editor-code block"
            dangerouslySetInnerHTML={{ __html: highlightedHtml }}
          />
        </pre>

        {/* textarea overlay (shows caret) */}
        <textarea
          ref={area}
          spellCheck={false}
          readOnly={readOnly}
          value={val}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          onClick={handleSelect}
          onKeyUp={handleSelect}
          onMouseUp={handleSelect}
          style={{ tabSize }}
          className={`absolute inset-0 w-full h-full resize-none bg-transparent outline-none px-2 py-2 font-mono text-[12.5px] leading-5 text-transparent caret-white dark:caret-white caret-current`}
          aria-label="Code editor"
        />
      </div>

      {/* styles scoped to this component */}
      <style>{`
        /* token colors are theme-aware via Tailwind utility classes on spans */
        .token-comment { color: rgba(127,127,127,.85); font-style: italic; }
        .token-string  { color: var(--tw-prose-links, rgb(99 179 237)); } /* primary-esque */
        .token-number  { color: var(--tw-prose-bold, rgb(181 156 255)); } /* accent-esque */
        .token-kw      { color: rgb(181 156 255); font-weight: 600; }
        .token-fn      { color: rgb(220 220 220); }
        html[data-theme="light"] .token-fn { color: rgb(35 35 35); }

        /* active line background */
        .hl-line { position: relative; }
        .hl-line.active::before {
          content: "";
          position: absolute;
          inset: 0;
          background: linear-gradient(90deg, rgba(255,255,255,0.08), rgba(255,255,255,0.02));
          pointer-events: none;
        }
        html[data-theme="light"] .hl-line.active::before {
          background: linear-gradient(90deg, rgba(0,0,0,0.06), rgba(0,0,0,0.02));
        }

        /* make the actual highlighted text visible, even though the <pre> has text-transparent */
        .editor-code :where(.token-comment,.token-string,.token-number,.token-kw,.token-fn) { color: inherit; }
        .editor-code { color: rgb(220 220 220); }
        html[data-theme="light"] .editor-code { color: rgb(33 33 33); }

        /* ensure selection is readable in overlay textarea */
        textarea::selection {
          background: rgba(106,169,255,.35);
        }
        html[data-theme="light"] textarea::selection {
          background: rgba(106,169,255,.25);
        }
      `}</style>
    </div>
  );
}
