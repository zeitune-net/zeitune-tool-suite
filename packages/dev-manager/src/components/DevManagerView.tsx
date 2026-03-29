import { Code2, Play, Square, Circle } from 'lucide-react'
import { Button } from '@shared/components/ui/button'
import { cn } from '@shared/lib/utils'

type ServiceStatus = 'running' | 'stopped' | 'building' | 'error'

interface MockService {
  name: string
  port: number
  status: ServiceStatus
  description: string
  type: 'service' | 'infrastructure'
}

const mockServices: MockService[] = [
  { name: 'olive-gateway', port: 8080, status: 'running', description: 'Spring Cloud Gateway', type: 'service' },
  { name: 'olive-auth', port: 8081, status: 'running', description: 'Auth + JWT', type: 'service' },
  { name: 'olive-pricing', port: 8083, status: 'building', description: 'Pricing Engine', type: 'service' },
  { name: 'olive-admin', port: 8084, status: 'running', description: 'Administration', type: 'service' },
  { name: 'olive-exploitation', port: 8085, status: 'stopped', description: 'Exploitation', type: 'service' },
  { name: 'olive-pdf-builder', port: 8087, status: 'error', description: 'PDF Generation', type: 'service' }
]

const mockInfra: MockService[] = [
  { name: 'PostgreSQL', port: 5432, status: 'running', description: 'Docker', type: 'infrastructure' },
  { name: 'Consul', port: 8500, status: 'running', description: 'Service Discovery', type: 'infrastructure' },
  { name: 'Redis', port: 6379, status: 'running', description: 'Docker', type: 'infrastructure' }
]

const statusColor: Record<ServiceStatus, string> = {
  running: 'bg-green-500',
  stopped: 'bg-gray-500',
  building: 'bg-yellow-500 animate-pulse',
  error: 'bg-red-500'
}

const statusLabel: Record<ServiceStatus, string> = {
  running: 'Running',
  stopped: 'Stopped',
  building: 'Building...',
  error: 'Error'
}

function StatCard({ label, value, color }: { label: string; value: number; color?: string }) {
  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <p className="text-xs font-medium uppercase text-muted-foreground">{label}</p>
      <p className={cn('mt-1 text-2xl font-semibold', color)}>{value}</p>
    </div>
  )
}

export function DevManagerView() {
  const running = mockServices.filter((s) => s.status === 'running').length
  const building = mockServices.filter((s) => s.status === 'building').length
  const errors = mockServices.filter((s) => s.status === 'error').length

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-border px-6 py-4">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-muted">
            <Code2 className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h1 className="text-xl font-semibold">Dev Manager</h1>
            <p className="text-sm text-muted-foreground">Olive Insurance · Spring Boot Microservices</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm">
            <Square className="mr-1.5 h-3 w-3" />
            Stop All
          </Button>
          <Button size="sm">
            <Play className="mr-1.5 h-3.5 w-3.5" />
            Start All
          </Button>
        </div>
      </div>

      {/* Content */}
      <div className="flex flex-1 overflow-hidden">
        {/* Service list */}
        <div className="w-64 shrink-0 border-r border-border overflow-auto p-3">
          <p className="mb-2 px-2 text-xs font-medium uppercase text-muted-foreground">Services</p>
          <div className="space-y-1">
            {mockServices.map((svc) => (
              <div
                key={svc.name}
                className="flex items-center justify-between rounded-lg px-3 py-2.5 hover:bg-accent transition-colors cursor-pointer"
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  <Circle className={cn('h-2.5 w-2.5 shrink-0 fill-current', statusColor[svc.status].replace('bg-', 'text-').replace(' animate-pulse', ''))} />
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{svc.name}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      {svc.status === 'running' || svc.status === 'error' ? statusLabel[svc.status] : svc.description}
                    </p>
                  </div>
                </div>
                <span className="shrink-0 rounded bg-muted px-1.5 py-0.5 text-xs text-muted-foreground">:{svc.port}</span>
              </div>
            ))}
          </div>

          <p className="mb-2 mt-4 px-2 text-xs font-medium uppercase text-muted-foreground">Infrastructure</p>
          <div className="space-y-1">
            {mockInfra.map((inf) => (
              <div
                key={inf.name}
                className="flex items-center justify-between rounded-lg px-3 py-2.5 hover:bg-accent transition-colors cursor-pointer"
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  <Circle className="h-2.5 w-2.5 shrink-0 fill-current text-green-500" />
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{inf.name}</p>
                    <p className="truncate text-xs text-muted-foreground">{inf.description}</p>
                  </div>
                </div>
                <span className="shrink-0 rounded bg-muted px-1.5 py-0.5 text-xs text-muted-foreground">:{inf.port}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Stats + Logs area */}
        <div className="flex flex-1 flex-col overflow-hidden">
          <div className="grid grid-cols-4 gap-3 border-b border-border p-4">
            <StatCard label="Running" value={running} color="text-green-500" />
            <StatCard label="Building" value={building} color="text-yellow-500" />
            <StatCard label="Errors" value={errors} color="text-red-500" />
            <StatCard label="Containers" value={mockInfra.length} color="text-blue-500" />
          </div>

          {/* Log area placeholder */}
          <div className="flex-1 overflow-auto bg-card/50 p-4 font-mono text-xs">
            <p className="text-muted-foreground">Les logs des services apparaitront ici...</p>
            <p className="mt-2 text-muted-foreground/50">Demarrez un service pour voir sa sortie en temps reel</p>
          </div>
        </div>
      </div>
    </div>
  )
}
