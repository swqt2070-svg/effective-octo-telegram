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

export async function apiPatch(path, body, token) {
  const r = await fetch(API_URL + path, {
    method: 'PATCH',
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

export async function apiPostForm(path, formData, token) {
  const r = await fetch(API_URL + path, {
    method: 'POST',
    headers: token ? { Authorization: 'Bearer ' + token } : {},
    body: formData,
  })
  const j = await r.json().catch(() => ({}))
  if (!r.ok) throw new Error(j.error || 'request_failed')
  return j
}

export async function apiGetBuffer(path, token) {
  const r = await fetch(API_URL + path, {
    headers: token ? { Authorization: 'Bearer ' + token } : {},
  })
  if (!r.ok) {
    const j = await r.json().catch(() => ({}))
    throw new Error(j.error || 'request_failed')
  }
  return r.arrayBuffer()
}

export { API_URL }
