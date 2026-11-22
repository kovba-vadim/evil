import type { Metadata } from 'next'
import { requireAccountPlayer } from '@/auth/account-page'
import { PlayerReminders } from '@/components/public/player-reminders'
import { getPlayerReminders } from '@/queries/player-reminders'

export const dynamic = 'force-dynamic'
export const metadata: Metadata = { title: 'Напоминания', robots: { index: false, follow: false } }

export default async function AccountRemindersPage() {
  const { payload, user } = await requireAccountPlayer('/account/reminders')
  return (
    <div className="account">
      <PlayerReminders
        key={`reminders:${user.id}`}
        initial={await getPlayerReminders(payload, user)}
        timeZone={user.timeZone}
        pageHeading
      />
    </div>
  )
}
