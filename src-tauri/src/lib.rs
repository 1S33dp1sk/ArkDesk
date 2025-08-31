mod rpc;
mod runner;
mod watch;
mod endpoints;

use parking_lot::{Mutex, RwLock};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::{collections::HashMap, sync::Arc, time::Duration};
use tauri::{AppHandle, Emitter, Manager, State};
use endpoints::{Endpoint, EndpointStore};
use reqwest::header::{HeaderMap, HeaderName, HeaderValue};

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct WatchTopic {
  pub method: String,
  #[serde(default)]
  pub params: Value,
  #[serde(default = "default_every")]
  pub every_ms: u64,
}
fn default_every() -> u64 { 1500 }

#[derive(Default)]
struct AppState {
  rpc_base: RwLock<String>,
  endpoints: RwLock<EndpointStore>,
  procs: Mutex<HashMap<String, runner::ChildHandle>>,
  cache: Arc<RwLock<HashMap<String, watch::CacheEntry>>>,
  watcher: Mutex<Option<watch::Watcher>>,
}

fn headers_from_map(map: &HashMap<String, String>) -> HeaderMap {
  let mut h = HeaderMap::new();
  for (k, v) in map {
    if let (Ok(name), Ok(val)) =
      (HeaderName::from_bytes(k.as_bytes()), HeaderValue::from_str(v))
    {
      h.insert(name, val);
    }
  }
  h
}

#[tauri::command]
fn greet(name: &str) -> String {
  format!("Hello, {}! You've been greeted from Rust!", name)
}

/* ---- endpoints ---- */

#[tauri::command]
fn ark_endpoints_list(state: State<'_, AppState>) -> Result<EndpointStore, String> {
  Ok(state.endpoints.read().clone())
}

#[tauri::command]
fn ark_endpoints_upsert(app: AppHandle, state: State<'_, AppState>, ep: Endpoint)
  -> Result<EndpointStore, String>
{
  let mut s = state.endpoints.write().clone();
  endpoints::upsert(&mut s, ep);
  endpoints::save(&app, &s).map_err(|e| e.to_string())?;
  *state.endpoints.write() = s.clone();
  Ok(s)
}

#[tauri::command]
fn ark_endpoints_remove(app: AppHandle, state: State<'_, AppState>, id: String)
  -> Result<EndpointStore, String>
{
  let mut s = state.endpoints.write().clone();
  endpoints::remove(&mut s, &id);
  endpoints::save(&app, &s).map_err(|e| e.to_string())?;
  *state.endpoints.write() = s.clone();
  Ok(s)
}

#[tauri::command]
async fn ark_endpoints_set_active(app: AppHandle, state: State<'_, AppState>, id: String)
  -> Result<EndpointStore, String>
{
  // stop watcher without holding the lock across await
  let prev = { state.watcher.lock().take() };
  if let Some(w) = prev { w.stop().await; }

  let mut s = state.endpoints.write().clone();
  endpoints::set_active(&mut s, &id).map_err(|e| e.to_string())?;
  endpoints::save(&app, &s).map_err(|e| e.to_string())?;
  *state.endpoints.write() = s.clone();
  Ok(s)
}

#[tauri::command]
async fn ark_endpoint_probe(
  base: String,
  headers: Option<HashMap<String, String>>,
  insecure: Option<bool>,
) -> Result<Value, String> {
  let h = headers_from_map(&headers.unwrap_or_default());
  let insecure = insecure.unwrap_or(false);
  let r = rpc::call_with(
    &base,
    "protocol.version",
    serde_json::json!({}),
    Duration::from_millis(5000),
    insecure,
    h,
  )
  .await
  .map_err(|e| e.to_string())?;
  Ok(r.raw)
}

/* ---- legacy quick-connect setter ---- */
#[tauri::command]
async fn ark_config_set_rpc_base(state: State<'_, AppState>, base: String) -> Result<(), String> {
  *state.rpc_base.write() = base;
  Ok(())
}

/* ---- RPC calls ---- */

#[tauri::command]
async fn ark_rpc(
  app: AppHandle,
  state: State<'_, AppState>,
  method: String,
  params: Value,
  timeout_ms: Option<u64>,
) -> Result<Value, String> {
  let (base, headers, insecure) = {
    let store = state.endpoints.read();
    if let Some(ep) = store.get_active() {
      (ep.base.clone(), headers_from_map(&ep.headers), ep.insecure)
    } else {
      (state.rpc_base.read().clone(), HeaderMap::new(), false)
    }
  };
  let timeout = Duration::from_millis(timeout_ms.unwrap_or(8000));
  let resp = rpc::call_with(&base, &method, params, timeout, insecure, headers)
    .await
    .map_err(|e| e.to_string())?;

  if let Some(v) = resp.value_for_cache.clone() {
    let key = watch::cache_key(&method, &resp.key_for_cache);
    state
      .cache
      .write()
      .insert(key, watch::CacheEntry::fresh(v.clone()));
    let _ = app.emit(
      "ark:rpc:update",
      serde_json::json!({ "method": method, "result": v }),
    );
  }
  Ok(resp.raw)
}

#[tauri::command]
async fn ark_rpc_with(
  app: AppHandle,
  method: String,
  params: Value,
  base: String,
  headers: Option<HashMap<String, String>>,
  insecure: Option<bool>,
  timeout_ms: Option<u64>,
) -> Result<Value, String> {
  let timeout = Duration::from_millis(timeout_ms.unwrap_or(8000));
  let h = headers_from_map(&headers.unwrap_or_default());
  let insecure = insecure.unwrap_or(false);
  let resp = rpc::call_with(&base, &method, params, timeout, insecure, h)
    .await
    .map_err(|e| e.to_string())?;
  let _ = app.emit("ark:rpc:update", resp.raw.clone());
  Ok(resp.raw)
}

/* ---- cache & watchers ---- */

#[tauri::command]
fn ark_cache_read(state: State<'_, AppState>, method: String) -> Option<Value> {
  // consider cache entries fresh for 30s by default
  let ttl = std::time::Duration::from_secs(30);
  state
    .cache
    .read()
    .get(&method)
    .and_then(|e| if e.is_fresh(ttl) { Some(e.value.clone()) } else { None })
}

#[tauri::command]
async fn ark_watch_start(
  app: AppHandle,
  state: State<'_, AppState>,
  topics: Vec<WatchTopic>,
) -> Result<(), String> {
  // stop previous watcher first (outside await)
  let prev = { state.watcher.lock().take() };
  if let Some(w) = prev { w.stop().await; }

  let (base, headers, insecure) = {
    let store = state.endpoints.read();
    if let Some(ep) = store.get_active() {
      (ep.base.clone(), headers_from_map(&ep.headers), ep.insecure)
    } else {
      (state.rpc_base.read().clone(), HeaderMap::new(), false)
    }
  };

  let cache = state.cache.clone(); // Arc clone
  let w = watch::Watcher::start(app.clone(), base, headers, insecure, cache, topics);
  *state.watcher.lock() = Some(w);
  Ok(())
}

#[tauri::command]
async fn ark_watch_stop(state: State<'_, AppState>) -> Result<(), String> {
  let prev = { state.watcher.lock().take() };
  if let Some(w) = prev { w.stop().await; }
  Ok(())
}

/* ---- local node runner & bootstrap ---- */

#[tauri::command]
async fn ark_run(
  app: AppHandle,
  state: State<'_, AppState>,
  id: String,
  bin_override: Option<String>,
) -> Result<(), String> {
  // check first without holding across await
  let already = { state.procs.lock().contains_key(&id) };
  if already {
    return Ok(());
  }

  // spawn (await) without lock
  let handle = runner::spawn_node(app.clone(), &id, bin_override)
    .await
    .map_err(|e| e.to_string())?;

  // insert under lock after spawn
  { state.procs.lock().insert(id.clone(), handle); }
  Ok(())
}

#[tauri::command]
async fn ark_run_kill(state: State<'_, AppState>, id: String) -> Result<(), String> {
  // take handle out, then await kill
  let handle = { state.procs.lock().remove(&id) };
  if let Some(h) = handle {
    h.kill().await.map_err(|e| e.to_string())?;
  }
  Ok(())
}

#[tauri::command]
fn ark_run_status(state: State<'_, AppState>, id: String) -> Option<String> {
  state.procs.lock().get(&id).map(|h| h.status())
}

#[tauri::command]
async fn ark_bootstrap_fetch(
  app: AppHandle,
  url: Option<String>,
  dest_dir: Option<String>,
) -> Result<(), String> {
  runner::bootstrap_fetch(&app, url, dest_dir)
    .await
    .map_err(|e| e.to_string())
}

#[tauri::command]
async fn ark_bootstrap_build(app: AppHandle, src_dir: Option<String>) -> Result<(), String> {
  runner::bootstrap_build(&app, src_dir)
    .await
    .map_err(|e| e.to_string())
}

/* --------------------------- BOOTSTRAP --------------------------- */

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  tauri::Builder::default()
    .plugin(tauri_plugin_opener::init())
    .setup(|app| {
      // load endpoint profiles
      let store = endpoints::load(&app.handle());

      // initialize state
      app.manage(AppState {
        rpc_base: RwLock::new(String::new()),
        endpoints: RwLock::new(EndpointStore::default()),
        procs: Mutex::new(HashMap::new()),
        cache: Arc::new(RwLock::new(HashMap::new())),
        watcher: Mutex::new(None),
      });

      // write loaded endpoints into state
      let state: State<AppState> = app.state();
      *state.endpoints.write() = store;

      Ok(())
    })
    .invoke_handler(tauri::generate_handler![
      greet,
      // endpoints
      ark_endpoints_list,
      ark_endpoints_upsert,
      ark_endpoints_remove,
      ark_endpoints_set_active,
      ark_endpoint_probe,
      // rpc
      ark_config_set_rpc_base,
      ark_rpc,
      ark_rpc_with,
      // cache/watch
      ark_cache_read,
      ark_watch_start,
      ark_watch_stop,
      // run/bootstrap
      ark_run,
      ark_run_kill,
      ark_run_status,
      ark_bootstrap_fetch,
      ark_bootstrap_build
    ])
    .run(tauri::generate_context!())
    .expect("error while running tauri application");
}
