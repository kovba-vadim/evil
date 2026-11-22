import type { ReactNode } from 'react'
import { cookies } from 'next/headers'
import { playerSession } from '@/auth/players'
import { SIDEBAR_COOKIE_NAME } from '@/lib/sidebar-state'
import { getPlayerPlay } from '@/queries/player-reminders'
import { AccountTimeZone } from './account-form'
import { GuestAccountLinks } from './guest-account-links'
import { PublicShell } from './public-shell'
import { SidebarPlayerMenu } from './sidebar-player-menu'
import { HeaderPlayPeriod } from './header-play-period'

export async function AccountShell({ children }: { children: ReactNode }) {
  const { payload, user } = await playerSession()
  const play = user ? await getPlayerPlay(payload, user) : null
  const defaultSidebarOpen = (await cookies()).get(SIDEBAR_COOKIE_NAME)?.value !== 'false'
  return (
    <>
      {user && <AccountTimeZone timeZone={user.timeZone} />}
      <PublicShell
        defaultSidebarOpen={defaultSidebarOpen}
        playControl={
          <HeaderPlayPeriod key={user?.id ?? 'guest'} initial={play} timeZone={user?.timeZone} />
        }
        accountNav={
          user ? undefined : (
            <nav className="account-nav" aria-label="Аккаунт">
              <GuestAccountLinks />
            </nav>
          )
        }
        sidebarPlayer={
          user && (
            <SidebarPlayerMenu
              nickname={user.nickname?.trim() || 'Игрок'}
              email={user.email?.trim() || ''}
            />
          )
        }
      >
        {children}
      </PublicShell>
    </>
  )
}
