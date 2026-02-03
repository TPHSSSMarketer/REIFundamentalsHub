import { Routes, Route, Navigate } from 'react-router-dom'
import { useState, useEffect } from 'react'
import Layout from './components/Common/Layout'
import Dashboard from './components/Dashboard/Dashboard'
import Pipeline from './components/Pipeline/Pipeline'
import Contacts from './components/Contacts/Contacts'
import Settings from './components/Settings/Settings'
import ConnectionTest from './components/Common/ConnectionTest'
import { ghlService } from './services/ghl'

function App() {
  const [isConnected, setIsConnected] = useState<boolean | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    const testConnection = async () => {
      try {
        const connected = await ghlService.testConnection()
        setIsConnected(connected)
      } catch {
        setIsConnected(false)
      } finally {
        setIsLoading(false)
      }
    }

    testConnection()
  }, [])

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-primary-500 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-slate-600">Connecting to GoHighLevel...</p>
        </div>
      </div>
    )
  }

  if (!isConnected) {
    return <ConnectionTest onRetry={() => window.location.reload()} />
  }

  return (
    <Layout>
      <Routes>
        <Route path="/" element={<Navigate to="/dashboard" replace />} />
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="/pipeline" element={<Pipeline />} />
        <Route path="/contacts" element={<Contacts />} />
        <Route path="/settings" element={<Settings />} />
      </Routes>
    </Layout>
  )
}

export default App
