const dateFormat = new Intl.DateTimeFormat('en-GB', {
  day: 'numeric',
  month: 'long',
  year: 'numeric',
  timeZone: 'UTC',
})

/** House style date: "19 October 2026". Input is an ISO `YYYY-MM-DD` date. */
export function formatDate(iso: string): string {
  return dateFormat.format(new Date(`${iso}T00:00:00Z`))
}

const timeFormat = new Intl.DateTimeFormat('en-GB', {
  hour: '2-digit',
  minute: '2-digit',
  timeZone: 'UTC',
})

/** House style date and UTC time: "19 October 2026, 02:30 UTC". Input is an ISO timestamp. */
export function formatDateTime(iso: string): string {
  const date = new Date(iso)
  return `${dateFormat.format(date)}, ${timeFormat.format(date)} UTC`
}

/** Fixed decimals with a proper minus sign, e.g. "−7" and "+6" when `signed`; "–" when there is no value yet. */
export function formatNumber(
  value: number | null | undefined,
  decimals = 0,
  signed = false,
): string {
  if (value === null || value === undefined) return '–'
  const text = Math.abs(value).toFixed(decimals)
  if (value < 0 && Number(text) !== 0) return `−${text}`
  return signed && Number(text) !== 0 ? `+${text}` : text
}

/** Percentage from a 0–1 probability, e.g. 0.837 → "84%". */
export function formatPercent(probability: number): string {
  return `${Math.round(probability * 100)}%`
}
