// src/types.rs
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::collections::BTreeMap;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct HostPort {
  pub host: String,
  pub port: u16,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AdminNet {
  pub name: String,
  pub id: u16,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AdminHealthz {
  pub ok: bool,
  pub version: String,
  #[serde(rename = "abiRev")]
  pub abi_rev: u32,
  #[serde(rename = "uptimeMs")]
  pub uptime_ms: u64,
  #[serde(default)]
  pub features: Vec<String>,
  #[serde(default)]
  pub net: Option<AdminNet>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AdminStatus {
  #[serde(rename = "nodeRunning")]
  pub node_running: bool,
  pub connected: bool,
  pub peers: u32,
  #[serde(rename = "networkHeight")]
  pub network_height: u64,
  pub role: String,
  #[serde(rename = "producerOn")]
  pub producer_on: bool,
  pub rpc: HostPort,
}

/* ── RPC typed payloads ─────────────────────────────────────────────── */

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ChainTip {
  pub height: u64,
  #[serde(default, alias = "hash", alias = "blockId", alias = "id")]
  pub block_id: Option<String>,
  #[serde(default, alias = "timestamp", alias = "timeMs", alias = "time")]
  pub timestamp_ms: Option<u64>,
  #[serde(flatten)]
  pub extra: BTreeMap<String, Value>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MempoolInfo {
  #[serde(default, alias = "count", alias = "size")]
  pub txs: Option<u64>,
  #[serde(default, alias = "bytes")]
  pub bytes: Option<u64>,
  #[serde(default)]
  pub max_items: Option<u64>,
  #[serde(default)]
  pub max_bytes: Option<u64>,
  #[serde(flatten)]
  pub extra: BTreeMap<String, Value>,
}


// append to src/types.rs
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Stale {
  pub now_ms: u64,
  pub admin_age_ms: Option<u64>,
  pub status_age_ms: Option<u64>,
  pub tip_age_ms: Option<u64>,
  pub mempool_age_ms: Option<u64>,
}
