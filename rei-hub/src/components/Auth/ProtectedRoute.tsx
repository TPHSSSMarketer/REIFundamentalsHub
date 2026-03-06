import { type ReactNode } from 'react'
import { Navigate } from 'react-router-dom'
import { isAuthenticated } from '@/services/auth'
import { useDemoMode } from '@/hooks/useDemoMode'

export default function ProtectedRoute({ children }: { children: ReactNode }) {
  const { isDemoMode } = useDemoMode()

  if (!isAuthenticated() && !isDemoMode) {
    return <Navigate to="/login" replace />
  }

  return <>{children}</>
}
