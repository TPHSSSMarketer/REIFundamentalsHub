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
  signUp: (email: string, password: string, fullName: string, companyName: string) => Promise<{ error: string | null }>
  signIn: (email: string, password: string) => Promise<{ error: string | null }>
  signOut: () => Promise<void>
  resetPassword: (email: string) => Promise<{ error: string | null }>
  setupOrganization: (userId: string, fullName: string, companyName: string) => Promise<{ error: string | null }>
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
          if (prof && !prof.onboarding_completed) {
            const meta = currentSession.user.user_metadata
            await setupOrganization(
              currentSession.user.id,
              meta?.full_name || '',
              meta?.company_name || ''
            )
          } else if (prof?.organization_id) {
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
          if (prof && !prof.onboarding_completed) {
            // Auto-setup org on first login (after email confirmation)
            const meta = newSession.user.user_metadata
            await setupOrganization(
              newSession.user.id,
              meta?.full_name || '',
              meta?.company_name || ''
            )
          } else if (prof?.organization_id) {
            await fetchOrganization(prof.organization_id)
          }
        }
      }
    )

    return () => subscription.unsubscribe()
  }, [saasMode, fetchProfile, fetchOrganization])

  const signUp = async (email: string, password: string, fullName: string, companyName: string) => {
    if (!saasMode) return { error: 'SaaS mode is not configured. Add Supabase credentials to enable authentication.' }
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { full_name: fullName, company_name: companyName },
      },
    })
    return { error: error?.message || null }
  }

  const signIn = async (email: string, password: string) => {
    if (!saasMode) return { error: 'SaaS mode is not configured. Add Supabase credentials to enable authentication.' }
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    return { error: error?.message || null }
  }

  const signOut = async () => {
    await supabase.auth.signOut()
    setProfile(null)
    setOrganization(null)
  }

  const resetPassword = async (email: string) => {
    if (!saasMode) return { error: 'SaaS mode is not configured. Add Supabase credentials to enable authentication.' }
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset-password`,
    })
    return { error: error?.message || null }
  }

  /**
   * Auto-creates an organization for a new user on first login.
   * GHL credentials are provisioned by the platform admin (not the user).
   */
  const setupOrganization = async (userId: string, fullName: string, companyName: string) => {
    // Create organization (no GHL creds — admin adds those later)
    const { data: org, error: orgError } = await supabase
      .from('organizations')
      .insert({
        name: companyName || `${fullName}'s Organization`,
        owner_id: userId,
      })
      .select()
      .single()

    if (orgError) return { error: orgError.message }

    // Update profile with org + mark onboarding complete
    const { error: profError } = await supabase
      .from('profiles')
      .update({
        company_name: companyName,
        organization_id: org.id,
        onboarding_completed: true,
      })
      .eq('id', userId)

    if (profError) return { error: profError.message }

    // Refresh local state
    setOrganization(org)
    await fetchProfile(userId)

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
    setupOrganization,
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
