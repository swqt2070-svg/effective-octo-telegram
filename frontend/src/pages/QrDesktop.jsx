import React, { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { apiPost, apiGet } from '../utils/api.js'
import { useAuth } from '../state/auth.jsx'
import QRCode from 'qrcode'
import { ensureDeviceSetup } from '../utils/deviceSetup.js'

export default function QrDesktop() {
  const nav = useNavigate()
  const { setToken } = useAuth()
  const [qrToken, setQrToken] = useState('')
  const [qrDataUrl, setQrDataUrl] = useState('')
  const [status, setStatus] = useState('')

  async function start(){
    setStatus('Requesting QR token...')
    const r = await apiPost('/auth/qr/request-login', {})
    setQrToken(r.qrToken)
  }

  useEffect(() => { start().catch(()=>{}) }, [])

  useEffect(() => {
    if (!qrToken) return
    const url = `${location.origin}/qr/approve#${qrToken}`
    QRCode.toDataURL(url, { margin: 2, scale: 6 }).then(setQrDataUrl)
    setStatus('Scan QR with your logged-in phone and approve.')
  }, [qrToken])

  useEffect(() => {
    if (!qrToken) return
    let t
    async function poll(){
      try{
        const r = await apiGet(`/auth/qr/status?qrToken=${encodeURIComponent(qrToken)}`)
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
  }, [qrToken])

  return (
    <div className="auth-shell">
      <div className="auth-card center">
        <div className="auth-head">
          <div className="auth-title">QR login</div>
          <div className="auth-sub">{status}</div>
        </div>
        {qrDataUrl ? (
          <img src={qrDataUrl} className="qr-box" alt="QR" />
        ) : (
          <div className="qr-box placeholder">Generating...</div>
        )}
        <div className="qr-meta">
          Token: <span className="mono">{qrToken}</span>
        </div>
        <div className="auth-links">
          <a href="/login">Login by password</a>
        </div>
      </div>
      <div className="auth-side">
        <div className="side-blurb">
          <div className="side-title">Scan & approve</div>
          <div className="side-text">Open the app on your phone, scan the QR, and approve the sign-in.</div>
        </div>
      </div>
    </div>
  )
}