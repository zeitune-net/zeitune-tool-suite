import { Settings } from 'lucide-react'
import { useTheme } from '../hooks/useTheme'
import { Button } from '@shared/components/ui/button'

export function SettingsView() {
  const { theme, toggle } = useTheme()

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-3 border-b border-border px-6 py-4">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-muted">
          <Settings className="h-5 w-5 text-muted-foreground" />
        </div>
        <div>
          <h1 className="text-xl font-semibold">Settings</h1>
          <p className="text-sm text-muted-foreground">Configuration de Zeitune Tool Suite</p>
        </div>
      </div>

      <div className="flex-1 overflow-auto p-6">
        <div className="max-w-2xl space-y-6">
          <div className="rounded-lg border border-border p-4">
            <h3 className="mb-3 text-sm font-medium">Apparence</h3>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm">Theme</p>
                <p className="text-xs text-muted-foreground">
                  Actuellement : {theme === 'dark' ? 'Sombre' : 'Clair'}
                </p>
              </div>
              <Button variant="outline" size="sm" onClick={toggle}>
                Basculer en mode {theme === 'dark' ? 'clair' : 'sombre'}
              </Button>
            </div>
          </div>

          <div className="rounded-lg border border-border p-4">
            <h3 className="mb-3 text-sm font-medium">A propos</h3>
            <p className="text-sm text-muted-foreground">
              Zeitune Tool Suite v0.1.0
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
