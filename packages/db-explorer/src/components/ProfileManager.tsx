import { useState, useEffect } from 'react'
import {
  Database,
  Plus,
  Trash2,
  Copy,
  Pencil,
  Check,
  X,
  Loader2,
  CircleDot,
  Zap,
  Server,
  FolderOpen,
  HardDrive
} from 'lucide-react'
import { Button } from '@shared/components/ui/button'
import { cn } from '@shared/lib/utils'
import { useDbExplorerStore } from '../store'
import type { DbConnectionEntry, DbType } from '@shared/types'
import type { PublicProfile } from '../services/db-ipc'

function generateId(): string {
  return crypto.randomUUID()
}

const DB_TYPE_CONFIG: Record<DbType, {
  label: string
  icon: typeof Database
  color: string
  bg: string
  border: string
  defaultPort: number
  defaultUser: string
  defaultHost: string
}> = {
  postgresql: {
    label: 'PostgreSQL',
    icon: Database,
    color: 'text-blue-400',
    bg: 'bg-blue-500/10',
    border: 'border-blue-500/30',
    defaultPort: 5432,
    defaultUser: 'postgres',
    defaultHost: 'localhost'
  },
  mysql: {
    label: 'MySQL',
    icon: HardDrive,
    color: 'text-orange-400',
    bg: 'bg-orange-500/10',
    border: 'border-orange-500/30',
    defaultPort: 3306,
    defaultUser: 'root',
    defaultHost: 'localhost'
  },
  sqlite: {
    label: 'SQLite',
    icon: FolderOpen,
    color: 'text-emerald-400',
    bg: 'bg-emerald-500/10',
    border: 'border-emerald-500/30',
    defaultPort: 0,
    defaultUser: '',
    defaultHost: ''
  }
}

function makeConnection(type: DbType): DbConnectionEntry {
  const cfg = DB_TYPE_CONFIG[type]
  return {
    id: generateId(),
    name: '',
    host: cfg.defaultHost,
    port: cfg.defaultPort,
    database: '',
    username: cfg.defaultUser,
    password: '',
    type
  }
}

function defaultProfile(): PublicProfile {
  return {
    id: generateId(),
    name: '',
    connections: [makeConnection('postgresql')],
    createdAt: Date.now()
  }
}

export function ProfileManager() {
  const {
    profiles,
    loadProfiles,
    saveProfile,
    deleteProfile,
    setActiveProfileId,
    connectionStates,
    testConnection,
    testAllConnections,
    connectToDb
  } = useDbExplorerStore()

  const [editing, setEditing] = useState<PublicProfile | null>(null)
  const [isNew, setIsNew] = useState(false)

  useEffect(() => {
    loadProfiles()
  }, [])

  const handleCreate = () => {
    setEditing(defaultProfile())
    setIsNew(true)
  }

  const handleEdit = (profile: PublicProfile) => {
    setEditing({ ...profile, connections: profile.connections.map((c) => ({ ...c })) })
    setIsNew(false)
  }

  const handleDuplicate = (profile: PublicProfile) => {
    const dup: PublicProfile = {
      ...profile,
      id: generateId(),
      name: `${profile.name} (copy)`,
      connections: profile.connections.map((c) => ({ ...c, id: generateId() })),
      createdAt: Date.now()
    }
    setEditing(dup)
    setIsNew(true)
  }

  const handleSave = async () => {
    if (!editing || !editing.name.trim()) return
    await saveProfile(editing)
    setEditing(null)
    setIsNew(false)
  }

  const handleCancel = () => {
    setEditing(null)
    setIsNew(false)
  }

  const handleDelete = async (id: string) => {
    await deleteProfile(id)
  }

  const handleConnect = async (profile: PublicProfile) => {
    const results = await testAllConnections(profile.connections)
    const first = profile.connections.find((c) => results[c.id]?.success)
    if (!first) return
    setActiveProfileId(profile.id)
    await connectToDb(first)
  }

  // ── Connection editor helpers ─────────────────────────────────────────

  const addConnection = () => {
    if (!editing) return
    setEditing({
      ...editing,
      connections: [...editing.connections, makeConnection('postgresql')]
    })
  }

  const removeConnection = (idx: number) => {
    if (!editing || editing.connections.length <= 1) return
    setEditing({
      ...editing,
      connections: editing.connections.filter((_, i) => i !== idx)
    })
  }

  const updateConnection = (idx: number, updates: Partial<DbConnectionEntry>) => {
    if (!editing) return
    const conns = [...editing.connections]
    conns[idx] = { ...conns[idx], ...updates }
    setEditing({ ...editing, connections: conns })
  }

  const changeConnectionType = (idx: number, newType: DbType) => {
    if (!editing) return
    const old = editing.connections[idx]
    const cfg = DB_TYPE_CONFIG[newType]
    const conns = [...editing.connections]
    conns[idx] = {
      ...old,
      type: newType,
      host: newType === 'sqlite' ? '' : (old.host || cfg.defaultHost),
      port: cfg.defaultPort,
      username: newType === 'sqlite' ? '' : (old.username || cfg.defaultUser),
      password: newType === 'sqlite' ? '' : old.password,
      database: newType === 'sqlite' ? '' : old.database
    }
    setEditing({ ...editing, connections: conns })
  }

  // ── Editor View ──────────────────────────────────────────────────────

  if (editing) {
    return (
      <div className="flex h-full flex-col">
        <div className="flex items-center justify-between border-b border-border px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
              <Database className="h-5 w-5 text-primary" />
            </div>
            <div>
              <h1 className="text-xl font-semibold">{isNew ? 'Nouveau profil' : 'Modifier le profil'}</h1>
              <p className="text-sm text-muted-foreground">Configurez vos connexions base de donnees</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={handleCancel}>
              <X className="mr-1.5 h-3.5 w-3.5" />
              Annuler
            </Button>
            <Button size="sm" onClick={handleSave} disabled={!editing.name.trim()}>
              <Check className="mr-1.5 h-3.5 w-3.5" />
              Sauvegarder
            </Button>
          </div>
        </div>

        <div className="flex-1 overflow-auto p-6 space-y-6">
          {/* Profile name */}
          <div>
            <label className="mb-1.5 block text-sm font-medium">Nom du profil</label>
            <input
              type="text"
              value={editing.name}
              onChange={(e) => setEditing({ ...editing, name: e.target.value })}
              placeholder="ex: Zeitune Dev, Production, Local..."
              autoFocus
              className="h-9 w-full max-w-md rounded-lg border border-border bg-background px-3 font-mono text-sm outline-none transition-colors focus:border-primary"
            />
          </div>

          {/* Connections */}
          <div>
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-sm font-medium">Connexions ({editing.connections.length})</h2>
              <Button variant="ghost" size="sm" onClick={addConnection}>
                <Plus className="mr-1.5 h-3.5 w-3.5" />
                Ajouter
              </Button>
            </div>

            <div className="space-y-4">
              {editing.connections.map((conn, idx) => (
                <ConnectionEditor
                  key={conn.id}
                  conn={conn}
                  index={idx}
                  canDelete={editing.connections.length > 1}
                  onUpdate={(updates) => updateConnection(idx, updates)}
                  onChangeType={(type) => changeConnectionType(idx, type)}
                  onRemove={() => removeConnection(idx)}
                  onTest={testConnection}
                  testState={connectionStates[conn.id]}
                />
              ))}
            </div>
          </div>
        </div>
      </div>
    )
  }

  // ── Profile List View ────────────────────────────────────────────────

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b border-border px-6 py-4">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
            <Database className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h1 className="text-xl font-semibold">DB Explorer</h1>
            <p className="text-sm text-muted-foreground">Gerez vos profils de connexion</p>
          </div>
        </div>
        <Button size="sm" onClick={handleCreate}>
          <Plus className="mr-1.5 h-3.5 w-3.5" />
          Nouveau profil
        </Button>
      </div>

      <div className="flex-1 overflow-auto p-6">
        {profiles.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-muted">
              <Server className="h-8 w-8 text-muted-foreground" />
            </div>
            <h2 className="mb-1 text-lg font-medium">Aucun profil</h2>
            <p className="mb-6 text-sm text-muted-foreground">
              Creez un profil pour regrouper vos connexions base de donnees
            </p>
            <Button onClick={handleCreate}>
              <Plus className="mr-1.5 h-4 w-4" />
              Creer un profil
            </Button>
          </div>
        ) : (
          <div className="grid gap-3">
            {profiles.map((profile) => {
              const types = [...new Set(profile.connections.map((c) => c.type))]
              return (
                <div
                  key={profile.id}
                  className="group flex items-center justify-between rounded-xl border border-border bg-card p-4 transition-colors hover:border-border-hi"
                >
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
                      <Database className="h-5 w-5 text-primary" />
                    </div>
                    <div>
                      <h3 className="font-medium">{profile.name}</h3>
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <span>
                          {profile.connections.length} connexion{profile.connections.length > 1 ? 's' : ''}
                        </span>
                        <span>·</span>
                        <div className="flex items-center gap-1">
                          {types.map((t) => {
                            const cfg = DB_TYPE_CONFIG[t]
                            return (
                              <span key={t} className={cn('rounded px-1.5 py-0.5 text-[10px] font-medium', cfg.bg, cfg.color)}>
                                {cfg.label}
                              </span>
                            )
                          })}
                        </div>
                        <span>·</span>
                        <span>{profile.connections.map((c) => c.database || c.name).filter(Boolean).join(', ')}</span>
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                    <Button variant="ghost" size="icon" onClick={() => handleEdit(profile)} title="Modifier">
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="icon" onClick={() => handleDuplicate(profile)} title="Dupliquer">
                      <Copy className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="icon" onClick={() => handleDelete(profile.id)} title="Supprimer">
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                    <Button size="sm" className="ml-2" onClick={() => handleConnect(profile)}>
                      <Zap className="mr-1.5 h-3.5 w-3.5" />
                      Connecter
                    </Button>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}

// ── DB Type Selector ────────────────────────────────────────────────────────

function DbTypeSelector({ value, onChange }: { value: DbType; onChange: (t: DbType) => void }) {
  return (
    <div className="flex gap-2">
      {(Object.entries(DB_TYPE_CONFIG) as [DbType, typeof DB_TYPE_CONFIG[DbType]][]).map(([type, cfg]) => {
        const Icon = cfg.icon
        const active = value === type
        return (
          <button
            key={type}
            type="button"
            onClick={() => onChange(type)}
            className={cn(
              'flex items-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium transition-all cursor-pointer',
              active
                ? cn(cfg.border, cfg.bg, cfg.color, 'shadow-sm')
                : 'border-border bg-background text-muted-foreground hover:border-border-hi hover:text-foreground'
            )}
          >
            <Icon className="h-4 w-4" />
            {cfg.label}
          </button>
        )
      })}
    </div>
  )
}

// ── Connection Editor ───────────────────────────────────────────────────────

function ConnectionEditor({
  conn,
  index,
  canDelete,
  onUpdate,
  onChangeType,
  onRemove,
  onTest,
  testState
}: {
  conn: DbConnectionEntry
  index: number
  canDelete: boolean
  onUpdate: (updates: Partial<DbConnectionEntry>) => void
  onChangeType: (type: DbType) => void
  onRemove: () => void
  onTest: (conn: DbConnectionEntry) => Promise<unknown>
  testState?: { status: string; testResult?: { success: boolean; message: string; serverVersion?: string } }
}) {
  const isTesting = testState?.status === 'testing'
  const cfg = DB_TYPE_CONFIG[conn.type]
  const statusIcon = testState?.status === 'connected' ? (
    <CircleDot className="h-4 w-4 text-green-500" />
  ) : testState?.status === 'error' ? (
    <CircleDot className="h-4 w-4 text-destructive" />
  ) : null

  return (
    <div className={cn('rounded-xl border bg-card/50 p-4 transition-colors', cfg.border)}>
      {/* Header */}
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          {statusIcon}
          <span className="text-sm font-medium">Connexion #{index + 1}</span>
          {testState?.testResult?.serverVersion && (
            <span className="text-xs text-muted-foreground">
              {testState.testResult.serverVersion.split(' ').slice(0, 2).join(' ')}
            </span>
          )}
        </div>
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onTest(conn)}
            disabled={isTesting || (conn.type !== 'sqlite' && !conn.database)}
          >
            {isTesting ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Zap className="mr-1.5 h-3.5 w-3.5" />}
            Tester
          </Button>
          {canDelete && (
            <Button variant="ghost" size="icon" onClick={onRemove}>
              <Trash2 className="h-3.5 w-3.5 text-destructive" />
            </Button>
          )}
        </div>
      </div>

      {/* Error message */}
      {testState?.status === 'error' && testState?.testResult && (
        <div className="mb-3 rounded-lg bg-destructive/10 px-3 py-2 text-xs text-destructive">
          {testState.testResult.message}
        </div>
      )}

      {/* Success message */}
      {testState?.status === 'connected' && testState?.testResult && (
        <div className="mb-3 rounded-lg bg-green-500/10 px-3 py-2 text-xs text-green-500">
          Connexion reussie {testState.testResult.serverVersion ? `— ${testState.testResult.serverVersion}` : ''}
        </div>
      )}

      {/* Type selector */}
      <div className="mb-3">
        <label className="mb-1.5 block text-xs text-muted-foreground">Type de base</label>
        <DbTypeSelector value={conn.type} onChange={onChangeType} />
      </div>

      {/* Fields */}
      {conn.type === 'sqlite' ? (
        <div>
          <label className="mb-1 block text-xs text-muted-foreground">Fichier de base de donnees</label>
          <div className="flex gap-1.5">
            <input
              type="text"
              value={conn.database}
              onChange={(e) => onUpdate({ database: e.target.value })}
              placeholder="Selectionnez un fichier .db / .sqlite..."
              className="h-8 flex-1 rounded-md border border-border bg-background px-2.5 font-mono text-sm outline-none transition-colors focus:border-primary"
            />
            <Button
              variant="ghost"
              size="sm"
              className="h-8 shrink-0 px-2.5"
              onClick={async () => {
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                const filePath = await (window as any).electron.ipcRenderer.invoke('dialog:openFile', {
                  title: 'Select SQLite database',
                  filters: [
                    { name: 'SQLite Database', extensions: ['db', 'sqlite', 'sqlite3'] },
                    { name: 'All Files', extensions: ['*'] }
                  ]
                })
                if (filePath) onUpdate({ database: filePath })
              }}
            >
              <FolderOpen className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          {/* Row 1: Name + Database */}
          <div className="grid grid-cols-2 gap-3">
            <Field
              label="Nom (optionnel)"
              value={conn.name}
              onChange={(v) => onUpdate({ name: v })}
              placeholder="ex: auth, exploitation..."
            />
            <Field
              label="Base de donnees"
              value={conn.database}
              onChange={(v) => onUpdate({ database: v })}
              placeholder={conn.type === 'mysql' ? 'my_database' : 'olive_auth'}
            />
          </div>
          {/* Row 2: Host + Port */}
          <div className="grid grid-cols-[1fr_100px] gap-3">
            <Field
              label="Hote"
              value={conn.host}
              onChange={(v) => onUpdate({ host: v })}
              placeholder={cfg.defaultHost}
            />
            <Field
              label="Port"
              value={String(conn.port)}
              onChange={(v) => onUpdate({ port: parseInt(v) || cfg.defaultPort })}
              placeholder={String(cfg.defaultPort)}
              type="number"
            />
          </div>
          {/* Row 3: Username + Password */}
          <div className="grid grid-cols-2 gap-3">
            <Field
              label="Utilisateur"
              value={conn.username}
              onChange={(v) => onUpdate({ username: v })}
              placeholder={cfg.defaultUser}
            />
            <Field
              label="Mot de passe"
              value={conn.password}
              onChange={(v) => onUpdate({ password: v })}
              placeholder="••••••"
              type="password"
            />
          </div>
        </div>
      )}
    </div>
  )
}

// ── Field ───────────────────────────────────────────────────────────────────

function Field({
  label,
  value,
  onChange,
  placeholder,
  type = 'text'
}: {
  label: string
  value: string
  onChange: (v: string) => void
  placeholder?: string
  type?: string
}) {
  return (
    <div>
      <label className="mb-1 block text-xs text-muted-foreground">{label}</label>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="h-8 w-full rounded-md border border-border bg-background px-2.5 font-mono text-sm outline-none transition-colors focus:border-primary"
      />
    </div>
  )
}
