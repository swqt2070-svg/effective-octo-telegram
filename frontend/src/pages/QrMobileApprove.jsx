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
    <div className="app-shell">
      <TopBar />
      <div className="page-wrap">
        <div className="page-title">Approve QR login</div>
        <div className="panel device-panel">
          <div className="device-status">Scan the desktop QR code or paste token:</div>
          <video ref={videoRef} className="qr-box" />
          <div className="device-actions">
            <input className="input mono" placeholder="qr token" value={qrToken} onChange={e=>setQrToken(e.target.value)} />
            <button className="btn primary" onClick={approve}>Approve</button>
          </div>
          {status && <div className="device-status">{status}</div>}
        </div>
      </div>
    </div>
  )
}
