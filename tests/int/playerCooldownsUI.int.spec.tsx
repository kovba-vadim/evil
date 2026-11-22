import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { PlayerCooldowns } from '../../src/components/public/player-cooldowns'
import type { CooldownSnapshot } from '../../src/lib/player-cooldowns'

const initial: CooldownSnapshot = {
  playerID: 1,
  serverNow: '2026-11-14T10:00:00.000Z',
  records: [
    {
      id: 12,
      eventID: 10,
      name: 'Личный ивент',
      slug: 'personal',
      completedAt: '2026-11-14T09:00:00.000Z',
      cooldownUntil: '2026-11-14T10:00:02.000Z',
      cancelled: false,
      revision: 'original',
    },
  ],
}
afterEach(() => {
  cleanup()
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

it('removes expired items from the account without reloading or counting timer ticks', () => {
  vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval', 'performance'] })
  render(<PlayerCooldowns initial={initial} timeZone="Europe/London" />)
  expect(screen.getByRole('link', { name: 'Личный ивент' })).toBeDefined()
  act(() => vi.advanceTimersByTime(3000))
  expect(screen.queryByRole('link', { name: 'Личный ивент' })).toBeNull()
  expect(screen.getByText('Активных личных КД нет.')).toBeDefined()
})
it('enables a new mark when the event cooldown expires without claiming availability', () => {
  vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval', 'performance'] })
  render(<PlayerCooldowns initial={initial} eventID={10} timeZone="server" />)
  expect(screen.queryByRole('button', { name: 'Прошёл' })).toBeNull()
  act(() => vi.advanceTimersByTime(3000))
  expect(screen.getByText('КД закончился.')).toBeDefined()
  expect(screen.getByRole('button', { name: 'Прошёл' })).toBeDefined()
})
it('requires explicit cancellation confirmation and preserves the mark on server failure', async () => {
  const request = vi
    .fn()
    .mockResolvedValue(new Response(JSON.stringify({ message: 'Не сохранено.' }), { status: 500 }))
  vi.stubGlobal('fetch', request)
  render(<PlayerCooldowns initial={initial} eventID={10} timeZone="server" />)
  fireEvent.click(screen.getByRole('button', { name: 'Отменить отметку' }))
  expect(request).not.toHaveBeenCalled()
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: 'Да, отменить' }))
  })
  expect(screen.getByRole('alert').textContent).toContain('Не сохранено.')
  expect(screen.queryByRole('button', { name: 'Прошёл' })).toBeNull()
})
it('clears previous personal data when focus refresh discovers another account', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue(new Response(JSON.stringify({ ...initial, playerID: 2 }))),
  )
  render(<PlayerCooldowns initial={initial} timeZone="server" />)
  await act(async () => {
    window.dispatchEvent(new Event('focus'))
  })
  expect(screen.queryByRole('link', { name: 'Личный ивент' })).toBeNull()
  expect(screen.getByText(/Сессия изменилась/)).toBeDefined()
})
it('does not reveal a previous snapshot if focus revalidation fails', async () => {
  vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('Нет сети.')))
  render(<PlayerCooldowns initial={initial} timeZone="server" />)
  await act(async () => {
    window.dispatchEvent(new Event('focus'))
  })
  expect(screen.queryByRole('link', { name: 'Личный ивент' })).toBeNull()
  expect(screen.getByRole('alert').textContent).toContain('Нет сети.')
})

it('starts a new request after an ambiguous save has been resolved by a server refresh', async () => {
  vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval', 'performance'] })
  const request = vi
    .fn()
    .mockRejectedValueOnce(new Error('Нет сети.'))
    .mockResolvedValueOnce(new Response(JSON.stringify(initial)))
    .mockResolvedValueOnce(new Response(JSON.stringify(initial)))
  vi.stubGlobal('fetch', request)
  render(<PlayerCooldowns initial={{ ...initial, records: [] }} eventID={10} timeZone="server" />)
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: 'Прошёл' }))
  })
  const firstID = JSON.parse(request.mock.calls[0][1].body).requestID
  await act(async () => {
    window.dispatchEvent(new Event('focus'))
  })
  act(() => vi.advanceTimersByTime(3000))
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: 'Прошёл' }))
  })
  const next = JSON.parse(request.mock.calls[2][1].body)
  expect(next.requestID).not.toBe(firstID)
  expect(next.previousRevision).toBe('original')
})
