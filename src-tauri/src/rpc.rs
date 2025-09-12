// src/rpc.rs
use anyhow::{Context, Result};
use reqwest::{header::HeaderMap, Client, StatusCode};
use serde::{de::DeserializeOwned, Serialize};
use serde_json::{json, Value};
use std::sync::{Arc, atomic::{AtomicU64, Ordering}};
use std::time::Duration;

#[derive(Debug, Clone)]
pub struct RpcClient {
  base: String,     // e.g. http://127.0.0.1:8645
  path: String,     // e.g. "/" or "/rpc"
  http: Client,
  next_id: Arc<AtomicU64>,
}

#[derive(Debug, Clone)]
pub struct RpcResult {
  pub raw: Value,               // full JSON-RPC envelope
  pub result: Option<Value>,    // extracted "result" if present
  pub cache_key: String,        // method+params fingerprint
}

#[derive(Debug, thiserror::Error)]
pub enum RpcError {
  #[error("RPC {method} HTTP {status}")]
  Http { method: String, status: StatusCode },
  #[error("RPC {method} error {code}: {message}")]
  Remote { method: String, code: i64, message: String, data: Option<Value> },
}

fn build_client(timeout: Duration, insecure: bool, headers: &HeaderMap) -> Result<Client> {
  let mut b = reqwest::Client::builder()
    .timeout(timeout)
    .default_headers(headers.clone());
  if insecure {
    b = b
      .danger_accept_invalid_certs(true)
      .danger_accept_invalid_hostnames(true);
  }
  Ok(b.build()?)
}

impl RpcClient {
  pub fn new(
    base: impl Into<String>,
    path: impl Into<String>,
    timeout: Duration,
    insecure: bool,
    headers: &HeaderMap,
  ) -> Result<Self> {
    Ok(Self {
      base: base.into().trim_end_matches('/').to_string(),
      path: {
        let p = path.into();
        if p.is_empty() { "/".to_string() } else { if p.starts_with('/') { p } else { format!("/{}", p) } }
      },
      http: build_client(timeout, insecure, headers)?,
      next_id: Arc::new(AtomicU64::new(1)),
    })
  }

  #[inline]
  fn url(&self) -> String { format!("{}{}", self.base, self.path) }

  pub async fn call_value<P: Serialize>(&self, method: &str, params: P) -> Result<RpcResult> {
    let id = self.next_id.fetch_add(1, Ordering::Relaxed);
    let body = json!({ "jsonrpc": "2.0", "id": id, "method": method, "params": params });

    let resp = self.http.post(self.url()).json(&body).send().await
      .with_context(|| format!("RPC {} send failed", method))?;
    if !resp.status().is_success() {
      return Err(RpcError::Http { method: method.to_string(), status: resp.status() }.into());
    }
    let v: Value = resp.json().await.with_context(|| "RPC decode failed")?;

    if let Some(err) = v.get("error") {
      let code = err.get("code").and_then(|c| c.as_i64()).unwrap_or(0);
      let msg  = err.get("message").and_then(|m| m.as_str()).unwrap_or("error").to_string();
      let data = err.get("data").cloned();
      return Err(RpcError::Remote { method: method.to_string(), code, message: msg, data }.into());
    }

    let result = v.get("result").cloned();
    let cache_key = {
      let mut fp = String::new();
      fp.push_str(method);
      fp.push(':');
      fp.push_str(&serde_json::to_string(&body.get("params")).unwrap_or_default());
      fp
    };

    Ok(RpcResult { raw: v, result, cache_key })
  }

  pub async fn call<T, P>(&self, method: &str, params: P) -> Result<T>
  where
    T: DeserializeOwned,
    P: Serialize,
  {
    let out = self.call_value(method, params).await?;
    let res = out.result.ok_or_else(|| anyhow::anyhow!("RPC {} missing result", method))?;
    let typed: T = serde_json::from_value(res).with_context(|| format!("RPC {} type mismatch", method))?;
    Ok(typed)
  }
}
