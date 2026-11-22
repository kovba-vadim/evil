'use client'

import Link from 'next/link'
import { BellOff, BellRing, Pencil, Trash2 } from 'lucide-react'
import { Button, buttonVariants } from '@/components/ui/button'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog'
import { useCallback, useEffect, useRef, useState, type ReactElement } from 'react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { cooldownDate, remainingCooldown, COOLDOWN_CHANGED_EVENT } from '@/lib/player-cooldowns'
import {
  DELIVERY_NOTICE,
  playingAt,
  reminderMessage,
  validLead,
  type PlayPeriod,
  type ReminderPreview,
  type ReminderSnapshot,
  type ReminderView,
} from '@/lib/player-reminders'
import { normalizeTimeZone, timeZoneLabel } from '@/lib/time-zones'
import { useServerClock, useTimeZone } from './time-zone'
import { publishPlayPeriod, subscribePlayPeriod, type PlaySnapshot } from '@/lib/play-period-sync'

type WriteResult = {
  ok: boolean
  message?: string
  proposal?: ReminderPreview
  snapshot?: ReminderSnapshot
  status?: number
}
export type ReminderWrite = (body: Record<string, unknown>) => Promise<WriteResult>
type Target = { id: number; name: string }

function PlayPeriodControls({
  play,
  clock,
  zone,
  busy,
  write,
  hours,
  setHours,
}: {
  play: PlayPeriod | null
  clock: string
  zone: string
  busy: boolean
  write: ReminderWrite
  hours: string
  setHours: (value: string) => void
}) {
  return (
    <>
      {play && playingAt(play, clock) ? (
        <>
          <p>Режим включён. Осталось: {remainingCooldown(play.endsAt, clock)}</p>
          <p>
            Окончание: <time dateTime={play.endsAt}>{cooldownDate(play.endsAt, zone, clock)}</time>
          </p>
          <div className="player-reminders__play-actions">
            <Button
              type="button"
              variant="outline"
              disabled={busy}
              onClick={() =>
                void write({
                  action: 'play',
                  operation: 'extend',
                  hours: 1,
                  revision: play.revision,
                })
              }
            >
              Продлить на 1 ч.
            </Button>
            <Button
              type="button"
              variant="outline"
              disabled={busy}
              onClick={() =>
                void write({
                  action: 'play',
                  operation: 'stop',
                  revision: play.revision,
                })
              }
            >
              Выключить
            </Button>
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
                revision: play?.revision ?? null,
              })
            }
          >
            Включить «Я играю»
          </button>
        </>
      )}
    </>
  )
}

function PlayPeriodDialogBody({
  playerID,
  zone,
  busy,
  write,
  onSessionChanged,
  onChanged,
  onLoaded,
}: {
  playerID: number
  zone: string
  busy: boolean
  write: ReminderWrite
  onSessionChanged?: () => void
  onChanged?: () => void
  onLoaded?: (snapshot: PlaySnapshot) => void
}) {
  const [snapshot, setSnapshot] = useState<ReminderSnapshot | null>(null)
  const [message, setMessage] = useState('')
  const [checking, setChecking] = useState(true)
  const [hours, setHours] = useState('4')
  const clock = useServerClock(snapshot?.serverNow ?? '1970-01-01T00:00:00Z')
  const load = useCallback(
    async (signal?: AbortSignal) => {
      try {
        const response = await fetch('/api/account/reminders', { cache: 'no-store', signal })
        if (signal?.aborted) return
        if (response.status === 401) {
          onSessionChanged?.()
          throw new Error('Сессия изменилась. Войдите заново.')
        }
        if (!response.ok) throw new Error('Не удалось загрузить игровой период.')
        const data: ReminderSnapshot = await response.json()
        if (signal?.aborted) return
        if (data.playerID !== playerID) {
          onSessionChanged?.()
          throw new Error('Сессия изменилась. Войдите заново.')
        }
        setSnapshot(data)
        onLoaded?.(data)
      } catch (error) {
        if (!signal?.aborted) {
          setSnapshot(null)
          setMessage(
            error instanceof Error ? error.message : 'Не удалось загрузить игровой период.',
          )
        }
      } finally {
        if (!signal?.aborted) setChecking(false)
      }
    },
    [onSessionChanged, onLoaded, playerID],
  )
  useEffect(() => {
    const controller = new AbortController()
    const timer = setTimeout(() => void load(controller.signal), 0)
    return () => {
      clearTimeout(timer)
      controller.abort()
    }
  }, [load])

  const update: ReminderWrite = async (body) => {
    setMessage('')
    const result = await write(body)
    if (result.snapshot) {
      setSnapshot(result.snapshot)
      onChanged?.()
    } else if (!result.ok) {
      setMessage(result.message ?? 'Не удалось изменить игровой период.')
      if (result.status === 409) {
        setChecking(true)
        await load()
        onChanged?.()
      }
    }
    return result
  }
  return (
    <>
      {checking && <p role="status">Загружаем игровой период…</p>}
      {snapshot && (
        <PlayPeriodControls
          play={snapshot.play}
          clock={clock}
          zone={zone}
          busy={busy || checking}
          write={update}
          hours={hours}
          setHours={setHours}
        />
      )}
      {message && <p role="alert">{message}</p>}
      {!snapshot && !checking && (
        <Button
          variant="outline"
          onClick={() => {
            setMessage('')
            setChecking(true)
            void load()
          }}
        >
          Повторить
        </Button>
      )}
    </>
  )
}

export function PlayPeriodDialog({
  trigger,
  ...body
}: Parameters<typeof PlayPeriodDialogBody>[0] & { trigger: ReactElement }) {
  const [open, setOpen] = useState(false)
  return (
    <Dialog
      open={open}
      onOpenChange={(value) => {
        if (!body.busy || value) setOpen(value)
      }}
    >
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="reminder-dialog" closeLabel="Закрыть управление игровым периодом">
        <DialogTitle className="reminder-dialog__title">Я играю</DialogTitle>
        <DialogDescription>Управление игровым периодом.</DialogDescription>
        <PlayPeriodDialogBody {...body} />
      </DialogContent>
    </Dialog>
  )
}

export function ReminderEditor({
  target,
  existing,
  playerID,
  zone,
  busy,
  write,
  label = 'Напомнить',
  compact = false,
  trigger,
  onSessionChanged,
}: {
  target: Target
  existing?: ReminderView
  playerID: number
  zone: string
  busy: boolean
  write: ReminderWrite
  label?: string
  compact?: boolean
  trigger?: ReactElement
  onSessionChanged?: () => void
}) {
  const [open, setOpen] = useState(false)
  const [preset, setPreset] = useState('10')
  const [custom, setCustom] = useState('10')
  const [include, setInclude] = useState(true)
  const [enabled, setEnabled] = useState(true)
  const [preview, setPreview] = useState<ReminderPreview | null>(null)
  const [loading, setLoading] = useState(false)
  const [previewFor, setPreviewFor] = useState('')
  const [message, setMessage] = useState('')
  const lead = Number(preset === 'custom' ? custom : preset)
  const signature = `${target.id}:${lead}`
  const loadNumber = useRef(0)
  const loadPreview = useCallback(
    async (signal?: AbortSignal) => {
      const sequence = ++loadNumber.current
      setPreview(null)
      setPreviewFor(`${target.id}:${lead}`)
      setLoading(true)
      try {
        if (!validLead(lead)) throw new Error('Введите целое число от 1 до 120 минут.')
        const response = await fetch(
          `/api/account/reminders?preview=1&eventID=${target.id}&kind=regular&leadMinutes=${lead}`,
          { cache: 'no-store', signal },
        )
        const data = await response.json()
        if (signal?.aborted || sequence !== loadNumber.current) return
        if (response.status === 401 || (response.ok && data.playerID !== playerID)) {
          onSessionChanged?.()
          throw new Error('Сессия изменилась. Войдите заново.')
        }
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
    [target.id, lead, playerID, onSessionChanged],
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
    preview.reason !== 'Ивент недоступен.' &&
    !preview.reason?.includes('нет расписания')
  return (
    <Dialog
      open={open}
      onOpenChange={(value) => {
        if (busy && !value) return
        if (value) {
          const minutes = existing?.leadMinutes ?? 10
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
        {trigger ??
          (compact ? (
            <Button
              type="button"
              size="icon-lg"
              variant="ghost"
              disabled={busy}
              aria-label={label}
              title={label}
            >
              <Pencil aria-hidden="true" />
            </Button>
          ) : (
            <button type="button" className="player-reminders__button" disabled={busy}>
              {label}
            </button>
          ))}
      </DialogTrigger>
      <DialogContent className="reminder-dialog" closeLabel="Закрыть напоминание">
        <DialogTitle className="reminder-dialog__title">Напомнить: {target.name}</DialogTitle>
        <DialogDescription>
          Настройте напоминание. Отправка сообщений пока не подключена.
        </DialogDescription>
        <p>
          <strong>Внимание!</strong> Напоминания работают только при включённом режиме{' '}
          <PlayPeriodDialog
            trigger={
              <button type="button" className="reminder-dialog__play-link" disabled={busy}>
                «Я играю»
              </button>
            }
            playerID={playerID}
            zone={zone}
            busy={busy}
            write={write}
            onSessionChanged={onSessionChanged}
            onChanged={() => void loadPreview()}
          />
          .
        </p>
        <form
          className="reminder-dialog__form"
          onSubmit={async (event) => {
            event.preventDefault()
            if (!allowSave || busy || !preview) return
            const result = await write({
              action: 'save',
              eventID: target.id,
              kind: 'regular',
              leadMinutes: lead,
              includeCooldown: include,
              enabled,
              launchAt: null,
              revision: trigger ? null : preview.revision,
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
          {!trigger && (
            <label>
              <input
                type="checkbox"
                checked={enabled}
                onChange={(event) => setEnabled(event.target.checked)}
                disabled={busy}
              />{' '}
              Подписка включена
            </label>
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
  pageHeading = false,
}: {
  initial: ReminderSnapshot
  timeZone: string
  event?: Target
  pageHeading?: boolean
}) {
  const [snapshot, setSnapshot] = useState(initial)
  const [busy, setBusy] = useState(false)
  const [checking, setChecking] = useState(false)
  const [verified, setVerified] = useState(true)
  const [sessionChanged, setSessionChanged] = useState(false)
  const [hours, setHours] = useState('4')
  const [message, setMessage] = useState('')
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
    publishPlayPeriod(initial.playerID, null)
    setSnapshot((value) => ({ ...value, play: null, reminders: [] }))
    setSessionChanged(true)
    setDeleting(null)
  }, [initial.playerID])
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
    window.addEventListener(COOLDOWN_CHANGED_EVENT, resume)
    document.addEventListener('visibilitychange', resume)
    return () => {
      window.removeEventListener('focus', resume)
      window.removeEventListener('pageshow', resume)
      window.removeEventListener(COOLDOWN_CHANGED_EVENT, resume)
      document.removeEventListener('visibilitychange', resume)
      controller.current?.abort()
    }
  }, [reload])
  useEffect(
    () =>
      subscribePlayPeriod(initial.playerID, (play) => {
        if (play) void reload()
      }),
    [initial.playerID, reload],
  )
  const regularReminders = snapshot.reminders.filter((row) => row.kind === 'regular')
  const due = active
    ? regularReminders.find(
        (row) =>
          row.enabled && row.proposal && Date.parse(row.proposal.remindAt) <= Date.parse(clock),
      )
    : null
  useEffect(() => {
    const key = due?.proposal ? `${due.id}:${due.proposal.remindAt}` : ''
    if (key && dueReload.current !== key) {
      dueReload.current = key
      void reload()
    }
  }, [due, reload])

  const write: ReminderWrite = async (body) => {
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
        headers: {
          'Content-Type': 'application/json',
          ...(body.action === 'play' ? { 'X-Reminder-Player': String(initial.playerID) } : {}),
        },
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
        return { ok: false, ...data, status: response.status }
      }
      if (data.playerID !== initial.playerID) {
        changeSession()
        return { ok: false, message: 'Сессия изменилась.' }
      }
      setSnapshot(data)
      setVerified(true)
      if (body.action === 'play') publishPlayPeriod(initial.playerID, data)
      pending.current = null
      setDeleting(null)
      setMessage(DELIVERY_NOTICE)
      return { ok: true, snapshot: data }
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
    if (row.status === 'invalid') return 'Расписание или ивент недоступны.'
    if (!row.enabled) return 'Подписка отключена'
    if (!active) return 'Ожидает включения «Я играю»'
    if (!row.proposal) return 'В оставшийся период нет запусков, подходящих по времени и вашему КД'
    return 'Пока я играю'
  }
  return (
    <section
      className="player-reminders"
      aria-label={event ? 'Напоминания об ивенте' : 'Напоминания'}
      aria-busy={busy || checking}
    >
      {pageHeading ? <h1>Напоминания</h1> : <h2>Напоминания</h2>}
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
            !regularReminders.length && (
              <ReminderEditor
                target={event}
                playerID={initial.playerID}
                zone={zone}
                busy={busy}
                write={write}
                onSessionChanged={changeSession}
              />
            )
          ) : (
            <section className="player-reminders__play" aria-label="Режим Я играю">
              <h3>Я играю</h3>
              <PlayPeriodControls
                play={snapshot.play}
                clock={clock}
                zone={zone}
                busy={busy}
                write={write}
                hours={hours}
                setHours={setHours}
              />
              <p>
                И предупреждение, и запуск должны попасть в период игры. Пропущенные предупреждения
                не догоняем.
              </p>
            </section>
          )}
          <section aria-label="Регулярные подписки">
            <h3>Регулярные подписки</h3>
            {!regularReminders.length ? (
              <p>Регулярных подписок нет.</p>
            ) : (
              <ul className="player-reminders__list">
                {regularReminders.map((row) => {
                  const toggleLabel = row.enabled ? 'Отключить подписку' : 'Включить подписку'
                  const toggle = () =>
                    void write({
                      action: 'toggle',
                      id: row.id,
                      enabled: !row.enabled,
                      revision: row.revision,
                    })
                  const remove = () =>
                    void write({ action: 'delete', id: row.id, revision: row.revision })
                  const editor = row.eventID && row.slug && (
                    <ReminderEditor
                      target={{ id: row.eventID, name: row.name }}
                      existing={row}
                      playerID={initial.playerID}
                      onSessionChanged={changeSession}
                      zone={zone}
                      busy={busy}
                      write={write}
                      compact
                      label="Изменить подписку"
                    />
                  )
                  const title = (
                    <h4>
                      {row.slug ? <Link href={`/events/${row.slug}`}>{row.name}</Link> : row.name}
                    </h4>
                  )
                  return (
                    <li key={row.id} className="player-reminders__item">
                      <div className="player-reminders__item-header">
                        {title}
                        <div className="player-reminders__icon-actions">
                          {editor}
                          <Button
                            type="button"
                            size="icon-lg"
                            variant="ghost"
                            disabled={busy}
                            className={
                              row.enabled
                                ? 'text-green-700 hover:text-green-700 dark:text-green-400 dark:hover:text-green-400'
                                : 'text-destructive hover:text-destructive'
                            }
                            aria-label={toggleLabel}
                            title={toggleLabel}
                            onClick={toggle}
                          >
                            {row.enabled ? (
                              <BellRing aria-hidden="true" />
                            ) : (
                              <BellOff aria-hidden="true" />
                            )}
                          </Button>
                          <AlertDialog
                            open={deleting === row.id}
                            onOpenChange={(open) => {
                              if (busy) return
                              if (open) setMessage('')
                              setDeleting(open ? row.id : null)
                            }}
                          >
                            <AlertDialogTrigger asChild>
                              <Button
                                type="button"
                                size="icon-lg"
                                variant="ghost"
                                disabled={busy}
                                aria-label="Удалить подписку"
                                title="Удалить подписку"
                              >
                                <Trash2 aria-hidden="true" />
                              </Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto wrap-anywhere">
                              <AlertDialogHeader>
                                <AlertDialogTitle>Удалить подписку?</AlertDialogTitle>
                                <AlertDialogDescription>
                                  Вы уверены, что хотите удалить регулярную подписку на ивент „
                                  {row.name}“? Это действие нельзя отменить.
                                </AlertDialogDescription>
                              </AlertDialogHeader>
                              {message && <p role="alert">{message}</p>}
                              <AlertDialogFooter>
                                <AlertDialogCancel disabled={busy}>Отмена</AlertDialogCancel>
                                <AlertDialogAction
                                  className={buttonVariants({ variant: 'destructive' })}
                                  disabled={busy}
                                  onClick={(click) => {
                                    click.preventDefault()
                                    remove()
                                  }}
                                >
                                  Удалить
                                </AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
                        </div>
                      </div>
                      <p>{rowStatus(row)}</p>
                      <p>
                        За {row.leadMinutes} мин. ·{' '}
                        {row.includeCooldown ? 'Показывать личный КД' : 'Без сведений о КД'}
                      </p>
                      {row.proposal && active && row.enabled && (
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
                          {row.status !== 'invalid' &&
                            Date.parse(row.proposal.remindAt) > Date.parse(clock) && (
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
                    </li>
                  )
                })}
              </ul>
            )}
          </section>
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
