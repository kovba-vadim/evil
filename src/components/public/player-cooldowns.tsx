'use client'

import Link from 'next/link'
import { useCallback, useEffect, useRef, useState } from 'react'
import {
  cooldownDate,
  COOLDOWN_CHANGED_EVENT,
  QUEST_COOLDOWN_CHANGED_EVENT,
  remainingCooldown,
  type CooldownSnapshot,
  type PersonalCooldown,
  type QuestCooldownSnapshot,
} from '@/lib/player-cooldowns'
import { useServerClock, useTimeZone } from './time-zone'
import { normalizeTimeZone } from '@/lib/time-zones'
import { GuestAccessDialog } from './guest-access-dialog'
import { Button } from '@/components/ui/button'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'

type RecordView = PersonalCooldown | QuestCooldownSnapshot['records'][number]
const recordID = (record: RecordView) => ('questID' in record ? record.questID : record.eventID)

export function QuestCooldownGuest({ slug }: { slug: string }) {
  return (
    <GuestAccessDialog
      title="Личный КД квеста"
      closeLabel="Закрыть личный КД квеста"
      returnTo={`/quests/${slug}`}
      trigger={
        <Button type="button" variant="outline">
          Сдал
        </Button>
      }
      description={({ register, login }) => (
        <>
          {register} или {login}, чтобы отмечать сдачу квестов и отслеживать личный КД.
        </>
      )}
    />
  )
}

export function PlayerCooldowns({
  initial,
  eventID,
  timeZone,
  quest = false,
  questID,
  listTitle,
}: {
  initial: CooldownSnapshot | QuestCooldownSnapshot
  eventID?: number
  timeZone: string
  quest?: boolean
  questID?: number
  listTitle?: string
}) {
  const [snapshot, setSnapshot] = useState<{
    playerID: number
    serverNow: string
    records: RecordView[]
  }>(initial)
  const detailID = quest ? questID : eventID
  const idKey = quest ? 'questID' : 'eventID'
  const params = quest
    ? 'kind=quest' + (questID ? `&questID=${questID}` : '')
    : eventID
      ? `eventID=${eventID}`
      : ''
  const displayZone = useTimeZone(normalizeTimeZone(timeZone))
  const [busy, setBusy] = useState(false)
  const [verifying, setVerifying] = useState(false)
  const [verified, setVerified] = useState(true)
  const [message, setMessage] = useState('')
  const [sessionChanged, setSessionChanged] = useState(false)
  const [confirmation, setConfirmation] = useState<RecordView | null>(null)
  const cancelTrigger = useRef<HTMLButtonElement | null>(null)
  const heading = useRef<HTMLHeadingElement>(null)
  const clock = useServerClock(snapshot.serverNow)
  const now = Date.parse(clock)
  const sequence = useRef(0)
  const controller = useRef<AbortController | null>(null)
  const mutating = useRef(false)
  const pending = useRef<{
    target: number
    requestID: string
    previousRevision: string | null
  } | null>(null)
  const sessionMismatch = useCallback(() => {
    setSnapshot((value) => ({ ...value, records: [] }))
    setSessionChanged(true)
    setConfirmation(null)
  }, [])
  const reload = useCallback(async () => {
    if (mutating.current) return
    controller.current?.abort()
    const abort = new AbortController()
    controller.current = abort
    const requestNumber = ++sequence.current
    setVerifying(true)
    setVerified(false)
    setConfirmation(null)
    try {
      const response = await fetch(`/api/account/cooldowns${params ? `?${params}` : ''}`, {
        cache: 'no-store',
        signal: abort.signal,
      })
      if (abort.signal.aborted || requestNumber !== sequence.current) return
      if (response.status === 401) {
        sessionMismatch()
        return
      }
      const data = await response.json()
      if (requestNumber !== sequence.current) return
      if (!response.ok) throw new Error(data.message)
      if (data.playerID !== initial.playerID) {
        sessionMismatch()
        return
      }
      setSnapshot(data)
      pending.current = null
      setVerified(true)
      setMessage('')
      setConfirmation(null)
    } catch (error) {
      if (!abort.signal.aborted)
        setMessage(error instanceof Error ? error.message : 'Не удалось обновить личные КД.')
    } finally {
      if (requestNumber === sequence.current) setVerifying(false)
    }
  }, [params, initial.playerID, sessionMismatch])
  useEffect(() => {
    const resume = () => {
      if (document.visibilityState === 'visible') void reload()
    }
    window.addEventListener('focus', resume)
    window.addEventListener('pageshow', resume)
    if (quest) window.addEventListener(QUEST_COOLDOWN_CHANGED_EVENT, resume)
    document.addEventListener('visibilitychange', resume)
    return () => {
      window.removeEventListener('focus', resume)
      window.removeEventListener('pageshow', resume)
      if (quest) window.removeEventListener(QUEST_COOLDOWN_CHANGED_EVENT, resume)
      document.removeEventListener('visibilitychange', resume)
      controller.current?.abort()
    }
  }, [quest, reload])

  async function mutate(target: number, record?: RecordView) {
    if (mutating.current || sessionChanged) return
    mutating.current = true
    setBusy(true)
    setMessage('')
    controller.current?.abort()
    sequence.current++
    setVerifying(false)
    const current = snapshot.records.find((item) => recordID(item) === target)
    if (!record && (!pending.current || pending.current.target !== target))
      pending.current = {
        target,
        requestID: crypto.randomUUID(),
        previousRevision: current?.revision ?? null,
      }
    const body = record
      ? { action: 'cancel', [idKey]: target, revision: record.revision }
      : {
          action: 'complete',
          [idKey]: target,
          requestID: pending.current?.requestID,
          previousRevision: pending.current?.previousRevision,
        }
    try {
      const response = await fetch('/api/account/cooldowns', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(quest ? { 'X-Cooldown-Player': String(initial.playerID) } : {}),
        },
        body: JSON.stringify(body),
        cache: 'no-store',
      })
      if (response.status === 401) {
        sessionMismatch()
        return
      }
      const data = await response.json()
      if (!response.ok) {
        if (response.status === 409) pending.current = null
        throw new Error(data.message)
      }
      if (data.playerID !== initial.playerID) {
        sessionMismatch()
        return
      }
      setSnapshot((value) => ({
        ...value,
        serverNow: data.serverNow,
        records: [
          ...value.records.filter((item) => recordID(item) !== target),
          ...data.records,
        ].sort((a, b) => a.cooldownUntil.localeCompare(b.cooldownUntil)),
      }))
      pending.current = null
      setConfirmation(null)
      window.dispatchEvent(new Event(quest ? QUEST_COOLDOWN_CHANGED_EVENT : COOLDOWN_CHANGED_EVENT))
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Не удалось сохранить отметку.')
    } finally {
      mutating.current = false
      setBusy(false)
    }
  }
  const active = snapshot.records.filter(
    (record) => !record.cancelled && Date.parse(record.cooldownUntil) > now,
  )
  const current = detailID ? snapshot.records.find((record) => recordID(record) === detailID) : null
  const end = (record: RecordView) => (
    <>
      <p className="personal-cooldowns__remaining">
        Осталось: {remainingCooldown(record.cooldownUntil, clock)}
      </p>
      <p>
        Окончание:{' '}
        <time dateTime={record.cooldownUntil}>
          {cooldownDate(record.cooldownUntil, displayZone, clock)}
        </time>
      </p>
    </>
  )
  const cancel = (record: RecordView) => (
    <button
      className="personal-cooldowns__button"
      type="button"
      disabled={busy || verifying}
      onClick={(click) => {
        cancelTrigger.current = click.currentTarget
        setConfirmation(record)
      }}
    >
      Отменить отметку
    </button>
  )
  return (
    <section
      className="personal-cooldowns"
      aria-label={detailID ? (quest ? 'Мой КД квеста' : 'Мой КД ивента') : (listTitle ?? 'Мои КД')}
      aria-busy={busy || verifying}
    >
      {listTitle ? (
        <h3 ref={heading} tabIndex={-1}>
          {listTitle}
        </h3>
      ) : (
        <h2 ref={heading} tabIndex={-1}>
          {detailID ? 'Мой КД' : 'Мои КД'}
        </h2>
      )}
      {sessionChanged ? (
        <p>
          Сессия изменилась.{' '}
          <button
            type="button"
            className="personal-cooldowns__button"
            onClick={() => window.location.reload()}
          >
            Обновите страницу
          </button>{' '}
          или <Link href="/login?returnTo=%2Faccount%2Fcooldowns">войдите снова</Link>.
        </p>
      ) : verifying || !verified ? (
        <p role="status">
          {verifying ? 'Обновляем личные КД…' : 'Обновите данные, чтобы показать личные КД.'}
        </p>
      ) : detailID ? (
        <>
          {current && !current.cancelled ? (
            Date.parse(current.cooldownUntil) > now ? (
              <>
                {end(current)}
                {cancel(current)}
              </>
            ) : (
              <>
                <p role="status">
                  {current.cooldownUntil === current.completedAt
                    ? 'Прохождение сохранено. У ивента нет личного КД.'
                    : 'КД закончился.'}
                </p>
                {!quest && cancel(current)}
              </>
            )
          ) : (
            <p>{quest ? 'Отметьте сдачу квеста.' : 'Сохраните прохождение этого ивента.'}</p>
          )}
          {(!current || current.cancelled || Date.parse(current.cooldownUntil) <= now) && (
            <button
              className="personal-cooldowns__button personal-cooldowns__button--primary"
              disabled={busy}
              type="button"
              onClick={() => void mutate(detailID)}
            >
              {quest ? 'Сдал' : 'Прошёл'}
            </button>
          )}
          {!quest && (
            <p className="personal-cooldowns__hint">
              Личный КД не определяет наличие или занятость ивента.
            </p>
          )}
        </>
      ) : active.length ? (
        <ul className="personal-cooldowns__list">
          {active.map((record) => (
            <li key={recordID(record)} className="personal-cooldowns__item">
              <h3>
                <Link href={`/${quest ? 'quests' : 'events'}/${record.slug}`}>{record.name}</Link>
              </h3>
              {end(record)}
              {cancel(record)}
            </li>
          ))}
        </ul>
      ) : (
        <p>{quest ? 'Активных КД квестов нет.' : 'Активных личных КД нет.'}</p>
      )}
      {quest ? (
        <AlertDialog
          open={Boolean(confirmation)}
          onOpenChange={(open) => {
            if (!open && !busy) setConfirmation(null)
          }}
        >
          <AlertDialogContent
            onCloseAutoFocus={(event) => {
              event.preventDefault()
              if (cancelTrigger.current?.isConnected) cancelTrigger.current.focus()
              else heading.current?.focus()
            }}
          >
            <AlertDialogHeader>
              <AlertDialogTitle>Отменить сдачу?</AlertDialogTitle>
              <AlertDialogDescription>
                Отменить отметку «{confirmation?.name}»?
              </AlertDialogDescription>
            </AlertDialogHeader>
            {message && <p role="alert">{message}</p>}
            <AlertDialogFooter>
              <AlertDialogCancel disabled={busy}>Оставить отметку</AlertDialogCancel>
              <AlertDialogAction
                disabled={busy}
                onClick={(event) => {
                  event.preventDefault()
                  if (confirmation) void mutate(recordID(confirmation), confirmation)
                }}
              >
                Да, отменить
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      ) : (
        confirmation &&
        !sessionChanged && (
          <div
            role="group"
            aria-label="Подтверждение отмены"
            className="personal-cooldowns__confirmation"
          >
            <p>Отменить отметку «{confirmation.name}»?</p>
            <button
              type="button"
              className="personal-cooldowns__button"
              disabled={busy || verifying}
              onClick={() => void mutate(recordID(confirmation), confirmation)}
            >
              Да, отменить
            </button>
            <button
              type="button"
              className="personal-cooldowns__button"
              disabled={busy}
              onClick={() => setConfirmation(null)}
            >
              Оставить отметку
            </button>
          </div>
        )
      )}
      {message && (
        <div role="alert">
          <p>{message}</p>
          <button
            className="personal-cooldowns__button"
            type="button"
            disabled={busy || verifying}
            onClick={() => void reload()}
          >
            Обновить данные
          </button>
        </div>
      )}
      {busy && <p role="status">Сохраняем…</p>}
    </section>
  )
}
