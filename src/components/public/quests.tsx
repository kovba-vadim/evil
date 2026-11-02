import Link from 'next/link'
import type { PublicQuest } from '@/queries/public-quests'
import { publicRecordURL } from '@/lib/public-record-url'
import { questRewardKey, questRewardLabels } from '@/lib/quest-rewards'
export function QuestFacts({ quest }: { quest: PublicQuest }) {
  return (
    <div className="space-y-2 text-sm">
      {quest.category && <p>Категория: {quest.category.name}</p>}
      {quest.requiredQuantity !== null && <p>Необходимое количество: {quest.requiredQuantity}</p>}
      <p>Монеты: {quest.coins}</p>
      {quest.cooldown && <p className="wrap-anywhere">КД прохождения: {quest.cooldown}</p>}
    </div>
  )
}
export function QuestRewards({ rewards }: { rewards: PublicQuest['rewards'] }) {
  return rewards.length ? (
    <ul className="space-y-3">
      {rewards.map((reward) => (
        <li key={questRewardKey(reward)} className="space-y-1">
          <span className="block text-xs text-muted-foreground">
            {questRewardLabels[reward.kind]}
          </span>
          <div className="flex flex-wrap justify-between gap-2">
            <Link
              href={publicRecordURL(reward.kind, reward.slug)!}
              className="text-primary underline underline-offset-4 wrap-anywhere"
            >
              {reward.name}
            </Link>
            <span className="text-sm text-muted-foreground">Количество: {reward.quantity}</span>
          </div>
        </li>
      ))}
    </ul>
  ) : null
}
export function QuestCards({ quests }: { quests: PublicQuest[] }) {
  return (
    <ul className="grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-3">
      {quests.map((quest) => (
        <li key={quest.id} className="space-y-4 rounded-lg border bg-card p-4">
          <Link
            href={publicRecordURL('quests', quest.slug)!}
            className="block font-medium text-primary underline underline-offset-4 wrap-anywhere"
          >
            {quest.name}
          </Link>
          <QuestFacts quest={quest} />
          <QuestRewards rewards={quest.rewards} />
        </li>
      ))}
    </ul>
  )
}
