import { Play, Square, RefreshCw, X, CheckSquare } from 'lucide-react'
import { Button } from '@shared/components/ui/button'
import { useDevManagerStore } from '../store'

function isStoppable(status: string): boolean {
  return status === 'running' || status === 'starting' || status === 'external'
}

function isStartable(status: string): boolean {
  return status === 'stopped' || status === 'error'
}

export function GroupActions() {
  const {
    services,
    startAll,
    stopAll,
    selectedServiceIds,
    startSelected,
    stopSelected,
    restartSelected,
    clearSelection,
    selectAll
  } = useDevManagerStore()

  const selectionCount = selectedServiceIds.size
  const hasSelection = selectionCount > 0

  const hasRunning = services.some((s) => isStoppable(s.status))
  const hasStopped = services.some((s) => isStartable(s.status))

  // When services are selected, show contextual actions
  if (hasSelection) {
    const selectedServices = services.filter((s) => selectedServiceIds.has(s.id))
    const selectedHasStoppable = selectedServices.some((s) => isStoppable(s.status))
    const selectedHasStartable = selectedServices.some((s) => isStartable(s.status))

    return (
      <div className="flex items-center gap-2">
        <span className="text-xs text-muted-foreground">
          {selectionCount} sélectionné{selectionCount > 1 ? 's' : ''}
        </span>
        <Button
          variant="outline"
          size="sm"
          onClick={stopSelected}
          disabled={!selectedHasStoppable}
        >
          <Square className="mr-1.5 h-3 w-3" />
          Arrêter
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={restartSelected}
          disabled={!selectedHasStoppable}
        >
          <RefreshCw className="mr-1.5 h-3 w-3" />
          Redémarrer
        </Button>
        <Button
          size="sm"
          onClick={startSelected}
          disabled={!selectedHasStartable}
        >
          <Play className="mr-1.5 h-3.5 w-3.5" />
          Démarrer
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={clearSelection}
          className="px-2"
        >
          <X className="h-3.5 w-3.5" />
        </Button>
      </div>
    )
  }

  // Default: global actions
  return (
    <div className="flex items-center gap-2">
      {services.length > 0 && (
        <Button
          variant="ghost"
          size="sm"
          onClick={selectAll}
          className="px-2"
          title="Tout sélectionner"
        >
          <CheckSquare className="h-3.5 w-3.5" />
        </Button>
      )}
      <Button
        variant="outline"
        size="sm"
        onClick={stopAll}
        disabled={!hasRunning}
      >
        <Square className="mr-1.5 h-3 w-3" />
        Tout arrêter
      </Button>
      <Button
        size="sm"
        onClick={startAll}
        disabled={!hasStopped}
      >
        <Play className="mr-1.5 h-3.5 w-3.5" />
        Tout démarrer
      </Button>
    </div>
  )
}
