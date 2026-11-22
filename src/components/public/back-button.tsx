'use client'

import { ArrowLeft } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { goBackWithinSite } from './navigation-history'

export function BackButton({ fallback }: { fallback: string }) {
  const router = useRouter()
  return (
    <Button
      type="button"
      size="sm"
      variant="outline"
      onClick={() => {
        if (!goBackWithinSite()) router.replace(fallback)
      }}
    >
      <ArrowLeft aria-hidden="true" />
      Назад
    </Button>
  )
}
