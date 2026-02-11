import React, { useEffect, useState } from 'react'
import { apiPost } from '../utils/api.js'
import { getLocal } from '../utils/local.js'
import { sha256Hex } from '../utils/crypto.js'

export default function SmartKeyApprove() {
  const [token, setToken] = useState('')
  const [status, setStatus] = useState('')

  useEffect(() => {
    const fromHash = (location.hash || '').replace('#','').trim()
    if (fromHash) setToken(fromHash)
  }, [])

  async function approve() {
    if (!token) return
    const secret = getLocal('smartKeySecret') || ''
    if (!secret) {
      setStatus('No smart key on this device. Bind it first.')
      return
    }
    setStatus('Approving...')
    try{
      const secretHash = await sha256Hex(secret)
      await apiPost('/auth/smartkey/approve', { token, secretHash })
      setStatus('Approved. You can close this.')
    }catch(ex){
      setStatus('Error: ' + ex.message)
    }
  }

  return (
    <div className="auth-shell">
      <div className="auth-card center">
        <div className="auth-head">
          <div className="auth-title">Approve login</div>
          <div className="auth-sub">Scan QR from desktop to approve.</div>
        </div>
        <div className="auth-form">
          <label className="field">
            <span>Login token</span>
            <input className="input mono" placeholder="token" value={token} onChange={e=>setToken(e.target.value)} />
          </label>
          <button className="btn primary full" onClick={approve}>Approve</button>
          {status && <div className="page-note">{status}</div>}
        </div>
      </div>
      <div className="auth-side">
        <div className="side-blurb">
          <div className="side-title">Smart key</div>
          <div className="side-text">If this phone is bound, approval is instant.</div>
        </div>
      </div>
    </div>
  )
}
