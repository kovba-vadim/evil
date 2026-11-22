export function RewardCoins({ coins }: { coins: number }) {
  return <p>Монеты (max): {coins}</p>
}

export function formatRewardQuantity(minimum: number, maximum = minimum) {
  const quantity = minimum === maximum ? minimum : `${minimum}–${maximum}`
  return `Кол-во: ${quantity}`
}
