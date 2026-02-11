import React from 'react'
import { useAuth } from '../state/auth.jsx'

export default function TopBar() {
  const { me, logout } = useAuth()
  const initial = me?.username ? me.username.slice(0, 1).toUpperCase() : 'U'
  const avatarUrl = me?.avatarUrl || ''
  return (
    <div className="topbar">
      <div className="brand">
        <span className="brand-mark" />
        <span className="brand-title">Local Messenger</span>
      </div>
      <div className="topbar-actions">
        {me && (
          <div className="user-chip">
            {avatarUrl ? (
              <img className="avatar-img avatar-sm" src={avatarUrl} alt="avatar" />
            ) : (
              <div className="avatar-sm">{initial}</div>
            )}
            <div className="user-meta">
              <div className="user-name">{me.username}</div>
              <div className="user-role">{me.role === 'ADMIN' ? 'Admin' : 'User'}</div>
            </div>
          </div>
        )}
        {me?.role === 'ADMIN' && (
          <a className="btn ghost" href="/admin">Admin</a>
        )}
        <button className="btn ghost" onClick={() => { logout(); location.href = '/login' }}>Logout</button>
      </div>
    </div>
  )
}
