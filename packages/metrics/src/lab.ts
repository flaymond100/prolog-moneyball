// Lab test changes (KB §10).

/**
 * A change between tests is meaningful only when it exceeds the typical error
 * the coach entered for that metric. Null when no typical error is set.
 */
export function isMeaningfulChange(change: number, typicalError: number | null): boolean | null {
  if (typicalError === null || typicalError <= 0) return null
  return Math.abs(change) > typicalError
}
