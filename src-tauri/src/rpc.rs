use anyhow::{anyhow, Result};
use reqwest::{header::HeaderMap, Client};
use serde_json::{json, Value};
use std::time::Duration;

pub struct RpcResult {
  pub raw: Value,
  pub key_for_cache: String,
  pub value_for_cache: Option<Value>,
}

fn build_client(timeout: Duration, insecure: bool, headers: &HeaderMap) -> Result<Client> {
  let mut builder = reqwest::Client::builder()
    .timeout(timeout)
    .default_headers(headers.clone());

  if insecure {
    // behind the "dangerous-client-config" feature (enabled in Cargo.toml)
    builder = builder
      .danger_accept_invalid_certs(true)
      .danger_accept_invalid_hostnames(true);
  }
  Ok(builder.build()?)
}

pub async fn call_with(
  base: &str,
  method: &str,
  params: Value,
  timeout: Duration,
  insecure: bool,
  headers: HeaderMap,
) -> Result<RpcResult> {
  let client = build_client(timeout, insecure, &headers)?;
  let url = format!("{}/rpc", base.trim_end_matches('/'));
  let req_body = json!({ "method": method, "params": params });

  let resp = client.post(url).json(&req_body).send().await?;
  if !resp.status().is_success() {
    return Err(anyhow!("RPC {} HTTP {}", method, resp.status()));
  }
  let v: Value = resp.json().await?;

  // Normalize result
  let (raw, cache_key, cache_val) = match v {
    Value::Object(ref o) if o.get("result").is_some() => {
      let res = o.get("result").cloned().unwrap_or(Value::Null);
      (v.clone(), "result".to_string(), Some(res))
    }
    Value::Object(_) => (v.clone(), "object".to_string(), Some(v.clone())),
    _ => (v.clone(), "raw".to_string(), None),
  };

  Ok(RpcResult { raw, key_for_cache: cache_key, value_for_cache: cache_val })
}
