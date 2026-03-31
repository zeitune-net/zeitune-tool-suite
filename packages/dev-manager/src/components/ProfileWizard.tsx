import { useState, useEffect } from 'react'
import { X, FolderOpen, Search, Check, Loader2, Settings2, Trash2, Plus } from 'lucide-react'
import { Button } from '@shared/components/ui/button'
import { Badge } from '@shared/components/ui/badge'
import { cn } from '@shared/lib/utils'
import { useDevManagerStore } from '../store'
import { openDirectoryDialog, detectService } from '../services/dev-ipc'
import { ServiceConfigEditor } from './ServiceConfigEditor'
import type { ServiceScanResult, ServiceConfig, ServiceType } from '../types'

type CreateStep = 'config' | 'scan' | 'select' | 'configure'

const typeLabels: Record<ServiceType, string> = {
  'spring-boot-maven': 'Spring Boot (Maven)',
  'spring-boot-gradle': 'Spring Boot (Gradle)',
  node: 'Node.js',
  python: 'Python',
  'docker-compose': 'Docker Compose',
  custom: 'Custom'
}

const typeBadgeVariant: Record<ServiceType, 'success' | 'info' | 'warning' | 'purple' | 'secondary' | 'muted'> = {
  'spring-boot-maven': 'success',
  'spring-boot-gradle': 'success',
  node: 'info',
  python: 'warning',
  'docker-compose': 'purple',
  custom: 'muted'
}

function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).substring(2, 8)
}

function scanResultToConfig(result: ServiceScanResult): ServiceConfig {
  return {
    id: generateId(),
    name: result.name,
    type: result.type,
    workingDir: result.workingDir,
    command: result.suggestedCommand,
    buildCommand: result.suggestedBuildCommand,
    port: result.suggestedPort,
    autoRestart: false
  }
}

function newEmptyService(workingDir: string): ServiceConfig {
  return {
    id: generateId(),
    name: '',
    type: 'custom',
    workingDir,
    command: '',
    autoRestart: false
  }
}

export function ProfileWizard() {
  const {
    wizardOpen,
    setWizardOpen,
    editingProfileId,
    profiles,
    scanning,
    scanResults,
    scanDirectory,
    createProfile,
    updateProfile
  } = useDevManagerStore()

  // Create mode state
  const [step, setStep] = useState<CreateStep>('config')
  const [name, setName] = useState('')
  const [rootPath, setRootPath] = useState('')
  const [selectedResults, setSelectedResults] = useState<Set<string>>(new Set())
  const [serviceConfigs, setServiceConfigs] = useState<ServiceConfig[]>([])
  const [editingIndex, setEditingIndex] = useState<number | null>(null)

  // Edit mode sub-views
  const [editScanMode, setEditScanMode] = useState(false)
  const [editScanResults, setEditScanResults] = useState<Set<string>>(new Set())
  const [confirmDeleteIdx, setConfirmDeleteIdx] = useState<number | null>(null)

  // Load profile data when editing
  const editingProfile = editingProfileId
    ? profiles.find((p) => p.id === editingProfileId)
    : null

  useEffect(() => {
    if (editingProfile && wizardOpen) {
      setName(editingProfile.name)
      setRootPath(editingProfile.rootPath)
      setServiceConfigs([...editingProfile.services])
      setEditingIndex(null)
      setEditScanMode(false)
      setConfirmDeleteIdx(null)
    }
  }, [editingProfileId, wizardOpen])

  // Pre-select new results when scan completes (edit mode)
  useEffect(() => {
    if (editScanMode && scanResults.length > 0) {
      // Only pre-select results not already in the profile
      const existingDirs = new Set(serviceConfigs.map((s) => s.workingDir))
      const newResults = scanResults.filter((r) => !existingDirs.has(r.workingDir))
      setEditScanResults(new Set(newResults.map((r) => r.workingDir)))
    }
  }, [scanResults, editScanMode])

  // Pre-select all when scan completes (create mode)
  useEffect(() => {
    if (!editingProfileId && step === 'select' && scanResults.length > 0) {
      setSelectedResults(new Set(scanResults.map((r) => r.workingDir)))
    }
  }, [scanResults, step, editingProfileId])

  // Close on Escape key
  useEffect(() => {
    if (!wizardOpen) return
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close()
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [wizardOpen])

  if (!wizardOpen) return null

  const isEditMode = !!editingProfileId

  // ── Shared handlers ─────────────────────────────────────────────────────

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

  const removeService = (index: number) => {
    setServiceConfigs(serviceConfigs.filter((_, i) => i !== index))
    setEditingIndex((prev) => {
      if (prev === null || prev === index) return null
      return prev > index ? prev - 1 : prev
    })
    setConfirmDeleteIdx(null)
  }

  const close = () => {
    setWizardOpen(false)
    setStep('config')
    setName('')
    setRootPath('')
    setSelectedResults(new Set())
    setServiceConfigs([])
    setEditingIndex(null)
    setEditScanMode(false)
    setEditScanResults(new Set())
    setConfirmDeleteIdx(null)
    // Reset editingProfileId
    useDevManagerStore.setState({ editingProfileId: null })
  }

  // ── Create mode handlers ────────────────────────────────────────────────

  const handleScan = async () => {
    if (!rootPath) return
    setStep('scan')
    try {
      await scanDirectory(rootPath)
    } catch {
      // scanDirectory gère déjà son propre état scanning
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
    close()
  }

  // ── Edit mode handlers ──────────────────────────────────────────────────

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
    // Try to auto-detect service type
    const detected = dir ? await detectService(workingDir) : null
    const service = detected
      ? scanResultToConfig(detected)
      : { ...newEmptyService(workingDir), name: dir ? folderName : '' }
    setServiceConfigs([...serviceConfigs, service])
    setEditingIndex(serviceConfigs.length)
  }

  const handleSave = () => {
    if (!editingProfileId || !name.trim()) return
    updateProfile(editingProfileId, name.trim(), serviceConfigs)
    close()
  }

  // ── Render ──────────────────────────────────────────────────────────────

  if (isEditMode) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
        <div className="w-full max-w-lg rounded-2xl border border-border bg-card shadow-2xl">
          {/* Header */}
          <div className="flex items-center justify-between border-b border-border px-6 py-4">
            <h2 className="text-lg font-semibold">Modifier le profil</h2>
            <button onClick={close} className="rounded-lg p-1 hover:bg-muted">
              <X className="h-4 w-4" />
            </button>
          </div>

          {/* Body */}
          <div className="px-6 py-5 space-y-4">
            {/* Profile name */}
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

            {/* Services list */}
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
                    <div className="flex items-center gap-2 py-4 justify-center">
                      <Loader2 className="h-4 w-4 animate-spin text-primary" />
                      <span className="text-xs text-muted-foreground">Scan en cours...</span>
                    </div>
                  ) : (
                    <>
                      <div className="flex items-center justify-between mb-2">
                        <p className="text-xs text-muted-foreground">
                          {(() => {
                            const existingDirs = new Set(serviceConfigs.map((s) => s.workingDir))
                            const newCount = scanResults.filter((r) => !existingDirs.has(r.workingDir)).length
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
                              <Badge variant={typeBadgeVariant[result.type]} className="shrink-0 text-[9px]">
                                {typeLabels[result.type]}
                              </Badge>
                            </button>
                          ))}
                        {scanResults.filter((r) => !serviceConfigs.some((s) => s.workingDir === r.workingDir)).length === 0 && (
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

          {/* Footer */}
          <div className="flex items-center justify-between border-t border-border px-6 py-4">
            <p className="text-[10px] text-muted-foreground">{serviceConfigs.length} service(s)</p>
            <div className="flex items-center gap-2">
              <Button variant="ghost" onClick={close}>
                Annuler
              </Button>
              <Button disabled={!name.trim()} onClick={handleSave}>
                <Check className="mr-1.5 h-3.5 w-3.5" />
                Enregistrer
              </Button>
            </div>
          </div>
        </div>
      </div>
    )
  }

  // ── Create mode ─────────────────────────────────────────────────────────

  const steps: CreateStep[] = ['config', 'scan', 'select', 'configure']

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="w-full max-w-lg rounded-2xl border border-border bg-card shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border px-6 py-4">
          <h2 className="text-lg font-semibold">Nouveau profil Dev</h2>
          <button onClick={close} className="rounded-lg p-1 hover:bg-muted">
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Body */}
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

          {/* Step: Config */}
          {step === 'config' && (
            <div className="space-y-4">
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
                <label className="mb-1.5 block text-xs font-medium text-muted-foreground">
                  Répertoire racine
                </label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={rootPath}
                    onChange={(e) => setRootPath(e.target.value)}
                    placeholder="C:\Users\...\workspace"
                    className="flex-1 rounded-lg border border-border bg-input px-3 py-2 text-sm font-mono focus:border-primary focus:outline-none"
                  />
                  <Button variant="outline" size="default" onClick={handleBrowse}>
                    <FolderOpen className="mr-1.5 h-3.5 w-3.5" />
                    Parcourir
                  </Button>
                </div>
                <p className="mt-1 text-[10px] text-muted-foreground">
                  Scan récursif à 2 niveaux de profondeur
                </p>
              </div>
            </div>
          )}

          {/* Step: Scan */}
          {step === 'scan' && (
            <div className="flex flex-col items-center justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
              <p className="mt-3 text-sm text-muted-foreground">Scan des services...</p>
              <p className="mt-1 text-xs text-muted-foreground">{rootPath}</p>
            </div>
          )}

          {/* Step: Select */}
          {step === 'select' && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-sm text-muted-foreground">
                  <span className="font-medium text-foreground">{scanResults.length}</span> services
                  détectés
                </p>
                <Button variant="ghost" size="sm" onClick={toggleAll}>
                  {selectedResults.size === scanResults.length
                    ? 'Tout décocher'
                    : 'Tout cocher'}
                </Button>
              </div>
              <div className="max-h-64 space-y-1 overflow-auto rounded-lg border border-border p-1.5">
                {scanResults.map((result) => (
                  <button
                    key={result.workingDir}
                    onClick={() => toggleResult(result.workingDir)}
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
          )}

          {/* Step: Configure */}
          {step === 'configure' && (
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">
                Configurez vos services (optionnel)
              </p>
              <div className="max-h-72 space-y-1 overflow-auto rounded-lg border border-border p-1.5">
                {serviceConfigs.map((config, i) => (
                  <div key={config.id}>
                    <button
                      onClick={() => setEditingIndex(editingIndex === i ? null : i)}
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
                          onChange={(updated) => updateConfig(i, updated)}
                          compact
                        />
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 border-t border-border px-6 py-4">
          <Button variant="ghost" onClick={close}>
            Annuler
          </Button>
          {step === 'config' && (
            <Button
              disabled={!name.trim() || !rootPath.trim()}
              onClick={handleScan}
            >
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
                    close()
                  }
                }}
              >
                Créer sans configurer
              </Button>
              <Button
                disabled={selectedResults.size === 0}
                onClick={handleGoToConfigure}
              >
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
    </div>
  )
}
