import { afterAll, afterEach, beforeAll, beforeEach, expect, it, vi } from 'vitest'
import { createLocalReq, type Payload, type UIFieldServerProps } from 'payload'
import { renderToStaticMarkup } from 'react-dom/server'
import { EventTimeEvents } from '../../src/components/admin/EventTimeEvents'
import { openTestPayload } from '../helpers/testDatabase'
import { ModelFixtures } from '../helpers/modelFixtures'

let api: Payload
let fixtures: ModelFixtures
beforeAll(async () => {
  api = await openTestPayload()
}, 60000)
beforeEach(() => {
  fixtures = new ModelFixtures(api)
})
afterEach(async () => {
  vi.restoreAllMocks()
  await fixtures.cleanup()
}, 60000)
afterAll(async () => {
  await api?.destroy()
}, 60000)

it('renders every related event, edit links and fresh membership through Payload', async () => {
  const time = await fixtures.create('event-times', { time: '05:25', minutes: 0 })
  const unused = await fixtures.create('event-times', { time: '05:26', minutes: 0 })
  const account = await fixtures.create('users', {
    email: `${fixtures.name()}@example.test`,
    password: crypto.randomUUID(),
  })
  const req = await createLocalReq({ user: { ...account, collection: 'users' } }, api)
  const events = []
  for (let index = 0; index < 5; index++) {
    events.push(
      await fixtures.create('events', {
        name: fixtures.name(),
        slug: fixtures.name(),
        launchTimes: [time.id],
        coins: 0,
        cooldownMinutes: 0,
      }),
    )
  }
  const unrelated = await fixtures.create('events', {
    name: fixtures.name(),
    slug: fixtures.name(),
    launchTimes: [unused.id],
    coins: 0,
    cooldownMinutes: 0,
  })
  // Force multiple transport pages without creating hundreds of test records.
  const find = api.find.bind(api)
  const spy = vi
    .spyOn(api, 'find')
    .mockImplementation((args) =>
      find({ ...args, limit: args.collection === 'events' ? 2 : args.limit }),
    )
  const props = { id: time.id, operation: 'update', req } as UIFieldServerProps
  const html = renderToStaticMarkup(await EventTimeEvents(props))
  expect(spy).toHaveBeenCalledTimes(3)
  expect(spy.mock.calls.every(([args]) => args.overrideAccess === false && args.req === req)).toBe(
    true,
  )
  for (const event of events) {
    expect(html).toContain(event.name)
    expect(html).toContain(`href="${api.config.routes.admin}/collections/events/${event.id}"`)
  }
  expect(html).not.toContain(unrelated.name)
  spy.mockRestore()
  await api.update({
    collection: 'events',
    id: events[0].id,
    data: { launchTimes: [] },
    overrideAccess: false,
    req,
  })
  const updated = renderToStaticMarkup(await EventTimeEvents(props))
  expect(updated).not.toContain(events[0].name)
  expect(updated).toContain(events[1].name)
  await api.update({
    collection: 'events',
    id: unrelated.id,
    data: { launchTimes: [] },
    overrideAccess: false,
    req,
  })
  const empty = renderToStaticMarkup(await EventTimeEvents({ ...props, id: unused.id }))
  expect(empty).toContain('Это время не используется в ивентах')
  expect(
    await api.findByID({ collection: 'event-times', id: time.id, overrideAccess: false, req }),
  ).toMatchObject({ time: '05:25', minutes: 325 })
})

it('does not query for a new or unsaved document', async () => {
  const spy = vi.spyOn(api, 'find')
  const req = await createLocalReq({}, api)
  for (const data of [
    { operation: 'create' },
    { operation: 'create', id: 123 },
    { operation: 'update' },
  ]) {
    const html = renderToStaticMarkup(await EventTimeEvents({ ...data, req } as UIFieldServerProps))
    expect(html).toContain('Сохраните время')
  }
  expect(spy).not.toHaveBeenCalled()
})
