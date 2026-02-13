import crypto from 'react-native-quick-crypto'
import { Buffer } from 'buffer'

export function bytesToB64(bytes: Uint8Array) {
  return Buffer.from(bytes).toString('base64')
}

export function b64ToBytes(b64: string) {
  return new Uint8Array(Buffer.from(b64, 'base64'))
}

export function randomBytes(len: number) {
  return crypto.randomBytes(len)
}

export async function aesGcmEncrypt(buffer: ArrayBuffer) {
  const iv = randomBytes(12)
  const key = randomBytes(32)
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv)
  const enc = Buffer.concat([cipher.update(Buffer.from(buffer)), cipher.final()])
  const tag = cipher.getAuthTag()
  const cipherBuf = Buffer.concat([enc, tag])
  return {
    cipherBuf,
    keyB64: bytesToB64(key),
    ivB64: bytesToB64(iv),
  }
}

export async function aesGcmDecrypt(cipherBuf: ArrayBuffer, keyB64: string, ivB64: string) {
  const key = Buffer.from(keyB64, 'base64')
  const iv = Buffer.from(ivB64, 'base64')
  const data = Buffer.from(cipherBuf)
  const tag = data.subarray(data.length - 16)
  const enc = data.subarray(0, data.length - 16)
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv)
  decipher.setAuthTag(tag)
  const plain = Buffer.concat([decipher.update(enc), decipher.final()])
  return plain
}
