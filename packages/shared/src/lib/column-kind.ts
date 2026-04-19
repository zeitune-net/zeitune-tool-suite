// Inférence du "kind" d'une colonne depuis son type SQL brut.
// Couvre PostgreSQL (udt_name), MySQL, SQLite (type affinity).

export type ColumnKind = 'number' | 'boolean' | 'date' | 'datetime' | 'string'

export function inferColumnKind(rawType: string | null | undefined): ColumnKind {
  if (!rawType) return 'string'
  const t = rawType.toLowerCase()

  // Boolean
  if (/^bool/.test(t) || t === 'tinyint(1)' || t === 'bit') return 'boolean'

  // Datetime (doit être testé avant "date" car "timestamp" contient "time")
  if (/^timestamp|datetime/.test(t)) return 'datetime'

  // Date / time seul
  if (/^(date|time)$/.test(t) || /^time[tz_]/.test(t)) return 'date'

  // Number : int*, smallint, bigint, mediumint, tinyint, numeric, decimal, real, double, float, money, serial
  if (/^(int|bigint|smallint|tinyint|mediumint|numeric|decimal|real|double|float|money|serial|bigserial|smallserial)/.test(t)) {
    return 'number'
  }

  return 'string'
}

// Formate une valeur pour l'insérer dans du SQL brut selon le kind.
// Retourne le littéral SQL (pas de placeholder). Échappe les apostrophes.
// Pour `null` / valeur vide non-number, retourne null (caller décide quoi faire).
export function formatSqlLiteral(
  value: string,
  kind: ColumnKind,
  dialect: 'postgresql' | 'mysql' | 'sqlite'
): string | null {
  const v = value.trim()
  if (v === '') return null

  if (kind === 'number') {
    // Valide un nombre; sinon retourne null (filtre ignoré)
    if (!/^-?\d+(\.\d+)?$/.test(v)) return null
    return v
  }

  if (kind === 'boolean') {
    const truthy = /^(true|t|1|yes|y)$/i.test(v)
    const falsy = /^(false|f|0|no|n)$/i.test(v)
    if (!truthy && !falsy) return null
    if (dialect === 'postgresql') return truthy ? 'TRUE' : 'FALSE'
    return truthy ? '1' : '0'
  }

  // date / datetime / string : chaîne échappée
  return `'${v.replace(/'/g, "''")}'`
}
