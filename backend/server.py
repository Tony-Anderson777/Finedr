from fastapi import FastAPI, APIRouter, HTTPException, Query
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import logging
from pathlib import Path
from pydantic import BaseModel, Field, ConfigDict
from typing import List, Optional, Dict, Any
import uuid
from datetime import datetime, timezone
from enum import Enum

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

# MongoDB connection
mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

# Create the main app without a prefix
app = FastAPI()

# Create a router with the /api prefix
api_router = APIRouter(prefix="/api")

# ================== ENUMS ==================

class FileType(str, Enum):
    FOLDER = "folder"
    FILE = "file"
    IMAGE = "image"
    DOCUMENT = "document"
    VIDEO = "video"
    AUDIO = "audio"
    ARCHIVE = "archive"
    CODE = "code"

class TagColor(str, Enum):
    RED = "red"
    ORANGE = "orange"
    YELLOW = "yellow"
    GREEN = "green"
    BLUE = "blue"
    PURPLE = "purple"
    PINK = "pink"
    GRAY = "gray"

# ================== MODELS ==================

class Tag(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    name: str
    color: TagColor = TagColor.BLUE

class TagCreate(BaseModel):
    name: str
    color: TagColor = TagColor.BLUE

class FileItem(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    name: str
    type: FileType
    parent_id: Optional[str] = None  # None means root
    size: int = 0  # in bytes
    extension: Optional[str] = None
    mime_type: Optional[str] = None
    tags: List[str] = []  # Tag IDs
    is_favorite: bool = False
    is_hidden: bool = False
    is_trashed: bool = False
    trashed_from: Optional[str] = None  # Original parent_id when trashed
    thumbnail_url: Optional[str] = None
    preview_url: Optional[str] = None
    content: Optional[str] = None  # For text files, storing content
    created_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())
    modified_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())

class FileItemCreate(BaseModel):
    name: str
    type: FileType
    parent_id: Optional[str] = None
    size: int = 0
    extension: Optional[str] = None
    mime_type: Optional[str] = None
    tags: List[str] = []
    content: Optional[str] = None
    thumbnail_url: Optional[str] = None
    preview_url: Optional[str] = None

class FileItemUpdate(BaseModel):
    name: Optional[str] = None
    parent_id: Optional[str] = None
    tags: Optional[List[str]] = None
    is_favorite: Optional[bool] = None
    is_hidden: Optional[bool] = None
    content: Optional[str] = None

class UserSettings(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = "default"
    theme: str = "system"  # light, dark, system
    accent_color: str = "blue"
    default_view: str = "icons"  # icons, list, columns, gallery
    sidebar_width: int = 220
    show_hidden_files: bool = False
    icon_size: int = 64
    list_density: str = "normal"  # compact, normal, comfortable
    favorites: List[str] = []  # File IDs

class UserSettingsUpdate(BaseModel):
    theme: Optional[str] = None
    accent_color: Optional[str] = None
    default_view: Optional[str] = None
    sidebar_width: Optional[int] = None
    show_hidden_files: Optional[bool] = None
    icon_size: Optional[int] = None
    list_density: Optional[str] = None
    favorites: Optional[List[str]] = None

class BreadcrumbItem(BaseModel):
    id: Optional[str] = None
    name: str
    path: str

class NavigationState(BaseModel):
    current_folder_id: Optional[str] = None
    breadcrumbs: List[BreadcrumbItem] = []
    selected_items: List[str] = []

# ================== HELPER FUNCTIONS ==================

async def get_breadcrumbs(folder_id: Optional[str]) -> List[BreadcrumbItem]:
    """Build breadcrumb trail from folder to root"""
    breadcrumbs = [BreadcrumbItem(id=None, name="Accueil", path="/")]
    
    if folder_id is None:
        return breadcrumbs
    
    current_id = folder_id
    trail = []
    
    while current_id:
        folder = await db.files.find_one({"id": current_id, "type": "folder"}, {"_id": 0})
        if folder:
            trail.append(BreadcrumbItem(
                id=folder["id"],
                name=folder["name"],
                path=f"/{folder['id']}"
            ))
            current_id = folder.get("parent_id")
        else:
            break
    
    trail.reverse()
    breadcrumbs.extend(trail)
    return breadcrumbs

def get_file_type_from_extension(ext: str) -> FileType:
    """Determine file type from extension"""
    ext = ext.lower().lstrip('.')
    
    image_exts = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg', 'bmp', 'ico', 'heic']
    document_exts = ['pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'txt', 'rtf', 'odt', 'md']
    video_exts = ['mp4', 'mov', 'avi', 'mkv', 'webm', 'flv', 'wmv']
    audio_exts = ['mp3', 'wav', 'flac', 'aac', 'ogg', 'm4a', 'wma']
    archive_exts = ['zip', 'rar', '7z', 'tar', 'gz', 'bz2']
    code_exts = ['js', 'jsx', 'ts', 'tsx', 'py', 'java', 'cpp', 'c', 'h', 'css', 'html', 'json', 'xml', 'sql']
    
    if ext in image_exts:
        return FileType.IMAGE
    elif ext in document_exts:
        return FileType.DOCUMENT
    elif ext in video_exts:
        return FileType.VIDEO
    elif ext in audio_exts:
        return FileType.AUDIO
    elif ext in archive_exts:
        return FileType.ARCHIVE
    elif ext in code_exts:
        return FileType.CODE
    else:
        return FileType.FILE

# ================== API ROUTES ==================

@api_router.get("/")
async def root():
    return {"message": "Smart File Manager API"}

# ---------- FILES & FOLDERS ----------

@api_router.get("/files", response_model=List[FileItem])
async def get_files(
    parent_id: Optional[str] = Query(None, description="Parent folder ID, None for root"),
    include_trashed: bool = Query(False),
    show_hidden: bool = Query(False)
):
    """Get files and folders in a directory"""
    query: Dict[str, Any] = {}
    
    if parent_id == "root" or parent_id == "":
        query["parent_id"] = None
    elif parent_id:
        query["parent_id"] = parent_id
    else:
        query["parent_id"] = None
    
    if not include_trashed:
        query["is_trashed"] = False
    
    if not show_hidden:
        query["is_hidden"] = False
    
    files = await db.files.find(query, {"_id": 0}).sort([
        ("type", 1),  # Folders first
        ("name", 1)   # Then alphabetically
    ]).to_list(1000)
    
    return files

@api_router.get("/files/{file_id}", response_model=FileItem)
async def get_file(file_id: str):
    """Get a specific file or folder"""
    file = await db.files.find_one({"id": file_id}, {"_id": 0})
    if not file:
        raise HTTPException(status_code=404, detail="File not found")
    return file

@api_router.post("/files", response_model=FileItem)
async def create_file(input: FileItemCreate):
    """Create a new file or folder"""
    file_obj = FileItem(**input.model_dump())
    
    # Auto-detect type from extension if it's a file
    if input.extension and input.type == FileType.FILE:
        file_obj.type = get_file_type_from_extension(input.extension)
    
    doc = file_obj.model_dump()
    await db.files.insert_one(doc)
    return file_obj

@api_router.patch("/files/{file_id}", response_model=FileItem)
async def update_file(file_id: str, update: FileItemUpdate):
    """Update a file or folder"""
    update_dict = {k: v for k, v in update.model_dump().items() if v is not None}
    
    if update_dict:
        update_dict["modified_at"] = datetime.now(timezone.utc).isoformat()
        await db.files.update_one({"id": file_id}, {"$set": update_dict})
    
    file = await db.files.find_one({"id": file_id}, {"_id": 0})
    if not file:
        raise HTTPException(status_code=404, detail="File not found")
    return file

@api_router.delete("/files/{file_id}")
async def delete_file(file_id: str, permanent: bool = Query(False)):
    """Move to trash or permanently delete"""
    file = await db.files.find_one({"id": file_id}, {"_id": 0})
    if not file:
        raise HTTPException(status_code=404, detail="File not found")
    
    if permanent:
        # Permanently delete
        await db.files.delete_one({"id": file_id})
        # Also delete children if it's a folder
        if file["type"] == "folder":
            await delete_folder_contents(file_id)
        return {"message": "Permanently deleted"}
    else:
        # Move to trash
        await db.files.update_one(
            {"id": file_id},
            {"$set": {
                "is_trashed": True,
                "trashed_from": file.get("parent_id"),
                "modified_at": datetime.now(timezone.utc).isoformat()
            }}
        )
        return {"message": "Moved to trash"}

async def delete_folder_contents(folder_id: str):
    """Recursively delete folder contents"""
    children = await db.files.find({"parent_id": folder_id}, {"_id": 0}).to_list(1000)
    for child in children:
        if child["type"] == "folder":
            await delete_folder_contents(child["id"])
        await db.files.delete_one({"id": child["id"]})

@api_router.post("/files/{file_id}/restore")
async def restore_file(file_id: str):
    """Restore a file from trash"""
    file = await db.files.find_one({"id": file_id, "is_trashed": True}, {"_id": 0})
    if not file:
        raise HTTPException(status_code=404, detail="File not found in trash")
    
    await db.files.update_one(
        {"id": file_id},
        {"$set": {
            "is_trashed": False,
            "parent_id": file.get("trashed_from"),
            "trashed_from": None,
            "modified_at": datetime.now(timezone.utc).isoformat()
        }}
    )
    return {"message": "Restored"}

@api_router.post("/files/{file_id}/copy")
async def copy_file(file_id: str, target_parent_id: Optional[str] = None):
    """Copy a file to a new location"""
    file = await db.files.find_one({"id": file_id}, {"_id": 0})
    if not file:
        raise HTTPException(status_code=404, detail="File not found")
    
    new_file = FileItem(
        name=f"{file['name']} (copie)",
        type=file["type"],
        parent_id=target_parent_id if target_parent_id else file.get("parent_id"),
        size=file.get("size", 0),
        extension=file.get("extension"),
        mime_type=file.get("mime_type"),
        tags=file.get("tags", []),
        content=file.get("content"),
        thumbnail_url=file.get("thumbnail_url"),
        preview_url=file.get("preview_url")
    )
    
    doc = new_file.model_dump()
    await db.files.insert_one(doc)
    return new_file

@api_router.post("/files/{file_id}/move")
async def move_file(file_id: str, target_parent_id: Optional[str] = None):
    """Move a file to a new location"""
    file = await db.files.find_one({"id": file_id}, {"_id": 0})
    if not file:
        raise HTTPException(status_code=404, detail="File not found")
    
    await db.files.update_one(
        {"id": file_id},
        {"$set": {
            "parent_id": target_parent_id,
            "modified_at": datetime.now(timezone.utc).isoformat()
        }}
    )
    return {"message": "Moved"}

# ---------- NAVIGATION ----------

@api_router.get("/navigation/{folder_id}")
async def get_navigation(folder_id: Optional[str] = None):
    """Get navigation state including breadcrumbs"""
    actual_id = None if folder_id in ["root", "null", ""] else folder_id
    breadcrumbs = await get_breadcrumbs(actual_id)
    
    return {
        "current_folder_id": actual_id,
        "breadcrumbs": breadcrumbs
    }

# ---------- FAVORITES ----------

@api_router.get("/favorites", response_model=List[FileItem])
async def get_favorites():
    """Get all favorited items"""
    files = await db.files.find(
        {"is_favorite": True, "is_trashed": False},
        {"_id": 0}
    ).to_list(100)
    return files

@api_router.post("/favorites/{file_id}")
async def toggle_favorite(file_id: str):
    """Toggle favorite status"""
    file = await db.files.find_one({"id": file_id}, {"_id": 0})
    if not file:
        raise HTTPException(status_code=404, detail="File not found")
    
    new_status = not file.get("is_favorite", False)
    await db.files.update_one(
        {"id": file_id},
        {"$set": {"is_favorite": new_status}}
    )
    return {"is_favorite": new_status}

# ---------- TRASH ----------

@api_router.get("/trash", response_model=List[FileItem])
async def get_trash():
    """Get all trashed items"""
    files = await db.files.find(
        {"is_trashed": True},
        {"_id": 0}
    ).to_list(1000)
    return files

@api_router.delete("/trash")
async def empty_trash():
    """Empty the trash"""
    trashed = await db.files.find({"is_trashed": True}, {"_id": 0}).to_list(1000)
    for file in trashed:
        if file["type"] == "folder":
            await delete_folder_contents(file["id"])
    await db.files.delete_many({"is_trashed": True})
    return {"message": "Trash emptied"}

# ---------- TAGS ----------

@api_router.get("/tags", response_model=List[Tag])
async def get_tags():
    """Get all tags"""
    tags = await db.tags.find({}, {"_id": 0}).to_list(100)
    return tags

@api_router.post("/tags", response_model=Tag)
async def create_tag(input: TagCreate):
    """Create a new tag"""
    tag = Tag(**input.model_dump())
    doc = tag.model_dump()
    await db.tags.insert_one(doc)
    return tag

@api_router.delete("/tags/{tag_id}")
async def delete_tag(tag_id: str):
    """Delete a tag"""
    await db.tags.delete_one({"id": tag_id})
    # Remove tag from all files
    await db.files.update_many(
        {"tags": tag_id},
        {"$pull": {"tags": tag_id}}
    )
    return {"message": "Tag deleted"}

@api_router.get("/files/by-tag/{tag_id}", response_model=List[FileItem])
async def get_files_by_tag(tag_id: str):
    """Get all files with a specific tag"""
    files = await db.files.find(
        {"tags": tag_id, "is_trashed": False},
        {"_id": 0}
    ).to_list(1000)
    return files

# ---------- SEARCH ----------

@api_router.get("/search", response_model=List[FileItem])
async def search_files(
    q: str = Query(..., min_length=1),
    file_type: Optional[FileType] = None
):
    """Search files by name"""
    query: Dict[str, Any] = {
        "name": {"$regex": q, "$options": "i"},
        "is_trashed": False
    }
    
    if file_type:
        query["type"] = file_type.value
    
    files = await db.files.find(query, {"_id": 0}).to_list(100)
    return files

# ---------- USER SETTINGS ----------

@api_router.get("/settings", response_model=UserSettings)
async def get_settings():
    """Get user settings"""
    settings = await db.settings.find_one({"id": "default"}, {"_id": 0})
    if not settings:
        default_settings = UserSettings()
        doc = default_settings.model_dump()
        await db.settings.insert_one(doc)
        return default_settings
    return UserSettings(**settings)

@api_router.patch("/settings", response_model=UserSettings)
async def update_settings(update: UserSettingsUpdate):
    """Update user settings"""
    update_dict = {k: v for k, v in update.model_dump().items() if v is not None}
    
    if update_dict:
        await db.settings.update_one(
            {"id": "default"},
            {"$set": update_dict},
            upsert=True
        )
    
    settings = await db.settings.find_one({"id": "default"}, {"_id": 0})
    return UserSettings(**settings)

# ---------- SEED DATA ----------

@api_router.post("/seed")
async def seed_data():
    """Seed demo data"""
    # Clear existing data
    await db.files.delete_many({})
    await db.tags.delete_many({})
    await db.settings.delete_many({})
    
    # Create default settings
    settings = UserSettings()
    await db.settings.insert_one(settings.model_dump())
    
    # Create tags
    tags_data = [
        {"name": "Important", "color": "red"},
        {"name": "Travail", "color": "blue"},
        {"name": "Personnel", "color": "green"},
        {"name": "Urgent", "color": "orange"},
        {"name": "Archive", "color": "gray"},
        {"name": "Projet", "color": "purple"},
    ]
    
    created_tags = []
    for t in tags_data:
        tag = Tag(**t)
        await db.tags.insert_one(tag.model_dump())
        created_tags.append(tag)
    
    # Create folder structure
    folders_data = [
        {"id": "documents", "name": "Documents", "parent_id": None, "type": "folder"},
        {"id": "images", "name": "Images", "parent_id": None, "type": "folder", "is_favorite": True},
        {"id": "projets", "name": "Projets", "parent_id": None, "type": "folder", "is_favorite": True},
        {"id": "telechargements", "name": "Téléchargements", "parent_id": None, "type": "folder"},
        {"id": "musique", "name": "Musique", "parent_id": None, "type": "folder"},
        {"id": "videos", "name": "Vidéos", "parent_id": None, "type": "folder"},
        {"id": "archives", "name": "Archives", "parent_id": None, "type": "folder"},
        # Subfolders
        {"id": "docs-travail", "name": "Travail", "parent_id": "documents", "type": "folder"},
        {"id": "docs-perso", "name": "Personnel", "parent_id": "documents", "type": "folder"},
        {"id": "photos-2024", "name": "Photos 2024", "parent_id": "images", "type": "folder"},
        {"id": "photos-2025", "name": "Photos 2025", "parent_id": "images", "type": "folder"},
        {"id": "projet-alpha", "name": "Projet Alpha", "parent_id": "projets", "type": "folder", "tags": [created_tags[5].id]},
        {"id": "projet-beta", "name": "Projet Beta", "parent_id": "projets", "type": "folder", "tags": [created_tags[5].id]},
    ]
    
    for f in folders_data:
        folder = FileItem(**f)
        await db.files.insert_one(folder.model_dump())
    
    # Create files
    files_data = [
        # Root files
        {"name": "README.md", "type": "document", "extension": "md", "size": 2048, "parent_id": None, "content": "# Bienvenue\n\nCeci est votre gestionnaire de fichiers intelligent."},
        {"name": "notes.txt", "type": "document", "extension": "txt", "size": 512, "parent_id": None, "content": "Notes importantes..."},
        
        # Documents
        {"name": "Rapport Annuel 2024.pdf", "type": "document", "extension": "pdf", "size": 5242880, "parent_id": "documents", "tags": [created_tags[1].id, created_tags[0].id]},
        {"name": "Budget 2025.xlsx", "type": "document", "extension": "xlsx", "size": 1048576, "parent_id": "documents", "tags": [created_tags[1].id]},
        {"name": "Présentation Équipe.pptx", "type": "document", "extension": "pptx", "size": 8388608, "parent_id": "docs-travail"},
        {"name": "Contrat fournisseur.docx", "type": "document", "extension": "docx", "size": 524288, "parent_id": "docs-travail", "tags": [created_tags[0].id, created_tags[3].id]},
        {"name": "CV Jean Dupont.pdf", "type": "document", "extension": "pdf", "size": 262144, "parent_id": "docs-perso"},
        
        # Images with real preview URLs
        {"name": "Paysage montagne.jpg", "type": "image", "extension": "jpg", "size": 3145728, "parent_id": "photos-2024", "thumbnail_url": "https://images.unsplash.com/photo-1696434168814-8c4a8b017cc1?w=200", "preview_url": "https://images.unsplash.com/photo-1696434168814-8c4a8b017cc1?w=1200"},
        {"name": "Architecture moderne.jpg", "type": "image", "extension": "jpg", "size": 2621440, "parent_id": "photos-2024", "thumbnail_url": "https://images.unsplash.com/photo-1695067440629-b5e513976100?w=200", "preview_url": "https://images.unsplash.com/photo-1695067440629-b5e513976100?w=1200"},
        {"name": "Abstract 3D.png", "type": "image", "extension": "png", "size": 4194304, "parent_id": "photos-2025", "thumbnail_url": "https://images.unsplash.com/photo-1644224076179-31d622e21511?w=200", "preview_url": "https://images.unsplash.com/photo-1644224076179-31d622e21511?w=1200"},
        {"name": "Coucher de soleil.jpg", "type": "image", "extension": "jpg", "size": 2097152, "parent_id": "images", "thumbnail_url": "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=200", "preview_url": "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=1200"},
        {"name": "Portrait studio.jpg", "type": "image", "extension": "jpg", "size": 1572864, "parent_id": "images", "thumbnail_url": "https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=200", "preview_url": "https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=1200"},
        
        # Projects
        {"name": "Specs techniques.md", "type": "document", "extension": "md", "size": 8192, "parent_id": "projet-alpha", "content": "# Spécifications\n\n## Architecture\n..."},
        {"name": "roadmap.pdf", "type": "document", "extension": "pdf", "size": 1048576, "parent_id": "projet-alpha", "tags": [created_tags[0].id]},
        {"name": "mockups.fig", "type": "file", "extension": "fig", "size": 15728640, "parent_id": "projet-beta"},
        {"name": "api_design.json", "type": "code", "extension": "json", "size": 4096, "parent_id": "projet-beta", "content": '{"version": "2.0", "endpoints": [...]}'},
        
        # Code files
        {"name": "main.py", "type": "code", "extension": "py", "size": 16384, "parent_id": "projets", "content": "# Main application\nimport os\n\ndef main():\n    pass"},
        {"name": "config.json", "type": "code", "extension": "json", "size": 2048, "parent_id": "projets", "content": '{"debug": true, "port": 8000}'},
        
        # Downloads
        {"name": "installer_v2.3.exe", "type": "file", "extension": "exe", "size": 52428800, "parent_id": "telechargements"},
        {"name": "documentation.zip", "type": "archive", "extension": "zip", "size": 10485760, "parent_id": "telechargements"},
        {"name": "sample_data.csv", "type": "document", "extension": "csv", "size": 524288, "parent_id": "telechargements"},
        
        # Music
        {"name": "playlist_été.m3u", "type": "audio", "extension": "m3u", "size": 1024, "parent_id": "musique"},
        {"name": "ambient_01.mp3", "type": "audio", "extension": "mp3", "size": 8388608, "parent_id": "musique"},
        
        # Videos
        {"name": "tutorial_part1.mp4", "type": "video", "extension": "mp4", "size": 157286400, "parent_id": "videos"},
        {"name": "conference_2024.mov", "type": "video", "extension": "mov", "size": 524288000, "parent_id": "videos"},
        
        # Archives
        {"name": "backup_2023.zip", "type": "archive", "extension": "zip", "size": 1073741824, "parent_id": "archives", "tags": [created_tags[4].id]},
        {"name": "old_project.tar.gz", "type": "archive", "extension": "tar.gz", "size": 536870912, "parent_id": "archives", "tags": [created_tags[4].id]},
    ]
    
    for f in files_data:
        file_item = FileItem(**f)
        await db.files.insert_one(file_item.model_dump())
    
    return {"message": "Data seeded successfully", "files": len(files_data) + len(folders_data), "tags": len(tags_data)}

# ---------- STATS ----------

@api_router.get("/stats")
async def get_stats():
    """Get file system stats"""
    total_files = await db.files.count_documents({"type": {"$ne": "folder"}, "is_trashed": False})
    total_folders = await db.files.count_documents({"type": "folder", "is_trashed": False})
    
    # Calculate total size
    pipeline = [
        {"$match": {"is_trashed": False}},
        {"$group": {"_id": None, "total_size": {"$sum": "$size"}}}
    ]
    result = await db.files.aggregate(pipeline).to_list(1)
    total_size = result[0]["total_size"] if result else 0
    
    trash_count = await db.files.count_documents({"is_trashed": True})
    
    return {
        "total_files": total_files,
        "total_folders": total_folders,
        "total_size": total_size,
        "trash_count": trash_count,
        "free_space": 500 * 1024 * 1024 * 1024  # Simulated 500GB free
    }

# Include the router in the main app
app.include_router(api_router)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=os.environ.get('CORS_ORIGINS', '*').split(','),
    allow_methods=["*"],
    allow_headers=["*"],
)

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()
