import { useState } from 'react'
import { X, FolderOpen, Search, Check, Loader2 } from 'lucide-react'
import { Button } from '@shared/components/ui/button'
import { Badge } from '@shared/components/ui/badge'
import { cn } from '@shared/lib/utils'
import { useGitManagerStore } from '../store'
import { openDirectoryDialog } from '../services/git-ipc'
import type { ScanResult } from '../types'

type Step = 'config' | 'scan' | 'select'

export function ProfileWizard() {
  const { wizardOpen, setWizardOpen, scanning, scanResults, scanDirectory, createProfile } =
    useGitManagerStore()

  const [step, setStep] = useState<Step>('config')
  const [name, setName] = useState('')
  const [rootPath, setRootPath] = useState('')
  const [selectedPaths, setSelectedPaths] = useState<Set<string>>(new Set())

  if (!wizardOpen) return null

  const handleBrowse = async () => {
    const dir = await openDirectoryDialog()
    if (dir) setRootPath(dir)
  }

  const handleScan = async () => {
    if (!rootPath) return
    await scanDirectory(rootPath)
    setStep('select')
    // Pre-select all found repos
    setSelectedPaths(new Set(scanResults.map((r: ScanResult) => r.path)))
  }

  const toggleRepo = (path: string) => {
    const next = new Set(selectedPaths)
    if (next.has(path)) next.delete(path)
    else next.add(path)
    setSelectedPaths(next)
  }

  const toggleAll = () => {
    if (selectedPaths.size === scanResults.length) {
      setSelectedPaths(new Set())
    } else {
      setSelectedPaths(new Set(scanResults.map((r) => r.path)))
    }
  }

  const handleCreate = () => {
    if (!name.trim() || selectedPaths.size === 0) return
    createProfile(name.trim(), rootPath, Array.from(selectedPaths))
    // Reset
    setStep('config')
    setName('')
    setRootPath('')
    setSelectedPaths(new Set())
  }

  const close = () => {
    setWizardOpen(false)
    setStep('config')
    setName('')
    setRootPath('')
    setSelectedPaths(new Set())
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="w-full max-w-lg rounded-2xl border border-border bg-card shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border px-6 py-4">
          <h2 className="text-lg font-semibold">Nouveau profil</h2>
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
                  <span className="font-medium text-foreground">{scanResults.length}</span> repos
                  trouves
                </p>
                <Button variant="ghost" size="sm" onClick={toggleAll}>
                  {selectedPaths.size === scanResults.length
                    ? 'Tout decocher'
                    : 'Tout cocher'}
                </Button>
              </div>
              <div className="max-h-64 space-y-1 overflow-auto rounded-lg border border-border p-1.5">
                {scanResults.map((repo) => (
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
                      <p className="truncate text-sm font-medium">{repo.name}</p>
                      <p className="truncate text-[10px] text-muted-foreground">{repo.path}</p>
                    </div>
                  </button>
                ))}
                {scanResults.length === 0 && (
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
            <Button disabled={selectedPaths.size === 0} onClick={handleCreate}>
              <Check className="mr-1.5 h-3.5 w-3.5" />
              Creer le profil ({selectedPaths.size} repos)
            </Button>
          )}
        </div>
      </div>
    </div>
  )
}
