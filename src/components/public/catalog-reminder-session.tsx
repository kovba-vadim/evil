import type { ReactNode } from 'react'
import { playerSession } from '@/auth/players'
import { CatalogReminders } from './catalog-reminders'

export async function CatalogReminderSession({
  returnTo,
  children,
}: {
  returnTo: '/events' | '/event-launches'
  children: ReactNode
}) {
  const { user } = await playerSession()
  const initial = user ? { playerID: user.id, timeZone: user.timeZone } : null
  return (
    <CatalogReminders key={user?.id ?? 'guest'} initial={initial} returnTo={returnTo}>
      {children}
    </CatalogReminders>
  )
}
