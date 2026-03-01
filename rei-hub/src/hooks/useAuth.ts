import { useState, useEffect, useCallback } from 'react'
import * as authApi from '@/services/authApi'
import type { AuthUser } from '@/types'

export function useAuth() {
  const [user, setUser] = useState<AuthUser | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // On mount, check if the user has a valid session by calling /me.
  // The browser sends the HttpOnly access_token cookie automatically.
  useEffect(() => {
    authApi
      .getMe()
      .then((res) => {
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
        // Not authenticated or session expired — that's fine
        setUser(null)
      })
      .finally(() => {
        setIsLoading(false)
      })
  }, [])

  const login = useCallback(async (email: string, password: string) => {
    setError(null)
    await authApi.login(email, password)

    // Cookies are now set — fetch user profile
    const me = await authApi.getMe()
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
      await authApi.register(email, password, fullName)

      // Cookies are now set — fetch user profile
      const me = await authApi.getMe()
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

  const logout = useCallback(async () => {
    await authApi.logout()
    setUser(null)
    setError(null)
    // Clean up any legacy localStorage from before the migration
    localStorage.removeItem('rei_token')
    window.location.href = '/login'
  }, [])

  return {
    user,
    isLoading,
    error,
    setError,
    login,
    register,
    logout,
    isAuthenticated: !!user,
  }
}
