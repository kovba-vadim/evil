'use client'
import { useEffect, useRef, useState, useSyncExternalStore } from 'react'
import {
  TIME_ZONES,
  TIME_ZONE_STORAGE_KEY,
  isTimeZoneID,
  normalizeTimeZone,
  timeZoneLabel,
  type TimeZoneID,
} from '@/lib/time-zones'
const eventName = 'evilisland-time-zone-change'
let fallback: TimeZoneID = 'server'
function snapshot(): TimeZoneID {
  try {
    return normalizeTimeZone(localStorage.getItem(TIME_ZONE_STORAGE_KEY))
  } catch {
    return fallback
  }
}
function subscribe(listener: () => void) {
  window.addEventListener(eventName, listener)
  window.addEventListener('storage', listener)
  return () => {
    window.removeEventListener(eventName, listener)
    window.removeEventListener('storage', listener)
  }
}
export function setTimeZone(zone: TimeZoneID) {
  fallback = zone
  try {
    localStorage.setItem(TIME_ZONE_STORAGE_KEY, zone)
  } catch {}
  window.dispatchEvent(new Event(eventName))
}
export function useTimeZone() {
  const zone = useSyncExternalStore(subscribe, snapshot, () => 'server' as const)
  useEffect(() => {
    try {
      const saved = localStorage.getItem(TIME_ZONE_STORAGE_KEY)
      if (saved !== null && !isTimeZoneID(saved)) setTimeZone('server')
    } catch {}
  }, [])
  return zone
}
/** Monotonic elapsed time after hydration; no environment-default time zone or client clock guess. */
export function useServerClock(initialNow: string) {
  const [now, setNow] = useState(initialNow)
  const anchor = useRef<{ epoch: number; started: number } | null>(null)
  useEffect(() => {
    const started = performance.now(),
      epoch = Math.max(
        Date.parse(initialNow),
        anchor.current ? anchor.current.epoch + started - anchor.current.started : 0,
      )
    anchor.current = { epoch, started }
    const timer = setInterval(
      () => setNow(new Date(epoch + performance.now() - started).toISOString()),
      1000,
    )
    return () => clearInterval(timer)
  }, [initialNow])
  return Date.parse(now) >= Date.parse(initialNow) ? now : initialNow
}
export function TimeZoneSelect({ now }: { now: string }) {
  const zone = useTimeZone()
  return (
    <label className="block max-w-lg space-y-2">
      <span className="text-sm font-medium">Часовой пояс</span>
      <select
        aria-label="Часовой пояс"
        value={zone}
        onChange={(event) => setTimeZone(normalizeTimeZone(event.target.value))}
        className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        {TIME_ZONES.map((option) => (
          <option key={option.id} value={option.id}>
            {timeZoneLabel(option.id, now)}
          </option>
        ))}
      </select>
    </label>
  )
}
