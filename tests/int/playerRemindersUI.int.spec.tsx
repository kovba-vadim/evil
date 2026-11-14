import { act, cleanup, fireEvent, render, screen, within, waitFor } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { PlayerReminders } from '../../src/components/public/player-reminders'
import type { ReminderSnapshot, ReminderView } from '../../src/lib/player-reminders'

const now = '2026-11-14T10:00:00.000Z'
const row: ReminderView = {
  id: 1,
  eventID: 1,
  name: 'Персональный ивент',
  slug: 'personal',
  kind: 'once',
  leadMinutes: 10,
  includeCooldown: true,
  enabled: true,
  revision: 'v1',
  proposal: { launchAt: '2026-11-14T10:10:02Z', remindAt: '2026-11-14T10:00:02Z' },
  status: 'scheduled',
  cooldownUntil: null,
}
const initial: ReminderSnapshot = {
  playerID: 1,
  serverNow: now,
  play: { startedAt: '2026-11-14T09:00:00Z', endsAt: '2026-11-14T10:00:02Z', revision: 'play1' },
  reminders: [row, { ...row, id: 2, kind: 'regular', proposal: null, status: 'no-launch' }],
}
afterEach(() => {
  cleanup()
  vi.useRealTimers()
  vi.unstubAllGlobals()
  localStorage.clear()
})

it('expires play mode without a job and marks a past once reminder without claiming delivery', () => {
  vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval', 'performance'] })
  render(<PlayerReminders initial={initial} timeZone="Europe/London" />)
  expect(screen.getByRole('button', { name: 'Продлить на 1 ч.' })).toBeDefined()
  act(() => vi.advanceTimersByTime(3000))
  expect(screen.queryByRole('button', { name: 'Продлить на 1 ч.' })).toBeNull()
  expect(screen.getByRole('button', { name: 'Включить «Я играю»' })).toBeDefined()
  expect(screen.getByText('Ожидает включения «Я играю»')).toBeDefined()
  expect(screen.getByText('Время напоминания прошло. Отправка не подключена.')).toBeDefined()
})
it('hides previous personal settings when a focus refresh finds another account', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue(new Response(JSON.stringify({ ...initial, playerID: 2 }))),
  )
  render(<PlayerReminders initial={initial} timeZone="server" />)
  await act(async () => {
    window.dispatchEvent(new Event('focus'))
  })
  expect(screen.queryAllByText('Персональный ивент')).toHaveLength(0)
  expect(screen.getByText('Сессия изменилась. Обновите страницу или войдите заново.')).toBeDefined()
})
it('does not display an unverified personal snapshot after a failed focus refresh', async () => {
  vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('Нет связи.')))
  render(<PlayerReminders initial={initial} timeZone="server" />)
  await act(async () => {
    window.dispatchEvent(new Event('focus'))
  })
  expect(screen.queryAllByText('Персональный ивент')).toHaveLength(0)
  expect(screen.getByText('Обновите данные для просмотра настроек.')).toBeDefined()
})
it('does not claim play mode was enabled after a failed server operation', async () => {
  vi.stubGlobal(
    'fetch',
    vi
      .fn()
      .mockResolvedValue(
        new Response(JSON.stringify({ message: 'Не сохранено.' }), { status: 500 }),
      ),
  )
  render(<PlayerReminders initial={{ ...initial, play: null, reminders: [] }} timeZone="server" />)
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: 'Включить «Я играю»' }))
  })
  expect(screen.getByText('Не сохранено.')).toBeDefined()
  expect(screen.queryByRole('button', { name: 'Продлить на 1 ч.' })).toBeNull()
})
it('shows a refreshed proposal after 409 and requires a second explicit save', async () => {
  const proposal = {
    serverNow: now,
    revision: null,
    cooldownUntil: null,
    reason: null,
    proposal: row.proposal,
  }
  const next = {
    ...proposal,
    proposal: { launchAt: '2026-11-14T11:00:00Z', remindAt: '2026-11-14T10:50:00Z' },
  }
  const request = vi
    .fn()
    .mockResolvedValueOnce(new Response(JSON.stringify({ ...proposal, playerID: 1 })))
    .mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          message: 'Предложение изменилось. Проверьте новый запуск.',
          proposal: next,
        }),
        { status: 409 },
      ),
    )
    .mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          ...initial,
          play: null,
          reminders: [{ ...row, proposal: next.proposal }],
        }),
      ),
    )
  vi.stubGlobal('fetch', request)
  render(
    <PlayerReminders
      initial={{ ...initial, play: null, reminders: [] }}
      event={{ id: 1, name: row.name }}
      timeZone="server"
    />,
  )
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: 'Напомнить' }))
  })
  const dialog = within(screen.getByRole('dialog'))
  await waitFor(() =>
    expect(
      dialog.getByRole('button', { name: 'Сохранить настройки' }).hasAttribute('disabled'),
    ).toBe(false),
  )
  await act(async () => {
    fireEvent.click(dialog.getByRole('button', { name: 'Сохранить настройки' }))
  })
  expect(dialog.getByRole('alert').textContent).toContain('Предложение изменилось')
  expect(screen.getByRole('dialog').querySelector('time')?.getAttribute('datetime')).toBe(
    next.proposal.launchAt,
  )
  expect(request).toHaveBeenCalledTimes(2)
  await act(async () => {
    fireEvent.click(dialog.getByRole('button', { name: 'Сохранить настройки' }))
  })
  expect(JSON.parse(request.mock.calls[2][1].body).launchAt).toBe(next.proposal.launchAt)
  expect(screen.queryByRole('dialog')).toBeNull()
})
