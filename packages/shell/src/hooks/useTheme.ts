import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { Theme } from '@shared/types'

interface ThemeStore {
  theme: Theme
  setTheme: (theme: Theme) => void
  toggle: () => void
}

export const useTheme = create<ThemeStore>()(
  persist(
    (set, get) => ({
      theme: 'dark',
      setTheme: (theme) => {
        document.documentElement.classList.toggle('dark', theme === 'dark')
        set({ theme })
      },
      toggle: () => {
        const next = get().theme === 'dark' ? 'light' : 'dark'
        document.documentElement.classList.toggle('dark', next === 'dark')
        set({ theme: next })
      }
    }),
    {
      name: 'zeitune-theme',
      onRehydrateStorage: () => (state) => {
        if (state) {
          document.documentElement.classList.toggle('dark', state.theme === 'dark')
        }
      }
    }
  )
)
