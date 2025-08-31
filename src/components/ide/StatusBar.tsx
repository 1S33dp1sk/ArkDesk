// src/components/ide/StatusBar.tsx
import React, { useMemo, useRef, useState } from "react";

type Diag = { errors?: number; warnings?: number };
type IndentStyle = "Spaces" | "Tabs";

export default function StatusBar({
  path,
  line,
  col,
  autosave,
  onToggleAutosave,
  // ——— optional niceties (all safe defaults) ———
  dirty = false,
  language = "Plain Text",
  encoding = "UTF-8",
  eol = "LF",
  indentSize = 2,
  indentStyle = "Spaces",
  branch,
  diagnostics,
  onSave,               // if provided, shows a Save button (⌘/Ctrl+S)
  onFormat,             // if provided, shows a Format button
  onCommandPalette,     // optional: quickly open palette
}: {
  path: string;
  line: number;
  col: number;
  autosave: boolean;
  onToggleAutosave: () => void;
  dirty?: boolean;
  language?: string;
  encoding?: "UTF-8" | "UTF-16" | string;
  eol?: "LF" | "CRLF" | string;
  indentSize?: number;
  indentStyle?: IndentStyle;
  branch?: string;
  diagnostics?: Diag;
  onSave?: () => void;
  onFormat?: () => void;
  onCommandPalette?: () => void;
}) {
  // copy-to-clipboard feedback for the path
  const [copied, setCopied] = useState(false);
  const copyTimer = useRef<number | null>(null);
  const copyPath = () => {
    navigator.clipboard.writeText(path).then(() => {
      setCopied(true);
      if (copyTimer.current) window.clearTimeout(copyTimer.current);
      copyTimer.current = window.setTimeout(() => setCopied(false), 1200);
    }).catch(() => {});
  };

  const parts = useMemo(() => {
    const segs = path.split("/").filter(Boolean);
    const name = segs.pop() ?? path;
    const dir = segs.join("/") || "/";
    return { dir, name };
  }, [path]);

  const errors = diagnostics?.errors ?? 0;
  const warns  = diagnostics?.warnings ?? 0;

  const onSwitchKey: React.KeyboardEventHandler<HTMLButtonElement> = (e) => {
    if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onToggleAutosave(); }
  };

  const isMac = typeof navigator !== "undefined" && /Mac|iPod|iPhone|iPad/.test(navigator.platform);
  const mod = isMac ? "⌘" : "Ctrl";

  return (
    <div
      className="border-t border-border h-8 px-2 md:px-3 flex items-center gap-2 text-[12px] bg-surface-1/60
                 backdrop-blur supports-[backdrop-filter]:bg-surface-1/40"
      role="contentinfo"
      aria-label="Editor status bar"
    >
      {/* left: path / branch */}
      <div className="min-w-0 flex items-center gap-2">
        <button
          onClick={copyPath}
          title="Click to copy full path"
          className="group flex items-center min-w-0 max-w-[46vw] md:max-w-[38vw] lg:max-w-[50vw] gap-1 px-1 py-0.5 rounded
                     hover:bg-white/10 transition"
        >
          {dirty && <span className="text-accent -ml-[2px]" title="Unsaved changes">●</span>}
          <span className="text-muted truncate" title={path}>
            <span className="opacity-70">{parts.dir}/</span>
            <strong className="text-text">{parts.name}</strong>
          </span>
          <span
            className={`ml-2 text-[11px] px-1.5 py-[2px] rounded border ${
              copied ? "border-white/40 bg-white/10" : "border-border bg-white/5"
            }`}
            aria-hidden
          >
            {copied ? "Copied" : "Copy"}
          </span>
        </button>

        {branch && (
          <Badge title="Git branch">
            <BranchIcon /> {branch}
          </Badge>
        )}
      </div>

      {/* center: cursor (live polite) */}
      <div className="mx-auto select-none" aria-live="polite">
        <span className="text-muted">Ln</span>&nbsp;{line}&nbsp;&nbsp;
        <span className="text-muted">Col</span>&nbsp;{col}
      </div>

      {/* right cluster */}
      <div className="ml-auto flex items-center gap-2">
        {/* diagnostics */}
        <div className="hidden sm:flex items-center gap-1">
          <DiagPill kind="error" count={errors} />
          <DiagPill kind="warn" count={warns} />
        </div>

        {/* lang / indent / eol / encoding */}
        <Meta>{language}</Meta>
        <Meta>{indentStyle}:{indentSize}</Meta>
        <Meta>{eol}</Meta>
        <Meta>{encoding}</Meta>

        {/* quick actions */}
        {onFormat && (
          <ActionButton onClick={onFormat} title="Format document">
            <WandIcon /> Format
          </ActionButton>
        )}
        {onSave && (
          <ActionButton onClick={onSave} title={`Save (${mod}+S)`}>
            <SaveIcon /> Save
          </ActionButton>
        )}
        {onCommandPalette && (
          <ActionButton onClick={onCommandPalette} title={`Command Palette (${mod}+K)`}>
            <SparkIcon /> {mod}K
          </ActionButton>
        )}

        {/* autosave switch */}
        <button
          role="switch"
          aria-checked={autosave}
          onClick={onToggleAutosave}
          onKeyDown={onSwitchKey}
          title="Toggle autosave"
          className={[
            "relative h-6 px-2 rounded-md border text-[11px] tracking-wide transition",
            autosave
              ? "border-white/40 bg-white/10"
              : "border-border bg-white/5 hover:bg-white/10"
          ].join(" ")}
        >
          Autosave {autosave ? "On" : "Off"}
        </button>
      </div>
    </div>
  );
}

/* ——— small atoms ——— */

function Badge({ children, title }: { children: React.ReactNode; title?: string }) {
  return (
    <span
      className="hidden md:inline-flex items-center gap-1 px-2 py-[2px] rounded-md border border-border bg-white/5"
      title={title}
    >
      {children}
    </span>
  );
}

function Meta({ children }: { children: React.ReactNode }) {
  return (
    <span className="hidden sm:inline-flex items-center px-2 py-[2px] rounded-md border border-border bg-white/5">
      {children}
    </span>
  );
}

function ActionButton({
  onClick,
  title,
  children,
}: {
  onClick: () => void;
  title?: string;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      title={title}
      className="inline-flex items-center gap-1 px-2 py-[2px] rounded-md border border-border bg-white/5 hover:bg-white/10 transition"
    >
      {children}
    </button>
  );
}

function DiagPill({ kind, count }: { kind: "error" | "warn"; count: number }) {
  const tone = kind === "error" ? "text-danger" : "text-warn";
  const Icon = kind === "error" ? ErrorIcon : WarnIcon;
  return (
    <span
      className={`inline-flex items-center gap-1 px-2 py-[2px] rounded-md border border-border bg-white/5 ${tone}`}
      title={`${count} ${kind}${count === 1 ? "" : "s"}`}
    >
      <Icon /> {count}
    </span>
  );
}

/* ——— tiny inline icons (no deps) ——— */
function SaveIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" aria-hidden className="shrink-0">
      <path fill="currentColor" d="M5 3h10l4 4v14H5V3Zm2 2v5h10V7.83L15.17 5H7Zm0 9v4h10v-4H7Z"/>
    </svg>
  );
}
function WandIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" aria-hidden className="shrink-0">
      <path fill="currentColor" d="m11 3 1 3 3 1-3 1-1 3-1-3-3-1 3-1 1-3Zm6 8 1 3 3 1-3 1-1 3-1-3-3-1 3-1 1-3ZM3 13l8-8 3 3-8 8H3v-3Z"/>
    </svg>
  );
}
function SparkIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" aria-hidden className="shrink-0">
      <path fill="currentColor" d="M12 2 9 9 2 12l7 3 3 7 3-7 7-3-7-3-3-7Z"/>
    </svg>
  );
}
function BranchIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" aria-hidden className="shrink-0">
      <path fill="currentColor" d="M7 4a3 3 0 1 1-2 5.83v4.34A3.001 3.001 0 1 1 7 19a3 3 0 0 1-2-5.83V9.66A5.99 5.99 0 0 0 11 7h2a3 3 0 1 1 0 2h-2a4 4 0 0 0-4 4v.17A3.001 3.001 0 1 1 7 4Z"/>
    </svg>
  );
}
function ErrorIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" aria-hidden className="shrink-0">
      <path fill="currentColor" d="M11 7h2v6h-2V7Zm0 8h2v2h-2v-2Zm1-13 10 18H1L12 2Z"/>
    </svg>
  );
}
function WarnIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" aria-hidden className="shrink-0">
      <path fill="currentColor" d="M1 21h22L12 2 1 21Zm12-3h-2v-2h2v2Zm0-4h-2v-4h2v4Z"/>
    </svg>
  );
}
