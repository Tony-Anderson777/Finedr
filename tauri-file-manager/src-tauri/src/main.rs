// Smart File Manager - Backend Rust pour Tauri
// Accès au système de fichiers Windows réel

#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use serde::{Deserialize, Serialize};
use std::fs;
use std::path::{Path, PathBuf};
use std::time::SystemTime;
use chrono::{DateTime, Utc};
use sysinfo::Disks;

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
    pub used_space: u64,
    pub drive_type: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CategoryUsage {
    pub category: String,
    pub size: u64,
    pub count: u64,
    pub color: String,
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
    // Encode the full path as hex — deterministic and collision-free
    path.to_string_lossy()
        .bytes()
        .map(|b| format!("{:02x}", b))
        .collect()
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

    // Block deletion of drive roots (e.g. C:\, D:\)
    #[cfg(windows)]
    {
        let p = path.trim_end_matches(['\\', '/']);
        if p.len() <= 2 && p.ends_with(':') {
            return Err("Cannot delete a drive root".to_string());
        }
    }
    // Block deletion if the path has no parent (Unix root "/")
    if file_path.parent().is_none() {
        return Err("Cannot delete filesystem root".to_string());
    }

    if !file_path.exists() {
        return Err(format!("Path does not exist: {}", path));
    }

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

// ── ZIP / Extract ─────────────────────────────────────────────────────────────

/// Compress a list of paths into a ZIP archive at `dest_path`.
#[tauri::command]
async fn zip_items(paths: Vec<String>, dest_path: String) -> Result<String, String> {
    use zip::write::{FileOptions, ZipWriter};
    use zip::CompressionMethod;
    use std::io::{Read, Write};

    let dest = PathBuf::from(&dest_path);
    let file = std::fs::File::create(&dest).map_err(|e| format!("Impossible de créer le ZIP : {}", e))?;
    let mut zip = ZipWriter::new(file);

    let options: FileOptions<()> = FileOptions::default()
        .compression_method(CompressionMethod::Deflated)
        .unix_permissions(0o644);

    for path_str in &paths {
        let src = PathBuf::from(path_str);
        if src.is_file() {
            let name = src.file_name().map(|n| n.to_string_lossy().to_string())
                .unwrap_or_else(|| "file".to_string());
            zip.start_file(&name, options).map_err(|e| e.to_string())?;
            let mut f = std::fs::File::open(&src).map_err(|e| e.to_string())?;
            let mut buf = Vec::new();
            f.read_to_end(&mut buf).map_err(|e| e.to_string())?;
            zip.write_all(&buf).map_err(|e| e.to_string())?;
        } else if src.is_dir() {
            let dir_name = src.file_name().map(|n| n.to_string_lossy().to_string())
                .unwrap_or_else(|| "folder".to_string());
            for entry in walkdir::WalkDir::new(&src).into_iter().filter_map(|e| e.ok()) {
                let relative = entry.path().strip_prefix(&src).map_err(|e| e.to_string())?;
                let zip_path = format!("{}/{}", dir_name, relative.to_string_lossy().replace('\\', "/"));
                if entry.file_type().is_file() {
                    zip.start_file(&zip_path, options).map_err(|e| e.to_string())?;
                    let mut f = std::fs::File::open(entry.path()).map_err(|e| e.to_string())?;
                    let mut buf = Vec::new();
                    f.read_to_end(&mut buf).map_err(|e| e.to_string())?;
                    zip.write_all(&buf).map_err(|e| e.to_string())?;
                } else if !relative.as_os_str().is_empty() {
                    zip.add_directory(&zip_path, options).map_err(|e| e.to_string())?;
                }
            }
        }
    }

    zip.finish().map_err(|e| format!("Finalisation ZIP : {}", e))?;
    Ok(format!("Archive créée : {}", dest_path))
}

/// Extract a ZIP archive into a destination folder.
#[tauri::command]
async fn extract_zip(zip_path: String, dest_dir: String) -> Result<String, String> {
    use zip::ZipArchive;

    let file = std::fs::File::open(&zip_path).map_err(|e| format!("Impossible d'ouvrir le ZIP : {}", e))?;
    let mut archive = ZipArchive::new(file).map_err(|e| e.to_string())?;
    let dest = PathBuf::from(&dest_dir);

    for i in 0..archive.len() {
        let mut entry = archive.by_index(i).map_err(|e| e.to_string())?;
        let out_path = dest.join(entry.name());

        if entry.name().ends_with('/') {
            fs::create_dir_all(&out_path).map_err(|e| e.to_string())?;
        } else {
            if let Some(parent) = out_path.parent() {
                fs::create_dir_all(parent).map_err(|e| e.to_string())?;
            }
            let mut out_file = std::fs::File::create(&out_path).map_err(|e| e.to_string())?;
            std::io::copy(&mut entry, &mut out_file).map_err(|e| e.to_string())?;
        }
    }

    Ok(format!("{} fichier(s) extrait(s) dans {}", archive.len(), dest_dir))
}

// ── Tree view ─────────────────────────────────────────────────────────────────

#[derive(Debug, Serialize, Deserialize)]
pub struct TreeNode {
    pub name: String,
    pub path: String,
    pub is_folder: bool,
    pub size: u64,
    pub extension: Option<String>,
    pub file_count: u64,
    pub children: Vec<TreeNode>,
}

fn build_tree_node(path: &Path, current_depth: u32, max_depth: u32) -> TreeNode {
    let name = path.file_name()
        .map(|n| n.to_string_lossy().to_string())
        .unwrap_or_else(|| path.to_string_lossy().to_string());
    let path_str = path.to_string_lossy().to_string();

    if !path.is_dir() {
        let size = fs::metadata(path).map(|m| m.len()).unwrap_or(0);
        let extension = path.extension().map(|e| e.to_string_lossy().to_string());
        return TreeNode { name, path: path_str, is_folder: false, size, extension, file_count: 1, children: vec![] };
    }

    if current_depth >= max_depth {
        let size = recursive_dir_size(path);
        let file_count = walkdir::WalkDir::new(path).max_depth(8).into_iter()
            .filter_map(|e| e.ok()).filter(|e| e.file_type().is_file()).count() as u64;
        return TreeNode { name, path: path_str, is_folder: true, size, extension: None, file_count, children: vec![] };
    }

    let mut children: Vec<TreeNode> = vec![];
    let mut total_size = 0u64;
    let mut total_files = 0u64;

    if let Ok(entries) = fs::read_dir(path) {
        let mut entries_vec: Vec<std::fs::DirEntry> = entries.flatten()
            .filter(|e| !e.file_name().to_string_lossy().starts_with('.'))
            .collect();
        entries_vec.sort_by(|a, b| {
            let a_dir = a.file_type().map(|t| t.is_dir()).unwrap_or(false);
            let b_dir = b.file_type().map(|t| t.is_dir()).unwrap_or(false);
            if a_dir != b_dir { b_dir.cmp(&a_dir) } else { a.file_name().cmp(&b.file_name()) }
        });
        for entry in entries_vec.iter().take(200) {
            let child = build_tree_node(&entry.path(), current_depth + 1, max_depth);
            total_size += child.size;
            total_files += child.file_count;
            children.push(child);
        }
    }

    TreeNode { name, path: path_str, is_folder: true, size: total_size, extension: None, file_count: total_files, children }
}

#[tauri::command]
async fn get_folder_tree(path: String, max_depth: Option<u32>) -> Result<TreeNode, String> {
    let root = PathBuf::from(&path);
    if !root.exists() { return Err(format!("Chemin invalide : {}", path)); }
    Ok(build_tree_node(&root, 0, max_depth.unwrap_or(4)))
}

// ── Cleanup analysis ──────────────────────────────────────────────────────────

#[derive(Debug, Serialize, Deserialize)]
pub struct CleanupCandidate {
    pub path: String,
    pub name: String,
    pub size: u64,
    pub reason: String,
    pub category: String,
}

fn fmt_bytes(b: u64) -> String {
    if b >= 1_073_741_824 { format!("{:.1} Go", b as f64 / 1_073_741_824.0) }
    else if b >= 1_048_576 { format!("{:.1} Mo", b as f64 / 1_048_576.0) }
    else if b >= 1024 { format!("{} Ko", b / 1024) }
    else { format!("{} o", b) }
}

#[tauri::command]
async fn get_cleanup_candidates(path: String) -> Result<Vec<CleanupCandidate>, String> {
    use std::time::{SystemTime, Duration};
    let root = PathBuf::from(&path);
    if !root.is_dir() { return Err(format!("Chemin invalide : {}", path)); }

    let mut candidates: Vec<CleanupCandidate> = vec![];
    let one_year_ago = SystemTime::now()
        .checked_sub(Duration::from_secs(365 * 24 * 3600))
        .unwrap_or(SystemTime::UNIX_EPOCH);

    let temp_exts = ["tmp", "temp", "log", "bak", "old", "dmp", "crdownload", "part"];
    let temp_names = ["thumbs.db", "desktop.ini", "$recycle.bin", "pagefile.sys",
                      "hiberfil.sys", ".ds_store", "ehthumbs.db", "ehthumbs_vista.db"];

    for entry in walkdir::WalkDir::new(&root).max_depth(6).into_iter().filter_map(|e| e.ok()) {
        let ep = entry.path();
        let name_lower = entry.file_name().to_string_lossy().to_lowercase();
        let name_orig  = entry.file_name().to_string_lossy().to_string();
        let path_str   = ep.to_string_lossy().to_string();
        let Ok(meta)   = entry.metadata() else { continue; };

        if meta.is_file() {
            let size = meta.len();
            let ext  = ep.extension().and_then(|e| e.to_str()).unwrap_or("").to_lowercase();

            // Fichiers temporaires
            if temp_exts.contains(&ext.as_str())
                || temp_names.contains(&name_lower.as_str())
                || name_lower.starts_with("~$")
            {
                candidates.push(CleanupCandidate {
                    path: path_str, name: name_orig, size,
                    reason: "Fichier temporaire ou système".to_string(),
                    category: "temp".to_string(),
                });
                continue;
            }

            // Fichiers volumineux (>200 Mo)
            if size > 200 * 1024 * 1024 {
                candidates.push(CleanupCandidate {
                    path: path_str.clone(), name: name_orig.clone(), size,
                    reason: format!("Fichier volumineux ({})", fmt_bytes(size)),
                    category: "large".to_string(),
                });
            }

            // Fichiers anciens non modifiés (>1 an, >10 Mo)
            if size > 10 * 1024 * 1024 {
                if let Ok(modified) = meta.modified() {
                    if modified < one_year_ago && !candidates.iter().any(|c| c.path == path_str) {
                        candidates.push(CleanupCandidate {
                            path: path_str, name: name_orig, size,
                            reason: "Non modifié depuis plus d'un an".to_string(),
                            category: "old".to_string(),
                        });
                    }
                }
            }
        } else if meta.is_dir() && ep != root {
            // Dossiers vides
            let is_empty = fs::read_dir(ep).map(|mut d| d.next().is_none()).unwrap_or(false);
            if is_empty {
                candidates.push(CleanupCandidate {
                    path: path_str, name: name_orig, size: 0,
                    reason: "Dossier vide".to_string(),
                    category: "empty".to_string(),
                });
            }
        }
    }

    candidates.sort_by(|a, b| b.size.cmp(&a.size));
    candidates.truncate(100);
    Ok(candidates)
}

// ── Disk analysis ─────────────────────────────────────────────────────────────

#[derive(Debug, Serialize, Deserialize)]
pub struct FolderSizeEntry {
    pub name: String,
    pub path: String,
    pub size: u64,
    pub is_folder: bool,
}

fn recursive_dir_size(path: &Path) -> u64 {
    walkdir::WalkDir::new(path)
        .max_depth(12)
        .into_iter()
        .filter_map(|e| e.ok())
        .filter(|e| e.file_type().is_file())
        .filter_map(|e| e.metadata().ok())
        .map(|m| m.len())
        .sum()
}

#[tauri::command]
async fn get_subdirectory_sizes(path: String) -> Result<Vec<FolderSizeEntry>, String> {
    let base = PathBuf::from(&path);
    if !base.is_dir() { return Err(format!("Chemin invalide : {}", path)); }

    let mut items: Vec<FolderSizeEntry> = vec![];

    for entry in fs::read_dir(&base).map_err(|e| e.to_string())?.flatten() {
        let name = entry.file_name().to_string_lossy().to_string();
        if name.starts_with('.') { continue; }
        let Ok(meta) = entry.metadata() else { continue; };
        let item_path = entry.path().to_string_lossy().to_string();

        let (size, is_folder) = if meta.is_dir() {
            (recursive_dir_size(&entry.path()), true)
        } else {
            (meta.len(), false)
        };

        items.push(FolderSizeEntry { name, path: item_path, size, is_folder });
    }

    items.sort_by(|a, b| b.size.cmp(&a.size));
    Ok(items)
}

#[tauri::command]
async fn get_disk_spaces() -> Result<Vec<DriveInfo>, String> {
    let disks = Disks::new_with_refreshed_list();
    let mut result: Vec<DriveInfo> = Vec::new();

    for disk in disks.list() {
        let mount = disk.mount_point();
        let total = disk.total_space();
        let free = disk.available_space();
        let used = total.saturating_sub(free);
        let name = disk.name().to_string_lossy().to_string();
        let path = mount.to_string_lossy().to_string();

        result.push(DriveInfo {
            name: if name.is_empty() { format!("Disque ({})", &path) } else { name },
            path,
            total_space: total,
            free_space: free,
            used_space: used,
            drive_type: format!("{:?}", disk.kind()),
        });
    }

    Ok(result)
}

#[tauri::command]
async fn analyze_directory_categories(path: String) -> Result<Vec<CategoryUsage>, String> {
    use std::collections::HashMap;

    let scan_path = PathBuf::from(&path);
    if !scan_path.exists() {
        return Err(format!("Path does not exist: {}", path));
    }

    // category name → (size, count, color)
    let mut categories: HashMap<&str, (u64, u64, &str)> = HashMap::from([
        ("Images",   (0, 0, "#FF9500")),
        ("Vidéos",   (0, 0, "#AF52DE")),
        ("Audio",    (0, 0, "#FF2D55")),
        ("Documents",(0, 0, "#007AFF")),
        ("Code",     (0, 0, "#32ADE6")),
        ("Archives", (0, 0, "#8E8E93")),
        ("Autres",   (0, 0, "#34C759")),
    ]);

    for entry in walkdir::WalkDir::new(&scan_path)
        .max_depth(6)
        .into_iter()
        .filter_map(|e| e.ok())
        .filter(|e| e.file_type().is_file())
    {
        let size = entry.metadata().map(|m| m.len()).unwrap_or(0);
        let ext = entry.path().extension()
            .and_then(|e| e.to_str())
            .unwrap_or("")
            .to_lowercase();

        let cat = match ext.as_str() {
            "jpg"|"jpeg"|"png"|"gif"|"webp"|"svg"|"bmp"|"heic"|"tiff"|"ico" => "Images",
            "mp4"|"mov"|"avi"|"mkv"|"webm"|"flv"|"wmv"|"m4v" => "Vidéos",
            "mp3"|"wav"|"flac"|"aac"|"ogg"|"m4a"|"wma" => "Audio",
            "pdf"|"doc"|"docx"|"xls"|"xlsx"|"ppt"|"pptx"|"txt"|"rtf"|"odt"|"md"|"csv" => "Documents",
            "js"|"jsx"|"ts"|"tsx"|"py"|"rs"|"java"|"cpp"|"c"|"h"|"css"|"html"|"json"|"xml"|"sql"|"sh"|"bat" => "Code",
            "zip"|"rar"|"7z"|"tar"|"gz"|"bz2" => "Archives",
            _ => "Autres",
        };

        if let Some(entry_mut) = categories.get_mut(cat) {
            entry_mut.0 += size;
            entry_mut.1 += 1;
        }
    }

    let mut result: Vec<CategoryUsage> = categories
        .into_iter()
        .filter(|(_, (size, _, _))| *size > 0)
        .map(|(name, (size, count, color))| CategoryUsage {
            category: name.to_string(),
            size,
            count,
            color: color.to_string(),
        })
        .collect();

    result.sort_by(|a, b| b.size.cmp(&a.size));
    Ok(result)
}

#[tauri::command]
async fn get_onedrive_directories() -> Result<Vec<FileItem>, String> {
    let mut dirs: Vec<FileItem> = Vec::new();
    let mut seen = std::collections::HashSet::new();

    // Check all known OneDrive environment variables
    let candidates = [
        std::env::var("OneDriveConsumer").ok(),
        std::env::var("OneDrive").ok(),
        std::env::var("OneDriveCommercial").ok(),
    ];

    // Also try the default path as fallback
    let fallback = dirs::home_dir().map(|h| h.join("OneDrive").to_string_lossy().to_string());

    for path_str in candidates.into_iter().flatten().chain(fallback) {
        if seen.contains(&path_str) {
            continue;
        }
        seen.insert(path_str.clone());

        let root = PathBuf::from(&path_str);
        if !root.exists() {
            continue;
        }

        let meta = fs::metadata(&root).ok();
        dirs.push(FileItem {
            id: path_to_id(&root),
            name: "OneDrive".to_string(),
            path: root.to_string_lossy().to_string(),
            file_type: FileType::Folder,
            size: 0,
            extension: None,
            is_hidden: false,
            created_at: meta.as_ref().and_then(|m| m.created().ok()).map(system_time_to_string).unwrap_or_default(),
            modified_at: meta.as_ref().and_then(|m| m.modified().ok()).map(system_time_to_string).unwrap_or_default(),
            is_favorite: true,
            thumbnail_url: None,
        });

        // Add common OneDrive sub-folders if they exist
        for (label, sub) in [("Documents", "Documents"), ("Images", "Pictures"), ("Bureau", "Desktop")] {
            let sub_path = root.join(sub);
            if sub_path.exists() {
                let sub_meta = fs::metadata(&sub_path).ok();
                dirs.push(FileItem {
                    id: path_to_id(&sub_path),
                    name: label.to_string(),
                    path: sub_path.to_string_lossy().to_string(),
                    file_type: FileType::Folder,
                    size: 0,
                    extension: None,
                    is_hidden: false,
                    created_at: sub_meta.as_ref().and_then(|m| m.created().ok()).map(system_time_to_string).unwrap_or_default(),
                    modified_at: sub_meta.as_ref().and_then(|m| m.modified().ok()).map(system_time_to_string).unwrap_or_default(),
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
    let file_path = PathBuf::from(&path);

    // Reject anything that isn't an existing file or directory on disk
    if !file_path.exists() {
        return Err(format!("Path does not exist: {}", path));
    }
    if !file_path.is_file() && !file_path.is_dir() {
        return Err("Invalid path: must be a file or directory".to_string());
    }

    open::that(&file_path).map_err(|e| format!("Cannot open file: {}", e))
}

// ============ AI MODULE (MCP-style, metadata-only) ============

const AI_SYSTEM_PROMPT: &str = "\
Tu es un assistant d'organisation de fichiers intégré à Finedr. \
Tu as accès UNIQUEMENT aux noms, extensions, tailles et dates de modification des fichiers — jamais à leur contenu. \
Analyse les patterns, suggère des améliorations d'organisation, détecte les anomalies et réponds aux questions de l'utilisateur. \
Réponds en français, de façon concise et actionnable (max 400 mots). \
Ne mentionne jamais que tu n'as pas accès au contenu — c'est voulu et ne l'explique pas.";

#[derive(Debug, Serialize, Deserialize)]
pub struct FileMetaForAi {
    pub name: String,
    pub ext: Option<String>,
    pub size_kb: f64,
    pub is_folder: bool,
    pub modified: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct AiAnalysisRequest {
    pub path: String,
    pub provider: String,       // "claude" | "ollama"
    pub api_key: Option<String>,
    pub model: String,          // "claude-haiku-4-5-20251001" or "llama3.2" etc.
    pub question: Option<String>,
    pub history: Option<Vec<AiChatMessage>>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct AiChatMessage {
    pub role: String,    // "user" | "assistant"
    pub content: String,
}

fn collect_metadata_for_ai(path: &Path) -> Result<Vec<FileMetaForAi>, String> {
    let entries = fs::read_dir(path).map_err(|e| e.to_string())?;
    let mut files: Vec<FileMetaForAi> = entries
        .flatten()
        .filter_map(|e| {
            let name = e.file_name().to_string_lossy().to_string();
            if name.starts_with('.') { return None; } // skip hidden
            let meta = e.metadata().ok()?;
            let is_folder = meta.is_dir();
            let size_kb = if is_folder { 0.0 } else { meta.len() as f64 / 1024.0 };
            let modified = meta.modified().ok()
                .map(|t| {
                    let dt: DateTime<Utc> = t.into();
                    dt.format("%Y-%m-%d").to_string()
                })
                .unwrap_or_default();
            let ext = if is_folder { None } else {
                Path::new(&name).extension()
                    .map(|e| e.to_string_lossy().to_lowercase().to_string())
            };
            Some(FileMetaForAi { name, ext, size_kb, is_folder, modified })
        })
        .collect();

    files.sort_by(|a, b| b.is_folder.cmp(&a.is_folder).then(a.name.cmp(&b.name)));
    files.truncate(150); // cap prompt size
    Ok(files)
}

fn build_file_context(files: &[FileMetaForAi], path: &str) -> String {
    let mut lines = vec![
        format!("Répertoire actif : {}", path),
        format!("Éléments : {}", files.len()),
        String::new(),
        "Contenu (métadonnées uniquement) :".to_string(),
    ];
    for f in files {
        let icon = if f.is_folder { "📁" } else { "📄" };
        let ext = f.ext.as_deref().map(|e| format!(".{}", e)).unwrap_or_default();
        let size = if f.is_folder { String::new() } else if f.size_kb >= 1024.0 {
            format!("  {:.1} Mo", f.size_kb / 1024.0)
        } else {
            format!("  {:.0} Ko", f.size_kb)
        };
        lines.push(format!("{} {}{}{} [{}]", icon, f.name, ext, size, f.modified));
    }
    lines.join("\n")
}


async fn call_claude(
    messages: &[serde_json::Value],
    system: &str,
    api_key: &str,
    model: &str,
) -> Result<String, String> {
    let client = reqwest::Client::new();
    let body = serde_json::json!({
        "model": model,
        "max_tokens": 2048,
        "system": system,
        "messages": messages
    });
    let resp = client
        .post("https://api.anthropic.com/v1/messages")
        .header("x-api-key", api_key)
        .header("anthropic-version", "2023-06-01")
        .header("content-type", "application/json")
        .json(&body)
        .send().await
        .map_err(|e| format!("Erreur réseau Claude : {}", e))?;

    if !resp.status().is_success() {
        let code = resp.status().as_u16();
        let text = resp.text().await.unwrap_or_default();
        let msg = if code == 401 { "Clé API invalide ou expirée".to_string() }
                  else { format!("Erreur Claude {} : {}", code, text) };
        return Err(msg);
    }
    let data: serde_json::Value = resp.json().await.map_err(|e| e.to_string())?;
    data["content"][0]["text"].as_str()
        .map(|s| s.to_string())
        .ok_or_else(|| "Réponse Claude invalide".to_string())
}

async fn call_ollama(
    messages: &[serde_json::Value],
    model: &str,
) -> Result<String, String> {
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(120))
        .build().map_err(|e| e.to_string())?;
    let body = serde_json::json!({
        "model": model,
        "messages": messages,
        "stream": false
    });
    let resp = client
        .post("http://localhost:11434/api/chat")
        .json(&body)
        .send().await
        .map_err(|e| format!("Ollama inaccessible : {}", e))?;

    if !resp.status().is_success() {
        let code = resp.status().as_u16();
        return Err(format!("Erreur Ollama {} — modèle '{}' introuvable ?", code, model));
    }
    let data: serde_json::Value = resp.json().await.map_err(|e| e.to_string())?;
    data["message"]["content"].as_str()
        .map(|s| s.to_string())
        .ok_or_else(|| "Réponse Ollama invalide".to_string())
}

// ── Action structs ────────────────────────────────────────────────────────────

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct AiFileAction {
    pub id: String,
    pub action_type: String,
    pub description: String,
    pub source_path: Option<String>,
    pub target_path: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct AiActionPlan {
    pub summary: String,
    pub actions: Vec<AiFileAction>,
}

fn build_action_prompt(files: &[FileMetaForAi], base_path: &str) -> String {
    // Normalize base_path to backslashes for Windows
    let base = base_path.replace('/', "\\");

    let mut lines = vec![
        format!("Répertoire racine (Windows) : {}", base),
        format!("Nombre d'éléments : {}", files.len()),
        String::new(),
        "Liste des fichiers (métadonnées uniquement) :".to_string(),
    ];
    for f in files.iter().take(100) {
        let icon = if f.is_folder { "📁" } else { "📄" };
        let ext  = f.ext.as_deref().map(|e| format!(".{}", e)).unwrap_or_default();
        let size = if !f.is_folder { format!(" {:.0}Ko", f.size_kb) } else { String::new() };
        lines.push(format!("{} {}{}{} [{}]", icon, f.name, ext, size, f.modified));
    }
    lines.push(String::new());
    lines.push("INSTRUCTION : Propose un plan d'organisation COMPLET. Tu dois :".to_string());
    lines.push("1. Créer les sous-dossiers nécessaires (create_folder)".to_string());
    lines.push("2. Déplacer CHAQUE fichier dans le bon sous-dossier (move_file) — sans exception".to_string());
    lines.push(String::new());
    lines.push("RÈGLES ABSOLUES pour les chemins (système Windows) :".to_string());
    lines.push(format!("- Tous les chemins commencent EXACTEMENT par : {}", base));
    lines.push("- Utilise des backslashes \\ (jamais de slash /)".to_string());
    lines.push("- Pour move_file : \"target\" = chemin COMPLET du fichier destination (dossier + nom du fichier)".to_string());
    lines.push(String::new());
    // Concrete example with the actual base path
    let ex_folder = format!("{}\\Documents", base);
    let ex_src    = format!("{}\\rapport.pdf", base);
    let ex_dst    = format!("{}\\Documents\\rapport.pdf", base);
    lines.push("EXEMPLE CORRECT :".to_string());
    lines.push(format!(r#"{{"summary":"exemple","actions":[{{"type":"create_folder","target":"{ex_folder}","reason":"regrouper les docs"}},{{"type":"move_file","source":"{ex_src}","target":"{ex_dst}","reason":"déplacer vers Documents"}}]}}"#));
    lines.push(String::new());
    lines.push("Retourne UNIQUEMENT le JSON (aucun texte avant ou après). Max 30 actions.".to_string());
    lines.join("\n")
}

fn normalize_win_path(p: &str) -> String {
    // Replace forward slashes with backslashes and trim trailing separators
    p.replace('/', "\\").trim_end_matches('\\').to_string()
}

fn parse_action_plan(json_text: &str, base_path: &str) -> Result<AiActionPlan, String> {
    let start = json_text.find('{').ok_or("Aucun JSON dans la réponse — réessaie ou change de modèle")?;
    let end   = json_text.rfind('}').ok_or("JSON incomplet")? + 1;
    let val: serde_json::Value = serde_json::from_str(&json_text[start..end])
        .map_err(|e| format!("JSON invalide : {}. Réessaie.", e))?;

    let summary = val["summary"].as_str().unwrap_or("Plan proposé par l'IA").to_string();
    let raw     = val["actions"].as_array().ok_or("Pas de liste 'actions'")?;

    let base_norm  = normalize_win_path(base_path).to_lowercase();

    let fname = |p: &str| PathBuf::from(p).file_name()
        .map(|f| f.to_string_lossy().to_string()).unwrap_or_default();

    let actions = raw.iter().enumerate().filter_map(|(i, a)| {
        let t      = a["type"].as_str().unwrap_or("").to_string();
        // Normalize slashes in AI-generated paths
        let target = normalize_win_path(a["target"].as_str().unwrap_or(""));
        let source = a["source"].as_str().map(|s| normalize_win_path(s));
        let reason = a["reason"].as_str().unwrap_or("").to_string();

        // Case-insensitive path validation
        if target.is_empty() || !target.to_lowercase().starts_with(&base_norm) { return None; }
        if let Some(ref src) = source {
            if !src.to_lowercase().starts_with(&base_norm) { return None; }
        }

        let description = match t.as_str() {
            "create_folder" => format!("📁 Créer «{}» — {}", fname(&target), reason),
            "move_file"     => format!("📦 Déplacer «{}» → «{}» — {}",
                source.as_deref().map(|s| fname(s)).unwrap_or_default(), fname(&target), reason),
            "rename"        => format!("✏️ Renommer → «{}» — {}", fname(&target), reason),
            "delete_file"   => format!("🗑️ Supprimer «{}» — {}", fname(source.as_deref().unwrap_or(&target)), reason),
            "delete_folder" => format!("🗑️ Supprimer dossier «{}» — {}", fname(source.as_deref().unwrap_or(&target)), reason),
            _               => return None,
        };
        Some(AiFileAction { id: format!("a{}", i), action_type: t, description, source_path: source, target_path: target })
    }).collect();

    Ok(AiActionPlan { summary, actions })
}

#[tauri::command]
async fn ai_propose_actions(request: AiAnalysisRequest) -> Result<AiActionPlan, String> {
    let path = PathBuf::from(&request.path);
    if !path.is_dir() { return Err(format!("Chemin invalide : {}", request.path)); }
    let files  = collect_metadata_for_ai(&path)?;
    let prompt = build_action_prompt(&files, &request.path);
    let msgs = vec![serde_json::json!({ "role": "user", "content": prompt })];
    let json = match request.provider.as_str() {
        "claude" => {
            let key = request.api_key.as_deref().filter(|k| !k.trim().is_empty())
                .ok_or("Clé API Claude manquante")?;
            call_claude(&msgs, AI_SYSTEM_PROMPT, key, &request.model).await?
        }
        "ollama" => {
            let ollama_msgs = vec![
                serde_json::json!({ "role": "system", "content": AI_SYSTEM_PROMPT }),
                serde_json::json!({ "role": "user",   "content": prompt }),
            ];
            call_ollama(&ollama_msgs, &request.model).await?
        }
        other => return Err(format!("Fournisseur inconnu : {}", other)),
    };
    parse_action_plan(&json, &request.path)
}

#[tauri::command]
async fn ai_execute_action(action: AiFileAction) -> Result<String, String> {
    match action.action_type.as_str() {
        "create_folder" => {
            let p = PathBuf::from(&action.target_path);
            fs::create_dir_all(&p).map_err(|e| format!("Impossible de créer le dossier : {}", e))?;
            Ok(format!("Dossier créé"))
        }
        "move_file" => {
            let src = PathBuf::from(action.source_path.ok_or("Source manquante")?);
            let mut dst = PathBuf::from(&action.target_path);
            if !src.exists() { return Err(format!("Fichier introuvable : {}", src.display())); }
            // If target is an existing directory OR target path ends with a separator,
            // the AI specified a destination folder — append source filename automatically
            let target_str = &action.target_path;
            if dst.is_dir() || target_str.ends_with('\\') || target_str.ends_with('/') {
                let fname = src.file_name().ok_or("Nom de fichier source invalide")?;
                dst = dst.join(fname);
            }
            if let Some(parent) = dst.parent() {
                fs::create_dir_all(parent).map_err(|e| e.to_string())?;
            }
            fs::rename(&src, &dst).map_err(|e| format!("Impossible de déplacer «{}» : {}", src.display(), e))?;
            Ok(format!("Déplacé vers {}", dst.display()))
        }
        "rename" => {
            let src = PathBuf::from(action.source_path.ok_or("Source manquante")?);
            let dst = PathBuf::from(&action.target_path);
            if !src.exists() { return Err(format!("Fichier introuvable : {}", src.display())); }
            fs::rename(&src, &dst).map_err(|e| format!("Impossible de renommer : {}", e))?;
            Ok("Renommé".to_string())
        }
        "delete_file" => {
            let src = PathBuf::from(action.source_path.ok_or("Chemin source manquant")?);
            if !src.exists() { return Err(format!("Fichier introuvable : {}", src.display())); }
            if !src.is_file() { return Err("Le chemin ne pointe pas vers un fichier".to_string()); }
            // Block system paths
            let path_str = src.to_string_lossy().to_lowercase();
            if path_str.contains("windows") || path_str.contains("program files") {
                return Err("Suppression refusée : chemin système protégé".to_string());
            }
            fs::remove_file(&src).map_err(|e| format!("Impossible de supprimer : {}", e))?;
            Ok("Fichier supprimé".to_string())
        }
        "delete_folder" => {
            let src = PathBuf::from(action.source_path.ok_or("Chemin source manquant")?);
            if !src.exists() { return Err(format!("Dossier introuvable : {}", src.display())); }
            if !src.is_dir() { return Err("Le chemin ne pointe pas vers un dossier".to_string()); }
            let path_str = src.to_string_lossy().to_lowercase();
            if path_str.contains("windows") || path_str.contains("program files") {
                return Err("Suppression refusée : chemin système protégé".to_string());
            }
            fs::remove_dir_all(&src).map_err(|e| format!("Impossible de supprimer : {}", e))?;
            Ok("Dossier supprimé".to_string())
        }
        t => Err(format!("Action inconnue : {}", t)),
    }
}

#[tauri::command]
async fn check_ollama() -> bool {
    let Ok(client) = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(2))
        .build() else { return false; };
    client.get("http://localhost:11434/api/tags")
        .send().await
        .map(|r| r.status().is_success())
        .unwrap_or(false)
}

#[tauri::command]
async fn ai_analyze(request: AiAnalysisRequest) -> Result<String, String> {
    // Build file context (optional – only if a valid directory is open)
    let file_context: Option<String> = {
        let path = PathBuf::from(&request.path);
        if path.is_dir() {
            let files = collect_metadata_for_ai(&path)?;
            Some(build_file_context(&files, &request.path))
        } else {
            None
        }
    };

    // System prompt = base instructions + optional file context
    let system = match &file_context {
        Some(ctx) => format!("{}\n\n{}", AI_SYSTEM_PROMPT, ctx),
        None      => AI_SYSTEM_PROMPT.to_string(),
    };

    // Build conversation messages from history
    let mut messages: Vec<serde_json::Value> = vec![];
    if let Some(history) = &request.history {
        for msg in history {
            messages.push(serde_json::json!({ "role": msg.role, "content": msg.content }));
        }
    }

    // Append current user question
    let q = request.question.as_deref().unwrap_or("").trim().to_string();
    if q.is_empty() { return Err("Message vide".to_string()); }
    messages.push(serde_json::json!({ "role": "user", "content": q }));

    match request.provider.as_str() {
        "claude" => {
            let key = request.api_key.as_deref()
                .filter(|k| !k.trim().is_empty())
                .ok_or("Clé API Claude manquante — configure-la dans Préférences > IA")?;
            call_claude(&messages, &system, key, &request.model).await
        }
        "ollama" => {
            // Ollama /api/chat uses a system role message
            let mut ollama_msgs = vec![
                serde_json::json!({ "role": "system", "content": system })
            ];
            ollama_msgs.extend_from_slice(&messages);
            call_ollama(&ollama_msgs, &request.model).await
        }
        other => Err(format!("Fournisseur inconnu : {}", other)),
    }
}

// ============ FINEDR TRASH ============

fn get_trash_dir() -> Result<PathBuf, String> {
    let home = std::env::var("USERPROFILE")
        .or_else(|_| std::env::var("HOME"))
        .map_err(|_| "Impossible de trouver le dossier utilisateur".to_string())?;
    let trash = PathBuf::from(home).join(".finedr_trash");
    fs::create_dir_all(&trash).map_err(|e| e.to_string())?;
    Ok(trash)
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TrashEntry {
    pub id: String,
    pub name: String,
    pub original_path: String,
    pub trash_path: String,
    pub size: u64,
    pub deleted_at: String,
}

#[tauri::command]
fn move_to_finedr_trash(path: String) -> Result<TrashEntry, String> {
    let src = PathBuf::from(&path);
    if !src.exists() {
        return Err(format!("Fichier introuvable : {}", path));
    }
    let trash_dir = get_trash_dir()?;
    let name = src.file_name()
        .and_then(|n| n.to_str())
        .unwrap_or("fichier")
        .to_string();
    let id = format!("{}_{}", chrono::Utc::now().timestamp_millis(), name);
    let trash_path = trash_dir.join(&id);
    let size = fs::metadata(&src).map(|m| m.len()).unwrap_or(0);
    let _ = fs::rename(&src, &trash_path).or_else(|_| {
        // rename fails across drives — fall back to copy+delete
        fs::copy(&src, &trash_path)
            .and_then(|_| fs::remove_file(&src))
            .map(|_| ())
    });
    let deleted_at = chrono::Utc::now().to_rfc3339();
    Ok(TrashEntry {
        id,
        name,
        original_path: path,
        trash_path: trash_path.to_string_lossy().to_string(),
        size,
        deleted_at,
    })
}

#[tauri::command]
fn restore_from_finedr_trash(trash_path: String, original_path: String) -> Result<(), String> {
    let src = PathBuf::from(&trash_path);
    let dst = PathBuf::from(&original_path);
    if !src.exists() {
        return Err("Fichier introuvable dans la corbeille Finedr".to_string());
    }
    if let Some(parent) = dst.parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    fs::rename(&src, &dst).or_else(|_| {
        fs::copy(&src, &dst).and_then(|_| fs::remove_file(&src)).map(|_| ())
    }).map_err(|e| e.to_string())
}

#[tauri::command]
fn get_finedr_trash_path() -> Result<String, String> {
    get_trash_dir().map(|p| p.to_string_lossy().to_string())
}

// ============ FOLDER SYNC ============

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub enum SyncActionKind {
    #[serde(rename = "add")]
    Add,        // copy source → dest (new file)
    #[serde(rename = "update")]
    Update,     // overwrite dest (source is newer)
    #[serde(rename = "delete")]
    Delete,     // remove from dest (one-way: not in source)
    #[serde(rename = "add_reverse")]
    AddReverse, // copy dest → source (two-way: new in dest)
    #[serde(rename = "skip")]
    Skip,       // up-to-date, nothing to do
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SyncAction {
    pub kind: SyncActionKind,
    pub rel_path: String,
    pub source_path: String,
    pub dest_path: String,
    pub size: u64,
}

/// Collect all files recursively relative to a base dir
fn collect_files(base: &Path) -> Vec<(String, PathBuf)> {
    let mut result = Vec::new();
    fn walk(dir: &Path, base: &Path, out: &mut Vec<(String, PathBuf)>) {
        if let Ok(entries) = fs::read_dir(dir) {
            for entry in entries.flatten() {
                let path = entry.path();
                if path.is_dir() {
                    walk(&path, base, out);
                } else if path.is_file() {
                    if let Ok(rel) = path.strip_prefix(base) {
                        out.push((rel.to_string_lossy().to_string(), path.clone()));
                    }
                }
            }
        }
    }
    walk(base, base, &mut result);
    result
}

fn file_mtime(path: &Path) -> Option<u64> {
    path.metadata().ok()?.modified().ok()
        .and_then(|t| t.duration_since(SystemTime::UNIX_EPOCH).ok())
        .map(|d| d.as_secs())
}

#[tauri::command]
fn preview_sync(source: String, dest: String, mode: String) -> Result<Vec<SyncAction>, String> {
    let src_base = PathBuf::from(&source);
    let dst_base = PathBuf::from(&dest);

    if !src_base.is_dir() { return Err(format!("Source introuvable : {}", source)); }
    if !dst_base.exists() {
        fs::create_dir_all(&dst_base).map_err(|e| e.to_string())?;
    }

    let src_files = collect_files(&src_base);
    let dst_files = collect_files(&dst_base);

    let src_map: std::collections::HashMap<String, PathBuf> = src_files.into_iter().collect();
    let dst_map: std::collections::HashMap<String, PathBuf> = dst_files.into_iter().collect();

    let mut actions: Vec<SyncAction> = Vec::new();

    // Source → Dest
    for (rel, src_path) in &src_map {
        let dst_path = dst_base.join(rel);
        let size = src_path.metadata().map(|m| m.len()).unwrap_or(0);

        if let Some(dst_existing) = dst_map.get(rel) {
            // Both exist: compare modification times
            let src_mtime = file_mtime(src_path).unwrap_or(0);
            let dst_mtime = file_mtime(dst_existing).unwrap_or(0);
            if src_mtime > dst_mtime {
                actions.push(SyncAction { kind: SyncActionKind::Update, rel_path: rel.clone(), source_path: src_path.to_string_lossy().to_string(), dest_path: dst_path.to_string_lossy().to_string(), size });
            } else {
                actions.push(SyncAction { kind: SyncActionKind::Skip, rel_path: rel.clone(), source_path: src_path.to_string_lossy().to_string(), dest_path: dst_path.to_string_lossy().to_string(), size });
            }
        } else {
            // New file in source
            actions.push(SyncAction { kind: SyncActionKind::Add, rel_path: rel.clone(), source_path: src_path.to_string_lossy().to_string(), dest_path: dst_path.to_string_lossy().to_string(), size });
        }
    }

    // Dest-only files
    for (rel, dst_path) in &dst_map {
        if !src_map.contains_key(rel) {
            let src_path = src_base.join(rel);
            let size = dst_path.metadata().map(|m| m.len()).unwrap_or(0);
            if mode == "two_way" {
                // Copy back to source
                actions.push(SyncAction { kind: SyncActionKind::AddReverse, rel_path: rel.clone(), source_path: dst_path.to_string_lossy().to_string(), dest_path: src_path.to_string_lossy().to_string(), size });
            } else {
                // One-way: delete from dest
                actions.push(SyncAction { kind: SyncActionKind::Delete, rel_path: rel.clone(), source_path: src_path.to_string_lossy().to_string(), dest_path: dst_path.to_string_lossy().to_string(), size });
            }
        }
    }

    actions.sort_by(|a, b| a.rel_path.cmp(&b.rel_path));
    Ok(actions)
}

#[tauri::command]
fn sync_folders(source: String, dest: String, mode: String) -> Result<Vec<SyncAction>, String> {
    let actions = preview_sync(source, dest, mode)?;
    let mut completed: Vec<SyncAction> = Vec::new();

    for action in &actions {
        match action.kind {
            SyncActionKind::Add | SyncActionKind::Update => {
                if let Some(parent) = Path::new(&action.dest_path).parent() {
                    let _ = fs::create_dir_all(parent);
                }
                fs::copy(&action.source_path, &action.dest_path)
                    .map_err(|e| format!("Erreur copie {} : {}", action.rel_path, e))?;
                completed.push(action.clone());
            }
            SyncActionKind::Delete => {
                let _ = fs::remove_file(&action.dest_path);
                completed.push(action.clone());
            }
            SyncActionKind::AddReverse => {
                if let Some(parent) = Path::new(&action.dest_path).parent() {
                    let _ = fs::create_dir_all(parent);
                }
                fs::copy(&action.source_path, &action.dest_path)
                    .map_err(|e| format!("Erreur copie inverse {} : {}", action.rel_path, e))?;
                completed.push(action.clone());
            }
            SyncActionKind::Skip => {
                completed.push(action.clone());
            }
        }
    }

    Ok(completed)
}

// ============ MAIN ============

fn main() {
    tauri::Builder::default()
        .setup(|app| {
            let icon = app.default_window_icon().unwrap().clone();
            tauri::tray::TrayIconBuilder::with_id("main-tray")
                .icon(icon)
                .build(app)?;
            Ok(())
        })
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
            get_onedrive_directories,
            get_disk_spaces,
            analyze_directory_categories,
            get_subdirectory_sizes,
            get_folder_tree,
            get_cleanup_candidates,
            zip_items,
            extract_zip,
            open_file_with_default_app,
            check_ollama,
            ai_analyze,
            ai_propose_actions,
            ai_execute_action,
            preview_sync,
            sync_folders,
            move_to_finedr_trash,
            restore_from_finedr_trash,
            get_finedr_trash_path,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
