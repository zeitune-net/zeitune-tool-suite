export type ModuleId = 'git-manager' | 'dev-manager' | 'db-explorer' | 'settings'

export interface ModuleDefinition {
  id: ModuleId
  label: string
  shortLabel: string
  icon: string
}

export type Theme = 'dark' | 'light'
