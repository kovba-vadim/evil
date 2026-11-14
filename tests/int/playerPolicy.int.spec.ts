import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  consumeAttempt,
  isDevelopment,
  passwordError,
  safeReturnTo,
} from '../../src/lib/player-policy'

afterEach(() => vi.unstubAllEnvs())
describe('player portal policy', () => {
  it('allows internal returns and rejects external URLs, admin and auth loops', () => {
    expect(safeReturnTo('/events/example?view=next')).toBe('/events/example?view=next')
    for (const value of [
      'https://evil.test',
      '//evil.test',
      '/\\evil.test',
      '/admin',
      '/api/users',
      '/login?returnTo=/',
      '/reset-password',
      '/\nevil',
      undefined,
    ]) {
      expect(safeReturnTo(value)).toBe('/account')
    }
  })
  it('enforces password bounds without silently truncating', () => {
    expect(passwordError('a'.repeat(12))).toBeNull()
    expect(passwordError('a'.repeat(128))).toBeNull()
    for (const password of ['', 'a'.repeat(11), 'a'.repeat(129), null, 123])
      expect(passwordError(password)).toBeTruthy()
  })
  it('has bounded windows and permits retries after expiration', () => {
    const key = crypto.randomUUID()
    expect(consumeAttempt(key, 2, 100)).toBe(true)
    expect(consumeAttempt(key, 2, 101)).toBe(true)
    expect(consumeAttempt(key, 2, 102)).toBe(false)
    expect(consumeAttempt(key, 2, 900_100)).toBe(true)
  })
  it('enables local bypass only for development', () => {
    for (const mode of ['production', 'test', '']) {
      vi.stubEnv('NODE_ENV', mode)
      expect(isDevelopment()).toBe(false)
    }
    vi.stubEnv('NODE_ENV', 'development')
    expect(isDevelopment()).toBe(true)
  })
})
