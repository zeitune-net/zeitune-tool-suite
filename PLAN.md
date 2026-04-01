# Cahier des Charges — DB Explorer

## 1. Système de Profils

**Un profil = un groupe de connexions nommé.**

```
Profil "Zeitune Dev"
├── olive_auth (localhost:5600)
├── olive_administration (localhost:5600)
├── olive_settings (localhost:5600)
├── olive_exploitation (localhost:5600)
├── olive_insured (localhost:5600)
├── pricing_db (localhost:5600)
└── numeric_attestations_db (localhost:5600)
```

| Aspect | Détail |
|--------|--------|
| Stockage profils | JSON (`db-profiles.json` dans userData) |
| Credentials | Chiffrés via `electron.safeStorage` (keychain OS natif) |
| SGBD supportés | PostgreSQL (priorité), MySQL, SQLite — architecture extensible via drivers |
| Connexion | Chaque entrée : `name`, `host`, `port`, `database`, `username`, `password`, `type` |
| CRUD | Créer, éditer, dupliquer, supprimer un profil |
| Test connexion | Bouton "Test" par connexion individuelle + "Test All" |

## 2. Schema Browser

| Feature | Détail |
|---------|--------|
| Arborescence | Connexion → Schemas → Tables / Views / Sequences |
| Détail table | Colonnes (nom, type, nullable, default), PK, FK, indexes, contraintes |
| Détail colonne | Type, nullable, default, commentaire |
| Recherche | Filtre rapide sur les noms de tables/colonnes |
| Rafraîchissement | Manuel + auto après exécution de DDL |

## 3. Query Editor

| Feature | Détail |
|---------|--------|
| Multi-onglets | Plusieurs requêtes ouvertes simultanément, chacune liée à une connexion |
| Exécution | Run (F5), Run Selection, Explain Plan |
| Résultats | Tableau paginé, tri par colonne, redimensionnement colonnes |
| Format | Bouton format SQL |
| Historique | Dernières requêtes exécutées par connexion, recherchable |
| Auto-complétion | Noms de tables, colonnes, mots-clés SQL |
| Saved queries | Requêtes nommées sauvegardées par profil |

## 4. Data Browser

| Feature | Détail |
|---------|--------|
| Browse | Afficher le contenu d'une table sans écrire de SQL |
| Filtrage | Filtre par colonne (=, LIKE, >, <, IS NULL, etc.) |
| Tri | Clic sur en-tête de colonne |
| Pagination | Configurable (25, 50, 100, 500 rows) |
| Édition inline | INSERT, UPDATE, DELETE via UI avec confirmation |
| Export | CSV, JSON — résultats courants ou table entière |

## 5. Snapshots & Restore (feature clé)

### 5.1 Snapshot

| Aspect | Détail |
|--------|--------|
| Granularité | Full DB, sélection de tables, ou multi-DB (plusieurs connexions d'un profil) |
| Contenu capturé | **Structure** (DDL : tables, colonnes, types, PK, FK, indexes, séquences) + **Données** (rows en JSON) |
| Format | JSON structuré dans userData (`db-snapshots/`) |
| Métadonnées | Nom, date, profil source, liste des tables, nombre de rows par table |
| Management | Liste, renommer, supprimer, inspecter le contenu d'un snapshot |

### 5.2 Restore — Le workflow

```
┌─────────────┐     ┌──────────────┐     ┌───────────────┐     ┌─────────┐
│  Sélection  │ ──► │  Schema Diff │ ──► │  Transform    │ ──► │  Apply  │
│  Snapshot   │     │  & Analyse   │     │  Editor       │     │         │
└─────────────┘     └──────────────┘     └───────────────┘     └─────────┘
```

**Étape 1 — Sélection** : Choisir un snapshot + la DB cible (peut être différente de l'originale)

**Étape 2 — Schema Diff** : Comparaison automatique entre le snapshot et le schéma live

| Changement détecté | Action proposée |
|--------------------|----------------|
| Table identique | ✅ Import direct |
| Colonne ajoutée (dans live, absente du snapshot) | Valeur par défaut / NULL / expression |
| Colonne supprimée (dans snapshot, absente du live) | Ignorer (avec avertissement) |
| Colonne renommée | Proposition de mapping (fuzzy match sur nom + même type) |
| Type changé | Conversion auto si compatible, sinon expression custom |
| Table renommée | Mapping manuel |
| Table splitée / fusionnée | Mapping manuel avec expressions |
| Nouvelle table (dans live) | Ignorée (pas de données à restaurer) |
| Table supprimée (dans snapshot) | Avertissement, skip |

**Étape 3 — Transform Editor** (UI visuelle)

| Capacité | Exemple |
|----------|---------|
| Mapping colonne → colonne | `last_name` → `nom_famille` |
| Valeur par défaut | Nouvelle colonne `status` → `'ACTIVE'` |
| Expression de transformation | `CONCAT(first_name, ' ', last_name)` → `full_name` |
| Split de colonne | `address` → `street`, `city`, `zip` (via expression) |
| Fusion de colonnes | `first_name` + `last_name` → `full_name` |
| Conversion de type | `VARCHAR '123'` → `INTEGER 123` |
| Filtre de rows | Exclure certaines lignes (expression WHERE) |
| Sauvegarde du pipeline | Nommer et réutiliser un jeu de transformations |

**Étape 4 — Apply**

| Aspect | Détail |
|--------|--------|
| Stratégie de conflit | **UPSERT par défaut** : `ON CONFLICT (PK) DO UPDATE` — si un tuple existe déjà (inséré par l'init de l'app), on le met à jour au lieu de crasher |
| Alternatives | Skip (ignorer les doublons), Replace (DELETE + INSERT), Fail (arrêter à la première erreur) |
| Ordre FK | Résolution automatique de l'ordre d'insertion (tri topologique des dépendances FK) |
| Séquences | Reset des séquences au MAX(id) + 1 après import |
| Transaction | Tout dans une transaction — rollback complet si erreur |
| Progression | Barre de progression par table |
| Mode DDL+Data | Option "Drop & Recreate" : DROP tables → CREATE depuis le snapshot → INSERT données (bypass le diff, utile quand le schéma est identique au snapshot) |

### 5.3 Data Sets (promotion de snapshots)

| Feature | Détail |
|---------|--------|
| Créer un data set | Depuis un snapshot (brut) ou un snapshot + pipeline de transformations |
| Nommer | "Zeitune - jeu minimal", "Zeitune - jeu complet", "Cas limites" |
| Quick Apply | Un clic pour restaurer un data set connu sur la DB courante |
| Versioning | Le data set garde une référence au schéma attendu, signale quand il est obsolète |

### 5.4 Multi-DB Snapshot/Restore

| Feature | Détail |
|---------|--------|
| Snapshot groupé | "Snapshot tout le profil Zeitune Dev" → un snapshot par DB, regroupés |
| Restore groupé | Restaurer les 7 bases d'un coup avec le même workflow (diff + transform par DB) |
| Ordre inter-DB | Pas de gestion de dépendances inter-services (chaque DB est indépendante) |

## 6. Monitoring léger

| Feature | Détail |
|---------|--------|
| Taille des tables | Rows count + taille disque |
| Connexions actives | `pg_stat_activity` (PostgreSQL) |
| Statut | Indicateur vert/rouge par connexion dans la sidebar |

## 7. Architecture technique

| Couche | Choix |
|--------|-------|
| Driver PostgreSQL | `pg` (node-postgres) dans le main process |
| Driver MySQL | `mysql2` |
| Driver SQLite | `better-sqlite3` |
| Credentials | `electron.safeStorage.encryptString()` → stocké en base64 dans le JSON profil |
| IPC channels | `db:connect`, `db:query`, `db:schema`, `db:snapshot`, `db:restore`, `db:test-connection`, etc. |
| Snapshots storage | `userData/db-snapshots/{profileId}/{snapshotId}.json` |
| Pipelines storage | `userData/db-pipelines/{profileId}/{pipelineId}.json` |

## 8. Priorités d'implémentation

| Phase | Contenu |
|-------|---------|
| **Phase 1 — Fondations** | Profils, connexions (PostgreSQL), schema browser, query editor basique (mono-onglet, pas d'autocomplétion) |
| **Phase 2 — Query & Browse** | Multi-onglets, data browser avec filtres/tri/pagination, historique, export CSV/JSON |
| **Phase 3 — Snapshots** | Snapshot (full DB, sélection tables, multi-DB), restore basique (schéma identique, upsert) |
| **Phase 4 — Transformations** | Schema diff, transform editor, pipelines sauvegardés, data sets |
| **Phase 5 — Polish** | Auto-complétion SQL, saved queries, édition inline, monitoring, MySQL/SQLite |
