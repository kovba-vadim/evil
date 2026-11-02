'use client'
import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import type { PublicSchedule } from '@/queries/public-launches'
import { formatLaunch, timeZoneLabel } from '@/lib/time-zones'
import { publicRecordURL } from '@/lib/public-record-url'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Slider } from '@/components/ui/slider'
import { EventRewards } from './events'
import { TimeZoneSelect, useTimeZone, useServerClock } from './time-zone'
export function LaunchSchedule({
  initial,
  options,
}: {
  initial: PublicSchedule
  options: { minimum: number; maximum: number; resources: { id: number; name: string }[] }
}) {
  const zone = useTimeZone(),
    [from, setFrom] = useState(''),
    [to, setTo] = useState('')
  const [coinsFrom, setCoinsFrom] = useState(String(options.minimum)),
    [coinsTo, setCoinsTo] = useState(String(options.maximum)),
    [resources, setResources] = useState<number[]>([])
  const [refresh, setRefresh] = useState(0),
    requestVersion = useRef(0)
  const low = coinsFrom === '' ? options.minimum : Number(coinsFrom),
    high = coinsTo === '' ? options.maximum : Number(coinsTo)
  const valid =
    Number.isSafeInteger(low) &&
    Number.isSafeInteger(high) &&
    low >= options.minimum &&
    high <= options.maximum &&
    low <= high
  const key = JSON.stringify({ zone, from, to, coinsFrom: low, coinsTo: high, resources })
  const initialKey = JSON.stringify({
    zone: 'server',
    from: '',
    to: '',
    coinsFrom: options.minimum,
    coinsTo: options.maximum,
    resources: [],
  })
  const [snapshot, setSnapshot] = useState({ key: initialKey, data: initial })
  const initialRequest = useRef(true)
  const [error, setError] = useState<{ key: string; message: string } | null>(null)
  const now = useServerClock(snapshot.data.now)
  useEffect(() => {
    if (from && to) return
    const update = () => setRefresh((value) => value + 1)
    const timer = setInterval(update, 30000)
    window.addEventListener('focus', update)
    return () => {
      clearInterval(timer)
      window.removeEventListener('focus', update)
    }
  }, [from, to])
  useEffect(() => {
    const version = ++requestVersion.current
    const first = initialRequest.current
    initialRequest.current = false
    if (!valid || (first && key === initialKey && refresh === 0)) return
    const controller = new AbortController()
    const timer = setTimeout(async () => {
      try {
        const response = await fetch('/api/public/event-launches', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: key,
          signal: controller.signal,
          cache: 'no-store',
        })
        if (!response.ok)
          throw new Error('Не удалось получить расписание. Измените фильтры или обновите страницу.')
        const data: PublicSchedule = await response.json()
        if (version === requestVersion.current && !controller.signal.aborted) {
          setSnapshot({ key, data })
          setError(null)
        }
      } catch (error) {
        if (version === requestVersion.current && !controller.signal.aborted)
          setError({
            key,
            message: error instanceof Error ? error.message : 'Ошибка получения расписания.',
          })
      }
    }, 300)
    return () => {
      clearTimeout(timer)
      controller.abort()
    }
  }, [key, initialKey, refresh, valid])
  const data = snapshot.key === key ? snapshot.data : null
  const rows =
    data?.rows.filter(
      (row) => data.window?.mode !== 'rolling' || Date.parse(row.instant) >= Date.parse(now),
    ) ?? []
  function reset() {
    requestVersion.current++
    setFrom('')
    setTo('')
    setCoinsFrom(String(options.minimum))
    setCoinsTo(String(options.maximum))
    setResources([])
    setError(null)
    setRefresh((value) => value + 1)
  }
  return (
    <section aria-labelledby="schedule-title" className="space-y-6">
      <h1 id="schedule-title" className="text-3xl font-semibold tracking-tight">
        Запуск ивентов
      </h1>
      <TimeZoneSelect now={now} />
      <div className="space-y-6 rounded-lg border p-4">
        <fieldset className="space-y-3">
          <legend className="font-medium">Время запуска в выбранном поясе</legend>
          <div className="grid max-w-md grid-cols-2 gap-4">
            <label className="space-y-2">
              От
              <Input
                aria-label="Время От"
                type="time"
                value={from}
                onChange={(event) => setFrom(event.target.value)}
              />
            </label>
            <label className="space-y-2">
              До
              <Input
                aria-label="Время До"
                type="time"
                value={to}
                onChange={(event) => setTo(event.target.value)}
              />
            </label>
          </div>
          <p className="text-sm text-muted-foreground">
            Без диапазона — ближайшие 24 часа. Заполненный диапазон — ближайшее вхождение;
            одинаковые часы означают полные местные сутки.
          </p>
        </fieldset>
        <fieldset className="space-y-4">
          <legend className="font-medium">Монеты</legend>
          {options.minimum < options.maximum && (
            <Slider
              min={options.minimum}
              max={options.maximum}
              value={valid ? [low, high] : [options.minimum, options.maximum]}
              step={1}
              onValueChange={(values) => {
                setCoinsFrom(String(values[0]))
                setCoinsTo(String(values[1]))
              }}
            />
          )}
          <div className="grid max-w-md grid-cols-2 gap-4">
            <label>
              От
              <Input
                type="number"
                aria-label="Монеты От"
                step="1"
                min={options.minimum}
                max={options.maximum}
                value={coinsFrom}
                disabled={options.minimum === options.maximum}
                onChange={(event) => setCoinsFrom(event.target.value)}
              />
            </label>
            <label>
              До
              <Input
                type="number"
                aria-label="Монеты До"
                step="1"
                min={options.minimum}
                max={options.maximum}
                value={coinsTo}
                disabled={options.minimum === options.maximum}
                onChange={(event) => setCoinsTo(event.target.value)}
              />
            </label>
          </div>
          {options.minimum === options.maximum && (
            <p className="text-sm text-muted-foreground">Монеты: {options.minimum}</p>
          )}
        </fieldset>
        {options.resources.length > 0 && (
          <fieldset className="space-y-3">
            <legend className="font-medium">Все выбранные предметы награды</legend>
            <div className="grid max-h-64 gap-3 overflow-y-auto sm:grid-cols-2">
              {options.resources.map((resource) => (
                <label key={resource.id} className="flex items-start gap-2 text-sm">
                  <input
                    type="checkbox"
                    className="mt-1 size-4 shrink-0 accent-primary"
                    checked={resources.includes(resource.id)}
                    onChange={(event) =>
                      setResources((values) =>
                        event.target.checked
                          ? [...values, resource.id]
                          : values.filter((id) => id !== resource.id),
                      )
                    }
                  />
                  <span className="wrap-anywhere">{resource.name}</span>
                </label>
              ))}
            </div>
          </fieldset>
        )}
        <Button variant="outline" onClick={reset}>
          Сбросить
        </Button>
      </div>
      <div aria-live="polite" aria-busy={valid && !data} className="space-y-4">
        {!valid ? (
          <p role="alert">Укажите корректные границы монет.</p>
        ) : error?.key === key ? (
          <p role="alert">{error.message}</p>
        ) : !data ? (
          <p role="status">Обновляем расписание…</p>
        ) : (
          <>
            {data.notice && <p role="status">{data.notice}</p>}
            {data.window && (
              <p className="text-sm text-muted-foreground">
                {data.window.mode === 'rolling' ? 'Ближайшие 24 часа' : 'Выбранный диапазон'} —{' '}
                {timeZoneLabel(zone, now)}. {formatLaunch(data.window.start, zone, now).date}{' '}
                {formatLaunch(data.window.start, zone, now).time} —{' '}
                {formatLaunch(data.window.end, zone, now).date}{' '}
                {formatLaunch(data.window.end, zone, now).time}.
              </p>
            )}
            <p>Запусков: {rows.length}</p>
            {rows.length ? (
              <ul className="space-y-4">
                {rows.map((row) => {
                  const time = formatLaunch(row.instant, zone, now)
                  return (
                    <li
                      key={row.key}
                      className="grid gap-4 rounded-lg border bg-card p-4 md:grid-cols-[15rem_1fr]"
                    >
                      <time dateTime={row.instant} className="font-medium">
                        <span className="block text-sm text-muted-foreground">{time.date}</span>
                        {time.time} <span className="text-sm">({time.offset})</span>
                      </time>
                      <div className="min-w-0 space-y-3">
                        <Link
                          href={publicRecordURL('events', row.event.slug)!}
                          className="font-medium text-primary underline underline-offset-4 wrap-anywhere"
                        >
                          {row.event.name}
                        </Link>
                        <p>Монеты: {row.event.coins}</p>
                        <EventRewards rewards={row.event.rewards} />
                      </div>
                    </li>
                  )
                })}
              </ul>
            ) : data.window ? (
              <p className="text-muted-foreground">Запуски по выбранным условиям не найдены.</p>
            ) : null}
          </>
        )}
      </div>
    </section>
  )
}
