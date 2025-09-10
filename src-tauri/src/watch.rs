// src/watch.rs
use crate::WatchTopic;
use reqwest::header::HeaderMap;
use parking_lot::RwLock;
use serde_json::Value;
use std::{
  collections::HashMap,
  sync::{
    atomic::{AtomicBool, Ordering},
    Arc,
  },
  time::{Duration, Instant},
};

/// Cache entry used by lib.rs
#[derive(Clone, Debug)]
pub struct CacheEntry {
  pub value: Value,
  pub ts:    Instant,
}

impl CacheEntry {
  pub fn fresh(v: Value) -> Self {
    Self { value: v, ts: Instant::now() }
  }
  pub fn is_fresh(&self, ttl: Duration) -> bool {
    self.ts.elapsed() <= ttl
  }
}

/// Build the cache key exactly as lib.rs expects.
pub fn cache_key(method: &str, key: &str) -> String {
  let mut s = String::with_capacity(method.len() + 1 + key.len());
  s.push_str(method);
  s.push(':');
  s.push_str(key);
  s
}

/// Lightweight async watcher (no external FS/network yet).
pub struct Watcher {
  stop:   Arc<AtomicBool>,
  handle: Option<tauri::async_runtime::JoinHandle<()>>,
}

impl Watcher {
  #[allow(clippy::too_many_arguments)]
  pub fn start(
    _app: tauri::AppHandle,
    _base: String,
    _headers: HeaderMap,
    _insecure: bool,
    _cache: Arc<RwLock<HashMap<String, CacheEntry>>>,
    _topics: Vec<WatchTopic>,
  ) -> Self {
    let stop = Arc::new(AtomicBool::new(false));
    let stop2 = stop.clone();

    // Tauri re-exports a tokio runtime; use tokio::time::sleep for the tick.
    let handle = tauri::async_runtime::spawn(async move {
      use tokio::time::{sleep, Duration};
      while !stop2.load(Ordering::Relaxed) {
        sleep(Duration::from_millis(500)).await;
      }
    });

    Self { stop, handle: Some(handle) }
  }

  /// Async stop so callers can `await` it (as lib.rs does).
  pub async fn stop(&mut self) {
    self.stop.store(true, Ordering::Relaxed);
    if let Some(h) = self.handle.take() {
      let _ = h.await;
    }
  }
}
