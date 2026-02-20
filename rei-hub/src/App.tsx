import { Routes, Route, Navigate } from 'react-router-dom'
import { type ReactNode } from 'react'
import Layout from './components/Common/Layout'
import Dashboard from './components/Dashboard/Dashboard'
import Pipeline from './components/Pipeline/Pipeline'
import Contacts from './components/Contacts/Contacts'
import AssistantHub from './components/AssistantHub/AssistantHub'
import ContentHub from './components/ContentHub/ContentHub'
import Portfolio from './components/Portfolio/Portfolio'
import Settings from './components/Settings/Settings'
import LandingPage from './components/LandingPage/LandingPage'
import LoginPage from './components/Auth/LoginPage'
import RegisterPage from './components/Auth/RegisterPage'
import PricingPage from './components/Billing/PricingPage'
import BillingPage from './components/Billing/BillingPage'
import { useAuth } from './hooks/useAuth'

function ProtectedRoute({ children }: { children: ReactNode }) {
  const { isAuthenticated, isLoading } = useAuth()

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-primary-500 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-slate-600">Loading...</p>
        </div>
      </div>
    )
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />
  }

  return <>{children}</>
}

function AppLayout() {
  return (
    <Layout>
      <Routes>
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="/pipeline" element={<Pipeline />} />
        <Route path="/contacts" element={<Contacts />} />
        <Route path="/portfolio" element={<Portfolio />} />
        <Route path="/assistanthub" element={<AssistantHub />} />
        <Route path="/contenthub" element={<ContentHub />} />
        <Route path="/settings" element={<Settings />} />
        <Route path="/billing" element={<BillingPage />} />
      </Routes>
    </Layout>
  )
}

function App() {
  return (
    <Routes>
      <Route path="/" element={<LandingPage />} />
      <Route path="/login" element={<LoginPage />} />
      <Route path="/register" element={<RegisterPage />} />
      <Route path="/pricing" element={<PricingPage />} />
      <Route
        path="/*"
        element={
          <ProtectedRoute>
            <AppLayout />
          </ProtectedRoute>
        }
      />
    </Routes>
  )
}

export default App
