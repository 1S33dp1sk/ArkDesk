// src/node_control.rs
use parking_lot::Mutex;
use serde::Serialize;
use std::{
  collections::HashMap,
  env, fs,
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
  #[cfg(unix)]
  pgid: Option<i32>,
}

#[derive(Serialize)]
struct LogEvt { ts_ms: u64, stream: &'static str, line: String }

#[derive(Serialize)]
struct StatusEvt { kind: &'static str, msg: String, pid: Option<u32>, exe: Option<String> }

/* ───────────────── utilities ───────────────── */

#[inline]
fn now_ms() -> u64 {
  SystemTime::now()
    .duration_since(UNIX_EPOCH)
    .unwrap_or_default()
    .as_millis() as u64
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

/* ───────────────── platform helpers ───────────────── */

#[cfg(unix)]
#[inline]
fn is_exe(p: &Path) -> bool {
  use std::os::unix::fs::PermissionsExt;
  p.is_file() && p.metadata().ok().map(|m| m.permissions().mode() & 0o111 != 0).unwrap_or(false)
}
#[cfg(windows)]
#[inline]
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
      if proc_arc.lock().child.is_none() { break; }

      if let Ok(rd) = fs::read_dir(&logs_dir) {
        for entry in rd.flatten() {
          let path = entry.path();
          if !path.is_file() { continue; }
          let fname = path.file_name().and_then(|s| s.to_str()).unwrap_or("");
          if !(fname.ends_with(".log") || fname.eq_ignore_ascii_case("arkd.out") || fname.eq_ignore_ascii_case("arkd.log")) { continue; }

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

/* ───────────────── start/stop impl ───────────────── */

async fn start_impl(app: AppHandle, proc: &NodeProc, args: Option<Vec<String>>) -> Result<(), String> {
  if proc.inner.lock().child.is_some() { return Ok(()); }

  emit_status(&app, "starting", "starting arkd".into(), None, None);
  push_and_emit(&proc.inner, &app, "sys", "starting arkd".to_string());

  let exe_path = resolve_arkd_path(Some(&app)).ok_or_else(|| {
    let msg = "arkd not found. Run installer or set ARK_ARKD/ARK_HOME, or ensure it’s on PATH.".to_string();
    emit_status(&app, "error", msg.clone(), None, None);
    push_and_emit(&proc.inner, &app, "sys", msg.clone());
    msg
  })?;

  #[cfg(windows)]
  let mut child = {
    use std::process::Command as StdCommand;
    use std::os::windows::process::CommandExt;
    const CREATE_NEW_PROCESS_GROUP: u32 = 0x0000_0200;

    let mut scmd = StdCommand::new(&exe_path);
    if let Some(a) = args.as_ref() { scmd.args(a); }
    scmd.current_dir(ark_home())
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .creation_flags(CREATE_NEW_PROCESS_GROUP);

    let mut cmd = Command::from(scmd);
    cmd.spawn().map_err(|e| format!("spawn arkd failed: {e}"))?
  };

  #[cfg(not(windows))]
  let mut child = {
    let mut cmd = Command::new(&exe_path);
    if let Some(a) = args.as_ref() { cmd.args(a); }
    cmd.current_dir(ark_home())
       .stdin(Stdio::null())
       .stdout(Stdio::piped())
       .stderr(Stdio::piped());

    #[cfg(unix)]
    {
      use std::os::unix::process::CommandExt;
      unsafe {
        cmd.pre_exec(|| {
          if libc::setsid() == -1 { return Err(std::io::Error::last_os_error()); }
          Ok(())
        });
      }
    }
    cmd.spawn().map_err(|e| format!("spawn arkd failed: {e}"))?
  };

  let pid = child.id();
  let exe_s = exe_path.to_string_lossy().to_string();
  emit_status(&app, "started", format!("arkd spawned pid={:?}", pid), pid, Some(exe_s.clone()));
  push_and_emit(&proc.inner, &app, "sys", format!("exec={} args={}", exe_s, args.unwrap_or_default().join(" ")));

  let stdout = child.stdout.take();
  let stderr = child.stderr.take();

  let proc_arc = proc.inner.clone();
  {
    let mut g = proc_arc.lock();
    #[cfg(unix)] { g.pgid = pid.map(|p| p as i32); }
    g.child = Some(child);
  }

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

  let logs_dir = ark_home().join("logs");
  if logs_dir.is_dir() {
    spawn_file_tailer(proc.inner.clone(), app.clone(), logs_dir);
  }

  Ok(())
}

#[cfg(unix)]
fn kill_pgroup(pgid: i32, sig: i32) -> std::io::Result<()> {
  let r = unsafe { libc::kill(-pgid, sig) };
  if r == 0 { Ok(()) } else {
    let e = std::io::Error::last_os_error();
    if e.raw_os_error() == Some(libc::ESRCH) { Ok(()) } else { Err(e) }
  }
}

#[cfg(windows)]
async fn kill_tree_windows(pid: u32) {
  let _ = Command::new("taskkill")
    .args(["/PID", &pid.to_string(), "/T", "/F"])
    .stdin(Stdio::null())
    .stdout(Stdio::null())
    .stderr(Stdio::null())
    .status()
    .await;
}

async fn stop_impl(proc: &NodeProc, app: Option<&AppHandle>) -> Result<(), String> {
  #[cfg(unix)]
  let (mut child, pid, pgid_opt) = {
    let mut g = proc.inner.lock();
    match (g.child.take(), g.pgid.take()) {
      (Some(c), pg) => {
        let pid = c.id();
        (c, pid, pg)
      }
      (None, _) => return Ok(()),
    }
  };

  #[cfg(windows)]
  let (mut child, pid_opt) = {
    let mut g = proc.inner.lock();
    match g.child.take() {
      Some(c) => {
        let pid = c.id();
        (c, pid)
      }
      None => return Ok(()),
    }
  };

  #[cfg(unix)]
  {
    if let Some(pgid) = pgid_opt {
      let _ = kill_pgroup(pgid, libc::SIGTERM);
      let waited = timeout(Duration::from_secs(3), child.wait()).await.is_ok();
      if !waited {
        let _ = kill_pgroup(pgid, libc::SIGKILL);
        let _ = timeout(Duration::from_secs(2), child.wait()).await;
      }
    } else {
      let _ = child.kill().await;
      let _ = timeout(Duration::from_secs(2), child.wait()).await;
    }
  }

  #[cfg(windows)]
  {
    if let Some(pid) = pid_opt {
      kill_tree_windows(pid).await;
    }
    let _ = timeout(Duration::from_secs(2), child.wait()).await;
  }

  #[cfg(unix)]
  let pid_for_evt = pid;

  #[cfg(windows)]
  let pid_for_evt = pid_opt;

  if let Some(app) = app {
    emit_status(app, "stopped", format!("arkd stopped pid={pid_for_evt:?}"), pid_for_evt, None);
    push_and_emit(&proc.inner, app, "sys", format!("stopped pid={pid_for_evt:?}"));
  }
  Ok(())
}

/* ───────────────── external probe (port / process name) ───────────────── */

fn rpc_ports_to_probe() -> Vec<u16> {
  if let Ok(v) = env::var("ARK_RPC_PORT") {
    if let Ok(p) = v.parse::<u16>() { return vec![p]; }
  }
  vec![8645] // default
}

async fn run_cmd_with_timeout(mut cmd: Command, ms: u64) -> Option<String> {
  match timeout(Duration::from_millis(ms), cmd.output()).await.ok()? {
    Ok(out) if out.status.success() => {
      Some(String::from_utf8_lossy(&out.stdout).to_string())
    }
    _ => None,
  }
}

#[cfg(windows)]
async fn pid_listening_on(port: u16) -> Option<u32> {
  let mut cmd = Command::new("cmd");
  cmd.args(["/C", "netstat -ano -p tcp"]);
  let out = run_cmd_with_timeout(cmd, 1200).await?;
  for line in out.lines() {
    if line.contains(&format!(":{port}")) && line.to_ascii_lowercase().contains("listen") {
      if let Some(pid_str) = line.split_whitespace().last() {
        if let Ok(pid) = pid_str.parse::<u32>() { return Some(pid); }
      }
    }
  }
  None
}

#[cfg(all(unix, not(target_os = "macos")))]
async fn pid_listening_on(port: u16) -> Option<u32> {
  // Prefer ss; fallback to lsof.
  let mut cmd = Command::new("sh");
  cmd.args(["-lc", &format!("command -v ss >/dev/null 2>&1 && ss -ltnp 'sport = :{port}' || true")]);
  if let Some(out) = run_cmd_with_timeout(cmd, 1200).await {
    for line in out.lines() {
      if let Some(p) = line.find("pid=") {
        let rest = &line[p + 4..];
        let id: String = rest.chars().take_while(|c| c.is_ascii_digit()).collect();
        if let Ok(pid) = id.parse::<u32>() { return Some(pid); }
      }
    }
  }
  let mut cmd2 = Command::new("sh");
  cmd2.args(["-lc", &format!("lsof -nP -iTCP:{port} -sTCP:LISTEN -t 2>/dev/null")]);
  if let Some(out) = run_cmd_with_timeout(cmd2, 1200).await {
    for line in out.lines() {
      if let Ok(pid) = line.trim().parse::<u32>() { return Some(pid); }
    }
  }
  None
}

#[cfg(target_os = "macos")]
async fn pid_listening_on(port: u16) -> Option<u32> {
  let mut cmd = Command::new("sh");
  cmd.args(["-lc", &format!("lsof -nP -iTCP:{port} -sTCP:LISTEN -t 2>/dev/null")]);
  let out = run_cmd_with_timeout(cmd, 1200).await?;
  for line in out.lines() {
    if let Ok(pid) = line.trim().parse::<u32>() { return Some(pid); }
  }
  None
}

#[cfg(windows)]
async fn exe_for_pid(pid: u32) -> Option<String> {
  let mut cmd = Command::new("powershell");
  cmd.args([
    "-NoProfile","-NonInteractive","-Command",
    &format!("(Get-Process -Id {}).Path", pid),
  ]);
  let out = run_cmd_with_timeout(cmd, 800).await?;
  let p = out.trim();
  if p.is_empty() { None } else { Some(p.to_string()) }
}

#[cfg(all(unix, not(target_os = "macos")))]
async fn exe_for_pid(pid: u32) -> Option<String> {
  let link = format!("/proc/{pid}/exe");
  match fs::read_link(&link) {
    Ok(p) => Some(p.to_string_lossy().to_string()),
    Err(_) => {
      let mut cmd = Command::new("sh");
      cmd.args(["-lc", &format!("ps -p {} -o comm=", pid)]);
      run_cmd_with_timeout(cmd, 600).await.map(|s| s.trim().to_string()).filter(|s| !s.is_empty())
    }
  }
}

#[cfg(target_os = "macos")]
async fn exe_for_pid(pid: u32) -> Option<String> {
  let mut cmd = Command::new("sh");
  cmd.args(["-lc", &format!("ps -p {} -o comm=", pid)]);
  run_cmd_with_timeout(cmd, 600).await.map(|s| s.trim().to_string()).filter(|s| !s.is_empty())
}

async fn find_arkd_by_name() -> Option<u32> {
  #[cfg(windows)]
  {
    let mut cmd = Command::new("cmd");
    cmd.args(["/C", "tasklist /FI \"IMAGENAME eq arkd.exe\" /FO CSV /NH"]);
    if let Some(out) = run_cmd_with_timeout(cmd, 800).await {
      for line in out.lines() {
        let l = line.trim_matches('"');
        if l.to_ascii_lowercase().starts_with("arkd.exe") {
          let parts: Vec<&str> = l.split("\",\"").collect();
          if parts.len() > 1 {
            if let Ok(pid) = parts[1].replace(',', "").parse::<u32>() {
              return Some(pid);
            }
          }
        }
      }
    }
    None
  }
  #[cfg(any(target_os = "macos", all(unix, not(target_os = "macos"))))]
  {
    let mut cmd = Command::new("sh");
    cmd.args(["-lc", "pgrep -x arkd || pgrep -f '/arkd(\\s|$)' || true"]);
    if let Some(out) = run_cmd_with_timeout(cmd, 600).await {
      for line in out.lines() {
        if let Ok(pid) = line.trim().parse::<u32>() { return Some(pid); }
      }
    }
    None
  }
}

#[derive(Serialize, Debug, Clone)]
pub struct ProbeInfo {
  running: bool,
  pid: Option<u32>,
  exe: Option<String>,
  port: Option<u16>,
  source: &'static str, // "internal" | "port" | "name" | "none"
}

async fn probe_external_node() -> ProbeInfo {
  for p in rpc_ports_to_probe() {
    if let Some(pid) = pid_listening_on(p).await {
      let exe = exe_for_pid(pid).await;
      return ProbeInfo { running: true, pid: Some(pid), exe, port: Some(p), source: "port" };
    }
  }
  if let Some(pid) = find_arkd_by_name().await {
    let exe = exe_for_pid(pid).await;
    return ProbeInfo { running: true, pid: Some(pid), exe, port: None, source: "name" };
  }
  ProbeInfo { running: false, pid: None, exe: None, port: None, source: "none" }
}

fn internal_child_status(proc: &NodeProc) -> Option<u32> {
  let mut remove_dead = false;
  let pid = {
    let mut g = proc.inner.lock();
    if let Some(child) = g.child.as_mut() {
      match child.try_wait() {
        Ok(Some(_)) => { remove_dead = true; None }
        Ok(None)    => child.id(),
        Err(_)      => { remove_dead = true; None }
      }
    } else { None }
  };
  if remove_dead { proc.inner.lock().child = None; }
  pid
}

/* ───────────────── tauri commands ───────────────── */

#[tauri::command]
pub async fn node_is_running(proc: State<'_, NodeProc>) -> Result<bool, String> {
  if internal_child_status(&proc).is_some() {
    return Ok(true);
  }
  let probed = probe_external_node().await;
  Ok(probed.running)
}

#[tauri::command]
pub async fn node_pid(proc: State<'_, NodeProc>) -> Result<Option<u32>, String> {
  if let Some(pid) = internal_child_status(&proc) {
    return Ok(Some(pid));
  }
  let probed = probe_external_node().await;
  Ok(probed.pid)
}

#[tauri::command]
pub fn node_exec_path(app: AppHandle) -> Option<String> {
  resolve_arkd_path(Some(&app))
    .and_then(|p| p.canonicalize().ok())
    .map(|p| p.to_string_lossy().to_string())
}

#[tauri::command]
pub fn node_log_tail(proc: State<'_, NodeProc>, n: Option<usize>) -> Vec<String> {
  let g = proc.inner.lock();
  let len = g.tail.len();
  let start = len.saturating_sub(n.unwrap_or(200));
  g.tail[start..].to_vec()
}

#[tauri::command]
pub fn node_log_clear(proc: State<'_, NodeProc>) {
  proc.inner.lock().tail.clear();
}

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

/* Extra: expose a rich probe for the UI */
#[tauri::command]
pub async fn node_probe(proc: State<'_, NodeProc>) -> Result<ProbeInfo, String> {
  if let Some(pid) = internal_child_status(&proc) {
    let exe = exe_for_pid(pid).await;
    return Ok(ProbeInfo {
      running: true,
      pid: Some(pid),
      exe,
      port: None,
      source: "internal",
    });
  }
  Ok(probe_external_node().await)
}
