import type { Metadata } from 'next'
import { ThemeProvider } from '@/components/public/theme-provider'
import './styles.css'
import './account.scss'
import '@/components/public/breadcrumbs.scss'
import '@/components/public/player-cooldowns.scss'
import '@/components/public/player-reminders.scss'
import { AccountShell } from '@/components/public/account-nav'
import { NavigationHistory } from '@/components/public/navigation-history'
import { ScrollToTop } from '@/components/public/scroll-to-top'

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
          <AccountShell>{children}</AccountShell>
          <NavigationHistory />
          <ScrollToTop />
        </ThemeProvider>
      </body>
    </html>
  )
}
