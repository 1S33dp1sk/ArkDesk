use serde::Serialize;
use std::{
    fs,
    io,
    path::{Path, PathBuf},
};

use crate::settings::ark_home;

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Skip { pub path: String, pub reason: String }

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CleanupReport {
    pub removed: Vec<String>,
    pub skipped: Vec<Skip>,
}

fn clear_readonly(p: &Path) -> io::Result<()> {
    if let Ok(meta) = fs::symlink_metadata(p) {
        let mut perm = meta.permissions();
        if perm.readonly() {
            perm.set_readonly(false);
            let _ = fs::set_permissions(p, perm);
        }
    }
    if p.is_dir() {
        for e in fs::read_dir(p)? {
            let e = e?;
            clear_readonly(&e.path())?;
        }
    }
    Ok(())
}

fn remove_tree(p: &Path) -> Result<(), String> {
    clear_readonly(p).ok();
    fs::remove_dir_all(p).map_err(|e| format!("{}: {}", p.display(), e))
}

fn candidate_spurious_paths() -> Vec<PathBuf> {
    let mut v = Vec::new();
    if let Ok(cwd) = std::env::current_dir() {
        #[cfg(target_os = "windows")]
        v.push(cwd.join("Arknet"));
        #[cfg(not(target_os = "windows"))]
        v.push(cwd.join(".arknet"));
    }
    v
}

/// Remove wrongly-created Arknet folders in the current working directory.
/// - force=false: only if empty
/// - force=true: remove recursively
#[tauri::command]
pub fn cleanup_spurious_dirs(force: bool) -> Result<CleanupReport, String> {
    let mut removed = Vec::new();
    let mut skipped = Vec::new();

    for p in candidate_spurious_paths() {
        if !p.exists() { continue; }
        if p == ark_home() {
            skipped.push(Skip { path: p.display().to_string(), reason: "is ark_home()".into() });
            continue;
        }
        if !force {
            match fs::read_dir(&p) {
                Ok(mut it) => {
                    if it.next().is_none() {
                        remove_tree(&p)?;
                        removed.push(p.display().to_string());
                    } else {
                        skipped.push(Skip { path: p.display().to_string(), reason: "not empty (use force)".into() });
                    }
                }
                Err(e) => skipped.push(Skip { path: p.display().to_string(), reason: e.to_string() }),
            }
        } else {
            remove_tree(&p)?;
            removed.push(p.display().to_string());
        }
    }

    Ok(CleanupReport { removed, skipped })
}

/// Wipe the real Arknet home directory after an explicit confirmation token.
#[tauri::command]
pub fn wipe_ark_home(confirm: String) -> Result<CleanupReport, String> {
    if confirm != "ARKNET-NUKE" {
        return Err("confirmation token mismatch".into());
    }
    let home = ark_home();
    if !home.exists() {
        return Ok(CleanupReport { removed: vec![], skipped: vec![Skip{ path: home.display().to_string(), reason: "not found".into() }] });
    }
    remove_tree(&home)?;
    Ok(CleanupReport { removed: vec![home.display().to_string()], skipped: vec![] })
}
