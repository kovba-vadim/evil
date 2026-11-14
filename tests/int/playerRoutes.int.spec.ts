import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  create: vi.fn(),
  login: vi.fn(),
  update: vi.fn(),
  forgotPassword: vi.fn(),
  resetPassword: vi.fn(),
  session: vi.fn(),
  saveCookie: vi.fn(),
  logout: vi.fn(),
}))
vi.mock('@/auth/players', () => ({
  playerSession: mocks.session,
  savePlayerCookie: mocks.saveCookie,
  logoutPlayer: mocks.logout,
}))
import { POST } from '../../src/app/(frontend)/api/account/[action]/route'

const password = 'Example-password-12345'
function post(action: string, data: object = {}, origin = 'http://localhost:3000') {
  return POST(
    new Request(`http://localhost:3000/api/account/${action}`, {
      method: 'POST',
      headers: { Origin: origin, 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    }),
    { params: Promise.resolve({ action }) },
  )
}
beforeEach(() => {
  vi.clearAllMocks()
  vi.stubEnv('NODE_ENV', 'development')
  mocks.session.mockResolvedValue({ payload: mocks, user: null })
})
afterEach(() => vi.unstubAllEnvs())

describe('player portal server operations', () => {
  it('limits repeated registration attempts before creating another account', async () => {
    const data = {
      email: 'rate-limit@example.test',
      nickname: 'Игрок',
      password,
      confirmPassword: password,
    }
    for (let i = 0; i < 3; i++) expect((await post('register', data)).status).toBe(200)
    expect((await post('register', data)).status).toBe(429)
    expect(mocks.create).toHaveBeenCalledTimes(3)
  })
  it('rejects oversized bodies before accessing Payload', async () => {
    expect(
      (await post('register', { email: 'size@example.test', extra: 'x'.repeat(5000) })).status,
    ).toBe(413)
    expect(mocks.session).not.toHaveBeenCalled()
  })
  it('rejects cross-origin operations before accessing accounts', async () => {
    expect((await post('register', {}, 'https://external.test')).status).toBe(403)
    expect(mocks.session).not.toHaveBeenCalled()
  })
  it('registers only whitelisted fields and never marks local email verified', async () => {
    const response = await post('register', {
      email: 'register@example.test',
      nickname: 'Игрок',
      password,
      confirmPassword: password,
      _verified: true,
      roles: ['admin'],
      collection: 'users',
    })
    expect(response.status).toBe(200)
    expect(mocks.create).toHaveBeenCalledWith(
      expect.objectContaining({
        collection: 'players',
        overrideAccess: true,
        data: {
          email: 'register@example.test',
          nickname: 'Игрок',
          password,
          timeZone: 'server',
          _verified: false,
        },
      }),
    )
  })
  it('does not return login tokens and filters unsafe return URLs', async () => {
    mocks.login.mockResolvedValue({ token: 'private-token' })
    const response = await post('login', {
      email: 'login@example.test',
      password,
      returnTo: '//external.test',
    })
    const body = await response.json()
    expect(body.redirect).toBe('/account')
    expect(JSON.stringify(body)).not.toContain('private-token')
    expect(mocks.saveCookie).toHaveBeenCalledWith('private-token')
  })
  it('protects profile and password operations from guests', async () => {
    expect((await post('profile', { nickname: 'Игрок', timeZone: 'server' })).status).toBe(401)
    expect((await post('password', { password, confirmPassword: password })).status).toBe(401)
    expect(mocks.update).not.toHaveBeenCalled()
  })
  it('updates only the authenticated profile with access control enabled', async () => {
    const user = { id: 123, collection: 'players', email: 'owner@example.test' }
    mocks.session.mockResolvedValue({ payload: mocks, user })
    expect(
      (
        await post('profile', {
          id: 999,
          nickname: 'Новое имя',
          timeZone: 'Europe/London',
          email: 'other@example.test',
          _verified: true,
        })
      ).status,
    ).toBe(200)
    expect(mocks.update).toHaveBeenCalledWith({
      collection: 'players',
      id: 123,
      user,
      overrideAccess: false,
      data: { nickname: 'Новое имя', timeZone: 'Europe/London' },
    })
  })
  it('returns the same recovery response for known and unknown email, logs only on server', async () => {
    const log = vi.spyOn(console, 'info').mockImplementation(() => {})
    try {
      mocks.forgotPassword.mockResolvedValueOnce('secret-reset-token').mockResolvedValueOnce(null)
      const known = await (await post('forgot', { email: 'known@example.test' })).json()
      const unknown = await (await post('forgot', { email: 'unknown@example.test' })).json()
      expect(known).toEqual(unknown)
      expect(JSON.stringify(known)).not.toContain('secret-reset-token')
      expect(log).toHaveBeenCalledTimes(1)
    } finally {
      log.mockRestore()
    }
  })
  it('fails closed in production without sending or logging recovery links', async () => {
    vi.stubEnv('NODE_ENV', 'production')
    const log = vi.spyOn(console, 'info').mockImplementation(() => {})
    try {
      expect((await post('register', { email: 'prod@example.test' })).status).toBe(503)
      expect((await post('forgot', { email: 'prod@example.test' })).status).toBe(503)
      expect(mocks.create).not.toHaveBeenCalled()
      expect(mocks.forgotPassword).not.toHaveBeenCalled()
      expect(log).not.toHaveBeenCalled()
    } finally {
      log.mockRestore()
    }
  })
  it('rejects mismatched passwords without changing data', async () => {
    expect(
      (await post('reset', { password, confirmPassword: 'different', token: 'secret' })).status,
    ).toBe(400)
    expect(mocks.resetPassword).not.toHaveBeenCalled()
  })
  it('revokes the session on logout', async () => {
    expect((await post('logout')).status).toBe(200)
    expect(mocks.logout).toHaveBeenCalledOnce()
  })
})
