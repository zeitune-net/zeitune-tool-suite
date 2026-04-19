import { useState } from 'react'
import { Key, Link2, Hash, Database, Trash2, Loader2, AlertTriangle, Plus } from 'lucide-react'
import { cn } from '@shared/lib/utils'
import { useDbExplorerStore, type DetailTab } from '../store'
import type { DbConnectionEntry } from '@shared/types'
import { Badge } from '@shared/components/ui/badge'
import * as dbIpc from '../services/db-ipc'
import {
  CreateIndexDialog,
  CreatePrimaryKeyDialog,
  CreateForeignKeyDialog
} from './CreateConstraintDialogs'

const tabs: { id: DetailTab; label: string }[] = [
  { id: 'columns', label: 'Columns' },
  { id: 'foreignKeys', label: 'Foreign Keys' },
  { id: 'indexes', label: 'Indexes' }
]

export function TableDetails({ connection }: { connection: DbConnectionEntry }) {
  const { selectedSchema, selectedTable, tableDetails, detailTab, setDetailTab, loadTableDetails } =
    useDbExplorerStore()

  const [pending, setPending] = useState<string | null>(null) // id d'une action en cours
  const [confirmId, setConfirmId] = useState<string | null>(null) // id en confirmation
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [showCreateIndex, setShowCreateIndex] = useState(false)
  const [showCreateFk, setShowCreateFk] = useState(false)
  const [showCreatePk, setShowCreatePk] = useState(false)

  if (!selectedSchema || !selectedTable) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
        <Database className="mr-2 h-4 w-4 opacity-40" />
        Select a table to view details
      </div>
    )
  }

  const key = `${connection.id}:${selectedSchema}.${selectedTable}`
  const details = tableDetails[key]

  if (!details) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
        Loading...
      </div>
    )
  }

  const refresh = async () => {
    await loadTableDetails(connection, selectedSchema, selectedTable)
  }

  const runAction = async (id: string, fn: () => Promise<{ success: boolean; error?: string }>) => {
    setPending(id)
    setErrorMsg(null)
    try {
      const res = await fn()
      if (res.success) {
        setConfirmId(null)
        await refresh()
      } else {
        setErrorMsg(res.error || 'Échec')
      }
    } catch (e) {
      setErrorMsg(e instanceof Error ? e.message : String(e))
    } finally {
      setPending(null)
    }
  }

  const dropIndex = (indexName: string) => {
    const id = `idx:${indexName}`
    return runAction(id, () =>
      dbIpc.dropIndex({
        connection,
        schema: selectedSchema,
        table: selectedTable,
        indexName
      })
    )
  }

  const dropFk = (constraintName: string) => {
    const id = `fk:${constraintName}`
    return runAction(id, () =>
      dbIpc.dropForeignKey({
        connection,
        schema: selectedSchema,
        table: selectedTable,
        constraintName
      })
    )
  }

  const dropPk = () => {
    const id = 'pk'
    return runAction(id, () =>
      dbIpc.dropPrimaryKey({ connection, schema: selectedSchema, table: selectedTable })
    )
  }

  const canDropPk = connection.type !== 'sqlite' && (details.primaryKey?.length ?? 0) > 0
  const canDropFk = connection.type !== 'sqlite'
  const canCreateConstraint = connection.type !== 'sqlite'
  const hasNoPk = (details.primaryKey?.length ?? 0) === 0
  const cols = Array.isArray(details.columns) ? details.columns : []

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="flex items-center gap-3 border-b border-border px-4 py-3">
        <h3 className="font-medium text-sm">
          <span className="text-muted-foreground">{selectedSchema}.</span>
          {selectedTable}
        </h3>
        <Badge variant="muted" className="text-[10px]">
          ~{Number(details.rowEstimate ?? 0).toLocaleString()} rows
        </Badge>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-border px-4">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setDetailTab(tab.id)}
            className={cn(
              'border-b-2 px-3 py-2 text-xs font-medium transition-colors',
              detailTab === tab.id
                ? 'border-primary text-primary'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            )}
          >
            {tab.label}
            {tab.id === 'columns' && (
              <span className="ml-1 opacity-50">{details.columns?.length ?? 0}</span>
            )}
            {tab.id === 'foreignKeys' && (
              <span className="ml-1 opacity-50">{details.foreignKeys?.length ?? 0}</span>
            )}
            {tab.id === 'indexes' && (
              <span className="ml-1 opacity-50">{details.indexes?.length ?? 0}</span>
            )}
          </button>
        ))}
      </div>

      {errorMsg && (
        <div className="flex items-start gap-1.5 border-b border-destructive/30 bg-destructive/10 px-4 py-2 text-[11px] text-destructive">
          <AlertTriangle className="h-3 w-3 shrink-0 mt-0.5" />
          <span className="break-all">{errorMsg}</span>
          <button
            onClick={() => setErrorMsg(null)}
            className="ml-auto text-muted-foreground hover:text-foreground"
          >
            ×
          </button>
        </div>
      )}

      {/* Content */}
      <div className="flex-1 overflow-auto">
        {detailTab === 'columns' && (
          <>
            {(details.primaryKey?.length ?? 0) > 0 ? (
              <div className="flex items-center justify-between border-b border-border bg-yellow-500/5 px-4 py-2">
                <div className="flex items-center gap-1.5 text-xs min-w-0">
                  <Key className="h-3 w-3 text-yellow-500 shrink-0" />
                  <span className="font-medium">Primary Key</span>
                  <span className="font-mono text-muted-foreground break-all">
                    ({details.primaryKey.join(', ')})
                  </span>
                </div>
                {canDropPk && (
                  <DropButton
                    id="pk"
                    label="Drop PK"
                    pending={pending === 'pk'}
                    confirming={confirmId === 'pk'}
                    onRequest={() => setConfirmId('pk')}
                    onCancel={() => setConfirmId(null)}
                    onConfirm={dropPk}
                  />
                )}
              </div>
            ) : canCreateConstraint && hasNoPk ? (
              <div className="flex items-center justify-between border-b border-border bg-muted/30 px-4 py-2">
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <Key className="h-3 w-3 opacity-50" />
                  <span>Aucune Primary Key</span>
                </div>
                <button
                  onClick={() => setShowCreatePk(true)}
                  className="flex items-center gap-1 rounded bg-primary/10 px-2 py-0.5 text-[10px] font-medium text-primary hover:bg-primary/20"
                >
                  <Plus className="h-3 w-3" />
                  Ajouter PK
                </button>
              </div>
            ) : null}
            <table className="w-full text-xs">
              <thead className="sticky top-0 bg-card border-b border-border">
                <tr>
                  <th className="px-4 py-2 text-left font-medium text-muted-foreground">Name</th>
                  <th className="px-4 py-2 text-left font-medium text-muted-foreground">Type</th>
                  <th className="px-4 py-2 text-left font-medium text-muted-foreground">Nullable</th>
                  <th className="px-4 py-2 text-left font-medium text-muted-foreground">Default</th>
                </tr>
              </thead>
              <tbody>
                {(Array.isArray(details.columns) ? details.columns : []).map((col, i) => (
                  <tr key={`${col?.name ?? 'col'}-${i}`} className="border-b border-border/50">
                    <td className="px-4 py-1.5 font-mono">
                      <div className="flex items-center gap-1.5">
                        {col?.isPrimaryKey && <Key className="h-3 w-3 text-yellow-500" />}
                        <span className={col?.isPrimaryKey ? 'text-primary' : ''}>{col?.name ?? ''}</span>
                      </div>
                    </td>
                    <td className="px-4 py-1.5 font-mono text-muted-foreground">{col?.type ?? ''}</td>
                    <td className="px-4 py-1.5">
                      {col?.nullable ? (
                        <span className="text-muted-foreground">yes</span>
                      ) : (
                        <span className="text-foreground">no</span>
                      )}
                    </td>
                    <td className="px-4 py-1.5 font-mono text-muted-foreground">
                      {col?.defaultValue ?? <span className="opacity-30">—</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        )}

        {detailTab === 'foreignKeys' && (
          <div className="p-4 space-y-2">
            {canCreateConstraint && (
              <button
                onClick={() => setShowCreateFk(true)}
                className="flex w-full items-center justify-center gap-1 rounded-lg border border-dashed border-border py-2 text-[11px] text-muted-foreground transition-colors hover:border-primary/60 hover:text-foreground"
              >
                <Plus className="h-3 w-3" />
                Ajouter une Foreign Key
              </button>
            )}
            {!Array.isArray(details.foreignKeys) || details.foreignKeys.length === 0 ? (
              <p className="text-xs text-muted-foreground text-center py-4">No foreign keys</p>
            ) : (
              details.foreignKeys.map((fk, i) => {
                const name = fk?.constraintName ?? `fk_${i}`
                const id = `fk:${name}`
                return (
                  <div key={`${name}-${i}`} className="rounded-lg border border-border p-3">
                    <div className="mb-1 flex items-start gap-1.5 text-xs font-medium">
                      <Link2 className="h-3 w-3 mt-0.5 text-primary shrink-0" />
                      <span className="break-all flex-1">{name}</span>
                      {canDropFk && fk?.constraintName && (
                        <DropButton
                          id={id}
                          pending={pending === id}
                          confirming={confirmId === id}
                          onRequest={() => setConfirmId(id)}
                          onCancel={() => setConfirmId(null)}
                          onConfirm={() => dropFk(fk.constraintName)}
                        />
                      )}
                    </div>
                    <p className="font-mono text-[11px] text-muted-foreground break-all">
                      {fk?.column ?? '?'} → {fk?.referencedSchema ?? '?'}.{fk?.referencedTable ?? '?'}.{fk?.referencedColumn ?? '?'}
                    </p>
                  </div>
                )
              })
            )}
          </div>
        )}

        {detailTab === 'indexes' && (
          <div className="p-4 space-y-2">
            <button
              onClick={() => setShowCreateIndex(true)}
              className="flex w-full items-center justify-center gap-1 rounded-lg border border-dashed border-border py-2 text-[11px] text-muted-foreground transition-colors hover:border-primary/60 hover:text-foreground"
            >
              <Plus className="h-3 w-3" />
              Ajouter un index
            </button>
            {!Array.isArray(details.indexes) || details.indexes.length === 0 ? (
              <p className="text-xs text-muted-foreground text-center py-4">No indexes</p>
            ) : (
              details.indexes.map((idx, i) => {
                const name = typeof idx?.name === 'string' ? idx.name : `idx_${i}`
                const type = typeof idx?.type === 'string' ? idx.type : ''
                const cols = Array.isArray(idx?.columns)
                  ? idx.columns.filter((c): c is string => typeof c === 'string')
                  : []
                const id = `idx:${name}`
                return (
                  <div key={`${name}-${i}`} className="rounded-lg border border-border p-3">
                    <div className="mb-1 flex items-start gap-1.5 text-xs font-medium">
                      <Hash className="h-3 w-3 mt-0.5 text-primary shrink-0" />
                      <span className="break-all flex-1">{name}</span>
                      {idx?.unique && (
                        <Badge variant="info" className="text-[9px] px-1 py-0">UNIQUE</Badge>
                      )}
                      {idx?.name && (
                        <DropButton
                          id={id}
                          pending={pending === id}
                          confirming={confirmId === id}
                          onRequest={() => setConfirmId(id)}
                          onCancel={() => setConfirmId(null)}
                          onConfirm={() => dropIndex(idx.name)}
                        />
                      )}
                    </div>
                    <p className="font-mono text-[11px] text-muted-foreground break-all">
                      {type}
                      {cols.length > 0 ? ` (${cols.join(', ')})` : ''}
                    </p>
                  </div>
                )
              })
            )}
          </div>
        )}
      </div>

      {showCreateIndex && (
        <CreateIndexDialog
          connection={connection}
          schema={selectedSchema}
          table={selectedTable}
          columns={cols}
          onClose={() => setShowCreateIndex(false)}
          onCreated={async () => {
            setShowCreateIndex(false)
            await refresh()
          }}
        />
      )}
      {showCreateFk && (
        <CreateForeignKeyDialog
          connection={connection}
          schema={selectedSchema}
          table={selectedTable}
          columns={cols}
          onClose={() => setShowCreateFk(false)}
          onCreated={async () => {
            setShowCreateFk(false)
            await refresh()
          }}
        />
      )}
      {showCreatePk && (
        <CreatePrimaryKeyDialog
          connection={connection}
          schema={selectedSchema}
          table={selectedTable}
          columns={cols}
          onClose={() => setShowCreatePk(false)}
          onCreated={async () => {
            setShowCreatePk(false)
            await refresh()
          }}
        />
      )}
    </div>
  )
}

// ── Drop Button with inline confirm ──────────────────────────────────────────

function DropButton({
  id: _id,
  label,
  pending,
  confirming,
  onRequest,
  onCancel,
  onConfirm
}: {
  id: string
  label?: string
  pending: boolean
  confirming: boolean
  onRequest: () => void
  onCancel: () => void
  onConfirm: () => void
}) {
  if (pending) {
    return <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />
  }
  if (confirming) {
    return (
      <div className="flex items-center gap-0.5">
        <button
          onClick={onConfirm}
          className="rounded bg-destructive/15 px-1.5 py-0.5 text-[10px] font-medium text-destructive hover:bg-destructive/25"
        >
          Drop
        </button>
        <button
          onClick={onCancel}
          className="rounded px-1.5 py-0.5 text-[10px] text-muted-foreground hover:bg-accent"
        >
          Annuler
        </button>
      </div>
    )
  }
  return (
    <button
      onClick={onRequest}
      className="rounded p-0.5 text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
      title={label ?? 'Drop'}
    >
      <Trash2 className="h-3 w-3" />
    </button>
  )
}
