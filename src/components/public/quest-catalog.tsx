'use client'
import { useEffect, useRef, useState } from 'react'
import type { PublicQuest } from '@/queries/public-quests'
import { Slider } from '@/components/ui/slider'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { QuestCards } from './quests'
import { questRewardKey, questRewardLabels, type QuestRewardKind } from '@/lib/quest-rewards'
export function QuestCatalog({
  initial,
  options,
}: {
  initial: PublicQuest[]
  options: {
    minimum: number
    maximum: number
    rewards: { id: number; name: string; kind: QuestRewardKind }[]
    categories: { id: number; name: string }[]
  }
}) {
  const { minimum, maximum } = options
  const [from, setFrom] = useState(String(minimum))
  const [to, setTo] = useState(String(maximum))
  const [selected, setSelected] = useState<string[]>([])
  const [category, setCategory] = useState('')
  const [quests, setQuests] = useState(initial)
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
  const defaults = low === minimum && high === maximum && selected.length === 0 && category === ''
  function change(
    nextFrom: string,
    nextTo: string,
    nextSelected = selected,
    nextCategory = category,
  ) {
    generation.current++
    setFrom(nextFrom)
    setTo(nextTo)
    setSelected(nextSelected)
    setCategory(nextCategory)
    setError(null)
    const reset =
      (nextFrom === '' ? minimum : Number(nextFrom)) === minimum &&
      (nextTo === '' ? maximum : Number(nextTo)) === maximum &&
      nextSelected.length === 0 &&
      nextCategory === ''
    if (reset) setQuests(initial)
    setPending(!reset)
  }
  useEffect(() => {
    if (!valid || defaults) return
    const current = generation.current
    const controller = new AbortController()
    const timer = setTimeout(async () => {
      try {
        const response = await fetch('/api/public/quests', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            coinsFrom: low,
            coinsTo: high,
            category: category ? Number(category) : undefined,
            rewards: options.rewards
              .filter((reward) => selected.includes(questRewardKey(reward)))
              .map(({ kind, id }) => ({ kind, id })),
          }),
          signal: controller.signal,
          cache: 'no-store',
        })
        if (!response.ok) throw new Error('Не удалось получить квесты. Повторите попытку.')
        const result: PublicQuest[] = await response.json()
        if (generation.current === current && !controller.signal.aborted) {
          setQuests(result)
          setPending(false)
        }
      } catch (error) {
        if (generation.current === current && !controller.signal.aborted) {
          setError(error instanceof Error ? error.message : 'Ошибка получения квестов.')
          setPending(false)
        }
      }
    }, 300)
    return () => {
      clearTimeout(timer)
      controller.abort()
    }
  }, [from, to, low, high, selected, category, valid, defaults, options.rewards])
  const disabled = !initial.length || minimum === maximum
  return (
    <section aria-labelledby="quests-title" className="space-y-6">
      <h1 id="quests-title" className="text-3xl font-semibold tracking-tight">
        Квесты
      </h1>
      {initial.length > 0 && (
        <div className="space-y-6 rounded-lg border p-4">
          <label className="block max-w-md space-y-2">
            Категория
            <select
              aria-label="Категория"
              value={category}
              onChange={(e) => change(from, to, selected, e.target.value)}
              className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <option value="">Все категории</option>
              {options.categories.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.name}
                </option>
              ))}
            </select>
          </label>
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
              <p className="text-sm text-muted-foreground">Все квесты дают {minimum} монет.</p>
            )}
            {!valid && (
              <p role="alert">
                Укажите границы от {minimum} до {maximum}; От не должно превышать До.
              </p>
            )}
          </fieldset>
          {options.rewards.length > 0 && (
            <fieldset className="space-y-3">
              <legend className="font-medium">Все выбранные награды</legend>
              <div className="grid max-h-64 gap-3 overflow-y-auto sm:grid-cols-2">
                {options.rewards.map((resource) => (
                  <label
                    key={questRewardKey(resource)}
                    className="flex min-w-0 items-start gap-2 text-sm"
                  >
                    <input
                      className="mt-1 size-4 shrink-0 accent-primary"
                      type="checkbox"
                      checked={selected.includes(questRewardKey(resource))}
                      onChange={(e) =>
                        change(
                          from,
                          to,
                          e.target.checked
                            ? [...selected, questRewardKey(resource)]
                            : selected.filter((id) => id !== questRewardKey(resource)),
                        )
                      }
                    />
                    <span className="wrap-anywhere">
                      {questRewardLabels[resource.kind]}: {resource.name}
                    </span>
                  </label>
                ))}
              </div>
            </fieldset>
          )}
          <Button
            type="button"
            variant="outline"
            onClick={() => change(String(minimum), String(maximum), [], '')}
          >
            Сбросить
          </Button>
        </div>
      )}
      <div aria-live="polite" aria-busy={pending && valid}>
        {!initial.length ? (
          <p className="text-muted-foreground">Квесты пока не добавлены.</p>
        ) : !valid ? (
          <p>Исправьте границы монет.</p>
        ) : error ? (
          <p role="alert">{error}</p>
        ) : pending ? (
          <p role="status">Обновляем список…</p>
        ) : (
          <>
            <p className="mb-4 text-sm text-muted-foreground">Найдено: {quests.length}</p>
            {quests.length ? (
              <QuestCards quests={quests} />
            ) : (
              <p>Квесты по выбранным условиям не найдены.</p>
            )}
          </>
        )}
      </div>
    </section>
  )
}
