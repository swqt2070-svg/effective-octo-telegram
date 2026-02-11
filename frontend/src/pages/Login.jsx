import React, { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { apiGet, apiPost } from '../utils/api.js'
import { useAuth } from '../state/auth.jsx'
import { ensureDeviceSetup } from '../utils/deviceSetup.js'

export default function Login() {
  const nav = useNavigate()
  const { setToken } = useAuth()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [err, setErr] = useState('')

  async function onSubmit(e){
    e.preventDefault()
    setErr('')
    try{
      const r = await apiPost('/auth/login', { username, password })
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
          <div className="auth-title">Welcome back</div>
          <div className="auth-sub">Sign in to continue to Local Messenger</div>
        </div>
        <form onSubmit={onSubmit} className="auth-form">
          <label className="field">
            <span>Username</span>
            <input className="input" placeholder="milon356" value={username} onChange={e=>setUsername(e.target.value)} />
          </label>
          <label className="field">
            <span>Password</span>
            <input className="input" placeholder="********" type="password" value={password} onChange={e=>setPassword(e.target.value)} />
          </label>
          {err && <div className="inline-error">{err}</div>}
          <button className="btn primary full">Login</button>
        </form>
        <div className="auth-links">
          <Link to="/register">Create account</Link>
          <Link to="/qr">QR login</Link>
          <Link to="/smartkey/login">Smart key login</Link>
        </div>
      </div>
      <div className="auth-side">
        <div className="side-blurb">
          <div className="side-title">A calmer workspace</div>
          <div className="side-text">Your conversations stay secure, fast, and focused. We handle the encryption in the background.</div>
        </div>
      </div>
    </div>
  )
}
