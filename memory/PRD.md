# Smart File Manager - PRD (Product Requirements Document)

## Project Overview
Gestionnaire de fichiers intelligent inspiré de macOS Finder (Ventura/Sonoma) - Application web React + FastAPI avec système de fichiers virtuel MongoDB.

## User Personas
1. **Utilisateur principal** : Utilisateur Windows cherchant une expérience de gestion de fichiers fluide et épurée style macOS
2. **Power user** : Utilisateur avancé utilisant les raccourcis clavier et les fonctionnalités IA

## Core Requirements
- Interface 100% viewport, pas de scroll global (app style desktop)
- 4 vues d'affichage : Icônes, Liste, Colonnes, Galerie
- Sidebar avec sections collapsibles (Favoris, Cet appareil, Tags, Stockage)
- Navigation par breadcrumb cliquable
- Thème clair/sombre/système
- Quick Look pour aperçu fichiers
- Menu contextuel glassmorphisme
- Raccourcis clavier style macOS

## Implementation Status

### Phase 1 - Interface Principale ✅ COMPLETED (2025-01-27)
- [x] Layout principal (Sidebar 220px + TopBar 44px + Content + StatusBar 28px)
- [x] Sidebar avec sections collapsibles
- [x] TopBar avec navigation ← →, breadcrumb, recherche, view switcher
- [x] 4 vues : Icônes, Liste, Colonnes, Galerie
- [x] Thème clair/sombre avec toggle
- [x] Quick Look (aperçu fichier avec Espace)
- [x] Menu contextuel complet
- [x] Raccourcis clavier (Ctrl+1/2/3/4, Ctrl+C/X/V, Delete, etc.)
- [x] Backend API : files, folders, tags, favorites, trash, search, stats
- [x] Données de démonstration avec seed endpoint

### Phase 2 - Opérations Fichiers (À faire)
- [ ] Drag & drop inter-panneaux
- [ ] Split view (2 panneaux côte à côte)
- [ ] Onglets multiples
- [ ] Compression/décompression ZIP
- [ ] Tags persistants avec filtrage
- [ ] Barre de progression pour opérations longues

### Phase 3 - Fonctionnalités IA (À faire)
- [ ] Recherche sémantique avec Claude
- [ ] Résumé de fichier IA
- [ ] Renommage intelligent en lot
- [ ] Détection de doublons intelligente

## P0 Features (MVP - Done)
- Interface principale macOS-like
- Navigation et vues multiples
- Gestion basique des fichiers

## P1 Features (Next)
- Drag & drop complet
- Onglets et split view
- Tags avancés

## P2 Features (Future)
- Intégration IA complète
- Classement automatique
- Assistant chat intégré

## Tech Stack
- **Frontend**: React 19, Tailwind CSS, Shadcn/UI, Lucide Icons
- **Backend**: FastAPI, Motor (MongoDB async), Pydantic
- **Database**: MongoDB (système de fichiers virtuel)
- **IA**: Anthropic Claude (via Emergent LLM Key) - Phase 3

## API Endpoints
- `GET /api/files` - Liste fichiers d'un dossier
- `POST /api/files` - Créer fichier/dossier
- `PATCH /api/files/{id}` - Modifier fichier
- `DELETE /api/files/{id}` - Supprimer/corbeille
- `GET /api/tags` - Liste des tags
- `GET /api/favorites` - Favoris
- `GET /api/trash` - Corbeille
- `GET /api/search?q=` - Recherche
- `GET /api/stats` - Statistiques
- `POST /api/seed` - Données démo
