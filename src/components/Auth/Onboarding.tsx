import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Building2, Key, MapPin, ArrowRight, Loader2, HelpCircle } from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'

export default function Onboarding() {
  const navigate = useNavigate()
  const { completeOnboarding, profile } = useAuth()

  const [companyName, setCompanyName] = useState('')
  const [ghlApiKey, setGhlApiKey] = useState('')
  const [ghlLocationId, setGhlLocationId] = useState('')
  const [error, setError] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [showHelp, setShowHelp] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setIsLoading(true)

    const { error: onboardError } = await completeOnboarding({
      companyName,
      ghlApiKey,
      ghlLocationId,
    })

    if (onboardError) {
      setError(onboardError)
      setIsLoading(false)
    } else {
      navigate('/dashboard')
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-primary-900 via-primary-800 to-primary-700 flex items-center justify-center p-4">
      <div className="w-full max-w-lg">
        {/* Header */}
        <div className="text-center mb-8">
          <img
            src="/logo.png"
            alt="REI Fundamentals Hub"
            className="h-20 mx-auto mb-4"
          />
          <h1 className="text-2xl font-bold text-white">
            Welcome{profile?.full_name ? `, ${profile.full_name}` : ''}!
          </h1>
          <p className="text-primary-200 mt-1">Let's connect your CRM to get started</p>
        </div>

        {/* Form Card */}
        <div className="bg-white rounded-2xl shadow-xl p-8">
          {/* Steps indicator */}
          <div className="flex items-center gap-3 mb-6">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 bg-primary-800 text-white rounded-full flex items-center justify-center text-sm font-bold">
                1
              </div>
              <span className="text-sm font-medium text-slate-700">Company Info</span>
            </div>
            <div className="flex-1 h-px bg-slate-300" />
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 bg-primary-800 text-white rounded-full flex items-center justify-center text-sm font-bold">
                2
              </div>
              <span className="text-sm font-medium text-slate-700">API Credentials</span>
            </div>
          </div>

          <form onSubmit={handleSubmit} className="space-y-5">
            {error && (
              <div className="p-3 bg-red-50 border border-red-200 rounded-lg">
                <p className="text-sm text-red-700">{error}</p>
              </div>
            )}

            {/* Company Name */}
            <div>
              <label className="flex items-center gap-2 text-sm font-medium text-slate-700 mb-1">
                <Building2 className="w-4 h-4" />
                Company / Business Name
              </label>
              <input
                type="text"
                value={companyName}
                onChange={(e) => setCompanyName(e.target.value)}
                placeholder="Your Real Estate Business"
                required
                className="w-full px-4 py-2.5 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
              />
            </div>

            {/* GHL API Key */}
            <div>
              <label className="flex items-center gap-2 text-sm font-medium text-slate-700 mb-1">
                <Key className="w-4 h-4" />
                GoHighLevel API Key
              </label>
              <input
                type="password"
                value={ghlApiKey}
                onChange={(e) => setGhlApiKey(e.target.value)}
                placeholder="Enter your GHL API key"
                required
                className="w-full px-4 py-2.5 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
              />
            </div>

            {/* GHL Location ID */}
            <div>
              <label className="flex items-center gap-2 text-sm font-medium text-slate-700 mb-1">
                <MapPin className="w-4 h-4" />
                Location ID (Sub-Account)
              </label>
              <input
                type="text"
                value={ghlLocationId}
                onChange={(e) => setGhlLocationId(e.target.value)}
                placeholder="Enter your Location ID"
                required
                className="w-full px-4 py-2.5 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
              />
            </div>

            {/* Help toggle */}
            <button
              type="button"
              onClick={() => setShowHelp(!showHelp)}
              className="flex items-center gap-1.5 text-sm text-primary-600 hover:text-primary-700"
            >
              <HelpCircle className="w-4 h-4" />
              Where do I find these?
            </button>

            {showHelp && (
              <div className="bg-slate-50 rounded-lg p-4 text-sm text-slate-600 space-y-3">
                <div>
                  <p className="font-medium text-slate-700">API Key:</p>
                  <p>Go to your GHL dashboard &rarr; Settings &rarr; Business Profile &rarr; API Keys. Generate a new key or copy your existing one.</p>
                </div>
                <div>
                  <p className="font-medium text-slate-700">Location ID:</p>
                  <p>In GHL, go to Settings &rarr; Business Profile. Your Location ID is displayed at the top of the page, or in the URL after <code className="px-1 bg-slate-200 rounded">/location/</code>.</p>
                </div>
              </div>
            )}

            {/* Submit */}
            <button
              type="submit"
              disabled={isLoading}
              className="w-full flex items-center justify-center gap-2 py-3 bg-accent-600 text-white rounded-lg hover:bg-accent-700 transition-colors font-medium text-lg disabled:opacity-50"
            >
              {isLoading ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  Setting up your account...
                </>
              ) : (
                <>
                  Launch My CRM
                  <ArrowRight className="w-5 h-5" />
                </>
              )}
            </button>
          </form>
        </div>
      </div>
    </div>
  )
}
