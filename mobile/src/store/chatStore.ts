import AsyncStorage from '@react-native-async-storage/async-storage'

function chatKey(userId: string, peerId: string) {
  return `chat:${userId}:${peerId}`
}

function chatsIndexKey(userId: string) {
  return `chats:${userId}:index`
}

export type ChatItem = {
  peerId: string
  title?: string
  alias?: string | null
  lastText?: string
  lastTs?: number
}

export async function listChats(userId: string): Promise<ChatItem[]> {
  const raw = await AsyncStorage.getItem(chatsIndexKey(userId))
  if (!raw) return []
  try {
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

export async function upsertChat(userId: string, peer: ChatItem) {
  const idx = await listChats(userId)
  const exists = idx.find(c => c.peerId === peer.peerId)
  const next = exists ? idx.map(c => (c.peerId === peer.peerId ? { ...c, ...peer } : c)) : [peer, ...idx]
  next.sort((a, b) => (b.lastTs || 0) - (a.lastTs || 0))
  await AsyncStorage.setItem(chatsIndexKey(userId), JSON.stringify(next))
}

export async function loadMessages(userId: string, peerId: string) {
  const raw = await AsyncStorage.getItem(chatKey(userId, peerId))
  if (!raw) return []
  try {
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

export async function appendMessage(userId: string, peerId: string, msg: any) {
  const arr = await loadMessages(userId, peerId)
  arr.push(msg)
  await AsyncStorage.setItem(chatKey(userId, peerId), JSON.stringify(arr))
}
