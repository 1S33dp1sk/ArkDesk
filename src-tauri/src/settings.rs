use serde::{Deserialize, Serialize};
use std::{fs, io::Write, path::PathBuf};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Settings {
    pub c_lib_path: String,
    pub ark_py_path: String,
    pub p2p_port: u16,
    pub rpc_port: u16,
    pub role: NodeRole,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum NodeRole { Relay, Miner }

impl Default for Settings {
    fn default() -> Self {
        Self { c_lib_path: String::new(), ark_py_path: String::new(), p2p_port: 8646, rpc_port: 8645, role: NodeRole::Relay }
    }
}

/* ── PATHS ───────────────────────────────────────────────────────────────── */

/// ~/.arknet on Unix & macOS, %APPDATA%\Arknet on Windows.
/// No "." fallback. If base dir is unknown, return a sentinel that won't exist.
pub fn ark_home() -> PathBuf {
    #[cfg(target_os = "windows")]
    {
        if let Some(base) = dirs::data_dir().or_else(|| std::env::var_os("APPDATA").map(PathBuf::from)) {
            return base.join("Arknet");
        }
        return PathBuf::from(r"Z:\__arknet__\not_found");
    }
    #[cfg(not(target_os = "windows"))]
    {
        if let Some(home) = dirs::home_dir().or_else(|| std::env::var_os("HOME").map(PathBuf::from)) {
            return home.join(".arknet");
        }
        return PathBuf::from("/__arknet__/not_found");
    }
}

fn cfg_path() -> PathBuf { ark_home().join("config.json") }

/* ── SETTINGS IO ─────────────────────────────────────────────────────────── */

pub fn load_settings() -> Settings {
    let p = cfg_path();
    if !p.is_file() { return Settings::default(); }
    let data = match fs::read(&p) { Ok(b) => b, Err(_) => return Settings::default() };
    serde_json::from_slice(&data).unwrap_or_default()
}

fn save_settings_inner(s: &Settings) -> std::io::Result<()> {
    let p = cfg_path();
    if let Some(parent) = p.parent() { fs::create_dir_all(parent)?; }
    let tmp = p.with_extension("json.tmp");
    let mut f = fs::File::create(&tmp)?;
    f.write_all(&serde_json::to_vec_pretty(s).unwrap())?;
    f.flush()?;
    fs::rename(tmp, p)?;
    Ok(())
}

#[tauri::command] pub fn get_settings() -> Result<Settings, String> { Ok(load_settings()) }
#[tauri::command] pub fn save_settings(settings: Settings) -> Result<(), String> {
    save_settings_inner(&settings).map_err(|e| e.to_string())
}

/* ── INSTALL / PROBE ─────────────────────────────────────────────────────── */

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct InstallProbe {
    pub home: String,
    pub present: bool,      // dir exists
    pub initialized: bool,  // bin/, data/, logs/, config.json all exist
    pub missing: Vec<String>
}

#[tauri::command]
pub fn probe_install() -> Result<InstallProbe, String> {
    let home = ark_home();
    let present = home.is_dir();

    let mut missing = Vec::<String>::new();
    for (p, name) in [
        (home.join("bin"),  "bin/"),
        (home.join("data"), "data/"),
        (home.join("logs"), "logs/"),
    ] {
        if !p.is_dir() { missing.push(name.to_string()); }
    }
    if !cfg_path().is_file() { missing.push("config.json".to_string()); }

    let initialized = present && missing.is_empty();
    Ok(InstallProbe {
        home: home.to_string_lossy().to_string(),
        present, initialized, missing
    })
}

#[tauri::command]
pub fn install_arknet() -> Result<(), String> {
    let home = ark_home();
    fs::create_dir_all(home.join("bin")).map_err(|e| e.to_string())?;
    fs::create_dir_all(home.join("data")).map_err(|e| e.to_string())?;
    fs::create_dir_all(home.join("logs")).map_err(|e| e.to_string())?;
    if !cfg_path().is_file() {
        save_settings_inner(&Settings::default()).map_err(|e| e.to_string())?;
    }
    Ok(())
}
