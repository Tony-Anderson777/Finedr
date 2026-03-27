// Smart File Manager - Backend Rust pour Tauri
// Accès au système de fichiers Windows réel

#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use serde::{Deserialize, Serialize};
use std::fs;
use std::path::{Path, PathBuf};
use std::time::SystemTime;
use chrono::{DateTime, Utc};

// ============ TYPES ============

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum FileType {
    #[serde(rename = "folder")]
    Folder,
    #[serde(rename = "file")]
    File,
    #[serde(rename = "image")]
    Image,
    #[serde(rename = "document")]
    Document,
    #[serde(rename = "video")]
    Video,
    #[serde(rename = "audio")]
    Audio,
    #[serde(rename = "archive")]
    Archive,
    #[serde(rename = "code")]
    Code,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FileItem {
    pub id: String,
    pub name: String,
    pub path: String,
    #[serde(rename = "type")]
    pub file_type: FileType,
    pub size: u64,
    pub extension: Option<String>,
    pub is_hidden: bool,
    pub created_at: String,
    pub modified_at: String,
    pub is_favorite: bool,
    pub thumbnail_url: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DriveInfo {
    pub name: String,
    pub path: String,
    pub total_space: u64,
    pub free_space: u64,
    pub drive_type: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BreadcrumbItem {
    pub id: String,
    pub name: String,
    pub path: String,
}

// ============ HELPER FUNCTIONS ============

fn get_file_type(path: &Path) -> FileType {
    if path.is_dir() {
        return FileType::Folder;
    }
    
    let extension = path.extension()
        .and_then(|e| e.to_str())
        .unwrap_or("")
        .to_lowercase();
    
    match extension.as_str() {
        // Images
        "jpg" | "jpeg" | "png" | "gif" | "webp" | "svg" | "bmp" | "ico" | "heic" | "tiff" => FileType::Image,
        // Documents
        "pdf" | "doc" | "docx" | "xls" | "xlsx" | "ppt" | "pptx" | "txt" | "rtf" | "odt" | "md" | "csv" => FileType::Document,
        // Videos
        "mp4" | "mov" | "avi" | "mkv" | "webm" | "flv" | "wmv" | "m4v" => FileType::Video,
        // Audio
        "mp3" | "wav" | "flac" | "aac" | "ogg" | "m4a" | "wma" => FileType::Audio,
        // Archives
        "zip" | "rar" | "7z" | "tar" | "gz" | "bz2" => FileType::Archive,
        // Code
        "js" | "jsx" | "ts" | "tsx" | "py" | "rs" | "java" | "cpp" | "c" | "h" | "css" | "html" | "json" | "xml" | "sql" | "sh" | "bat" | "ps1" => FileType::Code,
        // Default
        _ => FileType::File,
    }
}

fn system_time_to_string(time: SystemTime) -> String {
    let datetime: DateTime<Utc> = time.into();
    datetime.to_rfc3339()
}

fn is_hidden(path: &Path) -> bool {
    #[cfg(windows)]
    {
        use std::os::windows::fs::MetadataExt;
        if let Ok(metadata) = fs::metadata(path) {
            const FILE_ATTRIBUTE_HIDDEN: u32 = 0x2;
            return metadata.file_attributes() & FILE_ATTRIBUTE_HIDDEN != 0;
        }
    }
    
    // Fallback: check if name starts with dot
    path.file_name()
        .and_then(|n| n.to_str())
        .map(|n| n.starts_with('.'))
        .unwrap_or(false)
}

fn path_to_id(path: &Path) -> String {
    // Use base64-like encoding of path as ID
    base64_encode(path.to_string_lossy().as_ref())
}

fn base64_encode(input: &str) -> String {
    use std::collections::hash_map::DefaultHasher;
    use std::hash::{Hash, Hasher};
    let mut hasher = DefaultHasher::new();
    input.hash(&mut hasher);
    format!("{:x}", hasher.finish())
}

// ============ TAURI COMMANDS ============

#[tauri::command]
async fn list_files(path: String, show_hidden: bool) -> Result<Vec<FileItem>, String> {
    let dir_path = if path.is_empty() || path == "/" {
        // On Windows, return drives at root
        #[cfg(windows)]
        {
            return list_drives().await;
        }
        #[cfg(not(windows))]
        {
            PathBuf::from("/")
        }
    } else {
        PathBuf::from(&path)
    };
    
    if !dir_path.exists() {
        return Err(format!("Path does not exist: {}", path));
    }
    
    let mut items: Vec<FileItem> = Vec::new();
    
    match fs::read_dir(&dir_path) {
        Ok(entries) => {
            for entry in entries.filter_map(|e| e.ok()) {
                let entry_path = entry.path();
                
                // Skip hidden files if not showing them
                if !show_hidden && is_hidden(&entry_path) {
                    continue;
                }
                
                let metadata = match fs::metadata(&entry_path) {
                    Ok(m) => m,
                    Err(_) => continue,
                };
                
                let name = entry_path.file_name()
                    .and_then(|n| n.to_str())
                    .unwrap_or("")
                    .to_string();
                
                let extension = entry_path.extension()
                    .and_then(|e| e.to_str())
                    .map(|s| s.to_string());
                
                let created_at = metadata.created()
                    .map(system_time_to_string)
                    .unwrap_or_else(|_| "".to_string());
                
                let modified_at = metadata.modified()
                    .map(system_time_to_string)
                    .unwrap_or_else(|_| "".to_string());
                
                let item = FileItem {
                    id: path_to_id(&entry_path),
                    name,
                    path: entry_path.to_string_lossy().to_string(),
                    file_type: get_file_type(&entry_path),
                    size: if metadata.is_file() { metadata.len() } else { 0 },
                    extension,
                    is_hidden: is_hidden(&entry_path),
                    created_at,
                    modified_at,
                    is_favorite: false,
                    thumbnail_url: None,
                };
                
                items.push(item);
            }
        }
        Err(e) => return Err(format!("Cannot read directory: {}", e)),
    }
    
    // Sort: folders first, then alphabetically
    items.sort_by(|a, b| {
        match (&a.file_type, &b.file_type) {
            (FileType::Folder, FileType::Folder) => a.name.to_lowercase().cmp(&b.name.to_lowercase()),
            (FileType::Folder, _) => std::cmp::Ordering::Less,
            (_, FileType::Folder) => std::cmp::Ordering::Greater,
            _ => a.name.to_lowercase().cmp(&b.name.to_lowercase()),
        }
    });
    
    Ok(items)
}

#[cfg(windows)]
async fn list_drives() -> Result<Vec<FileItem>, String> {
    let mut drives: Vec<FileItem> = Vec::new();
    
    // Check drives A-Z
    for letter in b'A'..=b'Z' {
        let drive_path = format!("{}:\\", letter as char);
        let path = Path::new(&drive_path);
        
        if path.exists() {
            let name = format!("Disque local ({}:)", letter as char);
            drives.push(FileItem {
                id: path_to_id(path),
                name,
                path: drive_path,
                file_type: FileType::Folder,
                size: 0,
                extension: None,
                is_hidden: false,
                created_at: "".to_string(),
                modified_at: "".to_string(),
                is_favorite: false,
                thumbnail_url: None,
            });
        }
    }
    
    Ok(drives)
}

#[tauri::command]
async fn get_breadcrumbs(path: String) -> Result<Vec<BreadcrumbItem>, String> {
    let mut breadcrumbs: Vec<BreadcrumbItem> = Vec::new();
    
    if path.is_empty() || path == "/" {
        breadcrumbs.push(BreadcrumbItem {
            id: "root".to_string(),
            name: "Ce PC".to_string(),
            path: "".to_string(),
        });
        return Ok(breadcrumbs);
    }
    
    let file_path = PathBuf::from(&path);
    let mut current = Some(file_path.as_path());
    let mut parts: Vec<BreadcrumbItem> = Vec::new();
    
    while let Some(p) = current {
        let name = if p.parent().is_none() {
            // This is a root/drive
            p.to_string_lossy().to_string().trim_end_matches('\\').to_string()
        } else {
            p.file_name()
                .and_then(|n| n.to_str())
                .unwrap_or("")
                .to_string()
        };
        
        if !name.is_empty() {
            parts.push(BreadcrumbItem {
                id: path_to_id(p),
                name,
                path: p.to_string_lossy().to_string(),
            });
        }
        
        current = p.parent();
    }
    
    // Add "Ce PC" at the beginning
    breadcrumbs.push(BreadcrumbItem {
        id: "root".to_string(),
        name: "Ce PC".to_string(),
        path: "".to_string(),
    });
    
    // Reverse to get correct order (root to current)
    parts.reverse();
    breadcrumbs.extend(parts);
    
    Ok(breadcrumbs)
}

#[tauri::command]
async fn create_folder(path: String, name: String) -> Result<FileItem, String> {
    let parent_path = PathBuf::from(&path);
    let new_folder_path = parent_path.join(&name);
    
    fs::create_dir(&new_folder_path)
        .map_err(|e| format!("Cannot create folder: {}", e))?;
    
    let metadata = fs::metadata(&new_folder_path)
        .map_err(|e| format!("Cannot read metadata: {}", e))?;
    
    Ok(FileItem {
        id: path_to_id(&new_folder_path),
        name,
        path: new_folder_path.to_string_lossy().to_string(),
        file_type: FileType::Folder,
        size: 0,
        extension: None,
        is_hidden: false,
        created_at: metadata.created().map(system_time_to_string).unwrap_or_default(),
        modified_at: metadata.modified().map(system_time_to_string).unwrap_or_default(),
        is_favorite: false,
        thumbnail_url: None,
    })
}

#[tauri::command]
async fn rename_file(path: String, new_name: String) -> Result<String, String> {
    let file_path = PathBuf::from(&path);
    let parent = file_path.parent()
        .ok_or("Cannot get parent directory")?;
    let new_path = parent.join(&new_name);
    
    fs::rename(&file_path, &new_path)
        .map_err(|e| format!("Cannot rename: {}", e))?;
    
    Ok(new_path.to_string_lossy().to_string())
}

#[tauri::command]
async fn delete_file(path: String, permanent: bool) -> Result<(), String> {
    let file_path = PathBuf::from(&path);
    
    if permanent {
        // Permanent delete
        if file_path.is_dir() {
            fs::remove_dir_all(&file_path)
                .map_err(|e| format!("Cannot delete folder: {}", e))?;
        } else {
            fs::remove_file(&file_path)
                .map_err(|e| format!("Cannot delete file: {}", e))?;
        }
    } else {
        // Move to trash
        trash::delete(&file_path)
            .map_err(|e| format!("Cannot move to trash: {}", e))?;
    }
    
    Ok(())
}

#[tauri::command]
async fn copy_file(source: String, destination: String) -> Result<String, String> {
    let src_path = PathBuf::from(&source);
    let dest_dir = PathBuf::from(&destination);
    
    let file_name = src_path.file_name()
        .ok_or("Invalid source path")?;
    let dest_path = dest_dir.join(file_name);
    
    // Handle name collision
    let final_dest = if dest_path.exists() {
        let stem = dest_path.file_stem()
            .and_then(|s| s.to_str())
            .unwrap_or("file");
        let ext = dest_path.extension()
            .and_then(|e| e.to_str())
            .map(|e| format!(".{}", e))
            .unwrap_or_default();
        
        let mut counter = 1;
        loop {
            let new_name = format!("{} (copie{}){}", stem, if counter > 1 { format!(" {}", counter) } else { "".to_string() }, ext);
            let new_path = dest_dir.join(&new_name);
            if !new_path.exists() {
                break new_path;
            }
            counter += 1;
        }
    } else {
        dest_path
    };
    
    if src_path.is_dir() {
        copy_dir_recursive(&src_path, &final_dest)?;
    } else {
        fs::copy(&src_path, &final_dest)
            .map_err(|e| format!("Cannot copy file: {}", e))?;
    }
    
    Ok(final_dest.to_string_lossy().to_string())
}

fn copy_dir_recursive(src: &Path, dst: &Path) -> Result<(), String> {
    fs::create_dir_all(dst)
        .map_err(|e| format!("Cannot create directory: {}", e))?;
    
    for entry in fs::read_dir(src).map_err(|e| format!("Cannot read directory: {}", e))? {
        let entry = entry.map_err(|e| format!("Cannot read entry: {}", e))?;
        let src_path = entry.path();
        let dst_path = dst.join(entry.file_name());
        
        if src_path.is_dir() {
            copy_dir_recursive(&src_path, &dst_path)?;
        } else {
            fs::copy(&src_path, &dst_path)
                .map_err(|e| format!("Cannot copy file: {}", e))?;
        }
    }
    
    Ok(())
}

#[tauri::command]
async fn move_file(source: String, destination: String) -> Result<String, String> {
    let src_path = PathBuf::from(&source);
    let dest_dir = PathBuf::from(&destination);
    
    let file_name = src_path.file_name()
        .ok_or("Invalid source path")?;
    let dest_path = dest_dir.join(file_name);
    
    fs::rename(&src_path, &dest_path)
        .map_err(|e| format!("Cannot move file: {}", e))?;
    
    Ok(dest_path.to_string_lossy().to_string())
}

#[tauri::command]
async fn get_file_content(path: String) -> Result<String, String> {
    fs::read_to_string(&path)
        .map_err(|e| format!("Cannot read file: {}", e))
}

#[tauri::command]
async fn search_files(path: String, query: String, max_results: usize) -> Result<Vec<FileItem>, String> {
    let search_path = if path.is_empty() { 
        // Search all drives on Windows
        #[cfg(windows)]
        {
            PathBuf::from("C:\\")
        }
        #[cfg(not(windows))]
        {
            PathBuf::from("/")
        }
    } else { 
        PathBuf::from(&path) 
    };
    
    let query_lower = query.to_lowercase();
    let mut results: Vec<FileItem> = Vec::new();
    
    for entry in walkdir::WalkDir::new(&search_path)
        .max_depth(5)
        .into_iter()
        .filter_map(|e| e.ok())
    {
        if results.len() >= max_results {
            break;
        }
        
        let entry_path = entry.path();
        let name = entry_path.file_name()
            .and_then(|n| n.to_str())
            .unwrap_or("");
        
        if name.to_lowercase().contains(&query_lower) {
            let metadata = match fs::metadata(entry_path) {
                Ok(m) => m,
                Err(_) => continue,
            };
            
            let extension = entry_path.extension()
                .and_then(|e| e.to_str())
                .map(|s| s.to_string());
            
            results.push(FileItem {
                id: path_to_id(entry_path),
                name: name.to_string(),
                path: entry_path.to_string_lossy().to_string(),
                file_type: get_file_type(entry_path),
                size: if metadata.is_file() { metadata.len() } else { 0 },
                extension,
                is_hidden: is_hidden(entry_path),
                created_at: metadata.created().map(system_time_to_string).unwrap_or_default(),
                modified_at: metadata.modified().map(system_time_to_string).unwrap_or_default(),
                is_favorite: false,
                thumbnail_url: None,
            });
        }
    }
    
    Ok(results)
}

#[tauri::command]
async fn get_user_directories() -> Result<Vec<FileItem>, String> {
    let mut dirs: Vec<FileItem> = Vec::new();
    
    let user_dirs = [
        ("Bureau", dirs::desktop_dir()),
        ("Documents", dirs::document_dir()),
        ("Images", dirs::picture_dir()),
        ("Vidéos", dirs::video_dir()),
        ("Musique", dirs::audio_dir()),
        ("Téléchargements", dirs::download_dir()),
    ];
    
    for (name, dir_opt) in user_dirs {
        if let Some(dir) = dir_opt {
            if dir.exists() {
                let metadata = fs::metadata(&dir).ok();
                dirs.push(FileItem {
                    id: path_to_id(&dir),
                    name: name.to_string(),
                    path: dir.to_string_lossy().to_string(),
                    file_type: FileType::Folder,
                    size: 0,
                    extension: None,
                    is_hidden: false,
                    created_at: metadata.as_ref()
                        .and_then(|m| m.created().ok())
                        .map(system_time_to_string)
                        .unwrap_or_default(),
                    modified_at: metadata.as_ref()
                        .and_then(|m| m.modified().ok())
                        .map(system_time_to_string)
                        .unwrap_or_default(),
                    is_favorite: true,
                    thumbnail_url: None,
                });
            }
        }
    }
    
    Ok(dirs)
}

#[tauri::command]
async fn open_file_with_default_app(path: String) -> Result<(), String> {
    open::that(&path).map_err(|e| format!("Cannot open file: {}", e))
}

// ============ MAIN ============

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_os::init())
        .invoke_handler(tauri::generate_handler![
            list_files,
            get_breadcrumbs,
            create_folder,
            rename_file,
            delete_file,
            copy_file,
            move_file,
            get_file_content,
            search_files,
            get_user_directories,
            open_file_with_default_app,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
