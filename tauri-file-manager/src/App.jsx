// Smart File Manager - Application Tauri pour Windows
// Accès au vrai système de fichiers Windows

import React, { createContext, useContext, useEffect, useState, useCallback, useMemo, useRef } from 'react';
import { invoke, convertFileSrc } from '@tauri-apps/api/core';
import { Toaster, toast } from 'sonner';
import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import hljs from 'highlight.js';

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
  PackagePlus, PackageOpen, GitBranch, Trash, AlertTriangle, Clock, HardDrive as HardDriveIcon,
  Tag, Tags, Palette, Check,
  ArrowLeftRight, SlidersHorizontal
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
  const style = { width: size, height: size, objectFit: 'contain', flexShrink: 0 };
  switch (type) {
    case 'folder':
      return <img src="/icons/folder.png" style={style} className="liquid-icon" alt="folder" />;
    case 'image':
      return <img src="/icons/picture.svg" style={style} className="liquid-icon" alt="image" />;
    case 'document':
      return <img src="/icons/document.png" style={style} className="liquid-icon" alt="document" />;
    case 'video':
    case 'audio':
    case 'archive':
    case 'code':
    default:
      return <img src="/icons/file.svg" style={style} className="liquid-icon" alt="file" />;
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
  const [iconTint, setIconTintState] = useState(() => localStorage.getItem('iconTint') || 'default');
  const [treeViewOpen, setTreeViewOpen] = useState(false);
  const [treeViewPath, setTreeViewPath] = useState('');
  const [syncPanelOpen, setSyncPanelOpen] = useState(false);

  // ── Toolbar config ────────────────────────────────────────────────────────
  const TOOLBAR_BUTTONS = [
    { id: 'star',     label: 'Favoris',           icon: Star },
    { id: 'theme',    label: 'Thème',              icon: Sun },
    { id: 'refresh',  label: 'Actualiser',         icon: RefreshCw },
    { id: 'disk',     label: 'Analyse d\'espace',  icon: BarChart2 },
    { id: 'sync',     label: 'Synchronisation',    icon: ArrowLeftRight },
    { id: 'split',    label: 'Vue double',          icon: Columns },
    { id: 'ai',       label: 'Assistant IA',       icon: Sparkles },
    { id: 'settings', label: 'Préférences',        icon: Settings },
  ];
  const loadToolbar = () => {
    try {
      const saved = JSON.parse(localStorage.getItem('finedr_toolbar') || 'null');
      if (saved) return saved;
    } catch {}
    return Object.fromEntries(TOOLBAR_BUTTONS.map(b => [b.id, true]));
  };
  const [toolbarConfig, setToolbarConfigState] = useState(loadToolbar);
  const setToolbarConfig = (next) => {
    setToolbarConfigState(next);
    localStorage.setItem('finedr_toolbar', JSON.stringify(next));
  };
  const toggleToolbarButton = (id) => {
    const next = { ...toolbarConfig, [id]: !toolbarConfig[id] };
    setToolbarConfig(next);
  };

  // ── Tags ──────────────────────────────────────────────────────────────────
  const loadTagsFromStorage = () => {
    try { return JSON.parse(localStorage.getItem('finedr_tags') || '{"definitions":{},"files":{}}'); }
    catch { return { definitions: {}, files: {} }; }
  };
  const [tagData, setTagDataState] = useState(loadTagsFromStorage);
  const [activeTagFilter, setActiveTagFilter] = useState(null); // tag id | null

  const saveTagData = (data) => {
    setTagDataState(data);
    localStorage.setItem('finedr_tags', JSON.stringify(data));
  };

  const createTag = (label, color) => {
    const id = `tag_${Date.now()}`;
    const next = { ...tagData, definitions: { ...tagData.definitions, [id]: { id, label, color } } };
    saveTagData(next);
    return id;
  };

  const deleteTag = (id) => {
    const defs = { ...tagData.definitions };
    delete defs[id];
    const files = Object.fromEntries(
      Object.entries(tagData.files).map(([p, tags]) => [p, tags.filter(t => t !== id)])
    );
    saveTagData({ definitions: defs, files });
  };

  const toggleFileTag = (filePath, tagId) => {
    const current = tagData.files[filePath] || [];
    const updated = current.includes(tagId) ? current.filter(t => t !== tagId) : [...current, tagId];
    saveTagData({ ...tagData, files: { ...tagData.files, [filePath]: updated } });
  };

  const getFileTags = (filePath) =>
    (tagData.files[filePath] || []).map(id => tagData.definitions[id]).filter(Boolean);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [showFileSizes, setShowFileSizes] = useState(() => localStorage.getItem('showFileSizes') !== 'false');
  const [aiPanelOpen, setAiPanelOpen]           = useState(false);
  const [diskAnalysisOpen, setDiskAnalysisOpen] = useState(false);
  const [splitMode, setSplitMode]               = useState(false);
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

  const ICON_TINTS = [
    { value: 'default', label: 'Blanc',  hex: '#ffffff', filter: '' },
    { value: 'blue',    label: 'Bleu',   hex: '#007AFF', filter: 'brightness(0) invert(1) sepia(1) saturate(5) hue-rotate(181deg)' },
    { value: 'green',   label: 'Vert',   hex: '#34C759', filter: 'brightness(0) invert(1) sepia(1) saturate(5) hue-rotate(104deg)' },
    { value: 'orange',  label: 'Orange', hex: '#FF9500', filter: 'brightness(0) invert(1) sepia(1) saturate(5) hue-rotate(5deg)' },
    { value: 'purple',  label: 'Violet', hex: '#AF52DE', filter: 'brightness(0) invert(1) sepia(1) saturate(4) hue-rotate(252deg)' },
    { value: 'pink',    label: 'Rose',   hex: '#FF2D55', filter: 'brightness(0) invert(1) sepia(1) saturate(5) hue-rotate(317deg)' },
    { value: 'cyan',    label: 'Cyan',   hex: '#5AC8FA', filter: 'brightness(0) invert(1) sepia(1) saturate(4) hue-rotate(151deg)' },
  ];

  const setIconTint = (value) => {
    setIconTintState(value);
    localStorage.setItem('iconTint', value);
    const tint = ICON_TINTS.find(t => t.value === value);
    document.documentElement.style.setProperty('--icon-tint-filter', tint?.filter || '');
  };

  useEffect(() => {
    const tint = ICON_TINTS.find(t => t.value === iconTint);
    document.documentElement.style.setProperty('--icon-tint-filter', tint?.filter || '');
  }, [iconTint]);

  useEffect(() => { localStorage.setItem('showFileSizes', showFileSizes); }, [showFileSizes]);
  useEffect(() => { localStorage.setItem('aiProvider',   aiProvider);   }, [aiProvider]);
  useEffect(() => { localStorage.setItem('claudeKey',    claudeKey);    }, [claudeKey]);
  useEffect(() => { localStorage.setItem('ollamaModel',  ollamaModel);  }, [ollamaModel]);

  return (
    <ThemeContext.Provider value={{
      theme, setTheme,
      visualStyle, setVisualStyle,
      accentColor, setAccentColor,
      iconTint, setIconTint, ICON_TINTS,
      treeViewOpen, setTreeViewOpen, treeViewPath, setTreeViewPath,
      syncPanelOpen, setSyncPanelOpen,
      toolbarConfig, toggleToolbarButton, TOOLBAR_BUTTONS,
      tagData, createTag, deleteTag, toggleFileTag, getFileTags, activeTagFilter, setActiveTagFilter,
      settingsOpen, setSettingsOpen,
      showFileSizes, setShowFileSizes,
      aiPanelOpen, setAiPanelOpen,
      diskAnalysisOpen, setDiskAnalysisOpen,
      splitMode, setSplitMode,
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

const SidebarItem = ({ icon: Icon, imgSrc, label, active, onClick, badge, onRemove }) => (
  <div className="group relative flex items-center">
    <button
      onClick={onClick}
      className={cn('sidebar-item flex-1 min-w-0', active && 'sidebar-item-active', onRemove && 'pr-7')}
    >
      {imgSrc
        ? <img src={imgSrc} style={{ width: 18, height: 18, objectFit: 'contain', flexShrink: 0, opacity: active ? 1 : 0.7 }} className="liquid-icon" alt="" />
        : Icon && <Icon size={16} strokeWidth={1.5} className={active ? 'text-primary' : 'text-muted-foreground'} />
      }
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
  const { tagData, activeTagFilter, setActiveTagFilter } = useTheme();
  const [tagManagerOpen, setTagManagerOpen] = useState(false);

  const canPin = currentPath && !pinnedFolders.some(f => f.path === currentPath);
  const tagDefinitions = Object.values(tagData.definitions);

  return (
    <aside className="glass-sidebar w-[220px] flex-shrink-0 h-full flex flex-col">
      <div className="flex-1 py-2 overflow-y-auto scrollbar-thin">

        {/* Favoris — dossiers système */}
        {userDirs.length > 0 && (
          <SidebarSection title="Raccourcis">
            {userDirs.map((dir) => (
              <SidebarItem
                key={dir.path}
                imgSrc="/icons/folder.png"
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
                imgSrc="/icons/bookmark.svg"
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
                  imgSrc="/icons/folder-open.png"
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

        {/* Tags */}
        {tagDefinitions.length > 0 && (
          <>
            <div className="h-px bg-border mx-4 my-2" />
            <SidebarSection
              title="Tags"
              action={
                <button
                  onClick={() => setTagManagerOpen(true)}
                  title="Gérer les tags"
                  className="w-5 h-5 flex items-center justify-center rounded hover:bg-secondary text-muted-foreground hover:text-primary transition-colors"
                >
                  <Palette size={11} />
                </button>
              }
            >
              {/* "Tous" button to clear filter */}
              {activeTagFilter && (
                <SidebarItem
                  icon={Tags}
                  label="Tous les fichiers"
                  active={false}
                  onClick={() => setActiveTagFilter(null)}
                />
              )}
              {tagDefinitions.map(tag => (
                <div key={tag.id} className="group relative flex items-center">
                  <button
                    onClick={() => setActiveTagFilter(activeTagFilter === tag.id ? null : tag.id)}
                    className={cn(
                      'sidebar-item flex-1 min-w-0',
                      activeTagFilter === tag.id && 'sidebar-item-active'
                    )}
                  >
                    <span className="w-3 h-3 rounded-full flex-shrink-0" style={{ background: tag.color }} />
                    <span className="flex-1 truncate">{tag.label}</span>
                    {activeTagFilter === tag.id && (
                      <X size={10} className="text-muted-foreground" />
                    )}
                  </button>
                </div>
              ))}
              <button
                onClick={() => setTagManagerOpen(true)}
                className="sidebar-item text-muted-foreground/60 hover:text-muted-foreground w-full"
              >
                <Plus size={13} />
                <span className="text-[11px]">Gérer les tags</span>
              </button>
            </SidebarSection>
          </>
        )}

        {tagDefinitions.length === 0 && (
          <>
            <div className="h-px bg-border mx-4 my-2" />
            <SidebarSection title="Tags">
              <button
                onClick={() => setTagManagerOpen(true)}
                className="sidebar-item text-muted-foreground/60 hover:text-muted-foreground w-full"
              >
                <Plus size={13} />
                <span className="text-[11px]">Créer un tag</span>
              </button>
            </SidebarSection>
          </>
        )}
      </div>

      {/* Corbeille */}
      <div className="border-t border-border p-2">
        <SidebarItem icon={Trash2} label="Corbeille" onClick={() => {}} />
      </div>

      {/* Tag Manager Modal */}
      {tagManagerOpen && <TagManagerModal onClose={() => setTagManagerOpen(false)} />}
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
  const { setSettingsOpen, setAiPanelOpen, setDiskAnalysisOpen, splitMode, setSplitMode, setSyncPanelOpen, toolbarConfig } = useTheme();
  const isPinned = currentPath && pinnedFolders.some(f => f.path === currentPath);

  const handleSearchChange = (e) => {
    const value = e.target.value;
    setSearchQuery(value);
    search(value);
  };

  const show = (id) => toolbarConfig[id] !== false;

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
      <div className="flex items-center gap-1.5">
        {/* Search */}
        <div className="relative">
          <img src="/icons/search.svg" style={{ width: 14, height: 14, objectFit: 'contain', position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', opacity: 0.6 }} className="liquid-icon" alt="" />
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

        {/* ── Configurable buttons ── */}

        {show('star') && currentPath && (
          <button
            onClick={() => isPinned ? unpinFolder(currentPath) : pinFolder(currentPath)}
            title={isPinned ? 'Retirer des favoris' : 'Ajouter aux favoris'}
            className="h-7 w-7 flex items-center justify-center rounded-md hover:bg-secondary transition-colors"
          >
            <Star size={14} strokeWidth={1.5} className={isPinned ? 'fill-yellow-400 text-yellow-400' : 'text-muted-foreground'} />
          </button>
        )}

        {show('theme') && <ThemeToggle />}

        {show('refresh') && (
          <button
            className="h-7 w-7 flex items-center justify-center rounded-md hover:bg-secondary transition-colors disabled:opacity-50"
            onClick={refresh}
            disabled={loading}
            title="Actualiser (F5)"
          >
            <RefreshCw size={14} strokeWidth={1.5} className={loading ? 'animate-spin text-primary' : 'text-muted-foreground'} />
          </button>
        )}

        {show('disk') && currentPath && (
          <button
            className="h-7 w-7 flex items-center justify-center rounded-md hover:bg-secondary transition-colors"
            title="Analyse d'espace"
            onClick={() => setDiskAnalysisOpen(true)}
          >
            <BarChart2 size={14} strokeWidth={1.5} className="text-muted-foreground" />
          </button>
        )}

        {show('sync') && (
          <button
            className="h-7 w-7 flex items-center justify-center rounded-md hover:bg-secondary transition-colors"
            title="Synchronisation de dossiers"
            onClick={() => setSyncPanelOpen(true)}
          >
            <ArrowLeftRight size={14} strokeWidth={1.5} className="text-muted-foreground" />
          </button>
        )}

        {show('split') && (
          <button
            onClick={() => setSplitMode(v => !v)}
            title={splitMode ? 'Vue simple' : 'Vue double panneau'}
            className={cn('h-7 w-7 flex items-center justify-center rounded-md hover:bg-secondary transition-colors',
              splitMode && 'bg-primary/10')}
          >
            <Columns size={14} strokeWidth={1.5} className={splitMode ? 'text-primary' : 'text-muted-foreground'} />
          </button>
        )}

        {show('ai') && (
          <button
            className="h-7 px-2 flex items-center gap-1.5 rounded-md hover:bg-secondary transition-colors text-primary"
            title="Assistant IA"
            onClick={() => setAiPanelOpen(true)}
          >
            <Sparkles size={14} strokeWidth={1.5} />
            <span className="text-[12px] font-medium hidden sm:inline">IA</span>
          </button>
        )}

        {show('settings') && (
          <button
            className="h-7 w-7 flex items-center justify-center rounded-md hover:bg-secondary transition-colors"
            title="Préférences"
            onClick={() => setSettingsOpen(true)}
          >
            <img src="/icons/settings.png" style={{ width: 16, height: 16, objectFit: 'contain' }} className="liquid-icon" alt="" />
          </button>
        )}

      </div>
    </header>
  );
};

// ============ TAG COLORS ============

const TAG_COLORS = [
  '#FF3B30', '#FF9500', '#FFCC00', '#34C759', '#00C7BE',
  '#007AFF', '#5856D6', '#AF52DE', '#FF2D55', '#A2845E',
];

// ============ TAG PICKER POPOVER ============

const TagPickerPopover = ({ filePath, pos, onClose }) => {
  const { tagData, getFileTags, toggleFileTag, createTag } = useTheme();
  const [newLabel, setNewLabel] = useState('');
  const [newColor, setNewColor] = useState(TAG_COLORS[5]);
  const popRef = useRef(null);

  const fileTags = getFileTags(filePath);
  const fileTagIds = (tagData.files[filePath] || []);
  const definitions = Object.values(tagData.definitions);

  // Close on outside click
  useEffect(() => {
    const handler = (e) => {
      if (popRef.current && !popRef.current.contains(e.target)) onClose();
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [onClose]);

  // Smart position: don't overflow viewport
  const style = {
    position: 'fixed',
    left: Math.min(pos.x, window.innerWidth - 240),
    top: Math.min(pos.y, window.innerHeight - 360),
    zIndex: 60,
  };

  const handleCreate = () => {
    const label = newLabel.trim();
    if (!label) return;
    const id = createTag(label, newColor);
    toggleFileTag(filePath, id);
    setNewLabel('');
  };

  return (
    <div ref={popRef} style={style}
      className="bg-background border border-border rounded-xl shadow-2xl w-56 p-3 animate-fade-in"
    >
      <div className="flex items-center justify-between mb-2">
        <span className="text-[13px] font-semibold flex items-center gap-1.5">
          <Tag size={13} className="text-primary" /> Tags
        </span>
        <button onClick={onClose} className="w-5 h-5 rounded flex items-center justify-center hover:bg-secondary text-muted-foreground">
          <X size={12} />
        </button>
      </div>

      {/* Existing tags */}
      {definitions.length > 0 ? (
        <div className="space-y-0.5 mb-3 max-h-40 overflow-y-auto scrollbar-thin">
          {definitions.map(tag => {
            const active = fileTagIds.includes(tag.id);
            return (
              <button key={tag.id}
                onClick={() => toggleFileTag(filePath, tag.id)}
                className={cn(
                  'w-full flex items-center gap-2 px-2 py-1.5 rounded-lg text-[12px] transition-colors',
                  active ? 'bg-primary/10' : 'hover:bg-secondary/50'
                )}
              >
                <span className="w-3 h-3 rounded-full flex-shrink-0" style={{ background: tag.color }} />
                <span className="flex-1 truncate text-left">{tag.label}</span>
                {active && <Check size={12} className="text-primary flex-shrink-0" />}
              </button>
            );
          })}
        </div>
      ) : (
        <p className="text-[11px] text-muted-foreground/60 italic mb-3 px-1">Aucun tag — crée-en un ci-dessous</p>
      )}

      {/* Create new tag */}
      <div className="border-t border-border pt-2">
        <p className="text-[11px] text-muted-foreground font-medium mb-1.5 px-0.5">Nouveau tag</p>
        <input
          value={newLabel}
          onChange={e => setNewLabel(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && handleCreate()}
          placeholder="Nom du tag…"
          className="w-full h-7 px-2 text-[12px] bg-secondary border border-border rounded-md mb-2 focus:outline-none focus:ring-1 focus:ring-primary"
        />
        {/* Color swatches */}
        <div className="flex flex-wrap gap-1 mb-2">
          {TAG_COLORS.map(c => (
            <button key={c} onClick={() => setNewColor(c)}
              style={{ background: c }}
              className={cn('w-5 h-5 rounded-full transition-transform hover:scale-110',
                newColor === c && 'ring-2 ring-offset-1 ring-primary scale-110'
              )}
            />
          ))}
        </div>
        <button
          onClick={handleCreate}
          disabled={!newLabel.trim()}
          className="w-full h-7 bg-primary text-primary-foreground rounded-md text-[12px] font-medium disabled:opacity-40 hover:opacity-90 transition-opacity"
        >
          Créer & appliquer
        </button>
      </div>
    </div>
  );
};

// ============ TAG MANAGER MODAL ============

const TagManagerModal = ({ onClose }) => {
  const { tagData, createTag, deleteTag } = useTheme();
  const [newLabel, setNewLabel] = useState('');
  const [newColor, setNewColor] = useState(TAG_COLORS[5]);

  const definitions = Object.values(tagData.definitions);

  const handleCreate = () => {
    const label = newLabel.trim();
    if (!label) return;
    createTag(label, newColor);
    setNewLabel('');
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-background border border-border rounded-2xl shadow-2xl w-full max-w-[400px]" onClick={e => e.stopPropagation()}>

        {/* Header */}
        <div className="flex items-center justify-between px-5 pt-5 pb-4 border-b border-border">
          <div className="flex items-center gap-2">
            <Tags size={18} className="text-primary" />
            <p className="text-[15px] font-semibold">Gestion des tags</p>
          </div>
          <button onClick={onClose} className="w-7 h-7 flex items-center justify-center rounded-full hover:bg-secondary transition-colors">
            <X size={14} />
          </button>
        </div>

        <div className="p-5 space-y-5">

          {/* Existing tags list */}
          <div>
            <p className="text-[12px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">
              Tags existants ({definitions.length})
            </p>
            {definitions.length === 0 ? (
              <p className="text-[13px] text-muted-foreground/60 italic">Aucun tag créé</p>
            ) : (
              <div className="space-y-1 max-h-48 overflow-y-auto scrollbar-thin">
                {definitions.map(tag => (
                  <div key={tag.id} className="flex items-center gap-2 px-3 py-2 rounded-lg bg-secondary/40">
                    <span className="w-4 h-4 rounded-full flex-shrink-0" style={{ background: tag.color }} />
                    <span className="flex-1 text-[13px]">{tag.label}</span>
                    <button
                      onClick={() => deleteTag(tag.id)}
                      className="w-6 h-6 flex items-center justify-center rounded hover:bg-destructive/10 hover:text-destructive transition-colors text-muted-foreground"
                    >
                      <Trash size={12} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Create new */}
          <div className="border-t border-border pt-4">
            <p className="text-[12px] font-semibold text-muted-foreground uppercase tracking-wider mb-3">
              Créer un tag
            </p>
            <div className="space-y-3">
              <input
                value={newLabel}
                onChange={e => setNewLabel(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleCreate()}
                placeholder="Nom du tag…"
                className="w-full h-9 px-3 text-[13px] bg-secondary border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
              />
              <div>
                <p className="text-[11px] text-muted-foreground mb-1.5">Couleur</p>
                <div className="flex flex-wrap gap-2">
                  {TAG_COLORS.map(c => (
                    <button key={c} onClick={() => setNewColor(c)}
                      style={{ background: c }}
                      className={cn('w-6 h-6 rounded-full transition-transform hover:scale-110',
                        newColor === c && 'ring-2 ring-offset-2 ring-primary scale-110'
                      )}
                    />
                  ))}
                </div>
              </div>
              <button
                onClick={handleCreate}
                disabled={!newLabel.trim()}
                className="w-full h-9 bg-primary text-primary-foreground rounded-lg text-[13px] font-medium disabled:opacity-40 hover:opacity-90 transition-opacity flex items-center justify-center gap-2"
              >
                <Plus size={14} /> Créer le tag
              </button>
            </div>
          </div>
        </div>

        <div className="px-5 pb-5">
          <button onClick={onClose} className="w-full h-9 border border-border rounded-lg text-[13px] hover:bg-secondary transition-colors">
            Fermer
          </button>
        </div>
      </div>
    </div>
  );
};

// ============ FILE ITEM (ICON VIEW) ============

const FileItemIcon = ({ file }) => {
  const { selectedFiles, setSelectedFiles, openItem, copyFiles, cutFiles, deleteFile, renameFile, iconSize, currentPath, refresh } = useFileManager();
  const { showFileSizes, setTreeViewOpen, setTreeViewPath, tagData, getFileTags, toggleFileTag, createTag } = useTheme();
  const [showTagPicker, setShowTagPicker] = useState(false);
  const [tagPickerPos, setTagPickerPos] = useState({ x: 0, y: 0 });

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
        {/* Tag dots */}
        {(() => {
          const tags = getFileTags(file.path);
          if (!tags.length) return null;
          return (
            <span className="flex items-center justify-center gap-0.5 mt-1">
              {tags.map(t => (
                <span key={t.id} title={t.label}
                  style={{ background: t.color }}
                  className="inline-block w-2 h-2 rounded-full opacity-90"
                />
              ))}
            </span>
          );
        })()}
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
            {file.file_type === 'folder' && (
              <button
                className="w-full px-3 py-1.5 text-left text-[13px] hover:bg-secondary/50 rounded flex items-center gap-2"
                onClick={() => { setTreeViewPath(file.path); setTreeViewOpen(true); setShowContextMenu(false); }}
              >
                <GitBranch size={14} /> Vue arbre
              </button>
            )}
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
              className="w-full px-3 py-1.5 text-left text-[13px] hover:bg-secondary/50 rounded flex items-center gap-2"
              onClick={(e) => {
                setTagPickerPos({ x: contextMenuPos.x, y: contextMenuPos.y });
                setShowContextMenu(false);
                setShowTagPicker(true);
              }}
            >
              <Tag size={14} /> Tags…
            </button>
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

      {/* Tag Picker Popover */}
      {showTagPicker && (
        <TagPickerPopover
          filePath={file.path}
          pos={tagPickerPos}
          onClose={() => setShowTagPicker(false)}
        />
      )}
    </>
  );
};

// ============ ICONS VIEW ============

const IconsView = ({ files: propFiles }) => {
  const { files: ctxFiles, setSelectedFiles, iconSize } = useFileManager();
  const files = propFiles ?? ctxFiles;

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

const ListView = ({ files: propFiles }) => {
  const { files: ctxFiles, selectedFiles, setSelectedFiles, openItem } = useFileManager();
  const { getFileTags } = useTheme();
  const files = propFiles ?? ctxFiles;
  
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
                {/* Tag badges */}
                {(() => {
                  const tags = getFileTags(file.path);
                  if (!tags.length) return null;
                  return (
                    <span className="flex items-center gap-0.5 flex-shrink-0">
                      {tags.map(t => (
                        <span key={t.id} title={t.label}
                          style={{ background: t.color }}
                          className="inline-block w-2 h-2 rounded-full opacity-90"
                        />
                      ))}
                    </span>
                  );
                })()}
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

// ============ SECOND PANE (split view) ============

const SecondPane = () => {
  const { selectedFiles: mainSelected, files: mainFiles, copyFiles, pasteFiles, currentPath: mainPath, refresh: mainRefresh } = useFileManager();
  const [path,     setPath]     = useState('');
  const [files,    setFiles]    = useState([]);
  const [loading,  setLoading]  = useState(false);
  const [breadcrumbs, setBreadcrumbs] = useState([]);

  const navigate = useCallback(async (newPath) => {
    setLoading(true);
    try {
      const [result, bc] = await Promise.all([
        invoke('list_files', { path: newPath, showHidden: false }),
        invoke('get_breadcrumbs', { path: newPath }),
      ]);
      setFiles(result);
      setBreadcrumbs(bc);
      setPath(newPath);
    } catch (e) { toast.error(String(e)); }
    finally { setLoading(false); }
  }, []);

  const copyToHere = async () => {
    if (!path || mainSelected.length === 0) return;
    for (const src of mainSelected) {
      const name = src.split(/[/\\]/).pop();
      try {
        await invoke('copy_file', { src, dest: `${path}\\${name}` });
      } catch (e) { toast.error(String(e)); }
    }
    toast.success(`${mainSelected.length} fichier(s) copié(s)`);
    navigate(path);
  };

  const moveToHere = async () => {
    if (!path || mainSelected.length === 0) return;
    for (const src of mainSelected) {
      const name = src.split(/[/\\]/).pop();
      try {
        await invoke('move_file', { src, dest: `${path}\\${name}` });
      } catch (e) { toast.error(String(e)); }
    }
    toast.success(`${mainSelected.length} fichier(s) déplacé(s)`);
    navigate(path);
    mainRefresh();
  };

  const getFileIcon = (file) => {
    if (file.file_type === 'Folder') return <Folder size={14} className="text-primary flex-shrink-0" />;
    const ext = file.extension?.toLowerCase() || '';
    if (['jpg','jpeg','png','gif','webp','svg','bmp'].includes(ext)) return <FileImage size={14} className="text-orange-400 flex-shrink-0" />;
    if (['mp4','mov','avi','mkv','webm'].includes(ext)) return <FileVideo size={14} className="text-purple-400 flex-shrink-0" />;
    if (['mp3','wav','flac','aac'].includes(ext)) return <FileAudio size={14} className="text-pink-400 flex-shrink-0" />;
    if (['pdf','doc','docx','xls','xlsx','ppt','pptx','txt'].includes(ext)) return <FileText size={14} className="text-blue-400 flex-shrink-0" />;
    if (['zip','rar','7z','tar','gz'].includes(ext)) return <FileArchive size={14} className="text-yellow-500 flex-shrink-0" />;
    return <File size={14} className="text-muted-foreground flex-shrink-0" />;
  };

  const fmt = (bytes) => {
    if (!bytes) return '';
    if (bytes >= 1073741824) return (bytes / 1073741824).toFixed(1) + ' Go';
    if (bytes >= 1048576)    return (bytes / 1048576).toFixed(1)    + ' Mo';
    if (bytes >= 1024)       return (bytes / 1024).toFixed(0)       + ' Ko';
    return bytes + ' o';
  };

  return (
    <div className="flex-1 flex flex-col min-w-0 border-l border-border bg-background/50">
      {/* Pane header */}
      <div className="h-[36px] flex-shrink-0 flex items-center gap-1 px-2 border-b border-border bg-secondary/20">
        <button onClick={() => navigate('')} title="Ce PC"
          className="h-6 w-6 flex items-center justify-center rounded hover:bg-secondary transition-colors">
          <Monitor size={13} className="text-muted-foreground" />
        </button>
        {breadcrumbs.length > 0 ? (
          <div className="flex items-center gap-0.5 overflow-hidden">
            {breadcrumbs.map((bc, i) => (
              <React.Fragment key={bc.path}>
                {i > 0 && <ChevronRight size={10} className="text-muted-foreground/40 flex-shrink-0" />}
                <button onClick={() => navigate(bc.path)}
                  className="text-[11px] px-1 py-0.5 rounded hover:bg-secondary transition-colors truncate max-w-[100px]">
                  {bc.name}
                </button>
              </React.Fragment>
            ))}
          </div>
        ) : (
          <span className="text-[11px] text-muted-foreground px-1">Ce PC</span>
        )}
        <button onClick={() => navigate(path)} className="ml-auto h-6 w-6 flex items-center justify-center rounded hover:bg-secondary transition-colors">
          <RefreshCw size={11} className="text-muted-foreground" />
        </button>
      </div>

      {/* Cross-pane actions (shown when main pane has selections) */}
      {mainSelected.length > 0 && path && (
        <div className="flex-shrink-0 flex items-center gap-1.5 px-3 py-1.5 bg-primary/5 border-b border-primary/15">
          <span className="text-[11px] text-muted-foreground flex-1">{mainSelected.length} sélectionné(s) dans le panneau gauche</span>
          <button onClick={copyToHere}
            className="text-[11px] px-2 py-0.5 rounded bg-primary/10 text-primary hover:bg-primary/20 transition-colors flex items-center gap-1">
            <Copy size={10} /> Copier ici
          </button>
          <button onClick={moveToHere}
            className="text-[11px] px-2 py-0.5 rounded bg-primary/10 text-primary hover:bg-primary/20 transition-colors flex items-center gap-1">
            <Scissors size={10} /> Déplacer ici
          </button>
        </div>
      )}

      {/* File list */}
      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <div className="flex items-center justify-center h-20">
            <RefreshCw size={18} className="animate-spin text-muted-foreground" />
          </div>
        ) : files.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-32 text-muted-foreground gap-2">
            {path ? <><Folder size={28} strokeWidth={1} className="opacity-40" /><p className="text-[11px]">Dossier vide</p></>
                  : <><Monitor size={28} strokeWidth={1} className="opacity-40" /><p className="text-[11px]">Double-cliquez un dossier pour naviguer</p></>}
          </div>
        ) : (
          <div className="py-1">
            {files.map(file => (
              <button key={file.path}
                onDoubleClick={() => { if (file.file_type === 'Folder') navigate(file.path); }}
                className="w-full flex items-center gap-2 px-3 py-1.5 hover:bg-secondary/50 transition-colors text-left group">
                {getFileIcon(file)}
                <span className="flex-1 text-[12px] truncate">{file.name}</span>
                {file.file_type !== 'Folder' && (
                  <span className="text-[10px] text-muted-foreground/50 flex-shrink-0 group-hover:opacity-100">
                    {fmt(file.size)}
                  </span>
                )}
                {file.file_type === 'Folder' && (
                  <ChevronRight size={10} className="text-muted-foreground/30 flex-shrink-0" />
                )}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="h-[24px] flex-shrink-0 border-t border-border flex items-center px-3 text-[10px] text-muted-foreground">
        {files.length} élément{files.length !== 1 ? 's' : ''}
        {path && <span className="ml-auto truncate max-w-[60%]">{path.split(/[/\\]/).pop()}</span>}
      </div>
    </div>
  );
};

// ============ CONTENT AREA ============

const ContentArea = () => {
  const { view, files, loading, searchResults, searchQuery } = useFileManager();
  const { activeTagFilter, getFileTags } = useTheme();

  const displayFiles = useMemo(() => {
    if (!activeTagFilter) return files;
    return files.filter(f => {
      const tags = getFileTags(f.path);
      return tags.some(t => t.id === activeTagFilter);
    });
  }, [files, activeTagFilter, getFileTags]);

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
  
  if (displayFiles.length === 0) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center text-muted-foreground">
        {activeTagFilter ? (
          <>
            <Tag size={48} strokeWidth={1} className="mb-4 opacity-50" />
            <p>Aucun fichier avec ce tag dans ce dossier</p>
          </>
        ) : searchResults !== null ? (
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
      <ViewComponent files={displayFiles} />
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

const CODE_EXTENSIONS = ['js','jsx','ts','tsx','py','rs','java','cpp','c','h','cs','go','rb',
  'php','swift','kt','vue','html','css','scss','json','xml','yaml','yml','toml','sh','bat',
  'ps1','sql','md','markdown','txt','log','ini','env','gitignore'];

const VIDEO_EXTENSIONS = ['mp4','webm','mov','avi','mkv','m4v'];
const AUDIO_EXTENSIONS = ['mp3','wav','flac','aac','ogg','m4a','wma'];

function useTextContent(file) {
  const [content, setContent] = useState(null);
  const [loading, setLoading] = useState(false);
  useEffect(() => {
    if (!file) return;
    const ext = (file.extension || '').toLowerCase();
    if ([...CODE_EXTENSIONS, 'txt', 'log', 'md', 'markdown'].includes(ext) && file.size < 1024 * 512) {
      setLoading(true);
      invoke('get_file_content', { path: file.path })
        .then(setContent)
        .catch(() => setContent(null))
        .finally(() => setLoading(false));
    } else {
      setContent(null);
    }
  }, [file?.path]);
  return { content, loading };
}

const QuickLook = () => {
  const { quickLookFile, setQuickLookFile } = useFileManager();
  const { content, loading } = useTextContent(quickLookFile);
  const [zoom, setZoom] = useState(1);

  useEffect(() => { setZoom(1); }, [quickLookFile?.path]);

  if (!quickLookFile) return null;

  const ext = (quickLookFile.extension || '').toLowerCase();
  const isImage   = quickLookFile.file_type === 'image';
  const isVideo   = VIDEO_EXTENSIONS.includes(ext);
  const isAudio   = AUDIO_EXTENSIONS.includes(ext);
  const isPdf     = ext === 'pdf';
  const isMarkdown = ['md', 'markdown'].includes(ext);
  const isCode    = CODE_EXTENSIONS.includes(ext) && !isMarkdown;
  const isText    = ext === 'txt' || ext === 'log';

  const highlighted = useMemo(() => {
    if (!isCode || !content) return null;
    try {
      const lang = hljs.getLanguage(ext) ? ext : 'plaintext';
      return hljs.highlight(content, { language: lang }).value;
    } catch { return null; }
  }, [content, ext, isCode]);

  const src = convertFileSrc(quickLookFile.path);

  return (
    <div
      className="fixed inset-0 z-50 bg-black/70 backdrop-blur-md flex items-center justify-center p-6"
      onClick={() => setQuickLookFile(null)}
    >
      <div
        className="bg-background/95 backdrop-blur-xl rounded-2xl shadow-2xl overflow-hidden flex flex-col animate-scale-in"
        style={{ width: isPdf || isCode || isMarkdown ? 860 : 720, maxHeight: '92vh' }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex-shrink-0 px-4 py-3 border-b border-border flex items-center gap-2.5">
          {getFileIcon(quickLookFile.file_type, quickLookFile.extension, 18)}
          <span className="text-[13px] font-semibold flex-1 truncate">{quickLookFile.name}</span>
          <span className="text-[11px] text-muted-foreground">{formatFileSize(quickLookFile.size)}</span>
          {isImage && (
            <div className="flex items-center gap-1 ml-2">
              <button onClick={() => setZoom(z => Math.max(0.25, z - 0.25))} className="px-2 py-0.5 rounded text-[12px] hover:bg-secondary">−</button>
              <span className="text-[11px] text-muted-foreground w-10 text-center">{Math.round(zoom * 100)}%</span>
              <button onClick={() => setZoom(z => Math.min(4, z + 0.25))} className="px-2 py-0.5 rounded text-[12px] hover:bg-secondary">+</button>
            </div>
          )}
          <button className="w-6 h-6 flex items-center justify-center rounded-full hover:bg-secondary transition-colors ml-1"
            onClick={() => setQuickLookFile(null)}>
            <X size={14} />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-auto min-h-0">

          {/* Image */}
          {isImage && (
            <div className="flex items-center justify-center p-4 min-h-[300px] overflow-auto">
              <img
                src={src}
                alt={quickLookFile.name}
                style={{ transform: `scale(${zoom})`, transformOrigin: 'center', transition: 'transform 0.15s' }}
                className="max-w-full rounded-lg shadow-md"
              />
            </div>
          )}

          {/* Video */}
          {isVideo && (
            <div className="flex items-center justify-center p-4 bg-black">
              <video controls autoPlay className="max-w-full max-h-[70vh] rounded-lg" src={src} />
            </div>
          )}

          {/* Audio */}
          {isAudio && (
            <div className="flex flex-col items-center justify-center gap-6 p-12">
              <img src="/icons/file.svg" className="liquid-icon" style={{ width: 72, height: 72 }} alt="" />
              <p className="text-[15px] font-semibold">{quickLookFile.name}</p>
              <audio controls className="w-full max-w-md" src={src} />
            </div>
          )}

          {/* PDF */}
          {isPdf && (
            <iframe src={src} className="w-full border-0" style={{ height: '75vh' }} title={quickLookFile.name} />
          )}

          {/* Markdown */}
          {isMarkdown && (
            <div className="p-6 overflow-auto prose prose-sm dark:prose-invert max-w-none prose-pre:bg-secondary prose-code:text-primary">
              {loading
                ? <div className="flex items-center justify-center h-40"><Loader2 size={20} className="animate-spin text-primary" /></div>
                : <ReactMarkdown remarkPlugins={[remarkGfm]}>{content || ''}</ReactMarkdown>
              }
            </div>
          )}

          {/* Code */}
          {isCode && (
            <div className="overflow-auto" style={{ maxHeight: '75vh' }}>
              {loading
                ? <div className="flex items-center justify-center h-40"><Loader2 size={20} className="animate-spin text-primary" /></div>
                : (
                  <pre className="p-5 text-[12px] leading-relaxed font-mono m-0 bg-[#1e1e2e]">
                    {highlighted
                      ? <code dangerouslySetInnerHTML={{ __html: highlighted }} />
                      : <code className="text-foreground">{content}</code>
                    }
                  </pre>
                )
              }
            </div>
          )}

          {/* Plain text / log */}
          {isText && (
            <div className="overflow-auto" style={{ maxHeight: '75vh' }}>
              {loading
                ? <div className="flex items-center justify-center h-40"><Loader2 size={20} className="animate-spin text-primary" /></div>
                : <pre className="p-5 text-[12px] leading-relaxed font-mono whitespace-pre-wrap text-foreground">{content}</pre>
              }
            </div>
          )}

          {/* Fallback */}
          {!isImage && !isVideo && !isAudio && !isPdf && !isMarkdown && !isCode && !isText && (
            <div className="flex flex-col items-center justify-center gap-4 p-12">
              {getFileIcon(quickLookFile.file_type, quickLookFile.extension, 80)}
              <p className="text-[16px] font-semibold mt-2">{quickLookFile.name}</p>
              <p className="text-muted-foreground text-[13px]">{getFileKind(quickLookFile.file_type, quickLookFile.extension)}</p>
              <p className="text-muted-foreground text-[13px]">{formatFileSize(quickLookFile.size)}</p>
              <p className="text-[12px] text-muted-foreground">Modifié le {formatDate(quickLookFile.modified_at)}</p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex-shrink-0 px-4 py-2 border-t border-border flex items-center justify-between">
          <span className="text-[11px] text-muted-foreground truncate max-w-[80%]">{quickLookFile.path}</span>
          <span className="text-[11px] text-muted-foreground">{formatDate(quickLookFile.modified_at)}</span>
        </div>
      </div>
    </div>
  );
};

// ============ SETTINGS TAG MANAGER ============

const SettingsTagManager = () => {
  const { tagData, createTag, deleteTag } = useTheme();
  const [newLabel, setNewLabel] = useState('');
  const [newColor, setNewColor] = useState(TAG_COLORS[5]);
  const definitions = Object.values(tagData.definitions);

  const handleCreate = () => {
    const label = newLabel.trim();
    if (!label) return;
    createTag(label, newColor);
    setNewLabel('');
  };

  return (
    <div className="space-y-3">
      {/* Existing tags */}
      {definitions.length > 0 ? (
        <div className="space-y-1 max-h-36 overflow-y-auto scrollbar-thin">
          {definitions.map(tag => (
            <div key={tag.id} className="flex items-center gap-2 px-3 py-2 rounded-lg bg-secondary/40">
              <span className="w-3.5 h-3.5 rounded-full flex-shrink-0" style={{ background: tag.color }} />
              <span className="flex-1 text-[12px]">{tag.label}</span>
              <button
                onClick={() => deleteTag(tag.id)}
                className="w-5 h-5 flex items-center justify-center rounded hover:bg-destructive/10 hover:text-destructive transition-colors text-muted-foreground"
              >
                <Trash size={11} />
              </button>
            </div>
          ))}
        </div>
      ) : (
        <p className="text-[11px] text-muted-foreground/60 italic px-1">Aucun tag créé</p>
      )}

      {/* New tag form */}
      <div className="space-y-2">
        <input
          value={newLabel}
          onChange={e => setNewLabel(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && handleCreate()}
          placeholder="Nouveau tag…"
          className="w-full h-8 px-3 text-[12px] bg-secondary/50 border border-input rounded-lg focus:outline-none focus:border-primary"
        />
        <div className="flex items-center gap-2">
          <div className="flex flex-wrap gap-1.5 flex-1">
            {TAG_COLORS.map(c => (
              <button key={c} onClick={() => setNewColor(c)}
                style={{ background: c }}
                className={cn('w-5 h-5 rounded-full hover:scale-110 transition-transform',
                  newColor === c && 'ring-2 ring-offset-1 ring-primary scale-110'
                )}
              />
            ))}
          </div>
          <button
            onClick={handleCreate}
            disabled={!newLabel.trim()}
            className="h-8 px-3 bg-primary text-primary-foreground rounded-lg text-[12px] font-medium disabled:opacity-40 hover:opacity-90 transition-opacity flex items-center gap-1.5 flex-shrink-0"
          >
            <Plus size={12} /> Créer
          </button>
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
    iconTint, setIconTint, ICON_TINTS,
    toolbarConfig, toggleToolbarButton, TOOLBAR_BUTTONS,
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

          {/* Barre d'outils */}
          <section>
            <h3 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-3 flex items-center gap-1.5">
              <SlidersHorizontal size={11} /> Barre d'outils
            </h3>
            <div className="space-y-1">
              {TOOLBAR_BUTTONS.map(btn => {
                const Icon = btn.icon;
                const isOn = toolbarConfig[btn.id] !== false;
                return (
                  <label key={btn.id}
                    className={cn(
                      'flex items-center gap-3 px-3 py-2.5 rounded-xl border cursor-pointer transition-all select-none',
                      isOn ? 'border-border hover:border-primary/40 bg-secondary/20' : 'border-border/50 opacity-50 hover:opacity-70'
                    )}
                  >
                    <div className={cn(
                      'w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 transition-colors',
                      isOn ? 'bg-primary/15 text-primary' : 'bg-secondary text-muted-foreground'
                    )}>
                      <Icon size={14} strokeWidth={1.5} />
                    </div>
                    <span className="flex-1 text-[13px]">{btn.label}</span>
                    <div
                      onClick={() => toggleToolbarButton(btn.id)}
                      className={cn(
                        'relative w-10 h-6 rounded-full transition-colors cursor-pointer flex-shrink-0',
                        isOn ? 'bg-primary' : 'bg-border'
                      )}
                    >
                      <div className={cn(
                        'absolute top-1 w-4 h-4 rounded-full bg-white shadow transition-transform',
                        isOn ? 'translate-x-5' : 'translate-x-1'
                      )} />
                    </div>
                  </label>
                );
              })}
            </div>
          </section>

          {/* Couleur des icônes */}
          <section>
            <h3 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-3">Couleur des icônes</h3>
            <div className="flex flex-wrap gap-2.5">
              {ICON_TINTS.map(t => (
                <button
                  key={t.value}
                  onClick={() => setIconTint(t.value)}
                  title={t.label}
                  className={cn(
                    'w-8 h-8 rounded-full transition-all hover:scale-110 border-2 flex items-center justify-center',
                    iconTint === t.value
                      ? 'border-primary scale-110 shadow-lg'
                      : 'border-border'
                  )}
                  style={{ backgroundColor: t.value === 'default' ? '#444' : t.hex }}
                >
                  <img
                    src="/icons/folder.png"
                    style={{
                      width: 18, height: 18, objectFit: 'contain',
                      filter: t.filter ? t.filter + ' drop-shadow(0 1px 2px rgba(0,0,0,0.3))' : 'drop-shadow(0 1px 2px rgba(0,0,0,0.3))'
                    }}
                    alt=""
                  />
                </button>
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

          {/* Tags */}
          <section>
            <h3 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-3 flex items-center gap-1.5">
              <Tags size={11} /> Tags & étiquettes
            </h3>
            <SettingsTagManager />
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

          {/* Analyse intelligente */}
          {!loading && analyzed && (
            <div className="pt-2 border-t border-border space-y-3">
              <div className="flex items-center gap-2">
                <AlertTriangle size={13} className="text-[#FF9500]" />
                <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Nettoyage intelligent</p>
              </div>
              <SmartCleanupPanel />
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

// ============ SYNC PANEL ============

const SYNC_KIND_META = {
  add:         { label: 'À copier',        color: '#34C759', icon: '＋' },
  update:      { label: 'À mettre à jour', color: '#FF9500', icon: '↑' },
  delete:      { label: 'À supprimer',     color: '#FF3B30', icon: '✕' },
  add_reverse: { label: 'Copie inverse',   color: '#007AFF', icon: '←' },
  skip:        { label: 'À jour',          color: '#8E8E93', icon: '✓' },
};

const SyncPanel = () => {
  const { syncPanelOpen, setSyncPanelOpen } = useTheme();
  const { currentPath } = useFileManager();

  const saved = () => {
    try { return JSON.parse(localStorage.getItem('finedr_sync_config') || 'null'); } catch { return null; }
  };
  const [source, setSource] = useState(() => saved()?.source || '');
  const [dest,   setDest]   = useState(() => saved()?.dest   || '');
  const [mode,   setMode]   = useState(() => saved()?.mode   || 'one_way');
  const [preview, setPreview] = useState(null);   // SyncAction[] | null
  const [syncing,  setSyncing]  = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [result, setResult] = useState(null);     // completed SyncAction[] | null

  // Save config to localStorage
  useEffect(() => {
    if (source || dest) {
      localStorage.setItem('finedr_sync_config', JSON.stringify({ source, dest, mode }));
    }
  }, [source, dest, mode]);

  const useCurrentAsSource = () => setSource(currentPath);
  const useCurrentAsDest   = () => setDest(currentPath);

  const handlePreview = async () => {
    if (!source.trim() || !dest.trim()) { toast.error('Renseigne les deux dossiers'); return; }
    setAnalyzing(true);
    setResult(null);
    try {
      const actions = await invoke('preview_sync', { source: source.trim(), dest: dest.trim(), mode });
      setPreview(actions);
    } catch (e) { toast.error(String(e)); }
    finally { setAnalyzing(false); }
  };

  const handleSync = async () => {
    setSyncing(true);
    try {
      const done = await invoke('sync_folders', { source: source.trim(), dest: dest.trim(), mode });
      setResult(done);
      setPreview(null);
      const changed = done.filter(a => a.kind !== 'skip').length;
      toast.success(`Synchronisation terminée — ${changed} opération${changed > 1 ? 's' : ''}`);
    } catch (e) { toast.error(String(e)); }
    finally { setSyncing(false); }
  };

  const displayList = result || preview;
  const counts = displayList ? {
    add:    displayList.filter(a => a.kind === 'add').length,
    update: displayList.filter(a => a.kind === 'update').length,
    delete: displayList.filter(a => a.kind === 'delete').length,
    add_reverse: displayList.filter(a => a.kind === 'add_reverse').length,
    skip:   displayList.filter(a => a.kind === 'skip').length,
  } : null;
  const totalChanges = counts ? counts.add + counts.update + counts.delete + counts.add_reverse : 0;

  if (!syncPanelOpen) return null;

  return (
    <div className="fixed inset-0 z-40 flex">
      {/* Backdrop */}
      <div className="flex-1 bg-black/20 backdrop-blur-[2px]" onClick={() => setSyncPanelOpen(false)} />
      {/* Panel */}
      <div className="w-[420px] h-full bg-background/95 border-l border-border flex flex-col shadow-2xl animate-slide-in-right overflow-hidden">

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-border flex-shrink-0">
          <div className="flex items-center gap-2.5">
            <RefreshCw size={18} className="text-primary" />
            <div>
              <p className="text-[15px] font-semibold">Synchronisation</p>
              <p className="text-[11px] text-muted-foreground">Comparer et synchroniser deux dossiers</p>
            </div>
          </div>
          <button onClick={() => setSyncPanelOpen(false)} className="w-7 h-7 flex items-center justify-center rounded-full hover:bg-secondary transition-colors">
            <X size={14} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto scrollbar-thin p-5 space-y-5">

          {/* Folder paths */}
          <div className="space-y-3">
            <div>
              <label className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider block mb-1.5">
                Source
              </label>
              <div className="flex gap-2">
                <input
                  value={source}
                  onChange={e => setSource(e.target.value)}
                  placeholder="C:\Users\…\Dossier"
                  className="flex-1 h-9 px-3 text-[12px] bg-secondary border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary font-mono"
                />
                <button onClick={useCurrentAsSource} title="Utiliser le dossier actuel"
                  className="h-9 px-3 rounded-lg border border-border text-[11px] hover:bg-secondary transition-colors flex-shrink-0 text-muted-foreground hover:text-foreground">
                  Actuel
                </button>
              </div>
            </div>

            <div>
              <label className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider block mb-1.5">
                Destination
              </label>
              <div className="flex gap-2">
                <input
                  value={dest}
                  onChange={e => setDest(e.target.value)}
                  placeholder="C:\Users\…\Backup"
                  className="flex-1 h-9 px-3 text-[12px] bg-secondary border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary font-mono"
                />
                <button onClick={useCurrentAsDest} title="Utiliser le dossier actuel"
                  className="h-9 px-3 rounded-lg border border-border text-[11px] hover:bg-secondary transition-colors flex-shrink-0 text-muted-foreground hover:text-foreground">
                  Actuel
                </button>
              </div>
            </div>
          </div>

          {/* Mode */}
          <div>
            <label className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider block mb-2">
              Mode
            </label>
            <div className="grid grid-cols-2 gap-2">
              {[
                { id: 'one_way', label: 'Unidirectionnel', desc: 'Source → Dest, supprime les extras' },
                { id: 'two_way', label: 'Bidirectionnel',  desc: 'Fusionne les deux dossiers' },
              ].map(m => (
                <button key={m.id} onClick={() => { setMode(m.id); setPreview(null); setResult(null); }}
                  className={cn(
                    'p-3 rounded-xl border text-left transition-all',
                    mode === m.id ? 'border-primary bg-primary/8' : 'border-border hover:border-primary/40'
                  )}>
                  <div className={cn('text-[12px] font-semibold mb-0.5', mode === m.id && 'text-primary')}>{m.label}</div>
                  <div className="text-[10px] text-muted-foreground leading-tight">{m.desc}</div>
                </button>
              ))}
            </div>
          </div>

          {/* Analyse button */}
          <button
            onClick={handlePreview}
            disabled={analyzing || !source.trim() || !dest.trim()}
            className="w-full h-10 rounded-xl border border-primary text-primary font-semibold text-[13px] disabled:opacity-40 hover:bg-primary/8 transition-colors flex items-center justify-center gap-2"
          >
            {analyzing ? <><RefreshCw size={14} className="animate-spin" /> Analyse en cours…</> : <><Search size={14} /> Analyser les différences</>}
          </button>

          {/* Summary chips */}
          {counts && (
            <div className="flex flex-wrap gap-2">
              {Object.entries(counts).filter(([, n]) => n > 0).map(([kind, n]) => (
                <span key={kind} className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-medium border"
                  style={{ color: SYNC_KIND_META[kind]?.color, borderColor: SYNC_KIND_META[kind]?.color + '44', background: SYNC_KIND_META[kind]?.color + '15' }}>
                  <span>{SYNC_KIND_META[kind]?.icon}</span> {n} {SYNC_KIND_META[kind]?.label}
                </span>
              ))}
            </div>
          )}

          {/* File list preview */}
          {displayList && displayList.length > 0 && (
            <div className="space-y-1 max-h-64 overflow-y-auto scrollbar-thin">
              {displayList.filter(a => a.kind !== 'skip').map((action, i) => (
                <div key={i} className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-secondary/40 text-[12px]">
                  <span className="font-bold text-[13px] flex-shrink-0 w-4 text-center"
                    style={{ color: SYNC_KIND_META[action.kind]?.color }}>
                    {SYNC_KIND_META[action.kind]?.icon}
                  </span>
                  <span className="flex-1 truncate font-mono text-[11px]">{action.rel_path}</span>
                  <span className="text-muted-foreground flex-shrink-0">{formatFileSize(action.size)}</span>
                </div>
              ))}
              {displayList.filter(a => a.kind === 'skip').length > 0 && (
                <p className="text-[11px] text-muted-foreground/60 text-center py-1">
                  + {displayList.filter(a => a.kind === 'skip').length} fichier(s) déjà à jour
                </p>
              )}
            </div>
          )}

          {displayList && displayList.length === 0 && (
            <div className="flex flex-col items-center py-6 text-muted-foreground">
              <CheckCircle2 size={32} strokeWidth={1} className="mb-2 text-green-500" />
              <p className="text-[13px]">Les dossiers sont identiques</p>
            </div>
          )}
        </div>

        {/* Footer — Sync button */}
        <div className="flex-shrink-0 p-5 border-t border-border">
          {result ? (
            <button
              onClick={() => { setResult(null); setPreview(null); }}
              className="w-full h-10 rounded-xl border border-border text-[13px] hover:bg-secondary transition-colors"
            >
              Nouvelle synchronisation
            </button>
          ) : (
            <button
              onClick={handleSync}
              disabled={syncing || !preview || totalChanges === 0}
              className="w-full h-10 rounded-xl bg-primary text-primary-foreground font-semibold text-[13px] disabled:opacity-40 hover:opacity-90 transition-opacity flex items-center justify-center gap-2"
            >
              {syncing
                ? <><RefreshCw size={14} className="animate-spin" /> Synchronisation…</>
                : preview && totalChanges > 0
                  ? <><RefreshCw size={14} /> Synchroniser ({totalChanges} changement{totalChanges > 1 ? 's' : ''})</>
                  : <><RefreshCw size={14} /> Synchroniser</>
              }
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

// ============ TREE VIEW PANEL ============

const TreeViewPanel = () => {
  const { treeViewOpen, setTreeViewOpen, treeViewPath } = useTheme();
  const { navigateToFolder } = useFileManager();
  const [tree, setTree] = useState(null);
  const [loading, setLoading] = useState(false);
  const [expanded, setExpanded] = useState(new Set());
  const [search, setSearch] = useState('');

  useEffect(() => {
    if (!treeViewOpen || !treeViewPath) return;
    setLoading(true); setTree(null); setExpanded(new Set()); setSearch('');
    invoke('get_folder_tree', { path: treeViewPath, maxDepth: 4 })
      .then(t => { setTree(t); setExpanded(new Set([treeViewPath])); })
      .catch(e => toast.error(String(e)))
      .finally(() => setLoading(false));
  }, [treeViewOpen, treeViewPath]);

  if (!treeViewOpen) return null;

  const fmt = (b) => {
    if (b >= 1073741824) return (b / 1073741824).toFixed(1) + ' Go';
    if (b >= 1048576)    return (b / 1048576).toFixed(1)    + ' Mo';
    if (b >= 1024)       return (b / 1024).toFixed(0)       + ' Ko';
    return b + ' o';
  };

  const toggle = (p) => setExpanded(prev => {
    const n = new Set(prev);
    n.has(p) ? n.delete(p) : n.add(p);
    return n;
  });

  const matchesSearch = (node) => {
    if (!search) return true;
    const q = search.toLowerCase();
    if (node.name.toLowerCase().includes(q)) return true;
    if (node.children) return node.children.some(c => matchesSearch(c));
    return false;
  };

  const renderNode = (node, depth = 0) => {
    if (search && !matchesSearch(node)) return null;
    const isExpanded = expanded.has(node.path);
    const hasChildren = node.is_folder && node.children.length > 0;
    const highlight = search && node.name.toLowerCase().includes(search.toLowerCase());

    return (
      <div key={node.path}>
        <div
          className={cn(
            'group flex items-center gap-1.5 py-[3px] px-2 rounded-md cursor-pointer transition-colors',
            'hover:bg-white/8',
            highlight && 'bg-primary/10'
          )}
          style={{ paddingLeft: depth * 14 + 8 }}
          onClick={() => node.is_folder ? toggle(node.path) : null}
        >
          {node.is_folder ? (
            <ChevronRight
              size={11}
              className={cn('text-muted-foreground/60 transition-transform flex-shrink-0', isExpanded && 'rotate-90')}
            />
          ) : (
            <span className="w-[11px] flex-shrink-0" />
          )}
          <img
            src={node.is_folder ? (isExpanded ? '/icons/folder-open.png' : '/icons/folder.png') : '/icons/file.svg'}
            className="liquid-icon flex-shrink-0"
            style={{ width: 14, height: 14 }}
            alt=""
          />
          <span className={cn('flex-1 text-[12px] truncate', highlight && 'text-primary font-medium')}>
            {node.name}
          </span>
          {node.is_folder && node.file_count > 0 && (
            <span className="text-[10px] text-muted-foreground/40 flex-shrink-0 opacity-0 group-hover:opacity-100">
              {node.file_count} fichiers
            </span>
          )}
          <span className="text-[10px] text-muted-foreground/50 flex-shrink-0 ml-1 opacity-0 group-hover:opacity-100">
            {node.size > 0 ? fmt(node.size) : ''}
          </span>
          {node.is_folder && (
            <button
              onClick={(e) => { e.stopPropagation(); navigateToFolder(node.path); setTreeViewOpen(false); }}
              className="opacity-0 group-hover:opacity-100 text-[10px] text-primary hover:underline flex-shrink-0 ml-1"
              title="Naviguer vers ce dossier"
            >
              Ouvrir
            </button>
          )}
        </div>
        {node.is_folder && isExpanded && node.children.map(child => renderNode(child, depth + 1))}
      </div>
    );
  };

  return (
    <div className="fixed inset-0 z-40 flex justify-end" onClick={() => setTreeViewOpen(false)}>
      <div
        className="settings-panel w-[420px] h-full flex flex-col"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="relative z-10 flex-shrink-0 px-5 pt-5 pb-4 border-b border-white/10 dark:border-white/5 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-xl bg-primary/15 flex items-center justify-center">
              <GitBranch size={15} className="text-primary" />
            </div>
            <div>
              <p className="text-[13px] font-semibold">Vue arbre</p>
              <p className="text-[11px] text-muted-foreground truncate max-w-[240px]">
                {treeViewPath.split(/[/\\]/).pop() || treeViewPath}
              </p>
            </div>
          </div>
          <button onClick={() => setTreeViewOpen(false)}
            className="w-6 h-6 flex items-center justify-center rounded-full hover:bg-black/10 dark:hover:bg-white/10 transition-colors">
            <X size={14} />
          </button>
        </div>

        {/* Search */}
        <div className="relative z-10 flex-shrink-0 px-4 py-2 border-b border-white/5">
          <Search size={12} className="absolute left-7 top-1/2 -translate-y-1/2 text-muted-foreground/50" />
          <input
            type="text"
            placeholder="Filtrer..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full pl-8 pr-3 py-1.5 text-[12px] bg-secondary/40 rounded-lg border border-transparent focus:border-primary/30 focus:outline-none"
          />
        </div>

        {/* Tree */}
        <div className="relative z-10 flex-1 overflow-y-auto px-2 py-2 scrollbar-thin">
          {loading && (
            <div className="flex flex-col items-center justify-center h-40 gap-3 text-muted-foreground">
              <Loader2 size={22} className="animate-spin text-primary" />
              <p className="text-[12px]">Analyse en cours…</p>
            </div>
          )}
          {!loading && tree && renderNode(tree)}
        </div>
      </div>
    </div>
  );
};

// ============ SMART STORAGE ANALYSIS ============

const SmartCleanupPanel = ({ onClose }) => {
  const { currentPath } = useFileManager();
  const [candidates, setCandidates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState(new Set());
  const [deleting, setDeleting] = useState(false);
  const { deleteFile } = useFileManager();

  useEffect(() => {
    if (!currentPath) return;
    setLoading(true);
    invoke('get_cleanup_candidates', { path: currentPath })
      .then(res => { setCandidates(res); setSelected(new Set()); })
      .catch(e => toast.error(String(e)))
      .finally(() => setLoading(false));
  }, [currentPath]);

  const fmt = (b) => {
    if (b >= 1073741824) return (b / 1073741824).toFixed(1) + ' Go';
    if (b >= 1048576)    return (b / 1048576).toFixed(1)    + ' Mo';
    if (b >= 1024)       return (b / 1024).toFixed(0)       + ' Ko';
    return b + ' o';
  };

  const toggleSelect = (path) => setSelected(prev => {
    const n = new Set(prev);
    n.has(path) ? n.delete(path) : n.add(path);
    return n;
  });

  const selectAll = () => setSelected(new Set(candidates.map(c => c.path)));
  const selectNone = () => setSelected(new Set());

  const handleDelete = async () => {
    if (selected.size === 0) return;
    setDeleting(true);
    let ok = 0, fail = 0;
    for (const path of selected) {
      try { await invoke('delete_file', { path, permanent: false }); ok++; }
      catch { fail++; }
    }
    toast.success(`${ok} élément(s) supprimé(s)${fail > 0 ? `, ${fail} échec(s)` : ''}`);
    setCandidates(prev => prev.filter(c => !selected.has(c.path)));
    setSelected(new Set());
    setDeleting(false);
  };

  const totalSelected = candidates
    .filter(c => selected.has(c.path))
    .reduce((s, c) => s + c.size, 0);

  const CATEGORY_INFO = {
    temp:  { label: 'Temporaire', color: '#FF9500', Icon: Clock },
    large: { label: 'Volumineux',  color: '#FF3B30', Icon: HardDriveIcon },
    old:   { label: 'Ancien',      color: '#8E8E93', Icon: Clock },
    empty: { label: 'Vide',        color: '#34C759', Icon: AlertTriangle },
  };

  return (
    <div className="space-y-4">
      {loading && (
        <div className="flex items-center justify-center h-24 gap-3 text-muted-foreground">
          <Loader2 size={18} className="animate-spin text-primary" />
          <p className="text-[12px]">Analyse intelligente…</p>
        </div>
      )}

      {!loading && candidates.length === 0 && (
        <div className="flex flex-col items-center justify-center h-24 gap-2 text-muted-foreground">
          <CheckCircle2 size={22} className="text-[#34C759]" />
          <p className="text-[12px]">Aucun fichier inutile détecté</p>
        </div>
      )}

      {!loading && candidates.length > 0 && (
        <>
          <div className="flex items-center justify-between">
            <p className="text-[11px] text-muted-foreground">
              {candidates.length} éléments détectés
            </p>
            <div className="flex gap-2">
              <button onClick={selectAll} className="text-[11px] text-primary hover:underline">Tout</button>
              <button onClick={selectNone} className="text-[11px] text-muted-foreground hover:underline">Aucun</button>
            </div>
          </div>

          <div className="space-y-1 max-h-[300px] overflow-y-auto scrollbar-thin pr-1">
            {candidates.map(c => {
              const info = CATEGORY_INFO[c.category] || CATEGORY_INFO.temp;
              const CatIcon = info.Icon;
              const isSel = selected.has(c.path);
              return (
                <div
                  key={c.path}
                  onClick={() => toggleSelect(c.path)}
                  className={cn(
                    'flex items-center gap-2.5 p-2 rounded-lg cursor-pointer transition-colors border',
                    isSel
                      ? 'bg-destructive/10 border-destructive/30'
                      : 'bg-secondary/30 border-transparent hover:bg-secondary/60'
                  )}
                >
                  <div className={cn(
                    'w-4 h-4 rounded border-2 flex-shrink-0 flex items-center justify-center transition-all',
                    isSel ? 'bg-destructive border-destructive' : 'border-border'
                  )}>
                    {isSel && <X size={10} className="text-white" />}
                  </div>
                  <CatIcon size={13} style={{ color: info.color }} className="flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-[12px] truncate font-medium">{c.name}</p>
                    <p className="text-[10px] text-muted-foreground truncate">{c.reason}</p>
                  </div>
                  <span className="text-[11px] text-muted-foreground flex-shrink-0">
                    {c.size > 0 ? fmt(c.size) : '—'}
                  </span>
                </div>
              );
            })}
          </div>

          {selected.size > 0 && (
            <div className="pt-2 border-t border-border space-y-2">
              <div className="flex items-center justify-between text-[12px]">
                <span className="text-muted-foreground">{selected.size} sélectionné(s)</span>
                <span className="font-semibold text-destructive">{totalSelected > 0 ? '−' + fmt(totalSelected) : ''}</span>
              </div>
              <button
                onClick={handleDelete}
                disabled={deleting}
                className="w-full py-2 rounded-lg bg-destructive text-white text-[13px] font-medium hover:bg-destructive/90 transition-colors flex items-center justify-center gap-2 disabled:opacity-50"
              >
                {deleting ? <Loader2 size={14} className="animate-spin" /> : <Trash size={14} />}
                Supprimer {selected.size} élément(s)
              </button>
              <p className="text-[10px] text-muted-foreground text-center">Les fichiers seront envoyés à la corbeille</p>
            </div>
          )}
        </>
      )}
    </div>
  );
};

// ============ MAIN APP ============

const FileManagerApp = () => {
  const { splitMode } = useTheme();

  return (
    <div className="flex h-screen w-screen overflow-hidden text-[13px] select-none bg-background">
      <Sidebar />
      <main className="flex-1 flex flex-col min-w-0">
        <TopBar />
        <div className="flex-1 flex overflow-hidden min-h-0">
          <div className={cn('flex flex-col min-w-0', splitMode ? 'flex-1' : 'flex-1')}>
            <ContentArea />
          </div>
          {splitMode && <SecondPane />}
        </div>
        <StatusBar />
      </main>
      <QuickLook />
      <SettingsPanel />
      <DiskAnalysis />
      <TreeViewPanel />
      <SyncPanel />
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
