import { useEffect, useState, useRef } from 'react'
import { Activity, Database, HardDrive, RefreshCw, Loader2, Server, Users } from 'lucide-react'
import { Button } from '@shared/components/ui/button'
import { cn } from '@shared/lib/utils'
import { useDbExplorerStore } from '../store'
import type { DbConnectionEntry } from '@shared/types'

type RefreshInterval = 0 | 5 | 15 | 30

export function MonitorPanel({ connection }: { connection: DbConnectionEntry }) {
  const { monitorStats, monitorLoading, loadMonitorStats } = useDbExplorerStore()
  const [refreshInterval, setRefreshInterval] = useState<RefreshInterval>(0)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => {
    loadMonitorStats(connection)
  }, [connection, loadMonitorStats])

  // Auto-refresh
  useEffect(() => {
    if (timerRef.current) clearInterval(timerRef.current)
    if (refreshInterval > 0) {
      timerRef.current = setInterval(() => {
        loadMonitorStats(connection)
      }, refreshInterval * 1000)
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current)
    }
  }, [refreshInterval, connection, loadMonitorStats])

  const maxSize = monitorStats?.tableSizes?.[0]?.totalSizeBytes ?? 1

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-border px-4 py-2.5 bg-card/30">
        <div className="flex items-center gap-2">
          <Activity className="h-4 w-4 text-primary" />
          <span className="text-xs font-medium">Monitor</span>
          {monitorStats && (
            <span className="text-[10px] text-muted-foreground">
              {monitorStats.serverVersion}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <select
            value={refreshInterval}
            onChange={(e) => setRefreshInterval(Number(e.target.value) as RefreshInterval)}
            className="bg-transparent text-xs outline-none cursor-pointer text-muted-foreground"
          >
            <option value={0}>Manual</option>
            <option value={5}>5s</option>
            <option value={15}>15s</option>
            <option value={30}>30s</option>
          </select>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => loadMonitorStats(connection)}
            disabled={monitorLoading}
          >
            {monitorLoading ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <RefreshCw className="h-3.5 w-3.5" />
            )}
          </Button>
        </div>
      </div>

      {!monitorStats ? (
        <div className="flex flex-1 items-center justify-center">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto p-4 space-y-6">
          {/* Pool Stats Cards */}
          <div className="grid grid-cols-3 gap-3">
            <StatCard
              icon={<Server className="h-4 w-4" />}
              label="Total Connections"
              value={monitorStats.poolStats.total}
              color="text-primary"
            />
            <StatCard
              icon={<Activity className="h-4 w-4" />}
              label="Idle"
              value={monitorStats.poolStats.idle}
              color="text-green-500"
            />
            <StatCard
              icon={<Users className="h-4 w-4" />}
              label="Waiting"
              value={monitorStats.poolStats.waiting}
              color={monitorStats.poolStats.waiting > 0 ? 'text-yellow-500' : 'text-muted-foreground'}
            />
          </div>

          {/* Active Connections */}
          <section>
            <h3 className="flex items-center gap-1.5 text-xs font-medium mb-2">
              <Users className="h-3.5 w-3.5 text-muted-foreground" />
              Active Connections
              <span className="text-muted-foreground">({monitorStats.activeConnections.length})</span>
            </h3>
            {monitorStats.activeConnections.length === 0 ? (
              <p className="text-xs text-muted-foreground">No active connections</p>
            ) : (
              <div className="rounded-lg border border-border overflow-hidden">
                <table className="w-full text-xs">
                  <thead className="bg-card/50">
                    <tr>
                      <th className="px-3 py-2 text-left text-muted-foreground font-medium">PID</th>
                      <th className="px-3 py-2 text-left text-muted-foreground font-medium">User</th>
                      <th className="px-3 py-2 text-left text-muted-foreground font-medium">State</th>
                      <th className="px-3 py-2 text-left text-muted-foreground font-medium">Duration</th>
                      <th className="px-3 py-2 text-left text-muted-foreground font-medium">Query</th>
                    </tr>
                  </thead>
                  <tbody>
                    {monitorStats.activeConnections.map((conn) => (
                      <tr key={conn.pid} className="border-t border-border/50 hover:bg-accent/30">
                        <td className="px-3 py-1.5 font-mono text-muted-foreground">{conn.pid}</td>
                        <td className="px-3 py-1.5">{conn.username}</td>
                        <td className="px-3 py-1.5">
                          <span className={cn(
                            'inline-block rounded-full px-1.5 py-0.5 text-[10px] font-medium',
                            conn.state === 'active' && 'bg-green-500/10 text-green-500',
                            conn.state === 'idle' && 'bg-muted text-muted-foreground',
                            conn.state === 'idle in transaction' && 'bg-yellow-500/10 text-yellow-500'
                          )}>
                            {conn.state}
                          </span>
                        </td>
                        <td className="px-3 py-1.5 text-muted-foreground">{conn.duration}</td>
                        <td className="px-3 py-1.5 font-mono text-[11px] max-w-[300px] truncate" title={conn.query}>
                          {conn.query || '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          {/* Table Sizes */}
          <section>
            <h3 className="flex items-center gap-1.5 text-xs font-medium mb-2">
              <HardDrive className="h-3.5 w-3.5 text-muted-foreground" />
              Table Sizes
              <span className="text-muted-foreground">({monitorStats.tableSizes.length})</span>
            </h3>
            {monitorStats.tableSizes.length === 0 ? (
              <p className="text-xs text-muted-foreground">No tables found</p>
            ) : (
              <div className="space-y-1">
                {monitorStats.tableSizes.map((t) => {
                  const pct = maxSize > 0 ? (t.totalSizeBytes / maxSize) * 100 : 0
                  return (
                    <div key={`${t.schema}.${t.table}`} className="group">
                      <div className="flex items-center gap-2 py-1">
                        <Database className="h-3 w-3 text-muted-foreground shrink-0" />
                        <span className="text-xs font-mono truncate flex-1" title={`${t.schema}.${t.table}`}>
                          {t.schema === 'public' ? t.table : `${t.schema}.${t.table}`}
                        </span>
                        <span className="text-[10px] text-muted-foreground shrink-0">
                          ~{t.rowEstimate.toLocaleString()} rows
                        </span>
                        <span className="text-[10px] font-medium text-foreground shrink-0 w-16 text-right">
                          {t.totalSize}
                        </span>
                      </div>
                      <div className="h-1 rounded-full bg-accent/20 ml-5">
                        <div
                          className="h-full rounded-full bg-primary/60 transition-all"
                          style={{ width: `${Math.max(pct, 1)}%` }}
                        />
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </section>
        </div>
      )}
    </div>
  )
}

function StatCard({ icon, label, value, color }: {
  icon: React.ReactNode; label: string; value: number; color: string
}) {
  return (
    <div className="rounded-lg border border-border bg-card/50 p-3">
      <div className={cn('mb-1', color)}>{icon}</div>
      <div className="text-lg font-semibold text-foreground">{value}</div>
      <div className="text-[10px] text-muted-foreground">{label}</div>
    </div>
  )
}
