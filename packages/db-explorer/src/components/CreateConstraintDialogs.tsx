import { useEffect, useMemo, useState } from 'react'
import { X, Plus, Check } from 'lucide-react'
import { Button } from '@shared/components/ui/button'
import { cn } from '@shared/lib/utils'
import { useDbExplorerStore } from '../store'
import * as dbIpc from '../services/db-ipc'
import type { DbConnectionEntry, ColumnInfo } from '@shared/types'

// ── Shared modal shell ────────────────────────────────────────────────────

function DialogShell({
  title,
  onClose,
  children,
  footer
}: {
  title: string
  onClose: () => void
  children: React.ReactNode
  footer: React.ReactNode
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="w-[480px] max-h-[80vh] rounded-[14px] bg-card border border-border shadow-xl flex flex-col">
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <span className="text-sm font-medium">{title}</span>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-4 space-y-3">{children}</div>
        <div className="flex items-center justify-end gap-2 border-t border-border p-3">
          {footer}
        </div>
      </div>
    </div>
  )
}

function FieldLabel({ children }: { children: React.ReactNode }) {
  return (
    <label className="mb-1 block text-[10px] font-medium text-muted-foreground uppercase tracking-wide">
      {children}
    </label>
  )
}

const inputCls =
  'w-full h-8 rounded bg-accent/20 px-2 font-mono text-xs outline-none focus:ring-1 focus:ring-primary/50'
const selectCls = inputCls + ' cursor-pointer'

// ── Create Index ──────────────────────────────────────────────────────────

export function CreateIndexDialog({
  connection,
  schema,
  table,
  columns,
  onClose,
  onCreated
}: {
  connection: DbConnectionEntry
  schema: string
  table: string
  columns: ColumnInfo[]
  onClose: () => void
  onCreated: () => void
}) {
  const [name, setName] = useState('')
  const [selectedCols, setSelectedCols] = useState<string[]>([])
  const [unique, setUnique] = useState(false)
  const [method, setMethod] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const isPg = connection.type === 'postgresql'

  const toggleCol = (col: string) => {
    setSelectedCols((prev) =>
      prev.includes(col) ? prev.filter((c) => c !== col) : [...prev, col]
    )
  }

  const handleSubmit = async () => {
    setError(null)
    if (selectedCols.length === 0) {
      setError('Sélectionnez au moins une colonne')
      return
    }
    setLoading(true)
    try {
      const res = await dbIpc.createIndex({
        connection,
        schema,
        table,
        name: name.trim() || undefined,
        columns: selectedCols,
        unique,
        method: isPg ? method.trim() || undefined : undefined
      })
      if (res.success) {
        onCreated()
      } else {
        setError(res.error || 'Échec')
      }
    } finally {
      setLoading(false)
    }
  }

  return (
    <DialogShell
      title="Créer un index"
      onClose={onClose}
      footer={
        <>
          <Button size="sm" variant="ghost" onClick={onClose}>
            Annuler
          </Button>
          <Button size="sm" onClick={handleSubmit} disabled={loading}>
            <Plus className="mr-1.5 h-3.5 w-3.5" />
            Créer
          </Button>
        </>
      }
    >
      <div>
        <FieldLabel>Nom (optionnel)</FieldLabel>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder={`${table}_${selectedCols.join('_') || 'col'}_${unique ? 'uq' : 'idx'}`}
          className={inputCls}
        />
      </div>

      <div>
        <FieldLabel>Colonnes</FieldLabel>
        <div className="max-h-48 overflow-auto rounded border border-border/60 p-1.5 space-y-0.5">
          {columns.length === 0 && (
            <p className="py-2 text-center text-[11px] text-muted-foreground">Aucune colonne</p>
          )}
          {columns.map((c) => {
            const checked = selectedCols.includes(c.name)
            return (
              <button
                key={c.name}
                onClick={() => toggleCol(c.name)}
                className={cn(
                  'flex w-full items-center gap-2 rounded px-2 py-1 text-left text-xs transition-colors',
                  checked ? 'bg-primary/10 text-foreground' : 'hover:bg-accent/40'
                )}
              >
                <div
                  className={cn(
                    'flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded border',
                    checked ? 'border-primary bg-primary' : 'border-border'
                  )}
                >
                  {checked && <Check className="h-2.5 w-2.5 text-white" />}
                </div>
                <span className="font-mono">{c.name}</span>
                <span className="text-[10px] text-muted-foreground">{c.type}</span>
              </button>
            )
          })}
        </div>
      </div>

      <div className="flex items-center gap-4">
        <label className="flex items-center gap-2 text-xs cursor-pointer select-none">
          <input
            type="checkbox"
            checked={unique}
            onChange={(e) => setUnique(e.target.checked)}
          />
          <span>UNIQUE</span>
        </label>
        {isPg && (
          <div className="flex-1">
            <FieldLabel>Méthode (PG)</FieldLabel>
            <select
              value={method}
              onChange={(e) => setMethod(e.target.value)}
              className={selectCls}
            >
              <option value="">btree (défaut)</option>
              <option value="btree">btree</option>
              <option value="hash">hash</option>
              <option value="gin">gin</option>
              <option value="gist">gist</option>
              <option value="brin">brin</option>
              <option value="spgist">spgist</option>
            </select>
          </div>
        )}
      </div>

      {error && <p className="text-[11px] text-destructive break-all">{error}</p>}
    </DialogShell>
  )
}

// ── Create Primary Key ────────────────────────────────────────────────────

export function CreatePrimaryKeyDialog({
  connection,
  schema,
  table,
  columns,
  onClose,
  onCreated
}: {
  connection: DbConnectionEntry
  schema: string
  table: string
  columns: ColumnInfo[]
  onClose: () => void
  onCreated: () => void
}) {
  const [name, setName] = useState('')
  const [selectedCols, setSelectedCols] = useState<string[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const isPg = connection.type === 'postgresql'

  const toggleCol = (col: string) => {
    setSelectedCols((prev) =>
      prev.includes(col) ? prev.filter((c) => c !== col) : [...prev, col]
    )
  }

  const handleSubmit = async () => {
    setError(null)
    if (selectedCols.length === 0) {
      setError('Sélectionnez au moins une colonne')
      return
    }
    setLoading(true)
    try {
      const res = await dbIpc.createPrimaryKey({
        connection,
        schema,
        table,
        name: name.trim() || undefined,
        columns: selectedCols
      })
      if (res.success) onCreated()
      else setError(res.error || 'Échec')
    } finally {
      setLoading(false)
    }
  }

  return (
    <DialogShell
      title="Créer la Primary Key"
      onClose={onClose}
      footer={
        <>
          <Button size="sm" variant="ghost" onClick={onClose}>
            Annuler
          </Button>
          <Button size="sm" onClick={handleSubmit} disabled={loading}>
            <Plus className="mr-1.5 h-3.5 w-3.5" />
            Créer
          </Button>
        </>
      }
    >
      {isPg && (
        <div>
          <FieldLabel>Nom de la contrainte (optionnel)</FieldLabel>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={`${table}_pkey`}
            className={inputCls}
          />
        </div>
      )}
      <div>
        <FieldLabel>Colonnes</FieldLabel>
        <div className="max-h-48 overflow-auto rounded border border-border/60 p-1.5 space-y-0.5">
          {columns.map((c) => {
            const checked = selectedCols.includes(c.name)
            return (
              <button
                key={c.name}
                onClick={() => toggleCol(c.name)}
                className={cn(
                  'flex w-full items-center gap-2 rounded px-2 py-1 text-left text-xs transition-colors',
                  checked ? 'bg-primary/10 text-foreground' : 'hover:bg-accent/40'
                )}
              >
                <div
                  className={cn(
                    'flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded border',
                    checked ? 'border-primary bg-primary' : 'border-border'
                  )}
                >
                  {checked && <Check className="h-2.5 w-2.5 text-white" />}
                </div>
                <span className="font-mono">{c.name}</span>
                <span className="text-[10px] text-muted-foreground">{c.type}</span>
                {c.nullable && (
                  <span className="text-[10px] text-warning">nullable</span>
                )}
              </button>
            )
          })}
        </div>
        <p className="mt-1 text-[10px] text-muted-foreground">
          Les colonnes doivent être NOT NULL et contenir des valeurs uniques.
        </p>
      </div>

      {error && <p className="text-[11px] text-destructive break-all">{error}</p>}
    </DialogShell>
  )
}

// ── Create Foreign Key ────────────────────────────────────────────────────

const FK_ACTIONS = ['NO ACTION', 'CASCADE', 'SET NULL', 'SET DEFAULT', 'RESTRICT'] as const

export function CreateForeignKeyDialog({
  connection,
  schema,
  table,
  columns,
  onClose,
  onCreated
}: {
  connection: DbConnectionEntry
  schema: string
  table: string
  columns: ColumnInfo[]
  onClose: () => void
  onCreated: () => void
}) {
  const { schemas, schemaColumns, loadSchemaColumns } = useDbExplorerStore()

  const dbSchema = schemas[connection.id]
  const schemaList = dbSchema?.schemas ?? []

  const [name, setName] = useState('')
  const [column, setColumn] = useState(columns[0]?.name ?? '')
  const [refSchema, setRefSchema] = useState(schema)
  const [refTable, setRefTable] = useState('')
  const [refColumn, setRefColumn] = useState('')
  const [onDelete, setOnDelete] = useState<string>('NO ACTION')
  const [onUpdate, setOnUpdate] = useState<string>('NO ACTION')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Charger les colonnes du schéma référencé à la demande
  useEffect(() => {
    if (refSchema) loadSchemaColumns(connection, refSchema).catch(() => {})
  }, [refSchema, connection, loadSchemaColumns])

  const refTables = useMemo(() => {
    const s = schemaList.find((x) => x.name === refSchema)
    return s?.tables ?? []
  }, [schemaList, refSchema])

  const refColumnsList = useMemo(() => {
    const key = `${connection.id}:${refSchema}`
    const map = schemaColumns[key]
    if (!map || !refTable) return []
    return map[refTable] ?? []
  }, [schemaColumns, connection.id, refSchema, refTable])

  // Auto-préremplir refColumn quand on change de refTable
  useEffect(() => {
    if (refColumnsList.length > 0 && !refColumnsList.includes(refColumn)) {
      setRefColumn(refColumnsList[0])
    }
  }, [refColumnsList]) // eslint-disable-line react-hooks/exhaustive-deps

  const handleSubmit = async () => {
    setError(null)
    if (!column || !refTable || !refColumn) {
      setError('Colonnes source et cible requises')
      return
    }
    setLoading(true)
    try {
      const res = await dbIpc.createForeignKey({
        connection,
        schema,
        table,
        name: name.trim() || undefined,
        column,
        referencedSchema: refSchema,
        referencedTable: refTable,
        referencedColumn: refColumn,
        onDelete: onDelete === 'NO ACTION' ? undefined : onDelete,
        onUpdate: onUpdate === 'NO ACTION' ? undefined : onUpdate
      })
      if (res.success) onCreated()
      else setError(res.error || 'Échec')
    } finally {
      setLoading(false)
    }
  }

  return (
    <DialogShell
      title="Créer une Foreign Key"
      onClose={onClose}
      footer={
        <>
          <Button size="sm" variant="ghost" onClick={onClose}>
            Annuler
          </Button>
          <Button size="sm" onClick={handleSubmit} disabled={loading}>
            <Plus className="mr-1.5 h-3.5 w-3.5" />
            Créer
          </Button>
        </>
      }
    >
      <div>
        <FieldLabel>Nom de la contrainte (optionnel)</FieldLabel>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder={`${table}_${column || 'col'}_fkey`}
          className={inputCls}
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <FieldLabel>Colonne</FieldLabel>
          <select
            value={column}
            onChange={(e) => setColumn(e.target.value)}
            className={selectCls}
          >
            {columns.map((c) => (
              <option key={c.name} value={c.name}>
                {c.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <FieldLabel>→ Schema</FieldLabel>
          <select
            value={refSchema}
            onChange={(e) => {
              setRefSchema(e.target.value)
              setRefTable('')
              setRefColumn('')
            }}
            className={selectCls}
          >
            {schemaList.map((s) => (
              <option key={s.name} value={s.name}>
                {s.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <FieldLabel>→ Table</FieldLabel>
          <select
            value={refTable}
            onChange={(e) => {
              setRefTable(e.target.value)
              setRefColumn('')
            }}
            className={selectCls}
          >
            <option value="">—</option>
            {refTables.map((t) => (
              <option key={t.name} value={t.name}>
                {t.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <FieldLabel>→ Colonne</FieldLabel>
          {refColumnsList.length > 0 ? (
            <select
              value={refColumn}
              onChange={(e) => setRefColumn(e.target.value)}
              className={selectCls}
            >
              {refColumnsList.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          ) : (
            <input
              value={refColumn}
              onChange={(e) => setRefColumn(e.target.value)}
              placeholder="id"
              className={inputCls}
            />
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <FieldLabel>ON DELETE</FieldLabel>
          <select value={onDelete} onChange={(e) => setOnDelete(e.target.value)} className={selectCls}>
            {FK_ACTIONS.map((a) => (
              <option key={a} value={a}>
                {a}
              </option>
            ))}
          </select>
        </div>
        <div>
          <FieldLabel>ON UPDATE</FieldLabel>
          <select value={onUpdate} onChange={(e) => setOnUpdate(e.target.value)} className={selectCls}>
            {FK_ACTIONS.map((a) => (
              <option key={a} value={a}>
                {a}
              </option>
            ))}
          </select>
        </div>
      </div>

      {error && <p className="text-[11px] text-destructive break-all">{error}</p>}
    </DialogShell>
  )
}
