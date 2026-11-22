'use client'

import { useEffect, useState } from 'react'
import { ArrowUp } from 'lucide-react'
import { Button } from '@/components/ui/button'
import './scroll-to-top.scss'

export function ScrollToTop() {
  const [visible, setVisible] = useState(false)
  useEffect(() => {
    const update = () => setVisible(window.scrollY > 350)
    update()
    window.addEventListener('scroll', update, { passive: true })
    return () => window.removeEventListener('scroll', update)
  }, [])

  if (!visible) return null
  return (
    <Button
      type="button"
      size="icon-lg"
      className="scroll-to-top rounded-full"
      aria-label="Наверх"
      onClick={() => {
        const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
        document.querySelector<HTMLElement>('#main-content')?.focus({ preventScroll: true })
        window.scrollTo({ top: 0, behavior: reduced ? 'instant' : 'smooth' })
      }}
    >
      <ArrowUp aria-hidden="true" />
    </Button>
  )
}
