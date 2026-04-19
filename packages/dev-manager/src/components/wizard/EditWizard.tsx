import { useState, useEffect } from 'react'
import { X, Search, Check, Loader2, Settings2, Trash2, Plus } from 'lucide-react'
import { Button } from '@shared/components/ui/button'
import { Badge } from '@shared/components/ui/badge'
import { cn } from '@shared/lib/utils'
import { useDevManagerStore } from '../../store'
import { openDirectoryDialog, detectService } from '../../services/dev-ipc'
import { ServiceConfigEditor } from '../ServiceConfigEditor'
import { ScanProgress } from './ScanProgress'
import { newEmptyService, scanResultToConfig, typeBadgeVariant, typeLabels } from './shared'
import type { DevProfile, ServiceConfig } from '../../types'

interface Props {
  profile: DevProfile
  onClose: () => void
}

export function EditWizard({ profile, onClose }: Props) {
  const { scanning, scanResults, scanProgress, scanDirectory, updateProfile } = useDevManagerStore()

  const [name, setName] = useState(profile.name)
  const [rootPath] = useState(profile.rootPath)
  const [serviceConfigs, setServiceConfigs] = useState<ServiceConfig[]>([...profile.services])
  const [editingIndex, setEditingIndex] = useState<number | null>(null)
  const [editScanMode, setEditScanMode] = useState(false)
  const [editScanResults, setEditScanResults] = useState<Set<string>>(new Set())
  const [confirmDeleteIdx, setConfirmDeleteIdx] = useState<number | null>(null)

  useEffect(() => {
    if (editScanMode && scanResults.length > 0) {
      const existingDirs = new Set(serviceConfigs.map((s) => s.workingDir))
      const newResults = scanResults.filter((r) => !existingDirs.has(r.workingDir))
      setEditScanResults(new Set(newResults.map((r) => r.workingDir)))
    }
  }, [scanResults, editScanMode, serviceConfigs])

  const updateConfig = (index: number, config: ServiceConfig) => {
    const next = [...serviceConfigs]
    next[index] = config
    setServiceConfigs(next)
  }

  const removeService = (index: number) => {
    setServiceConfigs(serviceConfigs.filter((_, i) => i !== index))
    setEditingIndex((prev) => {
      if (prev === null || prev === index) return null
      return prev > index ? prev - 1 : prev
    })
    setConfirmDeleteIdx(null)
  }

  const handleEditScan = async () => {
    if (!rootPath) return
    setEditScanMode(true)
    await scanDirectory(rootPath)
  }

  const toggleEditScanResult = (workingDir: string) => {
    const next = new Set(editScanResults)
    if (next.has(workingDir)) next.delete(workingDir)
    else next.add(workingDir)
    setEditScanResults(next)
  }

  const addScannedServices = () => {
    const existingDirs = new Set(serviceConfigs.map((s) => s.workingDir))
    const newConfigs = scanResults
      .filter((r) => editScanResults.has(r.workingDir) && !existingDirs.has(r.workingDir))
      .map(scanResultToConfig)
    setServiceConfigs([...serviceConfigs, ...newConfigs])
    setEditScanMode(false)
    setEditScanResults(new Set())
  }

  const addManualService = async () => {
    const dir = await openDirectoryDialog()
    const workingDir = dir || rootPath
    const folderName = workingDir.replace(/[\\/]+$/, '').split(/[\\/]/).pop() || ''
    const detected = dir ? await detectService(workingDir) : null
    const service = detected
      ? scanResultToConfig(detected)
      : { ...newEmptyService(workingDir), name: dir ? folderName : '' }
    setServiceConfigs([...serviceConfigs, service])
    setEditingIndex(serviceConfigs.length)
  }

  const handleSave = () => {
    if (!name.trim()) return
    updateProfile(profile.id, name.trim(), serviceConfigs)
    onClose()
  }

  return (
    <div className="w-full max-w-lg rounded-2xl border border-border bg-card shadow-2xl">
      <div className="flex items-center justify-between border-b border-border px-6 py-4">
        <h2 className="text-lg font-semibold">Modifier le profil</h2>
        <button onClick={onClose} className="rounded-lg p-1 hover:bg-muted">
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="px-6 py-5 space-y-4">
        <div>
          <label className="mb-1.5 block text-xs font-medium text-muted-foreground">
            Nom du profil
          </label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Ex: Olive Insurance"
            className="w-full rounded-lg border border-border bg-input px-3 py-2 text-sm font-mono focus:border-primary focus:outline-none"
          />
        </div>

        <div>
          <div className="flex items-center justify-between mb-2">
            <label className="text-xs font-medium text-muted-foreground">
              Services ({serviceConfigs.length})
            </label>
            <div className="flex items-center gap-1">
              <Button variant="ghost" size="sm" className="h-7" onClick={addManualService}>
                <Plus className="mr-1 h-3 w-3" />
                Manuel
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="h-7"
                onClick={handleEditScan}
                disabled={scanning}
              >
                <Search className="mr-1 h-3 w-3" />
                Scanner
              </Button>
            </div>
          </div>

          {/* Scan results overlay */}
          {editScanMode && (
            <div className="mb-3 rounded-lg border border-primary/30 bg-primary/5 p-3">
              {scanning ? (
                scanProgress ? (
                  <ScanProgress rootPath={rootPath} progress={scanProgress} />
                ) : (
                  <div className="flex items-center gap-2 py-4 justify-center">
                    <Loader2 className="h-4 w-4 animate-spin text-primary" />
                    <span className="text-xs text-muted-foreground">Scan en cours...</span>
                  </div>
                )
              ) : (
                <>
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-xs text-muted-foreground">
                      {(() => {
                        const existingDirs = new Set(serviceConfigs.map((s) => s.workingDir))
                        const newCount = scanResults.filter(
                          (r) => !existingDirs.has(r.workingDir)
                        ).length
                        return `${newCount} nouveau(x) service(s) détecté(s)`
                      })()}
                    </p>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-6 text-[10px]"
                      onClick={() => setEditScanMode(false)}
                    >
                      Annuler
                    </Button>
                  </div>
                  <div className="max-h-40 space-y-0.5 overflow-auto">
                    {scanResults
                      .filter((r) => !serviceConfigs.some((s) => s.workingDir === r.workingDir))
                      .map((result) => (
                        <button
                          key={result.workingDir}
                          onClick={() => toggleEditScanResult(result.workingDir)}
                          className={cn(
                            'flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left transition-colors text-xs',
                            editScanResults.has(result.workingDir)
                              ? 'bg-primary/10 text-foreground'
                              : 'text-muted-foreground hover:bg-muted'
                          )}
                        >
                          <div
                            className={cn(
                              'flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded border transition-colors',
                              editScanResults.has(result.workingDir)
                                ? 'border-primary bg-primary'
                                : 'border-border'
                            )}
                          >
                            {editScanResults.has(result.workingDir) && (
                              <Check className="h-2 w-2 text-white" />
                            )}
                          </div>
                          <span className="truncate font-medium">{result.name}</span>
                          <Badge
                            variant={typeBadgeVariant[result.type]}
                            className="shrink-0 text-[9px]"
                          >
                            {typeLabels[result.type]}
                          </Badge>
                        </button>
                      ))}
                    {scanResults.filter(
                      (r) => !serviceConfigs.some((s) => s.workingDir === r.workingDir)
                    ).length === 0 && (
                      <p className="py-2 text-center text-[10px] text-muted-foreground">
                        Aucun nouveau service détecté
                      </p>
                    )}
                  </div>
                  {editScanResults.size > 0 && (
                    <Button size="sm" className="mt-2 w-full" onClick={addScannedServices}>
                      <Plus className="mr-1.5 h-3 w-3" />
                      Ajouter {editScanResults.size} service(s)
                    </Button>
                  )}
                </>
              )}
            </div>
          )}

          {/* Existing services */}
          <div className="max-h-64 space-y-0.5 overflow-auto rounded-lg border border-border p-1.5">
            {serviceConfigs.length === 0 && (
              <p className="py-6 text-center text-xs text-muted-foreground">
                Aucun service — ajoutez-en via scan ou manuellement
              </p>
            )}
            {serviceConfigs.map((config, i) => (
              <div key={config.id}>
                <div
                  className={cn(
                    'group flex items-center justify-between rounded-lg px-3 py-2 transition-colors',
                    editingIndex === i ? 'bg-primary/8' : 'hover:bg-muted'
                  )}
                >
                  <button
                    onClick={() => setEditingIndex(editingIndex === i ? null : i)}
                    className="flex items-center gap-2 min-w-0 flex-1 text-left"
                  >
                    <Settings2 className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                    <div className="min-w-0 flex-1">
                      <span className="truncate text-sm font-medium block">
                        {config.name || '(sans nom)'}
                      </span>
                      <span className="truncate text-[10px] text-muted-foreground block">
                        {config.workingDir}
                      </span>
                    </div>
                    <Badge variant={typeBadgeVariant[config.type]} className="shrink-0">
                      {typeLabels[config.type]}
                    </Badge>
                  </button>
                  <div className="flex items-center gap-1 shrink-0">
                    {config.port && (
                      <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
                        :{config.port}
                      </span>
                    )}
                    {confirmDeleteIdx === i ? (
                      <div className="flex items-center gap-0.5">
                        <Button
                          variant="destructive"
                          size="sm"
                          className="h-5 px-1.5 text-[9px]"
                          onClick={() => removeService(i)}
                        >
                          Oui
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-5 px-1.5 text-[9px]"
                          onClick={() => setConfirmDeleteIdx(null)}
                        >
                          Non
                        </Button>
                      </div>
                    ) : (
                      <button
                        onClick={(e) => {
                          e.stopPropagation()
                          setConfirmDeleteIdx(i)
                        }}
                        className="hidden rounded p-1 text-muted-foreground hover:bg-destructive/10 hover:text-destructive group-hover:block"
                      >
                        <Trash2 className="h-3 w-3" />
                      </button>
                    )}
                  </div>
                </div>
                {editingIndex === i && (
                  <div className="mt-1 mb-1 rounded-lg border border-border bg-background p-3">
                    <ServiceConfigEditor
                      config={config}
                      onChange={(updated) => updateConfig(i, updated)}
                      compact
                    />
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="flex items-center justify-between border-t border-border px-6 py-4">
        <p className="text-[10px] text-muted-foreground">{serviceConfigs.length} service(s)</p>
        <div className="flex items-center gap-2">
          <Button variant="ghost" onClick={onClose}>
            Annuler
          </Button>
          <Button disabled={!name.trim()} onClick={handleSave}>
            <Check className="mr-1.5 h-3.5 w-3.5" />
            Enregistrer
          </Button>
        </div>
      </div>
    </div>
  )
}
