import { get, set, keys } from 'idb-keyval'

function chatKey(deviceId, peerId){ return `chat:${deviceId}:${peerId}` }
function chatsIndexKey(deviceId){ return `chats:${deviceId}:index` }

export async function listChats(deviceId){
  const idx = await get(chatsIndexKey(deviceId))
  return Array.isArray(idx) ? idx : []
}

export async function upsertChat(deviceId, peer){
  const idx = await listChats(deviceId)
  const exists = idx.find(c => c.peerId === peer.peerId)
  const next = exists ? idx.map(c => c.peerId === peer.peerId ? { ...c, ...peer } : c) : [peer, ...idx]
  // sort by lastTs desc
  next.sort((a,b) => (b.lastTs||0) - (a.lastTs||0))
  await set(chatsIndexKey(deviceId), next)
}

export async function loadMessages(deviceId, peerId){
  const m = await get(chatKey(deviceId, peerId))
  return Array.isArray(m) ? m : []
}

export async function appendMessage(deviceId, peerId, msg){
  const arr = await loadMessages(deviceId, peerId)
  arr.push(msg)
  await set(chatKey(deviceId, peerId), arr)
}

export async function deleteChat(deviceId, peerId){
  const idx = await listChats(deviceId)
  const next = idx.filter(c => c.peerId !== peerId)
  await set(chatsIndexKey(deviceId), next)
  await set(chatKey(deviceId, peerId), [])
}
