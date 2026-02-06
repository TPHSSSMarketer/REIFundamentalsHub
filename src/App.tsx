import { Routes, Route } from 'react-router-dom'
import { useState, useEffect } from 'react'
import Layout from './components/Common/Layout'
import Dashboard from './components/Dashboard/Dashboard'
import Pipeline from './components/Pipeline/Pipeline'
import Contacts from './components/Contacts/Contacts'
import AssistantHub from './components/AssistantHub/AssistantHub'
import ContentHub from './components/ContentHub/ContentHub'
import Settings from './components/Settings/Settings'
import Scheduler from './components/Scheduler/Scheduler'
import LandingPage from './components/LandingPage/LandingPage'
import Login from './components/Auth/Login'
import Signup from './components/Auth/Signup'
import ForgotPassword from './components/Auth/ForgotPassword'
import ProtectedRoute from './components/Auth/ProtectedRoute'
import ConnectionTest from './components/Common/ConnectionTest'
import { apiService } from './services/api'
import { useDemoMode } from './hooks/useDemoMode'
import { useAuth } from './contexts/AuthContext'

function AppLayout() {
  const { isDemoMode, enableDemoMode } = useDemoMode()
  const { organization, isSaasMode } = useAuth()
  const [isConnected, setIsConnected] = useState<boolean | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    // In SaaS mode, configure API service with org credentials
    if (isSaasMode && organization) {
      apiService.configure({
        apiKey: organization.ghl_api_key || '',
        locationId: organization.ghl_location_id || '',
        baseUrl: organization.ghl_base_url || 'https://services.leadconnectorhq.com',
      })
    }
  }, [isSaasMode, organization])

  useEffect(() => {
    if (isDemoMode) {
      setIsConnected(true)
      setIsLoading(false)
      return
    }

    const testConnection = async () => {
      try {
        const connected = await apiService.testConnection()
        setIsConnected(connected)
      } catch {
        setIsConnected(false)
      } finally {
        setIsLoading(false)
      }
    }

    testConnection()
  }, [isDemoMode])

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-primary-500 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-slate-600">Connecting to REI Fundamentals Hub...</p>
        </div>
      </div>
    )
  }

  if (!isConnected) {
    return <ConnectionTest onRetry={() => window.location.reload()} onDemoMode={enableDemoMode} />
  }

  return (
    <Layout>
      <Routes>
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="/pipeline" element={<Pipeline />} />
        <Route path="/contacts" element={<Contacts />} />
        <Route path="/assistanthub" element={<AssistantHub />} />
        <Route path="/contenthub" element={<ContentHub />} />
        <Route path="/scheduler" element={<Scheduler />} />
        <Route path="/settings" element={<Settings />} />
      </Routes>
    </Layout>
  )
}

function App() {
  return (
    <Routes>
      {/* Public routes */}
      <Route path="/" element={<LandingPage />} />
      <Route path="/login" element={<Login />} />
      <Route path="/signup" element={<Signup />} />
      <Route path="/forgot-password" element={<ForgotPassword />} />

      {/* Protected app routes */}
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
