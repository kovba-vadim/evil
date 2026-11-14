import Link from 'next/link'
import { playerSession } from '@/auth/players'
import { AccountTimeZone, PlayerLogout } from './account-form'
import { GuestAccountLinks } from './guest-account-links'

export async function AccountNav() {
  const { user } = await playerSession()
  return (
    <nav className="account-nav" aria-label="Аккаунт">
      {user ? (
        <>
          <AccountTimeZone timeZone={user.timeZone} />
          <Link href="/account">Кабинет</Link>
          <PlayerLogout />
        </>
      ) : (
        <GuestAccountLinks />
      )}
    </nav>
  )
}
