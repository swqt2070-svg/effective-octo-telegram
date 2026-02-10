const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001'

export async function apiGet(path, token) {
  const r = await fetch(API_URL + path, {
    headers: token ? { Authorization: 'Bearer ' + token } : {},
  })
  const j = await r.json().catch(() => ({}))
  if (!r.ok) throw new Error(j.error || 'request_failed')
  return j
}

export async function apiPost(path, body, token) {
  const r = await fetch(API_URL + path, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: 'Bearer ' + token } : {}),
    },
    body: JSON.stringify(body || {}),
  })
  const j = await r.json().catch(() => ({}))
  if (!r.ok) throw new Error(j.error || 'request_failed')
  return j
}

export { API_URL }
