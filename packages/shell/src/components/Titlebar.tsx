import { useState, useEffect } from 'react'
import { Minus, Square, X, Copy } from 'lucide-react'

export function Titlebar() {
  const [isMaximized, setIsMaximized] = useState(false)
  const isWindows = window.electron?.platform !== 'darwin'

  useEffect(() => {
    window.electron?.ipcRenderer.invoke('window:isMaximized').then((val) => {
      setIsMaximized(val as boolean)
    })
    const unsub = window.electron?.ipcRenderer.on('window:maximized-changed', (maximized) => {
      setIsMaximized(maximized as boolean)
    })
    return () => unsub?.()
  }, [])

  return (
    <div className="drag-region header-blur flex h-11 items-center justify-between border-b border-border px-3">
      <div className="flex items-center gap-2.5 no-drag">
        <div className="flex h-6 w-6 items-center justify-center rounded-md bg-primary/90">
          <span className="text-[10px] font-bold text-white">Z</span>
        </div>
        <span className="text-sm font-semibold text-foreground">Zeitune <span className="text-muted-foreground font-normal">Tool Suite</span></span>
      </div>

      {isWindows && (
        <div className="no-drag flex items-center">
          <button
            onClick={() => window.electron?.ipcRenderer.send('window:minimize')}
            className="flex h-8 w-[46px] items-center justify-center text-muted-foreground transition-[background,color] duration-[120ms] hover:bg-muted hover:text-foreground"
          >
            <Minus className="h-4 w-4" />
          </button>
          <button
            onClick={() => window.electron?.ipcRenderer.send('window:maximize')}
            className="flex h-8 w-[46px] items-center justify-center text-muted-foreground transition-[background,color] duration-[120ms] hover:bg-muted hover:text-foreground"
          >
            {isMaximized ? <Copy className="h-3.5 w-3.5" /> : <Square className="h-3.5 w-3.5" />}
          </button>
          <button
            onClick={() => window.electron?.ipcRenderer.send('window:close')}
            className="flex h-8 w-[46px] items-center justify-center text-muted-foreground transition-[background,color] duration-[120ms] hover:bg-[#e81123] hover:text-white"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}
    </div>
  )
}
