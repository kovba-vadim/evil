import type { Metadata } from 'next'
import { PublicShell } from '@/components/public/public-shell'
import { ThemeProvider } from '@/components/public/theme-provider'
import './styles.css'
import './account.scss'
import '@/components/public/player-cooldowns.scss'
import '@/components/public/player-reminders.scss'
import { AccountNav } from '@/components/public/account-nav'

export const metadata: Metadata = {
  title: { default: 'EvilIsland', template: '%s — EvilIsland' },
  description: 'EvilIsland',
}

export default function PublicLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ru" suppressHydrationWarning>
      <body className="public-app">
        <ThemeProvider>
          <a
            href="#main-content"
            className="sr-only fixed top-3 left-3 z-[100] rounded-md bg-primary px-4 py-2 text-primary-foreground focus:not-sr-only"
          >
            Перейти к содержимому
          </a>
          <PublicShell accountNav={<AccountNav />}>{children}</PublicShell>
        </ThemeProvider>
      </body>
    </html>
  )
}
