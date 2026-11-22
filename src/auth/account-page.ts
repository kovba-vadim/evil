import { redirect } from 'next/navigation'
import { playerSession } from './players'

export async function requireAccountPlayer(
  path: '/account' | '/account/cooldowns' | '/account/reminders',
) {
  const { payload, user } = await playerSession()
  if (!user) redirect(`/login?returnTo=${encodeURIComponent(path)}`)
  return { payload, user }
}
