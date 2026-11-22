import type { ShopPurchaseData } from '@/lib/shop'
import './shop-purchase.scss'

const rubles = new Intl.NumberFormat('ru-RU', {
  style: 'currency',
  currency: 'RUB',
  maximumFractionDigits: 0,
})

export function ShopPurchase({ shop }: { shop: ShopPurchaseData | null }) {
  if (!shop) return null

  return (
    <a className="shop-purchase" href={shop.url} target="_blank" rel="noopener noreferrer">
      <strong className="shop-purchase__title">Можно приобрести в магазине</strong>
      <span>
        Цена: <strong>{rubles.format(shop.price)}</strong>
      </span>
      <span className="shop-purchase__note">Цена без учёта акций и скидок</span>
    </a>
  )
}
