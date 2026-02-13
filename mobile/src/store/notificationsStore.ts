import AsyncStorage from '@react-native-async-storage/async-storage'

const KEY = 'lm_notifications'

export type NotificationItem = {
  id: string
  peerId: string
  title: string
  text: string
  ts: number
}

export async function listNotifications(): Promise<NotificationItem[]> {
  const raw = await AsyncStorage.getItem(KEY)
  if (!raw) return []
  try {
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

export async function addNotification(item: NotificationItem) {
  const list = await listNotifications()
  list.unshift(item)
  if (list.length > 200) list.length = 200
  await AsyncStorage.setItem(KEY, JSON.stringify(list))
}

export async function clearNotifications() {
  await AsyncStorage.removeItem(KEY)
}
