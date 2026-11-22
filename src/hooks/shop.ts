import { ValidationError } from 'payload'
import type { CollectionAfterReadHook, CollectionBeforeChangeHook } from 'payload'
import { isStandaloneClothing, publicShopPurchase, shopURL, validShopPrice } from '../lib/shop'

export const validateShop: CollectionBeforeChangeHook = ({
  collection,
  data,
  originalDoc,
  req,
}) => {
  const shop = { ...originalDoc?.shop, ...data.shop }
  const category = data.category === undefined ? originalDoc?.category : data.category
  const errors: { path: string; message: string }[] = []

  if (shop?.enabled != null && typeof shop.enabled !== 'boolean') {
    errors.push({ path: 'shop.enabled', message: 'Укажите, доступна ли покупка в магазине.' })
  }
  if (shop?.enabled === true && collection.slug === 'clothing' && !isStandaloneClothing(category)) {
    errors.push({
      path: 'category',
      message: 'Перед переводом предмета в часть сета отключите покупку в магазине.',
    })
  }
  if ((shop?.enabled === true || shop?.price != null) && !validShopPrice(shop?.price)) {
    errors.push({ path: 'shop.price', message: 'Укажите положительную целую цену в рублях.' })
  }
  if ((shop?.enabled === true || shop?.url != null) && !shopURL(shop?.url)) {
    errors.push({ path: 'shop.url', message: 'Укажите полную ссылку с протоколом HTTP или HTTPS.' })
  }
  if (errors.length) throw new ValidationError({ collection: collection.slug, errors, req })
  return data
}

export const hideInactiveShop: CollectionAfterReadHook = ({
  collection,
  doc,
  req,
  overrideAccess,
}) => {
  if (overrideAccess || req.user?.collection === 'users') return doc
  if (
    publicShopPurchase(doc.shop) &&
    (collection.slug !== 'clothing' || isStandaloneClothing(doc.category))
  ) {
    return doc
  }
  const publicDoc = { ...doc }
  delete publicDoc.shop
  return publicDoc
}
