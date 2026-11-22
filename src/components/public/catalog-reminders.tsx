'use client'

import { Bell, BellOff, BellRing } from 'lucide-react'
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { Button } from '@/components/ui/button'
import { GuestAccessDialog } from './guest-access-dialog'
import { publishPlayPeriod } from '@/lib/play-period-sync'
import type { ReminderSnapshot, ReminderView } from '@/lib/player-reminders'
import { normalizeTimeZone } from '@/lib/time-zones'
import { ReminderEditor, type ReminderWrite } from './player-reminders'
import { useTimeZone } from './time-zone'

type Subscription = Pick<ReminderView, 'id' | 'eventID' | 'enabled' | 'revision'>
type Session = { playerID: number; timeZone: string }
type CatalogReminderState = {
  playerID: number | null
  zone: string
  subscriptions: Map<number | null, Subscription>
  busy: boolean
  write: ReminderWrite
  expireSession: () => void
  returnTo: '/events' | '/event-launches'
}

const CatalogReminderContext = createContext<CatalogReminderState | null>(null)
const endpoint = '/api/account/reminders'

export function CatalogReminders({
  initial,
  returnTo,
  children,
}: {
  initial: Session | null
  returnTo: CatalogReminderState['returnTo']
  children: ReactNode
}) {
  const [session, setSession] = useState(initial)
  const [reminders, setReminders] = useState<Subscription[] | null>(null)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const mutating = useRef(false)
  const restoreRequest = useRef<AbortController | null>(null)
  const pending = useRef<{ signature: string; requestID: string } | null>(null)
  const zone = useTimeZone(normalizeTimeZone(session?.timeZone))
  const playerID = session?.playerID ?? null
  const expireSession = useCallback(() => {
    if (playerID !== null) publishPlayPeriod(playerID, null)
    pending.current = null
    setSession(null)
    setReminders(null)
    setMessage('Сессия изменилась. Войдите заново, чтобы управлять подписками.')
  }, [playerID])
  const refresh = useCallback(
    async (signal?: AbortSignal) => {
      const response = await fetch(endpoint, { cache: 'no-store', signal })
      if (signal?.aborted) return
      if (response.status === 401) {
        expireSession()
        return
      }
      if (!response.ok) throw new Error('Не удалось обновить подписки. Повторите попытку.')
      const data: ReminderSnapshot = await response.json()
      if (signal?.aborted) return
      if (data.playerID !== playerID) expireSession()
      else setReminders(data.reminders)
    },
    [expireSession, playerID],
  )

  const load = useCallback(() => {
    if (mutating.current) return
    restoreRequest.current?.abort()
    const controller = new AbortController()
    restoreRequest.current = controller
    const { signal } = controller
    void refresh(signal).catch(() => {
      if (!signal.aborted) setMessage('Не удалось обновить подписки. Повторите попытку.')
    })
  }, [refresh])

  useEffect(() => {
    if (playerID === null) return
    load()
    const restore = (event: PageTransitionEvent) => {
      if (event.persisted) load()
    }
    window.addEventListener('pageshow', restore)
    return () => {
      window.removeEventListener('pageshow', restore)
      restoreRequest.current?.abort()
    }
  }, [playerID, load])

  const write: ReminderWrite = async (body) => {
    if (mutating.current || playerID === null) return { ok: false }
    const failure =
      body.action === 'play'
        ? 'Не удалось изменить игровой период.'
        : 'Не удалось обновить подписку.'
    mutating.current = true
    restoreRequest.current?.abort()
    setBusy(true)
    setMessage('')
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
        expireSession()
        return { ok: false, message: 'Войдите заново, чтобы управлять подписками.' }
      }
      const data = await response.json()
      if (!response.ok) {
        if (response.status === 409) {
          pending.current = null
          await refresh()
        }
        const message = data.message ?? `${failure} Повторите попытку.`
        if (body.action === 'toggle') setMessage(message)
        return { ok: false, message, status: response.status }
      }
      if (data.playerID !== playerID) {
        expireSession()
        return { ok: false, message: 'Сессия изменилась.' }
      }
      pending.current = null
      setReminders(data.reminders)
      if (body.action === 'play') publishPlayPeriod(playerID, data)
      return { ok: true, snapshot: data }
    } catch {
      const message = `${failure} Проверьте связь и повторите попытку.`
      if (body.action === 'toggle') setMessage(message)
      return { ok: false, message }
    } finally {
      mutating.current = false
      setBusy(false)
    }
  }

  const subscriptions = new Map(reminders?.map((row) => [row.eventID, row]))
  const loading = playerID !== null && reminders === null
  return (
    <CatalogReminderContext.Provider
      value={{
        playerID,
        zone,
        subscriptions,
        busy: busy || loading,
        write,
        expireSession,
        returnTo,
      }}
    >
      {message && (
        <div className="mb-3 rounded-md border border-destructive bg-card p-3 text-destructive">
          <p role="alert">{message}</p>
          {loading && (
            <Button
              variant="outline"
              onClick={() => {
                setMessage('')
                load()
              }}
            >
              Повторить
            </Button>
          )}
        </div>
      )}
      {children}
    </CatalogReminderContext.Provider>
  )
}

export function EventReminderBell({ event }: { event: { id: number; name: string } }) {
  const state = useContext(CatalogReminderContext)
  if (!state) return null
  const { playerID, subscriptions, busy, write, zone, expireSession, returnTo } = state
  const subscription = subscriptions.get(event.id)
  const Icon = subscription ? (subscription.enabled ? BellRing : BellOff) : Bell
  const label = subscription
    ? subscription.enabled
      ? 'Отключить подписку'
      : 'Включить подписку'
    : 'Настроить напоминание'
  const description = `${label}: ${event.name}`
  const button = (
    <Button
      type="button"
      size="icon-lg"
      variant="ghost"
      className={
        subscription
          ? subscription.enabled
            ? 'text-green-700 dark:text-green-400'
            : 'text-destructive'
          : 'text-muted-foreground'
      }
      aria-label={description}
      title={description}
      aria-disabled={busy || undefined}
      aria-haspopup={subscription ? false : undefined}
      onClick={(click) => {
        if (busy || subscription) click.preventDefault()
        if (!busy && subscription)
          void write({
            action: 'toggle',
            id: subscription.id,
            revision: subscription.revision,
            enabled: !subscription.enabled,
          })
      }}
    >
      <Icon aria-hidden="true" />
    </Button>
  )

  if (playerID === null)
    return (
      <GuestAccessDialog
        trigger={button}
        title="Напоминания об ивентах"
        description={({ register, login }) => (
          <>
            {register} или {login}, чтобы получать напоминания о запусках ивентов.
          </>
        )}
        returnTo={returnTo}
        closeLabel="Закрыть напоминания"
      />
    )

  return (
    <ReminderEditor
      target={event}
      playerID={playerID}
      zone={zone}
      busy={busy}
      write={write}
      trigger={button}
      onSessionChanged={expireSession}
    />
  )
}
