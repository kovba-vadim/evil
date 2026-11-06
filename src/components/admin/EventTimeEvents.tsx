import Link from 'next/link'
import type { UIFieldServerProps } from 'payload'

export async function EventTimeEvents({ id, operation, req }: UIFieldServerProps) {
  const events = new Map<number, string>()
  const saved = operation !== 'create' && id != null && id !== ''

  if (saved) {
    for (let page = 1; ; page++) {
      const result = await req.payload.find({
        collection: 'events',
        where: { launchTimes: { equals: id } },
        select: { name: true },
        sort: ['_order', 'id'],
        depth: 0,
        limit: 100,
        page,
        overrideAccess: false,
        req,
      })
      for (const event of result.docs) events.set(event.id, event.name)
      if (!result.hasNextPage) break
    }
  }

  const adminRoute = req.payload.config.routes.admin.replace(/\/$/, '')
  return (
    <section className="field-type" aria-labelledby="used-in-events-title">
      <h3 id="used-in-events-title">Используется в ивентах</h3>
      {!saved ? (
        <p>Сохраните время, чтобы увидеть связанные ивенты.</p>
      ) : events.size ? (
        <ul>
          {[...events].map(([eventID, name]) => (
            <li key={eventID}>
              <Link href={`${adminRoute}/collections/events/${encodeURIComponent(eventID)}`}>
                {name}
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <p>Это время не используется в ивентах</p>
      )}
    </section>
  )
}
