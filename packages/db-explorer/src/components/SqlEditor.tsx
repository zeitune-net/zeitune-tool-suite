import { useEffect, useRef, useCallback } from 'react'
import { EditorView, keymap, placeholder as cmPlaceholder } from '@codemirror/view'
import { EditorState, Compartment } from '@codemirror/state'
import { sql, PostgreSQL, MySQL, SQLite, type SQLDialect } from '@codemirror/lang-sql'
import { oneDark } from '@codemirror/theme-one-dark'
import { basicSetup } from 'codemirror'
import type { DbType } from '@shared/types'

// ── Zeitune theme overrides ─────────────────────────────────────────────

const zeituneTheme = EditorView.theme({
  '&': {
    fontSize: '13px',
    fontFamily: '"JetBrains Mono", monospace',
    backgroundColor: 'transparent'
  },
  '.cm-content': {
    caretColor: '#9BD564',
    padding: '12px 16px'
  },
  '&.cm-focused': {
    outline: 'none'
  },
  '.cm-gutters': {
    backgroundColor: 'transparent',
    borderRight: '1px solid rgba(155,213,100, 0.10)',
    color: 'rgba(255,255,255,0.2)'
  },
  '.cm-activeLineGutter': {
    backgroundColor: 'transparent',
    color: '#9BD564'
  },
  '.cm-activeLine': {
    backgroundColor: 'rgba(155,213,100, 0.04)'
  },
  '.cm-selectionBackground, ::selection': {
    backgroundColor: 'rgba(155,213,100, 0.15) !important'
  },
  '.cm-cursor': {
    borderLeftColor: '#9BD564'
  },
  '.cm-tooltip.cm-tooltip-autocomplete': {
    backgroundColor: '#1a1a1a',
    border: '1px solid rgba(155,213,100, 0.20)',
    borderRadius: '8px',
    overflow: 'hidden'
  },
  '.cm-tooltip.cm-tooltip-autocomplete > ul > li': {
    padding: '3px 8px',
    fontSize: '12px',
    fontFamily: '"JetBrains Mono", monospace'
  },
  '.cm-tooltip.cm-tooltip-autocomplete > ul > li[aria-selected]': {
    backgroundColor: 'rgba(155,213,100, 0.15)',
    color: '#e8f0d8'
  },
  '.cm-completionLabel': {
    color: '#e8f0d8'
  },
  '.cm-completionDetail': {
    color: '#606060',
    fontStyle: 'normal',
    marginLeft: '8px'
  },
  '.cm-scroller': {
    overflow: 'auto'
  }
}, { dark: true })

// ── Dialect mapping ─────────────────────────────────────────────────────

function getDialect(dbType?: DbType): SQLDialect {
  switch (dbType) {
    case 'mysql': return MySQL
    case 'sqlite': return SQLite
    default: return PostgreSQL
  }
}

// ── Component ───────────────────────────────────────────────────────────

interface SqlEditorProps {
  value: string
  onChange: (value: string) => void
  onRun: () => void
  schema?: Record<string, string[]>
  dbType?: DbType
}

export function SqlEditor({ value, onChange, onRun, schema, dbType }: SqlEditorProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const viewRef = useRef<EditorView | null>(null)
  const onRunRef = useRef(onRun)
  const onChangeRef = useRef(onChange)
  const sqlCompartment = useRef(new Compartment())

  onRunRef.current = onRun
  onChangeRef.current = onChange

  // Create editor once
  useEffect(() => {
    if (!containerRef.current) return

    const runKeymap = keymap.of([
      {
        key: 'F5',
        run: () => { onRunRef.current(); return true }
      },
      {
        key: 'Mod-Enter',
        run: () => { onRunRef.current(); return true }
      }
    ])

    const sqlExt = sql({
      dialect: getDialect(dbType),
      schema: schema,
      upperCaseKeywords: true
    })

    const state = EditorState.create({
      doc: value,
      extensions: [
        basicSetup,
        runKeymap,
        sqlCompartment.current.of(sqlExt),
        zeituneTheme,
        oneDark,
        cmPlaceholder('SELECT * FROM ...'),
        EditorView.updateListener.of((update) => {
          if (update.docChanged) {
            onChangeRef.current(update.state.doc.toString())
          }
        })
      ]
    })

    const view = new EditorView({ state, parent: containerRef.current })
    viewRef.current = view

    return () => {
      view.destroy()
      viewRef.current = null
    }
    // Only create once — value sync handled below
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Sync external value changes (e.g. loading from history/saved)
  useEffect(() => {
    const view = viewRef.current
    if (!view) return
    const currentDoc = view.state.doc.toString()
    if (currentDoc !== value) {
      view.dispatch({
        changes: { from: 0, to: currentDoc.length, insert: value }
      })
    }
  }, [value])

  // Update SQL extension when schema or dialect changes
  useEffect(() => {
    const view = viewRef.current
    if (!view) return
    const newSql = sql({
      dialect: getDialect(dbType),
      schema: schema,
      upperCaseKeywords: true
    })
    view.dispatch({
      effects: sqlCompartment.current.reconfigure(newSql)
    })
  }, [schema, dbType])

  return (
    <div
      ref={containerRef}
      className="h-32 resize-y overflow-hidden bg-card/50"
      style={{ minHeight: '80px' }}
    />
  )
}
