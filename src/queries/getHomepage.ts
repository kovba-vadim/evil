import type { Payload } from 'payload'

/** Public reading still enforces the Global and populated Media access policies. */
export function getHomepage(payload: Payload) {
  return payload.findGlobal({
    slug: 'homepage',
    depth: 1,
    overrideAccess: false,
    user: null,
  })
}
