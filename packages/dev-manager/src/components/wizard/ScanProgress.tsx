import { Loader2 } from 'lucide-react'
import type { ScanProgress as ScanProgressData } from '../../types'

interface Props {
  rootPath: string
  progress: ScanProgressData | null
}

export function ScanProgress({ rootPath, progress }: Props) {
  return (
    <div className="flex flex-col items-center justify-center py-12">
      <Loader2 className="h-8 w-8 animate-spin text-primary" />
      <p className="mt-3 text-sm text-muted-foreground">Scan des services...</p>
      <p className="mt-1 truncate max-w-full px-4 text-xs text-muted-foreground">{rootPath}</p>
      {progress && (
        <div className="mt-3 text-center">
          <p className="truncate max-w-[22rem] px-4 text-[10px] font-mono text-muted-foreground">
            {progress.current || '—'}
          </p>
          <p className="mt-1 text-[10px] text-muted-foreground">
            {progress.scanned} dossier{progress.scanned > 1 ? 's' : ''} · {progress.found} service
            {progress.found > 1 ? 's' : ''} détecté{progress.found > 1 ? 's' : ''}
          </p>
        </div>
      )}
    </div>
  )
}
