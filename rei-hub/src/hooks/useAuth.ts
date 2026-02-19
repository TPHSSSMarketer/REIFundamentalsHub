import { useState, useEffect, useCallback } from 'react'
import * as authApi from '@/services/authApi'
import type { AuthUser } from '@/types'

const TOKEN_KEY = 'rei_auth_token'

export function useAuth() {
  const [token, setToken] = useState<string | null>(null)
  const [user, setUser] = useState<AuthUser | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Hydrate from localStorage on mount
  useEffect(() => {
    const stored = localStorage.getItem(TOKEN_KEY)
    if (!stored) {
      setIsLoading(false)
      return
    }

    authApi
      .getMe(stored)
      .then((res) => {
        setToken(stored)
        setUser({
          id: res.id,
          email: res.email,
          fullName: res.full_name,
          isActive: res.is_active,
          isVerified: res.is_verified,
          plan: res.plan,
        })
      })
      .catch(() => {
        localStorage.removeItem(TOKEN_KEY)
      })
      .finally(() => {
        setIsLoading(false)
      })
  }, [])

  const login = useCallback(async (email: string, password: string) => {
    setError(null)
    const res = await authApi.login(email, password)
    localStorage.setItem(TOKEN_KEY, res.access_token)
    setToken(res.access_token)

    const me = await authApi.getMe(res.access_token)
    setUser({
      id: me.id,
      email: me.email,
      fullName: me.full_name,
      isActive: me.is_active,
      isVerified: me.is_verified,
      plan: me.plan,
    })
  }, [])

  const register = useCallback(
    async (email: string, password: string, fullName?: string) => {
      setError(null)
      const res = await authApi.register(email, password, fullName)
      localStorage.setItem(TOKEN_KEY, res.access_token)
      setToken(res.access_token)

      const me = await authApi.getMe(res.access_token)
      setUser({
        id: me.id,
        email: me.email,
        fullName: me.full_name,
        isActive: me.is_active,
        isVerified: me.is_verified,
        plan: me.plan,
      })
    },
    []
  )

  const logout = useCallback(() => {
    localStorage.removeItem(TOKEN_KEY)
    setToken(null)
    setUser(null)
    setError(null)
  }, [])

  return {
    token,
    user,
    isLoading,
    error,
    setError,
    login,
    register,
    logout,
    isAuthenticated: !!token,
  }
}
