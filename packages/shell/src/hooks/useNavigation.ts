import { create } from 'zustand'
import type { ModuleId } from '@shared/types'

interface NavigationStore {
  activeModule: ModuleId
  setActiveModule: (module: ModuleId) => void
}

export const useNavigation = create<NavigationStore>()((set) => ({
  activeModule: 'git-manager',
  setActiveModule: (module) => set({ activeModule: module })
}))
