import { useEffect } from 'react'
import { create } from 'zustand'
import { CheckCircle2, XCircle, AlertTriangle, Info, X } from 'lucide-react'
import { cn } from '@shared/lib/utils'

// ── Toast Types ─────────────────────────────────────────────────────────────

export type ToastVariant = 'success' | 'error' | 'warning' | 'info'

export interface Toast {
  id: string
  message: string
  variant: ToastVariant
  duration?: number
}

interface ToastStore {
  toasts: Toast[]
  add: (message: string, variant?: ToastVariant, duration?: number) => void
  remove: (id: string) => void
}

// ── Toast Store ─────────────────────────────────────────────────────────────

export const useToastStore = create<ToastStore>()((set) => ({
  toasts: [],
  add: (message, variant = 'info', duration = 3500) => {
    const id = Date.now().toString(36) + Math.random().toString(36).substring(2, 6)
    set((s) => ({ toasts: [...s.toasts, { id, message, variant, duration }] }))
  },
  remove: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) }))
}))

// Shorthand helpers
export const toast = {
  success: (msg: string) => useToastStore.getState().add(msg, 'success'),
  error: (msg: string) => useToastStore.getState().add(msg, 'error', 5000),
  warning: (msg: string) => useToastStore.getState().add(msg, 'warning', 4000),
  info: (msg: string) => useToastStore.getState().add(msg, 'info')
}

// ── Toast Item ──────────────────────────────────────────────────────────────

const icons: Record<ToastVariant, React.ReactNode> = {
  success: <CheckCircle2 className="h-4 w-4 text-primary" />,
  error: <XCircle className="h-4 w-4 text-destructive" />,
  warning: <AlertTriangle className="h-4 w-4 text-warning" />,
  info: <Info className="h-4 w-4 text-info" />
}

const variantStyles: Record<ToastVariant, string> = {
  success: 'border-primary/20 bg-primary/5',
  error: 'border-destructive/20 bg-destructive/5',
  warning: 'border-warning/20 bg-warning/5',
  info: 'border-info/20 bg-info/5'
}

function ToastItem({ toast: t }: { toast: Toast }) {
  const remove = useToastStore((s) => s.remove)

  useEffect(() => {
    if (!t.duration) return
    const timer = setTimeout(() => remove(t.id), t.duration)
    return () => clearTimeout(timer)
  }, [t.id, t.duration, remove])

  return (
    <div
      className={cn(
        'flex items-center gap-2.5 rounded-lg border px-3.5 py-2.5 shadow-lg backdrop-blur-sm animate-in slide-in-from-right-full fade-in duration-200',
        variantStyles[t.variant]
      )}
    >
      {icons[t.variant]}
      <span className="flex-1 text-xs font-medium">{t.message}</span>
      <button
        onClick={() => remove(t.id)}
        className="shrink-0 rounded p-0.5 text-muted-foreground hover:text-foreground"
      >
        <X className="h-3 w-3" />
      </button>
    </div>
  )
}

// ── Toast Container ─────────────────────────────────────────────────────────

export function ToastContainer() {
  const toasts = useToastStore((s) => s.toasts)
  if (toasts.length === 0) return null

  return (
    <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2 w-80">
      {toasts.map((t) => (
        <ToastItem key={t.id} toast={t} />
      ))}
    </div>
  )
}
