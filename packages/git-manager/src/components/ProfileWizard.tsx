import { useState, useEffect, useMemo } from 'react'
import { X, FolderOpen, Search, Check, Loader2, RotateCcw, Plus } from 'lucide-react'
import { Button } from '@shared/components/ui/button'
import { Badge } from '@shared/components/ui/badge'
import { cn } from '@shared/lib/utils'
import { useGitManagerStore } from '../store'
import { openDirectoryDialog } from '../services/git-ipc'
import type { ScanResult } from '../types'

type Step = 'config' | 'scan' | 'select'

export function ProfileWizard() {
  const {
    wizardOpen,
    editingProfileId,
    profiles,
    scanning,
    scanResults,
    scanDirectory,
    createProfile,
    updateProfile,
    setWizardOpen
  } = useGitManagerStore()

  const isEditing = editingProfileId !== null
  const editingProfile = isEditing ? profiles.find((p) => p.id === editingProfileId) : null

  const [step, setStep] = useState<Step>('config')
  const [name, setName] = useState('')
  const [rootPath, setRootPath] = useState('')
  const [selectedPaths, setSelectedPaths] = useState<Set<string>>(new Set())
  const [manualRepos, setManualRepos] = useState<ScanResult[]>([])
  const [hasScanned, setHasScanned] = useState(false)

  // Combine scan results + manual repos (deduplicated)
  const allRepos = useMemo(() => {
    const scannedPaths = new Set(scanResults.map((r) => r.path))
    const extra = manualRepos.filter((m) => !scannedPaths.has(m.path))
    return [...scanResults, ...extra]
  }, [scanResults, manualRepos])

  // Initialize form when editing
  useEffect(() => {
    if (wizardOpen && editingProfile) {
      setName(editingProfile.name)
      setRootPath(editingProfile.rootPath)
      setSelectedPaths(new Set(editingProfile.repoPaths))
      setManualRepos([])
      setStep('config')
      setHasScanned(false)
    }
  }, [wizardOpen, editingProfile])

  // When scan completes, update selections
  useEffect(() => {
    if (step === 'select' && scanResults.length > 0) {
      if (isEditing && editingProfile) {
        const existingPaths = new Set(editingProfile.repoPaths)
        const allPaths = new Set(scanResults.map((r: ScanResult) => r.path))
        if (!hasScanned) {
          setSelectedPaths(allPaths)
        } else {
          setSelectedPaths((prev) => {
            const next = new Set(prev)
            for (const p of allPaths) {
              if (!existingPaths.has(p) && !prev.has(p)) {
                next.add(p)
              }
            }
            for (const p of next) {
              if (!allPaths.has(p) && !manualRepos.some((m) => m.path === p)) {
                next.delete(p)
              }
            }
            return next
          })
        }
        setHasScanned(true)
      } else {
        setSelectedPaths((prev) => {
          const next = new Set(scanResults.map((r: ScanResult) => r.path))
          // Keep manually added selections
          for (const m of manualRepos) {
            if (prev.has(m.path)) next.add(m.path)
          }
          return next
        })
      }
    }
  }, [step, scanResults])

  if (!wizardOpen) return null

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

  const handleScan = async () => {
    if (!rootPath) return
    await scanDirectory(rootPath)
    setStep('select')
  }

  const handleAddManual = async () => {
    const dir = await openDirectoryDialog()
    if (!dir) return
    // Check not already in list
    if (allRepos.some((r) => r.path === dir)) {
      // Just select it if it exists
      setSelectedPaths((prev) => new Set([...prev, dir]))
      return
    }
    const repoName = dir.replace(/[\\/]+$/, '').split(/[\\/]/).pop() || dir
    const newRepo: ScanResult = { path: dir, name: repoName }
    setManualRepos((prev) => [...prev, newRepo])
    setSelectedPaths((prev) => new Set([...prev, dir]))
  }

  const toggleRepo = (path: string) => {
    const next = new Set(selectedPaths)
    if (next.has(path)) next.delete(path)
    else next.add(path)
    setSelectedPaths(next)
  }

  const toggleAll = () => {
    if (selectedPaths.size === allRepos.length) {
      setSelectedPaths(new Set())
    } else {
      setSelectedPaths(new Set(allRepos.map((r) => r.path)))
    }
  }

  const handleSubmit = () => {
    if (!name.trim() || selectedPaths.size === 0) return
    if (isEditing && editingProfileId) {
      updateProfile(editingProfileId, name.trim(), rootPath, Array.from(selectedPaths))
    } else {
      createProfile(name.trim(), rootPath, Array.from(selectedPaths))
    }
    resetForm()
  }

  const resetForm = () => {
    setStep('config')
    setName('')
    setRootPath('')
    setSelectedPaths(new Set())
    setManualRepos([])
    setHasScanned(false)
  }

  const close = () => {
    setWizardOpen(false)
    resetForm()
  }

  const isManualRepo = (path: string) =>
    manualRepos.some((m) => m.path === path) && !scanResults.some((r) => r.path === path)

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="w-full max-w-lg rounded-2xl border border-border bg-card shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border px-6 py-4">
          <h2 className="text-lg font-semibold">
            {isEditing ? 'Modifier le profil' : 'Nouveau profil'}
          </h2>
          <button onClick={close} className="rounded-lg p-1 hover:bg-muted">
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Body */}
        <div className="px-6 py-5">
          {/* Step indicators */}
          <div className="mb-6 flex items-center gap-2">
            {(['config', 'scan', 'select'] as Step[]).map((s, i) => (
              <div key={s} className="flex items-center gap-2">
                <div
                  className={cn(
                    'flex h-6 w-6 items-center justify-center rounded-full text-[10px] font-bold',
                    step === s
                      ? 'bg-primary text-white'
                      : i < ['config', 'scan', 'select'].indexOf(step)
                        ? 'bg-primary/20 text-primary'
                        : 'bg-muted text-muted-foreground'
                  )}
                >
                  {i + 1}
                </div>
                {i < 2 && <div className="h-px w-8 bg-border" />}
              </div>
            ))}
          </div>

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
                  Repertoire racine
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
                  Scan recursif a 2 niveaux de profondeur
                </p>
              </div>
            </div>
          )}

          {step === 'scan' && (
            <div className="flex flex-col items-center justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
              <p className="mt-3 text-sm text-muted-foreground">Scan des repositories...</p>
              <p className="mt-1 text-xs text-muted-foreground">{rootPath}</p>
            </div>
          )}

          {step === 'select' && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-sm text-muted-foreground">
                  <span className="font-medium text-foreground">{allRepos.length}</span> repos
                  trouves
                </p>
                <div className="flex items-center gap-1">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={handleAddManual}
                    title="Ajouter un repo manuellement"
                  >
                    <Plus className="mr-1 h-3 w-3" />
                    Ajouter
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setStep('scan')
                      handleScan()
                    }}
                    title="Re-scanner"
                  >
                    <RotateCcw className="mr-1 h-3 w-3" />
                    Re-scanner
                  </Button>
                  <Button variant="ghost" size="sm" onClick={toggleAll}>
                    {selectedPaths.size === allRepos.length
                      ? 'Tout decocher'
                      : 'Tout cocher'}
                  </Button>
                </div>
              </div>
              <div className="max-h-64 space-y-1 overflow-auto rounded-lg border border-border p-1.5">
                {allRepos.map((repo) => (
                  <button
                    key={repo.path}
                    onClick={() => toggleRepo(repo.path)}
                    className={cn(
                      'flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left transition-colors',
                      selectedPaths.has(repo.path)
                        ? 'bg-primary/8 text-foreground'
                        : 'text-muted-foreground hover:bg-muted'
                    )}
                  >
                    <div
                      className={cn(
                        'flex h-4 w-4 shrink-0 items-center justify-center rounded border transition-colors',
                        selectedPaths.has(repo.path)
                          ? 'border-primary bg-primary'
                          : 'border-border'
                      )}
                    >
                      {selectedPaths.has(repo.path) && (
                        <Check className="h-2.5 w-2.5 text-white" />
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5">
                        <p className="truncate text-sm font-medium">{repo.name}</p>
                        {isManualRepo(repo.path) && (
                          <Badge variant="muted" className="text-[8px] px-1 py-0">manuel</Badge>
                        )}
                      </div>
                      <p className="truncate text-[10px] text-muted-foreground">{repo.path}</p>
                    </div>
                  </button>
                ))}
                {allRepos.length === 0 && (
                  <p className="py-6 text-center text-xs text-muted-foreground">
                    Aucun repository Git trouve dans ce repertoire
                  </p>
                )}
              </div>
              <Badge variant="muted">{selectedPaths.size} selectionne(s)</Badge>
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
              onClick={() => {
                setStep('scan')
                handleScan()
              }}
            >
              <Search className="mr-1.5 h-3.5 w-3.5" />
              Scanner
            </Button>
          )}
          {step === 'select' && (
            <Button disabled={selectedPaths.size === 0} onClick={handleSubmit}>
              <Check className="mr-1.5 h-3.5 w-3.5" />
              {isEditing
                ? `Enregistrer (${selectedPaths.size} repos)`
                : `Creer le profil (${selectedPaths.size} repos)`}
            </Button>
          )}
        </div>
      </div>
    </div>
  )
}
