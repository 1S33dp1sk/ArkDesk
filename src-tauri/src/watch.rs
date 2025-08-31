use crate::rpc;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::{collections::HashMap, sync::Arc, time::Duration};
use parking_lot::RwLock;
use tauri::{AppHandle, Emitter};
use tokio::{sync::broadcast, task::JoinHandle, time::{sleep, Instant}};
use reqwest::header::HeaderMap;

#[derive(Clone)]
pub struct CacheEntry {
  pub value: Value,
  pub at: Instant,
}
impl CacheEntry {
  pub fn fresh(value: Value) -> Self { Self { value, at: Instant::now() } }

  /// Returns true if the entry is not older than `ttl`.
  pub fn is_fresh(&self, ttl: std::time::Duration) -> bool {
    self.at.elapsed() <= ttl
  }
}
pub fn cache_key(method: &str, _k: &str) -> String { method.to_string() }

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct Topic {
  pub method: String,
  #[serde(default)]
  pub params: Value,
  #[serde(default = "default_every")]
  pub every_ms: u64,
}
fn default_every() -> u64 { 1500 }

pub struct Watcher {
  stop_tx: broadcast::Sender<()>,
  handle: JoinHandle<()>,
}

impl Watcher {
  #[allow(clippy::too_many_arguments)]
  pub fn start(
    app: AppHandle,
    base: String,
    headers: HeaderMap,
    insecure: bool,
    cache: Arc<RwLock<HashMap<String, CacheEntry>>>,
    topics: Vec<crate::WatchTopic>,
  ) -> Self {
    let (tx, mut rx) = broadcast::channel::<()>(1);

    let handle = tokio::spawn(async move {
      let mut last_tick: HashMap<String, Instant> = HashMap::new();

      loop {
        if rx.try_recv().is_ok() { break; }

        for t in &topics {
          let now = Instant::now();
          let due = match last_tick.get(&t.method) {
            Some(prev) => now.duration_since(*prev).as_millis() as u64 >= t.every_ms,
            None => true,
          };
          if !due { continue; }

          let timeout = Duration::from_millis(7000);
          let res = rpc::call_with(&base, &t.method, t.params.clone(), timeout, insecure, headers.clone()).await;
          match res {
            Ok(rr) => {
              if let Some(val) = rr.value_for_cache {
                let key = cache_key(&t.method, &rr.key_for_cache);
                cache.write().insert(key, CacheEntry::fresh(val.clone()));
                let _ = app.emit("ark:rpc:update", serde_json::json!({
                  "method": t.method, "result": val
                }));
              }
              last_tick.insert(t.method.clone(), now);
            }
            Err(err) => {
              let _ = app.emit("ark:rpc:error", serde_json::json!({
                "method": t.method, "error": err.to_string()
              }));
              last_tick.insert(t.method.clone(), now);
            }
          }
          sleep(Duration::from_millis(10)).await;
        }

        sleep(Duration::from_millis(50)).await;
      }
    });

    Self { stop_tx: tx, handle }
  }

  pub async fn stop(self) {
    let _ = self.stop_tx.send(());
    let _ = self.handle.await;
  }
}
