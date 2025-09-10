use crate::manifest::Manifest;
use reqwest::{Client, StatusCode};
use serde_json::Value;

#[derive(Clone)]
pub struct AdminClient {
  base: String,   // http://127.0.0.1:8765
  token: String,
  http: Client,
}

impl AdminClient {
  pub fn from_manifest(m: &Manifest) -> Self {
    let base = format!("http://{}:{}", m.admin.host, m.admin.port);
    Self {
      base,
      token: m.admin.token.clone(),
      http: Client::builder()
        .user_agent("arknet-tauri/1")
        .build().expect("reqwest client"),
    }
  }

  fn auth(&self, req: reqwest::RequestBuilder) -> reqwest::RequestBuilder {
    req.bearer_auth(&self.token)
  }

  pub async fn healthz(&self) -> Result<Value, reqwest::Error> {
    let r = self.auth(self.http.get(format!("{}/v1/healthz", self.base)))
      .send().await?;
    r.error_for_status()?.json().await
  }

  pub async fn status(&self) -> Result<Value, reqwest::Error> {
    let r = self.auth(self.http.get(format!("{}/v1/status", self.base)))
      .send().await?;
    r.error_for_status()?.json().await
  }

  pub async fn shutdown(&self) -> Result<bool, reqwest::Error> {
    let r = self.auth(self.http.post(format!("{}/v1/shutdown", self.base)))
      .send().await?;
    Ok(r.status() == StatusCode::ACCEPTED)
  }
}
