use serde::Serialize;
use std::path::Path;
use crate::settings::load_settings;

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ValidationReport {
    pub c_lib_exists: bool,
    pub c_lib_ext_ok: bool,
    pub ark_py_exists: bool,
}

fn has_ext<P: AsRef<std::path::Path>>(p: P, exts: &[&str]) -> bool {
    p.as_ref()
        .extension()
        .and_then(|e| e.to_str())
        .map(|e| exts.iter().any(|x| e.eq_ignore_ascii_case(x)))
        .unwrap_or(false)
}

#[tauri::command]
pub fn validate_settings() -> Result<ValidationReport, String> {
    let s = load_settings();

    let c_path = Path::new(&s.c_lib_path);
    let a_path = Path::new(&s.ark_py_path);

    let c_exists = c_path.is_file();
    let c_ext_ok = has_ext(&c_path, &["dll", "so", "dylib"]);
    let ark_exists = a_path.is_file();

    Ok(ValidationReport {
        c_lib_exists: c_exists,
        c_lib_ext_ok: c_ext_ok,
        ark_py_exists: ark_exists,
    })
}
