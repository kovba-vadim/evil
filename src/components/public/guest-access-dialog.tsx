'use client'

import Link from 'next/link'
import { useRef, useState, type ReactElement, type ReactNode } from 'react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { safeReturnTo } from '@/lib/player-policy'

const linkClass =
  'rounded-sm text-foreground underline underline-offset-4 hover:decoration-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring'

export function GuestAccessDialog({
  trigger,
  title,
  description,
  note,
  returnTo,
  closeLabel,
}: {
  trigger: ReactElement
  title: string
  description: (links: { register: ReactElement; login: ReactElement }) => ReactNode
  note?: string
  returnTo: string
  closeLabel: string
}) {
  const registrationLink = useRef<HTMLAnchorElement>(null)
  const [open, setOpen] = useState(false)
  const close = () => setOpen(false)
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent
        className="max-w-md gap-4 overflow-y-auto p-6"
        closeLabel={closeLabel}
        onOpenAutoFocus={(event) => {
          if (!registrationLink.current) return
          event.preventDefault()
          registrationLink.current.focus()
        }}
      >
        <DialogTitle className="pr-6 text-xl font-semibold">{title}</DialogTitle>
        <DialogDescription className="text-sm text-muted-foreground">
          {description({
            register: (
              <Link ref={registrationLink} className={linkClass} href="/register" onNavigate={close}>
                Зарегистрируйтесь
              </Link>
            ),
            login: (
              <Link
                className={linkClass}
                href={`/login?returnTo=${encodeURIComponent(safeReturnTo(returnTo))}`}
                onNavigate={close}
              >
                войдите
              </Link>
            ),
          })}
        </DialogDescription>
        {note && <p className="text-sm text-muted-foreground">{note}</p>}
      </DialogContent>
    </Dialog>
  )
}
