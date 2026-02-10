import React from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../state/auth.jsx'

export default function TopBar() {
  const { me, logout } = useAuth()
  const nav = useNavigate()
  return (
    <div className="h-12 px-4 border-b border-zinc-800 flex items-center justify-between bg-zinc-950">
      <div className="font-semibold tracking-tight">Local Messenger</div>
      <div className="flex items-center gap-3 text-sm">
        {me && <div className="text-zinc-300">{me.username}{me.role === 'ADMIN' ? ' (admin)' : ''}</div>}
        {me?.role === 'ADMIN' && (
          <button className="px-2 py-1 rounded bg-zinc-800 hover:bg-zinc-700" onClick={() => nav('/admin')}>Admin</button>
        )}
        <button className="px-2 py-1 rounded bg-zinc-800 hover:bg-zinc-700" onClick={() => nav('/device')}>Device</button>
        <button className="px-2 py-1 rounded bg-zinc-800 hover:bg-zinc-700" onClick={() => { logout(); nav('/login') }}>Logout</button>
      </div>
    </div>
  )
}
