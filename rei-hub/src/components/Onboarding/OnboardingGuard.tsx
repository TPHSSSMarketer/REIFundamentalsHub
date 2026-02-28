import { useState, useEffect, type ReactNode } from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import { getToken } from '@/services/auth'
import { getOnboardingStatus } from '@/services/onboardingApi'

export default function OnboardingGuard({ children }: { children: ReactNode }) {
    const location = useLocation()
    const [status, setStatus] = useState<'loading' | 'onboarding' | 'ready'>('loading')

  useEffect(() => {
        // Don't redirect if already on /onboarding
                if (location.pathname === '/onboarding') {
                        setStatus('ready')
                        return
                }

                const token = getToken()
        if (!token) {
                setStatus('ready')
                return
        }

                // If user explicitly skipped onboarding, let them through
                if (localStorage.getItem('rei-onboarding-skipped') === 'true') {
                        setStatus('ready')
                        return
                }

                getOnboardingStatus(token)
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
                </div>div>
              )
  }
  
    if (status === 'onboarding') {
          return <Navigate to="/onboarding" replace />
    }
  
    return <>{children}</>>
      }
      </></div>
