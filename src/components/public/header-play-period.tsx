'use client'

import { Gamepad2 } from 'lucide-react'
import { usePathname } from 'next/navigation'
import { useCallback, useEffect, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { playingAt, type ReminderSnapshot } from '@/lib/player-reminders'
import { publishPlayPeriod, subscribePlayPeriod, type PlaySnapshot } from '@/lib/play-period-sync'
import { normalizeTimeZone } from '@/lib/time-zones'
import { GuestAccessDialog } from './guest-access-dialog'
import { PlayPeriodDialog, type ReminderWrite } from './player-reminders'
import { useServerClock, useTimeZone } from './time-zone'

const endpoint = '/api/account/reminders'

export function HeaderPlayPeriod({
  initial,
  timeZone,
}: {
  initial: PlaySnapshot | null
  timeZone?: string
}) {
  const pathname = usePathname()
  const zone = useTimeZone(normalizeTimeZone(timeZone))
  const [snapshot, setSnapshot] = useState(initial)
  const [expired, setExpired] = useState(false)
  const [busy, setBusy] = useState(false)
  const playerID = initial?.playerID
  const clock = useServerClock(snapshot?.serverNow ?? initial?.serverNow ?? '1970-01-01T00:00:00Z')
  const active = playingAt(snapshot?.play ?? null, clock)
  const verifyPeriodically = active || snapshot === null
  const read = useRef<AbortController | null>(null)
  const writing = useRef(false)
  const pending = useRef<{ signature: string; requestID: string } | null>(null)
  const accept = useCallback((value: PlaySnapshot | null) => {
    read.current?.abort()
    setSnapshot(value)
    setExpired(value === null)
  }, [])
  const expire = useCallback(() => {
    accept(null)
  }, [accept])

  useEffect(() => {
    if (playerID === undefined) return
    return subscribePlayPeriod(playerID, accept)
  }, [accept, playerID])

  useEffect(() => {
    if (playerID === undefined || expired) return
    const refresh = async () => {
      if (document.visibilityState !== 'visible' || writing.current || read.current) return
      const controller = new AbortController()
      read.current = controller
      try {
        const response = await fetch(endpoint, { signal: controller.signal, cache: 'no-store' })
        if (controller.signal.aborted) return
        if (response.status === 401) {
          expire()
          return
        }
        if (!response.ok) throw new Error()
        const data: PlaySnapshot = await response.json()
        if (!controller.signal.aborted) accept(data.playerID === playerID ? data : null)
      } catch {
        if (!controller.signal.aborted) setSnapshot(null)
      } finally {
        if (read.current === controller) read.current = null
      }
    }
    window.addEventListener('focus', refresh)
    window.addEventListener('pageshow', refresh)
    document.addEventListener('visibilitychange', refresh)
    // Active periods can outlive the account cookie in an already open tab.
    const timer = verifyPeriodically ? setInterval(refresh, 30_000) : undefined
    return () => {
      window.removeEventListener('focus', refresh)
      window.removeEventListener('pageshow', refresh)
      document.removeEventListener('visibilitychange', refresh)
      clearInterval(timer)
      read.current?.abort()
      read.current = null
    }
  }, [accept, expired, expire, playerID, verifyPeriodically])

  const write: ReminderWrite = async (body) => {
    if (playerID === undefined || expired || writing.current) return { ok: false }
    writing.current = true
    setBusy(true)
    read.current?.abort()
    const signature = JSON.stringify(body)
    if (pending.current?.signature !== signature)
      pending.current = { signature, requestID: crypto.randomUUID() }
    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Reminder-Player': String(playerID) },
        body: JSON.stringify({ ...body, requestID: pending.current.requestID }),
        cache: 'no-store',
      })
      if (response.status === 401) {
        expire()
        return { ok: false }
      }
      const data = await response.json()
      if (!response.ok) {
        if (response.status === 409) pending.current = null
        return { ok: false, message: data.message, status: response.status }
      }
      const next: ReminderSnapshot = data
      if (next.playerID !== playerID) {
        expire()
        return { ok: false }
      }
      pending.current = null
      publishPlayPeriod(playerID, next)
      return { ok: true, snapshot: next }
    } catch {
      return {
        ok: false,
        message: 'Не удалось изменить игровой период. Проверьте связь и повторите.',
      }
    } finally {
      writing.current = false
      setBusy(false)
    }
  }

  const label = active ? 'Я играю — включено' : 'Я играю — выключено'
  const trigger = (
    <Button
      type="button"
      size="icon-sm"
      variant="ghost"
      aria-label={label}
      title={label}
      className={active ? 'text-green-700 dark:text-green-400' : 'text-muted-foreground'}
    >
      <Gamepad2 aria-hidden="true" />
    </Button>
  )
  return playerID === undefined || expired ? (
    <GuestAccessDialog
      trigger={trigger}
      title="Режим «Я играю»"
      description={({ register, login }) => (
        <>
          {register} или {login}, чтобы включить игровой режим и получать напоминания о запуске
          ивентов и завершении КД на ивенты и квесты.
        </>
      )}
      note="Уведомления можно будет получать в Telegram или Discord."
      returnTo={pathname}
      closeLabel="Закрыть режим «Я играю»"
    />
  ) : (
    <PlayPeriodDialog
      trigger={trigger}
      playerID={playerID}
      zone={zone}
      busy={busy}
      write={write}
      onLoaded={accept}
      onSessionChanged={expire}
    />
  )
}
