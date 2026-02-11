import React, { useEffect, useState } from 'react'
import TopBar from '../components/TopBar.jsx'
import { useAuth } from '../state/auth.jsx'
import { apiPatch, apiPost } from '../utils/api.js'

export default function Settings() {
  const { me, refreshMe, token } = useAuth()
  const [username, setUsername] = useState(me?.username || '')
  const [displayName, setDisplayName] = useState(me?.displayName || '')
  const [oldPassword, setOldPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [status, setStatus] = useState('')
  const [err, setErr] = useState('')

  useEffect(() => {
    if (!me) return
    setUsername(me.username || '')
    setDisplayName(me.displayName || '')
  }, [me?.id])

  async function saveProfile() {
    setErr(''); setStatus('Saving...')
    try {
      await apiPatch('/users/me', { username, displayName }, token)
      await refreshMe()
      setStatus('Profile updated.')
    } catch (ex) {
      setErr(ex.message); setStatus('')
    }
  }

  async function changePassword() {
    setErr(''); setStatus('Updating password...')
    try {
      await apiPost('/auth/change-password', { oldPassword, newPassword }, token)
      setOldPassword(''); setNewPassword('')
      setStatus('Password updated.')
    } catch (ex) {
      setErr(ex.message); setStatus('')
    }
  }

  return (
    <div className="app-shell">
      <TopBar />
      <div className="page-wrap">
        <div className="page-title">Settings</div>

        <div className="panel device-panel">
          <div className="panel-title">Profile</div>
          <div className="auth-form">
            <label className="field">
              <span>Username</span>
              <input className="input" value={username} onChange={e => setUsername(e.target.value)} />
            </label>
            <label className="field">
              <span>Display name</span>
              <input className="input" value={displayName} onChange={e => setDisplayName(e.target.value)} />
            </label>
            <button className="btn primary" onClick={saveProfile}>Save</button>
          </div>
        </div>

        <div className="panel device-panel">
          <div className="panel-title">Password</div>
          <div className="auth-form">
            <label className="field">
              <span>Old password</span>
              <input className="input" type="password" value={oldPassword} onChange={e => setOldPassword(e.target.value)} />
            </label>
            <label className="field">
              <span>New password</span>
              <input className="input" type="password" value={newPassword} onChange={e => setNewPassword(e.target.value)} />
            </label>
            <button className="btn primary" onClick={changePassword}>Update password</button>
          </div>
        </div>

        <div className="panel device-panel">
          <div className="panel-title">Smart key</div>
          <div className="page-note">Bind your phone and approve logins with QR.</div>
          <div className="device-actions">
            <a className="btn primary" href="/smartkey">Open smart key</a>
          </div>
        </div>

        {status && <div className="page-note">{status}</div>}
        {err && <div className="inline-error">{err}</div>}
      </div>
    </div>
  )
}
