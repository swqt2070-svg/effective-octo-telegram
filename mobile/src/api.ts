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

export async function apiPatch(path: string, body?: unknown, token?: string) {
  const res = await fetch(API_URL + path, {
    method: 'PATCH',
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

export async function apiPostForm(path: string, formData: FormData, token?: string) {
  const res = await fetch(API_URL + path, {
    method: 'POST',
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    body: formData,
  })
  const json = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(json.error || 'request_failed')
  return json
}

export async function apiGetBuffer(path: string, token?: string) {
  const res = await fetch(API_URL + path, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  })
  if (!res.ok) {
    const json = await res.json().catch(() => ({}))
    throw new Error(json.error || 'request_failed')
  }
  if (res.arrayBuffer) return res.arrayBuffer()
  const blob = await res.blob()
  return blob.arrayBuffer()
}
