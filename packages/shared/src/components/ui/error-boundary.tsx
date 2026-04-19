import { Component, type ErrorInfo, type ReactNode } from 'react'
import { AlertTriangle, RefreshCw } from 'lucide-react'

interface Props {
  children: ReactNode
  fallback?: (error: Error, reset: () => void) => ReactNode
  // Optionnel : réinitialise l'état interne quand la clé change (ex: id de la table)
  resetKey?: string | number
}

interface State {
  error: Error | null
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    // eslint-disable-next-line no-console
    console.error('[ErrorBoundary]', error, info.componentStack)
  }

  componentDidUpdate(prevProps: Props): void {
    if (this.state.error && prevProps.resetKey !== this.props.resetKey) {
      this.setState({ error: null })
    }
  }

  reset = (): void => {
    this.setState({ error: null })
  }

  render(): ReactNode {
    if (this.state.error) {
      if (this.props.fallback) return this.props.fallback(this.state.error, this.reset)
      return (
        <div className="flex h-full flex-col items-center justify-center gap-3 p-4 text-center">
          <AlertTriangle className="h-8 w-8 text-destructive" />
          <div>
            <p className="text-sm font-medium text-foreground">Erreur de rendu</p>
            <p className="mt-1 max-w-sm text-xs text-muted-foreground break-all">
              {this.state.error.message}
            </p>
          </div>
          <button
            onClick={this.reset}
            className="flex items-center gap-1.5 rounded-md border border-border bg-background px-3 py-1.5 text-xs hover:bg-accent"
          >
            <RefreshCw className="h-3 w-3" />
            Réessayer
          </button>
        </div>
      )
    }
    return this.props.children
  }
}
