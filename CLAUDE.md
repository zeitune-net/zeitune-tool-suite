# Zeitune Tool Suite

Application desktop Electron qui unifie les outils de developpement Zeitune : Git Manager, Dev Manager, DB Explorer.

## Critical Rules

**NEVER** commit secrets, credentials, or API keys in code.
**NEVER** create files unless absolutely necessary. Prefer editing existing files.
**NEVER** proactively create documentation files (*.md) unless explicitly requested.
**ALWAYS** prefer editing an existing file to creating a new one.
**ALWAYS** keep module code isolated in its own package — zero cross-module imports between git-manager, dev-manager, and db-explorer.
**ALWAYS** use path aliases for imports: `@shell/*`, `@shared/*`, `@git-manager/*`, `@dev-manager/*`, `@db-explorer/*`.
**ALWAYS** run `npx electron-vite build` to verify compilation after changes.

## Tech Stack

| Layer | Technologies |
|-------|-------------|
| Runtime | Electron 33+, Node.js |
| UI | React 19, TypeScript 5, Tailwind CSS 3.4 |
| Bundler | Vite 6 via electron-vite 5 |
| State | Zustand 5 |
| Components | shadcn/ui pattern (cva + tailwind-merge + clsx) |
| Icons | Lucide React |
| Monorepo | pnpm workspaces |
| Fonts | Inter (UI), JetBrains Mono (code/terminal) |

## Repository Structure

```
zeitune-tools/
├── electron/
│   ├── main.ts                    # Main process, BrowserWindow, IPC handlers
│   └── preload.ts                 # Context bridge, channel whitelist
├── packages/
│   ├── shell/                     # Window frame, titlebar, navigation, theming
│   │   └── src/
│   │       ├── main.tsx           # React entry point
│   │       ├── App.tsx
│   │       ├── globals.css        # Zeitune theme CSS variables (dark/light)
│   │       ├── components/
│   │       │   ├── Layout.tsx     # Main layout orchestrator
│   │       │   ├── Titlebar.tsx   # Custom frameless titlebar + window controls
│   │       │   ├── Sidebar.tsx    # Left nav (GIT/DEV/DB) + theme toggle
│   │       │   └── SettingsView.tsx
│   │       └── hooks/
│   │           ├── useTheme.ts    # Dark/light with localStorage persistence
│   │           └── useNavigation.ts # Active module state
│   ├── shared/                    # Shared UI components, utils, types
│   │   └── src/
│   │       ├── components/ui/     # Button, Badge (shadcn/cva pattern)
│   │       ├── lib/utils.ts       # cn() helper
│   │       └── types/             # ModuleId, Theme, shared interfaces
│   ├── git-manager/               # Git operations tool
│   │   └── src/
│   │       ├── store.ts           # Zustand store
│   │       └── components/
│   ├── dev-manager/               # Spring Boot microservices manager
│   │   └── src/
│   │       ├── store.ts
│   │       └── components/
│   └── db-explorer/               # Database query explorer
│       └── src/
│           ├── store.ts
│           └── components/
├── electron.vite.config.ts        # Build config with path aliases
├── tailwind.config.ts             # Theme tokens
├── index.html                     # Renderer HTML entry
└── package.json                   # pnpm workspaces root
```

## Architecture Rules

### Module Isolation
- Each module (git-manager, dev-manager, db-explorer) is a self-contained package
- Modules NEVER import from each other — only from `@shared/*`
- Shared UI components, types, and utils go in `packages/shared/`
- Shell orchestrates module mounting via `packages/shell/src/components/Layout.tsx`
- Each module has its own Zustand store in `store.ts`

### Adding a New Component
1. Shared UI (button, badge, etc.) → `packages/shared/src/components/ui/`
2. Module-specific component → `packages/<module>/src/components/`
3. Shell component (layout, nav) → `packages/shell/src/components/`

### IPC Communication
- All IPC channels must be whitelisted in `electron/preload.ts`
- Channel naming: `<domain>:<action>` (e.g., `git:status`, `db:query`)
- Main process handlers in `electron/main.ts`

## Zeitune Design System

### Color Palette

**Dark theme (default):**
- Background: `#0d0d0d`, Surface: `#141414`, Card: `#1a1a1a`
- Primary accent: `#9BD564` (Zeitune green)
- Text: `#e8f0d8`, Muted: `#606060`
- Borders: `rgba(155,213,100, 0.10)`, highlighted: `rgba(155,213,100, 0.40)`

**Light theme:**
- Background: `#f5f9ee`, Card: `#ffffff`
- Primary accent: `#78A54E`
- Text: `#1A1A1A`, Muted: `#6b7280`

**Status colors (both themes):**
- Success/OK: green (`#9BD564` / `#78A54E`)
- Warning: yellow (`#fbbf24` / `#d97706`)
- Error: red (`#f87171` / `#dc2626`)
- Info: blue (`#60a5fa` / `#2563eb`)
- Special: purple (`#c084fc` / `#7c3aed`)

### Component Conventions
- Border radius: `9px` (buttons/inputs), `14px` (cards), `18px` (modals), `99px` (badges)
- Transitions: `150ms` standard, `120ms` fast (window controls), `200ms` slow (cards)
- Active press: `transform: scale(0.97)`
- Primary button: gradient `#78A54E → #9BD564` with green glow shadow
- Ghost button: transparent with border, text highlight on hover
- Inputs: JetBrains Mono font, subtle background `rgba(128,128,128, 0.06)`

### CSS Classes
- `.text-gradient` — Zeitune green gradient text
- `.btn-glow` — Green glow shadow on buttons
- `.press-effect` — Scale down on active/click
- `.header-blur` — Backdrop blur header
- `.drag-region` / `.no-drag` — Electron window drag zones

## Development Commands

| Command | Purpose |
|---------|---------|
| `pnpm dev` | Dev server + Electron window |
| `pnpm build` | Production build |
| `pnpm preview` | Preview production build |
| `pnpm typecheck` | TypeScript checking (node + web) |

## Commit Guidelines

Follow Conventional Commits: `feat:`, `fix:`, `refactor:`, `docs:`, `test:`, `chore:`
Scope by module when relevant: `feat(git-manager):`, `fix(shell):`, `refactor(shared):`
