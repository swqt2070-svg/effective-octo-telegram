import { Buffer } from 'buffer'

export function decodeCiphertext(ciphertext: string) {
  if (!ciphertext) throw new Error('empty ciphertext')
  const norm = (s: string) => {
    const cleaned = String(s).replace(/\s+/g, '').replace(/-/g, '+').replace(/_/g, '/')
    const pad = cleaned.length % 4
    return pad ? cleaned + '='.repeat(4 - pad) : cleaned
  }
  try {
    return JSON.parse(Buffer.from(ciphertext, 'base64').toString('utf-8'))
  } catch {
    return JSON.parse(Buffer.from(norm(ciphertext), 'base64').toString('utf-8'))
  }
}

export function extractBodyB64(packed: any) {
  if (!packed || typeof packed !== 'object') return null
  if (typeof packed.bodyB64 === 'string' && packed.bodyB64.length) return packed.bodyB64
  if (typeof packed.body === 'string' && packed.body.length) return packed.body
  if (packed.body && Array.isArray(packed.body.data)) return Buffer.from(packed.body.data).toString('base64')
  if (Array.isArray(packed.body)) return Buffer.from(packed.body).toString('base64')
  if (packed.ciphertext && typeof packed.ciphertext === 'string') return packed.ciphertext
  return null
}
