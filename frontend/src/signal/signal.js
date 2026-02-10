import * as libsignal from 'libsignal-protocol'
import { SignalStore } from './store.js'

// Utilities
function b64FromArrayBuffer(buf) {
  const bytes = new Uint8Array(buf)
  let binary = ''
  for (let i = 0; i < bytes.byteLength; i++) binary += String.fromCharCode(bytes[i])
  return btoa(binary)
}
function arrayBufferFromB64(b64) {
  const binary = atob(b64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return bytes.buffer
}

export function makeAddress(userId, deviceId) {
  // libsignal expects (name, deviceIdNumber). We'll hash deviceId to int deterministically.
  const num = Math.abs(hashToInt(deviceId)) % 16384 + 1
  return new libsignal.SignalProtocolAddress(userId, num)
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
  const cipher = new libsignal.SessionCipher(lsStore, address)
  const encoded = new TextEncoder().encode(JSON.stringify(plaintextObj))
  const msg = await cipher.encrypt(encoded.buffer)
  // msg: {type, body}
  return { type: msg.type, bodyB64: b64FromArrayBuffer(msg.body) }
}

export async function decryptFromAddress(lsStore, address, envelope) {
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
