export interface ShopPurchaseData {
  price: number
  url: string
}

export function validShopPrice(price: unknown): price is number {
  return typeof price === 'number' && Number.isSafeInteger(price) && price > 0
}

export function shopURL(value: unknown): string | null {
  if (typeof value !== 'string' || !/^https?:\/\/[^/\\\s]/i.test(value) || /[\s\\]/.test(value)) {
    return null
  }
  try {
    const url = new URL(value)
    return url.hostname && !url.username && !url.password ? url.href : null
  } catch {
    return null
  }
}

export function isStandaloneClothing(category: unknown): boolean {
  return category === 'hazmat' || category === 'ring'
}

export function publicShopPurchase(
  shop: { enabled?: boolean | null; price?: number | null; url?: string | null } | null | undefined,
): ShopPurchaseData | null {
  if (shop?.enabled !== true || !validShopPrice(shop.price)) return null
  const url = shopURL(shop.url)
  return url ? { price: shop.price, url } : null
}
