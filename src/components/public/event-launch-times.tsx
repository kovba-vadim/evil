'use client'
import { expandLaunches, launchWindow, type LaunchClock } from '@/lib/event-launches'
import { formatLaunch } from '@/lib/time-zones'
import { TimeZoneSelect, useTimeZone, useServerClock } from './time-zone'
import './event-launch-times.scss'
export function EventLaunchTimes({
  times,
  initialNow,
}: {
  times: LaunchClock[]
  initialNow: string
}) {
  const zone = useTimeZone(),
    now = useServerClock(initialNow)
  const window = launchWindow(now, { zone }).window!
  const rows = expandLaunches([{ event: { id: 0 }, times }], window)
  return (
    <section aria-labelledby="launches-title" className="space-y-4">
      <h2 id="launches-title" className="text-xl font-semibold">
        Времена запуска
      </h2>
      <TimeZoneSelect now={now} className="event-launch-times__zone" />
      <p className="text-sm text-muted-foreground">Ближайшие 24 часа.</p>
      {rows.length ? (
        <ul className="space-y-2">
          {rows.map((row) => {
            const formatted = formatLaunch(row.instant, zone, now, 'ru')
            return (
              <li key={row.key}>
                <time dateTime={row.instant}>
                  {formatted.date} — {formatted.time}
                </time>
              </li>
            )
          })}
        </ul>
      ) : (
        <p className="text-muted-foreground">Времена запуска пока не указаны.</p>
      )}
    </section>
  )
}
