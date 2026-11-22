import type { ReminderSnapshot } from './player-reminders'

export type PlaySnapshot = Pick<ReminderSnapshot, 'playerID' | 'play' | 'serverNow'>
const eventName = 'evilisland-play-period'

export function publishPlayPeriod(playerID: number, snapshot: PlaySnapshot | null) {
  window.dispatchEvent(new CustomEvent(eventName, { detail: { playerID, snapshot } }))
}

export function subscribePlayPeriod(
  playerID: number,
  listener: (snapshot: PlaySnapshot | null) => void,
) {
  const handler = (event: Event) => {
    const detail = (event as CustomEvent<{ playerID: number; snapshot: PlaySnapshot | null }>)
      .detail
    if (detail.playerID === playerID) listener(detail.snapshot)
  }
  window.addEventListener(eventName, handler)
  return () => window.removeEventListener(eventName, handler)
}
