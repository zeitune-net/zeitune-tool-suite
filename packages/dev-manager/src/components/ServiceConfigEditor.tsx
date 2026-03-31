import { Plus, Trash2, FolderOpen } from 'lucide-react'
import { Button } from '@shared/components/ui/button'
import { Badge } from '@shared/components/ui/badge'
import { cn } from '@shared/lib/utils'
import { openDirectoryDialog } from '../services/dev-ipc'
import type { ServiceConfig, ServiceType } from '../types'

const typeLabels: Record<ServiceType, string> = {
  'spring-boot-maven': 'Spring Boot (Maven)',
  'spring-boot-gradle': 'Spring Boot (Gradle)',
  node: 'Node.js',
  python: 'Python',
  'docker-compose': 'Docker Compose',
  custom: 'Custom'
}

interface ServiceConfigEditorProps {
  config: ServiceConfig
  onChange: (config: ServiceConfig) => void
  compact?: boolean
}

function InputField({
  label,
  value,
  onChange,
  placeholder,
  mono,
  type = 'text'
}: {
  label: string
  value: string
  onChange: (val: string) => void
  placeholder?: string
  mono?: boolean
  type?: string
}) {
  return (
    <div>
      <label className="mb-1 block text-[10px] font-medium text-muted-foreground">{label}</label>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className={`w-full rounded-lg border border-border bg-input px-2.5 py-1.5 text-xs focus:border-primary focus:outline-none ${mono ? 'font-mono' : ''}`}
      />
    </div>
  )
}

export function ServiceConfigEditor({ config, onChange, compact }: ServiceConfigEditorProps) {
  const update = (partial: Partial<ServiceConfig>) => {
    onChange({ ...config, ...partial })
  }

  const envEntries = Object.entries(config.envVars || {})

  const addEnvVar = () => {
    const envVars = { ...(config.envVars || {}), '': '' }
    update({ envVars })
  }

  const updateEnvVar = (oldKey: string, newKey: string, value: string) => {
    const envVars = { ...(config.envVars || {}) }
    if (oldKey !== newKey) delete envVars[oldKey]
    envVars[newKey] = value
    update({ envVars })
  }

  const removeEnvVar = (key: string) => {
    const envVars = { ...(config.envVars || {}) }
    delete envVars[key]
    update({ envVars })
  }

  return (
    <div className={cn('space-y-3', compact && 'text-xs')}>
      <div className="grid grid-cols-2 gap-3">
        <InputField
          label="Nom"
          value={config.name}
          onChange={(name) => update({ name })}
          placeholder="Service name"
        />
        <div>
          <label className="mb-1 block text-[10px] font-medium text-muted-foreground">Type</label>
          <Badge variant="secondary" className="mt-1">{typeLabels[config.type]}</Badge>
        </div>
      </div>

      {/* Working directory */}
      <div>
        <label className="mb-1 block text-[10px] font-medium text-muted-foreground">
          Répertoire de travail
        </label>
        <div className="flex gap-1.5">
          <input
            type="text"
            value={config.workingDir}
            onChange={(e) => update({ workingDir: e.target.value })}
            placeholder="C:\Users\...\project"
            className="flex-1 rounded-lg border border-border bg-input px-2.5 py-1.5 text-xs font-mono focus:border-primary focus:outline-none"
          />
          <Button
            variant="outline"
            size="sm"
            className="h-7 px-2 shrink-0"
            onClick={async () => {
              const dir = await openDirectoryDialog()
              if (dir) update({ workingDir: dir })
            }}
          >
            <FolderOpen className="h-3 w-3" />
          </Button>
        </div>
      </div>

      <InputField
        label="Commande de démarrage"
        value={config.command}
        onChange={(command) => update({ command })}
        placeholder="./mvnw spring-boot:run"
        mono
      />

      <InputField
        label="Commande de build"
        value={config.buildCommand || ''}
        onChange={(buildCommand) => update({ buildCommand: buildCommand || undefined })}
        placeholder="./mvnw clean package -DskipTests"
        mono
      />

      <div className="grid grid-cols-2 gap-3">
        <InputField
          label="Port"
          value={config.port?.toString() || ''}
          onChange={(v) => update({ port: v ? parseInt(v) : undefined })}
          placeholder="8080"
          type="number"
        />
        <InputField
          label="Groupe"
          value={config.group || ''}
          onChange={(group) => update({ group: group || undefined })}
          placeholder="Backend, Infra..."
        />
      </div>

      <InputField
        label="Health Check URL"
        value={config.healthCheckUrl || ''}
        onChange={(healthCheckUrl) => update({ healthCheckUrl: healthCheckUrl || undefined })}
        placeholder="http://localhost:8080/actuator/health"
        mono
      />

      {/* Auto-restart toggle */}
      <div className="flex items-center gap-2">
        <button
          onClick={() => update({ autoRestart: !config.autoRestart })}
          className={`h-5 w-9 rounded-full transition-colors ${config.autoRestart ? 'bg-primary' : 'bg-muted'}`}
        >
          <div
            className={`h-4 w-4 rounded-full bg-white shadow transition-transform ${config.autoRestart ? 'translate-x-[18px]' : 'translate-x-0.5'}`}
          />
        </button>
        <span className="text-xs text-muted-foreground">Redémarrage automatique</span>
      </div>

      {/* Environment Variables */}
      {!compact && (
        <div>
          <div className="flex items-center justify-between mb-1">
            <label className="text-[10px] font-medium text-muted-foreground">
              Variables d'environnement
            </label>
            <Button variant="ghost" size="sm" onClick={addEnvVar} className="h-6 px-2">
              <Plus className="h-3 w-3 mr-1" />
              Ajouter
            </Button>
          </div>
          {envEntries.length > 0 && (
            <div className="space-y-1.5">
              {envEntries.map(([key, value], i) => (
                <div key={i} className="flex items-center gap-1.5">
                  <input
                    value={key}
                    onChange={(e) => updateEnvVar(key, e.target.value, value)}
                    placeholder="KEY"
                    className="w-1/3 rounded border border-border bg-input px-2 py-1 text-[10px] font-mono focus:border-primary focus:outline-none"
                  />
                  <span className="text-muted-foreground">=</span>
                  <input
                    value={value}
                    onChange={(e) => updateEnvVar(key, key, e.target.value)}
                    placeholder="value"
                    className="flex-1 rounded border border-border bg-input px-2 py-1 text-[10px] font-mono focus:border-primary focus:outline-none"
                  />
                  <button
                    onClick={() => removeEnvVar(key)}
                    className="rounded p-0.5 text-muted-foreground hover:text-destructive"
                  >
                    <Trash2 className="h-3 w-3" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
