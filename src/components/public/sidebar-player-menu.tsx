'use client'

import Link from 'next/link'
import { Bell, ChevronsUpDown, Clock3, LogOut, UserRound } from 'lucide-react'
import { useRef, useState } from 'react'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from '@/components/ui/sidebar'

type PlayerIdentity = { nickname: string; email: string }

const accountLinks = [
  { href: '/account', label: 'Профиль', Icon: UserRound },
  { href: '/account/cooldowns', label: 'Мои КД', Icon: Clock3 },
  { href: '/account/reminders', label: 'Напоминания', Icon: Bell },
]

function PlayerInfo({ nickname, email, compact = false }: PlayerIdentity & { compact?: boolean }) {
  return (
    <>
      <Avatar aria-hidden="true">
        <AvatarFallback>
          <UserRound className="size-4" />
        </AvatarFallback>
      </Avatar>
      <span
        className={`grid min-w-0 flex-1 text-left leading-tight${compact ? ' group-data-[collapsible=icon]:hidden' : ''}`}
      >
        <span className="truncate font-medium" title={nickname}>
          {nickname}
        </span>
        {email && (
          <span className="truncate text-xs text-muted-foreground" title={email}>
            {email}
          </span>
        )}
      </span>
    </>
  )
}

export function SidebarPlayerMenu(player: PlayerIdentity) {
  const { isMobile, state, setOpenMobile } = useSidebar()
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const pending = useRef(false)

  async function logout() {
    if (pending.current) return
    pending.current = true
    setBusy(true)
    setMessage('')
    try {
      const response = await fetch('/api/account/logout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: '{}',
      })
      if (!response.ok) throw new Error()
      window.location.replace('/login')
    } catch {
      setMessage('Не удалось выйти. Повторите.')
      pending.current = false
      setBusy(false)
    }
  }

  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <SidebarMenuButton
              size="lg"
              aria-label="Меню игрока"
              className="data-[state=open]:bg-sidebar-accent"
            >
              <PlayerInfo {...player} compact />
              <ChevronsUpDown
                className="ml-auto group-data-[collapsible=icon]:hidden"
                aria-hidden="true"
              />
            </SidebarMenuButton>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            align="end"
            side={isMobile && state === 'expanded' ? 'top' : 'right'}
            collisionPadding={8}
            className="w-64 max-w-(--radix-dropdown-menu-content-available-width)"
          >
            <DropdownMenuLabel className="flex items-center gap-2">
              <PlayerInfo {...player} />
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            {accountLinks.map(({ href, label, Icon }) => (
              <DropdownMenuItem asChild disabled={busy} key={href}>
                <Link
                  href={href}
                  onNavigate={() => {
                    if (isMobile) setOpenMobile(false)
                  }}
                >
                  <Icon aria-hidden="true" />
                  {label}
                </Link>
              </DropdownMenuItem>
            ))}
            <DropdownMenuSeparator />
            <DropdownMenuItem
              disabled={busy}
              onSelect={(event) => {
                event.preventDefault()
                void logout()
              }}
            >
              <LogOut aria-hidden="true" />
              {busy ? 'Выход…' : 'Выйти'}
            </DropdownMenuItem>
            {message && (
              <p role="alert" className="px-2 py-1 text-sm text-destructive">
                {message}
              </p>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarMenuItem>
    </SidebarMenu>
  )
}
