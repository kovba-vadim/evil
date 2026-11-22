import { afterEach, beforeEach, expect, it, vi } from 'vitest'
const mock = vi.hoisted(() => ({
  session: vi.fn(),
  read: vi.fn(),
  preview: vi.fn(),
  write: vi.fn(),
}))
vi.mock('@/auth/players', () => ({ playerSession: mock.session }))
vi.mock('@/queries/player-reminders', () => ({
  getPlayerReminders: mock.read,
  previewReminder: mock.preview,
  mutatePlayerReminders: mock.write,
  ReminderConflict: class extends Error {},
}))
import { GET, POST } from '../../src/app/(frontend)/api/account/reminders/route'

const user = { id: 98765, collection: 'players' }
const snapshot = { playerID: user.id, serverNow: '2026-11-14T10:00:00Z', play: null, reminders: [] }
const valid = () => ({
  action: 'save',
  eventID: 1,
  kind: 'regular',
  leadMinutes: 10,
  includeCooldown: true,
  enabled: true,
  launchAt: null,
  revision: null,
  requestID: crypto.randomUUID(),
})
const post = (data: object, origin = 'http://localhost:3000', headers?: Record<string, string>) =>
  POST(
    new Request('http://localhost:3000/api/account/reminders', {
      method: 'POST',
      headers: { Origin: origin, 'Content-Type': 'application/json', ...headers },
      body: JSON.stringify(data),
    }),
  )
beforeEach(() => {
  vi.clearAllMocks()
  mock.session.mockResolvedValue({ payload: {}, user })
  mock.read.mockResolvedValue(snapshot)
  mock.write.mockResolvedValue(snapshot)
})
afterEach(() => vi.unstubAllEnvs())

it('requires an authenticated player and exact origin for writes', async () => {
  expect((await post(valid(), 'https://external.test')).status).toBe(403)
  expect(mock.session).not.toHaveBeenCalled()
  mock.session.mockResolvedValue({ payload: {}, user: null })
  expect((await post(valid())).status).toBe(401)
  expect((await GET(new Request('http://localhost:3000/api/account/reminders'))).status).toBe(401)
  expect(mock.write).not.toHaveBeenCalled()
})
it('rejects owner/server date injection, invalid minutes and out-of-policy play durations', async () => {
  for (const leadMinutes of [0, 121, 1.5, '10'])
    expect((await post({ ...valid(), leadMinutes })).status).toBe(400)
  for (const extra of [
    { playerID: 2 },
    { player: 2 },
    { remindAt: '2099-01-01' },
    { endsAt: '2099-01-01' },
  ])
    expect((await post({ ...valid(), ...extra })).status).toBe(400)
  expect(
    (
      await post({
        action: 'play',
        operation: 'start',
        hours: 3,
        revision: null,
        requestID: crypto.randomUUID(),
      })
    ).status,
  ).toBe(400)
  expect(mock.write).not.toHaveBeenCalled()
})
it('bounds body size before parsing and never forwards untrusted owner parameters', async () => {
  expect((await post({ ...valid(), extra: 'x'.repeat(3000) })).status).toBe(413)
  const input = valid()
  expect((await post(input)).status).toBe(200)
  expect(mock.write).toHaveBeenCalledWith({}, user, input, undefined)
})

it('rejects a catalog write from a tab opened under a different player session', async () => {
  const input = valid()
  const origin = 'http://localhost:3000'
  expect((await post(input, origin, { 'X-Reminder-Player': '2' })).status).toBe(401)
  expect(mock.write).not.toHaveBeenCalled()
  expect((await post(input, origin, { 'X-Reminder-Player': String(user.id) })).status).toBe(200)
  expect(mock.write).toHaveBeenCalledWith({}, user, input, undefined)
})
it('uses private no-store responses and the session owner for all reads', async () => {
  const response = await GET(
    new Request('http://localhost:3000/api/account/reminders?playerID=123'),
  )
  expect(response.headers.get('cache-control')).toContain('private, no-store')
  expect(response.headers.get('vary')).toBe('Cookie')
  expect(mock.read).toHaveBeenCalledWith({}, user, undefined)
  expect(await response.json()).toEqual(snapshot)
})
it('validates preview parameters on the server', async () => {
  expect(
    (
      await GET(
        new Request(
          'http://localhost:3000/api/account/reminders?preview=1&eventID=1&kind=once&leadMinutes=10',
        ),
      )
    ).status,
  ).toBe(400)
  expect(mock.preview).not.toHaveBeenCalled()
  mock.preview.mockResolvedValue({ proposal: null, reason: 'Нет расписания.' })
  expect(
    (
      await GET(
        new Request(
          'http://localhost:3000/api/account/reminders?preview=1&eventID=1&kind=regular&leadMinutes=10',
        ),
      )
    ).status,
  ).toBe(200)
  expect(mock.preview).toHaveBeenCalledWith({}, user, 1, 'regular', 10)
})

it('rejects legacy once creates on the public API', async () => {
  expect((await post({ ...valid(), kind: 'once', launchAt: '2026-11-14T11:00:00Z' })).status).toBe(
    400,
  )
  expect(mock.write).not.toHaveBeenCalled()
})
