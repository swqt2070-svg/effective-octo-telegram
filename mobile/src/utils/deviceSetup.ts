import { Platform } from 'react-native'
import { Buffer } from 'buffer'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { apiGet, apiPost } from '../api'
import {
  newStoreForDevice,
  ensureLocalIdentity,
  generatePreKeys,
  generateSignedPreKey,
  b64PublicKey,
} from '../signal/signal'

let inFlight: Promise<string | null> | null = null
let inFlightStartedAt = 0
const SETUP_TIMEOUT_MS = 30000

function deviceIdKey(userId: string) {
  return `deviceId:${userId}`
}

function deviceNameKey(userId: string) {
  return `deviceName:${userId}`
}

async function getLocal(key: string) {
  return AsyncStorage.getItem(key)
}

async function setLocal(key: string, value: string) {
  await AsyncStorage.setItem(key, value)
}

function guessDeviceName() {
  const tag = Platform.OS === 'android' ? 'Android' : 'Mobile'
  return `${tag}-${Platform.Version}`.slice(0, 32)
}

async function uploadKeys(token: string, userId: string, deviceId: string) {
  console.log('[deviceSetup] upload keys start', deviceId)
  const store = newStoreForDevice(userId, deviceId)
  const { identityKey, registrationId } = await ensureLocalIdentity(store)
  const signedId = (await store.get('signedPreKeyId')) || 1
  const spk = await generateSignedPreKey(store, signedId)
  const counter = (await store.get('preKeyIdCounter')) || 1
  const pks = await generatePreKeys(store, counter, 50)

  const signatureBytes = new Uint8Array(spk.signature as ArrayBuffer)
  const signatureB64 = Buffer.from(signatureBytes).toString('base64')

  const body = {
    registrationId,
    identityKeyPub: b64PublicKey(identityKey.pubKey),
    signedPreKey: {
      id: spk.id,
      pubKey: b64PublicKey(spk.keyPair.pubKey),
      signature: signatureB64,
    },
    oneTimePreKeys: pks.map((pk: any) => ({ id: pk.id, pubKey: b64PublicKey(pk.keyPair.pubKey) })),
  }
  await apiPost(`/devices/${deviceId}/keys`, body, token)
  console.log('[deviceSetup] upload keys done', deviceId)
}

export async function ensureDeviceSetup(token: string, me: { id: string }) {
  if (!token || !me?.id) return null
  if (inFlight && Date.now() - inFlightStartedAt < SETUP_TIMEOUT_MS) return inFlight
  inFlight = null
  inFlightStartedAt = Date.now()
  const setupPromise = (async () => {
    let stage = 'start'
    const perUserKey = deviceIdKey(me.id)
    const perUserNameKey = deviceNameKey(me.id)
    let deviceId = (await getLocal(perUserKey)) || ''
    stage = 'fetch_devices'
    console.log('[deviceSetup] fetch devices')
    const r = await apiGet('/devices', token)
    const devices = r.devices || []

    let device = deviceId ? devices.find((d: any) => d.id === deviceId) : null
    if (!device) {
      stage = 'create_device'
      console.log('[deviceSetup] create device')
      const name = guessDeviceName()
      const created = await apiPost('/devices', { name }, token)
      device = created.device
      deviceId = device.id
      await setLocal(perUserKey, deviceId)
      await setLocal(perUserNameKey, name)
    }

    if (!device) {
      throw new Error(`device_setup_failed: ${stage}: no device`)
    }

    stage = 'check_keys'
    const store = newStoreForDevice(me.id, deviceId)
    const localIdentity = await store.get('identityKey')
    const localReg = await store.get('registrationId')
    const localHasIdentity = !!(localIdentity && localReg)
    const needsKeys =
      !device.identityKeyPub || !device.registrationId || !device.signedPreKeyId || !device.signedPreKeyPub || !device.signedPreKeySig
    if (needsKeys || !localHasIdentity) {
      stage = 'upload_keys'
      await uploadKeys(token, me.id, deviceId)
    }
    console.log('[deviceSetup] ready', deviceId)
    return deviceId
  })()
  inFlight = withTimeout(setupPromise, SETUP_TIMEOUT_MS, 'device setup timeout')

  try {
    return await inFlight
  } finally {
    inFlight = null
    inFlightStartedAt = 0
  }
}

function withTimeout<T>(promise: Promise<T>, ms: number, label: string) {
  let timeoutId: ReturnType<typeof setTimeout> | undefined
  const timeout = new Promise<T>((_, reject) => {
    timeoutId = setTimeout(() => reject(new Error(label)), ms)
  })
  return Promise.race([promise, timeout]).finally(() => {
    if (timeoutId) clearTimeout(timeoutId)
  })
}
