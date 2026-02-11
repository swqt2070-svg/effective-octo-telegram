import React, { useEffect, useState } from 'react'
import TopBar from '../components/TopBar.jsx'
import { listNotifications, clearNotifications, removeNotification } from '../utils/notificationsStore.js'

export default function Notifications() {
  const [items, setItems] = useState([])

  async function load() {
    const list = await listNotifications()
    setItems(list)
  }

  useEffect(() => { load().catch(()=>{}) }, [])

  async function clearAll() {
    await clearNotifications()
    setItems([])
  }

  async function dismiss(id) {
    const list = await removeNotification(id)
    setItems(list)
  }

  return (
    <div className="app-shell">
      <TopBar />
      <div className="page-wrap">
        <div className="page-title">Notifications</div>
        <div className="panel device-panel">
          <div className="device-actions">
            <button className="btn ghost" onClick={load}>Refresh</button>
            <button className="btn primary" onClick={clearAll}>Clear all</button>
          </div>
        </div>
        <div className="panel device-panel">
          <div className="panel-title">Recent</div>
          <div className="device-list">
            {items.map(n => (
              <div key={n.id} className="device-item">
                <div>
                  <div className="device-name">{n.text}</div>
                  <div className="device-status">{new Date(n.ts).toLocaleString()}</div>
                  <div className="mono">{n.peerId}</div>
                </div>
                <button className="btn ghost" onClick={() => dismiss(n.id)}>Dismiss</button>
              </div>
            ))}
            {items.length === 0 && <div className="empty-state">No notifications.</div>}
          </div>
        </div>
      </div>
    </div>
  )
}
