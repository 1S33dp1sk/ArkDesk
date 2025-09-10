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

use cleanup::{cleanup_spurious_dirs, wipe_ark_home};
use install::{install_preflight, install_arknet_progress, reveal_ark_home, install_selftest};
use settings::{get_settings, save_settings, probe_install, install_arknet};
use status::get_status;
use validate::validate_settings;

use state::NodeBridge;
use manifest::read_manifest;

use std::path::PathBuf;
use tauri::{AppHandle, Emitter, Manager};

const EVT_HEALTH: &str = "node://health";
const EVT_STATUS: &str = "node://status";

fn default_manifest_path() -> PathBuf {
  std::env::var("ARK_RUN_DIR")
    .map(PathBuf::from)
    .unwrap_or_else(|_| PathBuf::from("./var/devnet/run"))
    .join("node.json")
}

async fn spawn_status_poller(app: AppHandle, bridge: NodeBridge) {
  use tokio::time::{sleep, Duration};

  loop {
    bridge.maybe_refresh();

    if let Ok(admin) = bridge.admin() {
      if let Ok(h) = admin.healthz().await {
        let _ = app.emit(EVT_HEALTH, &h);
      }
      if let Ok(s) = admin.status().await {
        let _ = app.emit(EVT_STATUS, &s);
      }
    }

    sleep(Duration::from_millis(1000)).await;
  }
}

fn main() {
  tauri::Builder::default()
    .plugin(tauri_plugin_shell::init())
    .plugin(tauri_plugin_dialog::init())
    // .plugin(tauri_plugin_opener::init())
    .setup(|app| {
      // process supervisor state
      app.manage(node_control::NodeProc::default());

      // admin manifest bridge
      let manifest_path = default_manifest_path();
      let bridge = NodeBridge::new(manifest_path.clone());

      if let Ok(m) = read_manifest(&manifest_path) {
        bridge.update_manifest(m);
      }

      // share bridge with commands
      app.manage(bridge.clone());

      // background poller
      let app_handle = app.handle().clone();
      tauri::async_runtime::spawn(spawn_status_poller(app_handle, bridge));

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
    ])
    .run(tauri::generate_context!())
    .expect("error while running tauri application");
}
