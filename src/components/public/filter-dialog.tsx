'use client'

import { useRef, type ReactNode } from 'react'
import { SlidersHorizontal } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'

export function FilterDialog({
  title,
  count,
  open,
  onOpenChange,
  onReset,
  onResetApplied,
  onApply,
  valid,
  children,
}: {
  title: string
  count: number
  open: boolean
  onOpenChange: (open: boolean) => void
  onReset: () => void
  onResetApplied: () => void
  onApply: () => void
  valid: boolean
  children: ReactNode
}) {
  const trigger = useRef<HTMLButtonElement>(null)
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <div className="flex flex-wrap items-center gap-2">
        <DialogTrigger asChild>
          <Button ref={trigger} type="button" variant="outline" className="shrink-0">
            <SlidersHorizontal aria-hidden="true" />
            {count ? `Фильтры (${count})` : 'Фильтры'}
          </Button>
        </DialogTrigger>
        {count > 0 && (
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              onResetApplied()
              trigger.current?.focus()
            }}
          >
            Сбросить
          </Button>
        )}
      </div>
      <DialogContent closeLabel="Закрыть фильтры">
        <div className="shrink-0 border-b p-4 pr-12">
          <DialogTitle className="font-semibold">{title}</DialogTitle>
          <DialogDescription className="mt-1 text-sm text-muted-foreground">
            Выберите условия и нажмите «Показать результаты».
          </DialogDescription>
        </div>
        <div className="min-h-0 flex-1 space-y-6 overflow-y-auto p-4">{children}</div>
        <div className="flex shrink-0 flex-wrap justify-end gap-2 border-t p-4">
          <Button type="button" variant="outline" onClick={onReset}>
            Сбросить
          </Button>
          <Button type="button" disabled={!valid} onClick={onApply}>
            Показать результаты
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
