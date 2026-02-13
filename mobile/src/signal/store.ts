import AsyncStorage from '@react-native-async-storage/async-storage'

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
      return JSON.parse(raw)
    } catch {
      return raw
    }
  }

  async put(key: string, value: any) {
    await AsyncStorage.setItem(this.k(key), JSON.stringify(value))
    return value
  }

  async remove(key: string) {
    await AsyncStorage.removeItem(this.k(key))
  }
}
