// ISO `YYYY-MM-DD` dates, read as UTC days.

export const MS_PER_DAY = 86_400_000

export function parseIsoDate(value: string): Date {
  const date = new Date(`${value}T00:00:00Z`)
  if (Number.isNaN(date.getTime())) throw new RangeError(`Invalid ISO date: ${value}`)
  return date
}

/** Whole days from `from` to `to` (negative when `to` is earlier). */
export function daysBetween(from: string, to: string): number {
  return Math.round((parseIsoDate(to).getTime() - parseIsoDate(from).getTime()) / MS_PER_DAY)
}
