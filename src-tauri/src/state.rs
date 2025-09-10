// src/state.rs
use crate::{
  admin_client::AdminClient,
  manifest::{read_manifest, Manifest},
};
use parking_lot::RwLock;
use std::{fs, path::PathBuf, sync::Arc, time::SystemTime};

#[derive(Clone)]
pub struct NodeBridge {
  inner: Arc<Inner>,
}

struct Inner {
  manifest_path: PathBuf,
  client: RwLock<Option<AdminClient>>,
  last_mtime: RwLock<Option<SystemTime>>,
}

impl NodeBridge {
  pub fn new(manifest_path: PathBuf) -> Self {
    Self {
      inner: Arc::new(Inner {
        manifest_path,
        client: RwLock::new(None),
        last_mtime: RwLock::new(None),
      }),
    }
  }

  /// Try to (re)load client if node.json appeared or changed.
  pub fn maybe_refresh(&self) {
    let meta = match fs::metadata(&self.inner.manifest_path) {
      Ok(m) => m,
      Err(_) => {
        // File missing: leave any existing client as-is; next success will replace it.
        return;
      }
    };

    let mtime = meta.modified().ok();
    let mut last = self.inner.last_mtime.write();

    // No change? bail early.
    if *last == mtime {
      return;
    }

    if let Ok(m) = read_manifest(&self.inner.manifest_path) {
      let newc = AdminClient::from_manifest(&m);
      *self.inner.client.write() = Some(newc);
      *last = mtime;
    }
  }

  /// Update from an already-parsed manifest (e.g., on startup).
  pub fn update_manifest(&self, m: Manifest) {
    *self.inner.client.write() = Some(AdminClient::from_manifest(&m));
    *self.inner.last_mtime.write() = Some(SystemTime::now());
  }

  /// Get an AdminClient, attempting a lazy refresh first.
  pub fn admin(&self) -> Result<AdminClient, &'static str> {
    if self.inner.client.read().is_none() {
      self.maybe_refresh();
    }
    self.inner
      .client
      .read()
      .clone()
      .ok_or("admin not ready")
  }

  #[allow(dead_code)]
  pub fn manifest_path(&self) -> &PathBuf {
    &self.inner.manifest_path
  }
}
