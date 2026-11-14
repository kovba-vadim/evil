'use client'

import Link from 'next/link'
import { useCallback, useEffect, useRef, useState } from 'react'
import {
  cooldownDate,
  remainingCooldown,
  type CooldownSnapshot,
  type PersonalCooldown,
} from '@/lib/player-cooldowns'
import { useServerClock, useTimeZone } from './time-zone'
import { normalizeTimeZone } from '@/lib/time-zones'

export function PlayerCooldowns({
  initial,
  eventID,
  timeZone,
}: {
  initial: CooldownSnapshot
  eventID?: number
  timeZone: string
}) {
  const [snapshot, setSnapshot] = useState(initial)
  const displayZone = useTimeZone(normalizeTimeZone(timeZone))
  const [busy, setBusy] = useState(false)
  const [verifying, setVerifying] = useState(false)
  const [verified, setVerified] = useState(true)
  const [message, setMessage] = useState('')
  const [sessionChanged, setSessionChanged] = useState(false)
  const [confirmation, setConfirmation] = useState<PersonalCooldown | null>(null)
  const clock = useServerClock(snapshot.serverNow)
  const now = Date.parse(clock)
  const sequence = useRef(0)
  const controller = useRef<AbortController | null>(null)
  const mutating = useRef(false)
  const pending = useRef<{
    eventID: number
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
      const response = await fetch(
        `/api/account/cooldowns${eventID ? `?eventID=${eventID}` : ''}`,
        { cache: 'no-store', signal: abort.signal },
      )
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
  }, [eventID, initial.playerID, sessionMismatch])
  useEffect(() => {
    const resume = () => {
      if (document.visibilityState === 'visible') void reload()
    }
    window.addEventListener('focus', resume)
    window.addEventListener('pageshow', resume)
    document.addEventListener('visibilitychange', resume)
    return () => {
      window.removeEventListener('focus', resume)
      window.removeEventListener('pageshow', resume)
      document.removeEventListener('visibilitychange', resume)
      controller.current?.abort()
    }
  }, [reload])

  async function mutate(target: number, record?: PersonalCooldown) {
    if (mutating.current || sessionChanged) return
    mutating.current = true
    setBusy(true)
    setMessage('')
    controller.current?.abort()
    sequence.current++
    setVerifying(false)
    const current = snapshot.records.find((item) => item.eventID === target)
    if (!record && (!pending.current || pending.current.eventID !== target))
      pending.current = {
        eventID: target,
        requestID: crypto.randomUUID(),
        previousRevision: current?.revision ?? null,
      }
    const body = record
      ? { action: 'cancel', eventID: target, revision: record.revision }
      : { action: 'complete', ...pending.current }
    try {
      const response = await fetch('/api/account/cooldowns', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
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
        records: [...value.records.filter((item) => item.eventID !== target), ...data.records].sort(
          (a, b) => a.cooldownUntil.localeCompare(b.cooldownUntil),
        ),
      }))
      pending.current = null
      setConfirmation(null)
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
  const current = eventID ? snapshot.records.find((record) => record.eventID === eventID) : null
  const end = (record: PersonalCooldown) => (
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
  const cancel = (record: PersonalCooldown) => (
    <button
      className="personal-cooldowns__button"
      type="button"
      disabled={busy || verifying}
      onClick={() => setConfirmation(record)}
    >
      Отменить отметку
    </button>
  )
  return (
    <section
      className="personal-cooldowns"
      aria-label={eventID ? 'Мой КД ивента' : 'Мои КД'}
      aria-busy={busy || verifying}
    >
      {eventID ? <h2>Мой КД</h2> : <h2>Мои КД</h2>}
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
          или <Link href="/login?returnTo=%2Faccount">войдите снова</Link>.
        </p>
      ) : verifying || !verified ? (
        <p role="status">
          {verifying ? 'Обновляем личные КД…' : 'Обновите данные, чтобы показать личные КД.'}
        </p>
      ) : eventID ? (
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
                {cancel(current)}
              </>
            )
          ) : (
            <p>Сохраните прохождение этого ивента.</p>
          )}
          {(!current || current.cancelled || Date.parse(current.cooldownUntil) <= now) && (
            <button
              className="personal-cooldowns__button personal-cooldowns__button--primary"
              disabled={busy}
              type="button"
              onClick={() => void mutate(eventID)}
            >
              Прошёл
            </button>
          )}
          <p className="personal-cooldowns__hint">
            Личный КД не определяет наличие или занятость ивента.
          </p>
        </>
      ) : active.length ? (
        <ul className="personal-cooldowns__list">
          {active.map((record) => (
            <li key={record.eventID} className="personal-cooldowns__item">
              <h3>
                <Link href={`/events/${record.slug}`}>{record.name}</Link>
              </h3>
              {end(record)}
              {cancel(record)}
            </li>
          ))}
        </ul>
      ) : (
        <p>Активных личных КД нет.</p>
      )}
      {confirmation && !sessionChanged && (
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
            onClick={() => void mutate(confirmation.eventID, confirmation)}
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
