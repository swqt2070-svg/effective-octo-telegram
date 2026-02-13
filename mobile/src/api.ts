import { API_URL } from './config'

export async function apiGet(path: string, token?: string) {
  const res = await fetch(API_URL + path, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  })
  const json = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(json.error || 'request_failed')
  return json
}

export async function apiPost(path: string, body?: unknown, token?: string) {
  const res = await fetch(API_URL + path, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body || {}),
  })
  const json = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(json.error || 'request_failed')
  return json
}
