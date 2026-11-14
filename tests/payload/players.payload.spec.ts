import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import type { Payload } from 'payload'
import { createLocalReq, logoutOperation } from 'payload'
import { openTestPayload } from '../helpers/testDatabase'
import type { Player, User } from '../../src/payload-types'

let api: Payload
let player: Player & { collection: 'players' }
let other: Player
let admin: User & { collection: 'users' }
const password = 'Initial-password-12345'
const nextPassword = 'Replacement-password-12345'

beforeAll(async () => {
  api = await openTestPayload()
  const account = await api.create({
    collection: 'users',
    overrideAccess: true,
    data: { email: `${crypto.randomUUID()}@example.test`, password },
  })
  admin = { ...account, collection: 'users' }
  for (let i = 0; i < 2; i++) {
    const doc = await api.create({
      collection: 'players',
      overrideAccess: true,
      disableVerificationEmail: true,
      data: {
        email: `${crypto.randomUUID()}@example.test`,
        password,
        nickname: 'Игрок',
        timeZone: 'server',
        _verified: false,
      },
    })
    if (i === 0) player = { ...doc, collection: 'players' }
    else other = doc
  }
})
afterAll(async () => {
  try {
    if (player) await api.delete({ collection: 'players', id: player.id, overrideAccess: true })
    if (other) await api.delete({ collection: 'players', id: other.id, overrideAccess: true })
    if (admin) await api.delete({ collection: 'users', id: admin.id, overrideAccess: true })
  } finally {
    await api?.destroy()
  }
})

describe('players through Payload on isolated PostgreSQL', () => {
  it('authenticates development sessions without marking email verified', async () => {
    const authConfig = api.collections.players.config.auth
    const verify = authConfig.verify
    vi.stubEnv('NODE_ENV', 'development')
    authConfig.verify = false
    try {
      const login = await api.login({
        collection: 'players',
        overrideAccess: false,
        data: { email: player.email, password },
      })
      const result = await api.auth({
        headers: new Headers({ authorization: `JWT ${login.token}` }),
      })
      expect(result.user?.collection).toBe('players')
      expect(result.user?.id).toBe(player.id)
      const stored = await api.findByID({
        collection: 'players',
        id: player.id,
        overrideAccess: true,
      })
      expect(stored._verified).toBe(false)
    } finally {
      authConfig.verify = verify
      vi.unstubAllEnvs()
    }
  })
  it('denies guest reads, public creation, another profile, admin accounts and game writes', async () => {
    await expect(
      api.find({ collection: 'players', overrideAccess: false, user: null }),
    ).rejects.toThrow()
    await expect(
      api.create({
        collection: 'players',
        overrideAccess: false,
        user: null,
        data: {
          email: `${crypto.randomUUID()}@example.test`,
          password,
          nickname: 'Игрок',
          timeZone: 'server',
        },
      }),
    ).rejects.toThrow()
    const own = await api.find({ collection: 'players', user: player, overrideAccess: false })
    expect(own.docs.map((doc) => doc.id)).toEqual([player.id])
    await expect(
      api.update({
        collection: 'players',
        id: other.id,
        data: { nickname: 'Чужой' },
        user: player,
        overrideAccess: false,
      }),
    ).rejects.toThrow()
    await expect(
      api.find({ collection: 'users', user: player, overrideAccess: false }),
    ).rejects.toThrow()
    await expect(
      api.create({
        collection: 'media',
        user: player,
        overrideAccess: false,
        data: { alt: 'Запрещено' },
      }),
    ).rejects.toThrow()
    await expect(
      api.create({
        collection: 'users',
        user: player,
        overrideAccess: false,
        data: { email: 'forbidden@example.test', password },
      }),
    ).rejects.toThrow()
    await expect(
      api.create({
        collection: 'events',
        user: player,
        overrideAccess: false,
        data: { name: 'Запрещено', slug: 'forbidden', coins: 0, cooldownMinutes: 0 },
      }),
    ).rejects.toThrow()
    const access = api.collections.players.config.access.admin
    expect(await access!({ req: await createLocalReq({ user: player }, api) })).toBe(false)
    expect(
      (await api.find({ collection: 'users', user: admin, overrideAccess: false })).docs.some(
        (doc) => doc.id === admin.id,
      ),
    ).toBe(true)
  })
  it('allows only own profile fields and protects email, verification and password', async () => {
    const updated = await api.update({
      collection: 'players',
      id: player.id,
      user: player,
      overrideAccess: false,
      data: {
        nickname: 'Новое имя',
        timeZone: 'Europe/London',
        email: 'changed@example.test',
        _verified: true,
      },
    })
    expect(updated.nickname).toBe('Новое имя')
    expect(updated.timeZone).toBe('Europe/London')
    expect(updated.email).toBe(player.email)
    expect(updated._verified).toBe(false)
    await expect(
      api.update({
        collection: 'players',
        id: player.id,
        user: player,
        overrideAccess: false,
        data: { password: nextPassword },
      }),
    ).rejects.toThrow()
  })
  it('blocks unverified login outside development, then verifies password and revokes sessions on logout', async () => {
    await expect(
      api.login({
        collection: 'players',
        overrideAccess: false,
        data: { email: player.email, password },
      }),
    ).rejects.toThrow()
    // Simulate successful email verification as a trusted fixture, not a local bypass.
    await api.update({
      collection: 'players',
      id: player.id,
      overrideAccess: true,
      data: { _verified: true },
    })
    await expect(
      api.login({
        collection: 'players',
        overrideAccess: false,
        data: { email: player.email, password: 'wrong' },
      }),
    ).rejects.toThrow()
    const result = await api.login({
      collection: 'players',
      overrideAccess: false,
      data: { email: player.email, password },
    })
    expect(result.token).toBeTruthy()
    const headers = new Headers({ authorization: `JWT ${result.token}`, DisableAutologin: 'true' })
    const auth = await api.auth({ headers })
    expect(auth.user?.id).toBe(player.id)
    await logoutOperation({
      collection: api.collections.players,
      req: await createLocalReq({ user: auth.user! }, api),
    })
    expect((await api.auth({ headers })).user).toBeNull()
  })
  it('resets once by expiring token, rejects reuse and invalidates previous sessions', async () => {
    const login = await api.login({
      collection: 'players',
      overrideAccess: false,
      data: { email: player.email, password },
    })
    const missing = await api.forgotPassword({
      collection: 'players',
      overrideAccess: true,
      disableEmail: true,
      data: { email: `${crypto.randomUUID()}@example.test` },
    })
    expect(missing).toBeNull()
    const token = await api.forgotPassword({
      collection: 'players',
      overrideAccess: true,
      disableEmail: true,
      data: { email: player.email },
      expiration: 60_000,
    })
    expect(token).toBeTruthy()
    await api.resetPassword({
      collection: 'players',
      overrideAccess: true,
      data: { token: token!, password: nextPassword },
    })
    await expect(
      api.resetPassword({
        collection: 'players',
        overrideAccess: true,
        data: { token: token!, password },
      }),
    ).rejects.toThrow()
    expect(
      (await api.auth({ headers: new Headers({ authorization: `JWT ${login.token}` }) })).user,
    ).toBeNull()
    await expect(
      api.login({
        collection: 'players',
        overrideAccess: false,
        data: { email: player.email, password },
      }),
    ).rejects.toThrow()
    expect(
      (
        await api.login({
          collection: 'players',
          overrideAccess: false,
          data: { email: player.email, password: nextPassword },
        })
      ).token,
    ).toBeTruthy()
  })

  it('rejects expired tokens and locks repeated incorrect passwords', async () => {
    await api.update({
      collection: 'players',
      id: other.id,
      overrideAccess: true,
      data: { _verified: true },
    })
    const token = await api.forgotPassword({
      collection: 'players',
      overrideAccess: true,
      disableEmail: true,
      data: { email: other.email },
      expiration: -1000,
    })
    await api.update({
      collection: 'players',
      id: other.id,
      overrideAccess: true,
      data: { resetPasswordExpiration: new Date(Date.now() - 60_000).toISOString() },
    })
    const rejected = await api
      .resetPassword({
        collection: 'players',
        overrideAccess: true,
        data: { token: token!, password: nextPassword },
      })
      .then(
        () => false,
        () => true,
      )
    expect(rejected).toBe(true)
    for (let i = 0; i < 5; i++) {
      await expect(
        api.login({
          collection: 'players',
          overrideAccess: false,
          data: { email: other.email, password: 'incorrect' },
        }),
      ).rejects.toThrow()
    }
    await expect(
      api.login({
        collection: 'players',
        overrideAccess: false,
        data: { email: other.email, password },
      }),
    ).rejects.toThrow()
    expect(
      (
        await api.login({
          collection: 'users',
          overrideAccess: false,
          data: { email: admin.email, password },
        })
      ).token,
    ).toBeTruthy()
  })
})
