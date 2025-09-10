// Cross-platform prebuild launcher: calls the right orchestrator per OS.
// Windows → PowerShell script; macOS/Linux → Bash script.
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);

const isWin = process.platform === "win32";
const script = isWin
  ? path.join(__dirname, "win-orchestrate.ps1")
  : path.join(__dirname, "unix-orchestrate.sh");

// Pass through “prebuild” context automatically (both orchestrators already guard recursion).
// Add default flags per OS to copy deps into Tauri bundle resources.
const args = process.argv.slice(2);
let cmd, argv;

if (isWin) {
  // Prefer Windows PowerShell; fall back to pwsh if needed.
  cmd = "powershell";
  argv = [
    "-NoProfile",
    "-ExecutionPolicy", "Bypass",
    "-File", script,
    "-CopyDlls",              // copy *.dll with *.exe
    ...args
  ];
  let r = spawnSync(cmd, argv, { stdio: "inherit" });
  if (r.error && r.error.code === "ENOENT") {
    cmd = "pwsh";
    r = spawnSync(cmd, argv, { stdio: "inherit" });
  }
  process.exit(r.status ?? 0);
} else {
  cmd = "/usr/bin/env";
  argv = ["bash", script, "--copy-deps", ...args]; // copy *.so/.dylib alongside bins
  const r = spawnSync(cmd, argv, { stdio: "inherit" });
  process.exit(r.status ?? 0);
}
