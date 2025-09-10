fn main() {
    use tauri_build::Attributes;
    if let Err(e) = tauri_build::try_build(Attributes::new()) {
        eprintln!("tauri-build error: {e}");
        std::process::exit(1);
    }
}
