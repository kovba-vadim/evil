import { cookies } from 'next/headers'
import { createLocalReq, getPayload, logoutOperation } from 'payload'
import config from '@payload-config'
import { isDevelopment, PLAYER_COOKIE } from '@/lib/player-policy'

export async function playerSession() {
  const token = (await cookies()).get(PLAYER_COOKIE)?.value
  const payload = await getPayload({ config })
  if (!token) return { payload, user: null }
  const { user } = await payload.auth({ headers: new Headers({ authorization: `JWT ${token}` }) })
  return {
    payload,
    user: user?.collection === 'players' && (isDevelopment() || user._verified) ? user : null,
  }
}

export async function savePlayerCookie(token: string) {
  ;(await cookies()).set(PLAYER_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 7200,
  })
}

export async function logoutPlayer() {
  const { payload, user } = await playerSession()
  if (user) {
    const req = await createLocalReq({ user }, payload)
    await logoutOperation({ collection: payload.collections.players, req })
  }
  ;(await cookies()).delete(PLAYER_COOKIE)
}
