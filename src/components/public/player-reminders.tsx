'use client'

import Link from 'next/link'
import { useCallback, useEffect, useRef, useState } from 'react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { cooldownDate, remainingCooldown } from '@/lib/player-cooldowns'
import {
  DELIVERY_NOTICE,
  playingAt,
  reminderMessage,
  validLead,
  type ReminderKind,
  type ReminderPreview,
  type ReminderSnapshot,
  type ReminderView,
} from '@/lib/player-reminders'
import { normalizeTimeZone, timeZoneLabel } from '@/lib/time-zones'
import { useServerClock, useTimeZone } from './time-zone'

type WriteResult = { ok: boolean; message?: string; proposal?: ReminderPreview }
type Write = (body: Record<string, unknown>) => Promise<WriteResult>
type Target = { id: number; name: string }

function ReminderEditor({
  target,
  existing,
  playerID,
  zone,
  busy,
  write,
  label = 'Напомнить',
}: {
  target: Target
  existing?: ReminderView
  playerID: number
  zone: string
  busy: boolean
  write: Write
  label?: string
}) {
  const [open, setOpen] = useState(false)
  const [kind, setKind] = useState<ReminderKind>(existing?.kind ?? 'once')
  const [preset, setPreset] = useState('10')
  const [custom, setCustom] = useState('10')
  const [include, setInclude] = useState(true)
  const [enabled, setEnabled] = useState(true)
  const [preview, setPreview] = useState<ReminderPreview | null>(null)
  const [loading, setLoading] = useState(false)
  const [previewFor, setPreviewFor] = useState('')
  const [message, setMessage] = useState('')
  const lead = Number(preset === 'custom' ? custom : preset)
  const signature = `${target.id}:${kind}:${lead}`
  const loadNumber = useRef(0)
  const loadPreview = useCallback(
    async (signal?: AbortSignal) => {
      const sequence = ++loadNumber.current
      setPreview(null)
      setPreviewFor(`${target.id}:${kind}:${lead}`)
      setLoading(true)
      try {
        if (!validLead(lead)) throw new Error('Введите целое число от 1 до 120 минут.')
        const response = await fetch(
          `/api/account/reminders?preview=1&eventID=${target.id}&kind=${kind}&leadMinutes=${lead}`,
          { cache: 'no-store', signal },
        )
        const data = await response.json()
        if (signal?.aborted || sequence !== loadNumber.current) return
        if (!response.ok || data.playerID !== playerID)
          throw new Error(data.message ?? 'Сессия изменилась. Обновите страницу.')
        setPreview(data)
        setMessage('')
      } catch (error) {
        if (!signal?.aborted && sequence === loadNumber.current)
          setMessage(error instanceof Error ? error.message : 'Не удалось рассчитать запуск.')
      } finally {
        if (sequence === loadNumber.current) setLoading(false)
      }
    },
    [target.id, kind, lead, playerID],
  )
  useEffect(() => {
    if (!open) return
    const controller = new AbortController()
    // Debounce custom-minute input and avoid an obsolete preview becoming saveable.
    const timer = setTimeout(() => void loadPreview(controller.signal), 150)
    return () => {
      clearTimeout(timer)
      controller.abort()
    }
  }, [open, loadPreview])
  const allowSave =
    preview &&
    previewFor === signature &&
    !loading &&
    validLead(lead) &&
    (kind === 'regular'
      ? preview.reason !== 'Ивент недоступен.' && !preview.reason?.includes('нет расписания')
      : !!preview.proposal)
  return (
    <Dialog
      open={open}
      onOpenChange={(value) => {
        if (busy && !value) return
        if (value) {
          const minutes = existing?.leadMinutes ?? 10
          setKind(existing?.kind ?? 'once')
          setPreset([5, 10, 15, 30].includes(minutes) ? String(minutes) : 'custom')
          setCustom(String(minutes))
          setInclude(existing?.includeCooldown ?? true)
          setEnabled(existing?.enabled ?? true)
          setPreview(null)
          setMessage('')
        }
        setOpen(value)
      }}
    >
      <DialogTrigger asChild>
        <button type="button" className="player-reminders__button" disabled={busy}>
          {label}
        </button>
      </DialogTrigger>
      <DialogContent className="reminder-dialog" closeLabel="Закрыть напоминание">
        <DialogTitle className="reminder-dialog__title">Напомнить: {target.name}</DialogTitle>
        <DialogDescription>
          Настройте напоминание. Отправка сообщений пока не подключена.
        </DialogDescription>
        <form
          className="reminder-dialog__form"
          onSubmit={async (event) => {
            event.preventDefault()
            if (!allowSave || busy || !preview) return
            const result = await write({
              action: 'save',
              eventID: target.id,
              kind,
              leadMinutes: lead,
              includeCooldown: include,
              enabled,
              launchAt: kind === 'once' ? preview.proposal!.launchAt : null,
              revision: preview.revision,
            })
            if (result.ok) setOpen(false)
            else {
              if (result.proposal) setPreview(result.proposal)
              else await loadPreview()
              setMessage(result.message ?? 'Не удалось сохранить настройки.')
            }
          }}
        >
          <label className="player-reminders__field">
            Предупредить за
            <select
              aria-label="Предупредить за"
              value={preset}
              onChange={(event) => setPreset(event.target.value)}
              disabled={busy}
            >
              {[5, 10, 15, 30].map((minutes) => (
                <option key={minutes} value={minutes}>
                  {minutes} минут
                </option>
              ))}
              <option value="custom">Своё значение</option>
            </select>
          </label>
          {preset === 'custom' && (
            <label className="player-reminders__field">
              Своё значение (минут)
              <input
                type="number"
                min={1}
                max={120}
                step={1}
                required
                value={custom}
                onChange={(event) => setCustom(event.target.value)}
                disabled={busy}
              />
            </label>
          )}
          <label className="player-reminders__field">
            Режим напоминания
            <select
              aria-label="Режим напоминания"
              value={kind}
              onChange={(event) => setKind(event.target.value as ReminderKind)}
              disabled={busy}
            >
              <option value="once">Один запуск</option>
              <option value="regular">Пока я играю</option>
            </select>
          </label>
          {kind === 'regular' && (
            <>
              <p>
                Регулярные напоминания действуют, пока включён режим «Я играю». Сохранение подписки
                не включает его.
              </p>
              <label>
                <input
                  type="checkbox"
                  checked={enabled}
                  onChange={(event) => setEnabled(event.target.checked)}
                  disabled={busy}
                />{' '}
                Подписка включена
              </label>
            </>
          )}
          <label>
            <input
              type="checkbox"
              checked={include}
              onChange={(event) => setInclude(event.target.checked)}
              disabled={busy}
            />{' '}
            Показывать мой КД в уведомлении
          </label>
          {loading || (validLead(lead) && previewFor !== signature) ? (
            <p role="status">Рассчитываем запуск…</p>
          ) : (
            preview && (
              <div className="reminder-dialog__proposal">
                <p>Часовой пояс: {timeZoneLabel(normalizeTimeZone(zone), preview.serverNow)}</p>
                {preview.proposal ? (
                  <>
                    <p>
                      Запуск:{' '}
                      <time dateTime={preview.proposal.launchAt}>
                        {cooldownDate(preview.proposal.launchAt, zone, preview.serverNow)}
                      </time>
                    </p>
                    <p>
                      Напоминание:{' '}
                      <time dateTime={preview.proposal.remindAt}>
                        {cooldownDate(preview.proposal.remindAt, zone, preview.serverNow)}
                      </time>
                    </p>
                    <p className="player-reminders__preview">
                      Предпросмотр:{' '}
                      {reminderMessage(
                        target.name,
                        preview.proposal,
                        include,
                        preview.cooldownUntil,
                        preview.serverNow,
                        zone,
                      )}
                    </p>
                    <p>
                      {include
                        ? 'Это пример текста. При будущей отправке данные КД будут проверяться заново.'
                        : 'Это пример текста. Отправка сообщений пока не подключена.'}
                    </p>
                  </>
                ) : (
                  <p>{preview.reason}</p>
                )}
              </div>
            )
          )}
          {message && <p role="alert">{message}</p>}
          <div className="player-reminders__actions">
            <button
              type="submit"
              className="player-reminders__button player-reminders__button--primary"
              disabled={!allowSave || busy}
            >
              {busy ? 'Сохраняем…' : 'Сохранить настройки'}
            </button>
            <button
              type="button"
              className="player-reminders__button"
              disabled={busy}
              onClick={() => setOpen(false)}
            >
              Отмена
            </button>
            {!loading && !preview && (
              <button
                type="button"
                className="player-reminders__button"
                onClick={() => void loadPreview()}
              >
                Обновить предложение
              </button>
            )}
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}

export function PlayerReminders({
  initial,
  timeZone,
  event,
}: {
  initial: ReminderSnapshot
  timeZone: string
  event?: Target
}) {
  const [snapshot, setSnapshot] = useState(initial)
  const [busy, setBusy] = useState(false)
  const [checking, setChecking] = useState(false)
  const [verified, setVerified] = useState(true)
  const [sessionChanged, setSessionChanged] = useState(false)
  const [message, setMessage] = useState('')
  const [hours, setHours] = useState('4')
  const [deleting, setDeleting] = useState<number | null>(null)
  const zone = useTimeZone(normalizeTimeZone(timeZone))
  const clock = useServerClock(snapshot.serverNow)
  const active = playingAt(snapshot.play, clock)
  const mutating = useRef(false)
  const pending = useRef<{ signature: string; requestID: string } | null>(null)
  const controller = useRef<AbortController | null>(null)
  const sequence = useRef(0)
  const dueReload = useRef('')
  const endpoint = `/api/account/reminders${event ? `?eventID=${event.id}` : ''}`
  const changeSession = useCallback(() => {
    setSnapshot((value) => ({ ...value, play: null, reminders: [] }))
    setSessionChanged(true)
    setDeleting(null)
  }, [])
  const reload = useCallback(async () => {
    if (mutating.current) return
    controller.current?.abort()
    const abort = new AbortController()
    controller.current = abort
    const current = ++sequence.current
    setChecking(true)
    setVerified(false)
    setDeleting(null)
    try {
      const response = await fetch(endpoint, { cache: 'no-store', signal: abort.signal })
      if (abort.signal.aborted || current !== sequence.current) return
      if (response.status === 401) {
        changeSession()
        return
      }
      const data = await response.json()
      if (abort.signal.aborted || current !== sequence.current) return
      if (!response.ok) throw new Error(data.message)
      if (data.playerID !== initial.playerID) {
        changeSession()
        return
      }
      setSnapshot(data)
      pending.current = null
      setVerified(true)
      setMessage('')
    } catch (error) {
      if (!abort.signal.aborted)
        setMessage(error instanceof Error ? error.message : 'Не удалось обновить настройки.')
    } finally {
      if (current === sequence.current) setChecking(false)
    }
  }, [endpoint, initial.playerID, changeSession])
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
  const due = active
    ? snapshot.reminders.find(
        (row) =>
          row.kind === 'regular' &&
          row.enabled &&
          row.proposal &&
          Date.parse(row.proposal.remindAt) <= Date.parse(clock),
      )
    : null
  useEffect(() => {
    const key = due?.proposal ? `${due.id}:${due.proposal.remindAt}` : ''
    if (key && dueReload.current !== key) {
      dueReload.current = key
      void reload()
    }
  }, [due, reload])

  const write: Write = async (body) => {
    if (mutating.current || sessionChanged)
      return { ok: false, message: 'Операция уже выполняется или сессия изменилась.' }
    mutating.current = true
    setBusy(true)
    setMessage('')
    controller.current?.abort()
    sequence.current++
    setChecking(false)
    const signature = JSON.stringify(body)
    if (pending.current?.signature !== signature)
      pending.current = { signature, requestID: crypto.randomUUID() }
    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...body, requestID: pending.current.requestID }),
        cache: 'no-store',
      })
      if (response.status === 401) {
        changeSession()
        return { ok: false, message: 'Необходимо войти заново.' }
      }
      const data = await response.json()
      if (!response.ok) {
        setMessage(data.message)
        if (response.status === 409) pending.current = null
        return { ok: false, ...data }
      }
      if (data.playerID !== initial.playerID) {
        changeSession()
        return { ok: false, message: 'Сессия изменилась.' }
      }
      setSnapshot(data)
      setVerified(true)
      pending.current = null
      setDeleting(null)
      setMessage(DELIVERY_NOTICE)
      return { ok: true }
    } catch {
      const message = 'Не удалось сохранить настройки. Проверьте связь и повторите.'
      setMessage(message)
      return { ok: false, message }
    } finally {
      mutating.current = false
      setBusy(false)
    }
  }
  const rowStatus = (row: ReminderView) => {
    if (row.status === 'invalid')
      return 'Расписание или ивент недоступны. Требуется перевыбрать запуск.'
    if (row.kind === 'once')
      return row.proposal && Date.parse(row.proposal.remindAt) <= Date.parse(clock)
        ? 'Время напоминания прошло. Отправка не подключена.'
        : 'Один запуск'
    if (!row.enabled) return 'Подписка отключена'
    if (!active) return 'Ожидает включения «Я играю»'
    if (!row.proposal) return 'В оставшийся период подходящих запусков нет'
    return 'Пока я играю'
  }
  return (
    <section
      className="player-reminders"
      aria-label={event ? 'Напоминания об ивенте' : 'Напоминания'}
      aria-busy={busy || checking}
    >
      <h2>Напоминания</h2>
      <p>Отправка сообщений пока не подключена.</p>
      {sessionChanged ? (
        <p>Сессия изменилась. Обновите страницу или войдите заново.</p>
      ) : !verified || checking ? (
        <p role="status">
          {checking ? 'Обновляем настройки…' : 'Обновите данные для просмотра настроек.'}
        </p>
      ) : (
        <>
          {event ? (
            <ReminderEditor
              target={event}
              playerID={initial.playerID}
              zone={zone}
              busy={busy}
              write={write}
            />
          ) : (
            <section className="player-reminders__play" aria-label="Режим Я играю">
              <h3>Я играю</h3>
              {active && snapshot.play ? (
                <>
                  <p>Режим включён. Осталось: {remainingCooldown(snapshot.play.endsAt, clock)}</p>
                  <p>
                    Окончание:{' '}
                    <time dateTime={snapshot.play.endsAt}>
                      {cooldownDate(snapshot.play.endsAt, zone, clock)}
                    </time>
                  </p>
                  <div className="player-reminders__actions">
                    {[1, 2].map((hours) => (
                      <button
                        key={hours}
                        className="player-reminders__button"
                        disabled={busy}
                        onClick={() =>
                          void write({
                            action: 'play',
                            operation: 'extend',
                            hours,
                            revision: snapshot.play!.revision,
                          })
                        }
                      >
                        Продлить на {hours} ч.
                      </button>
                    ))}
                    <button
                      className="player-reminders__button"
                      disabled={busy}
                      onClick={() =>
                        void write({
                          action: 'play',
                          operation: 'stop',
                          revision: snapshot.play!.revision,
                        })
                      }
                    >
                      Выключить «Я играю»
                    </button>
                  </div>
                </>
              ) : (
                <>
                  <p>Режим выключен. Подписки сохранены и ожидают включения.</p>
                  <label className="player-reminders__field">
                    Включить на
                    <select
                      aria-label="Включить на"
                      value={hours}
                      onChange={(event) => setHours(event.target.value)}
                    >
                      {[2, 4, 6].map((value) => (
                        <option key={value} value={value}>
                          {value} часа
                        </option>
                      ))}
                    </select>
                  </label>
                  <button
                    className="player-reminders__button"
                    disabled={busy}
                    onClick={() =>
                      void write({
                        action: 'play',
                        operation: 'start',
                        hours: Number(hours),
                        revision: snapshot.play?.revision ?? null,
                      })
                    }
                  >
                    Включить «Я играю»
                  </button>
                </>
              )}
              <p>
                И предупреждение, и запуск должны попасть в период игры. Пропущенные предупреждения
                не догоняем. Разовые напоминания от этого режима не зависят.
              </p>
            </section>
          )}
          {(['once', 'regular'] as const).map((kind) => (
            <section
              key={kind}
              aria-label={kind === 'once' ? 'Разовые напоминания' : 'Регулярные подписки'}
            >
              <h3>{kind === 'once' ? 'Разовые напоминания' : 'Регулярные подписки'}</h3>
              {!snapshot.reminders.some((row) => row.kind === kind) ? (
                <p>{kind === 'once' ? 'Разовых напоминаний нет.' : 'Регулярных подписок нет.'}</p>
              ) : (
                <ul className="player-reminders__list">
                  {snapshot.reminders
                    .filter((row) => row.kind === kind)
                    .map((row) => (
                      <li key={row.id} className="player-reminders__item">
                        <h4>
                          {row.slug ? (
                            <Link href={`/events/${row.slug}`}>{row.name}</Link>
                          ) : (
                            row.name
                          )}
                        </h4>
                        <p>{rowStatus(row)}</p>
                        <p>
                          За {row.leadMinutes} мин. ·{' '}
                          {row.includeCooldown ? 'Показывать личный КД' : 'Без сведений о КД'}
                        </p>
                        {row.proposal && (kind === 'once' || (active && row.enabled)) && (
                          <>
                            <p>
                              Запуск:{' '}
                              <time dateTime={row.proposal.launchAt}>
                                {cooldownDate(row.proposal.launchAt, zone, clock)}
                              </time>
                            </p>
                            <p>
                              Напоминание:{' '}
                              <time dateTime={row.proposal.remindAt}>
                                {cooldownDate(row.proposal.remindAt, zone, clock)}
                              </time>
                            </p>
                            {row.status !== 'invalid' && (
                              <>
                                <p className="player-reminders__preview">
                                  Предпросмотр:{' '}
                                  {reminderMessage(
                                    row.name,
                                    row.proposal,
                                    row.includeCooldown,
                                    row.cooldownUntil,
                                    clock,
                                    zone,
                                  )}
                                </p>
                                <p>
                                  {row.includeCooldown
                                    ? 'Данные КД при будущей отправке будут проверяться заново.'
                                    : 'Это предпросмотр будущего сообщения.'}
                                </p>
                              </>
                            )}
                          </>
                        )}
                        <div className="player-reminders__actions">
                          {row.eventID && row.slug && (
                            <ReminderEditor
                              target={{ id: row.eventID, name: row.name }}
                              existing={row}
                              playerID={initial.playerID}
                              zone={zone}
                              busy={busy}
                              write={write}
                              label="Изменить"
                            />
                          )}
                          {kind === 'regular' && (
                            <button
                              className="player-reminders__button"
                              disabled={busy}
                              onClick={() =>
                                void write({
                                  action: 'toggle',
                                  id: row.id,
                                  enabled: !row.enabled,
                                  revision: row.revision,
                                })
                              }
                            >
                              {row.enabled ? 'Отключить подписку' : 'Включить подписку'}
                            </button>
                          )}
                          <button
                            className="player-reminders__button"
                            disabled={busy}
                            onClick={() => setDeleting(row.id)}
                          >
                            Удалить
                          </button>
                        </div>
                        {deleting === row.id && (
                          <div role="group" aria-label="Подтверждение удаления">
                            <p>Удалить эту настройку?</p>
                            <button
                              className="player-reminders__button"
                              disabled={busy}
                              onClick={() =>
                                void write({ action: 'delete', id: row.id, revision: row.revision })
                              }
                            >
                              Да, удалить
                            </button>
                            <button
                              className="player-reminders__button"
                              disabled={busy}
                              onClick={() => setDeleting(null)}
                            >
                              Оставить
                            </button>
                          </div>
                        )}
                      </li>
                    ))}
                </ul>
              )}
            </section>
          ))}
        </>
      )}
      {message && <p role="status">{message}</p>}
      {!sessionChanged && (
        <button
          type="button"
          className="player-reminders__button"
          disabled={busy || checking}
          onClick={() => void reload()}
        >
          Обновить напоминания
        </button>
      )}
    </section>
  )
}
