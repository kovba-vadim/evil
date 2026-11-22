'use client'

import { useSearchParams } from 'next/navigation'
import type { ReactNode } from 'react'
import { Tabs } from '@/components/ui/tabs'

export function ClothingTabs({ children }: { children: ReactNode }) {
  const tab = useSearchParams().get('tab')
  const value = tab === 'hazmats' || tab === 'rings' ? tab : 'sets'
  return (
    <Tabs
      value={value}
      className="space-y-6"
      onValueChange={(next) => {
        const url = new URL(window.location.href)
        if (next === 'sets') url.searchParams.delete('tab')
        else url.searchParams.set('tab', next)
        window.history.replaceState(null, '', url)
      }}
    >
      {children}
    </Tabs>
  )
}
