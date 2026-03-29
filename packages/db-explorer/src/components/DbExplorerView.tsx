import { Database, Play, Download, Table2, ChevronRight } from 'lucide-react'
import { Button } from '@shared/components/ui/button'
import { cn } from '@shared/lib/utils'
import { useState } from 'react'

const mockTables = ['policies', 'insureds', 'risks', 'premiums', 'attestations', 'users', 'settings', 'audit_logs']

const mockQuery = `SELECT p.id, p.policy_number, i.full_name, p.status, p.premium_amount, p.created_at
FROM policies p
JOIN insureds i ON p.insured_id = i.id`

const mockResults = [
  { id: 1, policy_number: 'POL-2026-00142', insured: 'Amadou Diallo', status: 'ACTIVE', premium: '285,000 XOF', created: '2026-03-28' },
  { id: 2, policy_number: 'POL-2026-00141', insured: 'Fatou Ndiaye', status: 'ACTIVE', premium: '142,500 XOF', created: '2026-03-27' },
  { id: 3, policy_number: 'POL-2026-00140', insured: 'Ousmane Sow', status: 'SUSPENDED', premium: '520,000 XOF', created: '2026-03-26' },
  { id: 4, policy_number: 'POL-2026-00139', insured: 'Aissatou Ba', status: 'ACTIVE', premium: '95,000 XOF', created: '2026-03-25' },
  { id: 5, policy_number: 'POL-2026-00138', insured: 'Moussa Camara', status: 'PENDING', premium: '310,000 XOF', created: '2026-03-24' },
  { id: 6, policy_number: 'POL-2026-00137', insured: 'Mariama Sy', status: 'ACTIVE', premium: '175,000 XOF', created: '2026-03-23' },
  { id: 7, policy_number: 'POL-2026-00136', insured: 'Ibrahima Fall', status: 'EXPIRED', premium: '430,000 XOF', created: '2026-03-22' }
]

const statusColors: Record<string, string> = {
  ACTIVE: 'text-green-400',
  PENDING: 'text-yellow-400',
  SUSPENDED: 'text-orange-400',
  EXPIRED: 'text-red-400'
}

export function DbExplorerView() {
  const [selectedTable, setSelectedTable] = useState('policies')

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-border px-6 py-4">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-muted">
            <Database className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h1 className="text-xl font-semibold">DB Explorer</h1>
            <p className="text-sm text-muted-foreground">olive_insurance_db · PostgreSQL 16</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm">
            <Download className="mr-1.5 h-3.5 w-3.5" />
            Export
          </Button>
          <Button size="sm">
            <Play className="mr-1.5 h-3.5 w-3.5" />
            Run Query
          </Button>
        </div>
      </div>

      {/* Content */}
      <div className="flex flex-1 overflow-hidden">
        {/* Schema sidebar */}
        <div className="w-56 shrink-0 border-r border-border overflow-auto p-3">
          <p className="mb-2 px-2 text-xs font-medium uppercase text-muted-foreground">Schema</p>
          <div className="space-y-0.5">
            <div className="flex items-center gap-1.5 px-2 py-1.5 text-sm text-muted-foreground">
              <Database className="h-3.5 w-3.5" />
              <span className="font-medium">olive_insurance_db</span>
            </div>
            {mockTables.map((table) => (
              <button
                key={table}
                onClick={() => setSelectedTable(table)}
                className={cn(
                  'flex w-full items-center gap-1.5 rounded-md px-2 py-1.5 pl-6 text-left text-sm transition-colors',
                  selectedTable === table
                    ? 'bg-primary/10 text-primary'
                    : 'text-muted-foreground hover:bg-accent hover:text-foreground'
                )}
              >
                <Table2 className="h-3.5 w-3.5 shrink-0" />
                {table}
              </button>
            ))}
          </div>
        </div>

        {/* Query + Results */}
        <div className="flex flex-1 flex-col overflow-hidden">
          {/* Query editor */}
          <div className="border-b border-border bg-card/50 p-4">
            <pre className="rounded-lg bg-background/80 p-3 font-mono text-sm text-primary">
              {mockQuery}
            </pre>
            <div className="mt-2 flex items-center gap-3 text-xs text-muted-foreground">
              <span>Rows: <strong className="text-foreground">50</strong></span>
              <span>Time: <strong className="text-foreground">12ms</strong></span>
              <span>Cost: <strong className="text-foreground">0.04</strong></span>
              <div className="flex-1" />
              <Button variant="outline" size="sm" className="h-6 text-xs">Format</Button>
              <Button variant="outline" size="sm" className="h-6 text-xs">Explain</Button>
            </div>
          </div>

          {/* Results table */}
          <div className="flex-1 overflow-auto">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-card border-b border-border">
                <tr>
                  <th className="px-4 py-2.5 text-left font-medium text-muted-foreground">ID</th>
                  <th className="px-4 py-2.5 text-left font-medium text-muted-foreground">POLICY NUMBER</th>
                  <th className="px-4 py-2.5 text-left font-medium text-muted-foreground">INSURED</th>
                  <th className="px-4 py-2.5 text-left font-medium text-muted-foreground">STATUS</th>
                  <th className="px-4 py-2.5 text-left font-medium text-muted-foreground">PREMIUM</th>
                  <th className="px-4 py-2.5 text-left font-medium text-muted-foreground">CREATED</th>
                </tr>
              </thead>
              <tbody>
                {mockResults.map((row) => (
                  <tr key={row.id} className="border-b border-border/50 hover:bg-accent/50 transition-colors">
                    <td className="px-4 py-2.5 text-primary">{row.id}</td>
                    <td className="px-4 py-2.5 text-muted-foreground">{row.policy_number}</td>
                    <td className="px-4 py-2.5">{row.insured}</td>
                    <td className={cn('px-4 py-2.5', statusColors[row.status] || '')}>{row.status}</td>
                    <td className="px-4 py-2.5 text-muted-foreground">{row.premium}</td>
                    <td className="px-4 py-2.5 text-muted-foreground">{row.created}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  )
}
