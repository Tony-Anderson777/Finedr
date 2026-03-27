# Smart File Manager - Application Windows Native avec Tauri

Application de gestion de fichiers intelligente inspirée de macOS Finder, conçue pour Windows avec Tauri.

## Prérequis

1. **Node.js** (v18+) - https://nodejs.org/
2. **Rust** - https://rustup.rs/
3. **Visual Studio Build Tools** (Windows) - https://visualstudio.microsoft.com/visual-cpp-build-tools/

## Installation

```bash
# 1. Cloner le projet
cd tauri-file-manager

# 2. Installer les dépendances Node.js
npm install

# 3. Lancer en mode développement
npm run tauri dev

# 4. Compiler pour Windows (.exe)
npm run tauri build
```

## Structure du projet

```
tauri-file-manager/
├── src/                    # Frontend React
│   ├── App.jsx            # Application principale
│   ├── App.css            # Styles
│   └── main.jsx           # Point d'entrée
├── src-tauri/             # Backend Rust (Tauri)
│   ├── src/
│   │   └── main.rs        # Logique Rust pour accès fichiers Windows
│   ├── Cargo.toml         # Dépendances Rust
│   └── tauri.conf.json    # Configuration Tauri
├── package.json           # Dépendances Node.js
└── index.html             # HTML de base
```

## Fonctionnalités

### Interface
- 4 vues d'affichage (Icônes, Liste, Colonnes, Galerie)
- Sidebar avec sections collapsibles
- Thème clair/sombre
- Menu contextuel glassmorphisme
- Quick Look (aperçu fichier avec Espace)

### Système de fichiers Windows
- Lecture des fichiers et dossiers réels
- Navigation dans tous les lecteurs (C:, D:, etc.)
- Copier/Couper/Coller de vrais fichiers
- Renommage et suppression
- Création de nouveaux dossiers
- Corbeille Windows

### Raccourcis clavier
- `Ctrl+1/2/3/4` - Changer de vue
- `Ctrl+C/X/V` - Copier/Couper/Coller
- `Ctrl+Shift+N` - Nouveau dossier
- `Delete` - Mettre à la corbeille
- `Shift+Delete` - Suppression définitive
- `Espace` - Quick Look
- `Alt+←/→` - Navigation
- `F5` - Actualiser

## Configuration

Le fichier `src-tauri/tauri.conf.json` contient la configuration de l'application :
- Nom de l'application
- Icône
- Permissions (accès fichiers)
- Fenêtre (taille, titre)

## Compilation

```bash
# Debug
npm run tauri dev

# Release (crée un .exe installable)
npm run tauri build
```

L'exécutable sera généré dans `src-tauri/target/release/`.

## Technologies utilisées

- **Frontend**: React 18, Tailwind CSS, Lucide Icons
- **Backend**: Tauri 2.0, Rust
- **Build**: Vite
