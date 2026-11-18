#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]
use base64::{engine::general_purpose::STANDARD, Engine};
use std::{
    fs,
    io::Write,
    path::{Path, PathBuf},
    sync::Mutex,
};
use tauri::{Manager, State};
use tauri_plugin_global_shortcut::{GlobalShortcutExt, ShortcutState};

#[derive(Default)]
struct Settings {
    folder: Mutex<Option<PathBuf>>,
    shortcut: Mutex<String>,
}

fn config(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    app.path()
        .app_config_dir()
        .map(|p| p.join("save-folder.json"))
        .map_err(|_| "无法定位配置目录".into())
}
#[tauri::command]
fn desktop_info(state: State<Settings>) -> (Option<String>, String) {
    (
        state
            .folder
            .lock()
            .unwrap()
            .as_ref()
            .map(|p| p.display().to_string()),
        state.shortcut.lock().unwrap().clone(),
    )
}
#[tauri::command]
async fn choose_folder(
    app: tauri::AppHandle,
    state: State<'_, Settings>,
) -> Result<Option<String>, String> {
    let Some(selected) = rfd::AsyncFileDialog::new().set_title("选择工作台文件保存目录").pick_folder().await else { return Ok(None) };
    let folder = selected.path().canonicalize().map_err(|_| "目录不可访问")?;
    let p = config(&app)?;
    fs::create_dir_all(p.parent().ok_or("配置路径无效")?).map_err(|_| "无法创建配置目录")?;
    fs::write(p, serde_json::to_vec(&folder).map_err(|_| "无法记录目录")?)
        .map_err(|_| "无法保存配置")?;
    *state.folder.lock().unwrap() = Some(folder.clone());
    Ok(Some(folder.display().to_string()))
}
fn write_result(folder: &Path, filename: &str, data: &[u8]) -> Result<String, String> {
    let ext = filename.rsplit_once('.').ok_or("无效文件名")?;
    if ext.0.is_empty()
        || filename.chars().count() > 100
        || !ext
            .0
            .chars()
            .all(|c| c.is_alphanumeric() || " _-".contains(c))
        || !matches!(ext.1, "md" | "xlsx" | "csv" | "png" | "mp4")
        || data.is_empty()
        || data.len() > 8 * 1024 * 1024
    {
        return Err("无效文件名、类型或大小".into());
    }
    if folder.canonicalize().ok().as_deref() != Some(folder) || !folder.is_dir() {
        return Err("目录已移动，请重新选择".into());
    }
    for i in 0..1000 {
        let name = if i == 0 {
            filename.to_owned()
        } else {
            format!("{} ({i}).{}", ext.0, ext.1)
        };
        let path = folder.join(name);
        match fs::OpenOptions::new()
            .write(true)
            .create_new(true)
            .open(&path)
        {
            Ok(mut file) => {
                if file.write_all(data).and_then(|_| file.sync_all()).is_err() {
                    drop(file);
                    let _ = fs::remove_file(&path);
                    return Err("写入失败，请检查可用空间".into());
                }
                return Ok(path.display().to_string());
            }
            Err(e) if e.kind() == std::io::ErrorKind::AlreadyExists => continue,
            Err(_) => return Err("无法写入所选目录".into()),
        }
    }
    Err("同名文件过多，请更换目录".into())
}
#[tauri::command]
async fn save_result(
    state: State<'_, Settings>,
    filename: String,
    encoded: String,
) -> Result<String, String> {
    let folder = state
        .folder
        .lock()
        .unwrap()
        .clone()
        .ok_or("请先选择保存目录")?;
    if encoded.len() > 11_184_812 {
        return Err("文件过大".into());
    }
    tauri::async_runtime::spawn_blocking(move || {
        let bytes = STANDARD.decode(encoded).map_err(|_| "文件数据无效")?;
        write_result(&folder, &filename, &bytes)
    })
    .await
    .map_err(|_| "保存任务中断")?
}
fn main() {
    tauri::Builder::default()
        .manage(Settings::default())
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        .invoke_handler(tauri::generate_handler![
            desktop_info,
            choose_folder,
            save_result
        ])
        .setup(|app| {
            let state = app.state::<Settings>();
            if let Ok(p) = config(app.handle()) {
                *state.folder.lock().unwrap() = fs::read(p)
                    .ok()
                    .and_then(|b| serde_json::from_slice::<PathBuf>(&b).ok())
                    .filter(|p| p.is_dir());
            }
            let key = if cfg!(target_os = "macos") {
                "Command+Shift+Space"
            } else {
                "Control+Shift+Space"
            };
            let registered = app
                .global_shortcut()
                .on_shortcut(key, |app, _, event| {
                    if event.state() == ShortcutState::Pressed {
                        if let Some(w) = app.get_webview_window("main") {
                            let _ = w.unminimize();
                            let _ = w.show();
                            if w.set_focus().is_ok() {
                                eprintln!("全局快捷键已唤起工作台");
                            }
                        }
                    }
                })
                .is_ok();
            *state.shortcut.lock().unwrap() = if registered {
                key.to_string()
            } else {
                "快捷键被占用，可从程序坞打开".into()
            };
            Ok(())
        })
        .on_window_event(|window, event| {
            #[cfg(target_os = "macos")]
            if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                api.prevent_close();
                let _ = window.hide();
            }
        })
        .build(tauri::generate_context!())
        .expect("无法启动桌面工作台")
        .run(|app, event| {
            #[cfg(target_os = "macos")]
            if let tauri::RunEvent::Reopen { .. } = event {
                if let Some(w) = app.get_webview_window("main") {
                    let _ = w.show();
                    let _ = w.set_focus();
                }
            }
        });
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn scoped_save() {
        let tmp = std::env::temp_dir()
            .canonicalize()
            .unwrap()
            .join(format!("openworkmate-test-{}", std::process::id()));
        fs::create_dir(&tmp).unwrap();
        let a = write_result(&tmp, "验收.md", b"first").unwrap();
        let b = write_result(&tmp, "验收.md", b"second").unwrap();
        assert_ne!(a, b);
        assert_eq!(fs::read(&a).unwrap(), b"first");
        assert_eq!(fs::read(&b).unwrap(), b"second");
        assert!(write_result(&tmp, "../越界.md", b"x").is_err());
        assert!(write_result(&tmp, "脚本.sh", b"x").is_err());
        fs::remove_file(a).unwrap();
        fs::remove_file(b).unwrap();
        fs::remove_dir(tmp).unwrap();
    }
}
