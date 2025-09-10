// src-tauri/src/miner.rs
use serde::Serialize;
use serde_json;
use std::{fs, path::PathBuf, process::Command};
use tauri::{AppHandle, Manager};

use crate::settings::{ark_home, Settings};

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")] // <-- ensure camelCase everywhere in this struct
pub struct GpuInfo {
  pub name: String,
  pub vram_mb: u64,                // -> "vramMb"
  #[serde(rename = "vramBytes")]   // keep explicit long-bytes field
  pub vram_bytes: u64,
  pub driver: Option<String>,
}


#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct HostProbe {
  pub os: String,
  pub arch: String,

  pub bundled_c_lib_path: Option<String>,
  pub bundled_c_lib_exists: bool,
  pub using_bundled: bool,

  pub python_ok: bool,
  pub python_version: Option<String>,
  pub pip_ok: bool,

  pub ark_py_ok: bool,
  pub ark_py_version: Option<String>,

  /// true if some accelerated backend detected: CUDA/ROCm/Metal
  pub cuda_ok: bool,

  pub gpus: Vec<GpuInfo>,
  pub warnings: Vec<String>,
}

#[derive(Serialize, Clone)]
pub struct BundledCLib {
  pub path: Option<String>,
  pub exists: bool,
}

fn run_ok_out(cmd: &str, args: &[&str]) -> Option<String> {
  let out = Command::new(cmd).args(args).output().ok()?;
  if !out.status.success() { return None; }
  Some(String::from_utf8_lossy(&out.stdout).trim().to_string())
}

fn detect_python() -> (bool, Option<String>, bool) {
  if let Some(exe) = run_ok_out("py", &["-3", "-c", "import sys; print(sys.executable)"]) {
    let pip_ok = run_ok_out(&exe, &["-m", "pip", "--version"]).is_some();
    let ver = run_ok_out(&exe, &["-c", "import sys; print(sys.version.split()[0])"]);
    return (true, ver, pip_ok);
  }
  for name in ["python3", "python"] {
    if let Some(exe_path) = run_ok_out(name, &["-c", "import sys; print(sys.executable)"]) {
      let pip_ok = run_ok_out(&exe_path, &["-m", "pip", "--version"]).is_some();
      let ver = run_ok_out(&exe_path, &["-c", "import sys; print(sys.version.split()[0])"]);
      return (true, ver, pip_ok);
    }
  }
  (false, None, false)
}

fn python_executable() -> Option<String> {
  if let Some(exe) = run_ok_out("py", &["-3", "-c", "import sys; print(sys.executable)"]) { return Some(exe); }
  for name in ["python3", "python"] {
    if let Some(exe) = run_ok_out(name, &["-c", "import sys; print(sys.executable)"]) { return Some(exe); }
  }
  None
}

fn detect_arkpy(python: Option<&str>) -> (bool, Option<String>) {
  let py = match python { Some(p) => p, None => return (false, None) };
  let ok = run_ok_out(py, &["-c", "import importlib.util as u; print(1 if u.find_spec('arkpy') else 0)"])
    .map(|s| s == "1").unwrap_or(false);
  let ver = run_ok_out(py, &["-c", r#"import sys
try:
  import importlib.metadata as md
  print(md.version('arkpy'))
except Exception:
  try:
    import pkg_resources as pr
    print(pr.get_distribution('arkpy').version)
  except Exception:
    print('')
"#]).and_then(|s| if s.is_empty(){None}else{Some(s)});
  (ok, ver)
}

// ---------- GPU DETECTION ----------

fn gi(name: String, vram_bytes: u64, driver: Option<String>) -> GpuInfo {
  GpuInfo { name, vram_mb: (vram_bytes / (1024*1024)) as u64, vram_bytes, driver }
}

fn parse_nvidia_smi() -> Option<Vec<GpuInfo>> {
  // Primary: numeric MiB (nounits) for reliable parsing
  if let Some(out) = run_ok_out(
    "nvidia-smi",
    &["--query-gpu=name,memory.total,driver_version","--format=csv,noheader,nounits"],
  ) {
    let mut gpus = vec![];
    for line in out.lines().filter(|l| !l.trim().is_empty()) {
      let parts: Vec<_> = line.split(',').map(|s| s.trim()).collect();
      if parts.len() >= 2 {
        let name = parts[0].to_string();
        let vram_mib = parts[1].parse::<u64>().ok(); // may be N/A
        let driver = parts.get(2).map(|s| s.to_string());
        if let Some(mib) = vram_mib {
          gpus.push(gi(name, mib * 1024 * 1024, driver));
        } else {
          // fall back to unitful parse for this line only
          if let Some(unitful) = run_ok_out("nvidia-smi",&["--query-gpu=name,memory.total,driver_version","--format=csv,noheader"]) {
            for ln in unitful.lines() {
              let ps: Vec<_> = ln.split(',').map(|s| s.trim()).collect();
              if ps.len() >= 2 && ps[0] == parts[0] {
                // memory like "6144 MiB"
                let mem = ps[1];
                let num = mem.split_whitespace().next().and_then(|x| x.parse::<u64>().ok()).unwrap_or(0);
                gpus.push(gi(name.clone(), num * 1024 * 1024, driver.clone()));
                break;
              }
            }
          } else {
            // keep name, but mark 0; later enrichment may fill it
            gpus.push(gi(name, 0, driver));
          }
        }
      }
    }
    if !gpus.is_empty() { return Some(gpus); }
  }
  None
}

#[cfg(target_os = "windows")]
fn parse_windows_gpus() -> Option<Vec<GpuInfo>> {
  let cmd = "Get-CimInstance Win32_VideoController | Select-Object Name,AdapterRAM,DriverVersion | ConvertTo-Json -Depth 3";
  let out = run_ok_out("powershell", &["-NoProfile", "-Command", cmd])?;
  let json = serde_json::from_str::<serde_json::Value>(&out).ok()?;
  let arr = if json.is_array() { json } else { serde_json::Value::Array(vec![json]) };
  let mut gpus = vec![];
  for v in arr.as_array().unwrap() {
    let name = v.get("Name").and_then(|x| x.as_str()).unwrap_or("GPU").to_string();
    let driver = v.get("DriverVersion").and_then(|x| x.as_str()).map(|s| s.to_string());
    let bytes = v.get("AdapterRAM").and_then(|x| x.as_u64()).unwrap_or(0);
    gpus.push(gi(name, bytes, driver));
  }
  if gpus.is_empty() { None } else { Some(gpus) }
}

#[cfg(not(target_os = "windows"))]
fn parse_windows_gpus() -> Option<Vec<GpuInfo>> { None }

#[cfg(target_os = "macos")]
fn parse_macos_gpus() -> Option<Vec<GpuInfo>> {
  let out = run_ok_out("system_profiler", &["SPDisplaysDataType", "-json"])?;
  let v: serde_json::Value = serde_json::from_str(&out).ok()?;
  let arr = v.get("SPDisplaysDataType")?.as_array()?;
  let mut gpus = vec![];
  for entry in arr {
    let name = entry.get("_name").and_then(|x| x.as_str()).unwrap_or("GPU").to_string();
    let vram_s = entry.get("spdisplays_vram").and_then(|x| x.as_str()).unwrap_or("0 MB");
    let driver = entry.get("spdisplays_vendor").and_then(|x| x.as_str()).map(|s| s.to_string());
    let (num, unit) = {
      let parts: Vec<_> = vram_s.split_whitespace().collect();
      if parts.len() >= 2 { (parts[0], parts[1]) } else { ("0", "MB") }
    };
    let mut mib = num.parse::<f64>().unwrap_or(0.0);
    if unit.eq_ignore_ascii_case("GB") { mib *= 1024.0; }
    let bytes = (mib.max(0.0) * 1024.0 * 1024.0).round() as u64 * 1024; // safer rounding
    gpus.push(gi(name, bytes, driver));
  }
  if gpus.is_empty() { None } else { Some(gpus) }
}

#[cfg(not(target_os = "macos"))]
fn parse_macos_gpus() -> Option<Vec<GpuInfo>> { None }

#[cfg(all(target_os = "linux", not(target_os = "android")))]
fn parse_rocm() -> bool { run_ok_out("rocm-smi", &["--showproductname"]).is_some() }
#[cfg(not(all(target_os = "linux", not(target_os = "android"))))]
fn parse_rocm() -> bool { false }

// Try to enrich any zero-VRAM entries using platform-specific sources.
#[cfg(target_os = "windows")]
fn enrich_vram(mut base: Vec<GpuInfo>) -> Vec<GpuInfo> {
  if let Some(wins) = parse_windows_gpus() {
    for b in base.iter_mut() {
      if b.vram_bytes == 0 {
        // match by contains (robust for Laptop/Max-Q naming)
        if let Some(w) = wins.iter().max_by_key(|w| usize::from(w.name.to_lowercase().contains(&b.name.to_lowercase()))) {
          if w.vram_bytes > 0 { b.vram_bytes = w.vram_bytes; b.vram_mb = w.vram_mb; }
        }
      }
    }
  }
  base
}
#[cfg(target_os = "macos")]
fn enrich_vram(base: Vec<GpuInfo>) -> Vec<GpuInfo> { base } // mac path already provides VRAM
#[cfg(all(unix, not(target_os = "macos")))]
fn enrich_vram(base: Vec<GpuInfo>) -> Vec<GpuInfo> { base }

fn sort_gpus(mut gpus: Vec<GpuInfo>) -> Vec<GpuInfo> {
  gpus.sort_by(|a, b| b.vram_bytes.cmp(&a.vram_bytes));
  gpus
}

#[cfg(target_os = "windows")]
const LIB_NAME: &str = "arknet.dll";
#[cfg(target_os = "macos")]
const LIB_NAME: &str = "libarknet.dylib";
#[cfg(all(unix, not(target_os = "macos")))]
const LIB_NAME: &str = "libarknet.so";

fn find_bundled_lib(app: &AppHandle) -> Option<PathBuf> {
  let mut candidates: Vec<PathBuf> = Vec::new();
  if let Ok(res) = app.path().resource_dir() {
    candidates.push(res.join(LIB_NAME));
    candidates.push(res.join("arknet").join(LIB_NAME));
    candidates.push(res.join("arknet").join("lib").join(LIB_NAME));
  }
  if let Ok(exe) = std::env::current_exe() {
    if let Some(dir) = exe.parent() {
      candidates.push(dir.join(LIB_NAME));
      candidates.push(dir.join("resources").join(LIB_NAME));
      candidates.push(dir.join("resources").join("arknet").join(LIB_NAME));
    }
  }
  if let Ok(cwd) = std::env::current_dir() {
    candidates.push(cwd.join(LIB_NAME));
    candidates.push(cwd.join("resources").join(LIB_NAME));
  }
  candidates.into_iter().find(|p| p.exists())
}

fn load_settings_quiet() -> Option<Settings> {
  let p = ark_home().join("config.json");
  if !p.is_file() { return None; }
  let s = fs::read_to_string(p).ok()?;
  serde_json::from_str::<Settings>(&s).ok()
}

// ---------- Commands ----------

#[tauri::command]
pub fn probe_bundled_clib(app: AppHandle) -> Result<BundledCLib, String> {
  let path = find_bundled_lib(&app);
  Ok(BundledCLib {
    path: path.as_ref().map(|p| p.to_string_lossy().into_owned()),
    exists: path.as_ref().map(|p| p.is_file()).unwrap_or(false),
  })
}

#[tauri::command]
pub fn locate_python() -> Result<Option<String>, String> {
  Ok(python_executable())
}

#[tauri::command]
pub fn install_arkpy() -> Result<(), String> {
  let Some(py) = python_executable() else { return Err("Python not found on PATH".into()); };
  let ok = Command::new(&py).args(["-m","pip","install","--upgrade","--user","arkpy"])
    .status().map_err(|e| e.to_string())?;
  if !ok.success() { return Err("pip failed installing arkpy".into()); }
  Ok(())
}

#[tauri::command]
pub fn host_probe(app: AppHandle) -> Result<HostProbe, String> {
  let os = std::env::consts::OS.to_string();
  let arch = std::env::consts::ARCH.to_string();

  let bundled = find_bundled_lib(&app);
  let (bundled_path, bundled_exists) = (
    bundled.as_ref().map(|p| p.to_string_lossy().into_owned()),
    bundled.as_ref().map(|p| p.is_file()).unwrap_or(false),
  );

  let current = load_settings_quiet();
  let using_bundled = if let (Some(cur), Some(bp)) = (current.as_ref(), bundled_path.as_ref()) {
    std::path::Path::new(&cur.c_lib_path).eq(std::path::Path::new(bp))
  } else { false };

  let (python_ok, python_version, pip_ok) = detect_python();
  let py_exe = python_executable();
  let (ark_py_ok, ark_py_version) = detect_arkpy(py_exe.as_deref());

  let mut warnings = vec![];
  let mut gpus: Vec<GpuInfo> = vec![];
  let mut cuda_ok = false;

  if let Some(nv) = parse_nvidia_smi() {
    cuda_ok = true; // NVIDIA stack present
    gpus.extend(nv);
  }

  #[cfg(target_os = "windows")]
  {
    // Always try to enrich/patch zero-VRAM entries with WMI data
    gpus = enrich_vram(gpus);
    // If still empty, use WMI as a fallback source
    if gpus.is_empty() {
      if let Some(win) = parse_windows_gpus() { gpus.extend(win); }
      else { warnings.push("Could not query GPUs via PowerShell".into()); }
    }
  }

  #[cfg(target_os = "macos")]
  {
    if gpus.is_empty() {
      if let Some(mac) = parse_macos_gpus() { gpus.extend(mac); }
      else { warnings.push("system_profiler SPDisplaysDataType failed".into()); }
    }
    if !gpus.is_empty() { cuda_ok = true; } // treat Metal presence as compute-OK
  }

  #[cfg(all(target_os = "linux", not(target_os = "android")))]
  {
    if !cuda_ok && parse_rocm() { cuda_ok = true; }
  }

  let gpus = sort_gpus(gpus);

  Ok(HostProbe {
    os, arch,
    bundled_c_lib_path: bundled_path,
    bundled_c_lib_exists: bundled_exists,
    using_bundled,
    python_ok, python_version, pip_ok,
    ark_py_ok, ark_py_version,
    cuda_ok,
    gpus,
    warnings,
  })
}
