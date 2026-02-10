import React, { useEffect, useMemo, useRef, useState } from 'react'
import TopBar from '../components/TopBar.jsx'
import { useAuth } from '../state/auth.jsx'
import { apiGet, apiPost, API_URL } from '../utils/api.js'
import { getLocal } from '../utils/local.js'
import { listChats, upsertChat, loadMessages, appendMessage } from '../utils/chatStore.js'
import { newStoreForDevice, makeLibSignalStore, makeAddress, buildSessionFromBundle, encryptToAddress, decryptFromAddress } from '../signal/signal.js'

function now(){ return Date.now() }

export default function Chat() {
  const { token, me } = useAuth()
  const deviceId = getLocal('deviceId') || ''
  const [chats, setChats] = useState([])
  const [activePeer, setActivePeer] = useState(null) // {peerId, username, displayName}
  const [messages, setMessages] = useState([])
  const [search, setSearch] = useState('')
  const [lookupErr, setLookupErr] = useState('')
  const [sendText, setSendText] = useState('')
  const wsRef = useRef(null)

  const store = useMemo(() => (me && deviceId) ? newStoreForDevice(me.id, deviceId) : null, [me, deviceId])
  const lsStore = useMemo(() => store ? makeLibSignalStore(store) : null, [store])

  async function refreshChats(){
    if (!deviceId) return
    const idx = await listChats(deviceId)
    setChats(idx)
    if (activePeer) {
      const msgs = await loadMessages(deviceId, activePeer.peerId)
      setMessages(msgs)
    }
  }

  useEffect(() => { refreshChats().catch(()=>{}) }, [deviceId])

  useEffect(() => {
    let t
    async function poll(){
      if (!token || !deviceId || !lsStore) return
      try{
        const r = await apiGet(`/messages/pending?deviceId=${encodeURIComponent(deviceId)}&limit=200`, token)
        for (const env of r.messages){
          const peerId = env.senderUserId
          try{
            const packed = JSON.parse(atob(env.ciphertext))
            const addr = makeAddress(env.senderUserId, env.senderDeviceId)
            const plain = await decryptFromAddress(lsStore, addr, { type: packed.type, bodyB64: packed.bodyB64 })
            await appendMessage(deviceId, peerId, { ...plain, _ts: Date.parse(env.createdAt) })
            await upsertChat(deviceId, { peerId, title: plain.fromUsername || peerId, lastText: plain.text || '(msg)', lastTs: Date.parse(env.createdAt) })
          }catch(ex){
            console.error('decrypt failed', ex, env)
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
                const peerId = env.senderUserId
                try{
                  const packed = JSON.parse(atob(env.ciphertext))
                  const addr = makeAddress(env.senderUserId, env.senderDeviceId)
                  const plain = await decryptFromAddress(lsStore, addr, { type: packed.type, bodyB64: packed.bodyB64 })
                  await appendMessage(deviceId, peerId, { ...plain, _ts: Date.parse(env.createdAt) })
                  await upsertChat(deviceId, { peerId, title: plain.fromUsername || peerId, lastText: plain.text || '(msg)', lastTs: Date.parse(env.createdAt) })
                }catch(ex){
                  console.error('decrypt failed', ex, env)
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
    const peer = { peerId, username: c?.title || peerId, displayName: '' }
    setActivePeer(peer)
    const msgs = await loadMessages(deviceId, peerId)
    setMessages(msgs)
  }

  async function sendMessage(){
    if (!activePeer || !sendText.trim()) return
    const text = sendText.trim()
    setSendText('')
    const peerId = activePeer.peerId
    const ts = now()

    // optimistic local store
    await appendMessage(deviceId, peerId, { t:'msg', text, ts, from: me.id, fromUsername: me.username, _ts: ts })
    await upsertChat(deviceId, { peerId, title: activePeer.username || peerId, lastText: text, lastTs: ts })
    await refreshChats()

    // E2E: encrypt to each recipient device
    try{
      const devs = await apiGet(`/users/${encodeURIComponent(peerId)}/devices`, token)
      const envelopes = []
      for (const d of devs.devices){
        // fetch prekey bundle
        const b = await apiGet(`/keys/bundle?userId=${encodeURIComponent(peerId)}&deviceId=${encodeURIComponent(d.id)}`, token)
        const addr = makeAddress(peerId, d.id)
        // ensure session exists by processing bundle (idempotent-ish)
        await buildSessionFromBundle(lsStore, addr, b.bundle)
        const enc = await encryptToAddress(lsStore, addr, { t:'msg', text, ts, from: me.id, fromUsername: me.username })
        const packed = btoa(JSON.stringify({ type: enc.type, bodyB64: enc.bodyB64 }))
        envelopes.push({ recipientDeviceId: d.id, ciphertext: packed })
      }
      await apiPost('/messages/send', { senderDeviceId: deviceId, recipientUserId: peerId, envelopes }, token)
    }catch(ex){
      // store a local error marker
      await appendMessage(deviceId, peerId, { t:'sys', text:'[send failed] ' + ex.message, ts: now(), _ts: now() })
      await refreshChats()
    }
  }

  if (!deviceId) {
    return (
      <div className="min-h-screen">
        <TopBar />
        <div className="p-6 max-w-3xl mx-auto">
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
            <div className="font-semibold mb-2">No device selected</div>
            <div className="text-sm text-zinc-400">Go to /device and create/select a device first.</div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex flex-col">
      <TopBar />
      <div className="flex flex-1 overflow-hidden">
        {/* Left sidebar */}
        <div className="w-80 border-r border-zinc-800 bg-zinc-950 flex flex-col">
          <div className="p-3 border-b border-zinc-800">
            <div className="flex gap-2">
              <input className="flex-1 px-3 py-2 rounded bg-zinc-900 border border-zinc-800 text-sm" placeholder="Search username / id" value={search} onChange={e=>setSearch(e.target.value)} onKeyDown={(e)=>{ if(e.key==='Enter') lookupUser() }} />
              <button className="px-3 py-2 rounded bg-zinc-800 hover:bg-zinc-700 text-sm" onClick={lookupUser}>Find</button>
            </div>
            {lookupErr && <div className="text-xs text-red-400 mt-2">{lookupErr}</div>}
          </div>
          <div className="flex-1 overflow-auto">
            {chats.map(c => (
              <button key={c.peerId} onClick={()=>openChat(c.peerId)} className={`w-full text-left px-3 py-3 border-b border-zinc-900 hover:bg-zinc-900 ${activePeer?.peerId===c.peerId?'bg-zinc-900':''}`}>
                <div className="font-medium text-sm">{c.title || c.peerId}</div>
                <div className="text-xs text-zinc-500 truncate">{c.lastText || ''}</div>
              </button>
            ))}
            {chats.length===0 && (
              <div className="p-4 text-sm text-zinc-500">No chats yet. Find a user to start.</div>
            )}
          </div>
        </div>

        {/* Main chat */}
        <div className="flex-1 flex flex-col bg-zinc-950">
          <div className="h-14 border-b border-zinc-800 flex items-center px-4">
            <div className="font-semibold">{activePeer ? (activePeer.username || activePeer.peerId) : 'Select a chat'}</div>
            {activePeer && <div className="ml-3 text-xs text-zinc-500 font-mono">{activePeer.peerId}</div>}
          </div>

          <div className="flex-1 overflow-auto p-4 space-y-2">
            {!activePeer && <div className="text-sm text-zinc-500">Choose a chat on the left.</div>}
            {activePeer && messages.map((m, idx) => (
              <div key={idx} className={`flex ${m.from===me.id?'justify-end':'justify-start'}`}>
                <div className={`max-w-[70%] rounded-2xl px-3 py-2 text-sm border ${m.from===me.id?'bg-blue-600/20 border-blue-500/30':'bg-zinc-900 border-zinc-800'}`}>
                  <div>{m.text}</div>
                  <div className="text-[10px] text-zinc-400 mt-1 text-right">{new Date(m._ts||m.ts||now()).toLocaleString()}</div>
                </div>
              </div>
            ))}
          </div>

          <div className="p-3 border-t border-zinc-800">
            <div className="flex gap-2">
              <input className="flex-1 px-3 py-2 rounded bg-zinc-900 border border-zinc-800 text-sm" placeholder="Message" value={sendText} onChange={e=>setSendText(e.target.value)} onKeyDown={(e)=>{ if(e.key==='Enter') sendMessage() }} disabled={!activePeer} />
              <button className="px-4 py-2 rounded bg-blue-600 hover:bg-blue-500 text-sm font-medium disabled:opacity-50" onClick={sendMessage} disabled={!activePeer}>Send</button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
