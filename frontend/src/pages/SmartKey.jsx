import React, { useEffect, useState } from 'react'
import TopBar from '../components/TopBar.jsx'
import { apiGet, apiPost } from '../utils/api.js'
import { useAuth } from '../state/auth.jsx'
import QRCode from 'qrcode'

export default function SmartKey() {
  const { token } = useAuth()
  const [bindToken, setBindToken] = useState('')
  const [bindQr, setBindQr] = useState('')
  const [status, setStatus] = useState('')
  const [keys, setKeys] = useState([])

  async function loadKeys() {
    const r = await apiGet('/auth/smartkey/list', token)
    setKeys(r.keys || [])
  }

  async function requestBind() {
    setStatus('Requesting bind token...')
    const r = await apiPost('/auth/smartkey/bind-request', {}, token)
    setBindToken(r.token)
  }

  async function revoke(id) {
    await apiPost('/auth/smartkey/revoke', { id }, token)
    await loadKeys()
  }

  useEffect(() => { if (token) loadKeys().catch(()=>{}) }, [token])

  useEffect(() => {
    if (!bindToken) return
    const url = `${location.origin}/smartkey/bind#${bindToken}`
    QRCode.toDataURL(url, { margin: 2, scale: 6 }).then(setBindQr)
    setStatus('Scan QR on your phone to bind this device as a smart key.')
  }, [bindToken])

  return (
    <div className="app-shell">
      <TopBar />
      <div className="page-wrap">
        <div className="page-title">Smart key</div>

        <div className="panel device-panel">
          <div className="panel-title">Bind a phone</div>
          <div className="page-note">Open this page on your desktop, scan the QR on your phone to bind it as a smart key.</div>
          {bindQr ? (
            <img src={bindQr} className="qr-box" alt="Bind QR" />
          ) : (
            <div className="qr-box placeholder">QR not generated</div>
          )}
          <div className="device-actions">
            <button className="btn primary" onClick={requestBind}>Generate QR</button>
            <button className="btn ghost" onClick={loadKeys}>Refresh list</button>
          </div>
          {status && <div className="device-status">{status}</div>}
        </div>

        <div className="panel device-panel">
          <div className="panel-title">Bound keys</div>
          <div className="device-list">
            {keys.map(k => (
              <div key={k.id} className="device-item">
                <div>
                  <div className="device-name">{k.deviceName || 'Smart key'}</div>
                  <div className="mono">{k.id}</div>
                  <div className="device-status">Last used: {k.lastUsedAt ? new Date(k.lastUsedAt).toLocaleString() : 'never'}</div>
                </div>
                <button className="btn ghost" onClick={() => revoke(k.id)}>Revoke</button>
              </div>
            ))}
            {keys.length === 0 && <div className="empty-state">No smart keys bound yet.</div>}
          </div>
        </div>
      </div>
    </div>
  )
}
