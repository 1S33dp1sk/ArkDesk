// src/main.rs
mod settings;
mod status;
mod validate;
mod cleanup;
mod install;
mod miner;

// new modules
mod manifest;
mod admin_client;
mod state;
mod node_control; // process supervisor
mod types;        // centralized payloads
mod rpc;          // RPC client

use cleanup::{cleanup_spurious_dirs, wipe_ark_home};
use install::{install_preflight, install_arknet_progress, reveal_ark_home, install_selftest};
use settings::{get_settings, save_settings, probe_install, install_arknet};
use status::get_status;
use validate::validate_settings;

use manifest::read_manifest;
use state::NodeBridge;
use types::{ChainTip, MempoolInfo, Stale};

use serde_json::{json, Value};
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::Arc;
use tauri::{AppHandle, Emitter, Manager, State};

/* ---- events ---- */
const EVT_HEALTH:  &str = "node://health";
const EVT_STATUS:  &str = "node://status";
const EVT_TIP:     &str = "node://tip";
const EVT_MEMPOOL: &str = "node://mempool";
const EVT_CAPS:    &str = "node://caps";
const EVT_STALE:   &str = "node://stale";

/* ---- manifest discovery ---- */
fn default_manifest_path() -> PathBuf {
  // 1) explicit override
  if let Ok(run_dir) = std::env::var("ARK_RUN_DIR") {
    return PathBuf::from(run_dir).join("node.json");
  }

  // 2) Windows roaming profile (APPDATA\Arknet\var\devnet\run\node.json)
  #[cfg(target_os = "windows")]
  {
    if let Ok(appdata) = std::env::var("APPDATA") {
      let p = Path::new(&appdata)
        .join("Arknet").join("var").join("devnet").join("run").join("node.json");
      if p.exists() { return p; }
    }
  }

  // 3) POSIX-ish ARK_HOME/var/devnet/run/node.json
  if let Ok(ark_home) = std::env::var("ARK_HOME") {
    let p = Path::new(&ark_home)
      .join("var").join("devnet").join("run").join("node.json");
    if p.exists() { return p; }
  }

  // 4) project-local fallback
  PathBuf::from("./var/devnet/run").join("node.json")
}

fn now_ms() -> u64 {
  use std::time::{SystemTime, UNIX_EPOCH};
  SystemTime::now()
    .duration_since(UNIX_EPOCH)
    .unwrap_or_default()
    .as_millis() as u64
}

#[derive(Default)]
struct Stamps {
  admin_ok_ms:  AtomicU64,
  status_ok_ms: AtomicU64,
  tip_ok_ms:    AtomicU64,
  mem_ok_ms:    AtomicU64,
}

/* ---- pollers ---- */
async fn spawn_status_poller(app: AppHandle, bridge: NodeBridge, stamps: Arc<Stamps>) {
  use tokio::time::{sleep, Duration};

  loop {
    bridge.maybe_refresh();

    if let Ok(admin) = bridge.admin() {
      if let Ok(h) = admin.healthz().await {
        stamps.admin_ok_ms.store(now_ms(), Ordering::Relaxed);
        let _ = app.emit(EVT_HEALTH, &h);
      }
      if let Ok(s) = admin.status().await {
        stamps.status_ok_ms.store(now_ms(), Ordering::Relaxed);
        let _ = app.emit(EVT_STATUS, &s);
      }
    }

    sleep(Duration::from_millis(1000)).await;
  }
}

async fn spawn_rpc_poller(app: AppHandle, bridge: NodeBridge, stamps: Arc<Stamps>) {
  use tokio::time::{sleep, Duration};

  let mut last_tip_key: Option<(u64, Option<String>)> = None;
  let mut caps_sent = false;

  loop {
    bridge.maybe_refresh();

    if let Ok(rpc) = bridge.rpc() {
      // one-time capability snapshot
      if !caps_sent {
        if let Ok(list) = rpc.call::<Vec<String>, _>("rpc.list", json!({})).await {
          let _ = app.emit(EVT_CAPS, &list);
          caps_sent = true;
        }
      }

      // tip (only on change)
      if let Ok(tip) = rpc.call::<ChainTip, _>("chain.tip", json!({})).await {
        let key = (tip.height, tip.block_id.clone());
        if last_tip_key.as_ref() != Some(&key) {
          stamps.tip_ok_ms.store(now_ms(), Ordering::Relaxed);
          let _ = app.emit(EVT_TIP, &tip);
          last_tip_key = Some(key);
        }
      }

      // mempool (steady cadence)
      if let Ok(mp) = rpc.call::<MempoolInfo, _>("mempool.info", json!({})).await {
        stamps.mem_ok_ms.store(now_ms(), Ordering::Relaxed);
        let _ = app.emit(EVT_MEMPOOL, &mp);
      }
    }

    sleep(Duration::from_millis(1000)).await;
  }
}

async fn spawn_stale_emitter(app: AppHandle, stamps: Arc<Stamps>) {
  use tokio::time::{sleep, Duration};

  loop {
    let now = now_ms();
    let age = |t: u64| if t == 0 { None } else { Some(now.saturating_sub(t)) };

    let payload = Stale {
      now_ms: now,
      admin_age_ms:   age(stamps.admin_ok_ms.load(Ordering::Relaxed)),
      status_age_ms:  age(stamps.status_ok_ms.load(Ordering::Relaxed)),
      tip_age_ms:     age(stamps.tip_ok_ms.load(Ordering::Relaxed)),
      mempool_age_ms: age(stamps.mem_ok_ms.load(Ordering::Relaxed)),
    };
    let _ = app.emit(EVT_STALE, &payload);

    sleep(Duration::from_millis(2000)).await;
  }
}

/* ---- generic RPC passthrough used by UI ---- */

#[tauri::command]
async fn rpc_call(
  bridge: State<'_, state::NodeBridge>,
  method: String,
  params: serde_json::Value,
) -> Result<serde_json::Value, String> {
  // Ensure we’re using the freshest endpoint/headers
  bridge.maybe_refresh();

  let rpc = bridge.rpc().map_err(|e| e.to_string())?;
  // Return full chain of errors for proper diagnostics
  let out = rpc
    .call_value(&method, params)
    .await
    .map_err(|e| format!("{:?}", e))?;

  Ok(out.result.unwrap_or(out.raw))
}

#[tauri::command]
async fn rpc_tx_lookup(state: State<'_, NodeBridge>, id: String) -> Result<Value, String> {
  let rpc = state.rpc().map_err(|e| e.to_string())?;
  let v: Value = rpc
    .call("tx.get", json!({ "id": id }))
    .await
    .map_err(|e| e.to_string())?;
  Ok(json!({ "raw": v, "id": id }))
}

/* ---- tauri bootstrap ---- */
fn main() {
  tauri::Builder::default()
    .plugin(tauri_plugin_shell::init())
    .plugin(tauri_plugin_dialog::init())
    // .plugin(tauri_plugin_opener::init())
    .setup(|app| {
      // node process supervisor
      app.manage(node_control::NodeProc::default());

      // resolve manifest path & bridge
      let manifest_path = default_manifest_path();
      let bridge = NodeBridge::new(manifest_path.clone());

      if let Ok(m) = read_manifest(&manifest_path) {
        bridge.update_manifest(m);
      }

      // share bridge
      app.manage(bridge.clone());

      // background workers
      let stamps = Arc::new(Stamps::default());
      let app_handle = app.handle().clone();

      tauri::async_runtime::spawn(spawn_status_poller(
        app_handle.clone(),
        bridge.clone(),
        stamps.clone(),
      ));
      tauri::async_runtime::spawn(spawn_rpc_poller(
        app_handle.clone(),
        bridge.clone(),
        stamps.clone(),
      ));
      tauri::async_runtime::spawn(spawn_stale_emitter(
        app_handle,
        stamps,
      ));

      Ok(())
    })
    .invoke_handler(tauri::generate_handler![
      // settings / install
      get_settings, save_settings, probe_install, install_arknet,
      // status / validate
      get_status, validate_settings,
      // cleanup
      cleanup_spurious_dirs, wipe_ark_home,
      // installer
      install_preflight, install_arknet_progress, reveal_ark_home, install_selftest,
      // miner detection / setup
      miner::host_probe,
      miner::install_arkpy,
      miner::locate_python,
      miner::probe_bundled_clib,
      // node control (start/stop/logs/etc.)
      node_control::node_is_running,
      node_control::node_pid,
      node_control::node_exec_path,
      node_control::node_log_tail,
      node_control::node_log_clear,
      node_control::node_start,
      node_control::node_stop,
      node_control::node_restart,
      // rpc passthroughs
      rpc_call,
      rpc_tx_lookup,
    ])
    .run(tauri::generate_context!())
    .expect("error while running tauri application");
}
