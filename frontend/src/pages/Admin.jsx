import React, { useEffect, useState } from 'react'
import TopBar from '../components/TopBar.jsx'
import { useAuth } from '../state/auth.jsx'
import { apiGet, apiPost } from '../utils/api.js'

export default function Admin() {
  const { token, me } = useAuth()
  const [users, setUsers] = useState([])
  const [invites, setInvites] = useState([])
  const [q, setQ] = useState('')
  const [status, setStatus] = useState('')
  const [err, setErr] = useState('')
  const [inviteTTL, setInviteTTL] = useState(168)
  const [inviteUses, setInviteUses] = useState(1)

  async function load(){
    setErr('')
    try{
      const u = await apiGet(`/admin/users?q=${encodeURIComponent(q)}&status=${encodeURIComponent(status)}`, token)
      setUsers(u.users)
      const i = await apiGet('/admin/invites', token)
      setInvites(i.invites)
    }catch(ex){
      setErr(ex.message)
    }
  }

  useEffect(() => { if (me?.role === 'ADMIN') load().catch(()=>{}) }, [me?.role])

  if (me?.role !== 'ADMIN') {
    return (
      <div className="min-h-screen">
        <TopBar />
        <div className="p-6 max-w-3xl mx-auto">
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">Admin only.</div>
        </div>
      </div>
    )
  }

  async function setUserStatus(id, st){
    await apiPost(`/admin/users/${id}/status`, { status: st }, token)
    await load()
  }

  async function changePassword(id){
    const np = prompt('New password (min 8 chars):')
    if (!np) return
    await apiPost(`/admin/users/${id}/password`, { newPassword: np }, token)
    alert('Password changed')
  }

  async function createInvite(){
    await apiPost('/admin/invites', { ttlHours: Number(inviteTTL), maxUses: Number(inviteUses) }, token)
    await load()
  }

  return (
    <div className="min-h-screen">
      <TopBar />
      <div className="max-w-6xl mx-auto p-6 space-y-4">
        <div className="text-xl font-semibold">Admin panel</div>
        {err && <div className="text-sm text-red-400">{err}</div>}

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
            <div className="font-medium mb-3">Users</div>
            <div className="flex gap-2 mb-3">
              <input className="flex-1 px-3 py-2 rounded bg-zinc-950 border border-zinc-800 text-sm" placeholder="filter by username/id" value={q} onChange={e=>setQ(e.target.value)} />
              <select className="px-3 py-2 rounded bg-zinc-950 border border-zinc-800 text-sm" value={status} onChange={e=>setStatus(e.target.value)}>
                <option value="">All</option>
                <option value="ACTIVE">ACTIVE</option>
                <option value="FROZEN">FROZEN</option>
                <option value="BLOCKED">BLOCKED</option>
              </select>
              <button className="px-3 py-2 rounded bg-zinc-800 hover:bg-zinc-700 text-sm" onClick={load}>Refresh</button>
            </div>

            <div className="max-h-[520px] overflow-auto border border-zinc-800 rounded-lg">
              <table className="w-full text-sm">
                <thead className="bg-zinc-950 sticky top-0">
                  <tr className="text-left">
                    <th className="p-2">User</th>
                    <th className="p-2">Role</th>
                    <th className="p-2">Status</th>
                    <th className="p-2">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {users.map(u => (
                    <tr key={u.id} className="border-t border-zinc-800">
                      <td className="p-2">
                        <div className="font-medium">{u.username}</div>
                        <div className="text-xs text-zinc-500 font-mono">{u.id}</div>
                      </td>
                      <td className="p-2">{u.role}</td>
                      <td className="p-2">{u.status}</td>
                      <td className="p-2 space-x-2">
                        <button className="px-2 py-1 rounded bg-zinc-800 hover:bg-zinc-700" onClick={()=>changePassword(u.id)}>Pwd</button>
                        <button className="px-2 py-1 rounded bg-zinc-800 hover:bg-zinc-700" onClick={()=>setUserStatus(u.id,'ACTIVE')}>Active</button>
                        <button className="px-2 py-1 rounded bg-zinc-800 hover:bg-zinc-700" onClick={()=>setUserStatus(u.id,'FROZEN')}>Freeze</button>
                        <button className="px-2 py-1 rounded bg-zinc-800 hover:bg-zinc-700" onClick={()=>setUserStatus(u.id,'BLOCKED')}>Block</button>
                      </td>
                    </tr>
                  ))}
                  {users.length===0 && <tr><td className="p-3 text-zinc-500" colSpan={4}>No users.</td></tr>}
                </tbody>
              </table>
            </div>
          </div>

          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
            <div className="font-medium mb-3">Invite codes</div>
            <div className="flex gap-2 mb-3 items-center">
              <input className="w-28 px-3 py-2 rounded bg-zinc-950 border border-zinc-800 text-sm" type="number" value={inviteTTL} onChange={e=>setInviteTTL(e.target.value)} />
              <div className="text-sm text-zinc-400">hours</div>
              <input className="w-24 px-3 py-2 rounded bg-zinc-950 border border-zinc-800 text-sm" type="number" value={inviteUses} onChange={e=>setInviteUses(e.target.value)} />
              <div className="text-sm text-zinc-400">uses</div>
              <button className="ml-auto px-3 py-2 rounded bg-blue-600 hover:bg-blue-500 text-sm font-medium" onClick={createInvite}>Create</button>
            </div>

            <div className="max-h-[520px] overflow-auto border border-zinc-800 rounded-lg">
              <table className="w-full text-sm">
                <thead className="bg-zinc-950 sticky top-0">
                  <tr className="text-left">
                    <th className="p-2">Code</th>
                    <th className="p-2">Uses</th>
                    <th className="p-2">Expires</th>
                  </tr>
                </thead>
                <tbody>
                  {invites.map(i => (
                    <tr key={i.code} className="border-t border-zinc-800">
                      <td className="p-2 font-mono">{i.code}</td>
                      <td className="p-2">{i.uses}/{i.maxUses}</td>
                      <td className="p-2">{new Date(i.expiresAt).toLocaleString()}</td>
                    </tr>
                  ))}
                  {invites.length===0 && <tr><td className="p-3 text-zinc-500" colSpan={3}>No invites yet.</td></tr>}
                </tbody>
              </table>
            </div>

          </div>
        </div>

      </div>
    </div>
  )
}
