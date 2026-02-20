import { type ReactNode } from 'react'
import { Navigate } from 'react-router-dom'
import { isAuthenticated } from '@/services/auth'

export default function ProtectedRoute({ children }: { children: ReactNode }) {
  if (!isAuthenticated()) {
    return <Navigate to="/login" replace />
  }

  return <>{children}</>
}
