import React, { useEffect, useMemo, useRef, useState } from 'react'
import TopBar from '../components/TopBar.jsx'
import { useAuth } from '../state/auth.jsx'
import { apiGet, apiPost, apiPostForm, apiGetBuffer, API_URL } from '../utils/api.js'
import { listChats, upsertChat, loadMessages, appendMessage, deleteChat } from '../utils/chatStore.js'
import { newStoreForDevice, makeLibSignalStore, makeAddress, buildSessionFromBundle, encryptToAddress, decryptFromAddress } from '../signal/signal.js'
import { ensureDeviceSetup } from '../utils/deviceSetup.js'
import { aesGcmEncrypt, aesGcmDecrypt } from '../utils/crypto.js'
import { addNotification } from '../utils/notificationsStore.js'

function now(){ return Date.now() }
function shortId(s){
  if (!s) return ''
  return s.length > 18 ? s.slice(0, 6) + '...' + s.slice(-4) : s
}
function formatTime(ts){
  if (!ts) return ''
  const d = new Date(ts)
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}
function formatDay(ts){
  if (!ts) return ''
  const d = new Date(ts)
  return d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' })
}

function decodeCiphertext(ciphertext) {
  if (!ciphertext) throw new Error('empty ciphertext')
  const norm = (s) => {
    const cleaned = String(s).replace(/\s+/g, '').replace(/-/g, '+').replace(/_/g, '/')
    const pad = cleaned.length % 4
    return pad ? cleaned + '='.repeat(4 - pad) : cleaned
  }
  try {
    return JSON.parse(atob(ciphertext))
  } catch (e1) {
    try {
      return JSON.parse(atob(norm(ciphertext)))
    } catch {
      // last resort: ciphertext already JSON
      return JSON.parse(ciphertext)
    }
  }
}

function toB64FromBytes(bytes) {
  const arr = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes)
  let binary = ''
  for (let i = 0; i < arr.byteLength; i++) binary += String.fromCharCode(arr[i])
  return btoa(binary)
}

function extractBodyB64(packed) {
  if (!packed || typeof packed !== 'object') return null
  if (typeof packed.bodyB64 === 'string' && packed.bodyB64.length) return packed.bodyB64
  if (typeof packed.body === 'string' && packed.body.length) return packed.body
  if (packed.body && Array.isArray(packed.body.data)) return toB64FromBytes(packed.body.data)
  if (Array.isArray(packed.body)) return toB64FromBytes(packed.body)
  if (packed.ciphertext && typeof packed.ciphertext === 'string') return packed.ciphertext
  return null
}

function formatSize(bytes) {
  if (!bytes && bytes !== 0) return ''
  const units = ['B', 'KB', 'MB', 'GB']
  let v = bytes
  let i = 0
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024
    i += 1
  }
  return `${v.toFixed(v >= 10 || i === 0 ? 0 : 1)} ${units[i]}`
}

function messageKey(m, idx) {
  if (m?.file?.id) return `${m.file.id}:${m._ts || m.ts || idx}`
  return `${m?._ts || m?.ts || idx}:${m?.from || ''}`
}

export default function Chat() {
  const { token, me, logout } = useAuth()
  const [deviceId, setDeviceId] = useState('')
  const [chats, setChats] = useState([])
  const [groups, setGroups] = useState([])
  const [activePeer, setActivePeer] = useState(null) // {peerId, username, displayName}
  const [messages, setMessages] = useState([])
  const [search, setSearch] = useState('')
  const [lookupErr, setLookupErr] = useState('')
  const [sendText, setSendText] = useState('')
  const [showMenu, setShowMenu] = useState(false)
  const [showInfo, setShowInfo] = useState(false)
  const [emojiOpen, setEmojiOpen] = useState(false)
  const [fileBusy, setFileBusy] = useState(false)
  const [fileUrls, setFileUrls] = useState({})
  const [replyTo, setReplyTo] = useState(null)
  const [searchOpen, setSearchOpen] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [searchHits, setSearchHits] = useState([])
  const [searchIndex, setSearchIndex] = useState(0)
  const [showGroupModal, setShowGroupModal] = useState(false)
  const [groupName, setGroupName] = useState('')
  const [groupMembers, setGroupMembers] = useState('')
  const wsRef = useRef(null)
  const activePeerRef = useRef(null)
  const fileInputRef = useRef(null)
  const messagesPaneRef = useRef(null)
  const fileUrlCacheRef = useRef(new Map())

  const store = useMemo(() => (me && deviceId) ? newStoreForDevice(me.id, deviceId) : null, [me, deviceId])
  const lsStore = useMemo(() => store ? makeLibSignalStore(store) : null, [store])

  useEffect(() => {
    if (!token || !me) return
    if (deviceId) return
    ensureDeviceSetup(token, me).then((id) => {
      if (id) setDeviceId(id)
    }).catch(()=>{})
  }, [token, me, deviceId])

  useEffect(() => { activePeerRef.current = activePeer }, [activePeer])

  async function refreshChats(peerIdOverride){
    if (!deviceId) return
    const idx = await listChats(deviceId)
    setChats(idx)
    const peerId = peerIdOverride || activePeerRef.current?.peerId
    if (peerId) {
      const msgs = await loadMessages(deviceId, peerId)
      setMessages(msgs)
    }
  }

  useEffect(() => { refreshChats().catch(()=>{}) }, [deviceId])
  useEffect(() => {
    setShowInfo(false)
    setReplyTo(null)
    setSearchOpen(false)
    setSearchQuery('')
    setSearchHits([])
    setSearchIndex(0)
  }, [activePeer?.peerId])
  useEffect(() => {
    return () => {
      for (const url of fileUrlCacheRef.current.values()) {
        try { URL.revokeObjectURL(url) } catch {}
      }
      fileUrlCacheRef.current.clear()
    }
  }, [])

  useEffect(() => {
    if (!token || !deviceId) return
    apiGet('/groups', token).then(async (r) => {
      const list = r.groups || []
      setGroups(list)
      for (const g of list) {
        await upsertChat(deviceId, { peerId: `group:${g.id}`, title: g.name, isGroup: true, groupId: g.id, lastText: '', lastTs: 0 })
      }
      await refreshChats()
    }).catch(()=>{})
  }, [token, deviceId])

  useEffect(() => {
    let t
    async function poll(){
      if (!token || !deviceId || !lsStore) return
      try{
        const r = await apiGet(`/messages/pending?deviceId=${encodeURIComponent(deviceId)}&limit=200`, token)
        for (const env of r.messages){
          let peerId = env.senderUserId
          try{
            const packed = decodeCiphertext(env.ciphertext)
            const bodyB64 = extractBodyB64(packed)
            if (!bodyB64) {
              console.error('missing bodyB64', { ciphertext: env.ciphertext, packed })
              throw new Error('missing bodyB64')
            }
            const addr = makeAddress(env.senderUserId, env.senderDeviceId)
            const plain = await decryptFromAddress(lsStore, addr, { type: packed.type, bodyB64 })
            if (plain?.t === 'control' && plain.action === 'delete_chat' && plain.peerId) {
              await deleteChat(deviceId, plain.peerId)
              if (activePeerRef.current?.peerId === plain.peerId) {
                setActivePeer(null)
                setMessages([])
              }
              await refreshChats()
              continue
            }
            if (plain?.t === 'group' && plain.groupId) {
              peerId = `group:${plain.groupId}`
              await upsertChat(deviceId, { peerId, title: plain.groupName || 'Group', isGroup: true, groupId: plain.groupId, lastText: plain.text || '(msg)', lastTs: Date.parse(env.createdAt) })
            } else {
              await upsertChat(deviceId, { peerId, title: plain.fromUsername || peerId, lastText: plain.text || '(msg)', lastTs: Date.parse(env.createdAt) })
            }
            await appendMessage(deviceId, peerId, { ...plain, _ts: Date.parse(env.createdAt) })
            if (activePeerRef.current?.peerId !== peerId) {
              await addNotification({ id: `${env.id}`, ts: Date.parse(env.createdAt), peerId, text: plain.text || (plain.t === 'file' ? (plain.file?.name || 'file') : 'message') })
            }
          }catch(ex){
            console.error('decrypt failed', ex, { id: env.id, len: env.ciphertext?.length, sample: String(env.ciphertext || '').slice(0, 80) })
            const errText = ex?.message ? ex.message : String(ex)
            await appendMessage(deviceId, peerId, { t:'sys', text:`[decrypt failed] ${errText}`, ts: now(), _ts: now() })
            await upsertChat(deviceId, { peerId, title: peerId, lastText: '[decrypt failed]', lastTs: now() })
          }
        }
        await refreshChats()
      }catch{
        // ignore
      }finally{
        t = setTimeout(poll, 2500)
      }
    }
    poll()
    return () => { if (t) clearTimeout(t) }
  }, [token, deviceId, lsStore])

  useEffect(() => {
    if (!activePeer) return
    const el = messagesPaneRef.current
    if (!el) return
    requestAnimationFrame(() => {
      el.scrollTop = el.scrollHeight
    })
  }, [activePeer?.peerId, messages.length])

  useEffect(() => {
    if (!searchOpen || !searchQuery.trim()) {
      setSearchHits([])
      setSearchIndex(0)
      return
    }
    const q = searchQuery.trim().toLowerCase()
    const hits = []
    for (let i = 0; i < messages.length; i += 1) {
      const m = messages[i]
      const text = (m?.text || m?.file?.name || '').toLowerCase()
      if (text && text.includes(q)) hits.push(i)
    }
    setSearchHits(hits)
    setSearchIndex(0)
  }, [searchOpen, searchQuery, messages])

  useEffect(() => {
    if (!searchOpen || !searchQuery.trim()) return
    if (!searchHits.length) return
    const idx = searchHits[Math.max(0, Math.min(searchIndex, searchHits.length - 1))]
    const el = document.getElementById(`msg-${idx}`)
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }, [searchOpen, searchQuery, searchHits, searchIndex])

  // WebSocket notify
  useEffect(() => {
    if (!token || !deviceId) return
    try{
      const ws = new WebSocket(`${API_URL.replace('http','ws')}/ws?token=${encodeURIComponent(token)}&deviceId=${encodeURIComponent(deviceId)}`)
      wsRef.current = ws
      ws.onmessage = async (ev) => {
        try{
          const msg = JSON.parse(ev.data)
          if (msg.type === 'notify') {
            // trigger immediate pull
            await apiGet(`/messages/pending?deviceId=${encodeURIComponent(deviceId)}&limit=200`, token).then(async (r)=>{
              for (const env of r.messages){
                let peerId = env.senderUserId
                try{
                  const packed = decodeCiphertext(env.ciphertext)
                  const bodyB64 = extractBodyB64(packed)
                  if (!bodyB64) {
                    console.error('missing bodyB64', { ciphertext: env.ciphertext, packed })
                    throw new Error('missing bodyB64')
                  }
                  const addr = makeAddress(env.senderUserId, env.senderDeviceId)
                  const plain = await decryptFromAddress(lsStore, addr, { type: packed.type, bodyB64 })
                  if (plain?.t === 'control' && plain.action === 'delete_chat' && plain.peerId) {
                    await deleteChat(deviceId, plain.peerId)
                    if (activePeerRef.current?.peerId === plain.peerId) {
                      setActivePeer(null)
                      setMessages([])
                    }
                    await refreshChats()
                    continue
                  }
                  if (plain?.t === 'group' && plain.groupId) {
                    peerId = `group:${plain.groupId}`
                    await upsertChat(deviceId, { peerId, title: plain.groupName || 'Group', isGroup: true, groupId: plain.groupId, lastText: plain.text || '(msg)', lastTs: Date.parse(env.createdAt) })
                  } else {
                    await upsertChat(deviceId, { peerId, title: plain.fromUsername || peerId, lastText: plain.text || '(msg)', lastTs: Date.parse(env.createdAt) })
                  }
                  await appendMessage(deviceId, peerId, { ...plain, _ts: Date.parse(env.createdAt) })
                  if (activePeerRef.current?.peerId !== peerId) {
                    await addNotification({ id: `${env.id}`, ts: Date.parse(env.createdAt), peerId, text: plain.text || (plain.t === 'file' ? (plain.file?.name || 'file') : 'message') })
                  }
                }catch(ex){
                  console.error('decrypt failed', ex, { id: env.id, len: env.ciphertext?.length, sample: String(env.ciphertext || '').slice(0, 80) })
                  const errText = ex?.message ? ex.message : String(ex)
                  await appendMessage(deviceId, peerId, { t:'sys', text:`[decrypt failed] ${errText}`, ts: now(), _ts: now() })
                  await upsertChat(deviceId, { peerId, title: peerId, lastText: '[decrypt failed]', lastTs: now() })
                }
              }
              await refreshChats()
            }).catch(()=>{})
          }
        }catch{}
      }
      ws.onerror = () => {}
      ws.onclose = () => {}
      return () => { try{ ws.close() }catch{} }
    }catch{}
  }, [token, deviceId, lsStore])

  async function lookupUser(){
    setLookupErr('')
    const q = search.trim()
    if (!q) return
    try{
      const r = await apiGet(`/users/lookup?q=${encodeURIComponent(q)}`, token)
      const u = r.user
      const peer = { peerId: u.id, username: u.username, displayName: u.displayName }
      setActivePeer(peer)
      await upsertChat(deviceId, { peerId: u.id, title: u.username, lastText: '', lastTs: 0 })
      const msgs = await loadMessages(deviceId, u.id)
      setMessages(msgs)
      await refreshChats()
      setSearch('')
    }catch(ex){
      setLookupErr(ex.message)
    }
  }

  async function openChat(peerId){
    const c = chats.find(x => x.peerId === peerId)
    const peer = { peerId, username: c?.title || peerId, displayName: '', isGroup: c?.isGroup, groupId: c?.groupId }
    setActivePeer(peer)
    const msgs = await loadMessages(deviceId, peerId)
    setMessages(msgs)
  }

  async function sendPayload(peerId, payload, previewText){
    const ts = payload.ts || now()
    const full = { ...payload, ts, from: me.id, fromUsername: me.username, _ts: ts }

    await appendMessage(deviceId, peerId, full)
    await upsertChat(deviceId, {
      peerId,
      title: activePeer?.username || peerId,
      lastText: previewText || payload.text || '(msg)',
      lastTs: ts,
      avatarUrl: activePeer?.avatarUrl || ''
    })
    await refreshChats(peerId)

    try{
      const envelopes = await buildEnvelopes(peerId, full)
      if (envelopes.length) {
        await apiPost('/messages/send', { senderDeviceId: deviceId, recipientUserId: peerId, envelopes }, token)
      }
    }catch(ex){
      await appendMessage(deviceId, peerId, { t:'sys', text:'[send failed] ' + ex.message, ts: now(), _ts: now() })
      await refreshChats(peerId)
    }
  }

  async function buildEnvelopes(recipientUserId, payload, excludeDeviceIds = []){
    const devs = await apiGet(`/users/${encodeURIComponent(recipientUserId)}/devices`, token)
    const envelopes = []
    for (const d of devs.devices){
      if (excludeDeviceIds.includes(d.id)) continue
      const b = await apiGet(`/keys/bundle?userId=${encodeURIComponent(recipientUserId)}&deviceId=${encodeURIComponent(d.id)}`, token)
      const addr = makeAddress(recipientUserId, d.id)
      await buildSessionFromBundle(lsStore, addr, b.bundle)
      const enc = await encryptToAddress(lsStore, addr, payload)
      const packed = btoa(JSON.stringify({ type: enc.type, bodyB64: enc.bodyB64 }))
      envelopes.push({ recipientDeviceId: d.id, ciphertext: packed })
    }
    return envelopes
  }

  async function sendControl(recipientUserId, payload, excludeDeviceIds = []){
    const envelopes = await buildEnvelopes(recipientUserId, payload, excludeDeviceIds)
    if (!envelopes.length) return
    await apiPost('/messages/send', { senderDeviceId: deviceId, recipientUserId, envelopes }, token)
  }

  async function deleteChatForBoth(){
    if (!activePeer) return
    if (activePeer.isGroup) {
      try { await apiPost(`/groups/${encodeURIComponent(activePeer.groupId)}/leave`, {}, token) } catch {}
      await deleteChat(deviceId, activePeer.peerId)
      setActivePeer(null)
      setMessages([])
      await refreshChats()
      setShowInfo(false)
      return
    }
    const peerId = activePeer.peerId
    setShowInfo(false)
    await deleteChat(deviceId, peerId)
    if (activePeerRef.current?.peerId === peerId) {
      setActivePeer(null)
      setMessages([])
    }
    await refreshChats()
    try{
      await apiPost('/messages/delete-conversation', { peerUserId: peerId }, token)
    }catch{}
    const ts = now()
    // notify peer to delete chat with me
    try{
      await sendControl(peerId, { t:'control', action:'delete_chat', peerId: me.id, ts, from: me.id, fromUsername: me.username })
    }catch{}
    // notify my other devices to delete chat with peer
    try{
      await sendControl(me.id, { t:'control', action:'delete_chat', peerId, ts, from: me.id, fromUsername: me.username }, [deviceId])
    }catch{}
  }

  async function openSavedMessages(){
    setShowMenu(false)
    if (!me?.id) return
    const peerId = me.id
    await upsertChat(deviceId, { peerId, title: 'Saved messages', lastText: '', lastTs: 0 })
    const peer = { peerId, username: 'Saved messages', displayName: '', isGroup: false }
    setActivePeer(peer)
    const msgs = await loadMessages(deviceId, peerId)
    setMessages(msgs)
  }

  async function createGroup(){
    if (!groupName.trim()) return
    const names = groupMembers.split(',').map(s => s.trim()).filter(Boolean)
    const ids = []
    for (const name of names) {
      try {
        const r = await apiGet(`/users/lookup?q=${encodeURIComponent(name)}`, token)
        if (r.user?.id) ids.push(r.user.id)
      } catch {}
    }
    const r = await apiPost('/groups', { name: groupName.trim(), memberIds: ids }, token)
    const g = r.group
    if (g?.id) {
      await upsertChat(deviceId, { peerId: `group:${g.id}`, title: g.name, isGroup: true, groupId: g.id, lastText: '', lastTs: 0 })
      setGroups(prev => [g, ...prev])
      setActivePeer({ peerId: `group:${g.id}`, username: g.name, isGroup: true, groupId: g.id })
      setMessages([])
    }
    setGroupName('')
    setGroupMembers('')
    setShowGroupModal(false)
  }

  async function sendMessage(){
    if (!activePeer || !sendText.trim()) return
    const text = sendText.trim()
    const reply = replyTo ? { ...replyTo } : null
    setSendText('')
    setReplyTo(null)
    if (activePeer.isGroup) {
      await sendGroupMessage(activePeer, text, reply)
    } else {
      await sendPayload(activePeer.peerId, { t:'msg', text, reply }, text)
    }
  }

  async function sendGroupMessage(groupPeer, text, reply){
    const groupId = groupPeer.groupId
    if (!groupId) return
    const ts = now()
    const groupName = groupPeer.username || 'Group'
    const payload = { t:'group', groupId, groupName, text, ts, reply: reply || undefined }
    const peerId = `group:${groupId}`

    await appendMessage(deviceId, peerId, { ...payload, from: me.id, fromUsername: me.username, _ts: ts })
    await upsertChat(deviceId, { peerId, title: groupName, isGroup: true, groupId, lastText: text, lastTs: ts })
    await refreshChats(peerId)

    const members = await apiGet(`/groups/${encodeURIComponent(groupId)}/members`, token)
    const users = members.members || []
    for (const u of users) {
      if (u.id === me.id) continue
      try {
        const envelopes = await buildEnvelopes(u.id, { ...payload, from: me.id, fromUsername: me.username })
        if (envelopes.length) {
          await apiPost('/messages/send', { senderDeviceId: deviceId, recipientUserId: u.id, envelopes }, token)
        }
      } catch {}
    }
    // also sync to my other devices
    try {
      await sendControl(me.id, { ...payload, from: me.id, fromUsername: me.username }, [deviceId])
    } catch {}
  }

  async function sendFiles(fileList){
    if (!activePeer || !fileList?.length) return
    const peerId = activePeer.peerId
    setFileBusy(true)
    const reply = replyTo ? { ...replyTo } : null
    try{
      for (const file of Array.from(fileList)){
        if (file.size > 50 * 1024 * 1024) {
          await appendMessage(deviceId, peerId, { t:'sys', text:`[file too large] ${file.name}`, ts: now(), _ts: now() })
          continue
        }
        const buf = await file.arrayBuffer()
        const enc = await aesGcmEncrypt(buf)
        const fd = new FormData()
        fd.append('file', new Blob([enc.cipherBuf], { type: 'application/octet-stream' }), 'payload.bin')
        fd.append('recipientUserId', peerId)
        fd.append('kind', 'MESSAGE')
        fd.append('originalName', file.name)
        fd.append('mime', file.type || 'application/octet-stream')
        const r = await apiPostForm('/files/upload', fd, token)
        const payload = {
          t: 'file',
          reply: reply || undefined,
          file: {
            id: r.file.id,
            name: file.name,
            mime: file.type || 'application/octet-stream',
            size: file.size,
            key: enc.keyB64,
            iv: enc.ivB64,
          }
        }
        await sendPayload(peerId, payload, `[file] ${file.name}`)
      }
    } finally {
      setFileBusy(false)
      if (reply) setReplyTo(null)
    }
  }

  async function ensureFileUrl(m, idx){
    const key = messageKey(m, idx)
    if (fileUrlCacheRef.current.has(key)) return fileUrlCacheRef.current.get(key)
    const data = await apiGetBuffer(`/files/${m.file.id}`, token)
    const plain = await aesGcmDecrypt(data, m.file.key, m.file.iv)
    const blob = new Blob([plain], { type: m.file.mime || 'application/octet-stream' })
    const url = URL.createObjectURL(blob)
    fileUrlCacheRef.current.set(key, url)
    setFileUrls(prev => ({ ...prev, [key]: url }))
    return url
  }

  if (!deviceId) {
    return (
      <div className="app-shell">
        <TopBar />
        <div className="device-wait">
          <div className="device-card">
            <div className="device-title">Preparing secure device</div>
            <div className="device-sub">We are generating keys and syncing your device. This takes a few seconds.</div>
            <div className="device-progress">
              <span />
              <span />
              <span />
            </div>
          </div>
        </div>
      </div>
    )
  }

  const meInitial = me?.username ? me.username.slice(0, 1).toUpperCase() : 'U'
  const activeTitle = activePeer ? (activePeer.username || shortId(activePeer.peerId)) : 'Select a chat'
  const activeId = activePeer?.peerId || ''
  const activeInitial = activePeer?.username ? activePeer.username.slice(0, 1).toUpperCase() : shortId(activeId).slice(0, 1).toUpperCase()
  const infoTarget = activePeer
    ? { name: activeTitle, id: activeId, role: activePeer?.isGroup ? 'Group' : 'Contact' }
    : (me ? { name: me.username || shortId(me.id), id: me.id, role: 'You' } : null)
  const replyPreview = (m) => {
    if (!m) return ''
    if (m.t === 'file') return `[file] ${m.file?.name || 'file'}`
    if (m.text) return m.text
    return ''
  }
  const meId = me?.id || ''
  const hitSet = useMemo(() => new Set(searchHits), [searchHits])
  const renderedMessages = []
  let lastDayKey = ''
  for (let idx = 0; idx < messages.length; idx += 1) {
    const m = messages[idx]
    const ts = m?._ts || m?.ts || now()
    const dayKey = new Date(ts).toDateString()
    if (dayKey !== lastDayKey) {
      renderedMessages.push(
        <div key={`day-${idx}`} className="date-divider"><span>{formatDay(ts)}</span></div>
      )
      lastDayKey = dayKey
    }
    const mine = m?.from === meId
    const sys = m?.t === 'sys'
    const reply = m?.reply
    const canReply = !sys
    const key = messageKey(m, idx)
    const hit = hitSet.has(idx)
    renderedMessages.push(
      <div id={`msg-${idx}`} key={`msg-${idx}`} className={`msg-row ${mine ? 'out' : 'in'} ${sys ? 'sys' : ''}`}>
        {m?.t === 'file' ? (
          <div
            className={`bubble ${mine ? 'bubble-out' : 'bubble-in'} ${canReply ? 'replyable' : ''} ${hit ? 'bubble-hit' : ''}`}
            onClick={() => { if (canReply) setReplyTo({ from: m.from, fromUsername: m.fromUsername, text: replyPreview(m), ts }) }}
          >
            {reply && (
              <div className="reply-chip">
                <div className="reply-author">{reply.fromUsername || shortId(reply.from)}</div>
                <div className="reply-text">{reply.text || ''}</div>
              </div>
            )}
            <div className="file-card">
              <div className="file-meta">
                <div className="file-name">{m.file?.name || 'file'}</div>
                <div className="file-size">{formatSize(m.file?.size)}</div>
              </div>
              <div className="file-actions">
                {fileUrls[key] ? (
                  <button className="pill" onClick={() => window.open(fileUrls[key], '_blank')}>Open</button>
                ) : (
                  <button className="pill" onClick={() => ensureFileUrl(m, idx).catch(() => {})}>Decrypt</button>
                )}
                <button className="pill" onClick={async () => {
                  try {
                    const url = fileUrls[key] || await ensureFileUrl(m, idx)
                    const a = document.createElement('a')
                    a.href = url
                    a.download = m.file?.name || 'file'
                    a.click()
                  } catch {}
                }}>Download</button>
              </div>
              {fileUrls[key] && m.file?.mime?.startsWith('image/') && (
                <img className="file-preview" src={fileUrls[key]} alt={m.file?.name || 'image'} />
              )}
            </div>
            <div className="bubble-time">{formatTime(ts)}</div>
          </div>
        ) : (
          <div
            className={`bubble ${mine ? 'bubble-out' : 'bubble-in'} ${sys ? 'bubble-sys' : ''} ${canReply ? 'replyable' : ''} ${hit ? 'bubble-hit' : ''}`}
            onClick={() => { if (canReply) setReplyTo({ from: m.from, fromUsername: m.fromUsername, text: replyPreview(m), ts }) }}
          >
            {reply && (
              <div className="reply-chip">
                <div className="reply-author">{reply.fromUsername || shortId(reply.from)}</div>
                <div className="reply-text">{reply.text || ''}</div>
              </div>
            )}
            <div className="bubble-text">{m.text}</div>
            <div className="bubble-time">{formatTime(ts)}</div>
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="app-shell">
      <TopBar />
      <div className={`menu-backdrop ${showMenu ? 'show' : ''}`} onClick={() => setShowMenu(false)} />
      <aside className={`menu-drawer ${showMenu ? 'open' : ''}`}>
        <div className="menu-profile">
          <div className="avatar-lg">{meInitial}</div>
          <div>
            <div className="menu-name">{me?.username || 'User'}</div>
            <div className="menu-id">{me?.id ? shortId(me.id) : 'No id'}</div>
          </div>
        </div>
        <div className="menu-list">
          <button className="menu-item" onClick={() => { setShowMenu(false); setShowInfo(true) }}>
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 12a4 4 0 1 0-4-4a4 4 0 0 0 4 4Zm0 2c-4.4 0-8 2-8 4.5V21h16v-2.5c0-2.5-3.6-4.5-8-4.5Z" /></svg>
            <span>My profile</span>
          </button>
          <button className="menu-item" onClick={() => { setShowMenu(false); setShowGroupModal(true) }}>
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 6h8v4H3V6Zm10 0h8v4h-8V6ZM3 14h8v4H3v-4Zm10 0h8v4h-8v-4Z" /></svg>
            <span>New group</span>
          </button>
          <button className="menu-item" onClick={openSavedMessages}>
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 2h12a2 2 0 0 1 2 2v16l-4-3H6a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2Z" /></svg>
            <span>Saved messages</span>
          </button>
          <button className="menu-item" onClick={() => { setShowMenu(false); location.href = '/notifications' }}>
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2a5 5 0 0 1 5 5v3l2 2v1H5v-1l2-2V7a5 5 0 0 1 5-5Zm-3 17h6a3 3 0 0 1-6 0Z" /></svg>
            <span>Notifications</span>
          </button>
          <button className="menu-item" onClick={() => { setShowMenu(false); location.href = '/settings' }}>
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 7a2 2 0 1 1 0-4a2 2 0 0 1 0 4Zm0 7a2 2 0 1 1 0-4a2 2 0 0 1 0 4Zm0 7a2 2 0 1 1 0-4a2 2 0 0 1 0 4Z" /></svg>
            <span>Settings</span>
          </button>
          <button className="menu-item" onClick={() => { setShowMenu(false); location.href = '/smartkey' }}>
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 11h9a4 4 0 1 1 0 8h-2v-2h2a2 2 0 1 0 0-4H4v-2Zm0 4h7v2H4v-2Zm11-8a3 3 0 0 0-6 0v2h2V7a1 1 0 1 1 2 0v2h2V7Z" /></svg>
            <span>Smart key</span>
          </button>
        </div>
        <div className="menu-divider" />
        <button className="menu-item danger" onClick={() => { setShowMenu(false); logout(); location.href = '/login' }}>
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 3h8a2 2 0 0 1 2 2v3h-2V5H5v14h8v-3h2v3a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2Zm10.6 5.6L18 11h-8v2h8l-2.4 2.4 1.4 1.4L22.8 12l-5.8-5.8-1.4 1.4Z" /></svg>
          <span>Logout</span>
        </button>
      </aside>
      <div className="chat-layout">
        <aside className="nav-rail">
          <div className="nav-rail-top">
            <div className="brand-badge">LM</div>
          </div>
          <div className="nav-rail-group">
            <button className="nav-icon active" title="Chats">
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 5h16v10H7l-3 3V5z" /></svg>
            </button>
            <button className="nav-icon" title="Contacts">
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 7a3 3 0 1 1 6 0a3 3 0 0 1-6 0Zm-3 9c0-2.2 3.2-4 6-4s6 1.8 6 4v2H4v-2Zm12-7h4v9h-4z" /></svg>
            </button>
            <button className="nav-icon" title="Calls">
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6.6 10.8c1.5 3 3.6 5.1 6.6 6.6l2.2-2.2c.2-.2.6-.3.9-.2 1 .3 2 .5 3.1.5.6 0 1 .4 1 1V20c0 .6-.4 1-1 1C9.4 21 3 14.6 3 6c0-.6.4-1 1-1h3.5c.6 0 1 .4 1 1 0 1.1.2 2.1.5 3.1.1.3 0 .7-.2.9l-2.2 2.2z"/></svg>
            </button>
          </div>
          <div className="nav-rail-bottom">
            <button className="nav-icon" title="Settings">
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 8.5a3.5 3.5 0 1 1 0 7a3.5 3.5 0 0 1 0-7Zm8.6 2.3l-1.7-.3a6.9 6.9 0 0 0-.7-1.7l1-1.4-1.4-1.4-1.4 1a6.9 6.9 0 0 0-1.7-.7l-.3-1.7h-2l-.3 1.7a6.9 6.9 0 0 0-1.7.7l-1.4-1-1.4 1.4 1 1.4a6.9 6.9 0 0 0-.7 1.7l-1.7.3v2l1.7.3c.1.6.4 1.2.7 1.7l-1 1.4 1.4 1.4 1.4-1c.5.3 1.1.6 1.7.7l.3 1.7h2l.3-1.7c.6-.1 1.2-.4 1.7-.7l1.4 1 1.4-1.4-1-1.4c.3-.5.6-1.1.7-1.7l1.7-.3v-2z"/></svg>
            </button>
          </div>
        </aside>

        <section className="chat-list panel">
          <div className="chat-list-top">
            <button className="icon-btn ghost" title="Menu" onClick={() => setShowMenu(true)}>
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16v2H4V7Zm0 5h16v2H4v-2Zm0 5h10v2H4v-2Z" /></svg>
            </button>
            <div className="search-wrap">
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M11 4a7 7 0 1 1 0 14a7 7 0 0 1 0-14Zm0 2a5 5 0 1 0 0 10a5 5 0 0 0 0-10Zm8.7 12.3l-3-3 1.4-1.4 3 3-1.4 1.4z"/></svg>
              <input className="search-input" placeholder="Search username / id" value={search} onChange={e=>setSearch(e.target.value)} onKeyDown={(e)=>{ if(e.key==='Enter') lookupUser() }} />
            </div>
            <button className="icon-btn ghost" title="Find" onClick={lookupUser}>
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 4v8m0 0v8m0-8h8m-8 0H4" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round"/></svg>
            </button>
          </div>
          <div className="chat-list-header">
            <div>
              <div className="list-title">All chats</div>
              <div className="list-meta">{chats.length} total</div>
            </div>
            <button className="pill">Archive</button>
          </div>
          {lookupErr && <div className="inline-error">{lookupErr}</div>}
          <div className="chat-items">
            {chats.map(c => {
              const isActive = activePeer?.peerId === c.peerId
              const title = c.title || shortId(c.peerId)
              const lastTs = c.lastTs || 0
              return (
                <button key={c.peerId} onClick={()=>openChat(c.peerId)} className={`chat-item ${isActive ? 'active' : ''}`}>
                  <div className="avatar">{(title || 'U').slice(0,1).toUpperCase()}</div>
                  <div className="chat-item-main">
                    <div className="chat-item-top">
                      <div className="chat-title">{title}</div>
                      <div className="chat-time">{formatTime(lastTs)}</div>
                    </div>
                    <div className="chat-preview">{c.lastText || 'No messages yet'}</div>
                  </div>
                </button>
              )
            })}
            {chats.length===0 && (
              <div className="empty-state">No chats yet. Find a user to start.</div>
            )}
          </div>
        </section>

        <main className="chat-main panel">
          <div className="chat-header">
            <div className="chat-header-left">
              <div className={`avatar ${activePeer ? '' : 'muted'}`}>{activePeer ? activeInitial : '?'}</div>
              <div className="chat-header-title">
                <div className="chat-name">{activeTitle}</div>
                {activePeer && <div className="chat-sub">{activeId}</div>}
              </div>
            </div>
            <div className="chat-actions">
              <button className="icon-btn" title="Search" onClick={() => setSearchOpen(v => !v)}>
                <svg viewBox="0 0 24 24"><path d="M11 4a7 7 0 1 1 0 14a7 7 0 0 1 0-14Zm0 2a5 5 0 1 0 0 10a5 5 0 0 0 0-10Zm8.7 12.3l-3-3 1.4-1.4 3 3-1.4 1.4z"/></svg>
              </button>
              <button className="icon-btn" title="Info" onClick={() => setShowInfo(!showInfo)}>
                <svg viewBox="0 0 24 24"><path d="M12 2a10 10 0 1 0 0 20a10 10 0 0 0 0-20Zm0 8a1.2 1.2 0 1 1 0-2.4A1.2 1.2 0 0 1 12 10Zm1.6 7h-3.2v-1.8h1V12h-1V10.2h3.2V17Z"/></svg>
              </button>
            </div>
          </div>

          {searchOpen && (
            <div className="chat-searchbar">
              <input
                className="input ghost"
                placeholder="Search in chat"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
              <div className="search-count">
                {searchHits.length ? `${Math.min(searchIndex + 1, searchHits.length)}/${searchHits.length}` : '0'}
              </div>
              <button
                className="icon-btn ghost"
                title="Previous"
                onClick={() => {
                  if (!searchHits.length) return
                  setSearchIndex((i) => (i - 1 + searchHits.length) % searchHits.length)
                }}
                disabled={!searchHits.length}
              >
                <svg viewBox="0 0 24 24"><path d="M7 14l5-5 5 5" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round"/></svg>
              </button>
              <button
                className="icon-btn ghost"
                title="Next"
                onClick={() => {
                  if (!searchHits.length) return
                  setSearchIndex((i) => (i + 1) % searchHits.length)
                }}
                disabled={!searchHits.length}
              >
                <svg viewBox="0 0 24 24"><path d="M7 10l5 5 5-5" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round"/></svg>
              </button>
              <button
                className="icon-btn ghost"
                title="Close"
                onClick={() => { setSearchOpen(false); setSearchQuery(''); }}
              >
                <svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6l-12 12" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round"/></svg>
              </button>
            </div>
          )}

          <div className="messages-pane" ref={messagesPaneRef}>
            {!activePeer && <div className="empty-state">Choose a chat on the left.</div>}
            {activePeer && renderedMessages}
          </div>

          {emojiOpen && (
            <div className="emoji-pop">
              {['😀','😂','😍','👍','🔥','🎉','😅','😎','🤝','🙏','❤️','😴'].map(em => (
                <button key={em} className="emoji-btn" onClick={() => { setSendText(t => t + em); setEmojiOpen(false) }}>{em}</button>
              ))}
            </div>
          )}

          {replyTo && (
            <div className="reply-bar">
              <div className="reply-line" />
              <div className="reply-content">
                <div className="reply-author">{replyTo.fromUsername || shortId(replyTo.from) || 'Unknown'}</div>
                <div className="reply-text">{replyTo.text || ''}</div>
              </div>
              <button className="icon-btn ghost reply-cancel" onClick={() => setReplyTo(null)} title="Cancel reply">
                <svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6l-12 12" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round"/></svg>
              </button>
            </div>
          )}
          <div className="composer">
            <div className="composer-actions">
              <button className="icon-btn ghost" title="Attach" onClick={() => fileInputRef.current?.click()} disabled={!activePeer || fileBusy}>
                <svg viewBox="0 0 24 24"><path d="M7 7.5V16a5 5 0 0 0 10 0V6a3.5 3.5 0 0 0-7 0v9a2 2 0 0 0 4 0V7.5h-1.8V15a.2.2 0 0 1-.4 0V6a1.7 1.7 0 1 1 3.4 0v10a3.2 3.2 0 0 1-6.4 0V7.5H7Z"/></svg>
              </button>
              <button className="icon-btn ghost" title="Emoji" onClick={() => setEmojiOpen(!emojiOpen)}>
                <svg viewBox="0 0 24 24"><path d="M12 2a10 10 0 1 0 0 20a10 10 0 0 0 0-20Zm-4 8a1 1 0 1 1 2 0a1 1 0 0 1-2 0Zm7 0a1 1 0 1 1 2 0a1 1 0 0 1-2 0Zm-7.5 4.5h9a4.5 4.5 0 0 1-9 0Z"/></svg>
              </button>
            </div>
            <input className="input" placeholder="Message" value={sendText} onChange={e=>setSendText(e.target.value)} onKeyDown={(e)=>{ if(e.key==='Enter') sendMessage() }} disabled={!activePeer} />
            <button className="btn primary" onClick={sendMessage} disabled={!activePeer}>Send</button>
          </div>

          {infoTarget && (
            <aside className={`info-drawer ${showInfo ? 'open' : ''}`}>
              <div className="info-head">
                <div className="info-head-main">
                  <div className="avatar-lg">{infoTarget.name.slice(0, 1).toUpperCase()}</div>
                  <div>
                    <div className="info-name">{infoTarget.name}</div>
                    <div className="info-sub">{infoTarget.role}</div>
                  </div>
                </div>
                <button className="icon-btn ghost" onClick={() => setShowInfo(false)} title="Close">
                  <svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6l-12 12" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round"/></svg>
                </button>
              </div>
              <div className="info-section">
                <div className="info-row"><span>Username</span><strong>{infoTarget.name}</strong></div>
                <div className="info-row"><span>ID</span><strong className="mono">{shortId(infoTarget.id)}</strong></div>
                <div className="info-row"><span>Status</span><strong>Online</strong></div>
              </div>
              <div className="menu-divider" />
              <div className="info-section">
                <button className="menu-item">
                  <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5a7 7 0 1 1 0 14a7 7 0 0 1 0-14Zm0 2a5 5 0 1 0 0 10a5 5 0 0 0 0-10Z" /></svg>
                  <span>Mute</span>
                </button>
                <button className="menu-item danger" onClick={deleteChatForBoth}>
                  <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 7h12l-1 14H7L6 7Zm2-4h8l1 3H7l1-3Z" /></svg>
                  <span>{activePeer?.isGroup ? 'Leave group' : 'Delete chat'}</span>
                </button>
              </div>
            </aside>
          )}
        </main>
      </div>
      {showGroupModal && (
        <div className="modal-backdrop" onClick={() => setShowGroupModal(false)}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()}>
            <div className="panel-title">New group</div>
            <div className="auth-form">
              <label className="field">
                <span>Group name</span>
                <input className="input" placeholder="My group" value={groupName} onChange={e => setGroupName(e.target.value)} />
              </label>
              <label className="field">
                <span>Members (usernames, comma separated)</span>
                <input className="input" placeholder="alice, bob, charlie" value={groupMembers} onChange={e => setGroupMembers(e.target.value)} />
              </label>
              <div className="device-actions">
                <button className="btn primary" onClick={createGroup}>Create</button>
                <button className="btn ghost" onClick={() => setShowGroupModal(false)}>Cancel</button>
              </div>
            </div>
          </div>
        </div>
      )}
      <input
        ref={fileInputRef}
        type="file"
        multiple
        style={{ display: 'none' }}
        onChange={async (e) => {
          const files = e.target.files
          if (files && files.length) await sendFiles(files)
          e.target.value = ''
        }}
      />
    </div>
  )
}
