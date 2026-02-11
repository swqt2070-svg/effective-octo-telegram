import React, { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { apiPost, apiGet } from '../utils/api.js'
import { useAuth } from '../state/auth.jsx'
import QRCode from 'qrcode'
import { ensureDeviceSetup } from '../utils/deviceSetup.js'

export default function SmartKeyLogin() {
  const nav = useNavigate()
  const { setToken } = useAuth()
  const [loginToken, setLoginToken] = useState('')
  const [qrDataUrl, setQrDataUrl] = useState('')
  const [status, setStatus] = useState('')

  async function start(){
    setStatus('Requesting smart key login...')
    const r = await apiPost('/auth/smartkey/login-request', {})
    setLoginToken(r.token)
  }

  useEffect(() => { start().catch(()=>{}) }, [])

  useEffect(() => {
    if (!loginToken) return
    const url = `${location.origin}/smartkey/approve#${loginToken}`
    QRCode.toDataURL(url, { margin: 2, scale: 6 }).then(setQrDataUrl)
    setStatus('Scan QR with your bound phone.')
  }, [loginToken])

  useEffect(() => {
    if (!loginToken) return
    let t
    async function poll(){
      try{
        const r = await apiGet(`/auth/smartkey/status?token=${encodeURIComponent(loginToken)}`)
        if (r.status === 'APPROVED' && r.token) {
          setToken(r.token)
          const me = await apiGet('/me', r.token)
          await ensureDeviceSetup(r.token, me)
          nav('/chat')
          return
        }
        if (r.status === 'EXPIRED') {
          setStatus('Expired. Reload page.')
          return
        }
      }catch{}
      t = setTimeout(poll, 1200)
    }
    poll()
    return () => { if (t) clearTimeout(t) }
  }, [loginToken])

  return (
    <div className="auth-shell">
      <div className="auth-card center">
        <div className="auth-head">
          <div className="auth-title">Smart key login</div>
          <div className="auth-sub">{status}</div>
        </div>
        {qrDataUrl ? (
          <img src={qrDataUrl} className="qr-box" alt="QR" />
        ) : (
          <div className="qr-box placeholder">Generating...</div>
        )}
        <div className="qr-meta">
          Token: <span className="mono">{loginToken}</span>
        </div>
        <div className="auth-links">
          <a href="/login">Login by password</a>
        </div>
      </div>
      <div className="auth-side">
        <div className="side-blurb">
          <div className="side-title">Approve with phone</div>
          <div className="side-text">Open the smart key page on your phone and scan the QR.</div>
        </div>
      </div>
    </div>
  )
}
