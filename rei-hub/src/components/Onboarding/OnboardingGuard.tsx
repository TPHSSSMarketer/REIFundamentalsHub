import { useState, useEffect, type ReactNode } from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import { getOnboardingStatus } from '@/services/onboardingApi'

function isDemoMode(): boolean {
  try {
    const stored = localStorage.getItem('rei-hub-demo-mode')
    if (!stored) return false
    return JSON.parse(stored)?.state?.isDemoMode === true
  } catch {
    return false
  }
}

export default function OnboardingGuard({ children }: { children: ReactNode }) {
  const location = useLocation()
  const [status, setStatus] = useState<'loading' | 'onboarding' | 'ready'>('loading')

  useEffect(() => {
    // Don't redirect if already on /onboarding
    if (location.pathname === '/onboarding') {
      setStatus('ready')
      return
    }

    // Demo mode users skip onboarding — no real data to save
    if (isDemoMode()) {
      setStatus('ready')
      return
    }

    // If user explicitly skipped onboarding, let them through
    if (localStorage.getItem('rei-onboarding-skipped') === 'true') {
      setStatus('ready')
      return
    }

    getOnboardingStatus()
      .then((res) => {
        setStatus(res.completed ? 'ready' : 'onboarding')
      })
      .catch(() => {
        // On error, let them through rather than blocking
        setStatus('ready')
      })
  }, [location.pathname])

  if (status === 'loading') {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
      </div>
    )
  }

  if (status === 'onboarding') {
    return <Navigate to="/onboarding" replace />
  }

  return <>{children}</>
}
