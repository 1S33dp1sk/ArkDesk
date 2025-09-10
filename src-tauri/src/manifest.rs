use serde::Deserialize;
use std::{fs, io, path::Path};

#[derive(Debug, Clone, Deserialize)]
pub struct Manifest {
  pub pid: u32,
  #[serde(rename = "startedAt")]
  pub started_at: u64,
  pub version: String,
  #[serde(rename = "abiRev")]
  pub abi_rev: u32,
  #[serde(default)]
  pub features: Vec<String>,
  pub admin: Admin,
  pub rpc: Rpc,
  #[serde(default)]
  pub net: Option<Net>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct Admin { pub host: String, pub port: u16, pub token: String }

#[derive(Debug, Clone, Deserialize)]
pub struct Rpc { pub host: String, pub port: u16 }

#[derive(Debug, Clone, Deserialize)]
pub struct Net { pub name: String, pub id: u16 }

pub fn read_manifest(path: &Path) -> io::Result<Manifest> {
  let s = fs::read_to_string(path)?;
  let m: Manifest = serde_json::from_str(&s)
    .map_err(|e| io::Error::new(io::ErrorKind::InvalidData, e))?;
  Ok(m)
}
