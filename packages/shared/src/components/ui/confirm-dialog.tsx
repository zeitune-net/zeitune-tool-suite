import { useState, useCallback } from 'react'
import { AlertTriangle } from 'lucide-react'
import { Button } from './button'
import { cn } from '../../lib/utils'

interface ConfirmDialogProps {
  open: boolean
  title: string
  description: string
  confirmLabel?: string
  cancelLabel?: string
  variant?: 'destructive' | 'warning' | 'default'
  onConfirm: () => void
  onCancel: () => void
}

export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel = 'Confirmer',
  cancelLabel = 'Annuler',
  variant = 'destructive',
  onConfirm,
  onCancel
}: ConfirmDialogProps) {
  if (!open) return null

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="w-full max-w-sm rounded-2xl border border-border bg-card p-5 shadow-2xl">
        <div className="flex items-start gap-3">
          <div
            className={cn(
              'flex h-8 w-8 shrink-0 items-center justify-center rounded-full',
              variant === 'destructive' && 'bg-destructive/10',
              variant === 'warning' && 'bg-warning/10',
              variant === 'default' && 'bg-primary/10'
            )}
          >
            <AlertTriangle
              className={cn(
                'h-4 w-4',
                variant === 'destructive' && 'text-destructive',
                variant === 'warning' && 'text-warning',
                variant === 'default' && 'text-primary'
              )}
            />
          </div>
          <div className="flex-1">
            <h3 className="text-sm font-semibold">{title}</h3>
            <p className="mt-1 text-xs text-muted-foreground">{description}</p>
          </div>
        </div>
        <div className="mt-4 flex items-center justify-end gap-2">
          <Button variant="ghost" size="sm" onClick={onCancel}>
            {cancelLabel}
          </Button>
          <Button
            variant={variant === 'destructive' ? 'destructive' : 'default'}
            size="sm"
            onClick={onConfirm}
          >
            {confirmLabel}
          </Button>
        </div>
      </div>
    </div>
  )
}

/** Hook to manage confirm dialog state */
export function useConfirm() {
  const [state, setState] = useState<{
    open: boolean
    title: string
    description: string
    variant: 'destructive' | 'warning' | 'default'
    confirmLabel: string
    resolve: ((v: boolean) => void) | null
  }>({
    open: false,
    title: '',
    description: '',
    variant: 'destructive',
    confirmLabel: 'Confirmer',
    resolve: null
  })

  const confirm = useCallback(
    (opts: { title: string; description: string; variant?: 'destructive' | 'warning' | 'default'; confirmLabel?: string }) =>
      new Promise<boolean>((resolve) => {
        setState({
          open: true,
          title: opts.title,
          description: opts.description,
          variant: opts.variant || 'destructive',
          confirmLabel: opts.confirmLabel || 'Confirmer',
          resolve
        })
      }),
    []
  )

  const handleConfirm = useCallback(() => {
    state.resolve?.(true)
    setState((s) => ({ ...s, open: false, resolve: null }))
  }, [state.resolve])

  const handleCancel = useCallback(() => {
    state.resolve?.(false)
    setState((s) => ({ ...s, open: false, resolve: null }))
  }, [state.resolve])

  const dialog = (
    <ConfirmDialog
      open={state.open}
      title={state.title}
      description={state.description}
      variant={state.variant}
      confirmLabel={state.confirmLabel}
      onConfirm={handleConfirm}
      onCancel={handleCancel}
    />
  )

  return { confirm, dialog }
}
