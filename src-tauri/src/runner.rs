use anyhow::{anyhow, Result};
use std::{path::{Path, PathBuf}, process::Stdio};
use tauri::{AppHandle, Emitter, Manager};
use tokio::{
  io::{AsyncBufReadExt, BufReader},
  process::{Child, Command},
};

#[derive(Clone)]
pub struct ChildHandle {
  id: String,
  inner: std::sync::Arc<tokio::sync::Mutex<Child>>,
}

impl ChildHandle {
  pub fn status(&self) -> String {
    format!("running: {}", self.id)
  }
  pub async fn kill(&self) -> Result<()> {
    // lock then kill; do not hold any other locks
    let mut ch = self.inner.lock().await;
    ch.kill().await.ok();
    Ok(())
  }
}

fn default_run_path(app: &AppHandle) -> PathBuf {
  // <app_local_data>/arknet/build/bin/<os>/run
  let base = app
    .path()
    .app_local_data_dir()
    .unwrap_or_else(|_| app.path().app_data_dir().unwrap());
  let os = if cfg!(target_os = "macos") {
    "macos"
  } else if cfg!(target_os = "windows") {
    "windows"
  } else {
    "linux"
  };
  base
    .join("arknet")
    .join("build")
    .join("bin")
    .join(os)
    .join(if cfg!(target_os = "windows") { "run.exe" } else { "run" })
}

pub async fn spawn_node(app: AppHandle, id: &str, bin_override: Option<String>) -> Result<ChildHandle> {
  let path = bin_override.map(PathBuf::from).unwrap_or_else(|| default_run_path(&app));
  if !path.exists() {
    return Err(anyhow!("node binary not found at {}", path.display()));
  }

  let mut cmd = Command::new(&path);
  cmd
    .env(
      "ARK_HOME",
      path
        .parent()
        .and_then(|p| p.parent())
        .unwrap_or(Path::new("."))
        .to_path_buf(),
    )
    .stdout(Stdio::piped())
    .stderr(Stdio::piped());

  let mut child = cmd.spawn()?;
  let stdout = child.stdout.take();
  let stderr = child.stderr.take();

  // stream logs
  let app_clone = app.clone();
  let id_str = id.to_string();
  if let Some(out) = stdout {
    tokio::spawn(async move {
      let mut lines = BufReader::new(out).lines();
      while let Ok(Some(line)) = lines.next_line().await {
        let _ = app_clone.emit(
          "ark:proc:log",
          serde_json::json!({ "id": id_str, "stream": "stdout", "line": line }),
        );
      }
    });
  }
  let app_clone2 = app.clone();
  let id_str2 = id.to_string();
  if let Some(err) = stderr {
    tokio::spawn(async move {
      let mut lines = BufReader::new(err).lines();
      while let Ok(Some(line)) = lines.next_line().await {
        let _ = app_clone2.emit(
          "ark:proc:log",
          serde_json::json!({ "id": id_str2, "stream": "stderr", "line": line }),
        );
      }
    });
  }

  Ok(ChildHandle {
    id: id.to_string(),
    inner: std::sync::Arc::new(tokio::sync::Mutex::new(child)),
  })
}

/* -------- Bootstrap: fetch & build Arknet source -------- */

pub async fn bootstrap_fetch(app: &AppHandle, url: Option<String>, dest_dir: Option<String>) -> Result<()> {
  let url = url.unwrap_or_else(|| "https://github.com/arknet-labs/arknet.git".to_string());
  let dest = dest_dir
    .map(PathBuf::from)
    .unwrap_or_else(|| app.path().app_local_data_dir().unwrap().join("arknet"));

  if dest.exists() {
    return Ok(());
  }
  tokio::fs::create_dir_all(dest.parent().unwrap()).await.ok();

  let status = Command::new("git")
    .arg("clone")
    .arg("--depth=1")
    .arg(&url)
    .arg(&dest)
    .status()
    .await?;

  if !status.success() {
    return Err(anyhow!("git clone failed ({})", status));
  }
  Ok(())
}

pub async fn bootstrap_build(app: &AppHandle, src_dir: Option<String>) -> Result<()> {
  let src = src_dir
    .map(PathBuf::from)
    .unwrap_or_else(|| app.path().app_local_data_dir().unwrap().join("arknet"));

  if !src.exists() {
    return Err(anyhow!("source dir not found: {}", src.display()));
  }

  // make; or ./build.sh
  let mut status = Command::new("make").current_dir(&src).status().await?;
  if !status.success() {
    let build_sh = src.join("build.sh");
    if build_sh.exists() {
      status = Command::new("sh").arg(build_sh).current_dir(&src).status().await?;
    }
  }
  if !status.success() {
    return Err(anyhow!("build failed ({})", status));
  }
  Ok(())
}
