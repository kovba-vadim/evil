'use client'

import { useEffect } from 'react'

const stateKey = 'evilIslandBack'
let documentToken: string | undefined
let returning = false

function backSteps(): number {
  const marker = window.history.state?.[stateKey]
  return documentToken && marker?.token === documentToken && Number.isSafeInteger(marker.steps)
    ? Math.max(0, marker.steps)
    : 0
}

function publicURL(url: URL) {
  return url.origin === window.location.origin && !/^\/(?:admin|api)(?:\/|$)/.test(url.pathname)
}

export function NavigationHistory() {
  useEffect(() => {
    const history = window.history
    const push = history.pushState
    const replace = history.replaceState
    documentToken = window.crypto.getRandomValues(new Uint32Array(4)).join('-')

    const trackedPush: History['pushState'] = function (this: History, data, title, url) {
      const current = new URL(window.location.href)
      const next = new URL(url ?? current, current)
      const previous = backSteps()
      const steps =
        publicURL(current) && publicURL(next)
          ? current.pathname !== next.pathname
            ? 1
            : previous > 0
              ? previous + 1
              : 0
          : 0
      push.call(this, { ...data, [stateKey]: { token: documentToken, steps } }, title, url)
    }
    const trackedReplace: History['replaceState'] = function (this: History, data, title, url) {
      // Next may replace its state during rendering. Preserve the marker for this entry.
      replace.call(
        this,
        { ...data, [stateKey]: { token: documentToken, steps: backSteps() } },
        title,
        url,
      )
    }
    history.pushState = trackedPush
    history.replaceState = trackedReplace
    const finishReturn = () => {
      returning = false
    }
    window.addEventListener('popstate', finishReturn)
    return () => {
      window.removeEventListener('popstate', finishReturn)
      if (history.pushState === trackedPush) history.pushState = push
      if (history.replaceState === trackedReplace) history.replaceState = replace
      documentToken = undefined
      returning = false
    }
  }, [])
  return null
}

export function goBackWithinSite() {
  if (returning) return true
  const steps = backSteps()
  if (!steps) return false
  returning = true
  window.history.go(-steps)
  return true
}
