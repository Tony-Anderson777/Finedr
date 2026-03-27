import React, { createContext, useContext, useEffect, useState, useCallback, useMemo } from "react";
import "@/App.css";
import axios from "axios";

// Lucide Icons
import {
  Folder, File, FileText, FileImage, FileVideo, FileAudio, FileArchive, FileCode,
  ChevronRight, ChevronDown, ChevronLeft,
  Search, Settings, Star, Trash2, HardDrive, Network, Tag, Monitor,
  LayoutGrid, List, Columns, GalleryHorizontal,
  Sun, Moon, Plus, MoreHorizontal, X, RefreshCw,
  Home, Copy, Scissors, Clipboard, Edit3, Info, Archive
} from "lucide-react";

// Shadcn UI Components
import { ScrollArea } from "./components/ui/scroll-area";
import { Input } from "./components/ui/input";
import { Button } from "./components/ui/button";
import { Separator } from "./components/ui/separator";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "./components/ui/collapsible";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuSub,
  ContextMenuSubContent,
  ContextMenuSubTrigger,
  ContextMenuTrigger,
} from "./components/ui/context-menu";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "./components/ui/dialog";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "./components/ui/tooltip";
import { Toaster } from "./components/ui/sonner";
import { toast } from "sonner";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

// ============ CONTEXT ============
const FileManagerContext = createContext(null);

const useFileManager = () => {
  const context = useContext(FileManagerContext);
  if (!context) throw new Error("useFileManager must be used within FileManagerProvider");
  return context;
};

// ============ THEME PROVIDER ============
const ThemeContext = createContext(null);

const useTheme = () => {
  const context = useContext(ThemeContext);
  if (!context) throw new Error("useTheme must be used within ThemeProvider");
  return context;
};

const ThemeProvider = ({ children }) => {
  const [theme, setTheme] = useState(() => {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem("theme");
      return saved || "system";
    }
    return "system";
  });

  useEffect(() => {
    const root = window.document.documentElement;
    root.classList.remove("light", "dark");

    if (theme === "system") {
      const systemTheme = window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
      root.classList.add(systemTheme);
    } else {
      root.classList.add(theme);
    }
    localStorage.setItem("theme", theme);
  }, [theme]);

  return (
    <ThemeContext.Provider value={{ theme, setTheme }}>
      {children}
    </ThemeContext.Provider>
  );
};

// ============ UTILS ============
const formatFileSize = (bytes) => {
  if (bytes === 0) return "0 o";
  const k = 1024;
  const sizes = ["o", "Ko", "Mo", "Go", "To"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + " " + sizes[i];
};

const formatDate = (dateString) => {
  const date = new Date(dateString);
  return date.toLocaleDateString("fr-FR", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  });
};

const getFileIcon = (type, extension, size = 20) => {
  const props = { size, strokeWidth: 1.5 };
  
  switch (type) {
    case "folder":
      return <Folder {...props} className="text-[#34C759]" fill="#34C759" fillOpacity={0.2} />;
    case "image":
      return <FileImage {...props} className="text-[#FF9500]" />;
    case "document":
      if (extension === "pdf") return <FileText {...props} className="text-[#FF3B30]" />;
      return <FileText {...props} className="text-[#007AFF]" />;
    case "video":
      return <FileVideo {...props} className="text-[#AF52DE]" />;
    case "audio":
      return <FileAudio {...props} className="text-[#FF2D55]" />;
    case "archive":
      return <FileArchive {...props} className="text-[#8E8E93]" />;
    case "code":
      return <FileCode {...props} className="text-[#32ADE6]" />;
    default:
      return <File {...props} className="text-[#8E8E93]" />;
  }
};

const getFileKind = (type, extension) => {
  const kinds = {
    folder: "Dossier",
    image: "Image",
    document: extension?.toUpperCase() || "Document",
    video: "Vidéo",
    audio: "Audio",
    archive: "Archive",
    code: extension?.toUpperCase() || "Code",
    file: extension?.toUpperCase() || "Fichier"
  };
  return kinds[type] || "Fichier";
};

// ============ FILE MANAGER PROVIDER ============
const FileManagerProvider = ({ children }) => {
  const [files, setFiles] = useState([]);
  const [currentFolderId, setCurrentFolderId] = useState(null);
  const [breadcrumbs, setBreadcrumbs] = useState([]);
  const [selectedFiles, setSelectedFiles] = useState([]);
  const [view, setView] = useState("icons");
  const [tags, setTags] = useState([]);
  const [favorites, setFavorites] = useState([]);
  const [trash, setTrash] = useState([]);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState(null);
  const [quickLookFile, setQuickLookFile] = useState(null);
  const [clipboard, setClipboard] = useState({ files: [], action: null });
  const [navigationHistory, setNavigationHistory] = useState({ past: [], future: [] });
  const [showHidden, setShowHidden] = useState(false);

  // Fetch files
  const fetchFiles = useCallback(async (parentId = null) => {
    try {
      setLoading(true);
      const params = new URLSearchParams();
      if (parentId) params.append("parent_id", parentId);
      params.append("show_hidden", showHidden.toString());
      
      const response = await axios.get(`${API}/files?${params}`);
      setFiles(response.data);
    } catch (error) {
      console.error("Error fetching files:", error);
      toast.error("Erreur lors du chargement des fichiers");
    } finally {
      setLoading(false);
    }
  }, [showHidden]);

  // Fetch navigation (breadcrumbs)
  const fetchNavigation = useCallback(async (folderId) => {
    try {
      const id = folderId || "root";
      const response = await axios.get(`${API}/navigation/${id}`);
      setBreadcrumbs(response.data.breadcrumbs);
    } catch (error) {
      console.error("Error fetching navigation:", error);
    }
  }, []);

  // Fetch tags
  const fetchTags = useCallback(async () => {
    try {
      const response = await axios.get(`${API}/tags`);
      setTags(response.data);
    } catch (error) {
      console.error("Error fetching tags:", error);
    }
  }, []);

  // Fetch favorites
  const fetchFavorites = useCallback(async () => {
    try {
      const response = await axios.get(`${API}/favorites`);
      setFavorites(response.data);
    } catch (error) {
      console.error("Error fetching favorites:", error);
    }
  }, []);

  // Fetch trash
  const fetchTrash = useCallback(async () => {
    try {
      const response = await axios.get(`${API}/trash`);
      setTrash(response.data);
    } catch (error) {
      console.error("Error fetching trash:", error);
    }
  }, []);

  // Fetch stats
  const fetchStats = useCallback(async () => {
    try {
      const response = await axios.get(`${API}/stats`);
      setStats(response.data);
    } catch (error) {
      console.error("Error fetching stats:", error);
    }
  }, []);

  // Seed data
  const seedData = useCallback(async () => {
    try {
      setLoading(true);
      await axios.post(`${API}/seed`);
      toast.success("Données de démonstration créées");
      await Promise.all([
        fetchFiles(null),
        fetchTags(),
        fetchFavorites(),
        fetchStats()
      ]);
    } catch (error) {
      console.error("Error seeding data:", error);
      toast.error("Erreur lors de la création des données");
    } finally {
      setLoading(false);
    }
  }, [fetchFiles, fetchTags, fetchFavorites, fetchStats]);

  // Navigate to folder
  const navigateToFolder = useCallback((folderId) => {
    setNavigationHistory(prev => ({
      past: [...prev.past, currentFolderId],
      future: []
    }));
    setCurrentFolderId(folderId);
    setSelectedFiles([]);
    setSearchResults(null);
    setSearchQuery("");
  }, [currentFolderId]);

  // Navigation back/forward
  const goBack = useCallback(() => {
    if (navigationHistory.past.length === 0) return;
    const newPast = [...navigationHistory.past];
    const previousFolder = newPast.pop();
    setNavigationHistory({
      past: newPast,
      future: [currentFolderId, ...navigationHistory.future]
    });
    setCurrentFolderId(previousFolder);
    setSelectedFiles([]);
  }, [navigationHistory, currentFolderId]);

  const goForward = useCallback(() => {
    if (navigationHistory.future.length === 0) return;
    const [nextFolder, ...newFuture] = navigationHistory.future;
    setNavigationHistory({
      past: [...navigationHistory.past, currentFolderId],
      future: newFuture
    });
    setCurrentFolderId(nextFolder);
    setSelectedFiles([]);
  }, [navigationHistory, currentFolderId]);

  // Open file/folder
  const openItem = useCallback((item) => {
    if (item.type === "folder") {
      navigateToFolder(item.id);
    } else {
      setQuickLookFile(item);
    }
  }, [navigateToFolder]);

  // Search
  const search = useCallback(async (query) => {
    if (!query.trim()) {
      setSearchResults(null);
      return;
    }
    try {
      const response = await axios.get(`${API}/search?q=${encodeURIComponent(query)}`);
      setSearchResults(response.data);
    } catch (error) {
      console.error("Error searching:", error);
    }
  }, []);

  // Toggle favorite
  const toggleFavorite = useCallback(async (fileId) => {
    try {
      const response = await axios.post(`${API}/favorites/${fileId}`);
      toast.success(response.data.is_favorite ? "Ajouté aux favoris" : "Retiré des favoris");
      await Promise.all([fetchFiles(currentFolderId), fetchFavorites()]);
    } catch (error) {
      console.error("Error toggling favorite:", error);
      toast.error("Erreur lors de la modification");
    }
  }, [currentFolderId, fetchFiles, fetchFavorites]);

  // Delete file
  const deleteFile = useCallback(async (fileId, permanent = false) => {
    try {
      await axios.delete(`${API}/files/${fileId}?permanent=${permanent}`);
      toast.success(permanent ? "Fichier supprimé définitivement" : "Déplacé vers la corbeille");
      await Promise.all([fetchFiles(currentFolderId), fetchTrash(), fetchStats()]);
      setSelectedFiles(prev => prev.filter(id => id !== fileId));
    } catch (error) {
      console.error("Error deleting file:", error);
      toast.error("Erreur lors de la suppression");
    }
  }, [currentFolderId, fetchFiles, fetchTrash, fetchStats]);

  // Create folder
  const createFolder = useCallback(async (name) => {
    try {
      await axios.post(`${API}/files`, {
        name,
        type: "folder",
        parent_id: currentFolderId
      });
      toast.success("Dossier créé");
      await fetchFiles(currentFolderId);
    } catch (error) {
      console.error("Error creating folder:", error);
      toast.error("Erreur lors de la création");
    }
  }, [currentFolderId, fetchFiles]);

  // Rename file
  const renameFile = useCallback(async (fileId, newName) => {
    try {
      await axios.patch(`${API}/files/${fileId}`, { name: newName });
      toast.success("Renommé avec succès");
      await fetchFiles(currentFolderId);
    } catch (error) {
      console.error("Error renaming file:", error);
      toast.error("Erreur lors du renommage");
    }
  }, [currentFolderId, fetchFiles]);

  // Copy/Cut/Paste
  const copyFiles = useCallback((fileIds) => {
    setClipboard({ files: fileIds, action: "copy" });
    toast.success(`${fileIds.length} élément(s) copié(s)`);
  }, []);

  const cutFiles = useCallback((fileIds) => {
    setClipboard({ files: fileIds, action: "cut" });
    toast.success(`${fileIds.length} élément(s) coupé(s)`);
  }, []);

  const pasteFiles = useCallback(async () => {
    if (clipboard.files.length === 0) return;
    
    try {
      for (const fileId of clipboard.files) {
        if (clipboard.action === "copy") {
          await axios.post(`${API}/files/${fileId}/copy`, null, {
            params: { target_parent_id: currentFolderId }
          });
        } else {
          await axios.post(`${API}/files/${fileId}/move`, null, {
            params: { target_parent_id: currentFolderId }
          });
        }
      }
      toast.success(`${clipboard.files.length} élément(s) collé(s)`);
      if (clipboard.action === "cut") {
        setClipboard({ files: [], action: null });
      }
      await fetchFiles(currentFolderId);
    } catch (error) {
      console.error("Error pasting files:", error);
      toast.error("Erreur lors du collage");
    }
  }, [clipboard, currentFolderId, fetchFiles]);

  // Empty trash
  const emptyTrash = useCallback(async () => {
    try {
      await axios.delete(`${API}/trash`);
      toast.success("Corbeille vidée");
      await Promise.all([fetchTrash(), fetchStats()]);
    } catch (error) {
      console.error("Error emptying trash:", error);
      toast.error("Erreur lors du vidage de la corbeille");
    }
  }, [fetchTrash, fetchStats]);

  // Restore from trash
  const restoreFile = useCallback(async (fileId) => {
    try {
      await axios.post(`${API}/files/${fileId}/restore`);
      toast.success("Fichier restauré");
      await Promise.all([fetchFiles(currentFolderId), fetchTrash()]);
    } catch (error) {
      console.error("Error restoring file:", error);
      toast.error("Erreur lors de la restauration");
    }
  }, [currentFolderId, fetchFiles, fetchTrash]);

  // Effects
  useEffect(() => {
    fetchFiles(currentFolderId);
    fetchNavigation(currentFolderId);
  }, [currentFolderId, fetchFiles, fetchNavigation]);

  useEffect(() => {
    fetchTags();
    fetchFavorites();
    fetchTrash();
    fetchStats();
  }, [fetchTags, fetchFavorites, fetchTrash, fetchStats]);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e) => {
      // Quick Look
      if (e.code === "Space" && selectedFiles.length === 1 && !e.target.closest("input")) {
        e.preventDefault();
        const file = files.find(f => f.id === selectedFiles[0]);
        if (file) setQuickLookFile(file);
      }
      
      // Close Quick Look
      if (e.code === "Escape") {
        setQuickLookFile(null);
      }
      
      // Navigation
      if (e.altKey && e.code === "ArrowLeft") {
        e.preventDefault();
        goBack();
      }
      if (e.altKey && e.code === "ArrowRight") {
        e.preventDefault();
        goForward();
      }
      
      // Go up
      if (e.ctrlKey && e.code === "ArrowUp") {
        e.preventDefault();
        const parentBreadcrumb = breadcrumbs[breadcrumbs.length - 2];
        if (parentBreadcrumb) {
          navigateToFolder(parentBreadcrumb.id);
        }
      }
      
      // View shortcuts
      if (e.ctrlKey && !e.shiftKey && !e.altKey) {
        if (e.code === "Digit1") { e.preventDefault(); setView("icons"); }
        if (e.code === "Digit2") { e.preventDefault(); setView("list"); }
        if (e.code === "Digit3") { e.preventDefault(); setView("columns"); }
        if (e.code === "Digit4") { e.preventDefault(); setView("gallery"); }
      }
      
      // Copy/Cut/Paste
      if (e.ctrlKey && e.code === "KeyC" && selectedFiles.length > 0 && !e.target.closest("input")) {
        e.preventDefault();
        copyFiles(selectedFiles);
      }
      if (e.ctrlKey && e.code === "KeyX" && selectedFiles.length > 0 && !e.target.closest("input")) {
        e.preventDefault();
        cutFiles(selectedFiles);
      }
      if (e.ctrlKey && e.code === "KeyV" && clipboard.files.length > 0 && !e.target.closest("input")) {
        e.preventDefault();
        pasteFiles();
      }
      
      // Delete
      if (e.code === "Delete" && selectedFiles.length > 0 && !e.target.closest("input")) {
        e.preventDefault();
        selectedFiles.forEach(id => deleteFile(id, e.shiftKey));
      }
      
      // New folder
      if (e.ctrlKey && e.shiftKey && e.code === "KeyN") {
        e.preventDefault();
        const name = prompt("Nom du nouveau dossier:");
        if (name) createFolder(name);
      }
      
      // Toggle hidden files
      if (e.ctrlKey && e.shiftKey && e.code === "Period") {
        e.preventDefault();
        setShowHidden(prev => !prev);
      }
      
      // Refresh
      if (e.code === "F5") {
        e.preventDefault();
        fetchFiles(currentFolderId);
      }
      
      // Select all
      if (e.ctrlKey && e.code === "KeyA" && !e.target.closest("input")) {
        e.preventDefault();
        setSelectedFiles(files.map(f => f.id));
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [selectedFiles, files, clipboard, breadcrumbs, currentFolderId, goBack, goForward, navigateToFolder, copyFiles, cutFiles, pasteFiles, deleteFile, createFolder, fetchFiles, setShowHidden]);

  const displayedFiles = searchResults !== null ? searchResults : files;

  const value = useMemo(() => ({
    files: displayedFiles,
    allFiles: files,
    currentFolderId,
    breadcrumbs,
    selectedFiles,
    setSelectedFiles,
    view,
    setView,
    tags,
    favorites,
    trash,
    stats,
    loading,
    searchQuery,
    setSearchQuery,
    searchResults,
    quickLookFile,
    setQuickLookFile,
    clipboard,
    navigationHistory,
    showHidden,
    setShowHidden,
    // Actions
    navigateToFolder,
    goBack,
    goForward,
    openItem,
    search,
    toggleFavorite,
    deleteFile,
    createFolder,
    renameFile,
    copyFiles,
    cutFiles,
    pasteFiles,
    emptyTrash,
    restoreFile,
    seedData,
    refresh: () => fetchFiles(currentFolderId)
  }), [
    displayedFiles, files, currentFolderId, breadcrumbs, selectedFiles, view, tags, favorites, trash, stats,
    loading, searchQuery, searchResults, quickLookFile, clipboard, navigationHistory, showHidden,
    navigateToFolder, goBack, goForward, openItem, search, toggleFavorite, deleteFile, createFolder,
    renameFile, copyFiles, cutFiles, pasteFiles, emptyTrash, restoreFile, seedData, fetchFiles
  ]);

  return (
    <FileManagerContext.Provider value={value}>
      {children}
    </FileManagerContext.Provider>
  );
};

// ============ SIDEBAR SECTION ============
const SidebarSection = ({ title, children, defaultOpen = true }) => {
  const [isOpen, setIsOpen] = useState(defaultOpen);
  
  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen} className="mb-1">
      <CollapsibleTrigger className="flex items-center gap-1 px-4 py-1.5 w-full text-left text-[11px] font-semibold text-muted-foreground uppercase tracking-wider hover:text-foreground transition-colors">
        <ChevronRight 
          size={12} 
          className={`transition-transform duration-200 ${isOpen ? "rotate-90" : ""}`}
        />
        {title}
      </CollapsibleTrigger>
      <CollapsibleContent className="animate-slide-down">
        {children}
      </CollapsibleContent>
    </Collapsible>
  );
};

// ============ SIDEBAR ITEM ============
const SidebarItem = ({ icon: Icon, label, active, onClick, badge, color }) => (
  <button
    onClick={onClick}
    className={`sidebar-item w-full ${active ? "sidebar-item-active" : ""}`}
    data-testid={`sidebar-${label.toLowerCase().replace(/\s+/g, "-")}`}
  >
    {color ? (
      <div className={`w-3 h-3 rounded-full ${color}`} />
    ) : Icon ? (
      <Icon size={16} strokeWidth={1.5} className={active ? "text-primary" : "text-muted-foreground"} />
    ) : null}
    <span className="flex-1 truncate">{label}</span>
    {badge !== undefined && (
      <span className="text-[11px] text-muted-foreground">{badge}</span>
    )}
  </button>
);

// ============ SIDEBAR ============
const Sidebar = () => {
  const { favorites, tags, trash, navigateToFolder, currentFolderId, stats } = useFileManager();
  
  const tagColors = {
    red: "bg-red-500",
    orange: "bg-orange-500",
    yellow: "bg-yellow-500",
    green: "bg-green-500",
    blue: "bg-blue-500",
    purple: "bg-purple-500",
    pink: "bg-pink-500",
    gray: "bg-gray-500"
  };
  
  return (
    <aside 
      className="w-[220px] flex-shrink-0 h-full flex flex-col border-r border-border bg-[hsl(var(--sidebar-bg))]"
      data-testid="sidebar"
    >
      <ScrollArea className="flex-1 py-2">
        {/* Favoris */}
        <SidebarSection title="Favoris">
          {favorites.length === 0 ? (
            <p className="px-4 py-2 text-[11px] text-muted-foreground italic">Glissez des dossiers ici</p>
          ) : (
            favorites.map((item) => (
              <SidebarItem
                key={item.id}
                icon={item.type === "folder" ? Folder : File}
                label={item.name}
                active={currentFolderId === item.id}
                onClick={() => navigateToFolder(item.id)}
              />
            ))
          )}
        </SidebarSection>
        
        <Separator className="my-2 mx-4" />
        
        {/* Cet appareil */}
        <SidebarSection title="Cet appareil">
          <SidebarItem
            icon={Home}
            label="Accueil"
            active={currentFolderId === null}
            onClick={() => navigateToFolder(null)}
          />
          <SidebarItem icon={Monitor} label="Bureau" onClick={() => {}} />
          <SidebarItem icon={FileText} label="Documents" onClick={() => navigateToFolder("documents")} />
          <SidebarItem icon={FileImage} label="Images" onClick={() => navigateToFolder("images")} />
          <SidebarItem icon={FileVideo} label="Vidéos" onClick={() => navigateToFolder("videos")} />
          <SidebarItem icon={FileAudio} label="Musique" onClick={() => navigateToFolder("musique")} />
          <SidebarItem icon={Archive} label="Téléchargements" onClick={() => navigateToFolder("telechargements")} />
        </SidebarSection>
        
        <Separator className="my-2 mx-4" />
        
        {/* Tags */}
        <SidebarSection title="Tags" defaultOpen={true}>
          {tags.map((tag) => (
            <SidebarItem
              key={tag.id}
              color={tagColors[tag.color]}
              label={tag.name}
              onClick={() => {}}
            />
          ))}
        </SidebarSection>
        
        <Separator className="my-2 mx-4" />
        
        {/* Stockage */}
        <SidebarSection title="Stockage" defaultOpen={false}>
          <SidebarItem icon={HardDrive} label="Disque local" badge={stats ? formatFileSize(stats.free_space) : ""} onClick={() => {}} />
          <SidebarItem icon={Network} label="Réseau" onClick={() => {}} />
        </SidebarSection>
      </ScrollArea>
      
      {/* Corbeille at bottom */}
      <div className="border-t border-border p-2">
        <SidebarItem
          icon={Trash2}
          label="Corbeille"
          badge={trash.length || undefined}
          onClick={() => {}}
        />
      </div>
    </aside>
  );
};

// ============ VIEW SWITCHER ============
const ViewSwitcher = () => {
  const { view, setView } = useFileManager();
  
  const views = [
    { id: "icons", icon: LayoutGrid, label: "Icônes" },
    { id: "list", icon: List, label: "Liste" },
    { id: "columns", icon: Columns, label: "Colonnes" },
    { id: "gallery", icon: GalleryHorizontal, label: "Galerie" }
  ];
  
  return (
    <TooltipProvider delayDuration={300}>
      <div 
        className="flex items-center p-0.5 bg-secondary rounded-md border border-border"
        data-testid="view-switcher"
      >
        {views.map(({ id, icon: Icon, label }) => (
          <Tooltip key={id}>
            <TooltipTrigger asChild>
              <button
                onClick={() => setView(id)}
                className={`view-switcher-btn ${view === id ? "view-switcher-btn-active" : ""}`}
                data-testid={`view-switcher-${id}`}
              >
                <Icon size={16} strokeWidth={1.5} />
              </button>
            </TooltipTrigger>
            <TooltipContent side="bottom" className="text-xs">
              {label} (Ctrl+{views.findIndex(v => v.id === id) + 1})
            </TooltipContent>
          </Tooltip>
        ))}
      </div>
    </TooltipProvider>
  );
};

// ============ THEME TOGGLE ============
const ThemeToggle = () => {
  const { theme, setTheme } = useTheme();
  
  const nextTheme = () => {
    if (theme === "light") setTheme("dark");
    else if (theme === "dark") setTheme("system");
    else setTheme("light");
  };
  
  return (
    <TooltipProvider delayDuration={300}>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            onClick={nextTheme}
            className="h-7 w-7"
            data-testid="theme-toggle"
          >
            {theme === "dark" ? (
              <Moon size={16} strokeWidth={1.5} />
            ) : theme === "light" ? (
              <Sun size={16} strokeWidth={1.5} />
            ) : (
              <Monitor size={16} strokeWidth={1.5} />
            )}
          </Button>
        </TooltipTrigger>
        <TooltipContent side="bottom" className="text-xs">
          Thème: {theme === "light" ? "Clair" : theme === "dark" ? "Sombre" : "Système"}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
};

// ============ BREADCRUMB ============
const Breadcrumb = () => {
  const { breadcrumbs, navigateToFolder } = useFileManager();
  
  return (
    <nav 
      className="flex items-center gap-1 text-[13px] min-w-0 flex-1"
      data-testid="breadcrumb"
    >
      {breadcrumbs.map((crumb, index) => (
        <React.Fragment key={crumb.id || "root"}>
          {index > 0 && (
            <ChevronRight size={14} className="text-muted-foreground flex-shrink-0" />
          )}
          <button
            onClick={() => navigateToFolder(crumb.id)}
            className={`truncate max-w-[150px] ${
              index === breadcrumbs.length - 1 
                ? "breadcrumb-item-current" 
                : "breadcrumb-item"
            }`}
            data-testid={`breadcrumb-${crumb.name.toLowerCase()}`}
          >
            {crumb.name}
          </button>
        </React.Fragment>
      ))}
    </nav>
  );
};

// ============ TOP BAR ============
const TopBar = () => {
  const { goBack, goForward, navigationHistory, searchQuery, setSearchQuery, search, refresh, seedData, loading, files } = useFileManager();
  
  const handleSearchChange = (e) => {
    const value = e.target.value;
    setSearchQuery(value);
    search(value);
  };
  
  return (
    <header 
      className="h-[44px] flex-shrink-0 border-b border-border flex items-center justify-between px-3 gap-3 bg-[hsl(var(--topbar-bg))]"
      data-testid="topbar"
    >
      {/* Left: Navigation */}
      <div className="flex items-center gap-1">
        <TooltipProvider delayDuration={300}>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                onClick={goBack}
                disabled={navigationHistory.past.length === 0}
                data-testid="nav-back"
              >
                <ChevronLeft size={18} strokeWidth={1.5} />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom" className="text-xs">Précédent (Alt+←)</TooltipContent>
          </Tooltip>
          
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                onClick={goForward}
                disabled={navigationHistory.future.length === 0}
                data-testid="nav-forward"
              >
                <ChevronRight size={18} strokeWidth={1.5} />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom" className="text-xs">Suivant (Alt+→)</TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </div>
      
      {/* Center: Breadcrumb */}
      <Breadcrumb />
      
      {/* Right: Search + View Switcher + Theme + Settings */}
      <div className="flex items-center gap-2">
        <div className="relative">
          <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input
            type="text"
            placeholder="Rechercher..."
            value={searchQuery}
            onChange={handleSearchChange}
            className="h-7 w-40 pl-8 text-[13px] bg-secondary/50 border-transparent focus-visible:bg-background focus-visible:border-input"
            data-testid="search-input"
          />
          {searchQuery && (
            <button
              onClick={() => { setSearchQuery(""); search(""); }}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            >
              <X size={12} />
            </button>
          )}
        </div>
        
        <Separator orientation="vertical" className="h-5" />
        
        <ViewSwitcher />
        
        <Separator orientation="vertical" className="h-5" />
        
        <ThemeToggle />
        
        <TooltipProvider delayDuration={300}>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                onClick={refresh}
                disabled={loading}
                data-testid="refresh-btn"
              >
                <RefreshCw size={14} strokeWidth={1.5} className={loading ? "animate-spin" : ""} />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom" className="text-xs">Actualiser (F5)</TooltipContent>
          </Tooltip>
        </TooltipProvider>
        
        {files.length === 0 && (
          <Button
            variant="outline"
            size="sm"
            className="h-7 text-xs"
            onClick={seedData}
            data-testid="seed-btn"
          >
            <Plus size={14} className="mr-1" />
            Démo
          </Button>
        )}
        
        <TooltipProvider delayDuration={300}>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                data-testid="settings-btn"
              >
                <Settings size={14} strokeWidth={1.5} />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom" className="text-xs">Préférences</TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </div>
    </header>
  );
};

// ============ FILE CONTEXT MENU ============
const FileContextMenu = ({ children, file }) => {
  const { toggleFavorite, deleteFile, copyFiles, cutFiles, renameFile } = useFileManager();
  
  const handleRename = () => {
    const newName = prompt("Nouveau nom:", file.name);
    if (newName && newName !== file.name) {
      renameFile(file.id, newName);
    }
  };
  
  const handleCopyPath = () => {
    navigator.clipboard.writeText(`/${file.name}`);
    toast.success("Chemin copié");
  };
  
  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        {children}
      </ContextMenuTrigger>
      <ContextMenuContent className="w-56 context-menu-glass">
        <ContextMenuItem onClick={() => {}} className="gap-2">
          <Folder size={14} /> Ouvrir
        </ContextMenuItem>
        <ContextMenuItem onClick={() => {}} className="gap-2 text-muted-foreground">
          <Search size={14} /> Quick Look <span className="ml-auto text-xs">Espace</span>
        </ContextMenuItem>
        
        <ContextMenuSeparator />
        
        <ContextMenuItem onClick={() => cutFiles([file.id])} className="gap-2">
          <Scissors size={14} /> Couper <span className="ml-auto text-xs">Ctrl+X</span>
        </ContextMenuItem>
        <ContextMenuItem onClick={() => copyFiles([file.id])} className="gap-2">
          <Copy size={14} /> Copier <span className="ml-auto text-xs">Ctrl+C</span>
        </ContextMenuItem>
        <ContextMenuItem onClick={handleCopyPath} className="gap-2">
          <Clipboard size={14} /> Copier le chemin
        </ContextMenuItem>
        
        <ContextMenuSeparator />
        
        <ContextMenuSub>
          <ContextMenuSubTrigger className="gap-2">
            <Tag size={14} /> Tags
          </ContextMenuSubTrigger>
          <ContextMenuSubContent className="context-menu-glass">
            {["red", "orange", "yellow", "green", "blue", "purple", "pink", "gray"].map(color => (
              <ContextMenuItem key={color} className="gap-2">
                <div className={`w-3 h-3 rounded-full tag-${color}`} />
                {color.charAt(0).toUpperCase() + color.slice(1)}
              </ContextMenuItem>
            ))}
          </ContextMenuSubContent>
        </ContextMenuSub>
        <ContextMenuItem onClick={() => toggleFavorite(file.id)} className="gap-2">
          <Star size={14} fill={file.is_favorite ? "currentColor" : "none"} />
          {file.is_favorite ? "Retirer des favoris" : "Ajouter aux favoris"}
        </ContextMenuItem>
        
        <ContextMenuSeparator />
        
        <ContextMenuItem onClick={handleRename} className="gap-2">
          <Edit3 size={14} /> Renommer <span className="ml-auto text-xs">Entrée</span>
        </ContextMenuItem>
        {file.type === "folder" && (
          <ContextMenuItem className="gap-2">
            <Archive size={14} /> Compresser en ZIP
          </ContextMenuItem>
        )}
        
        <ContextMenuSeparator />
        
        <ContextMenuItem className="gap-2">
          <Info size={14} /> Informations <span className="ml-auto text-xs">Ctrl+I</span>
        </ContextMenuItem>
        <ContextMenuItem 
          onClick={() => deleteFile(file.id)} 
          className="gap-2 text-destructive focus:text-destructive"
        >
          <Trash2 size={14} /> Mettre à la corbeille <span className="ml-auto text-xs">Suppr</span>
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  );
};

// ============ FILE ITEM (ICON VIEW) ============
const FileItemIcon = ({ file }) => {
  const { selectedFiles, setSelectedFiles, openItem } = useFileManager();
  const isSelected = selectedFiles.includes(file.id);
  
  const handleClick = (e) => {
    if (e.ctrlKey || e.metaKey) {
      setSelectedFiles(prev => 
        prev.includes(file.id) 
          ? prev.filter(id => id !== file.id)
          : [...prev, file.id]
      );
    } else if (e.shiftKey) {
      // Shift-click selection (simplified)
      setSelectedFiles(prev => [...prev, file.id]);
    } else {
      setSelectedFiles([file.id]);
    }
  };
  
  const handleDoubleClick = () => {
    openItem(file);
  };
  
  return (
    <FileContextMenu file={file}>
      <button
        onClick={handleClick}
        onDoubleClick={handleDoubleClick}
        className={`flex flex-col items-center p-3 rounded-lg transition-all duration-100 cursor-default group
          ${isSelected 
            ? "bg-primary/10 ring-1 ring-primary/30" 
            : "hover:bg-secondary/80"
          }`}
        data-testid={`file-item-${file.id}`}
      >
        <div className="relative mb-2">
          {file.thumbnail_url && file.type === "image" ? (
            <div className="w-16 h-16 rounded-lg overflow-hidden bg-secondary">
              <img 
                src={file.thumbnail_url} 
                alt={file.name}
                className="w-full h-full object-cover"
                loading="lazy"
              />
            </div>
          ) : (
            <div className="w-16 h-16 flex items-center justify-center">
              {getFileIcon(file.type, file.extension, 48)}
            </div>
          )}
          {file.is_favorite && (
            <Star 
              size={12} 
              className="absolute -top-1 -right-1 text-yellow-500" 
              fill="currentColor"
            />
          )}
        </div>
        <span className={`text-center text-[12px] leading-tight line-clamp-2 max-w-[80px]
          ${isSelected ? "text-primary font-medium" : "text-foreground"}`}
        >
          {file.name}
        </span>
      </button>
    </FileContextMenu>
  );
};

// ============ ICONS VIEW ============
const IconsView = () => {
  const { files, setSelectedFiles } = useFileManager();
  
  return (
    <div 
      className="p-4 grid grid-cols-4 sm:grid-cols-5 md:grid-cols-6 lg:grid-cols-8 xl:grid-cols-10 gap-1 content-start"
      onClick={(e) => {
        if (e.target === e.currentTarget) setSelectedFiles([]);
      }}
      data-testid="icons-view"
    >
      {files.map((file) => (
        <FileItemIcon key={file.id} file={file} />
      ))}
    </div>
  );
};

// ============ LIST VIEW ============
const ListView = () => {
  const { files, selectedFiles, setSelectedFiles, openItem } = useFileManager();
  
  const columns = [
    { key: "name", label: "Nom", width: "flex-1" },
    { key: "modified_at", label: "Date de modification", width: "w-40" },
    { key: "size", label: "Taille", width: "w-24" },
    { key: "type", label: "Type", width: "w-28" }
  ];
  
  return (
    <div className="flex flex-col h-full" data-testid="list-view">
      {/* Header */}
      <div className="flex items-center h-8 px-4 border-b border-border bg-secondary/30 text-[11px] font-medium text-muted-foreground uppercase tracking-wide">
        {columns.map((col) => (
          <div key={col.key} className={`${col.width} px-2 truncate`}>
            {col.label}
          </div>
        ))}
      </div>
      
      {/* Rows */}
      <ScrollArea className="flex-1">
        <div onClick={(e) => { if (e.target === e.currentTarget) setSelectedFiles([]); }}>
          {files.map((file) => {
            const isSelected = selectedFiles.includes(file.id);
            return (
              <FileContextMenu key={file.id} file={file}>
                <button
                  onClick={(e) => {
                    if (e.ctrlKey) {
                      setSelectedFiles(prev => 
                        prev.includes(file.id) ? prev.filter(id => id !== file.id) : [...prev, file.id]
                      );
                    } else {
                      setSelectedFiles([file.id]);
                    }
                  }}
                  onDoubleClick={() => openItem(file)}
                  className={`flex items-center w-full h-9 px-4 text-left transition-colors cursor-default
                    ${isSelected ? "bg-primary/10" : "hover:bg-secondary/50"}`}
                  data-testid={`list-item-${file.id}`}
                >
                  <div className="flex-1 flex items-center gap-2 px-2 truncate">
                    {getFileIcon(file.type, file.extension, 16)}
                    <span className={`truncate ${isSelected ? "text-primary font-medium" : ""}`}>
                      {file.name}
                    </span>
                    {file.is_favorite && <Star size={12} className="text-yellow-500 flex-shrink-0" fill="currentColor" />}
                  </div>
                  <div className="w-40 px-2 text-muted-foreground truncate text-[12px]">
                    {formatDate(file.modified_at)}
                  </div>
                  <div className="w-24 px-2 text-muted-foreground truncate text-[12px]">
                    {file.type === "folder" ? "—" : formatFileSize(file.size)}
                  </div>
                  <div className="w-28 px-2 text-muted-foreground truncate text-[12px]">
                    {getFileKind(file.type, file.extension)}
                  </div>
                </button>
              </FileContextMenu>
            );
          })}
        </div>
      </ScrollArea>
    </div>
  );
};

// ============ COLUMNS VIEW ============
const ColumnsView = () => {
  const { files, selectedFiles, setSelectedFiles, openItem, currentFolderId } = useFileManager();
  const [columnStack, setColumnStack] = useState([{ id: currentFolderId, files }]);
  
  useEffect(() => {
    setColumnStack([{ id: currentFolderId, files }]);
  }, [files, currentFolderId]);
  
  const handleSelectItem = (file, columnIndex) => {
    setSelectedFiles([file.id]);
    
    if (file.type === "folder") {
      // Fetch folder contents and add new column
      const newStack = columnStack.slice(0, columnIndex + 1);
      setColumnStack([...newStack, { id: file.id, files: [], loading: true }]);
      
      // Fetch files for the selected folder
      axios.get(`${API}/files?parent_id=${file.id}`)
        .then(response => {
          setColumnStack(prev => {
            const updated = [...prev];
            const targetIndex = columnIndex + 1;
            if (updated[targetIndex]) {
              updated[targetIndex] = { id: file.id, files: response.data, loading: false };
            }
            return updated;
          });
        })
        .catch(console.error);
    } else {
      // Show preview column for file
      const newStack = columnStack.slice(0, columnIndex + 1);
      setColumnStack([...newStack, { id: file.id, file, isPreview: true }]);
    }
  };
  
  return (
    <div className="flex h-full overflow-x-auto scrollbar-thin" data-testid="columns-view">
      {columnStack.map((column, index) => (
        <div 
          key={`${column.id}-${index}`}
          className="w-52 flex-shrink-0 border-r border-border flex flex-col"
        >
          {column.isPreview ? (
            // Preview column for selected file
            <div className="p-4 flex flex-col items-center">
              {column.file.thumbnail_url ? (
                <img 
                  src={column.file.preview_url || column.file.thumbnail_url}
                  alt={column.file.name}
                  className="max-w-full max-h-[200px] rounded-lg object-contain mb-3"
                />
              ) : (
                <div className="w-24 h-24 mb-3 flex items-center justify-center">
                  {getFileIcon(column.file.type, column.file.extension, 64)}
                </div>
              )}
              <h4 className="text-sm font-medium text-center mb-1">{column.file.name}</h4>
              <p className="text-xs text-muted-foreground">{getFileKind(column.file.type, column.file.extension)}</p>
              <p className="text-xs text-muted-foreground">{formatFileSize(column.file.size)}</p>
            </div>
          ) : (
            // File list column
            <ScrollArea className="flex-1">
              {column.loading ? (
                <div className="p-4 text-sm text-muted-foreground">Chargement...</div>
              ) : column.files.length === 0 ? (
                <div className="p-4 text-sm text-muted-foreground italic">Dossier vide</div>
              ) : (
                column.files.map((file) => {
                  const isSelected = selectedFiles.includes(file.id);
                  return (
                    <FileContextMenu key={file.id} file={file}>
                      <button
                        onClick={() => handleSelectItem(file, index)}
                        onDoubleClick={() => file.type !== "folder" && openItem(file)}
                        className={`flex items-center w-full px-3 py-1.5 text-left transition-colors cursor-default gap-2
                          ${isSelected ? "bg-primary text-primary-foreground" : "hover:bg-secondary/50"}`}
                        data-testid={`column-item-${file.id}`}
                      >
                        {getFileIcon(file.type, file.extension, 14)}
                        <span className="flex-1 truncate text-[13px]">{file.name}</span>
                        {file.type === "folder" && (
                          <ChevronRight size={14} className={isSelected ? "text-primary-foreground/70" : "text-muted-foreground"} />
                        )}
                      </button>
                    </FileContextMenu>
                  );
                })
              )}
            </ScrollArea>
          )}
        </div>
      ))}
    </div>
  );
};

// ============ GALLERY VIEW ============
const GalleryView = () => {
  const { files, selectedFiles, setSelectedFiles, openItem } = useFileManager();
  const [selectedIndex, setSelectedIndex] = useState(0);
  
  // Filter to show images and videos primarily
  const mediaFiles = files.filter(f => ["image", "video"].includes(f.type) || f.thumbnail_url);
  const displayFiles = mediaFiles.length > 0 ? mediaFiles : files;
  const selectedFile = displayFiles[selectedIndex];
  
  useEffect(() => {
    if (selectedFile) {
      setSelectedFiles([selectedFile.id]);
    }
  }, [selectedIndex, selectedFile, setSelectedFiles]);
  
  return (
    <div className="flex h-full" data-testid="gallery-view">
      {/* Main preview area */}
      <div className="flex-1 flex items-center justify-center p-8 bg-secondary/20">
        {selectedFile ? (
          <div className="text-center">
            {selectedFile.preview_url || selectedFile.thumbnail_url ? (
              <img
                src={selectedFile.preview_url || selectedFile.thumbnail_url}
                alt={selectedFile.name}
                className="max-h-[60vh] max-w-full rounded-lg shadow-lg object-contain"
              />
            ) : (
              <div className="w-48 h-48 flex items-center justify-center">
                {getFileIcon(selectedFile.type, selectedFile.extension, 128)}
              </div>
            )}
            <h3 className="mt-4 text-lg font-medium">{selectedFile.name}</h3>
            <p className="text-sm text-muted-foreground">
              {getFileKind(selectedFile.type, selectedFile.extension)} • {formatFileSize(selectedFile.size)}
            </p>
          </div>
        ) : (
          <p className="text-muted-foreground">Aucun fichier sélectionné</p>
        )}
      </div>
      
      {/* Thumbnail strip */}
      <div className="w-48 border-l border-border bg-background">
        <ScrollArea className="h-full">
          <div className="p-2 space-y-1">
            {displayFiles.map((file, index) => {
              const isSelected = index === selectedIndex;
              return (
                <FileContextMenu key={file.id} file={file}>
                  <button
                    onClick={() => setSelectedIndex(index)}
                    onDoubleClick={() => openItem(file)}
                    className={`w-full flex items-center gap-2 p-2 rounded-md transition-colors cursor-default
                      ${isSelected ? "bg-primary/10 ring-1 ring-primary/30" : "hover:bg-secondary/50"}`}
                    data-testid={`gallery-item-${file.id}`}
                  >
                    {file.thumbnail_url ? (
                      <div className="w-10 h-10 rounded overflow-hidden flex-shrink-0">
                        <img 
                          src={file.thumbnail_url} 
                          alt="" 
                          className="w-full h-full object-cover"
                        />
                      </div>
                    ) : (
                      <div className="w-10 h-10 flex items-center justify-center flex-shrink-0">
                        {getFileIcon(file.type, file.extension, 24)}
                      </div>
                    )}
                    <span className={`text-[12px] truncate ${isSelected ? "text-primary font-medium" : ""}`}>
                      {file.name}
                    </span>
                  </button>
                </FileContextMenu>
              );
            })}
          </div>
        </ScrollArea>
      </div>
    </div>
  );
};

// ============ CONTENT AREA ============
const ContentArea = () => {
  const { view, files, loading, searchResults, searchQuery } = useFileManager();
  
  const ViewComponent = {
    icons: IconsView,
    list: ListView,
    columns: ColumnsView,
    gallery: GalleryView
  }[view];
  
  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <RefreshCw size={24} className="animate-spin text-muted-foreground" />
      </div>
    );
  }
  
  if (files.length === 0) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center text-muted-foreground">
        {searchResults !== null ? (
          <>
            <Search size={48} strokeWidth={1} className="mb-4 opacity-50" />
            <p>Aucun résultat pour "{searchQuery}"</p>
          </>
        ) : (
          <>
            <Folder size={48} strokeWidth={1} className="mb-4 opacity-50" />
            <p>Ce dossier est vide</p>
            <p className="text-sm mt-1">Cliquez sur "Démo" pour créer des fichiers de démonstration</p>
          </>
        )}
      </div>
    );
  }
  
  return (
    <div className="flex-1 overflow-hidden animate-fade-in">
      <ViewComponent />
    </div>
  );
};

// ============ STATUS BAR ============
const StatusBar = () => {
  const { files, selectedFiles, stats, searchResults } = useFileManager();
  
  const displayFiles = searchResults !== null ? searchResults : files;
  const itemCount = displayFiles.length;
  const selectedCount = selectedFiles.length;
  
  return (
    <footer 
      className="h-[28px] flex-shrink-0 border-t border-border flex items-center justify-between px-4 text-[11px] text-muted-foreground bg-background"
      data-testid="statusbar"
    >
      <div className="flex items-center gap-4">
        <span>{itemCount} élément{itemCount !== 1 ? "s" : ""}</span>
        {selectedCount > 0 && (
          <span>{selectedCount} sélectionné{selectedCount !== 1 ? "s" : ""}</span>
        )}
      </div>
      <div>
        {stats && (
          <span>{formatFileSize(stats.free_space)} disponible</span>
        )}
      </div>
    </footer>
  );
};

// ============ QUICK LOOK DIALOG ============
const QuickLook = () => {
  const { quickLookFile, setQuickLookFile } = useFileManager();
  
  if (!quickLookFile) return null;
  
  const isImage = quickLookFile.type === "image";
  const isText = ["document", "code"].includes(quickLookFile.type) && 
    ["txt", "md", "json", "js", "py", "css", "html"].includes(quickLookFile.extension);
  
  return (
    <Dialog open={!!quickLookFile} onOpenChange={() => setQuickLookFile(null)}>
      <DialogContent className="max-w-4xl max-h-[90vh] p-0 overflow-hidden" data-testid="quicklook-dialog">
        <DialogHeader className="px-4 py-3 border-b border-border">
          <DialogTitle className="text-sm font-medium flex items-center gap-2">
            {getFileIcon(quickLookFile.type, quickLookFile.extension, 16)}
            {quickLookFile.name}
          </DialogTitle>
        </DialogHeader>
        
        <div className="flex-1 overflow-auto max-h-[70vh]">
          {isImage && (quickLookFile.preview_url || quickLookFile.thumbnail_url) ? (
            <div className="flex items-center justify-center p-4 bg-secondary/20">
              <img
                src={quickLookFile.preview_url || quickLookFile.thumbnail_url}
                alt={quickLookFile.name}
                className="max-w-full max-h-[65vh] object-contain rounded-lg"
              />
            </div>
          ) : isText && quickLookFile.content ? (
            <pre className="p-4 text-sm font-mono whitespace-pre-wrap bg-secondary/20 overflow-auto">
              {quickLookFile.content}
            </pre>
          ) : (
            <div className="flex flex-col items-center justify-center p-12 text-muted-foreground">
              {getFileIcon(quickLookFile.type, quickLookFile.extension, 96)}
              <p className="mt-4 text-lg font-medium text-foreground">{quickLookFile.name}</p>
              <p className="mt-1">{getFileKind(quickLookFile.type, quickLookFile.extension)}</p>
              <p>{formatFileSize(quickLookFile.size)}</p>
              <p className="text-sm mt-4">Modifié le {formatDate(quickLookFile.modified_at)}</p>
            </div>
          )}
        </div>
        
        <div className="px-4 py-2 border-t border-border text-xs text-muted-foreground flex justify-between">
          <span>{getFileKind(quickLookFile.type, quickLookFile.extension)}</span>
          <span>{formatFileSize(quickLookFile.size)}</span>
        </div>
      </DialogContent>
    </Dialog>
  );
};

// ============ MAIN APP ============
const FileManagerApp = () => {
  return (
    <div 
      className="flex h-screen w-screen overflow-hidden text-[13px] select-none bg-background"
      data-testid="file-manager-app"
    >
      <Sidebar />
      <main className="flex-1 flex flex-col min-w-0">
        <TopBar />
        <ContentArea />
        <StatusBar />
      </main>
      <QuickLook />
      <Toaster position="bottom-right" richColors />
    </div>
  );
};

function App() {
  return (
    <ThemeProvider>
      <FileManagerProvider>
        <FileManagerApp />
      </FileManagerProvider>
    </ThemeProvider>
  );
}

export default App;
