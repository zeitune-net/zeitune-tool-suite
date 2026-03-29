import { resolve } from 'path'
import { defineConfig } from 'electron-vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  main: {
    build: {
      externalizeDeps: true,
      rollupOptions: {
        input: {
          index: resolve(__dirname, 'electron/main.ts')
        }
      }
    }
  },
  preload: {
    build: {
      externalizeDeps: true,
      rollupOptions: {
        input: {
          index: resolve(__dirname, 'electron/preload.ts')
        }
      }
    }
  },
  renderer: {
    root: '.',
    build: {
      rollupOptions: {
        input: {
          index: resolve(__dirname, 'index.html')
        }
      }
    },
    resolve: {
      alias: {
        '@shell': resolve(__dirname, 'packages/shell/src'),
        '@shared': resolve(__dirname, 'packages/shared/src'),
        '@git-manager': resolve(__dirname, 'packages/git-manager/src'),
        '@dev-manager': resolve(__dirname, 'packages/dev-manager/src'),
        '@db-explorer': resolve(__dirname, 'packages/db-explorer/src')
      }
    },
    plugins: [react()]
  }
})
