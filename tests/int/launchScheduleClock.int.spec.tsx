import { act, cleanup, render, screen } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { useServerClock } from '../../src/components/public/time-zone'
import { LaunchSchedule } from '../../src/components/public/launch-schedule'
import { TIME_ZONE_STORAGE_KEY } from '../../src/lib/time-zones'
afterEach(() => {
  cleanup()
  vi.useRealTimers()
  localStorage.clear()
})
it('removes passed rows on the monotonic client clock without waiting for a server refresh', () => {
  vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval', 'performance'] })
  const event = {
    id: 1,
    name: 'Test event',
    slug: 'test-event',
    coins: 0,
    shortDescription: null,
    rewards: [],
  }
  render(
    <LaunchSchedule
      initial={{
        now: '2026-01-01T00:00:00Z',
        window: { start: '2026-01-01T00:00:00Z', end: '2026-01-02T00:00:00Z', mode: 'rolling' },
        notice: null,
        rows: [
          { key: 'soon', instant: '2026-01-01T00:00:02Z', event },
          { key: 'later', instant: '2026-01-01T01:00:00Z', event },
        ],
      }}
      options={{ minimum: 0, maximum: 0, resources: [] }}
    />,
  )
  expect(screen.getByText('Запусков: 2')).toBeDefined()
  act(() => vi.advanceTimersByTime(3000))
  expect(screen.getByText('Запусков: 1')).toBeDefined()
})
it('replaces an unknown persisted zone with the fixed server default', () => {
  localStorage.setItem(TIME_ZONE_STORAGE_KEY, 'bad-zone')
  render(
    <LaunchSchedule
      initial={{
        now: '2026-01-01T00:00:00Z',
        window: { start: '2026-01-01T00:00:00Z', end: '2026-01-02T00:00:00Z', mode: 'rolling' },
        notice: null,
        rows: [],
      }}
      options={{ minimum: 0, maximum: 0, resources: [] }}
    />,
  )
  expect(localStorage.getItem(TIME_ZONE_STORAGE_KEY)).toBe('server')
})

it('does not move the display clock backwards when a slow refresh contains an older server timestamp', () => {
  vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval', 'performance'] })
  function Clock({ now }: { now: string }) {
    return <p>{useServerClock(now)}</p>
  }
  const { rerender } = render(<Clock now="2026-01-01T00:00:00Z" />)
  act(() => vi.advanceTimersByTime(3000))
  rerender(<Clock now="2026-01-01T00:00:01Z" />)
  act(() => vi.advanceTimersByTime(1000))
  expect(screen.getByText('2026-01-01T00:00:04.000Z')).toBeDefined()
})
