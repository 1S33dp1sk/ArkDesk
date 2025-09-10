use crate::{state::NodeBridge, admin_client::{Healthz, Status}};
use tauri::State;

#[tauri::command]
pub async fn admin_health(bridge: State<'_, NodeBridge>) -> Result<Healthz, String> {
    let c = bridge.admin().map_err(|e| e.to_string())?;
    c.healthz().await.map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn admin_status(bridge: State<'_, NodeBridge>) -> Result<Status, String> {
    let c = bridge.admin().map_err(|e| e.to_string())?;
    c.status().await.map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn admin_shutdown(bridge: State<'_, NodeBridge>) -> Result<(), String> {
    let c = bridge.admin().map_err(|e| e.to_string())?;
    c.shutdown().await.map_err(|e| e.to_string())
}
