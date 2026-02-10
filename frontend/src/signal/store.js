import { get, set, del, keys } from 'idb-keyval'

export class SignalStore {
  constructor(prefix) {
    this.prefix = prefix || 'sig:'
  }
  _k(key){ return this.prefix + key }

  async get(key) { return await get(this._k(key)) }
  async put(key, value) { await set(this._k(key), value); return value }
  async remove(key) { await del(this._k(key)) }
  async clear() {
    const ks = await keys()
    await Promise.all(ks.filter(k => typeof k === 'string' && k.startsWith(this.prefix)).map(k => del(k)))
  }
}
