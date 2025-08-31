use anyhow::{anyhow, Result};
use serde::{Deserialize, Serialize};
use std::{collections::HashMap, fs, path::PathBuf};
use tauri::{AppHandle, Manager};

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct Endpoint {
  pub id: String,
  pub label: String,
  pub base: String,
  #[serde(default)]
  pub headers: HashMap<String, String>,
  #[serde(default)]
  pub insecure: bool,
}

#[derive(Default, Clone, Debug, Serialize, Deserialize)]
pub struct EndpointStore {
  #[serde(default)]
  pub active_id: Option<String>,
  #[serde(default)]
  pub items: HashMap<String, Endpoint>,
}
impl EndpointStore {
  pub fn get_active(&self) -> Option<&Endpoint> {
    self.active_id.as_ref().and_then(|id| self.items.get(id))
  }
}

fn file_path(app: &AppHandle) -> Result<PathBuf> {
  let dir = app.path().app_config_dir()?; // Result<PathBuf, _> in Tauri v2
  std::fs::create_dir_all(&dir).ok();
  Ok(dir.join("endpoints.json"))
}

pub fn load(app: &AppHandle) -> EndpointStore {
  let path = match file_path(app) {
    Ok(p) => p,
    Err(_) => return EndpointStore::default(),
  };
  let Ok(bytes) = fs::read(path) else { return EndpointStore::default() };
  serde_json::from_slice(&bytes).unwrap_or_default()
}

pub fn save(app: &AppHandle, store: &EndpointStore) -> Result<()> {
  let path = file_path(app)?;
  let data = serde_json::to_vec_pretty(store)?;
  fs::write(path, data)?;
  Ok(())
}

pub fn upsert(store: &mut EndpointStore, ep: Endpoint) {
  store.items.insert(ep.id.clone(), ep);
}
pub fn remove(store: &mut EndpointStore, id: &str) {
  store.items.remove(id);
  if store.active_id.as_deref() == Some(id) {
    store.active_id = None;
  }
}
pub fn set_active(store: &mut EndpointStore, id: &str) -> Result<()> {
  if !store.items.contains_key(id) {
    return Err(anyhow!("endpoint not found"));
  }
  store.active_id = Some(id.to_string());
  Ok(())
}
