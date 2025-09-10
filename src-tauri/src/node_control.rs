// src/node_control.rs
use parking_lot::Mutex;
use serde::Serialize;
use std::{
  collections::HashMap,
  env,
  fs,
  io::{Read, Seek, SeekFrom},
  path::{Path, PathBuf},
  process::Stdio,
  sync::Arc,
  time::{SystemTime, UNIX_EPOCH},
};
use tauri::{AppHandle, Emitter, Manager, State};
use tauri::path::BaseDirectory;
use tokio::{
  io::{AsyncBufReadExt, BufReader},
  process::{Child, Command},
  sync::mpsc,
  time::{timeout, Duration, sleep},
};
use crate::settings::ark_home;

const EVT_LOG: &str = "node://log";
const EVT_STATUS: &str = "node://status";
const LOG_TAIL_MAX: usize = 2000;

#[derive(Default)]
pub struct NodeProc { inner: Arc<Mutex<Inner>> }

#[derive(Default)]
struct Inner {
  child: Option<Child>,
  tail: Vec<String>,
}

#[derive(Serialize)]
struct LogEvt {
  ts_ms: u64,
  stream: &'static str,
  line: String,
}

#[derive(Serialize)]
struct StatusEvt {
  kind: &'static str,
  msg: String,
  pid: Option<u32>,
  exe: Option<String>,
}

impl NodeProc {
  pub fn new() -> Self { Self::default() }
  fn take_child(&self) -> Option<Child> { self.inner.lock().child.take() }
  fn set_child(&self, child: Child) { self.inner.lock().child = Some(child); }
  pub fn clear_logs(&self) { self.inner.lock().tail.clear(); }
  pub fn tail(&self, n: usize) -> Vec<String> {
    let g = self.inner.lock(); let len = g.tail.len(); let start = len.saturating_sub(n); g.tail[start..].to_vec()
  }
  pub fn is_running(&self) -> bool {
    let mut remove_dead = false;
    let running = {
      let mut g = self.inner.lock();
      if let Some(child) = g.child.as_mut() {
        match child.try_wait() {
          Ok(Some(_)) => { remove_dead = true; false }
          Ok(None)    => true,
          Err(_)      => { remove_dead = true; false }
        }
      } else { false }
    };
    if remove_dead { self.inner.lock().child = None; }
    running
  }
  pub fn pid(&self) -> Option<u32> { self.inner.lock().child.as_ref().and_then(|c| c.id()) }
}

/* ───────────────── helpers ───────────────── */

#[cfg(unix)]
fn is_exe(p: &Path) -> bool {
  use std::os::unix::fs::PermissionsExt;
  p.is_file() && p.metadata().ok().map(|m| m.permissions().mode() & 0o111 != 0).unwrap_or(false)
}
#[cfg(windows)]
fn is_exe(p: &Path) -> bool { p.is_file() }

#[inline]
fn exe(name: &str) -> String {
  #[cfg(windows)] { format!("{name}.exe") }
  #[cfg(not(windows))] { name.to_string() }
}

fn platform_dirs() -> &'static [&'static str] {
  #[cfg(windows)] { &["windows"] }
  #[cfg(target_os = "macos")] { &["darwin", "macos"] }
  #[cfg(all(unix, not(target_os = "macos")))] { &["linux"] }
}

#[inline]
fn now_ms() -> u64 {
  SystemTime::now().duration_since(UNIX_EPOCH).unwrap_or_default().as_millis() as u64
}

fn emit_status(app: &AppHandle, kind: &'static str, msg: String, pid: Option<u32>, exe: Option<String>) {
  let _ = app.emit(EVT_STATUS, &StatusEvt { kind, msg, pid, exe });
}

fn push_and_emit(proc_arc: &Arc<Mutex<Inner>>, app: &AppHandle, stream: &'static str, line: String) {
  let ts = now_ms();
  let decorated = format!("[{ts}][{stream}] {line}");
  {
    let mut g = proc_arc.lock();
    g.tail.push(decorated);
    if g.tail.len() > LOG_TAIL_MAX {
      let excess = g.tail.len() - LOG_TAIL_MAX;
      g.tail.drain(0..excess);
    }
  }
  let _ = app.emit(EVT_LOG, &LogEvt { ts_ms: ts, stream, line });
}

/* ───────────────── arkd resolution ───────────────── */

fn resolve_arkd_path(app: Option<&AppHandle>) -> Option<PathBuf> {
  let arkd = exe("arkd");

  if let Ok(p) = env::var("ARK_ARKD") {
    let p = PathBuf::from(p);
    if is_exe(&p) { return Some(p); }
  }
  if let Ok(home) = env::var("ARK_HOME") {
    let p = PathBuf::from(home).join("bin").join(&arkd);
    if is_exe(&p) { return Some(p); }
  }
  let p = ark_home().join("bin").join(&arkd);
  if is_exe(&p) { return Some(p); }

  if let Some(app) = app {
    for &plat in platform_dirs() {
      let rel = format!("bin/{plat}");
      if let Ok(dir) = app.path().resolve(&rel, BaseDirectory::Resource) {
        let p = dir.join(&arkd);
        if is_exe(&p) { return Some(p); }
      }
    }
  }

  #[cfg(debug_assertions)]
  {
    let base = PathBuf::from(env!("CARGO_MANIFEST_DIR"));
    for &plat in platform_dirs() {
      let c1 = base.join("resources/bin").join(plat).join(&arkd);
      if is_exe(&c1) { return Some(c1); }
      let c2 = base.join("../resources/bin").join(plat).join(&arkd);
      if is_exe(&c2) { return Some(c2); }
    }
  }

  for rel in [arkd.as_str(), &format!("bin/{arkd}")].iter() {
    let p = PathBuf::from(rel);
    if is_exe(&p) { return Some(p); }
  }

  if let Ok(path) = env::var("PATH") {
    for dir in env::split_paths(&path) {
      let p = dir.join(&arkd);
      if is_exe(&p) { return Some(p); }
      #[cfg(windows)]
      if let Ok(pathext) = env::var("PATHEXT") {
        for ext in pathext.split(';') {
          let ext = ext.trim_matches('.');
          if ext.is_empty() { continue; }
          let p2 = dir.join(format!("arkd.{ext}"));
          if is_exe(&p2) { return Some(p2); }
        }
      }
    }
  }
  None
}

/* ───────────────── file tailer (logs dir) ───────────────── */

fn spawn_file_tailer(proc_arc: Arc<Mutex<Inner>>, app: AppHandle, logs_dir: PathBuf) {
  tauri::async_runtime::spawn(async move {
    let mut offsets: HashMap<PathBuf, u64> = HashMap::new();
    loop {
      // stop when process handle is gone
      if proc_arc.lock().child.is_none() { break; }

      if let Ok(rd) = fs::read_dir(&logs_dir) {
        for entry in rd.flatten() {
          let path = entry.path();
          if !path.is_file() { continue; }
          let fname = path.file_name().and_then(|s| s.to_str()).unwrap_or("");
          if !(fname.ends_with(".log") || fname.eq_ignore_ascii_case("arkd.out") || fname.eq_ignore_ascii_case("arkd.log")) {
            continue;
          }

          if let Ok(meta) = fs::metadata(&path) {
            let len = meta.len();
            let start = offsets.get(&path).copied().unwrap_or_else(|| len.saturating_sub(64 * 1024));
            if len >= start {
              if let Ok(mut f) = fs::File::open(&path) {
                let _ = f.seek(SeekFrom::Start(start));
                let mut buf = Vec::with_capacity((len - start).min(1_000_000) as usize);
                if f.read_to_end(&mut buf).is_ok() {
                  offsets.insert(path.clone(), len);
                  let text = String::from_utf8_lossy(&buf);
                  for line in text.split(|c| c == '\n' || c == '\r').filter(|l| !l.is_empty()) {
                    push_and_emit(&proc_arc, &app, "file", format!("{fname}: {line}"));
                  }
                }
              }
            } else {
              offsets.insert(path.clone(), len);
            }
          }
        }
      }

      sleep(Duration::from_millis(700)).await;
    }
  });
}

/* ───────────────── I/O readers ───────────────── */

fn spawn_reader<R: tokio::io::AsyncRead + Unpin + Send + 'static>(
  mut reader: R, tag: &'static str, proc_arc: Arc<Mutex<Inner>>, app: AppHandle,
) {
  tauri::async_runtime::spawn(async move {
    let mut lines = BufReader::new(&mut reader).lines();
    while let Ok(Some(line)) = lines.next_line().await {
      push_and_emit(&proc_arc, &app, tag, line);
    }
  });
}

/* ───────────────── start/stop impl ───────────────── */

async fn start_impl(app: AppHandle, proc: &NodeProc, args: Option<Vec<String>>) -> Result<(), String> {
  if proc.is_running() { return Ok(()); }

  emit_status(&app, "starting", "starting arkd".into(), None, None);
  push_and_emit(&proc.inner, &app, "sys", "starting arkd".to_string());

  let exe_path = match resolve_arkd_path(Some(&app)) {
    Some(p) => p,
    None => {
      let msg = "arkd not found. Run installer or set ARK_ARKD/ARK_HOME, or ensure it’s on PATH.".to_string();
      emit_status(&app, "error", msg.clone(), None, None);
      push_and_emit(&proc.inner, &app, "sys", msg.clone());
      return Err(msg);
    }
  };

  let mut cmd = Command::new(&exe_path);
  if let Some(a) = args.as_ref() { cmd.args(a); }
  cmd.current_dir(ark_home()).stdin(Stdio::null()).stdout(Stdio::piped()).stderr(Stdio::piped());

  let mut child = cmd.spawn().map_err(|e| {
    let msg = format!("spawn arkd failed: {e}");
    emit_status(&app, "error", msg.clone(), None, Some(exe_path.to_string_lossy().to_string()));
    push_and_emit(&proc.inner, &app, "sys", msg.clone());
    msg
  })?;

  let pid = child.id();
  let exe_s = exe_path.to_string_lossy().to_string();
  emit_status(&app, "started", format!("arkd spawned pid={:?}", pid), pid, Some(exe_s.clone()));
  push_and_emit(&proc.inner, &app, "sys", format!("exec={} args={}", exe_s, args.unwrap_or_default().join(" ")));

  let stdout = child.stdout.take();
  let stderr = child.stderr.take();

  let proc_arc = proc.inner.clone();
  proc.set_child(child);

  let (tx, mut rx) = mpsc::unbounded_channel::<(&'static str, String)>();
  if let Some(out) = stdout {
    let txo = tx.clone();
    tauri::async_runtime::spawn(async move {
      let mut lines = BufReader::new(out).lines();
      while let Ok(Some(line)) = lines.next_line().await { let _ = txo.send(("stdout", line)); }
    });
  }
  if let Some(err) = stderr {
    tauri::async_runtime::spawn(async move {
      let mut lines = BufReader::new(err).lines();
      while let Ok(Some(line)) = lines.next_line().await { let _ = tx.send(("stderr", line)); }
    });
  }

  let app_clone = app.clone();
  tauri::async_runtime::spawn(async move {
    while let Some((stream, line)) = rx.recv().await {
      push_and_emit(&proc_arc, &app_clone, stream, line);
    }
  });

  // tail files from logs dir as fallback
  let logs_dir = ark_home().join("logs");
  if logs_dir.is_dir() {
    spawn_file_tailer(proc.inner.clone(), app.clone(), logs_dir);
  }

  Ok(())
}

async fn stop_impl(proc: &NodeProc, app: Option<&AppHandle>) -> Result<(), String> {
  if let Some(mut child) = proc.take_child() {
    let pid = child.id();
    let _ = child.kill();
    let _ = timeout(Duration::from_secs(3), child.wait()).await;
    if let Some(app) = app {
      emit_status(app, "stopped", format!("arkd stopped pid={:?}", pid), pid, None);
      push_and_emit(&proc.inner, app, "sys", format!("stopped pid={:?}", pid));
    }
  }
  Ok(())
}

/* ───────────────── tauri commands ───────────────── */

#[tauri::command]
pub fn node_is_running(proc: State<'_, NodeProc>) -> bool { proc.is_running() }

#[tauri::command]
pub fn node_pid(proc: State<'_, NodeProc>) -> Option<u32> { proc.pid() }

#[tauri::command]
pub fn node_exec_path(app: AppHandle) -> Option<String> {
  resolve_arkd_path(Some(&app)).and_then(|p| p.canonicalize().ok()).map(|p| p.to_string_lossy().to_string())
}

#[tauri::command]
pub fn node_log_tail(proc: State<'_, NodeProc>, n: Option<usize>) -> Vec<String> { proc.tail(n.unwrap_or(200)) }

#[tauri::command]
pub fn node_log_clear(proc: State<'_, NodeProc>) { proc.clear_logs(); }

#[derive(Serialize)]
pub struct StartOk { started: bool }

#[tauri::command]
pub async fn node_start(app: AppHandle, proc: State<'_, NodeProc>, args: Option<Vec<String>>) -> Result<StartOk, String> {
  start_impl(app.clone(), &proc, args).await?;
  Ok(StartOk { started: true })
}

#[tauri::command]
pub async fn node_stop(app: AppHandle, proc: State<'_, NodeProc>) -> Result<(), String> {
  stop_impl(&proc, Some(&app)).await
}

#[tauri::command]
pub async fn node_restart(app: AppHandle, proc: State<'_, NodeProc>) -> Result<(), String> {
  stop_impl(&proc, Some(&app)).await?;
  start_impl(app, &proc, None).await
}
