import { SignalStore } from './store.js'

const libsignal = window.libsignal
if (!libsignal) {
  throw new Error('libsignal not loaded. Ensure /libsignal-protocol.js is loaded before the app.')
}

// libsignal expects storage.Direction.*; harden for browser bundles that omit it
const Direction = { SENDING: 1, RECEIVING: 2 }
function ensureDirection(storage) {
  if (storage && !storage.Direction) storage.Direction = Direction
}

if (libsignal.SessionBuilder && !libsignal.SessionBuilder.__patched) {
  const Original = libsignal.SessionBuilder
  const Wrapped = function(storage, remoteAddress) {
    ensureDirection(storage)
    return new Original(storage, remoteAddress)
  }
  Wrapped.prototype = Original.prototype
  Wrapped.__patched = true
  libsignal.SessionBuilder = Wrapped
}

if (libsignal.SessionBuilder?.prototype?.processPreKey && !libsignal.SessionBuilder.__patchedProcess) {
  const orig = libsignal.SessionBuilder.prototype.processPreKey
  libsignal.SessionBuilder.prototype.processPreKey = function(device) {
    ensureDirection(this.storage)
    return orig.call(this, device)
  }
  libsignal.SessionBuilder.__patchedProcess = true
}

if (libsignal.SessionCipher && !libsignal.SessionCipher.__patched) {
  const Original = libsignal.SessionCipher
  const Wrapped = function(storage, remoteAddress) {
    ensureDirection(storage)
    return new Original(storage, remoteAddress)
  }
  Wrapped.prototype = Original.prototype
  Wrapped.__patched = true
  libsignal.SessionCipher = Wrapped
}

if (libsignal.SessionCipher?.prototype?.encrypt && !libsignal.SessionCipher.__patchedEncrypt) {
  const orig = libsignal.SessionCipher.prototype.encrypt
  libsignal.SessionCipher.prototype.encrypt = function(buffer) {
    ensureDirection(this.storage)
    return orig.call(this, buffer)
  }
  libsignal.SessionCipher.__patchedEncrypt = true
}

if (libsignal.SessionCipher?.prototype?.decryptWhisperMessage && !libsignal.SessionCipher.__patchedDecrypt) {
  const orig1 = libsignal.SessionCipher.prototype.decryptWhisperMessage
  const orig2 = libsignal.SessionCipher.prototype.decryptPreKeyWhisperMessage
  libsignal.SessionCipher.prototype.decryptWhisperMessage = function(buffer, encoding) {
    ensureDirection(this.storage)
    return orig1.call(this, buffer, encoding)
  }
  libsignal.SessionCipher.prototype.decryptPreKeyWhisperMessage = function(buffer, encoding) {
    ensureDirection(this.storage)
    return orig2.call(this, buffer, encoding)
  }
  libsignal.SessionCipher.__patchedDecrypt = true
}

// Utilities
function b64FromArrayBuffer(buf) {
  const bytes = new Uint8Array(buf)
  let binary = ''
  for (let i = 0; i < bytes.byteLength; i++) binary += String.fromCharCode(bytes[i])
  return btoa(binary)
}
function normalizeB64(s) {
  if (!s) throw new Error('empty b64')
  const cleaned = String(s)
    .replace(/\s+/g, '')
    .replace(/-/g, '+')
    .replace(/_/g, '/')
    .replace(/[^A-Za-z0-9+/=]/g, '')
  const pad = cleaned.length % 4
  return pad ? cleaned + '='.repeat(4 - pad) : cleaned
}
function arrayBufferFromB64(b64) {
  const norm = normalizeB64(b64)
  try {
    const binary = atob(norm)
    const bytes = new Uint8Array(binary.length)
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
    return bytes.buffer
  } catch (err) {
    console.error('invalid base64 body', { sample: String(b64).slice(0, 120), length: String(b64).length })
    throw err
  }
}

export function makeAddress(userId, deviceId) {
  // libsignal expects (name, deviceIdNumber). We'll hash deviceId to int deterministically.
  const num = Math.abs(hashToInt(deviceId)) % 16384 + 1
  // Avoid relying on libsignal's constructor (some builds expose it non-constructable)
  return {
    getName: () => userId,
    getDeviceId: () => num,
    toString: () => `${userId}.${num}`,
    equals: (other) => {
      if (!other) return false
      const on = typeof other.getName === 'function' ? other.getName() : other.name
      const od = typeof other.getDeviceId === 'function' ? other.getDeviceId() : other.deviceId
      return on === userId && od === num
    },
  }
}

function hashToInt(s){
  let h = 2166136261
  for (let i=0;i<s.length;i++){
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h | 0
}

export async function ensureLocalIdentity(store) {
  // identityKey (pair) + registrationId
  let identityKey = await store.get('identityKey')
  let registrationId = await store.get('registrationId')

  if (!identityKey) {
    const pair = await libsignal.KeyHelper.generateIdentityKeyPair()
    identityKey = { pubKey: pair.pubKey, privKey: pair.privKey }
    await store.put('identityKey', identityKey)
  }
  if (!registrationId) {
    registrationId = await libsignal.KeyHelper.generateRegistrationId()
    await store.put('registrationId', registrationId)
  }
  return { identityKey, registrationId }
}

export async function generatePreKeys(store, startId=1, count=50) {
  const preKeys = []
  for (let i=0;i<count;i++){
    const id = startId + i
    const kp = await libsignal.KeyHelper.generatePreKey(id)
    preKeys.push({ id: kp.keyId, keyPair: kp.keyPair })
    await store.put('preKey' + id, kp.keyPair)
  }
  await store.put('preKeyIdCounter', startId + count)
  return preKeys
}

export async function generateSignedPreKey(store, id=1) {
  const identityKey = await store.get('identityKey')
  const signed = await libsignal.KeyHelper.generateSignedPreKey(identityKey, id)
  await store.put('signedPreKey' + id, signed.keyPair)
  await store.put('signedPreKeyId', id)
  return { id: signed.keyId, keyPair: signed.keyPair, signature: signed.signature }
}

// Signal store adapter for libsignal
export function makeLibSignalStore(store) {
  return {
    Direction,
    getIdentityKeyPair: async () => store.get('identityKey'),
    getLocalRegistrationId: async () => store.get('registrationId'),
    put: async (key, value) => store.put(key, value),
    get: async (key, defaultValue) => {
      const v = await store.get(key)
      return v === undefined ? defaultValue : v
    },
    remove: async (key) => store.remove(key),

    // required by libsignal
    isTrustedIdentity: async (identifier, identityKey, direction) => true,
    loadIdentityKey: async (identifier) => store.get('identityKey:' + identifier),
    saveIdentity: async (identifier, identityKey) => { await store.put('identityKey:' + identifier, identityKey); return true },

    loadPreKey: async (keyId) => store.get('preKey' + keyId),
    storePreKey: async (keyId, keyPair) => store.put('preKey' + keyId, keyPair),
    removePreKey: async (keyId) => store.remove('preKey' + keyId),

    loadSignedPreKey: async (keyId) => store.get('signedPreKey' + keyId),
    storeSignedPreKey: async (keyId, keyPair) => store.put('signedPreKey' + keyId, keyPair),
    removeSignedPreKey: async (keyId) => store.remove('signedPreKey' + keyId),

    loadSession: async (identifier) => store.get('session:' + identifier),
    storeSession: async (identifier, record) => store.put('session:' + identifier, record),
    removeSession: async (identifier) => store.remove('session:' + identifier),

    loadSenderKey: async (name) => store.get('senderKey:' + name),
    storeSenderKey: async (name, record) => store.put('senderKey:' + name, record),
  }
}

export function b64PublicKey(pubKeyArrayBuffer) {
  return b64FromArrayBuffer(pubKeyArrayBuffer)
}

export function b64ToArrayBuffer(b64) {
  return arrayBufferFromB64(b64)
}

export async function buildSessionFromBundle(lsStore, address, bundle) {
  if (!lsStore?.Direction) {
    lsStore.Direction = { SENDING: 1, RECEIVING: 2 }
  }
  const builder = new libsignal.SessionBuilder(lsStore, address)
  const preKeyBundle = {
    identityKey: arrayBufferFromB64(bundle.identityKeyPub),
    registrationId: bundle.registrationId,
    signedPreKey: {
      keyId: bundle.signedPreKey.id,
      publicKey: arrayBufferFromB64(bundle.signedPreKey.pubKey),
      signature: arrayBufferFromB64(bundle.signedPreKey.signature),
    },
    preKey: bundle.oneTimePreKey ? {
      keyId: bundle.oneTimePreKey.id,
      publicKey: arrayBufferFromB64(bundle.oneTimePreKey.pubKey),
    } : undefined,
  }
  await builder.processPreKey(preKeyBundle)
}

export async function encryptToAddress(lsStore, address, plaintextObj) {
  if (!lsStore?.Direction) {
    lsStore.Direction = { SENDING: 1, RECEIVING: 2 }
  }
  const cipher = new libsignal.SessionCipher(lsStore, address)
  const encoded = new TextEncoder().encode(JSON.stringify(plaintextObj))
  const msg = await cipher.encrypt(encoded.buffer)
  // msg: {type, body}
  return { type: msg.type, bodyB64: b64FromArrayBuffer(msg.body) }
}

export async function decryptFromAddress(lsStore, address, envelope) {
  if (!lsStore?.Direction) {
    lsStore.Direction = { SENDING: 1, RECEIVING: 2 }
  }
  const cipher = new libsignal.SessionCipher(lsStore, address)
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

export function newStoreForDevice(userId, deviceId) {
  return new SignalStore(`sig:${userId}:${deviceId}:`)
}
