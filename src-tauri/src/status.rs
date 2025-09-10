use serde::{Deserialize, Serialize};
use std::time::Duration;

use crate::settings::{load_settings, NodeRole};

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NodeStatus {
    pub node_running: bool,
    pub connected: bool,
    pub peers: u32,
    pub network_height: u64,
    pub role: NodeRole,
    pub rpc_ok: bool,
    pub rpc_endpoint: String,
}

#[derive(Deserialize)]
struct ChainHeader {
    result: Option<HeaderResult>,
}
#[derive(Deserialize)]
struct HeaderResult {
    height: Option<String>,
}
#[derive(Deserialize)]
struct PeersResp {
    result: Option<PeersResult>,
}
#[derive(Deserialize)]
struct PeersResult {
    total: Option<u32>,
}

#[tauri::command]
pub async fn get_status() -> Result<NodeStatus, String> {
    let s = load_settings();
    let rpc = format!("http://127.0.0.1:{}", s.rpc_port);

    let client = reqwest::Client::builder()
        .timeout(Duration::from_millis(500))
        .build()
        .map_err(|e| e.to_string())?;

    // probe chain.header
    let hdr = client
        .post(&rpc)
        .header("content-type", "application/json")
        .body(r#"{"jsonrpc":"2.0","id":1,"method":"chain.header","params":{"tip":true}}"#)
        .send()
        .await;

    let mut network_height = 0u64;
    let mut rpc_ok = false;
    let node_running: bool;

    match hdr {
        Ok(resp) => {
            if resp.status().is_success() {
                let v: ChainHeader = resp.json().await.unwrap_or(ChainHeader { result: None });
                if let Some(h) = v.result {
                    if let Some(hs) = h.height {
                        network_height = hs.parse::<u64>().unwrap_or(0);
                    }
                }
                rpc_ok = true;
                node_running = true;
            } else {
                node_running = false;
            }
        }
        Err(_) => {
            node_running = false;
        }
    }

    // peers
    let mut peers = 0u32;
    let mut connected = false;
    if rpc_ok {
        if let Ok(resp) = client
            .post(&rpc)
            .header("content-type", "application/json")
            .body(r#"{"jsonrpc":"2.0","id":2,"method":"net.peers","params":{}}"#)
            .send()
            .await
        {
            if resp.status().is_success() {
                if let Ok(v) = resp.json::<PeersResp>().await {
                    if let Some(r) = v.result {
                        peers = r.total.unwrap_or(0);
                        connected = peers > 0;
                    }
                }
            }
        }
    }

    Ok(NodeStatus {
        node_running,
        connected,
        peers,
        network_height,
        role: s.role,
        rpc_ok,
        rpc_endpoint: rpc,
    })
}
