import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { testDatabaseURL } from '../helpers/testDatabase'

beforeEach(() => {
  vi.stubEnv('NODE_ENV', 'test')
  vi.stubEnv('PAYLOAD_DROP_DATABASE', 'false')
  vi.stubEnv('PAYLOAD_MIGRATING', 'false')
})
afterEach(() => vi.unstubAllEnvs())

describe('test database isolation before Payload initialization', () => {
  const live = 'postgresql://live:secret@localhost:5432/evil'
  it('accepts a separately named test database', () => {
    const target = 'postgresql://test:secret@127.0.0.1:5432/evil_model_test'
    expect(testDatabaseURL(target, live)).toBe(target)
  })
  it.each([
    '',
    'invalid-secret-url',
    'mongodb://localhost/evil_test',
    'postgresql://test:secret@localhost/evil',
    'postgresql://test:secret@localhost/evil_test?database=evil',
    'postgresql://test:secret@localhost/evil_test#ignored',
  ])('rejects unsafe connection input without exposing it', (target) => {
    expect(() => testDatabaseURL(target, live)).toThrow('Connection details are hidden')
    try {
      testDatabaseURL(target, live)
    } catch (error) {
      expect(String(error)).not.toContain('secret')
    }
  })
  it('rejects the working database even with another password or hostname alias', () => {
    expect(() =>
      testDatabaseURL(
        'postgresql://other:new@127.0.0.1/evil_test',
        'postgresql://live:old@localhost/evil_test',
      ),
    ).toThrow()
  })
  it('requires the working URL for comparison', () => {
    expect(() => testDatabaseURL('postgresql://test:secret@localhost/evil_test', '')).toThrow()
  })
  it('rejects an encoded alias of the working database name', () => {
    expect(() =>
      testDatabaseURL(
        'postgresql://test:secret@localhost/evil_test',
        'postgresql://live:secret@localhost/%65vil_test',
      ),
    ).toThrow()
  })
  it.each(['PAYLOAD_DROP_DATABASE', 'PAYLOAD_MIGRATING'])('rejects unsafe %s mode', (key) => {
    vi.stubEnv(key, 'true')
    expect(() => testDatabaseURL('postgresql://test:secret@localhost/evil_test', live)).toThrow()
  })
})
