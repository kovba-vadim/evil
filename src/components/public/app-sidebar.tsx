'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Compass, X, Search } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from '@/components/ui/sidebar'
import { navigation } from './navigation'

export function AppSidebar({ onSearch }: { onSearch: () => void }) {
  const pathname = usePathname()
  const { isMobile, setOpenMobile } = useSidebar()
  const closeMobile = () => {
    if (isMobile) setOpenMobile(false)
  }

  return (
    <Sidebar collapsible="icon" aria-label="Навигация по разделам">
      <SidebarHeader className="h-16 justify-center border-b border-sidebar-border">
        <div className="flex items-center gap-1">
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton
                asChild
                tooltip="На главную"
                className="h-10 hover:bg-sidebar-accent"
              >
                <Link href="/" aria-label="EvilIsland — на главную" onClick={closeMobile}>
                  <Compass className="size-5! text-primary" aria-hidden="true" />
                  <span className="text-base font-semibold tracking-tight">EvilIsland</span>
                </Link>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
          {isMobile && (
            <Button variant="ghost" size="icon" aria-label="Закрыть меню" onClick={closeMobile}>
              <X aria-hidden="true" />
            </Button>
          )}
        </div>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton
                tooltip="Поиск"
                aria-label="Поиск"
                onClick={onSearch}
                className="h-10"
              >
                <Search aria-hidden="true" />
                <span>Поиск</span>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarGroup>
        <SidebarGroup>
          <SidebarGroupLabel>Разделы</SidebarGroupLabel>
          <SidebarGroupContent>
            <nav aria-label="Основное меню">
              <SidebarMenu>
                {navigation.map(({ title, href, icon: Icon }) => {
                  const active = pathname === href || pathname.startsWith(`${href}/`)
                  return (
                    <SidebarMenuItem key={href}>
                      <SidebarMenuButton
                        asChild
                        isActive={active}
                        tooltip={title}
                        className="h-10 data-[active=true]:bg-sidebar-accent data-[active=true]:text-sidebar-accent-foreground"
                      >
                        <Link
                          href={href}
                          aria-current={active ? 'page' : undefined}
                          aria-label={title}
                          onClick={closeMobile}
                        >
                          <Icon aria-hidden="true" />
                          <span>{title}</span>
                        </Link>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  )
                })}
              </SidebarMenu>
            </nav>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter className="border-t border-sidebar-border px-4 py-4 group-data-[collapsible=icon]:hidden">
        <p className="text-xs text-muted-foreground">EvilIsland</p>
      </SidebarFooter>
    </Sidebar>
  )
}
