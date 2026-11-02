import type { Metadata } from 'next'
import { PublicShell } from '@/components/public/public-shell'
import { ThemeProvider } from '@/components/public/theme-provider'
import './styles.css'

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
          <PublicShell>{children}</PublicShell>
        </ThemeProvider>
      </body>
    </html>
  )
}
