fn main() {
    println!("cargo:rerun-if-changed=../web-app/dist");
    tauri_build::build()
}
