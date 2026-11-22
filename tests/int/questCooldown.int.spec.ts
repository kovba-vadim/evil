import { expect, it } from 'vitest'
import { formatQuestCooldown } from '../../src/lib/quest-cooldown'

it.each([
  [0, 'Без КД'],
  [30, '30 мин.'],
  [60, '1 ч.'],
  [720, '12 ч.'],
  [1440, '1 д.'],
  [2880, '2 д.'],
  [3600, '2 д. 12 ч.'],
  [1501, '1 д. 1 ч. 1 мин.'],
])('formats %s minutes as %s', (minutes, label) => {
  expect(formatQuestCooldown(minutes)).toBe(label)
})
