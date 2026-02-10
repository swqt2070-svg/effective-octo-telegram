import React, { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { apiPost } from '../utils/api.js'
import { useAuth } from '../state/auth.jsx'

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
      nav('/device')
    }catch(ex){
      setErr(ex.message)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-6">
      <div className="w-full max-w-md bg-zinc-900 border border-zinc-800 rounded-xl p-6">
        <div className="text-xl font-semibold mb-4">Login</div>
        <form onSubmit={onSubmit} className="space-y-3">
          <input className="w-full px-3 py-2 rounded bg-zinc-950 border border-zinc-800" placeholder="username" value={username} onChange={e=>setUsername(e.target.value)} />
          <input className="w-full px-3 py-2 rounded bg-zinc-950 border border-zinc-800" placeholder="password" type="password" value={password} onChange={e=>setPassword(e.target.value)} />
          {err && <div className="text-red-400 text-sm">{err}</div>}
          <button className="w-full py-2 rounded bg-blue-600 hover:bg-blue-500 font-medium">Login</button>
        </form>
        <div className="mt-4 text-sm text-zinc-400 flex justify-between">
          <Link className="hover:underline" to="/register">Register</Link>
          <Link className="hover:underline" to="/qr">QR login</Link>
        </div>
      </div>
    </div>
  )
}
