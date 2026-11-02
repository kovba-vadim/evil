'use client'
import { expandLaunches, launchWindow, type LaunchClock } from '@/lib/event-launches'
import { formatLaunch, timeZoneLabel } from '@/lib/time-zones'
import { TimeZoneSelect, useTimeZone, useServerClock } from './time-zone'
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
        {zone === 'server'
          ? 'Времена запуска по серверу (UTC+3)'
          : `Времена запуска — ${timeZoneLabel(zone, now)}`}
      </h2>
      <TimeZoneSelect now={now} />
      <p className="text-sm text-muted-foreground">
        Ближайшие 24 часа. Дата и смещение указаны для каждого запуска.
      </p>
      {rows.length ? (
        <ul className="space-y-2">
          {rows.map((row) => {
            const formatted = formatLaunch(row.instant, zone, now)
            return (
              <li key={row.key}>
                <time dateTime={row.instant}>
                  {formatted.date} · {formatted.time} ({formatted.offset})
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
