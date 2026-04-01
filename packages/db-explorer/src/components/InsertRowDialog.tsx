import { useState } from 'react'
import { X, Plus } from 'lucide-react'
import { Button } from '@shared/components/ui/button'
import type { ColumnInfo } from '@shared/types'

interface InsertRowDialogProps {
  columns: ColumnInfo[]
  onInsert: (row: Record<string, unknown>) => Promise<boolean>
  onClose: () => void
}

export function InsertRowDialog({ columns, onInsert, onClose }: InsertRowDialogProps) {
  const [values, setValues] = useState<Record<string, string>>(() => {
    const initial: Record<string, string> = {}
    for (const col of columns) {
      initial[col.name] = col.defaultValue ? '' : ''
    }
    return initial
  })
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const handleSubmit = async () => {
    setLoading(true)
    setError(null)
    const row: Record<string, unknown> = {}
    for (const col of columns) {
      const val = values[col.name]
      if (val === '' || val === undefined) {
        if (col.nullable || col.defaultValue) continue
        // Skip — let the DB handle required fields via defaults or errors
        continue
      }
      // Parse basic types
      if (val.toLowerCase() === 'null') {
        row[col.name] = null
      } else if (val.toLowerCase() === 'true') {
        row[col.name] = true
      } else if (val.toLowerCase() === 'false') {
        row[col.name] = false
      } else if (!isNaN(Number(val)) && val.trim() !== '' && /int|float|double|numeric|decimal|serial|real|number/i.test(col.type)) {
        row[col.name] = Number(val)
      } else {
        row[col.name] = val
      }
    }
    const success = await onInsert(row)
    setLoading(false)
    if (success) {
      onClose()
    } else {
      setError('Insert failed — check the values and try again')
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="w-[500px] max-h-[80vh] rounded-[14px] bg-card border border-border shadow-xl flex flex-col">
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <span className="text-sm font-medium">Insert Row</span>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {columns.map((col) => (
            <div key={col.name} className="flex flex-col gap-1">
              <label className="flex items-center gap-2 text-xs">
                <span className="font-medium text-foreground">{col.name}</span>
                <span className="text-muted-foreground">{col.type}</span>
                {col.nullable && <span className="text-muted-foreground/50">nullable</span>}
                {col.isPrimaryKey && <span className="text-primary text-[10px] font-bold">PK</span>}
              </label>
              <input
                value={values[col.name] ?? ''}
                onChange={(e) => setValues({ ...values, [col.name]: e.target.value })}
                placeholder={col.defaultValue ?? (col.nullable ? 'NULL' : '')}
                className="h-8 rounded bg-accent/20 px-2 font-mono text-xs outline-none focus:ring-1 focus:ring-primary/50"
              />
            </div>
          ))}
        </div>
        {error && (
          <div className="px-4 py-2 text-xs text-destructive">{error}</div>
        )}
        <div className="flex items-center justify-end gap-2 border-t border-border p-4">
          <Button size="sm" variant="ghost" onClick={onClose}>Cancel</Button>
          <Button size="sm" onClick={handleSubmit} disabled={loading}>
            <Plus className="mr-1.5 h-3.5 w-3.5" />
            Insert
          </Button>
        </div>
      </div>
    </div>
  )
}
