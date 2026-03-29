import { create } from 'zustand'

export interface DatabaseConnection {
  name: string
  host: string
  port: number
  database: string
  type: 'postgresql'
}

interface DbExplorerStore {
  connections: DatabaseConnection[]
  activeConnection: string | null
  selectedTable: string | null
  query: string
  setActiveConnection: (name: string) => void
  setSelectedTable: (table: string) => void
  setQuery: (query: string) => void
}

export const useDbExplorerStore = create<DbExplorerStore>()((set) => ({
  connections: [],
  activeConnection: null,
  selectedTable: null,
  query: '',
  setActiveConnection: (name) => set({ activeConnection: name }),
  setSelectedTable: (table) => set({ selectedTable: table }),
  setQuery: (query) => set({ query })
}))
