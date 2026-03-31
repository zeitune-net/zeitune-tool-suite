import { useState, useEffect } from 'react'
import { Titlebar } from './Titlebar'
import { Sidebar } from './Sidebar'
import { useNavigation } from '../hooks/useNavigation'
import { GitManagerView } from '@git-manager/components/GitManagerView'
import { DevManagerView } from '@dev-manager/components/DevManagerView'
import { DbExplorerView } from '@db-explorer/components/DbExplorerView'
import { SettingsView } from './SettingsView'
const moduleViews: Record<string, React.ComponentType> = {
  'git-manager': GitManagerView,
  'dev-manager': DevManagerView,
  'db-explorer': DbExplorerView,
  'settings': SettingsView
}

export function Layout() {
  const { activeModule } = useNavigation()

  // Track which modules have been visited — mount once, never unmount
  const [mountedModules, setMountedModules] = useState<Set<string>>(
    () => new Set([activeModule])
  )

  useEffect(() => {
    setMountedModules((prev) => {
      if (prev.has(activeModule)) return prev
      const next = new Set(prev)
      next.add(activeModule)
      return next
    })
  }, [activeModule])

  return (
    <div className="flex h-screen flex-col overflow-hidden">
      <Titlebar />
      <div className="flex flex-1 overflow-hidden">
        <Sidebar />
        <main className="flex-1 overflow-hidden relative">
          {Array.from(mountedModules).map((moduleId) => {
            const View = moduleViews[moduleId]
            if (!View) return null
            return (
              <div
                key={moduleId}
                className={moduleId === activeModule ? 'h-full' : 'hidden'}
              >
                <View />
              </div>
            )
          })}
        </main>
      </div>
    </div>
  )
}
