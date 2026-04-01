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
  Server
} from 'lucide-react'
import { Button } from '@shared/components/ui/button'
import { cn } from '@shared/lib/utils'
import { useDbExplorerStore } from '../store'
import type { DbConnectionEntry } from '@shared/types'
import type { PublicProfile } from '../services/db-ipc'

function generateId(): string {
  return crypto.randomUUID()
}

const defaultConnection = (): DbConnectionEntry => ({
  id: generateId(),
  name: '',
  host: 'localhost',
  port: 5432,
  database: '',
  username: 'postgres',
  password: '',
  type: 'postgresql'
})

const defaultProfile = (): PublicProfile => ({
  id: generateId(),
  name: '',
  connections: [defaultConnection()],
  createdAt: Date.now()
})

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
    const p = defaultProfile()
    setEditing(p)
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
    // Test all connections first, then activate
    await testAllConnections(profile.connections)
    const anySuccess = profile.connections.some(
      (c) => connectionStates[c.id]?.status === 'connected'
    )
    if (anySuccess) {
      setActiveProfileId(profile.id)
      // Connect to first successful
      const first = profile.connections.find(
        (c) => connectionStates[c.id]?.status === 'connected'
      )
      if (first) await connectToDb(first)
    }
  }

  // ── Connection editor helpers ─────────────────────────────────────────

  const addConnection = () => {
    if (!editing) return
    setEditing({
      ...editing,
      connections: [...editing.connections, defaultConnection()]
    })
  }

  const removeConnection = (idx: number) => {
    if (!editing || editing.connections.length <= 1) return
    setEditing({
      ...editing,
      connections: editing.connections.filter((_, i) => i !== idx)
    })
  }

  const updateConnection = (idx: number, field: keyof DbConnectionEntry, value: string | number) => {
    if (!editing) return
    const conns = [...editing.connections]
    conns[idx] = { ...conns[idx], [field]: value }
    setEditing({ ...editing, connections: conns })
  }

  // ── Render ────────────────────────────────────────────────────────────

  if (editing) {
    return (
      <div className="flex h-full flex-col">
        <div className="flex items-center justify-between border-b border-border px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
              <Database className="h-5 w-5 text-primary" />
            </div>
            <div>
              <h1 className="text-xl font-semibold">{isNew ? 'New Profile' : 'Edit Profile'}</h1>
              <p className="text-sm text-muted-foreground">Configure connections for this profile</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={handleCancel}>
              <X className="mr-1.5 h-3.5 w-3.5" />
              Cancel
            </Button>
            <Button size="sm" onClick={handleSave} disabled={!editing.name.trim()}>
              <Check className="mr-1.5 h-3.5 w-3.5" />
              Save
            </Button>
          </div>
        </div>

        <div className="flex-1 overflow-auto p-6">
          {/* Profile name */}
          <div className="mb-6">
            <label className="mb-1.5 block text-sm font-medium">Profile Name</label>
            <input
              type="text"
              value={editing.name}
              onChange={(e) => setEditing({ ...editing, name: e.target.value })}
              placeholder="e.g. Zeitune Dev"
              className="h-9 w-full max-w-md rounded-lg border border-border bg-background px-3 font-mono text-sm outline-none transition-colors focus:border-primary"
            />
          </div>

          {/* Connections */}
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-sm font-medium">Connections ({editing.connections.length})</h2>
            <Button variant="ghost" size="sm" onClick={addConnection}>
              <Plus className="mr-1.5 h-3.5 w-3.5" />
              Add Connection
            </Button>
          </div>

          <div className="space-y-3">
            {editing.connections.map((conn, idx) => (
              <ConnectionEditor
                key={conn.id}
                conn={conn}
                index={idx}
                canDelete={editing.connections.length > 1}
                onUpdate={updateConnection}
                onRemove={removeConnection}
                onTest={testConnection}
                testState={connectionStates[conn.id]}
              />
            ))}
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b border-border px-6 py-4">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
            <Database className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h1 className="text-xl font-semibold">DB Explorer</h1>
            <p className="text-sm text-muted-foreground">Manage database connection profiles</p>
          </div>
        </div>
        <Button size="sm" onClick={handleCreate}>
          <Plus className="mr-1.5 h-3.5 w-3.5" />
          New Profile
        </Button>
      </div>

      <div className="flex-1 overflow-auto p-6">
        {profiles.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-muted">
              <Server className="h-8 w-8 text-muted-foreground" />
            </div>
            <h2 className="mb-1 text-lg font-medium">No profiles yet</h2>
            <p className="mb-6 text-sm text-muted-foreground">
              Create a profile to group your database connections
            </p>
            <Button onClick={handleCreate}>
              <Plus className="mr-1.5 h-4 w-4" />
              Create Profile
            </Button>
          </div>
        ) : (
          <div className="grid gap-3">
            {profiles.map((profile) => (
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
                    <p className="text-xs text-muted-foreground">
                      {profile.connections.length} connection{profile.connections.length > 1 ? 's' : ''}
                      {' · '}
                      {profile.connections.map((c) => c.database).join(', ')}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                  <Button variant="ghost" size="icon" onClick={() => handleEdit(profile)} title="Edit">
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <Button variant="ghost" size="icon" onClick={() => handleDuplicate(profile)} title="Duplicate">
                    <Copy className="h-4 w-4" />
                  </Button>
                  <Button variant="ghost" size="icon" onClick={() => handleDelete(profile.id)} title="Delete">
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                  <Button size="sm" className="ml-2" onClick={() => handleConnect(profile)}>
                    <Zap className="mr-1.5 h-3.5 w-3.5" />
                    Connect
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

// ── Connection Editor Row ───────────────────────────────────────────────────

function ConnectionEditor({
  conn,
  index,
  canDelete,
  onUpdate,
  onRemove,
  onTest,
  testState
}: {
  conn: DbConnectionEntry
  index: number
  canDelete: boolean
  onUpdate: (idx: number, field: keyof DbConnectionEntry, value: string | number) => void
  onRemove: (idx: number) => void
  onTest: (conn: DbConnectionEntry) => Promise<unknown>
  testState?: { status: string; testResult?: { success: boolean; message: string; serverVersion?: string } }
}) {
  const isTesting = testState?.status === 'testing'
  const statusIcon = testState?.status === 'connected' ? (
    <CircleDot className="h-4 w-4 text-green-500" />
  ) : testState?.status === 'error' ? (
    <CircleDot className="h-4 w-4 text-destructive" />
  ) : null

  return (
    <div className="rounded-xl border border-border bg-card/50 p-4">
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          {statusIcon}
          <span className="text-sm font-medium">Connection #{index + 1}</span>
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
            disabled={isTesting}
          >
            {isTesting ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Zap className="mr-1.5 h-3.5 w-3.5" />}
            Test
          </Button>
          {canDelete && (
            <Button variant="ghost" size="icon" onClick={() => onRemove(index)}>
              <Trash2 className="h-3.5 w-3.5 text-destructive" />
            </Button>
          )}
        </div>
      </div>

      {testState?.status === 'error' && testState?.testResult && (
        <div className="mb-3 rounded-lg bg-destructive/10 px-3 py-2 text-xs text-destructive">
          {testState.testResult.message}
        </div>
      )}

      <div className="grid grid-cols-2 gap-3">
        <Field label="Name" value={conn.name} onChange={(v) => onUpdate(index, 'name', v)} placeholder="e.g. olive_auth" />
        <Field label="Database" value={conn.database} onChange={(v) => onUpdate(index, 'database', v)} placeholder="database name" />
        <Field label="Host" value={conn.host} onChange={(v) => onUpdate(index, 'host', v)} placeholder="localhost" />
        <Field label="Port" value={String(conn.port)} onChange={(v) => onUpdate(index, 'port', parseInt(v) || 5432)} placeholder="5432" type="number" />
        <Field label="Username" value={conn.username} onChange={(v) => onUpdate(index, 'username', v)} placeholder="postgres" />
        <Field label="Password" value={conn.password} onChange={(v) => onUpdate(index, 'password', v)} placeholder="••••••" type="password" />
      </div>
    </div>
  )
}

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
