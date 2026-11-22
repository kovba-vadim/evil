import { act, cleanup, fireEvent, render, screen, within, waitFor } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { PlayerReminders } from '../../src/components/public/player-reminders'
import { HeaderPlayPeriod } from '../../src/components/public/header-play-period'
import type { ReminderSnapshot, ReminderView } from '../../src/lib/player-reminders'
import { COOLDOWN_CHANGED_EVENT } from '../../src/lib/player-cooldowns'

vi.mock('next/navigation', () => ({ usePathname: () => '/events' }))

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

it.each([
  ['account', undefined],
  ['event', { id: 1, name: row.name }],
] as const)(
  'keeps an enabled subscription active after failed requests in the %s',
  async (_, event) => {
    let fail: (response: Response) => void = () => {}
    const request = vi
      .fn()
      .mockImplementationOnce(
        () =>
          new Promise<Response>((resolve) => {
            fail = resolve
          }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ message: 'Удалить не удалось.' }), { status: 500 }),
      )
    vi.stubGlobal('fetch', request)
    render(<PlayerReminders initial={initial} timeZone="server" event={event} />)
    const regular = within(screen.getByRole('region', { name: 'Регулярные подписки' }))
    const toggle = regular.getByRole('button', { name: 'Отключить подписку' }) as HTMLButtonElement
    expect(toggle.querySelector('.lucide-bell-ring')).not.toBeNull()
    expect(toggle.classList.contains('text-green-700')).toBe(true)
    fireEvent.click(toggle)
    expect(toggle.disabled).toBe(true)
    fireEvent.click(toggle)
    expect(request).toHaveBeenCalledTimes(1)
    await act(async () =>
      fail(new Response(JSON.stringify({ message: 'Переключить не удалось.' }), { status: 500 })),
    )
    expect(regular.getByRole('button', { name: 'Отключить подписку' })).toBe(toggle)
    expect(screen.getByText('Переключить не удалось.')).toBeDefined()

    fireEvent.click(regular.getByRole('button', { name: 'Удалить подписку' }))
    expect(request).toHaveBeenCalledTimes(1)
    const alert = within(screen.getByRole('alertdialog', { name: 'Удалить подписку?' }))
    fireEvent.click(alert.getByRole('button', { name: 'Удалить' }))
    expect((await alert.findByRole('alert')).textContent).toBe('Удалить не удалось.')
    fireEvent.click(alert.getByRole('button', { name: 'Отмена' }))
    expect(regular.getByRole('listitem')).toBeDefined()
  },
)

it('hides legacy once settings and offers a regular subscription', () => {
  render(
    <PlayerReminders
      initial={{ ...initial, reminders: [row] }}
      timeZone="server"
      event={{ id: 1, name: row.name }}
    />,
  )
  expect(screen.queryByRole('region', { name: 'Разовые напоминания' })).toBeNull()
  expect(screen.getByRole('button', { name: 'Напомнить' })).toBeDefined()
})
it('refreshes regular subscriptions after a cooldown change', async () => {
  const regular = initial.reminders[1]
  const request = vi
    .fn()
    .mockResolvedValue(new Response(JSON.stringify({ ...initial, reminders: [regular] })))
  vi.stubGlobal('fetch', request)
  render(<PlayerReminders initial={initial} timeZone="server" />)
  await act(async () => {
    window.dispatchEvent(new Event(COOLDOWN_CHANGED_EVENT))
  })
  expect(request).toHaveBeenCalled()
  expect(screen.getByRole('button', { name: 'Изменить подписку' })).toBeDefined()
})

it('expires play mode without a job and suppresses ready previews', () => {
  vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval', 'performance'] })
  render(<PlayerReminders initial={initial} timeZone="Europe/London" />)
  expect(screen.getByRole('button', { name: 'Продлить на 1 ч.' })).toBeDefined()
  act(() => vi.advanceTimersByTime(3000))
  expect(screen.queryByRole('button', { name: 'Продлить на 1 ч.' })).toBeNull()
  expect(screen.getByRole('button', { name: 'Включить «Я играю»' })).toBeDefined()
  expect(screen.getByText('Ожидает включения «Я играю»')).toBeDefined()
  expect(document.querySelector('.player-reminders__preview')).toBeNull()
})

it('greys out the header after the server-confirmed play period elapses', () => {
  vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval', 'performance'] })
  render(<HeaderPlayPeriod initial={initial} />)
  const button = screen.getByRole('button', { name: 'Я играю — включено' })
  expect(button.classList.contains('text-green-700')).toBe(true)
  act(() => vi.advanceTimersByTime(3000))
  expect(screen.getByRole('button', { name: 'Я играю — выключено' })).toBe(button)
  expect(button.classList.contains('text-muted-foreground')).toBe(true)
})

it('clears the header state after the server rejects an expired account session', async () => {
  const fetchPeriod = vi.fn().mockResolvedValue(new Response(null, { status: 401 }))
  vi.stubGlobal('fetch', fetchPeriod)
  render(<HeaderPlayPeriod initial={initial} />)
  await act(async () => window.dispatchEvent(new Event('focus')))
  const button = screen.getByRole('button', { name: 'Я играю — выключено' })
  fireEvent.click(button)
  expect(screen.getByRole('dialog', { name: 'Режим «Я играю»' })).toBeDefined()
  expect(fetchPeriod).toHaveBeenCalledTimes(1)
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
  expect(JSON.parse(request.mock.calls[2][1].body)).toMatchObject({
    kind: 'regular',
    launchAt: null,
  })
  expect(screen.queryByRole('dialog')).toBeNull()
})
