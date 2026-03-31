import { useState, useEffect } from 'react'
import { X, Loader2, FileText } from 'lucide-react'
import { cn } from '@shared/lib/utils'
import * as gitIpc from '../services/git-ipc'

interface DiffLine {
  type: 'header' | 'add' | 'remove' | 'context' | 'hunk'
  content: string
  oldLine?: number
  newLine?: number
}

function parseDiff(raw: string): DiffLine[] {
  if (!raw) return []
  const lines = raw.split('\n')
  const result: DiffLine[] = []
  let oldLine = 0
  let newLine = 0

  for (const line of lines) {
    if (line.startsWith('diff ') || line.startsWith('index ') || line.startsWith('---') || line.startsWith('+++')) {
      result.push({ type: 'header', content: line })
    } else if (line.startsWith('@@')) {
      const match = line.match(/@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@(.*)/)
      if (match) {
        oldLine = parseInt(match[1])
        newLine = parseInt(match[2])
      }
      result.push({ type: 'hunk', content: line })
    } else if (line.startsWith('+')) {
      result.push({ type: 'add', content: line.substring(1), newLine })
      newLine++
    } else if (line.startsWith('-')) {
      result.push({ type: 'remove', content: line.substring(1), oldLine })
      oldLine++
    } else {
      result.push({ type: 'context', content: line.substring(1) || '', oldLine, newLine })
      oldLine++
      newLine++
    }
  }
  return result
}

const lineStyles: Record<DiffLine['type'], string> = {
  add: 'bg-primary/8 text-primary',
  remove: 'bg-destructive/8 text-destructive',
  context: 'text-foreground/70',
  hunk: 'bg-info/5 text-info font-medium',
  header: 'text-muted-foreground'
}

export function DiffViewer({
  repoPath,
  filePath,
  staged,
  isUntracked,
  onClose
}: {
  repoPath: string
  filePath: string
  staged: boolean
  isUntracked?: boolean
  onClose: () => void
}) {
  const [diff, setDiff] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    setLoading(true)

    if (isUntracked) {
      gitIpc
        .getFileContent(repoPath, filePath)
        .then((content) => {
          if (!cancelled) {
            // Format as a unified diff-like output for display
            if (content) {
              const lines = content.split('\n').map((l) => '+' + l).join('\n')
              setDiff(`diff --git a/${filePath} b/${filePath}\nnew file\n--- /dev/null\n+++ b/${filePath}\n@@ -0,0 +1,${content.split('\n').length} @@\n${lines}`)
            } else {
              setDiff(null)
            }
          }
        })
        .catch(() => { if (!cancelled) setDiff(null) })
        .finally(() => { if (!cancelled) setLoading(false) })
      return
    }

    gitIpc
      .getDiff(repoPath, filePath, staged)
      .then((res) => { if (!cancelled) setDiff(res.diff) })
      .catch(() => { if (!cancelled) setDiff(null) })
      .finally(() => { if (!cancelled) setLoading(false) })

    return () => { cancelled = true }
  }, [repoPath, filePath, staged, isUntracked])

  const lines = diff ? parseDiff(diff) : []
  const fileName = filePath.split(/[/\\]/).pop() || filePath

  return (
    <div className="mt-2 rounded-lg border border-border overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-border bg-card px-3 py-2">
        <div className="flex items-center gap-2">
          <FileText className="h-3.5 w-3.5 text-muted-foreground" />
          <span className="text-xs font-mono font-medium">{fileName}</span>
          <span className="text-[10px] text-muted-foreground">{filePath}</span>
        </div>
        <button
          onClick={onClose}
          className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
        >
          <X className="h-3 w-3" />
        </button>
      </div>

      {/* Content */}
      <div className="max-h-80 overflow-auto bg-card/50">
        {loading && (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
          </div>
        )}
        {!loading && isUntracked && lines.length === 0 && (
          <p className="py-6 text-center text-xs text-muted-foreground">
            Fichier non suivi — contenu vide ou illisible
          </p>
        )}
        {!loading && !isUntracked && lines.length === 0 && (
          <p className="py-6 text-center text-xs text-muted-foreground">
            Aucune différence
          </p>
        )}
        {!loading && lines.length > 0 && (
          <table className="w-full text-[11px] font-mono leading-5">
            <tbody>
              {lines.map((line, i) => (
                <tr key={i} className={cn(lineStyles[line.type])}>
                  {line.type === 'header' || line.type === 'hunk' ? (
                    <td colSpan={3} className="px-3 py-0.5 select-text">
                      {line.content}
                    </td>
                  ) : (
                    <>
                      <td className="w-10 select-none px-2 text-right text-muted-foreground/50 border-r border-border/50">
                        {line.type !== 'add' ? line.oldLine : ''}
                      </td>
                      <td className="w-10 select-none px-2 text-right text-muted-foreground/50 border-r border-border/50">
                        {line.type !== 'remove' ? line.newLine : ''}
                      </td>
                      <td className="px-3 py-0 whitespace-pre select-text">
                        <span className={cn(
                          'inline-block w-3',
                          line.type === 'add' && 'text-primary',
                          line.type === 'remove' && 'text-destructive'
                        )}>
                          {line.type === 'add' ? '+' : line.type === 'remove' ? '-' : ' '}
                        </span>
                        {line.content}
                      </td>
                    </>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
