import AsyncStorage from '@react-native-async-storage/async-storage'
import { Buffer } from 'buffer'

type Encoded =
  | { __type: 'arraybuffer'; data: string }
  | { __type: 'uint8array'; data: string }
  | { [key: string]: Encoded }
  | Encoded[]
  | string
  | number
  | boolean
  | null

function isArrayBuffer(value: any): value is ArrayBuffer {
  return value instanceof ArrayBuffer
}

function isTypedArray(value: any): value is ArrayBufferView {
  return value && ArrayBuffer.isView(value)
}

function encodeValue(value: any): Encoded {
  if (isArrayBuffer(value)) {
    const bytes = new Uint8Array(value)
    return { __type: 'arraybuffer', data: Buffer.from(bytes).toString('base64') }
  }
  if (isTypedArray(value)) {
    const bytes = new Uint8Array(value.buffer, value.byteOffset, value.byteLength)
    return { __type: 'arraybuffer', data: Buffer.from(bytes).toString('base64') }
  }
  if (Array.isArray(value)) {
    return value.map((v) => encodeValue(v)) as Encoded
  }
  if (value && typeof value === 'object') {
    const out: any = {}
    for (const key of Object.keys(value)) {
      out[key] = encodeValue(value[key])
    }
    return out
  }
  return value
}

function decodeValue(value: any): any {
  if (!value) return value
  if (Array.isArray(value)) {
    return value.map((v) => decodeValue(v))
  }
  if (value && typeof value === 'object') {
    if (value.__type === 'arraybuffer' && typeof value.data === 'string') {
      const buf = Buffer.from(value.data, 'base64')
      return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength)
    }
    const out: any = {}
    for (const key of Object.keys(value)) {
      out[key] = decodeValue(value[key])
    }
    return out
  }
  return value
}

export class SignalStore {
  private prefix: string
  constructor(prefix?: string) {
    this.prefix = prefix || 'sig:'
  }
  private k(key: string) {
    return `${this.prefix}${key}`
  }

  async get(key: string) {
    const raw = await AsyncStorage.getItem(this.k(key))
    if (!raw) return undefined
    try {
      const parsed = JSON.parse(raw)
      return decodeValue(parsed)
    } catch {
      return raw
    }
  }

  async put(key: string, value: any) {
    const encoded = encodeValue(value)
    await AsyncStorage.setItem(this.k(key), JSON.stringify(encoded))
    return value
  }

  async remove(key: string) {
    await AsyncStorage.removeItem(this.k(key))
  }
}
