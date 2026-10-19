/** Effort duration for axes and tables: 5 → "5 s", 300 → "5 min", 3600 → "60 min". */
export function formatDuration(secs: number): string {
  if (secs < 60) return `${secs} s`
  return `${Math.round(secs / 60)} min`
}
