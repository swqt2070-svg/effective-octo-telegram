import React, { createContext, useContext, useEffect, useMemo, useState } from 'react'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { apiPost } from '../api'

type User = {
  id: string
  username: string
  displayName?: string | null
  role?: string
}

type AuthContextValue = {
  token: string | null
  user: User | null
  loading: boolean
  login: (username: string, password: string) => Promise<void>
  register: (payload: { username: string; password: string; displayName?: string; inviteCode?: string }) => Promise<void>
  logout: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | null>(null)

const TOKEN_KEY = 'lm_token'
const USER_KEY = 'lm_user'

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [token, setToken] = useState<string | null>(null)
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const load = async () => {
      try {
        const [t, u] = await Promise.all([AsyncStorage.getItem(TOKEN_KEY), AsyncStorage.getItem(USER_KEY)])
        if (t) setToken(t)
        if (u) setUser(JSON.parse(u))
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [])

  const login = async (username: string, password: string) => {
    const r = await apiPost('/auth/login', { username, password })
    setToken(r.token)
    setUser(r.user)
    await AsyncStorage.setItem(TOKEN_KEY, r.token)
    await AsyncStorage.setItem(USER_KEY, JSON.stringify(r.user))
  }

  const register = async (payload: { username: string; password: string; displayName?: string; inviteCode?: string }) => {
    const r = await apiPost('/auth/register', payload)
    setToken(r.token)
    setUser(r.user)
    await AsyncStorage.setItem(TOKEN_KEY, r.token)
    await AsyncStorage.setItem(USER_KEY, JSON.stringify(r.user))
  }

  const logout = async () => {
    setToken(null)
    setUser(null)
    await AsyncStorage.multiRemove([TOKEN_KEY, USER_KEY])
  }

  const value = useMemo(() => ({ token, user, loading, login, register, logout }), [token, user, loading])

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('AuthProvider missing')
  return ctx
}
