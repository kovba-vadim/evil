'use client'
import { useEffect, useRef, useState } from 'react'
import type { PublicEvent } from '@/queries/public-events'
import { Slider } from '@/components/ui/slider'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { EventCards } from './events'
export function EventCatalog({
  initial,
  options,
}: {
  initial: PublicEvent[]
  options: { minimum: number; maximum: number; resources: { id: number; name: string }[] }
}) {
  const { minimum, maximum } = options
  const [from, setFrom] = useState(String(minimum))
  const [to, setTo] = useState(String(maximum))
  const [selected, setSelected] = useState<number[]>([])
  const [events, setEvents] = useState(initial)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const generation = useRef(0)
  const low = from === '' ? minimum : Number(from)
  const high = to === '' ? maximum : Number(to)
  const valid =
    Number.isSafeInteger(low) &&
    Number.isSafeInteger(high) &&
    low >= minimum &&
    high <= maximum &&
    low <= high
  const defaults = low === minimum && high === maximum && selected.length === 0
  function change(nextFrom: string, nextTo: string, nextSelected = selected) {
    generation.current++
    setFrom(nextFrom)
    setTo(nextTo)
    setSelected(nextSelected)
    setError(null)
    const reset =
      (nextFrom === '' ? minimum : Number(nextFrom)) === minimum &&
      (nextTo === '' ? maximum : Number(nextTo)) === maximum &&
      nextSelected.length === 0
    if (reset) setEvents(initial)
    setPending(!reset)
  }
  useEffect(() => {
    if (!valid || defaults) return
    const current = generation.current
    const controller = new AbortController()
    const timer = setTimeout(async () => {
      try {
        const response = await fetch('/api/public/events', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ coinsFrom: low, coinsTo: high, resources: selected }),
          signal: controller.signal,
          cache: 'no-store',
        })
        if (!response.ok) throw new Error('Не удалось получить ивенты. Повторите попытку.')
        const result: PublicEvent[] = await response.json()
        if (generation.current === current && !controller.signal.aborted) {
          setEvents(result)
          setPending(false)
        }
      } catch (error) {
        if (generation.current === current && !controller.signal.aborted) {
          setError(error instanceof Error ? error.message : 'Ошибка получения ивентов.')
          setPending(false)
        }
      }
    }, 300)
    return () => {
      clearTimeout(timer)
      controller.abort()
    }
  }, [from, to, low, high, selected, valid, defaults])
  const disabled = !initial.length || minimum === maximum
  return (
    <section aria-labelledby="events-title" className="space-y-6">
      <h1 id="events-title" className="text-3xl font-semibold tracking-tight">
        Ивенты
      </h1>
      {initial.length > 0 && (
        <div className="space-y-6 rounded-lg border p-4">
          <fieldset className="space-y-4">
            <legend className="font-medium">Монеты</legend>
            {minimum < maximum && (
              <Slider
                min={minimum}
                max={maximum}
                step={1}
                value={valid ? [low, high] : [minimum, maximum]}
                onValueChange={(values) => change(String(values[0]), String(values[1]))}
              />
            )}
            <div className="grid max-w-md grid-cols-2 gap-4">
              <label className="space-y-2">
                От
                <Input
                  type="number"
                  aria-label="Монеты От"
                  min={minimum}
                  max={maximum}
                  step="1"
                  value={from}
                  disabled={disabled}
                  onChange={(e) => change(e.target.value, to)}
                />
              </label>
              <label className="space-y-2">
                До
                <Input
                  type="number"
                  aria-label="Монеты До"
                  min={minimum}
                  max={maximum}
                  step="1"
                  value={to}
                  disabled={disabled}
                  onChange={(e) => change(from, e.target.value)}
                />
              </label>
            </div>
            {minimum === maximum && (
              <p className="text-sm text-muted-foreground">Все ивенты дают {minimum} монет.</p>
            )}
            {!valid && (
              <p role="alert">
                Укажите границы от {minimum} до {maximum}; От не должно превышать До.
              </p>
            )}
          </fieldset>
          {options.resources.length > 0 && (
            <fieldset className="space-y-3">
              <legend className="font-medium">Все выбранные предметы награды</legend>
              <div className="grid max-h-64 gap-3 overflow-y-auto sm:grid-cols-2">
                {options.resources.map((resource) => (
                  <label key={resource.id} className="flex min-w-0 items-start gap-2 text-sm">
                    <input
                      className="mt-1 size-4 shrink-0 accent-primary"
                      type="checkbox"
                      checked={selected.includes(resource.id)}
                      onChange={(e) =>
                        change(
                          from,
                          to,
                          e.target.checked
                            ? [...selected, resource.id]
                            : selected.filter((id) => id !== resource.id),
                        )
                      }
                    />
                    <span className="wrap-anywhere">{resource.name}</span>
                  </label>
                ))}
              </div>
            </fieldset>
          )}
          <Button
            type="button"
            variant="outline"
            onClick={() => change(String(minimum), String(maximum), [])}
          >
            Сбросить
          </Button>
        </div>
      )}
      <div aria-live="polite" aria-busy={pending && valid}>
        {!initial.length ? (
          <p className="text-muted-foreground">Ивенты пока не добавлены.</p>
        ) : !valid ? (
          <p>Исправьте границы монет.</p>
        ) : error ? (
          <p role="alert">{error}</p>
        ) : pending ? (
          <p role="status">Обновляем список…</p>
        ) : (
          <>
            <p className="mb-4 text-sm text-muted-foreground">Найдено: {events.length}</p>
            {events.length ? (
              <EventCards events={events} />
            ) : (
              <p>Ивенты по выбранным условиям не найдены.</p>
            )}
          </>
        )}
      </div>
    </section>
  )
}
