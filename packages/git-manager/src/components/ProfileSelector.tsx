import { useEffect, useState, useRef } from 'react'
import { ChevronDown, Plus, Trash2, FolderGit2 } from 'lucide-react'
import { Button } from '@shared/components/ui/button'
import { cn } from '@shared/lib/utils'
import { useGitManagerStore } from '../store'

export function ProfileSelector() {
  const { profiles, activeProfileId, setActiveProfile, deleteProfile, setWizardOpen, loadProfiles } =
    useGitManagerStore()
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    loadProfiles()
  }, [loadProfiles])

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const activeProfile = profiles.find((p) => p.id === activeProfileId)

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-2 rounded-lg border border-border bg-secondary px-3 py-1.5 text-sm transition-colors hover:bg-muted"
      >
        <FolderGit2 className="h-3.5 w-3.5 text-primary" />
        <span className="max-w-[180px] truncate">
          {activeProfile ? activeProfile.name : 'Aucun profil'}
        </span>
        <ChevronDown className={cn('h-3.5 w-3.5 transition-transform', open && 'rotate-180')} />
      </button>

      {open && (
        <div className="absolute left-0 top-full z-50 mt-1 w-64 rounded-xl border border-border bg-card p-1.5 shadow-xl">
          {profiles.length === 0 && (
            <p className="px-3 py-2 text-xs text-muted-foreground">Aucun profil configure</p>
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
              <button
                className="min-w-0 flex-1 text-left"
                onClick={() => {
                  setActiveProfile(profile.id)
                  setOpen(false)
                }}
              >
                <p className="truncate text-sm font-medium">{profile.name}</p>
                <p className="truncate text-[10px] text-muted-foreground">
                  {profile.repoPaths.length} repos · {profile.rootPath}
                </p>
              </button>
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  deleteProfile(profile.id)
                }}
                className="ml-2 hidden rounded p-1 text-muted-foreground hover:bg-destructive/10 hover:text-destructive group-hover:block"
              >
                <Trash2 className="h-3 w-3" />
              </button>
            </div>
          ))}
          <div className="mt-1 border-t border-border pt-1">
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
          </div>
        </div>
      )}
    </div>
  )
}
