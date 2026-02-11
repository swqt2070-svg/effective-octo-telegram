import React, { createContext, useContext, useEffect, useMemo, useState } from 'react'
import { apiGet } from '../utils/api.js'
import { getLocal, setLocal, delLocal } from '../utils/local.js'
import { ensureDeviceSetup } from '../utils/deviceSetup.js'

const AuthCtx = createContext(null)

export function AuthProvider({ children }) {
  const [token, setToken] = useState(getLocal('token') || '')
  const [me, setMe] = useState(null)

  useEffect(() => {
    if (!token) { setMe(null); return }
    apiGet('/me', token).then(setMe).catch(() => setMe(null))
  }, [token])

  useEffect(() => {
    if (!token || !me) return
    ensureDeviceSetup(token, me).catch(() => {})
  }, [token, me])

  const value = useMemo(() => ({
    token,
    me,
    setToken: (t) => { setToken(t); if (t) setLocal('token', t); else delLocal('token') },
    logout: () => { setToken(''); delLocal('token'); setMe(null); },
  }), [token, me])

  return <AuthCtx.Provider value={value}>{children}</AuthCtx.Provider>
}

export function useAuth() {
  return useContext(AuthCtx)
}
