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

function ShellContent({
  children,
  accountNav,
  sidebarPlayer,
  playControl,
}: {
  children: React.ReactNode
  accountNav?: React.ReactNode
  sidebarPlayer?: React.ReactNode
  playControl: React.ReactNode
}) {
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
    (
      {
        '/account': 'Профиль',
        '/account/cooldowns': 'Мои КД',
        '/account/reminders': 'Напоминания',
        '/login': 'Вход',
        '/register': 'Регистрация',
        '/forgot-password': 'Восстановление пароля',
        '/reset-password': 'Новый пароль',
      } as Record<string, string>
    )[pathname] ??
    navigation.find((item) => pathname === item.href || pathname.startsWith(`${item.href}/`))
      ?.title ??
    (pathname.startsWith('/ordinary-resources/') ? 'Обычный ресурс' : 'Главная')
  return (
    <>
      <AppSidebar onSearch={openSearch} playerMenu={sidebarPlayer} />
      <GlobalSearch open={searchOpen} onOpenChange={setSearchOpen} returnFocus={returnFocus} />
      <SidebarInset className="min-w-0">
        <header className="flex h-16 shrink-0 items-center gap-1 border-b px-2 sm:gap-3 sm:px-4 md:px-6">
          <SidebarTrigger
            aria-label={
              isMobile ? 'Открыть меню' : state === 'expanded' ? 'Свернуть меню' : 'Развернуть меню'
            }
            aria-expanded={isMobile ? openMobile : open}
          />
          <Separator orientation="vertical" className="h-4!" />
          <Link href="/" className="shrink-0 font-semibold max-[374px]:text-xs md:hidden">
            EvilIsland
          </Link>
          <span className="hidden text-sm text-muted-foreground md:inline">{title}</span>
          {accountNav}
          <div className={accountNav ? 'flex items-center' : 'ml-auto flex items-center'}>
            {playControl}
            <ThemeToggle />
          </div>
        </header>
        <main id="main-content" tabIndex={-1} className="flex-1 p-3 outline-none sm:p-6 lg:p-10">
          <div className="mx-auto w-full max-w-6xl">{children}</div>
        </main>
      </SidebarInset>
    </>
  )
}

export function PublicShell({
  children,
  accountNav,
  sidebarPlayer,
  defaultSidebarOpen,
  playControl,
}: {
  children: React.ReactNode
  accountNav?: React.ReactNode
  sidebarPlayer?: React.ReactNode
  defaultSidebarOpen: boolean
  playControl: React.ReactNode
}) {
  return (
    <SidebarProvider defaultOpen={defaultSidebarOpen}>
      <ShellContent accountNav={accountNav} sidebarPlayer={sidebarPlayer} playControl={playControl}>
        {children}
      </ShellContent>
    </SidebarProvider>
  )
}
