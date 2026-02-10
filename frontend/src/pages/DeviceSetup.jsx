import React, { useEffect, useState } from 'react'
import TopBar from '../components/TopBar.jsx'
import { useAuth } from '../state/auth.jsx'
import { apiGet, apiPost } from '../utils/api.js'
import { getLocal, setLocal } from '../utils/local.js'
import { newStoreForDevice, ensureLocalIdentity, generatePreKeys, generateSignedPreKey, makeLibSignalStore, b64PublicKey } from '../signal/signal.js'

export default function DeviceSetup() {
  const { token, me } = useAuth()
  const [deviceId, setDeviceId] = useState(getLocal('deviceId') || '')
  const [deviceName, setDeviceName] = useState(getLocal('deviceName') || '')
  const [status, setStatus] = useState('')
  const [err, setErr] = useState('')
  const [devices, setDevices] = useState([])

  async function refresh(){
    const r = await apiGet('/devices', token)
    setDevices(r.devices)
  }

  useEffect(() => { if (token) refresh().catch(()=>{}) }, [token])

  async function createDevice(){
    setErr(''); setStatus('Creating device...')
    try{
      const name = deviceName || `Device-${Math.floor(Math.random()*1000)}`
      const r = await apiPost('/devices', { name }, token)
      setDeviceId(r.device.id)
      setLocal('deviceId', r.device.id)
      setLocal('deviceName', name)
      setStatus('Device created. Generating keys...')
      await uploadKeys(r.device.id)
      setStatus('Ready.')
      await refresh()
    }catch(ex){
      setErr(ex.message); setStatus('')
    }
  }

  async function uploadKeys(did){
    const store = newStoreForDevice(me.id, did)
    const { identityKey, registrationId } = await ensureLocalIdentity(store)
    const signedId = (await store.get('signedPreKeyId')) || 1
    const spk = await generateSignedPreKey(store, signedId)
    const counter = (await store.get('preKeyIdCounter')) || 1
    const pks = await generatePreKeys(store, counter, 50)

    // upload public materials
    const body = {
      registrationId,
      identityKeyPub: b64PublicKey(identityKey.pubKey),
      signedPreKey: { id: spk.id, pubKey: b64PublicKey(spk.keyPair.pubKey), signature: btoa(String.fromCharCode(...new Uint8Array(spk.signature))) },
      oneTimePreKeys: pks.map(pk => ({ id: pk.id, pubKey: b64PublicKey(pk.keyPair.pubKey) })),
    }
    await apiPost(`/devices/${did}/keys`, body, token)
    // ensure libsignal store has required methods initialized
    makeLibSignalStore(store)
  }

  async function selectDevice(id){
    setLocal('deviceId', id)
    setDeviceId(id)
    setStatus('Selected device.')
  }

  return (
    <div className="min-h-screen">
      <TopBar />
      <div className="max-w-4xl mx-auto p-6 space-y-4">
        <div className="text-xl font-semibold">Device setup</div>

        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 space-y-3">
          <div className="text-sm text-zinc-300">Current device: <span className="font-mono">{deviceId || '(none)'}</span></div>
          <div className="flex gap-2">
            <input className="flex-1 px-3 py-2 rounded bg-zinc-950 border border-zinc-800" placeholder="device name" value={deviceName} onChange={e=>setDeviceName(e.target.value)} />
            <button className="px-3 py-2 rounded bg-blue-600 hover:bg-blue-500" onClick={createDevice}>Create & init</button>
          </div>
          {status && <div className="text-sm text-zinc-300">{status}</div>}
          {err && <div className="text-sm text-red-400">{err}</div>}
        </div>

        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
          <div className="font-medium mb-2">Your devices</div>
          <div className="space-y-2">
            {devices.map(d => (
              <div key={d.id} className="flex items-center justify-between border border-zinc-800 rounded-lg px-3 py-2 bg-zinc-950">
                <div>
                  <div className="font-medium">{d.name}</div>
                  <div className="text-xs text-zinc-500 font-mono">{d.id}</div>
                </div>
                <button className="px-3 py-1.5 rounded bg-zinc-800 hover:bg-zinc-700" onClick={() => selectDevice(d.id)}>Use</button>
              </div>
            ))}
            {devices.length === 0 && <div className="text-sm text-zinc-500">No devices yet. Create one above.</div>}
          </div>
        </div>

        <div className="text-sm text-zinc-500">
          After selecting a device, go to <a className="text-blue-400 hover:underline" href="/chat">/chat</a>.
        </div>
      </div>
    </div>
  )
}
