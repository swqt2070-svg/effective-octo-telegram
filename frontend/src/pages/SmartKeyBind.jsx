import React, { useEffect, useState } from 'react'
import { apiPost } from '../utils/api.js'
import { getLocal, setLocal } from '../utils/local.js'
import { bytesToB64, randomBytes, sha256Hex } from '../utils/crypto.js'

function guessDeviceName() {
  const platform = typeof navigator !== 'undefined' ? (navigator.platform || 'Web') : 'Web'
  const ua = typeof navigator !== 'undefined' ? navigator.userAgent : ''
  const tag = ua.includes('Mobile') ? 'Phone' : 'Desktop'
  return `${tag}-${platform}`.slice(0, 32)
}

export default function SmartKeyBind() {
  const [token, setToken] = useState('')
  const [deviceName, setDeviceName] = useState(guessDeviceName())
  const [status, setStatus] = useState('')

  useEffect(() => {
    const fromHash = (location.hash || '').replace('#','').trim()
    if (fromHash) setToken(fromHash)
  }, [])

  async function ensureSecret() {
    let secret = getLocal('smartKeySecret') || ''
    if (!secret) {
      secret = bytesToB64(randomBytes(32))
      setLocal('smartKeySecret', secret)
    }
    return secret
  }

  async function bind() {
    if (!token) return
    setStatus('Binding...')
    try{
      const secret = await ensureSecret()
      const secretHash = await sha256Hex(secret)
      await apiPost('/auth/smartkey/bind', { token, secretHash, deviceName })
      setStatus('Bound. You can now use smart key login.')
    }catch(ex){
      setStatus('Error: ' + ex.message)
    }
  }

  return (
    <div className="auth-shell">
      <div className="auth-card">
        <div className="auth-head">
          <div className="auth-title">Bind smart key</div>
          <div className="auth-sub">Scan the QR on your desktop, then bind this phone.</div>
        </div>
        <div className="auth-form">
          <label className="field">
            <span>Bind token</span>
            <input className="input mono" placeholder="token" value={token} onChange={e=>setToken(e.target.value)} />
          </label>
          <label className="field">
            <span>Device name</span>
            <input className="input" placeholder="My phone" value={deviceName} onChange={e=>setDeviceName(e.target.value)} />
          </label>
          <button className="btn primary full" onClick={bind}>Bind device</button>
          {status && <div className="page-note">{status}</div>}
        </div>
      </div>
      <div className="auth-side">
        <div className="side-blurb">
          <div className="side-title">Smart key</div>
          <div className="side-text">Once bound, you can approve logins by scanning QR codes.</div>
        </div>
      </div>
    </div>
  )
}
