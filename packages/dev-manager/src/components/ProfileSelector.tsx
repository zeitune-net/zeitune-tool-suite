import { useEffect, useState, useRef } from 'react'
import { ChevronDown, Plus, Trash2, Code2, Download, Upload, Pencil } from 'lucide-react'
import { Button } from '@shared/components/ui/button'
import { cn } from '@shared/lib/utils'
import { useDevManagerStore } from '../store'

export function ProfileSelector() {
  const {
    profiles,
    activeProfileId,
    services,
    setActiveProfile,
    deleteProfile,
    setWizardOpen,
    openEditProfile,
    loadProfiles,
    exportProfile,
    importProfile
  } = useDevManagerStore()
  const [open, setOpen] = useState(false)
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    loadProfiles()
  }, [loadProfiles])

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false)
        setConfirmDeleteId(null)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  useEffect(() => {
    if (!open) return
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpen(false)
        setConfirmDeleteId(null)
      }
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [open])

  const activeProfile = profiles.find((p) => p.id === activeProfileId)

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-2 rounded-lg border border-border bg-secondary px-3 py-1.5 text-sm transition-colors hover:bg-muted"
      >
        <Code2 className="h-3.5 w-3.5 text-primary" />
        <span className="max-w-[180px] truncate">
          {activeProfile ? activeProfile.name : 'Aucun profil'}
        </span>
        <ChevronDown className={cn('h-3.5 w-3.5 transition-transform', open && 'rotate-180')} />
      </button>

      {open && (
        <div className="absolute right-0 top-full z-50 mt-1 w-64 rounded-xl border border-border bg-card p-1.5 shadow-xl">
          {profiles.length === 0 && (
            <p className="px-3 py-2 text-xs text-muted-foreground">Aucun profil configuré</p>
          )}
          {profiles.map((profile) => (
            <div
              key={profile.id}
              className={cn(
                'group flex items-center justify-between rounded-lg px-3 py-2 transition-colors',
                profile.id === activeProfileId
                  ? 'bg-primary/10 text-foreground'
                  : 'text-muted-foreground hover:bg-muted hover:text-foreground'
              )}
            >
              {confirmDeleteId === profile.id ? (
                <div className="flex w-full items-center justify-between">
                  <div>
                    <span className="text-xs text-destructive">Supprimer ?</span>
                    {profile.id === activeProfileId && services.some((s) => s.status !== 'stopped') && (
                      <p className="text-[9px] text-destructive/80">Des services sont en cours</p>
                    )}
                  </div>
                  <div className="flex items-center gap-1">
                    <Button
                      variant="destructive"
                      size="sm"
                      className="h-6 px-2 text-[10px]"
                      onClick={(e) => {
                        e.stopPropagation()
                        deleteProfile(profile.id)
                        setConfirmDeleteId(null)
                      }}
                    >
                      Oui
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-6 px-2 text-[10px]"
                      onClick={(e) => {
                        e.stopPropagation()
                        setConfirmDeleteId(null)
                      }}
                    >
                      Non
                    </Button>
                  </div>
                </div>
              ) : (
                <>
                  <button
                    className="min-w-0 flex-1 text-left"
                    onClick={() => {
                      setActiveProfile(profile.id)
                      setOpen(false)
                    }}
                  >
                    <p className="truncate text-sm font-medium">{profile.name}</p>
                    <p className="truncate text-[10px] text-muted-foreground">
                      {profile.services.length} services · {profile.rootPath}
                    </p>
                  </button>
                  <div className="ml-2 hidden items-center gap-0.5 group-hover:flex">
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        openEditProfile(profile.id)
                        setOpen(false)
                      }}
                      className="rounded p-1 text-muted-foreground hover:bg-primary/10 hover:text-primary"
                    >
                      <Pencil className="h-3 w-3" />
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        setConfirmDeleteId(profile.id)
                      }}
                      className="rounded p-1 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                    >
                      <Trash2 className="h-3 w-3" />
                    </button>
                  </div>
                </>
              )}
            </div>
          ))}
          <div className="mt-1 border-t border-border pt-1 space-y-0.5">
            <Button
              variant="ghost"
              size="sm"
              className="w-full justify-start"
              onClick={() => {
                setWizardOpen(true)
                setOpen(false)
              }}
            >
              <Plus className="mr-1.5 h-3.5 w-3.5" />
              Nouveau profil
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="w-full justify-start"
              onClick={() => {
                exportProfile()
                setOpen(false)
              }}
              disabled={!activeProfileId}
            >
              <Download className="mr-1.5 h-3.5 w-3.5" />
              Exporter le profil
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="w-full justify-start"
              onClick={() => {
                importProfile()
                setOpen(false)
              }}
            >
              <Upload className="mr-1.5 h-3.5 w-3.5" />
              Importer un profil
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
