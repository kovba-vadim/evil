import { describe, expect, it } from 'vitest'
import {
  legacyQuestCooldown,
  migrateQuestCooldown,
  readQuestCooldown,
} from '../../src/hooks/questCooldown'
import type { FieldHook } from 'payload'

type Args = Parameters<typeof migrateQuestCooldown>[0]
const migrate = (data: Args['data'], originalDoc?: Partial<NonNullable<Args['originalDoc']>>) =>
  migrateQuestCooldown({ data, originalDoc } as unknown as Args)

describe('non-destructive quest cooldown transition without database', () => {
  it.each([
    [0, '0 минут'],
    [360, '360 минут'],
  ])('keeps units for %s minutes', (value, text) => {
    expect(legacyQuestCooldown(value)).toBe(text)
  })
  it('converts a saved numeric cooldown during a normal PATCH', () => {
    expect(migrate({ name: 'Новое имя' }, { cooldownMinutes: 360 })).toMatchObject({
      cooldown: '360 минут',
      cooldownMinutes: null,
    })
  })
  it('does not overwrite descriptive text', () => {
    expect(
      migrate({ name: 'Имя' }, { cooldown: 'Раз в сутки', cooldownMinutes: 360 }),
    ).toMatchObject({ cooldown: 'Раз в сутки' })
  })
  it.each(['', null])('keeps an explicit clear %s', (cooldown) => {
    expect(migrate({ cooldown }, { cooldownMinutes: 360 })).toMatchObject({
      cooldown,
      cooldownMinutes: null,
    })
  })
  it('leaves a new empty cooldown unset instead of creating zero', () => {
    expect(migrate({ name: 'Квест' })).not.toHaveProperty('cooldown')
  })
  it('makes old minutes visible before a write without modifying the source', async () => {
    const siblingData = { cooldownMinutes: 360 }
    expect(
      await readQuestCooldown({ value: null, siblingData } as unknown as Parameters<FieldHook>[0]),
    ).toBe('360 минут')
    expect(siblingData.cooldownMinutes).toBe(360)
  })
})
