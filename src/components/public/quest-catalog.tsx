'use client'
import { useEffect, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import type { PublicQuest } from '@/queries/public-quests'
import { Slider } from '@/components/ui/slider'
import { Input } from '@/components/ui/input'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { FilterDialog } from './filter-dialog'
import { QuestCards } from './quests'
import { questRewardKey, questRewardLabels, type QuestRewardKind } from '@/lib/quest-rewards'
import './quest-catalog.scss'

const allTab = 'all'

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
  const defaultFilters = {
    from: String(minimum),
    to: String(maximum),
    selected: [] as string[],
  }
  const params = useSearchParams()
  const usedCategories = new Set(initial.map((quest) => quest.category?.id))
  const categories = options.categories.filter(({ id }) => usedCategories.has(id))
  const tab = params.get('tab')
  const category = tab && categories.some(({ id }) => String(id) === tab) ? tab : ''
  const [applied, setApplied] = useState(defaultFilters)
  const [draft, setDraft] = useState({ ...applied, category })
  const [open, setOpen] = useState(false)
  const { from, to, selected } = applied
  const draftLow = draft.from === '' ? minimum : Number(draft.from)
  const draftHigh = draft.to === '' ? maximum : Number(draft.to)
  const [result, setResult] = useState<{
    filters: typeof applied
    category: string
    data: { quests: PublicQuest[] } | { error: string }
  } | null>(null)
  const low = from === '' ? minimum : Number(from)
  const high = to === '' ? maximum : Number(to)
  function validRange(low: number, high: number) {
    return (
      Number.isSafeInteger(low) &&
      Number.isSafeInteger(high) &&
      low >= minimum &&
      high <= maximum &&
      low <= high
    )
  }
  const valid = validRange(low, high)
  const draftValid = validRange(draftLow, draftHigh)
  const count =
    Number(low !== minimum || high !== maximum) +
    Number(selected.length > 0) +
    Number(category !== '')
  const defaults = count === 0
  const data = result?.filters === applied && result.category === category ? result.data : null
  const pending = !defaults && !data
  const quests = defaults ? initial : data && 'quests' in data ? data.quests : []
  const error = !defaults && data && 'error' in data ? data.error : null

  function apply({ category, ...filters }: typeof draft) {
    const url = new URL(window.location.href)
    if (category) url.searchParams.set('tab', category)
    else url.searchParams.delete('tab')
    if (url.href !== window.location.href) window.history.replaceState(null, '', url)
    setApplied(filters)
    setOpen(false)
  }
  useEffect(() => {
    if (!valid || defaults) return
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
        const quests: PublicQuest[] = await response.json()
        if (!controller.signal.aborted) setResult({ filters: applied, category, data: { quests } })
      } catch (error) {
        if (!controller.signal.aborted)
          setResult({
            filters: applied,
            category,
            data: { error: error instanceof Error ? error.message : 'Ошибка получения квестов.' },
          })
      }
    }, 300)
    return () => {
      clearTimeout(timer)
      controller.abort()
    }
  }, [applied, low, high, selected, category, valid, defaults, options.rewards])
  const disabled = !initial.length || minimum === maximum
  return (
    <section aria-labelledby="quests-title" className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 id="quests-title" className="text-3xl font-semibold tracking-tight">
          Квесты
        </h1>
        {initial.length > 0 && (
          <FilterDialog
            title="Фильтры квестов"
            count={count}
            open={open}
            onOpenChange={(next) => {
              if (next) setDraft({ ...applied, category })
              setOpen(next)
            }}
            onReset={() => setDraft({ ...defaultFilters, category: '' })}
            onResetApplied={() => apply({ ...defaultFilters, category: '' })}
            onApply={() => apply(draft)}
            valid={draftValid}
          >
            <label className="block max-w-md space-y-2">
              Категория
              <select
                aria-label="Категория"
                value={draft.category}
                onChange={(e) => setDraft({ ...draft, category: e.target.value })}
                className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <option value="">Все категории</option>
                {categories.map((category) => (
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
                  value={draftValid ? [draftLow, draftHigh] : [minimum, maximum]}
                  onValueChange={([low, high]) =>
                    setDraft({ ...draft, from: String(low), to: String(high) })
                  }
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
                    value={draft.from}
                    disabled={disabled}
                    onChange={(e) => setDraft({ ...draft, from: e.target.value })}
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
                    value={draft.to}
                    disabled={disabled}
                    onChange={(e) => setDraft({ ...draft, to: e.target.value })}
                  />
                </label>
              </div>
              {minimum === maximum && (
                <p className="text-sm text-muted-foreground">Все квесты дают {minimum} монет.</p>
              )}
              {!draftValid && (
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
                        checked={draft.selected.includes(questRewardKey(resource))}
                        onChange={(e) =>
                          setDraft({
                            ...draft,
                            selected: e.target.checked
                              ? [...draft.selected, questRewardKey(resource)]
                              : draft.selected.filter((id) => id !== questRewardKey(resource)),
                          })
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
          </FilterDialog>
        )}
      </div>
      <Tabs
        value={category || allTab}
        onValueChange={(value) => apply({ ...applied, category: value === allTab ? '' : value })}
      >
        <TabsList aria-label="Категории квестов" className="quest-catalog__tabs">
          <TabsTrigger value={allTab} className="quest-catalog__tab">
            Все
          </TabsTrigger>
          {categories.map(({ id, name }) => (
            <TabsTrigger key={id} value={String(id)} className="quest-catalog__tab">
              {name}
            </TabsTrigger>
          ))}
        </TabsList>
        <TabsContent
          value={category || allTab}
          className="quest-catalog__results"
          aria-live="polite"
          aria-busy={pending && valid}
        >
          {!initial.length ? (
            <p className="text-muted-foreground">Квесты пока не добавлены.</p>
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
        </TabsContent>
      </Tabs>
    </section>
  )
}
