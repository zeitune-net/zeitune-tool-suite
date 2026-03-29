import { GitBranch, Code2, Database, Settings, Sun, Moon } from 'lucide-react'
import { cn } from '@shared/lib/utils'
import type { ModuleId } from '@shared/types'
import { useNavigation } from '../hooks/useNavigation'
import { useTheme } from '../hooks/useTheme'

interface NavItem {
  id: ModuleId
  label: string
  icon: React.ReactNode
}

const navItems: NavItem[] = [
  { id: 'git-manager', label: 'GIT', icon: <GitBranch className="h-5 w-5" /> },
  { id: 'dev-manager', label: 'DEV', icon: <Code2 className="h-5 w-5" /> },
  { id: 'db-explorer', label: 'DB', icon: <Database className="h-5 w-5" /> }
]

export function Sidebar() {
  const { activeModule, setActiveModule } = useNavigation()
  const { theme, toggle } = useTheme()

  return (
    <div className="flex h-full w-14 flex-col items-center justify-between border-r border-border bg-secondary py-3">
      <nav className="flex flex-col items-center gap-1">
        {navItems.map((item) => {
          const isActive = activeModule === item.id
          return (
            <button
              key={item.id}
              onClick={() => setActiveModule(item.id)}
              className={cn(
                'press-effect group relative flex h-12 w-12 flex-col items-center justify-center rounded-lg transition-all duration-150',
                isActive
                  ? 'bg-primary/10 text-primary'
                  : 'text-muted-foreground hover:bg-muted hover:text-foreground'
              )}
            >
              {isActive && (
                <div className="absolute left-0 top-1/2 h-6 w-0.5 -translate-y-1/2 rounded-r-full bg-primary" />
              )}
              {item.icon}
              <span className="mt-0.5 text-[10px] font-medium">{item.label}</span>
            </button>
          )
        })}
      </nav>

      <div className="flex flex-col items-center gap-1">
        <button
          onClick={toggle}
          className="press-effect flex h-10 w-10 items-center justify-center rounded-lg text-muted-foreground transition-all duration-150 hover:bg-muted hover:text-foreground"
          title={theme === 'dark' ? 'Mode clair' : 'Mode sombre'}
        >
          {theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
        </button>
        <button
          onClick={() => useNavigation.getState().setActiveModule('settings')}
          className={cn(
            'press-effect flex h-10 w-10 items-center justify-center rounded-lg transition-all duration-150',
            activeModule === 'settings'
              ? 'text-primary'
              : 'text-muted-foreground hover:bg-muted hover:text-foreground'
          )}
        >
          <Settings className="h-4 w-4" />
        </button>
      </div>
    </div>
  )
}
