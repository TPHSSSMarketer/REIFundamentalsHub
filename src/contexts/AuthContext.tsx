import { createContext, useContext, useEffect, useState, useCallback } from 'react'
import type { User, Session } from '@supabase/supabase-js'
import { supabase, isSupabaseConfigured } from '@/lib/supabase'
import type { Profile, Organization } from '@/types/database'

interface AuthState {
  user: User | null
  session: Session | null
  profile: Profile | null
  organization: Organization | null
  isLoading: boolean
  isAuthenticated: boolean
  isOnboarded: boolean
  isSaasMode: boolean // true if Supabase is configured
}

interface AuthActions {
  signUp: (email: string, password: string, fullName: string) => Promise<{ error: string | null }>
  signIn: (email: string, password: string) => Promise<{ error: string | null }>
  signOut: () => Promise<void>
  resetPassword: (email: string) => Promise<{ error: string | null }>
  completeOnboarding: (data: {
    companyName: string
    ghlApiKey: string
    ghlLocationId: string
  }) => Promise<{ error: string | null }>
  updateOrganization: (updates: Partial<Organization>) => Promise<{ error: string | null }>
  refreshProfile: () => Promise<void>
}

type AuthContextType = AuthState & AuthActions

const AuthContext = createContext<AuthContextType | null>(null)

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const saasMode = isSupabaseConfigured()

  const [user, setUser] = useState<User | null>(null)
  const [session, setSession] = useState<Session | null>(null)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [organization, setOrganization] = useState<Organization | null>(null)
  const [isLoading, setIsLoading] = useState(saasMode) // only loading if SaaS mode

  const fetchProfile = useCallback(async (userId: string) => {
    const { data } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .single()
    setProfile(data)
    return data
  }, [])

  const fetchOrganization = useCallback(async (orgId: string) => {
    const { data } = await supabase
      .from('organizations')
      .select('*')
      .eq('id', orgId)
      .single()
    setOrganization(data)
    return data
  }, [])

  // Initialize auth state
  useEffect(() => {
    if (!saasMode) return

    const initAuth = async () => {
      try {
        const { data: { session: currentSession } } = await supabase.auth.getSession()
        setSession(currentSession)
        setUser(currentSession?.user ?? null)

        if (currentSession?.user) {
          const prof = await fetchProfile(currentSession.user.id)
          if (prof?.organization_id) {
            await fetchOrganization(prof.organization_id)
          }
        }
      } finally {
        setIsLoading(false)
      }
    }

    initAuth()

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, newSession) => {
        setSession(newSession)
        setUser(newSession?.user ?? null)

        if (event === 'SIGNED_OUT') {
          setProfile(null)
          setOrganization(null)
        } else if (newSession?.user) {
          const prof = await fetchProfile(newSession.user.id)
          if (prof?.organization_id) {
            await fetchOrganization(prof.organization_id)
          }
        }
      }
    )

    return () => subscription.unsubscribe()
  }, [saasMode, fetchProfile, fetchOrganization])

  const signUp = async (email: string, password: string, fullName: string) => {
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { full_name: fullName },
      },
    })
    return { error: error?.message || null }
  }

  const signIn = async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    return { error: error?.message || null }
  }

  const signOut = async () => {
    await supabase.auth.signOut()
    setProfile(null)
    setOrganization(null)
  }

  const resetPassword = async (email: string) => {
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset-password`,
    })
    return { error: error?.message || null }
  }

  const completeOnboarding = async (data: {
    companyName: string
    ghlApiKey: string
    ghlLocationId: string
  }) => {
    if (!user) return { error: 'Not authenticated' }

    // Create organization
    const { data: org, error: orgError } = await supabase
      .from('organizations')
      .insert({
        name: data.companyName,
        owner_id: user.id,
        ghl_api_key: data.ghlApiKey,
        ghl_location_id: data.ghlLocationId,
      })
      .select()
      .single()

    if (orgError) return { error: orgError.message }

    // Update profile with org + onboarding complete
    const { error: profError } = await supabase
      .from('profiles')
      .update({
        company_name: data.companyName,
        organization_id: org.id,
        onboarding_completed: true,
      })
      .eq('id', user.id)

    if (profError) return { error: profError.message }

    // Refresh local state
    setOrganization(org)
    await fetchProfile(user.id)

    return { error: null }
  }

  const updateOrganization = async (updates: Partial<Organization>) => {
    if (!organization) return { error: 'No organization found' }

    const { error } = await supabase
      .from('organizations')
      .update(updates)
      .eq('id', organization.id)

    if (error) return { error: error.message }

    await fetchOrganization(organization.id)
    return { error: null }
  }

  const refreshProfile = async () => {
    if (!user) return
    const prof = await fetchProfile(user.id)
    if (prof?.organization_id) {
      await fetchOrganization(prof.organization_id)
    }
  }

  const value: AuthContextType = {
    user,
    session,
    profile,
    organization,
    isLoading,
    isAuthenticated: !!session,
    isOnboarded: !!profile?.onboarding_completed,
    isSaasMode: saasMode,
    signUp,
    signIn,
    signOut,
    resetPassword,
    completeOnboarding,
    updateOrganization,
    refreshProfile,
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthContextType {
  const context = useContext(AuthContext)
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider')
  }
  return context
}
