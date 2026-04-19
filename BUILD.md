# Zeitune Tools - Build Guide

## Prerequisites

| Tool | Version | Install |
|------|---------|---------|
| Node.js | 18+ | [nodejs.org](https://nodejs.org) |
| pnpm | 8+ | `npm install -g pnpm` |
| Git | latest | [git-scm.com](https://git-scm.com) |

## Setup

```bash
# Clone the repository
git clone <repo-url>
cd zeitune-tools

# Install dependencies
pnpm install
```

## Development

```bash
# Start dev server with hot-reload + Electron window
pnpm dev
```

This launches electron-vite in dev mode with HMR for the renderer process.

## Type Checking

```bash
# Run all type checks (Node + Web)
pnpm typecheck

# Node types only (main process + preload)
pnpm typecheck:node

# Web types only (renderer / React)
pnpm typecheck:web
```

## Production Build

```bash
# Build all processes (main, preload, renderer)
pnpm build

# Preview the production build locally
pnpm preview
```

The build output goes to the `out/` directory:
- `out/main/` - Main process bundle
- `out/preload/` - Preload script bundle
- `out/renderer/` - React app bundle

## Packaging (Distributables)

```bash
# Package for current platform
npx electron-builder

# Package for Windows
npx electron-builder --win

# Package for macOS
npx electron-builder --mac

# Package for Linux
npx electron-builder --linux
```

Distributables are output to the `dist/` directory.

## All Commands Summary

| Command | Description |
|---------|-------------|
| `pnpm install` | Install all dependencies |
| `pnpm dev` | Dev server + Electron window (HMR) |
| `pnpm build` | Production build |
| `pnpm preview` | Preview production build |
| `pnpm typecheck` | TypeScript check (node + web) |
| `pnpm typecheck:node` | TypeScript check (main/preload) |
| `pnpm typecheck:web` | TypeScript check (renderer/React) |
| `npx electron-builder` | Package distributable |
