// src/admin_client.rs
use crate::{manifest::Manifest, types::{AdminHealthz, AdminStatus}};
use reqwest::{Client, StatusCode};
use std::time::Duration;

#[derive(Clone)]
pub struct AdminClient {
  base: String,   // http://127.0.0.1:PORT
  token: String,
  http: Client,
}

#[derive(Debug, thiserror::Error)]
pub enum AdminError {
  #[error("admin HTTP {0}")]
  Http(StatusCode),
  #[error(transparent)]
  Net(#[from] reqwest::Error),
}

impl AdminClient {
  pub fn new(host: impl AsRef<str>, port: u16, token: impl Into<String>, timeout: Duration) -> Self {
    let http = Client::builder()
      .timeout(timeout)
      .user_agent("arknet-tauri/1")
      .build()
      .expect("reqwest client");
    Self {
      base: format!("http://{}:{}", host.as_ref(), port),
      token: token.into(),
      http,
    }
  }

  pub fn from_manifest(m: &Manifest) -> Self {
    Self::new(&m.admin.host, m.admin.port, m.admin.token.clone(), Duration::from_secs(5))
  }

  #[inline]
  fn url(&self, p: &str) -> String { format!("{}{}", self.base, p) }

  #[inline]
  fn auth(&self, req: reqwest::RequestBuilder) -> reqwest::RequestBuilder {
    req.bearer_auth(&self.token)
  }

  pub async fn healthz(&self) -> Result<AdminHealthz, AdminError> {
    let r = self.auth(self.http.get(self.url("/v1/healthz"))).send().await?;
    if !r.status().is_success() { return Err(AdminError::Http(r.status())); }
    Ok(r.json::<AdminHealthz>().await?)
  }

  pub async fn status(&self) -> Result<AdminStatus, AdminError> {
    let r = self.auth(self.http.get(self.url("/v1/status"))).send().await?;
    if !r.status().is_success() { return Err(AdminError::Http(r.status())); }
    Ok(r.json::<AdminStatus>().await?)
  }

  pub async fn shutdown(&self) -> Result<bool, AdminError> {
    let r = self.auth(self.http.post(self.url("/v1/shutdown"))).send().await?;
    if r.status() == StatusCode::ACCEPTED { Ok(true) } else { Err(AdminError::Http(r.status())) }
  }

  /// Redacted token for logs/UI (head4…tail4).
  pub fn token_redacted(&self) -> String {
    let t = self.token.as_str();
    match t.len() {
      0 => "".into(),
      1..=8 => t.into(),
      n => format!("{}…{}", &t[..4], &t[n-4..]),
    }
  }

  pub fn base(&self) -> &str { &self.base }
}
