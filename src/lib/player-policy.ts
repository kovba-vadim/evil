export const PLAYER_COOKIE = 'evil-player-token'
export const isDevelopment = () => process.env.NODE_ENV === 'development'

export function safeReturnTo(value: unknown) {
  if (typeof value !== 'string' || !/^\/(?!\/)/.test(value) || /[\\\u0000-\u0020]/.test(value))
    return '/account'
  try {
    const path = decodeURIComponent(new URL(value, 'https://internal.invalid').pathname)
    if (/[\\\u0000-\u0020]/.test(path) || path.startsWith('//')) return '/account'
    return /^\/(?:admin|api|login|register|forgot-password|reset-password)(?:\/|$)/i.test(path)
      ? '/account'
      : value
  } catch {
    return '/account'
  }
}

export function passwordError(password: unknown) {
  return typeof password !== 'string' || password.length < 12 || password.length > 128
    ? 'Пароль должен содержать от 12 до 128 символов.'
    : null
}

// Single-process limiter for the current local Node deployment. Never trust forwarded IPs.
const buckets = new Map<string, { count: number; until: number }>()
export function consumeAttempt(key: string, limit: number, now = Date.now()) {
  for (const [key, value] of buckets) if (value.until <= now) buckets.delete(key)
  const bucket = buckets.get(key) ?? { count: 0, until: now + 15 * 60_000 }
  if (!buckets.has(key) && buckets.size >= 10_000) return false
  buckets.set(key, bucket)
  return ++bucket.count <= limit
}
