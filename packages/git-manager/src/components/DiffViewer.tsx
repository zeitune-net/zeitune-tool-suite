import { useEffect, useRef } from 'react'
import { X, FileEdit, FilePlus, FileX, Loader2 } from 'lucide-react'
import { cn } from '@shared/lib/utils'
import { Badge } from '@shared/components/ui/badge'
import { useGitManagerStore } from '../store'

interface DiffHunk {
  header: string
  oldStart: number
  newStart: number
  lines: DiffLine[]
}

interface DiffLine {
  type: 'add' | 'del' | 'ctx'
  content: string
  oldNum?: number
  newNum?: number
}

function parseDiff(raw: string, isUntracked: boolean): { hunks: DiffHunk[]; stats: { add: number; del: number } } {
  if (!raw) return { hunks: [], stats: { add: 0, del: 0 } }

  // Untracked: all lines are additions
  if (isUntracked) {
    const lines = raw.split('\n')
    const diffLines: DiffLine[] = lines.map((l, i) => ({
      type: 'add' as const,
      content: l.startsWith('+') ? l.substring(1) : l,
      newNum: i + 1
    }))
    return {
      hunks: [{ header: 'Nouveau fichier', oldStart: 0, newStart: 1, lines: diffLines }],
      stats: { add: lines.length, del: 0 }
    }
  }

  const hunks: DiffHunk[] = []
  let stats = { add: 0, del: 0 }
  const allLines = raw.split('\n')
  let currentHunk: DiffHunk | null = null
  let oldNum = 0
  let newNum = 0

  for (const line of allLines) {
    // Hunk header: @@ -a,b +c,d @@
    const hunkMatch = line.match(/^@@\s+-(\d+)(?:,\d+)?\s+\+(\d+)(?:,\d+)?\s+@@(.*)/)
    if (hunkMatch) {
      currentHunk = {
        header: line,
        oldStart: parseInt(hunkMatch[1]),
        newStart: parseInt(hunkMatch[2]),
        lines: []
      }
      oldNum = parseInt(hunkMatch[1])
      newNum = parseInt(hunkMatch[2])
      hunks.push(currentHunk)
      continue
    }

    if (!currentHunk) continue

    if (line.startsWith('+')) {
      currentHunk.lines.push({ type: 'add', content: line.substring(1), newNum })
      newNum++
      stats.add++
    } else if (line.startsWith('-')) {
      currentHunk.lines.push({ type: 'del', content: line.substring(1), oldNum })
      oldNum++
      stats.del++
    } else if (line.startsWith(' ') || line === '') {
      currentHunk.lines.push({ type: 'ctx', content: line.startsWith(' ') ? line.substring(1) : line, oldNum, newNum })
      oldNum++
      newNum++
    }
  }

  return { hunks, stats }
}

export function DiffViewer() {
  const { diffFile, diffContent, diffLoading, closeDiff } = useGitManagerStore()
  const scrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    scrollRef.current?.scrollTo(0, 0)
  }, [diffFile])

  if (!diffFile) return null

  const fileName = diffFile.filePath.split(/[/\\]/).pop() || diffFile.filePath
  const isUntracked = diffFile.type === 'untracked'
  const { hunks, stats } = parseDiff(diffContent || '', isUntracked)

  const typeIcon = diffFile.type === 'untracked'
    ? <FilePlus className="h-3.5 w-3.5 text-primary" />
    : <FileEdit className="h-3.5 w-3.5 text-warning" />

  const typeLabel = diffFile.type === 'staged' ? 'Staged' : diffFile.type === 'modified' ? 'Modified' : 'Untracked'
  const typeBadgeVariant = diffFile.type === 'staged' ? 'success' as const : diffFile.type === 'modified' ? 'warning' as const : 'secondary' as const

  return (
    <div className="flex h-full flex-col border-l border-border">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-border px-3 py-2">
        <div className="flex items-center gap-2 min-w-0">
          {typeIcon}
          <span className="truncate text-xs font-semibold font-mono" title={diffFile.filePath}>
            {fileName}
          </span>
          <Badge variant={typeBadgeVariant} className="text-[9px] shrink-0">
            {typeLabel}
          </Badge>
          {stats.add > 0 && (
            <span className="text-[10px] font-mono text-green-500">+{stats.add}</span>
          )}
          {stats.del > 0 && (
            <span className="text-[10px] font-mono text-red-400">-{stats.del}</span>
          )}
        </div>
        <button
          onClick={closeDiff}
          className="shrink-0 rounded-lg p-1 hover:bg-muted"
          title="Fermer"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>

      {/* Path */}
      <div className="border-b border-border px-3 py-1">
        <span className="text-[10px] text-muted-foreground font-mono">{diffFile.filePath}</span>
      </div>

      {/* Content */}
      <div ref={scrollRef} className="flex-1 overflow-auto">
        {diffLoading && (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        )}

        {!diffLoading && hunks.length === 0 && (
          <div className="flex items-center justify-center py-12 text-xs text-muted-foreground">
            Aucune modification
          </div>
        )}

        {!diffLoading && hunks.map((hunk, hi) => (
          <div key={hi}>
            {/* Hunk header */}
            <div className="sticky top-0 z-10 bg-info/10 px-3 py-1 text-[10px] font-mono text-info border-y border-info/20">
              {hunk.header}
            </div>

            {/* Lines */}
            <div className="font-mono text-[11px] leading-[18px]">
              {hunk.lines.map((line, li) => (
                <div
                  key={li}
                  className={cn(
                    'flex',
                    line.type === 'add' && 'bg-green-500/10',
                    line.type === 'del' && 'bg-red-500/10'
                  )}
                >
                  {/* Line numbers */}
                  <span className="w-10 shrink-0 select-none text-right pr-1 text-muted-foreground/50 text-[10px]">
                    {line.oldNum ?? ''}
                  </span>
                  <span className="w-10 shrink-0 select-none text-right pr-1 text-muted-foreground/50 text-[10px]">
                    {line.newNum ?? ''}
                  </span>

                  {/* Indicator */}
                  <span className={cn(
                    'w-4 shrink-0 select-none text-center',
                    line.type === 'add' && 'text-green-500',
                    line.type === 'del' && 'text-red-400'
                  )}>
                    {line.type === 'add' ? '+' : line.type === 'del' ? '-' : ' '}
                  </span>

                  {/* Content */}
                  <span className={cn(
                    'flex-1 whitespace-pre pr-3',
                    line.type === 'add' && 'text-green-400',
                    line.type === 'del' && 'text-red-400'
                  )}>
                    {line.content || '\u00A0'}
                  </span>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
