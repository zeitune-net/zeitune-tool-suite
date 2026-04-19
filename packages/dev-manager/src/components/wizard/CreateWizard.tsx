import { useState, useEffect } from 'react'
import { X, FolderOpen, Search, Check, Settings2 } from 'lucide-react'
import { Button } from '@shared/components/ui/button'
import { Badge } from '@shared/components/ui/badge'
import { cn } from '@shared/lib/utils'
import { useDevManagerStore } from '../../store'
import { openDirectoryDialog } from '../../services/dev-ipc'
import { ServiceConfigEditor } from '../ServiceConfigEditor'
import { ScanProgress } from './ScanProgress'
import { scanResultToConfig, typeBadgeVariant, typeLabels } from './shared'
import type { ServiceConfig, ServiceScanResult } from '../../types'

type CreateStep = 'config' | 'scan' | 'select' | 'configure'
const steps: CreateStep[] = ['config', 'scan', 'select', 'configure']

interface Props {
  onClose: () => void
}

export function CreateWizard({ onClose }: Props) {
  const { scanning, scanResults, scanProgress, scanDirectory, createProfile } = useDevManagerStore()

  const [step, setStep] = useState<CreateStep>('config')
  const [name, setName] = useState('')
  const [rootPath, setRootPath] = useState('')
  const [selectedResults, setSelectedResults] = useState<Set<string>>(new Set())
  const [serviceConfigs, setServiceConfigs] = useState<ServiceConfig[]>([])
  const [editingIndex, setEditingIndex] = useState<number | null>(null)

  useEffect(() => {
    if (step === 'select' && scanResults.length > 0) {
      setSelectedResults(new Set(scanResults.map((r) => r.workingDir)))
    }
  }, [scanResults, step])

  const handleBrowse = async () => {
    const dir = await openDirectoryDialog()
    if (dir) {
      setRootPath(dir)
      if (!name.trim()) {
        const folderName = dir.replace(/[\\/]+$/, '').split(/[\\/]/).pop() || ''
        setName(folderName)
      }
    }
  }

  const updateConfig = (index: number, config: ServiceConfig) => {
    const next = [...serviceConfigs]
    next[index] = config
    setServiceConfigs(next)
  }

  const handleScan = async () => {
    if (!rootPath) return
    setStep('scan')
    try {
      await scanDirectory(rootPath)
    } catch {
      // scanDirectory gère son propre état scanning
    }
    setStep('select')
  }

  const toggleResult = (workingDir: string) => {
    const next = new Set(selectedResults)
    if (next.has(workingDir)) next.delete(workingDir)
    else next.add(workingDir)
    setSelectedResults(next)
  }

  const toggleAll = () => {
    if (selectedResults.size === scanResults.length) {
      setSelectedResults(new Set())
    } else {
      setSelectedResults(new Set(scanResults.map((r) => r.workingDir)))
    }
  }

  const handleGoToConfigure = () => {
    const selected = scanResults.filter((r) => selectedResults.has(r.workingDir))
    setServiceConfigs(selected.map(scanResultToConfig))
    setEditingIndex(null)
    setStep('configure')
  }

  const handleCreate = () => {
    if (!name.trim() || serviceConfigs.length === 0) return
    createProfile(name.trim(), rootPath, serviceConfigs)
    onClose()
  }

  return (
    <div className="w-full max-w-lg rounded-2xl border border-border bg-card shadow-2xl">
      <div className="flex items-center justify-between border-b border-border px-6 py-4">
        <h2 className="text-lg font-semibold">Nouveau profil Dev</h2>
        <button onClick={onClose} className="rounded-lg p-1 hover:bg-muted">
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="px-6 py-5">
        {/* Step indicators */}
        <div className="mb-6 flex items-center gap-2">
          {steps.map((s, i) => (
            <div key={s} className="flex items-center gap-2">
              <div
                className={cn(
                  'flex h-6 w-6 items-center justify-center rounded-full text-[10px] font-bold',
                  step === s
                    ? 'bg-primary text-white'
                    : i < steps.indexOf(step)
                      ? 'bg-primary/20 text-primary'
                      : 'bg-muted text-muted-foreground'
                )}
              >
                {i + 1}
              </div>
              {i < steps.length - 1 && <div className="h-px w-6 bg-border" />}
            </div>
          ))}
        </div>

        {step === 'config' && (
          <ConfigStep
            name={name}
            rootPath={rootPath}
            onNameChange={setName}
            onRootPathChange={setRootPath}
            onBrowse={handleBrowse}
          />
        )}

        {step === 'scan' && <ScanProgress rootPath={rootPath} progress={scanProgress} />}

        {step === 'select' && (
          <SelectStep
            scanResults={scanResults}
            selectedResults={selectedResults}
            onToggle={toggleResult}
            onToggleAll={toggleAll}
          />
        )}

        {step === 'configure' && (
          <ConfigureStep
            serviceConfigs={serviceConfigs}
            editingIndex={editingIndex}
            onSetEditing={setEditingIndex}
            onUpdate={updateConfig}
          />
        )}
      </div>

      <div className="flex items-center justify-end gap-2 border-t border-border px-6 py-4">
        <Button variant="ghost" onClick={onClose}>
          Annuler
        </Button>
        {step === 'config' && (
          <Button disabled={!name.trim() || !rootPath.trim() || scanning} onClick={handleScan}>
            <Search className="mr-1.5 h-3.5 w-3.5" />
            Scanner
          </Button>
        )}
        {step === 'select' && (
          <>
            <Button
              variant="ghost"
              size="sm"
              disabled={selectedResults.size === 0}
              onClick={() => {
                const selected = scanResults.filter((r) => selectedResults.has(r.workingDir))
                const configs = selected.map(scanResultToConfig)
                if (name.trim() && configs.length > 0) {
                  createProfile(name.trim(), rootPath, configs)
                  onClose()
                }
              }}
            >
              Créer sans configurer
            </Button>
            <Button disabled={selectedResults.size === 0} onClick={handleGoToConfigure}>
              <Settings2 className="mr-1.5 h-3.5 w-3.5" />
              Configurer ({selectedResults.size})
            </Button>
          </>
        )}
        {step === 'configure' && (
          <Button disabled={serviceConfigs.length === 0} onClick={handleCreate}>
            <Check className="mr-1.5 h-3.5 w-3.5" />
            Créer le profil
          </Button>
        )}
      </div>
    </div>
  )
}

// ── Steps ───────────────────────────────────────────────────────────────────

function ConfigStep({
  name,
  rootPath,
  onNameChange,
  onRootPathChange,
  onBrowse
}: {
  name: string
  rootPath: string
  onNameChange: (v: string) => void
  onRootPathChange: (v: string) => void
  onBrowse: () => void
}) {
  return (
    <div className="space-y-4">
      <div>
        <label className="mb-1.5 block text-xs font-medium text-muted-foreground">
          Nom du profil
        </label>
        <input
          type="text"
          value={name}
          onChange={(e) => onNameChange(e.target.value)}
          placeholder="Ex: Olive Insurance"
          className="w-full rounded-lg border border-border bg-input px-3 py-2 text-sm font-mono focus:border-primary focus:outline-none"
        />
      </div>
      <div>
        <label className="mb-1.5 block text-xs font-medium text-muted-foreground">
          Répertoire racine
        </label>
        <div className="flex gap-2">
          <input
            type="text"
            value={rootPath}
            onChange={(e) => onRootPathChange(e.target.value)}
            placeholder="C:\Users\...\workspace"
            className="flex-1 rounded-lg border border-border bg-input px-3 py-2 text-sm font-mono focus:border-primary focus:outline-none"
          />
          <Button variant="outline" size="default" onClick={onBrowse}>
            <FolderOpen className="mr-1.5 h-3.5 w-3.5" />
            Parcourir
          </Button>
        </div>
        <p className="mt-1 text-[10px] text-muted-foreground">
          Scan récursif à 2 niveaux de profondeur
        </p>
      </div>
    </div>
  )
}

function SelectStep({
  scanResults,
  selectedResults,
  onToggle,
  onToggleAll
}: {
  scanResults: ServiceScanResult[]
  selectedResults: Set<string>
  onToggle: (dir: string) => void
  onToggleAll: () => void
}) {
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          <span className="font-medium text-foreground">{scanResults.length}</span> services
          détectés
        </p>
        <Button variant="ghost" size="sm" onClick={onToggleAll}>
          {selectedResults.size === scanResults.length ? 'Tout décocher' : 'Tout cocher'}
        </Button>
      </div>
      <div className="max-h-64 space-y-1 overflow-auto rounded-lg border border-border p-1.5">
        {scanResults.map((result) => (
          <button
            key={result.workingDir}
            onClick={() => onToggle(result.workingDir)}
            className={cn(
              'flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left transition-colors',
              selectedResults.has(result.workingDir)
                ? 'bg-primary/8 text-foreground'
                : 'text-muted-foreground hover:bg-muted'
            )}
          >
            <div
              className={cn(
                'flex h-4 w-4 shrink-0 items-center justify-center rounded border transition-colors',
                selectedResults.has(result.workingDir)
                  ? 'border-primary bg-primary'
                  : 'border-border'
              )}
            >
              {selectedResults.has(result.workingDir) && (
                <Check className="h-2.5 w-2.5 text-white" />
              )}
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <p className="truncate text-sm font-medium">{result.name}</p>
                <Badge variant={typeBadgeVariant[result.type]}>{typeLabels[result.type]}</Badge>
              </div>
              <p className="truncate text-[10px] text-muted-foreground">
                {result.suggestedCommand}
                {result.suggestedPort && ` · :${result.suggestedPort}`}
              </p>
            </div>
          </button>
        ))}
        {scanResults.length === 0 && (
          <p className="py-6 text-center text-xs text-muted-foreground">
            Aucun service détecté dans ce répertoire
          </p>
        )}
      </div>
      <Badge variant="muted">{selectedResults.size} sélectionné(s)</Badge>
    </div>
  )
}

function ConfigureStep({
  serviceConfigs,
  editingIndex,
  onSetEditing,
  onUpdate
}: {
  serviceConfigs: ServiceConfig[]
  editingIndex: number | null
  onSetEditing: (i: number | null) => void
  onUpdate: (i: number, c: ServiceConfig) => void
}) {
  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">Configurez vos services (optionnel)</p>
      <div className="max-h-72 space-y-1 overflow-auto rounded-lg border border-border p-1.5">
        {serviceConfigs.map((config, i) => (
          <div key={config.id}>
            <button
              onClick={() => onSetEditing(editingIndex === i ? null : i)}
              className={cn(
                'flex w-full items-center justify-between rounded-lg px-3 py-2 text-left transition-colors hover:bg-muted',
                editingIndex === i && 'bg-primary/8'
              )}
            >
              <div className="flex items-center gap-2 min-w-0">
                <Settings2 className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                <span className="truncate text-sm font-medium">{config.name}</span>
                <Badge variant={typeBadgeVariant[config.type]} className="shrink-0">
                  {typeLabels[config.type]}
                </Badge>
              </div>
              {config.port && (
                <span className="shrink-0 rounded bg-muted px-1.5 py-0.5 text-xs text-muted-foreground">
                  :{config.port}
                </span>
              )}
            </button>
            {editingIndex === i && (
              <div className="mt-1 rounded-lg border border-border bg-background p-3">
                <ServiceConfigEditor
                  config={config}
                  onChange={(updated) => onUpdate(i, updated)}
                  compact
                />
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
