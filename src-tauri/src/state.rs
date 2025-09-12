// src/state.rs
use crate::{
  admin_client::AdminClient,
  manifest::{read_manifest, Manifest},
  rpc::RpcClient,
};
use parking_lot::RwLock;
use reqwest::header::HeaderMap;
use std::{
  fs,
  path::PathBuf,
  sync::Arc,
  time::{Duration, SystemTime},
};

#[derive(Clone)]
pub struct NodeBridge {
  inner: Arc<Inner>,
}

struct Inner {
  manifest_path: PathBuf,
  admin: RwLock<Option<AdminClient>>,
  rpc: RwLock<Option<RpcClient>>,
  manifest: RwLock<Option<Manifest>>,
  last_mtime: RwLock<Option<SystemTime>>,
}

impl NodeBridge {
  pub fn new(manifest_path: PathBuf) -> Self {
    Self {
      inner: Arc::new(Inner {
        manifest_path,
        admin: RwLock::new(None),
        rpc: RwLock::new(None),
        manifest: RwLock::new(None),
        last_mtime: RwLock::new(None),
      }),
    }
  }

  /// Try to (re)load clients if node.json appeared or changed.
  pub fn maybe_refresh(&self) {
    let meta = match fs::metadata(&self.inner.manifest_path) {
      Ok(m) => m,
      Err(_) => return,
    };
    let mtime = meta.modified().ok();
    {
      let last = self.inner.last_mtime.read();
      if *last == mtime { return; }
    }

    if let Ok(m) = read_manifest(&self.inner.manifest_path) {
      if let Some((admin, rpc)) = build_clients(&m) {
        *self.inner.admin.write() = Some(admin);
        *self.inner.rpc.write() = Some(rpc);
        *self.inner.manifest.write() = Some(m);
        *self.inner.last_mtime.write() = mtime;
      }
    }
  }

  /// Update from an already-parsed manifest (e.g., on startup).
  pub fn update_manifest(&self, m: Manifest) {
    if let Some((admin, rpc)) = build_clients(&m) {
      *self.inner.admin.write() = Some(admin);
      *self.inner.rpc.write() = Some(rpc);
      *self.inner.manifest.write() = Some(m);
      *self.inner.last_mtime.write() = Some(SystemTime::now());
    }
  }

  /// Get an AdminClient, attempting a lazy refresh first.
  pub fn admin(&self) -> Result<AdminClient, &'static str> {
    if self.inner.admin.read().is_none() { self.maybe_refresh(); }
    self.inner.admin.read().clone().ok_or("admin not ready")
  }

  /// Get an RpcClient, attempting a lazy refresh first.
  pub fn rpc(&self) -> Result<RpcClient, &'static str> {
    if self.inner.rpc.read().is_none() { self.maybe_refresh(); }
    self.inner.rpc.read().clone().ok_or("rpc not ready")
  }

  /// Snapshot of the last loaded manifest.
  pub fn manifest(&self) -> Option<Manifest> {
    self.inner.manifest.read().clone()
  }

  #[allow(dead_code)]
  pub fn manifest_path(&self) -> &PathBuf {
    &self.inner.manifest_path
  }
}

fn build_clients(m: &Manifest) -> Option<(AdminClient, RpcClient)> {
  let admin = AdminClient::from_manifest(m);

  let base = format!("http://{}:{}", m.rpc.host, m.rpc.port);
  let path = std::env::var("ARK_RPC_PATH").unwrap_or_else(|_| "/".to_string());
  let headers = HeaderMap::new();
  let rpc = RpcClient::new(base, path, Duration::from_secs(10), false, &headers).ok()?;

  Some((admin, rpc))
}
