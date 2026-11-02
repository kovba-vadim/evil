'use client'

import Link from 'next/link'
import { useCallback, useEffect, useRef, useState } from 'react'
import { GlobalSearch } from './global-search'
import { usePathname } from 'next/navigation'
import { SidebarInset, SidebarProvider, SidebarTrigger, useSidebar } from '@/components/ui/sidebar'
import { Separator } from '@/components/ui/separator'
import { AppSidebar } from './app-sidebar'
import { navigation } from './navigation'
import { ThemeToggle } from './theme-toggle'

function ShellContent({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const [searchOpen, setSearchOpen] = useState(false)
  const returnFocus = useRef<HTMLElement | null>(null)
  const openSearch = useCallback(() => {
    returnFocus.current =
      document.activeElement instanceof HTMLElement && document.activeElement !== document.body
        ? document.activeElement
        : null
    setSearchOpen(true)
  }, [])
  useEffect(() => {
    const listener = (event: KeyboardEvent) => {
      if (
        (event.ctrlKey || event.metaKey) &&
        !event.altKey &&
        (event.key.toLowerCase() === 'k' || event.code === 'KeyK')
      ) {
        event.preventDefault()
        if (event.repeat) return
        if (searchOpen) setSearchOpen(false)
        else openSearch()
      }
    }
    window.addEventListener('keydown', listener)
    return () => window.removeEventListener('keydown', listener)
  }, [searchOpen, openSearch])
  const { isMobile, openMobile, open, state } = useSidebar()
  const title =
    navigation.find((item) => pathname === item.href || pathname.startsWith(`${item.href}/`))
      ?.title ?? (pathname.startsWith('/ordinary-resources/') ? 'Обычный ресурс' : 'Главная')
  return (
    <>
      <AppSidebar onSearch={openSearch} />
      <GlobalSearch open={searchOpen} onOpenChange={setSearchOpen} returnFocus={returnFocus} />
      <SidebarInset className="min-w-0">
        <header className="flex h-16 shrink-0 items-center gap-3 border-b px-4 md:px-6">
          <SidebarTrigger
            aria-label={
              isMobile ? 'Открыть меню' : state === 'expanded' ? 'Свернуть меню' : 'Развернуть меню'
            }
            aria-expanded={isMobile ? openMobile : open}
          />
          <Separator orientation="vertical" className="h-4!" />
          <Link href="/" className="font-semibold md:hidden">
            EvilIsland
          </Link>
          <span className="hidden text-sm text-muted-foreground md:inline">{title}</span>
          <div className="ml-auto">
            <ThemeToggle />
          </div>
        </header>
        <main id="main-content" tabIndex={-1} className="flex-1 p-6 outline-none md:p-10">
          <div className="mx-auto w-full max-w-6xl">{children}</div>
        </main>
      </SidebarInset>
    </>
  )
}

export function PublicShell({ children }: { children: React.ReactNode }) {
  return (
    <SidebarProvider>
      <ShellContent>{children}</ShellContent>
    </SidebarProvider>
  )
}
