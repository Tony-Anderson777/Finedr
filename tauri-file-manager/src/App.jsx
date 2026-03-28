// Smart File Manager - Application Tauri pour Windows
// Accès au vrai système de fichiers Windows

import React, { createContext, useContext, useEffect, useState, useCallback, useMemo } from 'react';
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
  Home, Copy, Scissors, Clipboard, Edit3, Info, Archive, FolderOpen, Cloud
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

  useEffect(() => {
    localStorage.setItem('showFileSizes', showFileSizes);
  }, [showFileSizes]);

  return (
    <ThemeContext.Provider value={{
      theme, setTheme,
      visualStyle, setVisualStyle,
      accentColor, setAccentColor,
      settingsOpen, setSettingsOpen,
      showFileSizes, setShowFileSizes,
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
  const [userDirs, setUserDirs] = useState([]);
  const [onedriveDirs, setOnedriveDirs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState(null);
  const [quickLookFile, setQuickLookFile] = useState(null);
  const [clipboard, setClipboard] = useState({ files: [], action: null });
  const [navigationHistory, setNavigationHistory] = useState({ past: [], future: [] });
  const [showHidden, setShowHidden] = useState(false);

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
  }, [currentPath]);

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
    refresh: () => fetchFiles(currentPath)
  }), [
    displayedFiles, files, currentPath, breadcrumbs, selectedFiles, view, userDirs,
    loading, searchQuery, searchResults, quickLookFile, clipboard, navigationHistory, showHidden,
    navigateToFolder, goBack, goForward, openItem, search, deleteFile, createFolder,
    renameFile, copyFiles, cutFiles, pasteFiles, fetchFiles, onedriveDirs
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
    <div className="mb-1">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-1 px-4 py-1.5 w-full text-left text-[11px] font-semibold text-muted-foreground uppercase tracking-wider hover:text-foreground transition-colors"
      >
        <ChevronRight 
          size={12} 
          className={cn('transition-transform duration-200', isOpen && 'rotate-90')}
        />
        {title}
      </button>
      {isOpen && (
        <div className="animate-fade-in">
          {children}
        </div>
      )}
    </div>
  );
};

// ============ SIDEBAR ITEM ============

const SidebarItem = ({ icon: Icon, label, active, onClick, badge }) => (
  <button
    onClick={onClick}
    className={cn('sidebar-item w-full', active && 'sidebar-item-active')}
  >
    {Icon && <Icon size={16} strokeWidth={1.5} className={active ? 'text-primary' : 'text-muted-foreground'} />}
    <span className="flex-1 truncate">{label}</span>
    {badge !== undefined && (
      <span className="text-[11px] text-muted-foreground">{badge}</span>
    )}
  </button>
);

// ============ SIDEBAR ============

const Sidebar = () => {
  const { userDirs, onedriveDirs, navigateToFolder, currentPath } = useFileManager();

  return (
    <aside className="glass-sidebar w-[220px] flex-shrink-0 h-full flex flex-col">
      <div className="flex-1 py-2 overflow-y-auto scrollbar-thin">

        {/* Favoris — dossiers locaux */}
        {userDirs.length > 0 && (
          <SidebarSection title="Favoris">
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
        <SidebarItem
          icon={Trash2}
          label="Corbeille"
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
    { id: 'icons', icon: LayoutGrid, label: 'Icônes' },
    { id: 'list', icon: List, label: 'Liste' },
    { id: 'columns', icon: Columns, label: 'Colonnes' },
    { id: 'gallery', icon: GalleryHorizontal, label: 'Galerie' }
  ];
  
  return (
    <div className="flex items-center p-0.5 bg-secondary rounded-md border border-border">
      {views.map(({ id, icon: Icon, label }) => (
        <button
          key={id}
          onClick={() => setView(id)}
          className={cn('view-switcher-btn', view === id && 'view-switcher-btn-active')}
          title={`${label} (Ctrl+${views.findIndex(v => v.id === id) + 1})`}
        >
          <Icon size={16} strokeWidth={1.5} />
        </button>
      ))}
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
  const { goBack, goForward, navigationHistory, searchQuery, setSearchQuery, search, refresh, loading } = useFileManager();
  const { setSettingsOpen } = useTheme();
  
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
        
        <ThemeToggle />
        
        <button
          className="h-7 w-7 flex items-center justify-center rounded-md hover:bg-secondary transition-colors disabled:opacity-50"
          onClick={refresh}
          disabled={loading}
          title="Actualiser (F5)"
        >
          <RefreshCw size={14} strokeWidth={1.5} className={loading ? 'animate-spin' : ''} />
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
  const { selectedFiles, setSelectedFiles, openItem, copyFiles, cutFiles, deleteFile, renameFile } = useFileManager();
  const { showFileSizes } = useTheme();
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
          <div className="w-16 h-16 flex items-center justify-center">
            {getFileIcon(file.file_type, file.extension, 48)}
          </div>
        </div>
        <span className={cn(
          'text-center text-[12px] leading-tight line-clamp-2 max-w-[80px]',
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
  const { files, setSelectedFiles } = useFileManager();

  return (
    <div
      className="h-full overflow-y-auto p-4 grid grid-cols-4 sm:grid-cols-5 md:grid-cols-6 lg:grid-cols-8 xl:grid-cols-10 gap-1 content-start"
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

// ============ STATUS BAR ============

const StatusBar = () => {
  const { files, selectedFiles, searchResults } = useFileManager();
  
  const displayFiles = searchResults !== null ? searchResults : files;
  const itemCount = displayFiles.length;
  const selectedCount = selectedFiles.length;
  
  return (
    <footer className="h-[28px] flex-shrink-0 border-t border-border flex items-center justify-between px-4 text-[11px] text-muted-foreground bg-background">
      <div className="flex items-center gap-4">
        <span>{itemCount} élément{itemCount !== 1 ? 's' : ''}</span>
        {selectedCount > 0 && (
          <span>{selectedCount} sélectionné{selectedCount !== 1 ? 's' : ''}</span>
        )}
      </div>
    </footer>
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
  } = useTheme();

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
