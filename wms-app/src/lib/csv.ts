export interface CsvColumn<T> {
  key: keyof T
  label: string
}

function escapeCsvValue(value: unknown): string {
  const s = value == null ? '' : String(value)
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

export function downloadCsv<T>(filename: string, rows: T[], columns: CsvColumn<T>[]) {
  const header = columns.map((c) => escapeCsvValue(c.label)).join(',')
  const lines = rows.map((row) => columns.map((c) => escapeCsvValue(row[c.key])).join(','))
  const csv = [header, ...lines].join('\n')
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}
