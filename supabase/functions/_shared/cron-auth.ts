// Shared-secret check for functions called by pg_cron (TODO 3.1, 3.6).

/**
 * True when the request's `x-cron-secret` header equals the expected secret.
 * Compares in constant time for equal lengths; an empty or missing secret on
 * either side never matches.
 */
export function cronSecretMatches(request: Request, expected: string | undefined): boolean {
  const given = request.headers.get('x-cron-secret') ?? ''
  if (expected === undefined || expected === '' || given.length !== expected.length) return false
  let diff = 0
  for (let i = 0; i < given.length; i++) diff |= given.charCodeAt(i) ^ expected.charCodeAt(i)
  return diff === 0
}
