// Smart File Manager - Application Tauri pour Windows
// Accès au vrai système de fichiers Windows

import React, { createContext, useContext, useEffect, useState, useCallback, useMemo, useRef } from 'react';
import { invoke, convertFileSrc } from '@tauri-apps/api/core';
import { Toaster, toast } from 'sonner';
import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

// Lucide Icons
import {
  Folder, File, FileText, FileImage, FileVideo, FileAudio, FileArchive, FileCode,
  ChevronRight, ChevronDown, ChevronLeft,
  Search, Settings, Star, Trash2, HardDrive, Network, Monitor,
  LayoutGrid, List, Columns, GalleryHorizontal,
  Sun, Moon, Plus, X, RefreshCw,
  Home, Copy, Scissors, Clipboard, Edit3, Info, Archive, FolderOpen, Cloud,
  Sparkles, Bot, Eye, EyeOff, Send, AlertCircle, CheckCircle2, Loader2,
  ShieldCheck, ShieldAlert, ShieldX, ZoomIn, BarChart2, HardDriveDownload,
  PackagePlus, PackageOpen
} from 'lucide-react';

// ============ UTILITY FUNCTIONS ============

function cn(...inputs) {
  return twMerge(clsx(inputs));
}

const formatFileSize = (bytes) => {
  if (bytes === 0) return '0 o';
  const k = 1024;
  const sizes = ['o', 'Ko', 'Mo', 'Go', 'To'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
};

const formatDate = (dateString) => {
  if (!dateString) return '—';
  const date = new Date(dateString);
  return date.toLocaleDateString('fr-FR', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
};

const getFileIcon = (type, extension, size = 20) => {
  const props = { size, strokeWidth: 1.5 };
  
  switch (type) {
    case 'folder':
      return <Folder {...props} className="text-[#34C759]" fill="#34C759" fillOpacity={0.2} />;
    case 'image':
      return <FileImage {...props} className="text-[#FF9500]" />;
    case 'document':
      if (extension === 'pdf') return <FileText {...props} className="text-[#FF3B30]" />;
      return <FileText {...props} className="text-[#007AFF]" />;
    case 'video':
      return <FileVideo {...props} className="text-[#AF52DE]" />;
    case 'audio':
      return <FileAudio {...props} className="text-[#FF2D55]" />;
    case 'archive':
      return <FileArchive {...props} className="text-[#8E8E93]" />;
    case 'code':
      return <FileCode {...props} className="text-[#32ADE6]" />;
    default:
      return <File {...props} className="text-[#8E8E93]" />;
  }
};

const getFileKind = (type, extension) => {
  const kinds = {
    folder: 'Dossier',
    image: 'Image',
    document: extension?.toUpperCase() || 'Document',
    video: 'Vidéo',
    audio: 'Audio',
    archive: 'Archive',
    code: extension?.toUpperCase() || 'Code',
    file: extension?.toUpperCase() || 'Fichier'
  };
  return kinds[type] || 'Fichier';
};

// ============ CONTEXT ============

const FileManagerContext = createContext(null);
const useFileManager = () => {
  const context = useContext(FileManagerContext);
  if (!context) throw new Error('useFileManager must be used within FileManagerProvider');
  return context;
};

// ============ HELPERS ============

function hexToHslString(hex) {
  const r = parseInt(hex.slice(1, 3), 16) / 255;
  const g = parseInt(hex.slice(3, 5), 16) / 255;
  const b = parseInt(hex.slice(5, 7), 16) / 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  let h = 0, s = 0;
  const l = (max + min) / 2;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r: h = ((g - b) / d + (g < b ? 6 : 0)) / 6; break;
      case g: h = ((b - r) / d + 2) / 6; break;
      case b: h = ((r - g) / d + 4) / 6; break;
    }
  }
  return `${Math.round(h * 360)} ${Math.round(s * 100)}% ${Math.round(l * 100)}%`;
}

const ACCENT_PRESETS = [
  { label: 'Bleu Apple',  hex: '#007AFF' },
  { label: 'Violet',      hex: '#AF52DE' },
  { label: 'Rose',        hex: '#FF2D55' },
  { label: 'Orange',      hex: '#FF9500' },
  { label: 'Vert',        hex: '#34C759' },
  { label: 'Cyan',        hex: '#32ADE6' },
  { label: 'Rouge',       hex: '#FF3B30' },
  { label: 'Jaune',       hex: '#FFCC00' },
];

// ============ THEME ============

const ThemeContext = createContext(null);
const useTheme = () => {
  const context = useContext(ThemeContext);
  if (!context) throw new Error('useTheme must be used within ThemeProvider');
  return context;
};

const ThemeProvider = ({ children }) => {
  const [theme, setTheme] = useState(() => localStorage.getItem('theme') || 'system');
  const [visualStyle, setVisualStyle] = useState(() => localStorage.getItem('visualStyle') || 'default');
  const [accentColor, setAccentColor] = useState(() => localStorage.getItem('accentColor') || '#007AFF');
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [showFileSizes, setShowFileSizes] = useState(() => localStorage.getItem('showFileSizes') !== 'false');
  const [aiPanelOpen, setAiPanelOpen]       = useState(false);
  const [diskAnalysisOpen, setDiskAnalysisOpen] = useState(false);
  const [aiProvider,  setAiProvider]    = useState(() => localStorage.getItem('aiProvider')  || 'claude');
  const [claudeKey,   setClaudeKey]     = useState(() => localStorage.getItem('claudeKey')   || '');
  const [ollamaModel, setOllamaModel]   = useState(() => localStorage.getItem('ollamaModel') || 'llama3.2');

  // Apply theme class
  useEffect(() => {
    const root = document.documentElement;
    root.classList.remove('light', 'dark');
    const resolved = theme === 'system'
      ? (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')
      : theme;
    root.classList.add(resolved);
    localStorage.setItem('theme', theme);
  }, [theme]);

  // Apply visual style attribute
  useEffect(() => {
    document.documentElement.setAttribute('data-style', visualStyle);
    localStorage.setItem('visualStyle', visualStyle);
  }, [visualStyle]);

  // Apply accent color
  useEffect(() => {
    const hsl = hexToHslString(accentColor);
    const root = document.documentElement;
    root.style.setProperty('--primary', hsl);
    root.style.setProperty('--accent', hsl);
    root.style.setProperty('--ring', hsl);
    localStorage.setItem('accentColor', accentColor);
  }, [accentColor]);

  useEffect(() => { localStorage.setItem('showFileSizes', showFileSizes); }, [showFileSizes]);
  useEffect(() => { localStorage.setItem('aiProvider',   aiProvider);   }, [aiProvider]);
  useEffect(() => { localStorage.setItem('claudeKey',    claudeKey);    }, [claudeKey]);
  useEffect(() => { localStorage.setItem('ollamaModel',  ollamaModel);  }, [ollamaModel]);

  return (
    <ThemeContext.Provider value={{
      theme, setTheme,
      visualStyle, setVisualStyle,
      accentColor, setAccentColor,
      settingsOpen, setSettingsOpen,
      showFileSizes, setShowFileSizes,
      aiPanelOpen, setAiPanelOpen,
      diskAnalysisOpen, setDiskAnalysisOpen,
      aiProvider, setAiProvider,
      claudeKey, setClaudeKey,
      ollamaModel, setOllamaModel,
    }}>
      {children}
    </ThemeContext.Provider>
  );
};

// ============ FILE MANAGER PROVIDER ============

const FileManagerProvider = ({ children }) => {
  const [files, setFiles] = useState([]);
  const [currentPath, setCurrentPath] = useState('');
  const [breadcrumbs, setBreadcrumbs] = useState([]);
  const [selectedFiles, setSelectedFiles] = useState([]);
  const [view, setView] = useState('icons');
  const [iconSize, setIconSize] = useState(() => localStorage.getItem('iconSize') || 'sm');
  const [userDirs, setUserDirs] = useState([]);
  const [onedriveDirs, setOnedriveDirs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState(null);
  const [quickLookFile, setQuickLookFile] = useState(null);
  const [clipboard, setClipboard] = useState({ files: [], action: null });
  const [navigationHistory, setNavigationHistory] = useState({ past: [], future: [] });
  const [showHidden, setShowHidden] = useState(false);
  const [recentFolders, setRecentFolders] = useState(() => {
    try { return JSON.parse(localStorage.getItem('recentFolders') || '[]'); }
    catch { return []; }
  });

  const addRecentFolder = useCallback((path) => {
    if (!path) return;
    const name = path.split(/[/\\]/).filter(Boolean).pop() || path;
    setRecentFolders(prev => {
      const filtered = prev.filter(f => f.path !== path);
      const updated  = [{ name, path }, ...filtered].slice(0, 20);
      localStorage.setItem('recentFolders', JSON.stringify(updated));
      return updated;
    });
  }, []);

  const [pinnedFolders, setPinnedFolders] = useState(() => {
    try { return JSON.parse(localStorage.getItem('pinnedFolders') || '[]'); }
    catch { return []; }
  });

  const pinFolder = useCallback((path) => {
    if (!path || pinnedFolders.some(f => f.path === path)) return;
    const name = path.split(/[/\\]/).filter(Boolean).pop() || path;
    const updated = [...pinnedFolders, { name, path }];
    setPinnedFolders(updated);
    localStorage.setItem('pinnedFolders', JSON.stringify(updated));
    toast.success(`«${name}» ajouté aux favoris`);
  }, [pinnedFolders]);

  const unpinFolder = useCallback((path) => {
    const updated = pinnedFolders.filter(f => f.path !== path);
    setPinnedFolders(updated);
    localStorage.setItem('pinnedFolders', JSON.stringify(updated));
  }, [pinnedFolders]);

  // Fetch files from Tauri backend
  const fetchFiles = useCallback(async (path = '') => {
    try {
      setLoading(true);
      const result = await invoke('list_files', { path, showHidden });
      setFiles(result);
    } catch (error) {
      console.error('Error fetching files:', error);
      toast.error('Erreur lors du chargement des fichiers');
    } finally {
      setLoading(false);
    }
  }, [showHidden]);

  // Fetch breadcrumbs
  const fetchBreadcrumbs = useCallback(async (path) => {
    try {
      const result = await invoke('get_breadcrumbs', { path });
      setBreadcrumbs(result);
    } catch (error) {
      console.error('Error fetching breadcrumbs:', error);
    }
  }, []);

  // Fetch user directories
  const fetchUserDirs = useCallback(async () => {
    try {
      const result = await invoke('get_user_directories');
      // Filter out dirs that live inside OneDrive — they'll appear in the OneDrive section
      const onedrive = await invoke('get_onedrive_directories');
      setOnedriveDirs(onedrive);
      const onedrivePaths = onedrive.map(d => d.path.toLowerCase());
      const localDirs = result.filter(d =>
        !onedrivePaths.some(op => d.path.toLowerCase().startsWith(op))
      );
      setUserDirs(localDirs.length > 0 ? localDirs : result);
    } catch (error) {
      console.error('Error fetching user directories:', error);
    }
  }, []);

  // Navigate to folder
  const navigateToFolder = useCallback((path) => {
    setNavigationHistory(prev => ({
      past: [...prev.past, currentPath],
      future: []
    }));
    setCurrentPath(path);
    setSelectedFiles([]);
    setSearchResults(null);
    setSearchQuery('');
    if (path) addRecentFolder(path);
  }, [currentPath, addRecentFolder]);

  // Navigation back/forward
  const goBack = useCallback(() => {
    if (navigationHistory.past.length === 0) return;
    const newPast = [...navigationHistory.past];
    const previousPath = newPast.pop();
    setNavigationHistory({
      past: newPast,
      future: [currentPath, ...navigationHistory.future]
    });
    setCurrentPath(previousPath);
    setSelectedFiles([]);
  }, [navigationHistory, currentPath]);

  const goForward = useCallback(() => {
    if (navigationHistory.future.length === 0) return;
    const [nextPath, ...newFuture] = navigationHistory.future;
    setNavigationHistory({
      past: [...navigationHistory.past, currentPath],
      future: newFuture
    });
    setCurrentPath(nextPath);
    setSelectedFiles([]);
  }, [navigationHistory, currentPath]);

  // Open file/folder
  const openItem = useCallback(async (item) => {
    if (item.file_type === 'folder') {
      navigateToFolder(item.path);
    } else {
      // Open with default app
      try {
        await invoke('open_file_with_default_app', { path: item.path });
      } catch (error) {
        toast.error('Impossible d\'ouvrir le fichier');
      }
    }
  }, [navigateToFolder]);

  // Search
  const search = useCallback(async (query) => {
    if (!query.trim()) {
      setSearchResults(null);
      return;
    }
    try {
      const result = await invoke('search_files', { 
        path: currentPath, 
        query, 
        maxResults: 100 
      });
      setSearchResults(result);
    } catch (error) {
      console.error('Error searching:', error);
    }
  }, [currentPath]);

  // Delete file
  const deleteFile = useCallback(async (path, permanent = false) => {
    try {
      await invoke('delete_file', { path, permanent });
      toast.success(permanent ? 'Fichier supprimé définitivement' : 'Déplacé vers la corbeille');
      await fetchFiles(currentPath);
    } catch (error) {
      console.error('Error deleting file:', error);
      toast.error('Erreur lors de la suppression');
    }
  }, [currentPath, fetchFiles]);

  // Create folder
  const createFolder = useCallback(async (name) => {
    try {
      await invoke('create_folder', { path: currentPath, name });
      toast.success('Dossier créé');
      await fetchFiles(currentPath);
    } catch (error) {
      console.error('Error creating folder:', error);
      toast.error('Erreur lors de la création');
    }
  }, [currentPath, fetchFiles]);

  // Rename file
  const renameFile = useCallback(async (path, newName) => {
    try {
      await invoke('rename_file', { path, newName });
      toast.success('Renommé avec succès');
      await fetchFiles(currentPath);
    } catch (error) {
      console.error('Error renaming file:', error);
      toast.error('Erreur lors du renommage');
    }
  }, [currentPath, fetchFiles]);

  // Copy/Cut/Paste
  const copyFiles = useCallback((filePaths) => {
    setClipboard({ files: filePaths, action: 'copy' });
    toast.success(`${filePaths.length} élément(s) copié(s)`);
  }, []);

  const cutFiles = useCallback((filePaths) => {
    setClipboard({ files: filePaths, action: 'cut' });
    toast.success(`${filePaths.length} élément(s) coupé(s)`);
  }, []);

  const pasteFiles = useCallback(async () => {
    if (clipboard.files.length === 0) return;
    
    try {
      for (const filePath of clipboard.files) {
        if (clipboard.action === 'copy') {
          await invoke('copy_file', { source: filePath, destination: currentPath });
        } else {
          await invoke('move_file', { source: filePath, destination: currentPath });
        }
      }
      toast.success(`${clipboard.files.length} élément(s) collé(s)`);
      if (clipboard.action === 'cut') {
        setClipboard({ files: [], action: null });
      }
      await fetchFiles(currentPath);
    } catch (error) {
      console.error('Error pasting files:', error);
      toast.error('Erreur lors du collage');
    }
  }, [clipboard, currentPath, fetchFiles]);

  // Effects
  useEffect(() => {
    fetchFiles(currentPath);
    fetchBreadcrumbs(currentPath);
  }, [currentPath, fetchFiles, fetchBreadcrumbs]);

  useEffect(() => {
    fetchUserDirs();
  }, [fetchUserDirs]);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e) => {
      // Quick Look
      if (e.code === 'Space' && selectedFiles.length === 1 && !e.target.closest('input')) {
        e.preventDefault();
        const file = files.find(f => f.path === selectedFiles[0]);
        if (file) setQuickLookFile(file);
      }
      
      // Close Quick Look
      if (e.code === 'Escape') {
        setQuickLookFile(null);
      }
      
      // Navigation
      if (e.altKey && e.code === 'ArrowLeft') {
        e.preventDefault();
        goBack();
      }
      if (e.altKey && e.code === 'ArrowRight') {
        e.preventDefault();
        goForward();
      }
      
      // Go up
      if (e.ctrlKey && e.code === 'ArrowUp') {
        e.preventDefault();
        const parentBreadcrumb = breadcrumbs[breadcrumbs.length - 2];
        if (parentBreadcrumb) {
          navigateToFolder(parentBreadcrumb.path);
        }
      }
      
      // View shortcuts
      if (e.ctrlKey && !e.shiftKey && !e.altKey) {
        if (e.code === 'Digit1') { e.preventDefault(); setView('icons'); }
        if (e.code === 'Digit2') { e.preventDefault(); setView('list'); }
        if (e.code === 'Digit3') { e.preventDefault(); setView('columns'); }
        if (e.code === 'Digit4') { e.preventDefault(); setView('gallery'); }
      }
      
      // Copy/Cut/Paste
      if (e.ctrlKey && e.code === 'KeyC' && selectedFiles.length > 0 && !e.target.closest('input')) {
        e.preventDefault();
        copyFiles(selectedFiles);
      }
      if (e.ctrlKey && e.code === 'KeyX' && selectedFiles.length > 0 && !e.target.closest('input')) {
        e.preventDefault();
        cutFiles(selectedFiles);
      }
      if (e.ctrlKey && e.code === 'KeyV' && clipboard.files.length > 0 && !e.target.closest('input')) {
        e.preventDefault();
        pasteFiles();
      }
      
      // Delete
      if (e.code === 'Delete' && selectedFiles.length > 0 && !e.target.closest('input')) {
        e.preventDefault();
        selectedFiles.forEach(path => deleteFile(path, e.shiftKey));
      }
      
      // New folder
      if (e.ctrlKey && e.shiftKey && e.code === 'KeyN') {
        e.preventDefault();
        const name = prompt('Nom du nouveau dossier:');
        if (name) createFolder(name);
      }
      
      // Toggle hidden files
      if (e.ctrlKey && e.shiftKey && e.code === 'Period') {
        e.preventDefault();
        setShowHidden(prev => !prev);
      }
      
      // Refresh
      if (e.code === 'F5') {
        e.preventDefault();
        fetchFiles(currentPath);
      }
      
      // Select all
      if (e.ctrlKey && e.code === 'KeyA' && !e.target.closest('input')) {
        e.preventDefault();
        setSelectedFiles(files.map(f => f.path));
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedFiles, files, clipboard, breadcrumbs, currentPath, goBack, goForward, navigateToFolder, copyFiles, cutFiles, pasteFiles, deleteFile, createFolder, fetchFiles]);

  const displayedFiles = searchResults !== null ? searchResults : files;

  const value = useMemo(() => ({
    files: displayedFiles,
    allFiles: files,
    currentPath,
    breadcrumbs,
    selectedFiles,
    setSelectedFiles,
    view,
    setView,
    userDirs,
    onedriveDirs,
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
    navigateToFolder,
    goBack,
    goForward,
    openItem,
    search,
    deleteFile,
    createFolder,
    renameFile,
    copyFiles,
    cutFiles,
    pasteFiles,
    refresh: () => fetchFiles(currentPath),
    iconSize, setIconSize,
    pinnedFolders, pinFolder, unpinFolder,
    recentFolders,
  }), [
    displayedFiles, files, currentPath, breadcrumbs, selectedFiles, view, userDirs,
    loading, searchQuery, searchResults, quickLookFile, clipboard, navigationHistory, showHidden,
    navigateToFolder, goBack, goForward, openItem, search, deleteFile, createFolder,
    renameFile, copyFiles, cutFiles, pasteFiles, fetchFiles, onedriveDirs, iconSize,
    pinnedFolders, pinFolder, unpinFolder, recentFolders,
  ]);

  return (
    <FileManagerContext.Provider value={value}>
      {children}
    </FileManagerContext.Provider>
  );
};

// ============ SIDEBAR SECTION ============

const SidebarSection = ({ title, children, defaultOpen = true, action }) => {
  const [isOpen, setIsOpen] = useState(defaultOpen);

  return (
    <div className="mb-1">
      <div className="flex items-center pr-2">
        <button
          onClick={() => setIsOpen(!isOpen)}
          className="flex items-center gap-1 px-4 py-1.5 flex-1 text-left text-[11px] font-semibold text-muted-foreground uppercase tracking-wider hover:text-foreground transition-colors"
        >
          <ChevronRight
            size={12}
            className={cn('transition-transform duration-200', isOpen && 'rotate-90')}
          />
          {title}
        </button>
        {action}
      </div>
      {isOpen && (
        <div className="animate-fade-in">
          {children}
        </div>
      )}
    </div>
  );
};

// ============ SIDEBAR ITEM ============

const SidebarItem = ({ icon: Icon, label, active, onClick, badge, onRemove }) => (
  <div className="group relative flex items-center">
    <button
      onClick={onClick}
      className={cn('sidebar-item flex-1 min-w-0', active && 'sidebar-item-active', onRemove && 'pr-7')}
    >
      {Icon && <Icon size={16} strokeWidth={1.5} className={active ? 'text-primary' : 'text-muted-foreground'} />}
      <span className="flex-1 truncate">{label}</span>
      {badge !== undefined && (
        <span className="text-[11px] text-muted-foreground">{badge}</span>
      )}
    </button>
    {onRemove && (
      <button
        onClick={(e) => { e.stopPropagation(); onRemove(); }}
        title="Retirer des favoris"
        className="absolute right-2 opacity-0 group-hover:opacity-100 w-4 h-4 rounded flex items-center justify-center text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-all"
      >
        <X size={10} />
      </button>
    )}
  </div>
);

// ============ SIDEBAR ============

const Sidebar = () => {
  const { userDirs, onedriveDirs, navigateToFolder, currentPath, pinnedFolders, pinFolder, unpinFolder, recentFolders } = useFileManager();

  const canPin = currentPath && !pinnedFolders.some(f => f.path === currentPath);

  return (
    <aside className="glass-sidebar w-[220px] flex-shrink-0 h-full flex flex-col">
      <div className="flex-1 py-2 overflow-y-auto scrollbar-thin">

        {/* Favoris — dossiers système */}
        {userDirs.length > 0 && (
          <SidebarSection title="Raccourcis">
            {userDirs.map((dir) => (
              <SidebarItem
                key={dir.path}
                icon={Folder}
                label={dir.name}
                active={currentPath === dir.path}
                onClick={() => navigateToFolder(dir.path)}
              />
            ))}
          </SidebarSection>
        )}

        {/* Favoris épinglés */}
        <SidebarSection
          title="Favoris"
          action={canPin && (
            <button
              onClick={() => pinFolder(currentPath)}
              title="Épingler ce dossier"
              className="w-5 h-5 flex items-center justify-center rounded hover:bg-secondary text-muted-foreground hover:text-primary transition-colors"
            >
              <Plus size={11} />
            </button>
          )}
        >
          {pinnedFolders.length === 0 ? (
            <p className="px-5 py-1.5 text-[11px] text-muted-foreground/50 italic">
              Navigue vers un dossier puis clique + pour l'épingler
            </p>
          ) : (
            pinnedFolders.map((dir) => (
              <SidebarItem
                key={dir.path}
                icon={Star}
                label={dir.name}
                active={currentPath === dir.path}
                onClick={() => navigateToFolder(dir.path)}
                onRemove={() => unpinFolder(dir.path)}
              />
            ))
          )}
        </SidebarSection>

        {/* OneDrive */}
        {onedriveDirs.length > 0 && (
          <>
            <div className="h-px bg-border mx-4 my-2" />
            <SidebarSection title="OneDrive">
              {onedriveDirs.map((dir) => (
                <SidebarItem
                  key={dir.path}
                  icon={Cloud}
                  label={dir.name}
                  active={currentPath === dir.path}
                  onClick={() => navigateToFolder(dir.path)}
                />
              ))}
            </SidebarSection>
          </>
        )}

        {/* Récents */}
        {recentFolders.length > 0 && (
          <>
            <div className="h-px bg-border mx-4 my-2" />
            <SidebarSection title="Récents" defaultOpen={false}>
              {recentFolders.slice(0, 10).map(dir => (
                <SidebarItem
                  key={dir.path}
                  icon={FolderOpen}
                  label={dir.name}
                  active={currentPath === dir.path}
                  onClick={() => navigateToFolder(dir.path)}
                />
              ))}
            </SidebarSection>
          </>
        )}

        <div className="h-px bg-border mx-4 my-2" />

        {/* Ce PC */}
        <SidebarSection title="Ce PC">
          <SidebarItem
            icon={Monitor}
            label="Ce PC"
            active={currentPath === ''}
            onClick={() => navigateToFolder('')}
          />
        </SidebarSection>

        <div className="h-px bg-border mx-4 my-2" />

        {/* Stockage */}
        <SidebarSection title="Stockage" defaultOpen={false}>
          <SidebarItem icon={HardDrive} label="Disques locaux" onClick={() => navigateToFolder('')} />
          <SidebarItem icon={Network} label="Réseau" onClick={() => {}} />
        </SidebarSection>
      </div>

      {/* Corbeille */}
      <div className="border-t border-border p-2">
        <SidebarItem icon={Trash2} label="Corbeille" onClick={() => {}} />
      </div>
    </aside>
  );
};

// ============ VIEW SWITCHER ============

const ViewSwitcher = () => {
  const { view, setView, iconSize, setIconSize } = useFileManager();

  const views = [
    { id: 'icons', icon: LayoutGrid, label: 'Icônes' },
    { id: 'list',  icon: List,   label: 'Liste' },
    { id: 'columns', icon: Columns, label: 'Colonnes' },
    { id: 'gallery', icon: GalleryHorizontal, label: 'Galerie' },
  ];

  const sizes = [
    { id: 'sm', label: 'S', title: 'Petites icônes' },
    { id: 'lg', label: 'L', title: 'Grandes icônes' },
    { id: 'xl', label: 'XL', title: 'Très grandes icônes' },
  ];

  return (
    <div className="flex items-center gap-1.5">
      {/* Size picker — only when in icons view */}
      {view === 'icons' && (
        <div className="flex items-center p-0.5 bg-secondary rounded-md border border-border">
          {sizes.map(({ id, label, title }) => (
            <button key={id} onClick={() => { setIconSize(id); localStorage.setItem('iconSize', id); }}
              title={title}
              className={cn('h-6 px-2 text-[11px] font-semibold rounded transition-colors',
                iconSize === id ? 'bg-background shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground'
              )}>
              {label}
            </button>
          ))}
        </div>
      )}

      {/* View mode buttons */}
      <div className="flex items-center p-0.5 bg-secondary rounded-md border border-border">
        {views.map(({ id, icon: Icon, label }) => (
          <button key={id} onClick={() => setView(id)}
            className={cn('view-switcher-btn', view === id && 'view-switcher-btn-active')}
            title={`${label} (Ctrl+${views.findIndex(v => v.id === id) + 1})`}>
            <Icon size={16} strokeWidth={1.5} />
          </button>
        ))}
      </div>
    </div>
  );
};

// ============ THEME TOGGLE ============

const ThemeToggle = () => {
  const { theme, setTheme } = useTheme();
  
  const nextTheme = () => {
    if (theme === 'light') setTheme('dark');
    else if (theme === 'dark') setTheme('system');
    else setTheme('light');
  };
  
  return (
    <button
      onClick={nextTheme}
      className="h-7 w-7 flex items-center justify-center rounded-md hover:bg-secondary transition-colors"
      title={`Thème: ${theme === 'light' ? 'Clair' : theme === 'dark' ? 'Sombre' : 'Système'}`}
    >
      {theme === 'dark' ? (
        <Moon size={16} strokeWidth={1.5} />
      ) : theme === 'light' ? (
        <Sun size={16} strokeWidth={1.5} />
      ) : (
        <Monitor size={16} strokeWidth={1.5} />
      )}
    </button>
  );
};

// ============ BREADCRUMB ============

const Breadcrumb = () => {
  const { breadcrumbs, navigateToFolder } = useFileManager();
  
  return (
    <nav className="flex items-center gap-1 text-[13px] min-w-0 flex-1">
      {breadcrumbs.map((crumb, index) => (
        <React.Fragment key={crumb.id || 'root'}>
          {index > 0 && (
            <ChevronRight size={14} className="text-muted-foreground flex-shrink-0" />
          )}
          <button
            onClick={() => navigateToFolder(crumb.path)}
            className={cn(
              'truncate max-w-[150px]',
              index === breadcrumbs.length - 1 ? 'breadcrumb-item-current' : 'breadcrumb-item'
            )}
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
  const { goBack, goForward, navigationHistory, searchQuery, setSearchQuery, search, refresh, loading, currentPath, pinnedFolders, pinFolder, unpinFolder } = useFileManager();
  const { setSettingsOpen, setAiPanelOpen, setDiskAnalysisOpen } = useTheme();
  const isPinned = currentPath && pinnedFolders.some(f => f.path === currentPath);
  
  const handleSearchChange = (e) => {
    const value = e.target.value;
    setSearchQuery(value);
    search(value);
  };
  
  return (
    <header className="glass-topbar h-[44px] flex-shrink-0 flex items-center justify-between px-3 gap-3">
      {/* Navigation */}
      <div className="flex items-center gap-1">
        <button
          className="h-7 w-7 flex items-center justify-center rounded-md hover:bg-secondary transition-colors disabled:opacity-50"
          onClick={goBack}
          disabled={navigationHistory.past.length === 0}
          title="Précédent (Alt+←)"
        >
          <ChevronLeft size={18} strokeWidth={1.5} />
        </button>
        <button
          className="h-7 w-7 flex items-center justify-center rounded-md hover:bg-secondary transition-colors disabled:opacity-50"
          onClick={goForward}
          disabled={navigationHistory.future.length === 0}
          title="Suivant (Alt+→)"
        >
          <ChevronRight size={18} strokeWidth={1.5} />
        </button>
      </div>
      
      {/* Breadcrumb */}
      <Breadcrumb />
      
      {/* Right controls */}
      <div className="flex items-center gap-2">
        <div className="relative">
          <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input
            type="text"
            placeholder="Rechercher..."
            value={searchQuery}
            onChange={handleSearchChange}
            className="h-7 w-40 pl-8 pr-2 text-[13px] bg-secondary/50 border border-transparent rounded-md focus:bg-background focus:border-input focus:outline-none"
          />
          {searchQuery && (
            <button
              onClick={() => { setSearchQuery(''); search(''); }}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            >
              <X size={12} />
            </button>
          )}
        </div>
        
        <div className="w-px h-5 bg-border" />
        
        <ViewSwitcher />
        
        <div className="w-px h-5 bg-border" />

        {currentPath && (
          <button
            onClick={() => isPinned ? unpinFolder(currentPath) : pinFolder(currentPath)}
            title={isPinned ? 'Retirer des favoris' : 'Ajouter aux favoris'}
            className="h-7 w-7 flex items-center justify-center rounded-md hover:bg-secondary transition-colors"
          >
            <Star size={14} strokeWidth={1.5} className={isPinned ? 'fill-yellow-400 text-yellow-400' : 'text-muted-foreground'} />
          </button>
        )}

        <div className="w-px h-5 bg-border" />

        <ThemeToggle />
        
        <button
          className="h-7 w-7 flex items-center justify-center rounded-md hover:bg-secondary transition-colors disabled:opacity-50"
          onClick={refresh}
          disabled={loading}
          title="Actualiser (F5)"
        >
          <RefreshCw size={14} strokeWidth={1.5} className={loading ? 'animate-spin' : ''} />
        </button>
        
        {currentPath && (
          <button
            className="h-7 w-7 flex items-center justify-center rounded-md hover:bg-secondary transition-colors"
            title="Analyse d'espace"
            onClick={() => setDiskAnalysisOpen(true)}
          >
            <BarChart2 size={14} strokeWidth={1.5} className="text-muted-foreground" />
          </button>
        )}

        <button
          className="h-7 px-2 flex items-center gap-1.5 rounded-md hover:bg-secondary transition-colors text-primary"
          title="Assistant IA"
          onClick={() => setAiPanelOpen(true)}
        >
          <Sparkles size={14} strokeWidth={1.5} />
          <span className="text-[12px] font-medium hidden sm:inline">IA</span>
        </button>

        <button
          className="h-7 w-7 flex items-center justify-center rounded-md hover:bg-secondary transition-colors"
          title="Préférences"
          onClick={() => setSettingsOpen(true)}
        >
          <Settings size={14} strokeWidth={1.5} />
        </button>
      </div>
    </header>
  );
};

// ============ FILE ITEM (ICON VIEW) ============

const FileItemIcon = ({ file }) => {
  const { selectedFiles, setSelectedFiles, openItem, copyFiles, cutFiles, deleteFile, renameFile, iconSize, currentPath, refresh } = useFileManager();
  const { showFileSizes } = useTheme();

  const handleZip = async () => {
    setShowContextMenu(false);
    const targets = selectedFiles.includes(file.path) ? selectedFiles : [file.path];
    const destName = targets.length === 1
      ? file.name.replace(/\.[^.]+$/, '') + '.zip'
      : 'archive.zip';
    const destPath = `${currentPath}\\${destName}`;
    try {
      await invoke('zip_items', { paths: targets, destPath });
      toast.success(`Archive créée : ${destName}`);
      refresh();
    } catch (e) { toast.error(String(e)); }
  };

  const handleExtract = async () => {
    setShowContextMenu(false);
    const destDir = currentPath;
    try {
      const msg = await invoke('extract_zip', { zipPath: file.path, destDir });
      toast.success(msg);
      refresh();
    } catch (e) { toast.error(String(e)); }
  };
  const isSelected = selectedFiles.includes(file.path);
  const [showContextMenu, setShowContextMenu] = useState(false);
  const [contextMenuPos, setContextMenuPos] = useState({ x: 0, y: 0 });
  
  const handleClick = (e) => {
    if (e.ctrlKey) {
      setSelectedFiles(prev => 
        prev.includes(file.path) ? prev.filter(p => p !== file.path) : [...prev, file.path]
      );
    } else {
      setSelectedFiles([file.path]);
    }
  };
  
  const handleDoubleClick = () => {
    openItem(file);
  };
  
  const handleContextMenu = (e) => {
    e.preventDefault();
    setContextMenuPos({ x: e.clientX, y: e.clientY });
    setShowContextMenu(true);
    if (!selectedFiles.includes(file.path)) {
      setSelectedFiles([file.path]);
    }
  };
  
  const handleRename = () => {
    const newName = prompt('Nouveau nom:', file.name);
    if (newName && newName !== file.name) {
      renameFile(file.path, newName);
    }
    setShowContextMenu(false);
  };
  
  return (
    <>
      <button
        onClick={handleClick}
        onDoubleClick={handleDoubleClick}
        onContextMenu={handleContextMenu}
        className={cn(
          'flex flex-col items-center p-3 rounded-lg transition-all duration-100 cursor-default group',
          isSelected ? 'bg-primary/10 ring-1 ring-primary/30' : 'hover:bg-secondary/80'
        )}
      >
        <div className="relative mb-2">
          <div className={cn('flex items-center justify-center',
            iconSize === 'xl' ? 'w-28 h-28' : iconSize === 'lg' ? 'w-20 h-20' : 'w-16 h-16'
          )}>
            {getFileIcon(file.file_type, file.extension, iconSize === 'xl' ? 72 : iconSize === 'lg' ? 56 : 40)}
          </div>
        </div>
        <span className={cn(
          'text-center leading-tight line-clamp-2',
          iconSize === 'xl' ? 'text-[13px] max-w-[120px]' : iconSize === 'lg' ? 'text-[12px] max-w-[90px]' : 'text-[11px] max-w-[72px]',
          isSelected ? 'text-primary font-medium' : 'text-foreground'
        )}>
          {file.name}
        </span>
        {showFileSizes && file.file_type !== 'folder' && file.size > 0 && (
          <span className="text-[10px] text-muted-foreground mt-0.5">
            {formatFileSize(file.size)}
          </span>
        )}
      </button>
      
      {/* Context Menu */}
      {showContextMenu && (
        <>
          <div 
            className="fixed inset-0 z-40" 
            onClick={() => setShowContextMenu(false)}
          />
          <div 
            className="fixed z-50 context-menu-glass min-w-[200px]"
            style={{ left: contextMenuPos.x, top: contextMenuPos.y }}
          >
            <button 
              className="w-full px-3 py-1.5 text-left text-[13px] hover:bg-secondary/50 rounded flex items-center gap-2"
              onClick={() => { openItem(file); setShowContextMenu(false); }}
            >
              <FolderOpen size={14} /> Ouvrir
            </button>
            <div className="h-px bg-border my-1" />
            <button 
              className="w-full px-3 py-1.5 text-left text-[13px] hover:bg-secondary/50 rounded flex items-center gap-2"
              onClick={() => { cutFiles([file.path]); setShowContextMenu(false); }}
            >
              <Scissors size={14} /> Couper
            </button>
            <button 
              className="w-full px-3 py-1.5 text-left text-[13px] hover:bg-secondary/50 rounded flex items-center gap-2"
              onClick={() => { copyFiles([file.path]); setShowContextMenu(false); }}
            >
              <Copy size={14} /> Copier
            </button>
            <div className="h-px bg-border my-1" />
            <button 
              className="w-full px-3 py-1.5 text-left text-[13px] hover:bg-secondary/50 rounded flex items-center gap-2"
              onClick={handleRename}
            >
              <Edit3 size={14} /> Renommer
            </button>
            <div className="h-px bg-border my-1" />
            <button
              className="w-full px-3 py-1.5 text-left text-[13px] hover:bg-secondary/50 rounded flex items-center gap-2"
              onClick={handleZip}
            >
              <PackagePlus size={14} /> Compresser en ZIP
            </button>
            {file.extension === 'zip' && (
              <button
                className="w-full px-3 py-1.5 text-left text-[13px] hover:bg-secondary/50 rounded flex items-center gap-2"
                onClick={handleExtract}
              >
                <PackageOpen size={14} /> Extraire ici
              </button>
            )}
            <div className="h-px bg-border my-1" />
            <button
              className="w-full px-3 py-1.5 text-left text-[13px] hover:bg-secondary/50 rounded flex items-center gap-2 text-destructive"
              onClick={() => { deleteFile(file.path, false); setShowContextMenu(false); }}
            >
              <Trash2 size={14} /> Supprimer
            </button>
          </div>
        </>
      )}
    </>
  );
};

// ============ ICONS VIEW ============

const IconsView = () => {
  const { files, setSelectedFiles, iconSize } = useFileManager();

  return (
    <div
      className={cn('h-full overflow-y-auto p-4 gap-1 content-start',
        iconSize === 'xl'
          ? 'grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5'
          : iconSize === 'lg'
          ? 'grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-7'
          : 'grid grid-cols-4 sm:grid-cols-5 md:grid-cols-6 lg:grid-cols-8 xl:grid-cols-10'
      )}
      onClick={(e) => {
        if (e.target === e.currentTarget) setSelectedFiles([]);
      }}
    >
      {files.map((file) => (
        <FileItemIcon key={file.path} file={file} />
      ))}
    </div>
  );
};

// ============ LIST VIEW ============

const ListView = () => {
  const { files, selectedFiles, setSelectedFiles, openItem } = useFileManager();
  
  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center h-8 px-4 border-b border-border bg-secondary/30 text-[11px] font-medium text-muted-foreground uppercase tracking-wide">
        <div className="flex-1 px-2">Nom</div>
        <div className="w-40 px-2">Date de modification</div>
        <div className="w-24 px-2">Taille</div>
        <div className="w-28 px-2">Type</div>
      </div>
      
      {/* Rows */}
      <div className="flex-1 overflow-y-auto scrollbar-thin">
        {files.map((file) => {
          const isSelected = selectedFiles.includes(file.path);
          return (
            <button
              key={file.path}
              onClick={(e) => {
                if (e.ctrlKey) {
                  setSelectedFiles(prev => 
                    prev.includes(file.path) ? prev.filter(p => p !== file.path) : [...prev, file.path]
                  );
                } else {
                  setSelectedFiles([file.path]);
                }
              }}
              onDoubleClick={() => openItem(file)}
              className={cn(
                'flex items-center w-full h-9 px-4 text-left transition-colors cursor-default',
                isSelected ? 'bg-primary/10' : 'hover:bg-secondary/50'
              )}
            >
              <div className="flex-1 flex items-center gap-2 px-2 truncate">
                {getFileIcon(file.file_type, file.extension, 16)}
                <span className={cn('truncate', isSelected && 'text-primary font-medium')}>
                  {file.name}
                </span>
              </div>
              <div className="w-40 px-2 text-muted-foreground truncate text-[12px]">
                {formatDate(file.modified_at)}
              </div>
              <div className="w-24 px-2 text-muted-foreground truncate text-[12px]">
                {file.file_type === 'folder' ? '—' : formatFileSize(file.size)}
              </div>
              <div className="w-28 px-2 text-muted-foreground truncate text-[12px]">
                {getFileKind(file.file_type, file.extension)}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
};

// ============ COLUMNS VIEW ============

const ColumnsView = () => {
  const { files, selectedFiles, setSelectedFiles, openItem, currentPath } = useFileManager();
  const [columnStack, setColumnStack] = useState([{ path: currentPath, files }]);
  
  useEffect(() => {
    setColumnStack([{ path: currentPath, files }]);
  }, [files, currentPath]);
  
  const handleSelectItem = async (file, columnIndex) => {
    setSelectedFiles([file.path]);
    
    if (file.file_type === 'folder') {
      const newStack = columnStack.slice(0, columnIndex + 1);
      setColumnStack([...newStack, { path: file.path, files: [], loading: true }]);
      
      try {
        const result = await invoke('list_files', { path: file.path, showHidden: false });
        setColumnStack(prev => {
          const updated = [...prev];
          const targetIndex = columnIndex + 1;
          if (updated[targetIndex]) {
            updated[targetIndex] = { path: file.path, files: result, loading: false };
          }
          return updated;
        });
      } catch (error) {
        console.error(error);
      }
    } else {
      const newStack = columnStack.slice(0, columnIndex + 1);
      setColumnStack([...newStack, { path: file.path, file, isPreview: true }]);
    }
  };
  
  return (
    <div className="flex h-full overflow-x-auto scrollbar-thin">
      {columnStack.map((column, index) => (
        <div 
          key={`${column.path}-${index}`}
          className="w-52 flex-shrink-0 border-r border-border flex flex-col"
        >
          {column.isPreview ? (
            <div className="p-4 flex flex-col items-center">
              <div className="w-24 h-24 mb-3 flex items-center justify-center">
                {getFileIcon(column.file.file_type, column.file.extension, 64)}
              </div>
              <h4 className="text-sm font-medium text-center mb-1">{column.file.name}</h4>
              <p className="text-xs text-muted-foreground">{getFileKind(column.file.file_type, column.file.extension)}</p>
              <p className="text-xs text-muted-foreground">{formatFileSize(column.file.size)}</p>
            </div>
          ) : (
            <div className="flex-1 overflow-y-auto scrollbar-thin">
              {column.loading ? (
                <div className="p-4 text-sm text-muted-foreground">Chargement...</div>
              ) : column.files.length === 0 ? (
                <div className="p-4 text-sm text-muted-foreground italic">Dossier vide</div>
              ) : (
                column.files.map((file) => {
                  const isSelected = selectedFiles.includes(file.path);
                  return (
                    <button
                      key={file.path}
                      onClick={() => handleSelectItem(file, index)}
                      onDoubleClick={() => file.file_type !== 'folder' && openItem(file)}
                      className={cn(
                        'flex items-center w-full px-3 py-1.5 text-left transition-colors cursor-default gap-2',
                        isSelected ? 'bg-primary text-primary-foreground' : 'hover:bg-secondary/50'
                      )}
                    >
                      {getFileIcon(file.file_type, file.extension, 14)}
                      <span className="flex-1 truncate text-[13px]">{file.name}</span>
                      {file.file_type === 'folder' && (
                        <ChevronRight size={14} className={isSelected ? 'text-primary-foreground/70' : 'text-muted-foreground'} />
                      )}
                    </button>
                  );
                })
              )}
            </div>
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
  
  const displayFiles = files;
  const selectedFile = displayFiles[selectedIndex];
  
  useEffect(() => {
    if (selectedFile) {
      setSelectedFiles([selectedFile.path]);
    }
  }, [selectedIndex, selectedFile, setSelectedFiles]);
  
  return (
    <div className="flex h-full">
      {/* Main preview */}
      <div className="flex-1 flex items-center justify-center p-6 bg-secondary/20 overflow-hidden">
        {selectedFile ? (
          selectedFile.file_type === 'image' ? (
            <img
              key={selectedFile.path}
              src={convertFileSrc(selectedFile.path)}
              alt={selectedFile.name}
              className="max-w-full max-h-full object-contain rounded-lg shadow-lg"
            />
          ) : selectedFile.extension === 'pdf' ? (
            <iframe
              key={selectedFile.path}
              src={convertFileSrc(selectedFile.path)}
              className="w-full h-full rounded border-0"
              title={selectedFile.name}
            />
          ) : (
            <div className="text-center">
              <div className="w-48 h-48 mx-auto mb-4 flex items-center justify-center">
                {getFileIcon(selectedFile.file_type, selectedFile.extension, 128)}
              </div>
              <h3 className="text-lg font-medium">{selectedFile.name}</h3>
              <p className="text-sm text-muted-foreground">
                {getFileKind(selectedFile.file_type, selectedFile.extension)} • {formatFileSize(selectedFile.size)}
              </p>
            </div>
          )
        ) : (
          <p className="text-muted-foreground">Aucun fichier sélectionné</p>
        )}
      </div>
      
      {/* Thumbnail strip */}
      <div className="w-48 border-l border-border bg-background overflow-y-auto scrollbar-thin">
        <div className="p-2 space-y-1">
          {displayFiles.map((file, index) => {
            const isSelected = index === selectedIndex;
            return (
              <button
                key={file.path}
                onClick={() => setSelectedIndex(index)}
                onDoubleClick={() => openItem(file)}
                className={cn(
                  'w-full flex items-center gap-2 p-2 rounded-md transition-colors cursor-default',
                  isSelected ? 'bg-primary/10 ring-1 ring-primary/30' : 'hover:bg-secondary/50'
                )}
              >
                <div className="w-10 h-10 flex items-center justify-center flex-shrink-0">
                  {getFileIcon(file.file_type, file.extension, 24)}
                </div>
                <span className={cn('text-[12px] truncate', isSelected && 'text-primary font-medium')}>
                  {file.name}
                </span>
              </button>
            );
          })}
        </div>
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
          </>
        )}
      </div>
    );
  }
  
  return (
    <div className="glass-content flex-1 overflow-hidden animate-fade-in">
      <ViewComponent />
    </div>
  );
};

// ============ BATCH RENAME MODAL ============

const BatchRenameModal = ({ files, onClose }) => {
  const { refresh } = useFileManager();
  const [mode,     setMode]     = useState('sequence');   // 'sequence' | 'prefix_suffix' | 'find_replace'
  const [pattern,  setPattern]  = useState('{name}_{001}');
  const [prefix,   setPrefix]   = useState('');
  const [suffix,   setSuffix]   = useState('');
  const [find,     setFind]     = useState('');
  const [replace,  setReplace]  = useState('');
  const [startNum, setStartNum] = useState(1);
  const [applying, setApplying] = useState(false);

  const preview = useMemo(() => {
    return files.map((file, i) => {
      const extRaw = file.extension ? `.${file.extension}` : '';
      const nameNoExt = file.extension
        ? file.name.slice(0, file.name.length - extRaw.length)
        : file.name;

      let newName;
      if (mode === 'sequence') {
        const num = String(startNum + i);
        // Detect padding from pattern (e.g. {001} → 3 digits)
        const padMatch = pattern.match(/\{(0+)\}/);
        const padded   = padMatch ? num.padStart(padMatch[1].length, '0') : num;
        newName = pattern
          .replace(/\{0+\}/g, padded)
          .replace(/\{n\}/g,   String(startNum + i))
          .replace(/\{name\}/g, nameNoExt)
          .replace(/\{ext\}/g,  file.extension || '')
          .replace(/\{date\}/g, new Date().toISOString().slice(0, 10));
        if (!pattern.includes('{ext}')) newName += extRaw;
      } else if (mode === 'prefix_suffix') {
        newName = prefix + nameNoExt + suffix + extRaw;
      } else {
        newName = (find ? nameNoExt.replaceAll(find, replace) : nameNoExt) + extRaw;
      }
      return { original: file.name, newName, path: file.path, changed: newName !== file.name };
    });
  }, [files, mode, pattern, prefix, suffix, find, replace, startNum]);

  const apply = async () => {
    setApplying(true);
    let ok = 0;
    for (const item of preview.filter(p => p.changed)) {
      try {
        await invoke('rename_file', { path: item.path, newName: item.newName });
        ok++;
      } catch (e) {
        toast.error(`${item.original} : ${e}`);
      }
    }
    if (ok) toast.success(`${ok} fichier${ok > 1 ? 's' : ''} renommé${ok > 1 ? 's' : ''}`);
    setApplying(false);
    refresh();
    onClose();
  };

  const MODES = [
    { id: 'sequence',      label: 'Numérotation' },
    { id: 'prefix_suffix', label: 'Préfixe / Suffixe' },
    { id: 'find_replace',  label: 'Rechercher / Remplacer' },
  ];

  return (
    <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-background border border-border rounded-2xl shadow-2xl w-full max-w-[560px] max-h-[85vh] flex flex-col" onClick={e => e.stopPropagation()}>

        {/* Header */}
        <div className="flex items-center justify-between px-5 pt-5 pb-4 border-b border-border flex-shrink-0">
          <div>
            <p className="text-[14px] font-semibold">Renommer en lot</p>
            <p className="text-[11px] text-muted-foreground">{files.length} fichier{files.length > 1 ? 's' : ''} sélectionné{files.length > 1 ? 's' : ''}</p>
          </div>
          <button onClick={onClose} className="w-7 h-7 flex items-center justify-center rounded-full hover:bg-secondary transition-colors">
            <X size={14} />
          </button>
        </div>

        {/* Mode tabs */}
        <div className="px-5 pt-4 flex-shrink-0">
          <div className="flex gap-1 p-0.5 bg-secondary/60 rounded-lg">
            {MODES.map(m => (
              <button key={m.id} onClick={() => setMode(m.id)}
                className={cn('flex-1 py-1.5 rounded-md text-[11px] font-medium transition-all',
                  mode === m.id ? 'bg-background shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground'
                )}>
                {m.label}
              </button>
            ))}
          </div>
        </div>

        {/* Options */}
        <div className="px-5 pt-4 pb-3 flex-shrink-0 space-y-3">
          {mode === 'sequence' && (
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="text-[11px] text-muted-foreground">Modèle</label>
                <input value={pattern} onChange={e => setPattern(e.target.value)}
                  className="w-full px-3 py-1.5 text-[12px] bg-secondary/50 border border-input rounded-lg focus:outline-none focus:border-primary"
                  placeholder="{name}_{001}" />
                <p className="text-[10px] text-muted-foreground/60">Variables : {'{name}'} {'{001}'} {'{date}'} {'{ext}'}</p>
              </div>
              <div className="space-y-1">
                <label className="text-[11px] text-muted-foreground">Début à</label>
                <input type="number" min={0} value={startNum} onChange={e => setStartNum(Number(e.target.value))}
                  className="w-full px-3 py-1.5 text-[12px] bg-secondary/50 border border-input rounded-lg focus:outline-none focus:border-primary" />
              </div>
            </div>
          )}
          {mode === 'prefix_suffix' && (
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="text-[11px] text-muted-foreground">Préfixe</label>
                <input value={prefix} onChange={e => setPrefix(e.target.value)}
                  className="w-full px-3 py-1.5 text-[12px] bg-secondary/50 border border-input rounded-lg focus:outline-none focus:border-primary"
                  placeholder="ex: 2024_" />
              </div>
              <div className="space-y-1">
                <label className="text-[11px] text-muted-foreground">Suffixe (avant l'extension)</label>
                <input value={suffix} onChange={e => setSuffix(e.target.value)}
                  className="w-full px-3 py-1.5 text-[12px] bg-secondary/50 border border-input rounded-lg focus:outline-none focus:border-primary"
                  placeholder="ex: _final" />
              </div>
            </div>
          )}
          {mode === 'find_replace' && (
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="text-[11px] text-muted-foreground">Rechercher</label>
                <input value={find} onChange={e => setFind(e.target.value)}
                  className="w-full px-3 py-1.5 text-[12px] bg-secondary/50 border border-input rounded-lg focus:outline-none focus:border-primary"
                  placeholder="texte à trouver" />
              </div>
              <div className="space-y-1">
                <label className="text-[11px] text-muted-foreground">Remplacer par</label>
                <input value={replace} onChange={e => setReplace(e.target.value)}
                  className="w-full px-3 py-1.5 text-[12px] bg-secondary/50 border border-input rounded-lg focus:outline-none focus:border-primary"
                  placeholder="(vide = supprimer)" />
              </div>
            </div>
          )}
        </div>

        {/* Preview */}
        <div className="flex-1 overflow-y-auto px-5 pb-4 min-h-0">
          <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide mb-2">Aperçu</p>
          <div className="space-y-1">
            {preview.map((item, i) => (
              <div key={i} className={cn('flex items-center gap-2 text-[11px] py-1 px-2 rounded-lg',
                item.changed ? 'bg-primary/5' : 'opacity-50')}>
                <span className="flex-1 truncate text-muted-foreground">{item.original}</span>
                {item.changed && <>
                  <ChevronRight size={10} className="flex-shrink-0 text-muted-foreground/40" />
                  <span className="flex-1 truncate font-medium text-primary">{item.newName}</span>
                </>}
              </div>
            ))}
          </div>
        </div>

        {/* Footer */}
        <div className="px-5 py-4 border-t border-border flex items-center justify-between flex-shrink-0">
          <span className="text-[11px] text-muted-foreground">
            {preview.filter(p => p.changed).length} renommage{preview.filter(p => p.changed).length > 1 ? 's' : ''} à effectuer
          </span>
          <div className="flex gap-2">
            <button onClick={onClose}
              className="px-4 py-1.5 text-[12px] rounded-lg border border-border hover:bg-secondary transition-colors">
              Annuler
            </button>
            <button onClick={apply} disabled={applying || preview.filter(p => p.changed).length === 0}
              className="px-4 py-1.5 text-[12px] rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50 flex items-center gap-1.5">
              {applying ? <><Loader2 size={12} className="animate-spin"/>En cours…</> : 'Appliquer'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

// ============ STATUS BAR ============

const StatusBar = () => {
  const { files, selectedFiles, searchResults } = useFileManager();
  const [batchRenameOpen, setBatchRenameOpen] = useState(false);

  const displayFiles  = searchResults !== null ? searchResults : files;
  const itemCount     = displayFiles.length;
  const selectedCount = selectedFiles.length;
  const selectedFileObjs = files.filter(f => selectedFiles.includes(f.path));

  return (
    <>
      <footer className="h-[28px] flex-shrink-0 border-t border-border flex items-center justify-between px-4 text-[11px] text-muted-foreground bg-background">
        <div className="flex items-center gap-4">
          <span>{itemCount} élément{itemCount !== 1 ? 's' : ''}</span>
          {selectedCount > 0 && (
            <span>{selectedCount} sélectionné{selectedCount !== 1 ? 's' : ''}</span>
          )}
        </div>
        {selectedCount >= 2 && (
          <button
            onClick={() => setBatchRenameOpen(true)}
            className="flex items-center gap-1 px-2 py-0.5 rounded hover:bg-secondary transition-colors text-primary"
          >
            <Edit3 size={10} />
            Renommer en lot ({selectedCount})
          </button>
        )}
      </footer>
      {batchRenameOpen && (
        <BatchRenameModal
          files={selectedFileObjs}
          onClose={() => setBatchRenameOpen(false)}
        />
      )}
    </>
  );
};

// ============ QUICK LOOK ============

const QuickLook = () => {
  const { quickLookFile, setQuickLookFile } = useFileManager();
  
  if (!quickLookFile) return null;
  
  return (
    <div 
      className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center"
      onClick={() => setQuickLookFile(null)}
    >
      <div 
        className="bg-background rounded-xl shadow-2xl overflow-hidden max-w-4xl max-h-[90vh] animate-scale-in"
        onClick={e => e.stopPropagation()}
      >
        <div className="px-4 py-3 border-b border-border flex items-center gap-2">
          {getFileIcon(quickLookFile.file_type, quickLookFile.extension, 16)}
          <span className="text-sm font-medium">{quickLookFile.name}</span>
          <button 
            className="ml-auto p-1 hover:bg-secondary rounded"
            onClick={() => setQuickLookFile(null)}
          >
            <X size={16} />
          </button>
        </div>
        
        <div className="flex flex-col items-center justify-center" style={{ minHeight: 300, maxHeight: '70vh' }}>
          {quickLookFile.file_type === 'image' ? (
            <img
              key={quickLookFile.path}
              src={convertFileSrc(quickLookFile.path)}
              alt={quickLookFile.name}
              className="max-w-[700px] max-h-[60vh] object-contain rounded-lg"
            />
          ) : quickLookFile.extension === 'pdf' ? (
            <iframe
              key={quickLookFile.path}
              src={convertFileSrc(quickLookFile.path)}
              className="rounded border-0"
              style={{ width: 700, height: 500 }}
              title={quickLookFile.name}
            />
          ) : (
            <div className="p-8 flex flex-col items-center">
              {getFileIcon(quickLookFile.file_type, quickLookFile.extension, 96)}
              <p className="mt-4 text-lg font-medium">{quickLookFile.name}</p>
              <p className="text-muted-foreground">{getFileKind(quickLookFile.file_type, quickLookFile.extension)}</p>
              <p className="text-muted-foreground">{formatFileSize(quickLookFile.size)}</p>
              <p className="text-sm text-muted-foreground mt-4">
                Modifié le {formatDate(quickLookFile.modified_at)}
              </p>
            </div>
          )}
        </div>
        
        <div className="px-4 py-2 border-t border-border text-xs text-muted-foreground flex justify-between">
          <span>{quickLookFile.path}</span>
        </div>
      </div>
    </div>
  );
};

// ============ SETTINGS PANEL ============

const SettingsPanel = () => {
  const {
    theme, setTheme,
    visualStyle, setVisualStyle,
    accentColor, setAccentColor,
    settingsOpen, setSettingsOpen,
    showFileSizes, setShowFileSizes,
    aiProvider, setAiProvider,
    claudeKey, setClaudeKey,
    ollamaModel, setOllamaModel,
  } = useTheme();
  const [showKey, setShowKey] = useState(false);
  const [ollamaStatus, setOllamaStatus] = useState(null); // null | true | false

  const [diskSpaces, setDiskSpaces] = useState([]);
  const [analyzePath, setAnalyzePath] = useState('');
  const [categories, setCategories] = useState([]);
  const [analyzing, setAnalyzing] = useState(false);

  useEffect(() => {
    if (settingsOpen) {
      invoke('get_disk_spaces').then(setDiskSpaces).catch(console.error);
    }
  }, [settingsOpen]);

  const analyzeDir = async () => {
    if (!analyzePath) return;
    setAnalyzing(true);
    try {
      const result = await invoke('analyze_directory_categories', { path: analyzePath });
      setCategories(result);
    } catch (e) {
      toast.error('Impossible d\'analyser ce dossier');
    } finally {
      setAnalyzing(false);
    }
  };

  const totalAnalyzed = categories.reduce((s, c) => s + c.size, 0);

  if (!settingsOpen) return null;

  const STYLES = [
    { value: 'default', label: 'Défaut',       desc: 'Interface standard',     cls: 'style-card-default' },
    { value: 'frosted', label: 'Verre dépoli', desc: 'Fond flou léger',        cls: 'style-card-frosted' },
    { value: 'liquid',  label: 'Liquid Glass', desc: 'Effet Apple translucide', cls: 'style-card-liquid'  },
  ];

  const THEMES = [
    { value: 'light',  label: 'Clair'   },
    { value: 'dark',   label: 'Sombre'  },
    { value: 'system', label: 'Système' },
  ];

  return (
    <div className="fixed inset-0 z-50 flex justify-end" onClick={() => setSettingsOpen(false)}>
      <div
        className="settings-panel w-[340px] h-full flex flex-col"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="relative z-10 flex items-center justify-between px-5 py-4 border-b border-white/20 dark:border-white/8">
          <div className="flex items-center gap-2">
            <Settings size={16} strokeWidth={1.5} className="text-primary" />
            <span className="font-semibold text-[14px]">Préférences</span>
          </div>
          <button
            onClick={() => setSettingsOpen(false)}
            className="w-6 h-6 flex items-center justify-center rounded-full hover:bg-black/10 dark:hover:bg-white/10 transition-colors"
          >
            <X size={14} />
          </button>
        </div>

        {/* Body */}
        <div className="relative z-10 flex-1 overflow-y-auto scrollbar-thin px-5 py-5 space-y-6">

          {/* Apparence */}
          <section>
            <h3 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-3">Apparence</h3>
            <div className="grid grid-cols-3 gap-2">
              {THEMES.map(t => (
                <button
                  key={t.value}
                  onClick={() => setTheme(t.value)}
                  className={cn(
                    'py-2 rounded-lg text-[12px] font-medium border transition-all',
                    theme === t.value
                      ? 'border-primary bg-primary/10 text-primary'
                      : 'border-border hover:border-primary/40 text-foreground/70'
                  )}
                >
                  {t.label}
                </button>
              ))}
            </div>
          </section>

          {/* Effet visuel */}
          <section>
            <h3 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-3">Effet visuel</h3>
            <div className="space-y-2">
              {STYLES.map(s => (
                <button
                  key={s.value}
                  onClick={() => setVisualStyle(s.value)}
                  className={cn('style-card w-full text-left', s.cls, visualStyle === s.value && 'active')}
                >
                  <div className={cn('style-card-preview', s.cls)} />
                  <div className="font-medium text-[13px]">{s.label}</div>
                  <div className="text-[11px] text-muted-foreground">{s.desc}</div>
                </button>
              ))}
            </div>
          </section>

          {/* Couleur d'accent */}
          <section>
            <h3 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-3">Couleur d'accent</h3>
            <div className="flex flex-wrap gap-2.5">
              {ACCENT_PRESETS.map(c => (
                <button
                  key={c.hex}
                  onClick={() => setAccentColor(c.hex)}
                  title={c.label}
                  className={cn(
                    'w-8 h-8 rounded-full transition-all hover:scale-110 border-2',
                    accentColor === c.hex
                      ? 'border-white dark:border-white scale-110 shadow-lg'
                      : 'border-transparent'
                  )}
                  style={{ backgroundColor: c.hex }}
                />
              ))}
            </div>
          </section>

          {/* Affichage */}
          <section>
            <h3 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-3">Affichage</h3>
            <label className="flex items-center justify-between p-3 rounded-lg border border-border hover:border-primary/40 cursor-pointer transition-colors">
              <div>
                <div className="text-[13px] font-medium">Afficher le poids des fichiers</div>
                <div className="text-[11px] text-muted-foreground">Visible en vue icônes et liste</div>
              </div>
              <div
                onClick={() => setShowFileSizes(p => !p)}
                className={cn(
                  'relative w-10 h-6 rounded-full transition-colors cursor-pointer flex-shrink-0',
                  showFileSizes ? 'bg-primary' : 'bg-border'
                )}
              >
                <div className={cn(
                  'absolute top-1 w-4 h-4 rounded-full bg-white shadow transition-transform',
                  showFileSizes ? 'translate-x-5' : 'translate-x-1'
                )} />
              </div>
            </label>
          </section>

          {/* Espace disque */}
          <section>
            <h3 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-3">Espace disque</h3>
            <div className="space-y-3">
              {diskSpaces.map(disk => {
                const pct = disk.total_space > 0 ? (disk.used_space / disk.total_space) * 100 : 0;
                const fillClass = pct > 90 ? 'crit' : pct > 75 ? 'warn' : '';
                return (
                  <div key={disk.path} className="space-y-1.5">
                    <div className="flex justify-between items-center">
                      <span className="font-medium text-[12px] truncate">{disk.path}</span>
                      <span className="text-[11px] text-muted-foreground ml-2 flex-shrink-0">
                        {formatFileSize(disk.free_space)} libre / {formatFileSize(disk.total_space)}
                      </span>
                    </div>
                    <div className="disk-bar-track">
                      <div
                        className={cn('disk-bar-fill', fillClass)}
                        style={{ width: `${Math.min(pct, 100)}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </section>

          {/* IA */}
          <section>
            <h3 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-3 flex items-center gap-1.5">
              <Sparkles size={11} /> Assistant IA
            </h3>

            {/* Provider */}
            <div className="grid grid-cols-3 gap-1.5 mb-3">
              {[['claude','Claude API'],['ollama','Ollama'],['both','Les deux']].map(([v,l]) => (
                <button key={v} onClick={() => setAiProvider(v)}
                  className={cn('py-1.5 rounded-lg text-[11px] font-medium border transition-all',
                    aiProvider === v ? 'border-primary bg-primary/10 text-primary' : 'border-border hover:border-primary/40 text-foreground/70'
                  )}>{l}</button>
              ))}
            </div>

            {/* Claude key */}
            {(aiProvider === 'claude' || aiProvider === 'both') && (
              <div className="mb-3">
                <label className="text-[11px] text-muted-foreground mb-1 block">Clé API Anthropic</label>
                <div className="relative">
                  <input
                    type={showKey ? 'text' : 'password'}
                    value={claudeKey}
                    onChange={e => setClaudeKey(e.target.value)}
                    placeholder="sk-ant-api03-..."
                    className="w-full h-8 px-3 pr-8 text-[11px] bg-secondary/50 border border-input rounded-md focus:outline-none focus:border-primary font-mono"
                  />
                  <button onClick={() => setShowKey(s => !s)}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                    {showKey ? <EyeOff size={12} /> : <Eye size={12} />}
                  </button>
                </div>
                <p className="text-[10px] text-muted-foreground mt-1">
                  Stockée localement, jamais transmise hors API Anthropic.
                </p>
              </div>
            )}

            {/* Ollama */}
            {(aiProvider === 'ollama' || aiProvider === 'both') && (
              <div className="mb-3">
                <label className="text-[11px] text-muted-foreground mb-1 block">Modèle Ollama</label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={ollamaModel}
                    onChange={e => setOllamaModel(e.target.value)}
                    placeholder="llama3.2"
                    className="flex-1 h-8 px-3 text-[11px] bg-secondary/50 border border-input rounded-md focus:outline-none focus:border-primary font-mono"
                  />
                  <button
                    onClick={async () => {
                      setOllamaStatus(null);
                      const ok = await invoke('check_ollama').catch(() => false);
                      setOllamaStatus(ok);
                    }}
                    className="px-3 h-8 rounded-md bg-secondary border border-border text-[11px] hover:bg-secondary/80 transition-colors flex-shrink-0"
                  >Tester</button>
                </div>
                {ollamaStatus === true  && <p className="text-[10px] text-green-500 mt-1 flex items-center gap-1"><CheckCircle2 size={10}/> Ollama détecté sur localhost:11434</p>}
                {ollamaStatus === false && <p className="text-[10px] text-red-500 mt-1 flex items-center gap-1"><AlertCircle size={10}/> Ollama inaccessible — lance-le avec <code className="font-mono">ollama serve</code></p>}
              </div>
            )}
          </section>

          {/* Analyse par catégorie */}
          <section>
            <h3 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-3">Analyse par catégorie</h3>
            <div className="flex gap-2 mb-3">
              <input
                type="text"
                value={analyzePath}
                onChange={e => setAnalyzePath(e.target.value)}
                placeholder="Ex: C:\Users\..."
                className="flex-1 h-8 px-3 text-[12px] bg-secondary/50 border border-input rounded-md focus:outline-none focus:border-primary"
              />
              <button
                onClick={analyzeDir}
                disabled={analyzing || !analyzePath}
                className="px-3 h-8 rounded-md bg-primary text-primary-foreground text-[12px] font-medium disabled:opacity-50 hover:bg-primary/90 transition-colors flex-shrink-0"
              >
                {analyzing ? <RefreshCw size={12} className="animate-spin" /> : 'Analyser'}
              </button>
            </div>

            {categories.length > 0 && (
              <div className="space-y-2">
                {categories.map(cat => {
                  const pct = totalAnalyzed > 0 ? (cat.size / totalAnalyzed) * 100 : 0;
                  return (
                    <div key={cat.category} className="flex items-center gap-2">
                      <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: cat.color }} />
                      <span className="text-[12px] flex-1">{cat.category}</span>
                      <span className="text-[11px] text-muted-foreground">{cat.count} fichier{cat.count > 1 ? 's' : ''}</span>
                      <span className="text-[12px] font-medium w-16 text-right">{formatFileSize(cat.size)}</span>
                      <div className="w-16 disk-bar-track">
                        <div className="disk-bar-fill" style={{ width: `${pct}%`, backgroundColor: cat.color }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        </div>
      </div>
    </div>
  );
};

// ============ AI PERMISSION SYSTEM ============

// Risk level per action type
const AI_PERMISSION_LEVEL = {
  create_folder: 'safe',      // auto-execute, no dialog
  move_file:     'caution',   // confirm once, can remember
  rename:        'caution',
  delete_file:   'danger',    // always confirm, cannot save
  delete_folder: 'danger',
};

const PERM_LABELS = {
  safe:    { icon: ShieldCheck, color: 'text-green-500',  bg: 'bg-green-500/10',  border: 'border-green-500/25', label: 'Sûre' },
  caution: { icon: ShieldAlert, color: 'text-yellow-500', bg: 'bg-yellow-500/10', border: 'border-yellow-500/25', label: 'Modérée' },
  danger:  { icon: ShieldX,     color: 'text-red-500',    bg: 'bg-red-500/10',    border: 'border-red-500/25',   label: 'Sensible' },
};

const AiPermissionDialog = ({ action, onAllow, onAllowAlways, onDeny }) => {
  const level = AI_PERMISSION_LEVEL[action.action_type] || 'caution';
  const { icon: Icon, color, bg, border, label } = PERM_LABELS[level];

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="bg-background border border-border rounded-2xl shadow-2xl w-[420px] overflow-hidden animate-scale-in">

        {/* Header */}
        <div className={cn('flex items-center gap-3 px-5 py-4', bg, border, 'border-b')}>
          <div className={cn('w-10 h-10 rounded-xl flex items-center justify-center', bg, 'border', border)}>
            <Icon size={20} className={color} />
          </div>
          <div>
            <p className="font-semibold text-[14px]">Autorisation requise</p>
            <p className={cn('text-[11px]', color)}>Action {label.toLowerCase()} — confirmez avant d'exécuter</p>
          </div>
        </div>

        {/* Action detail */}
        <div className="px-5 py-4">
          <div className="rounded-xl bg-secondary/60 border border-border px-4 py-3 mb-4">
            <p className="text-[11px] text-muted-foreground mb-1 uppercase tracking-wide font-medium">
              {action.action_type === 'delete_file' ? 'Suppression de fichier' :
               action.action_type === 'delete_folder' ? 'Suppression de dossier' :
               action.action_type === 'move_file' ? 'Déplacement de fichier' :
               action.action_type === 'rename' ? 'Renommage' : 'Action IA'}
            </p>
            <p className="text-[12px] leading-relaxed">{action.description}</p>
            {action.source_path && (
              <p className="text-[10px] text-muted-foreground mt-2 font-mono truncate">
                {action.source_path}
              </p>
            )}
            <p className="text-[10px] text-muted-foreground mt-0.5 font-mono truncate">
              → {action.target_path}
            </p>
          </div>

          {level === 'danger' && (
            <div className="flex items-start gap-2 rounded-xl bg-red-500/8 border border-red-500/20 px-3 py-2 mb-4">
              <ShieldX size={12} className="text-red-500 mt-0.5 flex-shrink-0" />
              <p className="text-[11px] text-red-600 dark:text-red-400">
                Cette action est <strong>irréversible</strong>. Le fichier sera supprimé définitivement.
              </p>
            </div>
          )}

          {/* Buttons */}
          <div className="flex gap-2">
            <button onClick={onDeny}
              className="flex-1 h-9 rounded-xl border border-border bg-secondary/50 text-[12px] font-medium hover:bg-secondary transition-colors">
              Refuser
            </button>
            {level !== 'danger' && (
              <button onClick={onAllowAlways}
                className="flex-1 h-9 rounded-xl border border-primary/30 bg-primary/8 text-primary text-[12px] font-medium hover:bg-primary/15 transition-colors">
                Toujours autoriser
              </button>
            )}
            <button onClick={onAllow}
              className={cn('flex-1 h-9 rounded-xl text-[12px] font-medium transition-colors text-white',
                level === 'danger' ? 'bg-red-500 hover:bg-red-600' : 'bg-primary hover:bg-primary/90'
              )}>
              {level === 'danger' ? 'Supprimer quand même' : 'Autoriser'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

// ============ DISK ANALYSIS PANEL ============

const DiskAnalysis = () => {
  const { diskAnalysisOpen, setDiskAnalysisOpen } = useTheme();
  const { currentPath } = useFileManager();

  const [items,      setItems]      = useState([]);
  const [categories, setCategories] = useState([]);
  const [loading,    setLoading]    = useState(false);
  const [analyzed,   setAnalyzed]   = useState('');

  useEffect(() => {
    if (!diskAnalysisOpen || !currentPath) return;
    setLoading(true);
    setItems([]); setCategories([]); setAnalyzed('');
    Promise.all([
      invoke('get_subdirectory_sizes',     { path: currentPath }),
      invoke('analyze_directory_categories', { path: currentPath }),
    ]).then(([sizeData, catData]) => {
      setItems(sizeData);
      setCategories(catData);
      setAnalyzed(currentPath);
    }).catch(e => toast.error(String(e)))
      .finally(() => setLoading(false));
  }, [diskAnalysisOpen, currentPath]);

  if (!diskAnalysisOpen) return null;

  const totalSize  = items.reduce((s, i) => s + i.size, 0);
  const fmt = (bytes) => {
    if (bytes >= 1073741824) return (bytes / 1073741824).toFixed(1) + ' Go';
    if (bytes >= 1048576)    return (bytes / 1048576).toFixed(1)    + ' Mo';
    if (bytes >= 1024)       return (bytes / 1024).toFixed(0)       + ' Ko';
    return bytes + ' o';
  };

  const COLORS = ['#007AFF','#34C759','#FF9500','#AF52DE','#FF2D55','#32ADE6','#8E8E93','#FF6B35','#5AC8FA','#FFCC00'];

  return (
    <div className="fixed inset-0 z-40 flex justify-end" onClick={() => setDiskAnalysisOpen(false)}>
      <div className="settings-panel w-[480px] h-full flex flex-col" onClick={e => e.stopPropagation()}>

        {/* Header */}
        <div className="relative z-10 flex-shrink-0 px-5 pt-5 pb-4 border-b border-white/10 dark:border-white/5 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-xl bg-primary/15 flex items-center justify-center">
              <BarChart2 size={16} className="text-primary" />
            </div>
            <div>
              <p className="text-[13px] font-semibold">Analyse d'espace</p>
              <p className="text-[11px] text-muted-foreground truncate max-w-[280px]">
                {analyzed ? analyzed.split(/[/\\]/).pop() : 'Chargement…'}
              </p>
            </div>
          </div>
          <button onClick={() => setDiskAnalysisOpen(false)}
            className="w-6 h-6 flex items-center justify-center rounded-full hover:bg-black/10 dark:hover:bg-white/10 transition-colors">
            <X size={14} />
          </button>
        </div>

        {/* Content */}
        <div className="relative z-10 flex-1 overflow-y-auto px-5 py-4 space-y-5">

          {loading && (
            <div className="flex flex-col items-center justify-center h-40 gap-3 text-muted-foreground">
              <Loader2 size={24} className="animate-spin text-primary" />
              <p className="text-[12px]">Calcul des tailles en cours…</p>
            </div>
          )}

          {!loading && items.length > 0 && (
            <>
              {/* Total */}
              <div className="flex items-center justify-between">
                <span className="text-[12px] text-muted-foreground">Taille totale</span>
                <span className="text-[13px] font-semibold">{fmt(totalSize)}</span>
              </div>

              {/* Stacked bar */}
              <div className="h-3 rounded-full overflow-hidden flex gap-px">
                {items.slice(0, 10).map((item, i) => (
                  <div key={item.path}
                    style={{ width: `${(item.size / totalSize) * 100}%`, background: COLORS[i % COLORS.length] }}
                    className="h-full"
                    title={`${item.name} — ${fmt(item.size)}`}
                  />
                ))}
              </div>

              {/* Item list */}
              <div className="space-y-1.5">
                <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">Contenu</p>
                {items.map((item, i) => {
                  const pct = totalSize > 0 ? (item.size / totalSize) * 100 : 0;
                  return (
                    <div key={item.path} className="space-y-1">
                      <div className="flex items-center gap-2">
                        <div className="w-2.5 h-2.5 rounded-sm flex-shrink-0"
                          style={{ background: COLORS[i % COLORS.length] }} />
                        <span className="flex-1 text-[12px] truncate">{item.name}</span>
                        <span className="text-[11px] text-muted-foreground flex-shrink-0">{fmt(item.size)}</span>
                        <span className="text-[11px] text-muted-foreground/50 w-9 text-right flex-shrink-0">{pct.toFixed(0)}%</span>
                      </div>
                      <div className="h-1 bg-secondary rounded-full overflow-hidden ml-4">
                        <div className="h-full rounded-full transition-all duration-500"
                          style={{ width: `${pct}%`, background: COLORS[i % COLORS.length] }} />
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Category breakdown */}
              {categories.length > 0 && (
                <div className="space-y-2 pt-2 border-t border-border">
                  <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">Par type de fichier</p>
                  <div className="h-2.5 rounded-full overflow-hidden flex gap-px">
                    {categories.map(c => (
                      <div key={c.category}
                        style={{ width: `${(c.size / categories.reduce((s, x) => s + x.size, 0)) * 100}%`, background: c.color }}
                        className="h-full" title={`${c.category} — ${fmt(c.size)}`} />
                    ))}
                  </div>
                  <div className="grid grid-cols-2 gap-x-4 gap-y-1.5">
                    {categories.map(c => (
                      <div key={c.category} className="flex items-center gap-2">
                        <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: c.color }} />
                        <span className="text-[11px] flex-1 truncate">{c.category}</span>
                        <span className="text-[11px] text-muted-foreground">{fmt(c.size)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}

          {!loading && items.length === 0 && analyzed && (
            <div className="flex flex-col items-center justify-center h-40 text-muted-foreground gap-2">
              <HardDriveDownload size={28} strokeWidth={1} className="opacity-40" />
              <p className="text-[12px]">Dossier vide</p>
            </div>
          )}

          {!loading && !analyzed && !currentPath && (
            <div className="flex flex-col items-center justify-center h-40 text-muted-foreground gap-2">
              <BarChart2 size={28} strokeWidth={1} className="opacity-40" />
              <p className="text-[12px]">Ouvre un dossier pour l'analyser</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

// ============ AI PANEL ============

const AiPanel = () => {
  const { aiPanelOpen, setAiPanelOpen, aiProvider, claudeKey, ollamaModel } = useTheme();
  const { currentPath, refresh } = useFileManager();

  const [tab, setTab]                   = useState('chat');
  const [activeProvider, setActiveProvider] = useState('ollama');
  const [messages, setMessages]         = useState([]);
  const [question, setQuestion]         = useState('');
  const [chatLoading, setChatLoading]   = useState(false);
  const [actions, setActions]           = useState([]);
  const [actionSummary, setActionSummary] = useState('');
  const [proposing, setProposing]       = useState(false);
  const [executing, setExecuting]       = useState(new Set());
  const [done, setDone]                 = useState(new Set());
  const [permDialog, setPermDialog]     = useState(null); // { action, resolve }
  const [alwaysAllowed, setAlwaysAllowed] = useState(() => {
    try { return new Set(JSON.parse(localStorage.getItem('aiAlwaysAllowed') || '[]')); }
    catch { return new Set(); }
  });

  const bottomRef  = useRef(null);
  const textareaRef = useRef(null);

  useEffect(() => {
    if (aiPanelOpen) {
      setActiveProvider(aiProvider === 'both' ? 'ollama' : aiProvider);
      setMessages([]); setActions([]); setActionSummary('');
      setDone(new Set()); setTab('chat');
    }
  }, [aiPanelOpen, aiProvider]);

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages, chatLoading]);

  const reqParams = () => ({
    path: currentPath || '',
    provider: activeProvider,
    api_key: activeProvider === 'claude' ? claudeKey : null,
    model: activeProvider === 'claude' ? 'claude-haiku-4-5-20251001' : ollamaModel,
    question: null,
    history: null,
  });

  const sendMessage = async () => {
    const q = question.trim();
    if (!q || chatLoading) return;

    const newUserMsg = { role: 'user', content: q, ts: Date.now() };
    const updatedMessages = [...messages, newUserMsg];
    setMessages(updatedMessages);
    setQuestion('');
    setChatLoading(true);

    // Build conversation history for the API (exclude errors, keep user/assistant pairs)
    const history = messages
      .filter(m => m.role === 'user' || m.role === 'assistant')
      .map(m => ({ role: m.role, content: m.content }));

    try {
      const text = await invoke('ai_analyze', {
        request: { ...reqParams(), question: q, history },
      });
      setMessages(p => [...p, { role: 'assistant', content: text, ts: Date.now(), provider: activeProvider }]);
    } catch (e) {
      setMessages(p => [...p, { role: 'error', content: String(e), ts: Date.now() }]);
    } finally {
      setChatLoading(false);
    }
  };

  const proposeActions = async () => {
    setProposing(true); setActions([]); setActionSummary(''); setDone(new Set());
    try {
      const plan = await invoke('ai_propose_actions', { request: reqParams() });
      setActions(plan.actions || []);
      setActionSummary(plan.summary || '');
    } catch (e) { toast.error(String(e)); }
    finally { setProposing(false); }
  };

  // Request user permission for non-safe actions
  const requestPermission = (action) => new Promise((resolve) => {
    setPermDialog({ action, resolve });
  });

  const executeAction = async (action) => {
    const level = AI_PERMISSION_LEVEL[action.action_type] || 'caution';

    // Safe actions → auto-execute
    if (level !== 'safe' && !alwaysAllowed.has(action.action_type)) {
      const { granted, always } = await requestPermission(action);
      setPermDialog(null);
      if (!granted) return;
      if (always && level !== 'danger') {
        const next = new Set([...alwaysAllowed, action.action_type]);
        setAlwaysAllowed(next);
        localStorage.setItem('aiAlwaysAllowed', JSON.stringify([...next]));
      }
    }

    setExecuting(p => new Set([...p, action.id]));
    try {
      await invoke('ai_execute_action', { action });
      setDone(p => new Set([...p, action.id]));
      toast.success(action.description.split(' — ')[0]);
      refresh();
    } catch (e) { toast.error(String(e)); }
    finally { setExecuting(p => { const s = new Set(p); s.delete(action.id); return s; }); }
  };

  const executeAll = async () => {
    for (const a of actions.filter(a => !done.has(a.id))) await executeAction(a);
  };

  const renderMsg = (msg, i) => {
    if (msg.role === 'user') return (
      <div key={i} className="flex justify-end mb-3">
        <div className="max-w-[82%] bg-primary text-primary-foreground rounded-2xl rounded-br-sm px-4 py-2.5 text-[12px] leading-relaxed whitespace-pre-wrap">
          {msg.content}
        </div>
      </div>
    );
    if (msg.role === 'error') return (
      <div key={i} className="flex mb-3">
        <div className="max-w-[85%] bg-red-500/10 border border-red-500/25 text-red-500 rounded-2xl rounded-bl-sm px-4 py-2.5 text-[12px] flex items-start gap-2">
          <AlertCircle size={12} className="mt-0.5 flex-shrink-0"/>{msg.content}
        </div>
      </div>
    );
    return (
      <div key={i} className="flex mb-3 items-start gap-2">
        <div className="w-6 h-6 rounded-full bg-primary/15 flex items-center justify-center flex-shrink-0 mt-0.5">
          <Bot size={12} className="text-primary"/>
        </div>
        <div className="max-w-[85%] bg-secondary/70 rounded-2xl rounded-bl-sm px-4 py-2.5 text-[12px] leading-relaxed space-y-1">
          {msg.content.split('\n').map((line, j) => {
            if (!line.trim()) return <div key={j} className="h-1"/>;
            const html = line
              .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
              .replace(/^#{1,3}\s/, '')
              .replace(/^[-•*]\s/, '• ');
            return <p key={j} className={/^•/.test(html) ? 'pl-2' : ''} dangerouslySetInnerHTML={{ __html: html }}/>;
          })}
          <p className="text-[10px] text-muted-foreground/50 pt-1 border-t border-border/40 mt-1">
            {msg.provider === 'ollama' ? `🦙 ${ollamaModel}` : '✦ Claude Haiku'}
          </p>
        </div>
      </div>
    );
  };

  const actionIcon = (type) => {
    if (type === 'create_folder') return <Folder size={13} className="text-green-500" fill="currentColor" fillOpacity={0.2}/>;
    if (type === 'move_file')    return <Scissors size={13} className="text-blue-500"/>;
    return <Edit3 size={13} className="text-orange-400"/>;
  };

  if (!aiPanelOpen) return null;

  const showProviderToggle = aiProvider === 'both';
  const missingKey = (aiProvider === 'claude' || aiProvider === 'both') && activeProvider === 'claude' && !claudeKey;

  // Badge on action cards showing risk level
  const RiskBadge = ({ type }) => {
    const level = AI_PERMISSION_LEVEL[type] || 'caution';
    const { color, label } = PERM_LABELS[level];
    const Icon = PERM_LABELS[level].icon;
    return (
      <span className={cn('inline-flex items-center gap-0.5 text-[9px] font-semibold px-1.5 py-0.5 rounded-full', color,
        level === 'safe' ? 'bg-green-500/10' : level === 'danger' ? 'bg-red-500/10' : 'bg-yellow-500/10')}>
        <Icon size={8}/>{label}
      </span>
    );
  };

  return (
    <>
    <div className="fixed inset-0 z-40 flex justify-end" onClick={() => setAiPanelOpen(false)}>
      <div className="settings-panel w-[480px] h-full flex flex-col" onClick={e => e.stopPropagation()}>

        {/* ── Header ── */}
        <div className="relative z-10 flex-shrink-0 px-5 py-3.5 border-b border-white/20 dark:border-white/8 space-y-2.5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-xl bg-primary/15 flex items-center justify-center">
                <Sparkles size={15} strokeWidth={1.5} className="text-primary"/>
              </div>
              <div>
                <span className="font-semibold text-[14px] block leading-tight">Assistant IA</span>
                <span className="text-[10px] text-muted-foreground font-mono truncate block max-w-[300px]">
                  {currentPath || 'Aucun dossier ouvert'}
                </span>
              </div>
            </div>
            <button onClick={() => setAiPanelOpen(false)}
              className="w-6 h-6 flex items-center justify-center rounded-full hover:bg-black/10 dark:hover:bg-white/10 transition-colors">
              <X size={14}/>
            </button>
          </div>

          {/* Provider toggle */}
          {showProviderToggle && (
            <div className="grid grid-cols-2 gap-1.5">
              {[['claude','✦ Claude'],['ollama',`🦙 ${ollamaModel}`]].map(([v,l]) => (
                <button key={v} onClick={() => setActiveProvider(v)}
                  className={cn('py-1 rounded-lg text-[11px] font-medium border transition-all',
                    activeProvider === v ? 'border-primary bg-primary/10 text-primary' : 'border-border hover:border-primary/40 text-foreground/60'
                  )}>{l}</button>
              ))}
            </div>
          )}

          {/* Tabs */}
          <div className="flex gap-1 p-0.5 bg-secondary/60 rounded-lg">
            {[['chat','💬  Chat'],['actions','⚡  Actions']].map(([t,l]) => (
              <button key={t} onClick={() => setTab(t)}
                className={cn('flex-1 py-1.5 rounded-md text-[12px] font-medium transition-all',
                  tab === t ? 'bg-background shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground'
                )}>{l}</button>
            ))}
          </div>
        </div>

        {/* ── Chat Tab ── */}
        {tab === 'chat' && <>
          <div className="relative z-10 flex-1 overflow-y-auto px-4 py-4 min-h-0">
            {messages.length === 0 && !chatLoading && (
              <div className="flex flex-col items-center justify-center h-full text-center gap-4 pb-4">
                <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center">
                  <Bot size={30} strokeWidth={1} className="text-primary"/>
                </div>
                <div>
                  <p className="text-[13px] font-medium">Comment puis-je t'aider ?</p>
                  <p className="text-[11px] text-muted-foreground mt-1 max-w-[260px]">
                    {currentPath
                      ? "Pose n'importe quelle question — le contexte du dossier ouvert est inclus automatiquement."
                      : "Ouvre un dossier pour les analyses de fichiers, ou pose directement une question générale."}
                  </p>
                </div>
                {currentPath && (
                  <div className="flex flex-col gap-2 w-full max-w-[300px]">
                    {['Suggère une organisation pour ce dossier', 'Quels fichiers puis-je archiver ?', 'Y a-t-il des doublons probables ?', 'Comment améliorer le nommage des fichiers ?'].map(s => (
                      <button key={s} onClick={() => { setQuestion(s); textareaRef.current?.focus(); }}
                        className="text-[11px] px-3.5 py-2 rounded-xl border border-border hover:border-primary/40 hover:bg-primary/5 transition-all text-left text-foreground/70">
                        {s}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
            {messages.length > 0 && (
              <div className="flex justify-end mb-2">
                <button onClick={() => setMessages([])}
                  className="text-[10px] text-muted-foreground/50 hover:text-muted-foreground transition-colors px-2 py-0.5 rounded">
                  Effacer la conversation
                </button>
              </div>
            )}
            {messages.map((msg, i) => renderMsg(msg, i))}
            {chatLoading && (
              <div className="flex mb-3 items-start gap-2">
                <div className="w-6 h-6 rounded-full bg-primary/15 flex items-center justify-center flex-shrink-0">
                  <Loader2 size={12} className="text-primary animate-spin"/>
                </div>
                <div className="bg-secondary/70 rounded-2xl rounded-bl-sm px-4 py-3 flex gap-1.5 items-center">
                  {[0, 150, 300].map(d => (
                    <span key={d} className="w-1.5 h-1.5 rounded-full bg-muted-foreground/50 animate-bounce"
                      style={{ animationDelay: `${d}ms` }}/>
                  ))}
                </div>
              </div>
            )}
            <div ref={bottomRef}/>
          </div>

          {/* Input */}
          <div className="relative z-10 flex-shrink-0 px-4 pb-4 pt-2 border-t border-white/10 dark:border-white/5 space-y-2">
            {missingKey && (
              <p className="text-[10px] text-yellow-500 flex items-center gap-1">
                <AlertCircle size={10}/>Clé Claude manquante — configure-la dans Préférences › IA
              </p>
            )}
            <div className="flex gap-2 items-end">
              <textarea
                ref={textareaRef}
                value={question}
                onChange={e => setQuestion(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); } }}
                placeholder={currentPath ? 'Pose une question sur ce dossier… (Entrée pour envoyer)' : 'Pose une question à l\'IA… (Entrée pour envoyer)'}
                rows={3}
                disabled={chatLoading}
                className="flex-1 px-3.5 py-2.5 text-[12px] bg-secondary/50 border border-input rounded-xl focus:outline-none focus:border-primary resize-none leading-relaxed disabled:opacity-50 transition-colors"
              />
              <button onClick={sendMessage}
                disabled={!question.trim() || chatLoading}
                className="h-10 w-10 flex-shrink-0 rounded-xl bg-primary text-primary-foreground flex items-center justify-center disabled:opacity-40 hover:bg-primary/90 transition-colors">
                {chatLoading ? <Loader2 size={16} className="animate-spin"/> : <Send size={16}/>}
              </button>
            </div>
            <p className="text-[10px] text-muted-foreground/50 text-center">
              {currentPath ? 'Noms et métadonnées uniquement — le contenu des fichiers n\'est jamais transmis' : 'Mode conversation libre — aucun fichier analysé'}
            </p>
          </div>
        </>}

        {/* ── Actions Tab ── */}
        {tab === 'actions' && (
          <div className="relative z-10 flex-1 flex flex-col min-h-0 overflow-hidden">
            <div className="px-4 pt-4 pb-3 flex-shrink-0 space-y-2">
              <button onClick={proposeActions} disabled={proposing || !currentPath}
                className="w-full h-10 rounded-xl bg-primary text-primary-foreground text-[13px] font-medium flex items-center justify-center gap-2 disabled:opacity-50 hover:bg-primary/90 transition-colors">
                {proposing
                  ? <><Loader2 size={15} className="animate-spin"/>Analyse en cours…</>
                  : <><Sparkles size={15}/>Proposer un plan d'organisation</>}
              </button>
              {actionSummary && (
                <p className="text-[11px] text-muted-foreground px-1 leading-relaxed">{actionSummary}</p>
              )}
              {actions.length > 0 && (() => {
                const nFolders = actions.filter(a => a.action_type === 'create_folder').length;
                const nMoves   = actions.filter(a => a.action_type === 'move_file').length;
                const nOther   = actions.length - nFolders - nMoves;
                const parts = [];
                if (nFolders) parts.push(`${nFolders} dossier${nFolders > 1 ? 's' : ''} à créer`);
                if (nMoves)   parts.push(`${nMoves} fichier${nMoves > 1 ? 's' : ''} à déplacer`);
                if (nOther)   parts.push(`${nOther} autre${nOther > 1 ? 's' : ''}`);
                return (
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] text-muted-foreground">
                        {parts.join(' · ')} · {done.size}/{actions.length} fait{done.size > 1 ? 's' : ''}
                      </span>
                      <button onClick={executeAll}
                        disabled={actions.every(a => done.has(a.id)) || executing.size > 0}
                        className="text-[11px] px-3 py-1 rounded-lg bg-primary/10 text-primary border border-primary/30 hover:bg-primary/20 transition-colors disabled:opacity-40">
                        Tout exécuter
                      </button>
                    </div>
                    {nMoves === 0 && nFolders > 0 && (
                      <p className="text-[10px] text-yellow-500 flex items-center gap-1">
                        <AlertCircle size={10}/>Aucun déplacement proposé — essaie de re-générer le plan
                      </p>
                    )}
                  </div>
                );
              })()}
            </div>

            <div className="flex-1 overflow-y-auto px-4 pb-4 space-y-2 min-h-0">
              {!proposing && actions.length === 0 && (
                <div className="flex flex-col items-center justify-center h-full text-center gap-3 text-muted-foreground">
                  <div className="w-14 h-14 rounded-2xl bg-secondary flex items-center justify-center">
                    <Sparkles size={22} strokeWidth={1} className="opacity-40"/>
                  </div>
                  <p className="text-[12px] max-w-[260px]">
                    L'IA va analyser le dossier et te proposer un plan concret : créer des sous-dossiers, déplacer et renommer tes fichiers.
                  </p>
                  <p className="text-[11px] text-yellow-600 dark:text-yellow-400 bg-yellow-500/10 border border-yellow-500/20 rounded-lg px-3 py-2 max-w-[280px]">
                    ⚠️ Chaque action modifie réellement tes fichiers. Lis les propositions avant d'exécuter.
                  </p>
                </div>
              )}

              {actions.map(action => {
                const isDone    = done.has(action.id);
                const isRunning = executing.has(action.id);
                return (
                  <div key={action.id}
                    className={cn('flex items-start gap-3 p-3.5 rounded-xl border transition-all',
                      isDone ? 'bg-green-500/5 border-green-500/20 opacity-50' : 'bg-secondary/40 border-border hover:border-primary/30'
                    )}>
                    <div className="mt-0.5 flex-shrink-0">{actionIcon(action.action_type)}</div>
                    <div className="flex-1 min-w-0">
                      <p className="text-[11.5px] leading-relaxed text-foreground/80">{action.description}</p>
                      <RiskBadge type={action.action_type} />
                    </div>
                    <button onClick={() => executeAction(action)} disabled={isDone || isRunning}
                      className={cn('flex-shrink-0 h-7 px-2.5 rounded-lg text-[11px] font-medium transition-colors flex items-center gap-1',
                        isDone ? 'bg-green-500/10 text-green-500 cursor-default' : 'bg-primary/10 text-primary hover:bg-primary/20 disabled:opacity-40'
                      )}>
                      {isDone ? <><CheckCircle2 size={12}/>OK</> : isRunning ? <Loader2 size={12} className="animate-spin"/> : 'Exécuter'}
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
    {/* Permission dialog — overlays everything */}
    {permDialog && (
      <AiPermissionDialog
        action={permDialog.action}
        onAllow={() => permDialog.resolve({ granted: true,  always: false })}
        onAllowAlways={() => permDialog.resolve({ granted: true,  always: true  })}
        onDeny={() => permDialog.resolve({ granted: false, always: false })}
      />
    )}
    </>
  );
};

// ============ MAIN APP ============

const FileManagerApp = () => {
  return (
    <div className="flex h-screen w-screen overflow-hidden text-[13px] select-none bg-background">
      <Sidebar />
      <main className="flex-1 flex flex-col min-w-0">
        <TopBar />
        <ContentArea />
        <StatusBar />
      </main>
      <QuickLook />
      <SettingsPanel />
      <DiskAnalysis />
      <AiPanel />
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
