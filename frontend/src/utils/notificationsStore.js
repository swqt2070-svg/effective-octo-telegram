import { get, set } from 'idb-keyval'

const KEY = 'notifications:list'

export async function listNotifications() {
  const items = await get(KEY)
  return Array.isArray(items) ? items : []
}

export async function addNotification(item) {
  const list = await listNotifications()
  const next = [item, ...list].slice(0, 200)
  await set(KEY, next)
  return next
}

export async function removeNotification(id) {
  const list = await listNotifications()
  const next = list.filter(n => n.id !== id)
  await set(KEY, next)
  return next
}

export async function clearNotifications() {
  await set(KEY, [])
  return []
}
