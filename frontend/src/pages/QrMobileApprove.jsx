import React, { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import TopBar from '../components/TopBar.jsx'
import { apiPost } from '../utils/api.js'
import { useAuth } from '../state/auth.jsx'
import QrScanner from 'qr-scanner'
QrScanner.WORKER_PATH = new URL('qr-scanner/qr-scanner-worker.min.js', import.meta.url).toString()

export default function QrMobileApprove() {
  const { token } = useAuth()
  const nav = useNavigate()
  const [qrToken, setQrToken] = useState('')
  const [status, setStatus] = useState('')
  const videoRef = useRef(null)
  const scannerRef = useRef(null)

  useEffect(() => {
    const fromHash = (location.hash || '').replace('#','').trim()
    if (fromHash) setQrToken(fromHash)
  }, [])

  useEffect(() => {
    if (!videoRef.current) return
    const scanner = new QrScanner(videoRef.current, (result) => {
      try{
        const txt = result?.data || ''
        const hash = txt.includes('#') ? txt.split('#').pop() : ''
        if (hash) setQrToken(hash)
      }catch{}
    }, { highlightScanRegion: true })
    scannerRef.current = scanner
    scanner.start().catch(()=>{})
    return () => { scanner.stop(); scanner.destroy(); }
  }, [])

  async function approve(){
    if (!qrToken) return
    setStatus('Approving...')
    try{
      await apiPost('/auth/qr/approve', { qrToken }, token)
      setStatus('Approved. You can close this and the desktop will log in.')
      setTimeout(() => nav('/chat'), 1200)
    }catch(ex){
      setStatus('Error: ' + ex.message)
    }
  }

  return (
    <div className="min-h-screen">
      <TopBar />
      <div className="max-w-2xl mx-auto p-6 space-y-4">
        <div className="text-xl font-semibold">Approve QR login</div>
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 space-y-3">
          <div className="text-sm text-zinc-400">Scan the desktop QR code or paste token:</div>
          <video ref={videoRef} className="w-full rounded-lg border border-zinc-800 bg-black" />
          <div className="flex gap-2">
            <input className="flex-1 px-3 py-2 rounded bg-zinc-950 border border-zinc-800 text-sm font-mono" placeholder="qr token" value={qrToken} onChange={e=>setQrToken(e.target.value)} />
            <button className="px-3 py-2 rounded bg-blue-600 hover:bg-blue-500 text-sm font-medium" onClick={approve}>Approve</button>
          </div>
          {status && <div className="text-sm text-zinc-300">{status}</div>}
        </div>
      </div>
    </div>
  )
}
