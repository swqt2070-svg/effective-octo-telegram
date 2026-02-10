import React, { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { apiPost, apiGet } from '../utils/api.js'
import { useAuth } from '../state/auth.jsx'
import QRCode from 'qrcode'

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
          nav('/device')
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
    <div className="min-h-screen flex items-center justify-center p-6">
      <div className="w-full max-w-md bg-zinc-900 border border-zinc-800 rounded-xl p-6 text-center">
        <div className="text-xl font-semibold mb-2">QR login</div>
        <div className="text-sm text-zinc-400 mb-4">{status}</div>
        {qrDataUrl ? (
          <img src={qrDataUrl} className="mx-auto rounded-lg border border-zinc-800" alt="QR" />
        ) : (
          <div className="h-64 flex items-center justify-center text-zinc-500">Generating…</div>
        )}
        <div className="mt-4 text-xs text-zinc-500 break-all">
          QR token: <span className="font-mono">{qrToken}</span>
        </div>
        <div className="mt-4 text-sm text-zinc-400">
          Or <a className="text-blue-400 hover:underline" href="/login">login by password</a>.
        </div>
      </div>
    </div>
  )
}
