export type CsvCell = string | number | null

function escape(cell: CsvCell): string {
  if (cell === null) return ''
  const text = String(cell)
  return /[",\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text
}

export function toCsv(header: readonly string[], rows: readonly (readonly CsvCell[])[]): string {
  return [header, ...rows].map((row) => row.map(escape).join(',')).join('\n') + '\n'
}

export function downloadCsv(filename: string, csv: string) {
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }))
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.click()
  URL.revokeObjectURL(url)
}
