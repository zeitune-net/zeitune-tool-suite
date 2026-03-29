import { Titlebar } from './Titlebar'
import { Sidebar } from './Sidebar'
import { useNavigation } from '../hooks/useNavigation'
import { GitManagerView } from '@git-manager/components/GitManagerView'
import { DevManagerView } from '@dev-manager/components/DevManagerView'
import { DbExplorerView } from '@db-explorer/components/DbExplorerView'
import { SettingsView } from './SettingsView'

const moduleViews = {
  'git-manager': GitManagerView,
  'dev-manager': DevManagerView,
  'db-explorer': DbExplorerView,
  'settings': SettingsView
} as const

export function Layout() {
  const { activeModule } = useNavigation()
  const ActiveView = moduleViews[activeModule]

  return (
    <div className="flex h-screen flex-col overflow-hidden">
      <Titlebar />
      <div className="flex flex-1 overflow-hidden">
        <Sidebar />
        <main className="flex-1 overflow-hidden">
          <ActiveView />
        </main>
      </div>
    </div>
  )
}
