import { cn } from '@shared/lib/utils'
import { useDevManagerStore } from '../store'

function StatCard({
  label,
  value,
  color
}: {
  label: string
  value: number
  color: 'success' | 'warning' | 'destructive' | 'muted' | 'info'
}) {
  const colorMap = {
    success: 'text-primary',
    warning: 'text-warning',
    destructive: 'text-destructive',
    muted: 'text-muted-foreground',
    info: 'text-blue-400'
  }

  return (
    <div className="rounded-xl border border-border p-3">
      <p className="text-[10px] font-medium text-muted-foreground">{label}</p>
      <p className={cn('text-2xl font-bold', colorMap[color])}>{value}</p>
    </div>
  )
}

export function StatsBar() {
  const { services } = useDevManagerStore()

  const running = services.filter((s) => s.status === 'running').length
  const external = services.filter((s) => s.status === 'external').length
  const starting = services.filter((s) => s.status === 'starting').length
  const stopping = services.filter((s) => s.status === 'stopping').length
  const errors = services.filter((s) => s.status === 'error').length
  const stopped = services.filter((s) => s.status === 'stopped').length
  const transitioning = starting + stopping

  return (
    <div className="grid grid-cols-5 gap-3">
      <StatCard label="Running" value={running} color={running > 0 ? 'success' : 'muted'} />
      <StatCard label="Externes" value={external} color={external > 0 ? 'info' : 'muted'} />
      <StatCard label="En transition" value={transitioning} color={transitioning > 0 ? 'warning' : 'muted'} />
      <StatCard label="Errors" value={errors} color={errors > 0 ? 'destructive' : 'muted'} />
      <StatCard label="Stopped" value={stopped} color="muted" />
    </div>
  )
}
