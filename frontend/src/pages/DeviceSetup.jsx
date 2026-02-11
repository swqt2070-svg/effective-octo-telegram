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
    <div className="app-shell">
      <TopBar />
      <div className="page-wrap">
        <div className="page-title">Device setup</div>

        <div className="panel device-panel">
          <div className="device-row">
            <div className="device-label">Current device</div>
            <div className="mono">{deviceId || '(none)'}</div>
          </div>
          <div className="device-actions">
            <input className="input" placeholder="Device name" value={deviceName} onChange={e=>setDeviceName(e.target.value)} />
            <button className="btn primary" onClick={createDevice}>Create & init</button>
          </div>
          {status && <div className="device-status">{status}</div>}
          {err && <div className="inline-error">{err}</div>}
        </div>

        <div className="panel device-panel">
          <div className="panel-title">Your devices</div>
          <div className="device-list">
            {devices.map(d => (
              <div key={d.id} className="device-item">
                <div>
                  <div className="device-name">{d.name}</div>
                  <div className="mono">{d.id}</div>
                </div>
                <button className="btn ghost" onClick={() => selectDevice(d.id)}>Use</button>
              </div>
            ))}
            {devices.length === 0 && <div className="empty-state">No devices yet. Create one above.</div>}
          </div>
        </div>

        <div className="page-note">
          Device setup is automatic now. Use this page only if you want to reset or switch devices.
        </div>
      </div>
    </div>
  )
}
