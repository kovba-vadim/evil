'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { safeReturnTo } from '@/lib/player-policy'

export function GuestAccountLinks() {
  const pathname = usePathname()
  return (
    <>
      <Link href={`/login?returnTo=${encodeURIComponent(safeReturnTo(pathname))}`}>Вход</Link>
      <Link href="/register">Регистрация</Link>
    </>
  )
}
