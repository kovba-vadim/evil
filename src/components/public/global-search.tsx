'use client'
import { useEffect, useId, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Search } from 'lucide-react'
import { Dialog, DialogContent, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { useSidebar } from '@/components/ui/sidebar'
import {
  parseSearchQuery,
  searchLength,
  SEARCH_MIN_LENGTH,
  type SearchResponse,
} from '@/lib/search'
export function GlobalSearch({
  open,
  onOpenChange,
  returnFocus,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  returnFocus: React.RefObject<HTMLElement | null>
}) {
  const router = useRouter(),
    { setOpenMobile } = useSidebar()
  const [query, setQuery] = useState(''),
    [retry, setRetry] = useState(0),
    [active, setActive] = useState(0)
  const [state, setState] = useState<{ key: string; data?: SearchResponse; error?: string } | null>(
    null,
  )
  const input = useRef<HTMLInputElement>(null),
    version = useRef(0),
    id = useId()
  const normalized = query.trim(),
    valid = searchLength(normalized) >= SEARCH_MIN_LENGTH
  const key = JSON.stringify([normalized, retry])
  const current = state?.key === key ? state : null
  const results = current?.data?.results ?? []
  useEffect(() => {
    if (!open || !valid) return
    const generation = ++version.current,
      controller = new AbortController()
    const timer = setTimeout(async () => {
      try {
        const response = await fetch(
          `/api/public/search?q=${encodeURIComponent(parseSearchQuery(normalized))}`,
          { signal: controller.signal, cache: 'no-store' },
        )
        if (!response.ok) throw new Error('Поиск временно недоступен.')
        const data: SearchResponse = await response.json()
        if (generation === version.current && !controller.signal.aborted) {
          setState({ key, data })
          setActive(0)
        }
      } catch (error) {
        if (generation === version.current && !controller.signal.aborted)
          setState({
            key,
            error: error instanceof Error ? error.message : 'Не удалось выполнить поиск.',
          })
      }
    }, 300)
    return () => {
      clearTimeout(timer)
      controller.abort()
    }
  }, [open, valid, normalized, key])
  useEffect(() => {
    if (open)
      document.getElementById(`${id}-option-${active}`)?.scrollIntoView({ block: 'nearest' })
  }, [id, active, open, current?.data])
  function select(index: number) {
    const result = results[index]
    if (!result) return
    version.current++
    onOpenChange(false)
    setOpenMobile(false)
    router.push(result.href)
  }
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        onOpenAutoFocus={(event) => {
          event.preventDefault()
          input.current?.focus()
        }}
        onCloseAutoFocus={(event) => {
          event.preventDefault()
          requestAnimationFrame(() => {
            const target = returnFocus.current
            if (target?.isConnected && target.getClientRects().length) target.focus()
            else document.querySelector<HTMLButtonElement>('[data-sidebar="trigger"]')?.focus()
          })
        }}
      >
        <div className="shrink-0 space-y-1 border-b px-4 pt-4 pb-3 pr-10">
          <DialogTitle className="font-semibold">Поиск EvilIsland</DialogTitle>
          <DialogDescription className="text-xs text-muted-foreground">
            По названиям ивентов, квестов и предметов. Ctrl+K / Cmd+K.
          </DialogDescription>
        </div>
        <div className="flex shrink-0 items-center gap-2 border-b px-4">
          <Search className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
          <input
            ref={input}
            role="combobox"
            aria-label="Поисковый запрос"
            aria-expanded={results.length > 0}
            aria-autocomplete="list"
            aria-controls={`${id}-list`}
            aria-activedescendant={results[active] ? `${id}-option-${active}` : undefined}
            autoComplete="off"
            spellCheck={false}
            maxLength={200}
            value={query}
            onChange={(event) => {
              if (event.target.value.trim() !== normalized) {
                version.current++
                setState(null)
              }
              setQuery(event.target.value)
              setActive(0)
            }}
            onKeyDown={(event) => {
              if ((event.key === 'ArrowDown' || event.key === 'ArrowUp') && results.length) {
                event.preventDefault()
                setActive(
                  (index) =>
                    (index + (event.key === 'ArrowDown' ? 1 : -1) + results.length) %
                    results.length,
                )
              }
              if (event.key === 'Enter' && results[active] && !event.nativeEvent.isComposing) {
                event.preventDefault()
                select(active)
              }
            }}
            className="h-12 w-full min-w-0 bg-transparent text-base outline-none placeholder:text-muted-foreground"
            placeholder="Введите название…"
          />
        </div>
        <div className="min-h-20 overflow-y-auto p-2">
          <div role="status" aria-live="polite" className="px-2 py-2 text-sm text-muted-foreground">
            {!valid
              ? 'Введите минимум два символа.'
              : !current
                ? 'Ищем…'
                : current.error
                  ? 'Не удалось выполнить поиск.'
                  : !results.length
                    ? 'Ничего не найдено.'
                    : `Найдено: ${results.length}`}
          </div>
          {current?.error && (
            <div className="space-y-3 px-2 pb-3">
              <p role="alert" className="text-sm">
                {current.error}
              </p>
              <Button
                variant="outline"
                onClick={() => {
                  version.current++
                  setRetry((value) => value + 1)
                  input.current?.focus()
                }}
              >
                Повторить
              </Button>
            </div>
          )}
          <div id={`${id}-list`} role="listbox" aria-label="Результаты поиска">
            {valid &&
              results.map((result, index) => (
                <a
                  href={result.href}
                  tabIndex={-1}
                  key={result.key}
                  id={`${id}-option-${index}`}
                  role="option"
                  aria-selected={index === active}
                  data-value={result.key}
                  onMouseDown={(event) => event.preventDefault()}
                  onMouseMove={() => setActive(index)}
                  onClick={(event) => {
                    event.preventDefault()
                    select(index)
                  }}
                  className={`flex cursor-pointer items-start justify-between gap-3 rounded-md px-3 py-2 text-sm ${index === active ? 'bg-accent text-accent-foreground' : ''}`}
                >
                  <span className="min-w-0 wrap-anywhere">{result.name}</span>
                  <span className="shrink-0 text-xs text-muted-foreground">{result.label}</span>
                </a>
              ))}
          </div>
        </div>
        {valid && current?.data?.more.length ? (
          <p className="shrink-0 border-t px-4 py-3 text-xs text-muted-foreground">
            Есть дополнительные результаты по типам:{' '}
            {current.data.more.map((type) => type.label).join(', ')}. Уточните запрос.
          </p>
        ) : null}
      </DialogContent>
    </Dialog>
  )
}
