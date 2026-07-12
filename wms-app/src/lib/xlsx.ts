import type { CsvColumn } from './csv'

// exceljs is large, so it's dynamically imported here rather than at module
// scope — keeps it out of the main bundle, loaded only when Excel
// import/export is actually used.

export async function downloadXlsx<T>(filename: string, rows: T[], columns: CsvColumn<T>[]) {
  const { default: ExcelJS } = await import('exceljs')
  const workbook = new ExcelJS.Workbook()
  const sheet = workbook.addWorksheet('Sheet1')
  sheet.columns = columns.map((c) => ({ header: c.label, key: String(c.key), width: 18 }))
  sheet.addRows(rows.map((row) => Object.fromEntries(columns.map((c) => [String(c.key), row[c.key]]))))
  sheet.getRow(1).font = { bold: true }

  const buffer = await workbook.xlsx.writeBuffer()
  const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

// Returns rows of cell values as strings (header row included), mirroring
// parseCsv's shape so both can feed the same import UI.
export async function parseXlsxRows(file: File): Promise<string[][]> {
  const { default: ExcelJS } = await import('exceljs')
  const workbook = new ExcelJS.Workbook()
  const buffer = await file.arrayBuffer()
  await workbook.xlsx.load(buffer)
  const sheet = workbook.worksheets[0]
  if (!sheet) return []

  const rows: string[][] = []
  sheet.eachRow((row) => {
    const values: string[] = []
    // ExcelJS rows are 1-indexed and row.values[0] is empty — slice it off.
    const cells = Array.isArray(row.values) ? row.values.slice(1) : []
    for (const cell of cells) {
      if (cell == null) {
        values.push('')
      } else if (typeof cell === 'object' && 'text' in cell) {
        values.push(String((cell as { text: unknown }).text ?? ''))
      } else if (cell instanceof Date) {
        values.push(cell.toISOString().slice(0, 10))
      } else {
        values.push(String(cell))
      }
    }
    rows.push(values)
  })
  return rows
}
