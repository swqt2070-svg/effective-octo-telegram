import * as libsignal from 'libsignal-protocol'
import { SignalStore } from './store'

// libsignal expects storage.Direction.*; harden for RN bundles
const Direction = { SENDING: 1, RECEIVING: 2 }
function ensureDirection(storage: any) {
  if (storage && !storage.Direction) storage.Direction = Direction
}

if ((libsignal as any).SessionBuilder && !(libsignal as any).SessionBuilder.__patched) {
  const Original = (libsignal as any).SessionBuilder
  const Wrapped = function (storage: any, remoteAddress: any) {
    ensureDirection(storage)
    return new Original(storage, remoteAddress)
  }
  Wrapped.prototype = Original.prototype
  Wrapped.__patched = true
  ;(libsignal as any).SessionBuilder = Wrapped
}

if ((libsignal as any).SessionBuilder?.prototype?.processPreKey && !(libsignal as any).SessionBuilder.__patchedProcess) {
  const orig = (libsignal as any).SessionBuilder.prototype.processPreKey
  ;(libsignal as any).SessionBuilder.prototype.processPreKey = function (device: any) {
    ensureDirection(this.storage)
    return orig.call(this, device)
  }
  ;(libsignal as any).SessionBuilder.__patchedProcess = true
}

if ((libsignal as any).SessionCipher && !(libsignal as any).SessionCipher.__patched) {
  const Original = (libsignal as any).SessionCipher
  const Wrapped = function (storage: any, remoteAddress: any) {
    ensureDirection(storage)
    return new Original(storage, remoteAddress)
  }
  Wrapped.prototype = Original.prototype
  Wrapped.__patched = true
  ;(libsignal as any).SessionCipher = Wrapped
}

if ((libsignal as any).SessionCipher?.prototype?.encrypt && !(libsignal as any).SessionCipher.__patchedEncrypt) {
  const orig = (libsignal as any).SessionCipher.prototype.encrypt
  ;(libsignal as any).SessionCipher.prototype.encrypt = function (buffer: any) {
    ensureDirection(this.storage)
    return orig.call(this, buffer)
  }
  ;(libsignal as any).SessionCipher.__patchedEncrypt = true
}

if (
  (libsignal as any).SessionCipher?.prototype?.decryptWhisperMessage &&
  !(libsignal as any).SessionCipher.__patchedDecrypt
) {
  const orig1 = (libsignal as any).SessionCipher.prototype.decryptWhisperMessage
  const orig2 = (libsignal as any).SessionCipher.prototype.decryptPreKeyWhisperMessage
  ;(libsignal as any).SessionCipher.prototype.decryptWhisperMessage = function (buffer: any, encoding: any) {
    ensureDirection(this.storage)
    return orig1.call(this, buffer, encoding)
  }
  ;(libsignal as any).SessionCipher.prototype.decryptPreKeyWhisperMessage = function (buffer: any, encoding: any) {
    ensureDirection(this.storage)
    return orig2.call(this, buffer, encoding)
  }
  ;(libsignal as any).SessionCipher.__patchedDecrypt = true
}

function b64FromArrayBuffer(buf: ArrayBuffer) {
  return Buffer.from(new Uint8Array(buf)).toString('base64')
}

function normalizeB64(s: string) {
  if (!s) throw new Error('empty b64')
  const cleaned = String(s)
    .replace(/\s+/g, '')
    .replace(/-/g, '+')
    .replace(/_/g, '/')
    .replace(/[^A-Za-z0-9+/=]/g, '')
  const pad = cleaned.length % 4
  return pad ? cleaned + '='.repeat(4 - pad) : cleaned
}

function arrayBufferFromB64(b64: string) {
  const norm = normalizeB64(b64)
  const buf = Buffer.from(norm, 'base64')
  return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength)
}

export function makeAddress(userId: string, deviceId: string) {
  const num = Math.abs(hashToInt(deviceId)) % 16384 + 1
  return {
    getName: () => userId,
    getDeviceId: () => num,
    toString: () => `${userId}.${num}`,
    equals: (other: any) => {
      if (!other) return false
      const on = typeof other.getName === 'function' ? other.getName() : other.name
      const od = typeof other.getDeviceId === 'function' ? other.getDeviceId() : other.deviceId
      return on === userId && od === num
    },
  }
}

function hashToInt(s: string) {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h | 0
}

export async function ensureLocalIdentity(store: SignalStore) {
  let identityKey = await store.get('identityKey')
  let registrationId = await store.get('registrationId')

  if (!identityKey) {
    const pair = await (libsignal as any).KeyHelper.generateIdentityKeyPair()
    identityKey = { pubKey: pair.pubKey, privKey: pair.privKey }
    await store.put('identityKey', identityKey)
  }
  if (!registrationId) {
    registrationId = await (libsignal as any).KeyHelper.generateRegistrationId()
    await store.put('registrationId', registrationId)
  }
  return { identityKey, registrationId }
}

export async function generatePreKeys(store: SignalStore, startId = 1, count = 50) {
  const preKeys = []
  for (let i = 0; i < count; i++) {
    const id = startId + i
    const kp = await (libsignal as any).KeyHelper.generatePreKey(id)
    preKeys.push({ id: kp.keyId, keyPair: kp.keyPair })
    await store.put('preKey' + id, kp.keyPair)
  }
  await store.put('preKeyIdCounter', startId + count)
  return preKeys
}

export async function generateSignedPreKey(store: SignalStore, id = 1) {
  const identityKey = await store.get('identityKey')
  const signed = await (libsignal as any).KeyHelper.generateSignedPreKey(identityKey, id)
  await store.put('signedPreKey' + id, signed.keyPair)
  await store.put('signedPreKeyId', id)
  return { id: signed.keyId, keyPair: signed.keyPair, signature: signed.signature }
}

export function makeLibSignalStore(store: SignalStore) {
  return {
    Direction,
    getIdentityKeyPair: async () => store.get('identityKey'),
    getLocalRegistrationId: async () => store.get('registrationId'),
    put: async (key: string, value: any) => store.put(key, value),
    get: async (key: string, defaultValue: any) => {
      const v = await store.get(key)
      return v === undefined ? defaultValue : v
    },
    remove: async (key: string) => store.remove(key),

    isTrustedIdentity: async () => true,
    loadIdentityKey: async (identifier: string) => store.get('identityKey:' + identifier),
    saveIdentity: async (identifier: string, identityKey: any) => {
      await store.put('identityKey:' + identifier, identityKey)
      return true
    },

    loadPreKey: async (keyId: number) => store.get('preKey' + keyId),
    storePreKey: async (keyId: number, keyPair: any) => store.put('preKey' + keyId, keyPair),
    removePreKey: async (keyId: number) => store.remove('preKey' + keyId),

    loadSignedPreKey: async (keyId: number) => store.get('signedPreKey' + keyId),
    storeSignedPreKey: async (keyId: number, keyPair: any) => store.put('signedPreKey' + keyId, keyPair),
    removeSignedPreKey: async (keyId: number) => store.remove('signedPreKey' + keyId),

    loadSession: async (identifier: string) => store.get('session:' + identifier),
    storeSession: async (identifier: string, record: any) => store.put('session:' + identifier, record),
    removeSession: async (identifier: string) => store.remove('session:' + identifier),

    loadSenderKey: async (name: string) => store.get('senderKey:' + name),
    storeSenderKey: async (name: string, record: any) => store.put('senderKey:' + name, record),
  }
}

export function b64PublicKey(pubKeyArrayBuffer: ArrayBuffer) {
  return b64FromArrayBuffer(pubKeyArrayBuffer)
}

export function b64ToArrayBuffer(b64: string) {
  return arrayBufferFromB64(b64)
}

export async function buildSessionFromBundle(lsStore: any, address: any, bundle: any) {
  if (!lsStore?.Direction) {
    lsStore.Direction = Direction
  }
  const builder = new (libsignal as any).SessionBuilder(lsStore, address)
  const preKeyBundle = {
    identityKey: arrayBufferFromB64(bundle.identityKeyPub),
    registrationId: bundle.registrationId,
    signedPreKey: {
      keyId: bundle.signedPreKey.id,
      publicKey: arrayBufferFromB64(bundle.signedPreKey.pubKey),
      signature: arrayBufferFromB64(bundle.signedPreKey.signature),
    },
    preKey: bundle.oneTimePreKey
      ? {
          keyId: bundle.oneTimePreKey.id,
          publicKey: arrayBufferFromB64(bundle.oneTimePreKey.pubKey),
        }
      : undefined,
  }
  await builder.processPreKey(preKeyBundle)
}

export async function encryptToAddress(lsStore: any, address: any, plaintextObj: any) {
  if (!lsStore?.Direction) {
    lsStore.Direction = Direction
  }
  const cipher = new (libsignal as any).SessionCipher(lsStore, address)
  const encoded = new TextEncoder().encode(JSON.stringify(plaintextObj))
  const msg = await cipher.encrypt(encoded.buffer)
  let bodyB64
  if (typeof msg.body === 'string') {
    bodyB64 = Buffer.from(msg.body, 'binary').toString('base64')
  } else if (msg.body instanceof ArrayBuffer) {
    bodyB64 = b64FromArrayBuffer(msg.body)
  } else if (msg.body?.toArrayBuffer) {
    bodyB64 = b64FromArrayBuffer(msg.body.toArrayBuffer())
  } else if (msg.body?.buffer instanceof ArrayBuffer) {
    bodyB64 = b64FromArrayBuffer(msg.body.buffer)
  } else {
    throw new Error('Unsupported message body type')
  }
  return { type: msg.type, bodyB64 }
}

export async function decryptFromAddress(lsStore: any, address: any, envelope: any) {
  if (!lsStore?.Direction) {
    lsStore.Direction = Direction
  }
  const cipher = new (libsignal as any).SessionCipher(lsStore, address)
  const bodyBuf = arrayBufferFromB64(envelope.bodyB64 || envelope.ciphertext)
  let plainBuf
  if (envelope.type === 3 || envelope.type === 'prekey') {
    plainBuf = await cipher.decryptPreKeyWhisperMessage(bodyBuf, 'binary')
  } else {
    plainBuf = await cipher.decryptWhisperMessage(bodyBuf, 'binary')
  }
  const txt = new TextDecoder().decode(new Uint8Array(plainBuf))
  return JSON.parse(txt)
}

export function newStoreForDevice(userId: string, deviceId: string) {
  return new SignalStore(`sig:${userId}:${deviceId}:`)
}
