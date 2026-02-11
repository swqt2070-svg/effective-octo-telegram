import React, { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { apiGet, apiPost } from '../utils/api.js'
import { useAuth } from '../state/auth.jsx'
import { ensureDeviceSetup } from '../utils/deviceSetup.js'

export default function Register() {
  const nav = useNavigate()
  const { setToken } = useAuth()
  const [username, setUsername] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [password, setPassword] = useState('')
  const [inviteCode, setInviteCode] = useState('')
  const [err, setErr] = useState('')

  async function onSubmit(e){
    e.preventDefault()
    setErr('')
    try{
      const body = { username, password, displayName: displayName || undefined, inviteCode: inviteCode || undefined }
      const r = await apiPost('/auth/register', body)
      setToken(r.token)
      const me = await apiGet('/me', r.token)
      await ensureDeviceSetup(r.token, me)
      nav('/chat')
    }catch(ex){
      setErr(ex.message)
    }
  }

  return (
    <div className="auth-shell">
      <div className="auth-card">
        <div className="auth-head">
          <div className="auth-title">Create account</div>
          <div className="auth-sub">Start a secure workspace in under a minute.</div>
        </div>
        <form onSubmit={onSubmit} className="auth-form">
          <label className="field">
            <span>Username</span>
            <input className="input" placeholder="milon356" value={username} onChange={e=>setUsername(e.target.value)} />
          </label>
          <label className="field">
            <span>Display name</span>
            <input className="input" placeholder="Milon (optional)" value={displayName} onChange={e=>setDisplayName(e.target.value)} />
          </label>
          <label className="field">
            <span>Password</span>
            <input className="input" placeholder="Minimum 8 characters" type="password" value={password} onChange={e=>setPassword(e.target.value)} />
          </label>
          <label className="field">
            <span>Invite code</span>
            <input className="input" placeholder="Invite code" value={inviteCode} onChange={e=>setInviteCode(e.target.value)} />
          </label>
          {err && <div className="inline-error">{err}</div>}
          <button className="btn primary full">Create account</button>
        </form>
        <div className="auth-links">
          <Link to="/login">Back to login</Link>
        </div>
      </div>
      <div className="auth-side">
        <div className="side-blurb">
          <div className="side-title">Private by default</div>
          <div className="side-text">Each device generates its own keys. The server only routes encrypted envelopes.</div>
        </div>
      </div>
    </div>
  )
}
