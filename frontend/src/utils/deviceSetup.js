import { apiGet, apiPost } from './api.js'
import { getLocal, setLocal } from './local.js'
import { newStoreForDevice, ensureLocalIdentity, generatePreKeys, generateSignedPreKey, b64PublicKey } from '../signal/signal.js'

let inFlight = null

function guessDeviceName() {
  const saved = getLocal('deviceName')
  if (saved) return saved
  const platform = typeof navigator !== 'undefined' ? (navigator.platform || 'Web') : 'Web'
  const ua = typeof navigator !== 'undefined' ? navigator.userAgent : ''
  const tag = ua.includes('Mobile') ? 'Mobile' : 'Desktop'
  return `${tag}-${platform}`.slice(0, 32)
}

async function uploadKeys(token, userId, deviceId) {
  const store = newStoreForDevice(userId, deviceId)
  const { identityKey, registrationId } = await ensureLocalIdentity(store)
  const signedId = (await store.get('signedPreKeyId')) || 1
  const spk = await generateSignedPreKey(store, signedId)
  const counter = (await store.get('preKeyIdCounter')) || 1
  const pks = await generatePreKeys(store, counter, 50)

  const body = {
    registrationId,
    identityKeyPub: b64PublicKey(identityKey.pubKey),
    signedPreKey: {
      id: spk.id,
      pubKey: b64PublicKey(spk.keyPair.pubKey),
      signature: btoa(String.fromCharCode(...new Uint8Array(spk.signature))),
    },
    oneTimePreKeys: pks.map(pk => ({ id: pk.id, pubKey: b64PublicKey(pk.keyPair.pubKey) })),
  }
  await apiPost(`/devices/${deviceId}/keys`, body, token)
}

export async function ensureDeviceSetup(token, me) {
  if (!token || !me?.id) return null
  if (inFlight) return inFlight
  inFlight = (async () => {
    let deviceId = getLocal('deviceId') || ''
    const r = await apiGet('/devices', token)
    const devices = r.devices || []

    let device = deviceId ? devices.find(d => d.id === deviceId) : null
    if (!device) {
      if (devices.length) {
        device = devices[0]
        deviceId = device.id
        setLocal('deviceId', deviceId)
        if (device.name) setLocal('deviceName', device.name)
      } else {
        const name = guessDeviceName()
        const created = await apiPost('/devices', { name }, token)
        device = created.device
        deviceId = device.id
        setLocal('deviceId', deviceId)
        setLocal('deviceName', name)
      }
    }

    if (!device) return null

    const needsKeys = !device.identityKeyPub || !device.registrationId || !device.signedPreKeyId || !device.signedPreKeyPub || !device.signedPreKeySig
    if (needsKeys) {
      await uploadKeys(token, me.id, deviceId)
    }
    return deviceId
  })()

  try {
    return await inFlight
  } finally {
    inFlight = null
  }
}
