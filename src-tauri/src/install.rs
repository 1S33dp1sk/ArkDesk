// src-tauri/src/install.rs
use serde::Serialize;
use std::{
  env,
  ffi::OsStr,
  fs, io,
  path::{Path, PathBuf},
  process::Command,
};
use tauri::{AppHandle, Emitter, Manager, Window};
use tauri::path::BaseDirectory;

use crate::settings::{ark_home, Settings};
use crate::settings::save_settings as save_settings_cmd;

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct InstallEvt {
  step: u8,
  total: u8,
  label: String,
  done: bool,
  ok: bool,
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct Preflight {
  pub home: String,
  pub parent: String,
  pub parent_exists: bool,
  pub parent_writable: bool,
  pub free_bytes: u64,
  pub need_bytes: u64,
  pub spurious: Vec<String>,

  pub missing_bins: Vec<String>,
  pub bins_ok: bool,

  pub missing_wheels: Vec<String>,
  pub wheels_ok: bool,

  // NEW: Windows DLL sanity (always present in payload; non-Windows = ok/empty)
  pub missing_dlls: Vec<String>,
  pub dlls_ok: bool,

  pub ok: bool,
}

fn emit(window: &Window, ev: InstallEvt) -> Result<(), String> {
  window.emit("arknet://install_progress", ev).map_err(|e| e.to_string())
}

fn is_writable(dir: &Path) -> bool {
  let test = dir.join(".arknet_write_test.tmp");
  match std::fs::OpenOptions::new().create_new(true).write(true).open(&test) {
    Ok(_) => { let _ = std::fs::remove_file(test); true }
    Err(_) => false,
  }
}

#[cfg(unix)]
fn mark_executable(p: &Path) -> io::Result<()> {
  use std::os::unix::fs::PermissionsExt;
  let mut perm = fs::metadata(p)?.permissions();
  perm.set_mode(0o755);
  fs::set_permissions(p, perm)
}
#[cfg(windows)]
fn mark_executable(_p: &Path) -> io::Result<()> { Ok(()) }

#[inline]
fn exe(name: &str) -> String {
  #[cfg(windows)]
  { format!("{name}.exe") }
  #[cfg(not(windows))]
  { name.to_string() }
}

// Accept common folder aliases: windows | linux | darwin/macos
fn platform_dirs() -> &'static [&'static str] {
  #[cfg(windows)]
  { &["windows"] }
  #[cfg(target_os = "macos")]
  { &["darwin", "macos"] }
  #[cfg(all(unix, not(target_os = "macos")))]
  { &["linux"] }
}

/// Resource/bin/<platform>
fn resolve_resource_bin_dir(app: &AppHandle) -> Option<PathBuf> {
  if let Ok(ovr) = std::env::var("ARKDESK_BIN_DIR") {
    let p = PathBuf::from(ovr);
    if p.is_dir() { return Some(p); }
  }
  for &plat in platform_dirs() {
    let rel = format!("bin/{plat}");
    if let Ok(p) = app.path().resolve(&rel, BaseDirectory::Resource) {
      if p.exists() { return Some(p); }
    }
  }
  #[cfg(debug_assertions)]
  {
    let base = PathBuf::from(env!("CARGO_MANIFEST_DIR"));
    for &plat in platform_dirs() {
      for up in [0,1,2] {
        let mut b = base.clone();
        for _ in 0..up { b = b.join(".."); }
        let cand = b.join("resources").join("bin").join(plat);
        if cand.exists() { return Some(cand); }
      }
    }
  }
  None
}

/// Resource/wheels (flat or nested)
fn resolve_resource_wheels_dir(app: &AppHandle) -> Option<PathBuf> {
  if let Ok(p) = app.path().resolve("wheels", BaseDirectory::Resource) {
    if p.exists() { return Some(p); }
  }
  #[cfg(debug_assertions)]
  {
    let base = PathBuf::from(env!("CARGO_MANIFEST_DIR"));
    for up in [0,1,2] {
      let mut b = base.clone();
      for _ in 0..up { b = b.join(".."); }
      let cand = b.join("resources").join("wheels");
      if cand.exists() { return Some(cand); }
    }
  }
  None
}

fn required_bins() -> &'static [&'static str] {
  &["arkd", "cli", "call", "cc", "tests"]
}

#[cfg(windows)]
fn shared_exts() -> &'static [&'static str] { &[".dll"] }
#[cfg(target_os = "macos")]
fn shared_exts() -> &'static [&'static str] { &[".dylib"] }
#[cfg(all(unix, not(target_os = "macos")))]
fn shared_exts() -> &'static [&'static str] { &[".so"] }

fn has_ext(p: &Path, exts: &[&str]) -> bool {
  p.extension()
    .and_then(OsStr::to_str)
    .map(|e| exts.iter().any(|x| e.eq_ignore_ascii_case(x.trim_start_matches('.'))))
    .unwrap_or(false)
}

fn copy_file(src: &Path, dst: &Path) -> io::Result<()> {
  if let Some(parent) = dst.parent() { fs::create_dir_all(parent)?; }
  fs::copy(src, dst)?;
  mark_executable(dst)?;
  Ok(())
}

fn copy_bin_payload(src_bin: &Path, dest_bin: &Path) -> Result<(), String> {
  fs::create_dir_all(dest_bin).map_err(|e| e.to_string())?;
  // 1) required executables
  for name in required_bins() {
    let s = src_bin.join(exe(name));
    let d = dest_bin.join(exe(name));
    copy_file(&s, &d).map_err(|e| format!("copy {} failed: {}", s.display(), e))?;
  }
  // 2) co-located shared libs (.dll/.so/.dylib) and helper exes
  let exts = shared_exts();
  for entry in fs::read_dir(src_bin).map_err(|e| e.to_string())? {
    let entry = entry.map_err(|e| e.to_string())?;
    let p = entry.path();
    if p.is_file() {
      let fname = p.file_name().and_then(OsStr::to_str).unwrap_or_default();
      let is_required = required_bins().iter().any(|n| fname.eq_ignore_ascii_case(&exe(n)));
      if is_required { continue }
      if has_ext(&p, exts) || fname.ends_with(".exe") {
        let d = dest_bin.join(fname);
        copy_file(&p, &d).map_err(|e| format!("copy {} failed: {}", p.display(), e))?;
      }
    }
  }
  Ok(())
}

// ---------- Python venv bootstrap ----------
#[cfg(windows)]
fn py_in_venv(venv: &Path) -> PathBuf { venv.join("Scripts").join("python.exe") }
#[cfg(not(windows))]
fn py_in_venv(venv: &Path) -> PathBuf { venv.join("bin").join("python") }

fn try_cmd_ok(cmd: &str, args: &[&str]) -> bool {
  Command::new(cmd).args(args).status().map(|s| s.success()).unwrap_or(false)
}

fn find_system_python() -> Option<(String, Vec<String>)> {
  if let Ok(ovr) = env::var("ARKDESK_PY") {
    if try_cmd_ok(&ovr, &["-c","import sys;assert sys.version_info[:2]>=(3,9)"]) {
      return Some((ovr, vec![]));
    }
  }
  let cands: &[(&str, &[&str])] = &[
    ("py", &["-3"]),
    ("python3", &[]),
    ("python", &[]),
  ];
  for (cmd, base) in cands {
    let mut args: Vec<&str> = base.to_vec();
    args.extend(["-c","import sys;assert sys.version_info[:2]>=(3,9)"]);
    if try_cmd_ok(cmd, &args) {
      let base_vec: Vec<String> = base.iter().map(|s| s.to_string()).collect();
      return Some((cmd.to_string(), base_vec));
    }
  }
  None
}

fn ensure_pyenv(app: &AppHandle, window: &Window) -> Result<PathBuf, String> {
  let home = ark_home();
  let venv = home.join("pyenv");
  let py = py_in_venv(&venv);
  if py.exists() { return Ok(py); }

  emit(window, InstallEvt{ step: 5, total: 10, label: "Creating Python venv".into(), done: false, ok: true })?;
  let (sys_py, mut base_args) = find_system_python().ok_or_else(|| "Python 3.9+ not found on PATH".to_string())?;
  base_args.push("-m".to_string());
  base_args.push("venv".to_string());
  base_args.push(venv.to_string_lossy().to_string());
  let ok = Command::new(&sys_py).args(&base_args).status().map(|s| s.success()).unwrap_or(false);
  if !ok { return Err("venv create failed".into()); }

  emit(window, InstallEvt{ step: 6, total: 10, label: "Bootstrapping pip".into(), done: false, ok: true })?;
  let ok = Command::new(&py).args(["-m","pip","install","-U","pip","setuptools","wheel"]).status().map(|s| s.success()).unwrap_or(false);
  if !ok { return Err("pip bootstrap failed".into()); }

  let wheels = resolve_resource_wheels_dir(app).ok_or_else(|| "resources/wheels missing".to_string())?;
  let lock = app.path().resolve("bootstrap/requirements.lock.txt", BaseDirectory::Resource).ok();
  let lock_present = lock.as_ref().map(|p| p.exists()).unwrap_or(false);

  emit(window, InstallEvt{ step: 7, total: 10, label: "Installing ArkPy (offline)".into(), done: false, ok: true })?;
  let status = if lock_present {
    let lock_path = lock.unwrap();
    Command::new(&py)
      .args(["-m","pip","install","--no-index","--find-links"])
      .arg(&wheels)
      .args(["-r", lock_path.to_string_lossy().as_ref()])
      .status()
  } else {
    Command::new(&py)
      .args(["-m","pip","install","--no-index","--find-links"])
      .arg(&wheels)
      .arg("arknet-py")
      .status()
  };
  if !status.map(|s| s.success()).unwrap_or(false) {
    return Err("ArkPy wheel install failed".into());
  }
  Ok(py)
}

#[cfg(windows)]
fn prepend_to_path(dir: &Path) {
  let cur = env::var_os("PATH").unwrap_or_default();
  let mut newp = dir.as_os_str().to_os_string();
  newp.push(";");
  newp.push(cur);
  env::set_var("PATH", newp);
}

// ---------- Commands ----------
#[tauri::command]
pub fn install_preflight(app: AppHandle) -> Result<Preflight, String> {
  let home = ark_home();
  let parent: PathBuf = home.parent().unwrap_or_else(|| Path::new("")).to_path_buf();

  let parent_exists = parent.exists();
  let parent_writable = parent_exists && is_writable(&parent);
  let free_bytes = if parent_exists { fs2::available_space(&parent).unwrap_or(0) } else { 0 };
  let need_bytes: u64 = 400 * 1024 * 1024; // venv + bins

  let mut spurious = Vec::new();
  if let Ok(cwd) = std::env::current_dir() {
    #[cfg(target_os = "windows")]
    {
      let p = cwd.join("Arknet");
      if p.exists() { spurious.push(p.to_string_lossy().to_string()); }
    }
    #[cfg(not(target_os = "windows"))]
    {
      let p = cwd.join(".arknet");
      if p.exists() { spurious.push(p.to_string_lossy().to_string()); }
    }
  }

  // binaries in app bundle
  let mut missing_bins = Vec::new();
  let bin_dir_opt = resolve_resource_bin_dir(&app);
  if let Some(bin_dir) = &bin_dir_opt {
    for &name in required_bins() {
      if !bin_dir.join(exe(name)).exists() {
        missing_bins.push(exe(name));
      }
    }
  } else {
    missing_bins = required_bins().iter().map(|n| exe(n)).collect();
  }
  let bins_ok = missing_bins.is_empty();

  // wheels in app bundle
  let mut missing_wheels = Vec::new();
  if let Some(wd) = resolve_resource_wheels_dir(&app) {
    let ok = fs::read_dir(&wd).map(|it| {
      it.filter_map(|e| e.ok())
        .any(|e| e.file_name().to_string_lossy().to_lowercase().starts_with("arknet_py-") ||
                 e.file_name().to_string_lossy().to_lowercase().starts_with("arknet-py-"))
    }).unwrap_or(false);
    if !ok { missing_wheels.push("arknet-py*.whl".into()) }
  } else {
    missing_wheels.push("resources/wheels".into());
  }
  let wheels_ok = missing_wheels.is_empty();

  // DLL sanity (Windows): require at least one .dll in bundle AND try launching arkd with PATH=bin
  let (missing_dlls, dlls_ok) = {
    #[cfg(windows)]
    {
      let mut md = Vec::<String>::new();
      let mut ok = true;
      if let Some(bin_dir) = &bin_dir_opt {
        let dlls: Vec<_> = fs::read_dir(bin_dir).ok()
          .into_iter().flatten()
          .filter_map(|e| e.ok())
          .map(|e| e.path())
          .filter(|p| p.is_file() && p.extension().and_then(|s| s.to_str()).map(|e| e.eq_ignore_ascii_case("dll")).unwrap_or(false))
          .collect();
        if dlls.is_empty() {
          ok = false;
          md.push("*.dll".to_string());
        }
        // loader check
        let arkd = bin_dir.join(exe("arkd"));
        if arkd.is_file() {
          // PATH = <bundle bin>;<existing>
          let mut path_env = bin_dir.as_os_str().to_os_string();
          path_env.push(";");
          path_env.push(env::var_os("PATH").unwrap_or_default());
          match Command::new(&arkd)
            .current_dir(bin_dir)
            .env("PATH", path_env)
            .arg("--version")
            .output()
          {
            Ok(o) if o.status.success() => {},
            _ => { ok = false; md.push("DLL loader check failed for arkd.exe".to_string()); }
          }
        }
      } else {
        ok = false;
        md.push("bin/<platform> missing".to_string());
      }
      (md, ok)
    }
    #[cfg(not(windows))]
    { (Vec::new(), true) }
  };

  let ok = parent_exists && parent_writable && free_bytes >= need_bytes && bins_ok && wheels_ok && dlls_ok;

  Ok(Preflight {
    home: home.to_string_lossy().to_string(),
    parent: parent.to_string_lossy().to_string(),
    parent_exists,
    parent_writable,
    free_bytes,
    need_bytes,
    spurious,
    missing_bins,
    bins_ok,
    missing_wheels,
    wheels_ok,
    missing_dlls,
    dlls_ok,
    ok,
  })
}

#[tauri::command]
pub fn install_arknet_progress(window: Window) -> Result<(), String> {
  let app = window.app_handle();
  let pf = install_preflight(app.clone())?;
  if !pf.bins_ok {
    return Err(format!("Missing binaries in app resources (bin/<platform>): {}", pf.missing_bins.join(", ")));
  }
  if !pf.wheels_ok {
    return Err(format!("Missing wheels: {}", pf.missing_wheels.join(", ")));
  }
  if !pf.dlls_ok {
    return Err(format!("Windows DLL check failed: {}", if pf.missing_dlls.is_empty() { "(unknown)".into() } else { pf.missing_dlls.join(", ") }));
  }
  if !(pf.parent_exists && pf.parent_writable && pf.free_bytes >= pf.need_bytes) {
    return Err("Preflight failed: parent not writable and/or insufficient free space.".into());
  }

  let total = 10u8;
  let home = ark_home();
  let dest_bin = home.join("bin");

  emit(&window, InstallEvt { step: 0, total, label: "Preparing directories".into(), done: false, ok: true })?;
  fs::create_dir_all(&dest_bin).map_err(|e| e.to_string())?;
  fs::create_dir_all(home.join("data")).map_err(|e| e.to_string())?;
  fs::create_dir_all(home.join("logs")).map_err(|e| e.to_string())?;

  emit(&window, InstallEvt { step: 1, total, label: "Locating bundled binaries".into(), done: false, ok: true })?;
  let Some(src_bin) = resolve_resource_bin_dir(&window.app_handle()) else {
    return Err("Bundled binaries not found.".into());
  };

  emit(&window, InstallEvt { step: 2, total, label: "Copying binaries and DLLs".into(), done: false, ok: true })?;
  copy_bin_payload(&src_bin, &dest_bin)?;

  #[cfg(windows)]
  {
    prepend_to_path(&dest_bin);
    emit(&window, InstallEvt { step: 3, total, label: "PATH updated for DLL resolution".into(), done: false, ok: true })?;
  }

  emit(&window, InstallEvt { step: 4, total, label: "Writing config.json".into(), done: false, ok: true })?;
  if !home.join("config.json").is_file() {
    save_settings_cmd(Settings::default()).map_err(|e| e)?;
  }

  emit(&window, InstallEvt { step: 5, total, label: "Preparing Python runtime".into(), done: false, ok: true })?;
  let _py = ensure_pyenv(&app, &window)?;

  emit(&window, InstallEvt { step: total, total, label: "Done".into(), done: true, ok: true })?;
  Ok(())
}

#[tauri::command]
pub fn install_selftest(window: Window) -> Result<serde_json::Value, String> {
  let app = window.app_handle();
  let home = ark_home();
  let bin_dir = home.join("bin");
  let arkd = bin_dir.join(exe("arkd"));
  let py = ensure_pyenv(&app, &window)?;

  #[cfg(windows)]
  prepend_to_path(&bin_dir);

  let ark_out = Command::new(&arkd)
    .arg("--version")
    .output()
    .map_err(|e| format!("arkd launch failed: {e}"))?;
  let ark_ok = ark_out.status.success();

  let code = "import importlib.metadata as m, arknet_py; print(m.version('arknet-py'))";
  let py_out = Command::new(&py)
    .args(["-c", code])
    .output()
    .map_err(|e| format!("python import failed: {e}"))?;
  let arkpy_ok = py_out.status.success();
  let arkpy_ver = if arkpy_ok {
    String::from_utf8_lossy(&py_out.stdout).trim().to_string()
  } else { String::new() };

  Ok(serde_json::json!({
    "binPath": bin_dir.to_string_lossy(),
    "arkdOk": ark_ok,
    "arkdStdout": String::from_utf8_lossy(&ark_out.stdout),
    "arkdStderr": String::from_utf8_lossy(&ark_out.stderr),
    "python": py.to_string_lossy(),
    "arkpyOk": arkpy_ok,
    "arkpyVersion": arkpy_ver
  }))
}

#[tauri::command]
pub fn reveal_ark_home() -> Result<(), String> {
  let p = ark_home();
  if !p.exists() { return Err("Arknet home does not exist".into()); }
  #[cfg(target_os = "windows")]
  { std::process::Command::new("explorer").arg(p).spawn().map_err(|e| e.to_string())?; }
  #[cfg(target_os = "macos")]
  { std::process::Command::new("open").arg(p).spawn().map_err(|e| e.to_string())?; }
  #[cfg(all(unix, not(target_os = "macos")))]
  { std::process::Command::new("xdg-open").arg(p).spawn().map_err(|e| e.to_string())?; }
  Ok(())
}
