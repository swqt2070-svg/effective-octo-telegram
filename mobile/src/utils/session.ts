import AsyncStorage from '@react-native-async-storage/async-storage'

const KEY = 'lm_active_peer'

export async function setActivePeer(peerId: string | null) {
  if (!peerId) {
    await AsyncStorage.removeItem(KEY)
  } else {
    await AsyncStorage.setItem(KEY, peerId)
  }
}

export async function getActivePeer() {
  return AsyncStorage.getItem(KEY)
}
