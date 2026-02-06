import { useState } from 'react'
import { Save, Key, MapPin, Check, AlertTriangle, Calendar, LinkIcon, Unlink, Loader2 } from 'lucide-react'
import { getConfigStatus } from '@/services/auth'
import { useGoogleCalendar } from '@/hooks/useGoogleCalendar'
import { toast } from 'sonner'

export default function Settings() {
  const config = getConfigStatus()
  const {
    isConfigured: isGCalConfigured,
    isAuthorized: isGCalAuthorized,
    error: gCalError,
    authorize: gCalAuthorize,
    disconnect: gCalDisconnect,
  } = useGoogleCalendar()

  const [isConnectingGCal, setIsConnectingGCal] = useState(false)

  const [settings, setSettings] = useState({
    apiKey: import.meta.env.VITE_API_KEY ? '••••••••••••••••' : '',
    locationId: import.meta.env.VITE_API_LOCATION_ID || '',
  })

  const handleSave = () => {
    toast.info(
      'Settings are managed via environment variables. Update your .env file and restart the app.'
    )
  }

  const handleGCalConnect = async () => {
    setIsConnectingGCal(true)
    try {
      await gCalAuthorize()
      toast.success('Google Calendar connected successfully!')
    } catch {
      toast.error('Failed to connect Google Calendar')
    } finally {
      setIsConnectingGCal(false)
    }
  }

  const handleGCalDisconnect = () => {
    gCalDisconnect()
    toast.success('Google Calendar disconnected')
  }

  return (
    <div className="space-y-6 max-w-2xl">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-slate-800">Settings</h1>
        <p className="text-slate-600">Configure your API connections and integrations</p>
      </div>

      {/* CRM Connection Status */}
      <div
        className={`p-4 rounded-lg border ${
          config.isFullyConfigured
            ? 'bg-success-50 border-success-200'
            : 'bg-warning-50 border-warning-200'
        }`}
      >
        <div className="flex items-center gap-3">
          {config.isFullyConfigured ? (
            <Check className="w-5 h-5 text-success-600" />
          ) : (
            <AlertTriangle className="w-5 h-5 text-warning-600" />
          )}
          <div>
            <p
              className={`font-medium ${
                config.isFullyConfigured ? 'text-success-800' : 'text-warning-800'
              }`}
            >
              {config.isFullyConfigured
                ? 'CRM API Connected'
                : 'CRM Configuration Incomplete'}
            </p>
            <p
              className={`text-sm ${
                config.isFullyConfigured ? 'text-success-600' : 'text-warning-600'
              }`}
            >
              {config.isFullyConfigured
                ? 'Your CRM API connection is working properly'
                : 'Please configure your API key and location ID'}
            </p>
          </div>
        </div>
      </div>

      {/* API Settings */}
      <div className="bg-white rounded-xl border border-slate-200 p-6">
        <h2 className="text-lg font-semibold text-slate-800 mb-4">
          CRM API Configuration
        </h2>

        <div className="space-y-4">
          {/* API Key */}
          <div>
            <label className="flex items-center gap-2 text-sm font-medium text-slate-700 mb-1">
              <Key className="w-4 h-4" />
              API Key
            </label>
            <input
              type="password"
              value={settings.apiKey}
              onChange={(e) =>
                setSettings({ ...settings, apiKey: e.target.value })
              }
              placeholder="Enter your API key"
              className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
            />
            <p className="text-xs text-slate-500 mt-1">
              Your CRM API key for authentication
            </p>
          </div>

          {/* Location ID */}
          <div>
            <label className="flex items-center gap-2 text-sm font-medium text-slate-700 mb-1">
              <MapPin className="w-4 h-4" />
              Location ID
            </label>
            <input
              type="text"
              value={settings.locationId}
              onChange={(e) =>
                setSettings({ ...settings, locationId: e.target.value })
              }
              placeholder="Enter your Location ID"
              className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
            />
            <p className="text-xs text-slate-500 mt-1">
              Your sub-account location identifier
            </p>
          </div>
        </div>

        <div className="mt-6 pt-4 border-t border-slate-200">
          <button
            onClick={handleSave}
            className="flex items-center gap-2 px-4 py-2 bg-primary-500 text-white rounded-lg hover:bg-primary-600 transition-colors"
          >
            <Save className="w-4 h-4" />
            Save Settings
          </button>
        </div>
      </div>

      {/* Google Calendar Integration */}
      <div className="bg-white rounded-xl border border-slate-200 p-6">
        <div className="flex items-center gap-3 mb-4">
          <div className="p-2 bg-blue-100 rounded-lg">
            <Calendar className="w-5 h-5 text-blue-600" />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-slate-800">Google Calendar</h2>
            <p className="text-sm text-slate-500">Sync your Smart Scheduler with Google Calendar</p>
          </div>
        </div>

        {/* Connection Status */}
        <div
          className={`p-3 rounded-lg border mb-4 ${
            isGCalAuthorized
              ? 'bg-success-50 border-success-200'
              : isGCalConfigured
                ? 'bg-slate-50 border-slate-200'
                : 'bg-warning-50 border-warning-200'
          }`}
        >
          <div className="flex items-center gap-2">
            {isGCalAuthorized ? (
              <>
                <Check className="w-4 h-4 text-success-600" />
                <span className="text-sm font-medium text-success-800">Connected to Google Calendar</span>
              </>
            ) : isGCalConfigured ? (
              <>
                <LinkIcon className="w-4 h-4 text-slate-500" />
                <span className="text-sm font-medium text-slate-700">Ready to connect — credentials configured</span>
              </>
            ) : (
              <>
                <AlertTriangle className="w-4 h-4 text-warning-600" />
                <span className="text-sm font-medium text-warning-800">
                  Google Calendar credentials not configured
                </span>
              </>
            )}
          </div>
        </div>

        {gCalError && (
          <div className="p-3 rounded-lg border bg-red-50 border-red-200 mb-4">
            <p className="text-sm text-red-700">{gCalError}</p>
          </div>
        )}

        {/* Actions */}
        <div className="flex gap-3">
          {isGCalAuthorized ? (
            <button
              onClick={handleGCalDisconnect}
              className="flex items-center gap-2 px-4 py-2 border border-red-300 text-red-700 rounded-lg hover:bg-red-50 transition-colors"
            >
              <Unlink className="w-4 h-4" />
              Disconnect
            </button>
          ) : isGCalConfigured ? (
            <button
              onClick={handleGCalConnect}
              disabled={isConnectingGCal}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50"
            >
              {isConnectingGCal ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Connecting...
                </>
              ) : (
                <>
                  <LinkIcon className="w-4 h-4" />
                  Connect Google Calendar
                </>
              )}
            </button>
          ) : (
            <p className="text-sm text-slate-600">
              Add <code className="px-1 bg-slate-200 rounded">VITE_GOOGLE_CLIENT_ID</code> and{' '}
              <code className="px-1 bg-slate-200 rounded">VITE_GOOGLE_API_KEY</code> to your{' '}
              <code className="px-1 bg-slate-200 rounded">.env</code> file to enable Google Calendar.
            </p>
          )}
        </div>

        {/* Features */}
        {isGCalConfigured && (
          <div className="mt-4 pt-4 border-t border-slate-200">
            <h3 className="text-sm font-medium text-slate-700 mb-2">When connected, you can:</h3>
            <ul className="space-y-1">
              <li className="flex items-center gap-2 text-sm text-slate-600">
                <Check className="w-3.5 h-3.5 text-primary-500" />
                View Google Calendar events in Smart Scheduler
              </li>
              <li className="flex items-center gap-2 text-sm text-slate-600">
                <Check className="w-3.5 h-3.5 text-primary-500" />
                Sync new appointments to Google Calendar
              </li>
              <li className="flex items-center gap-2 text-sm text-slate-600">
                <Check className="w-3.5 h-3.5 text-primary-500" />
                Check availability using free/busy data
              </li>
            </ul>
          </div>
        )}
      </div>

      {/* Environment Variables Help */}
      <div className="bg-slate-50 rounded-xl border border-slate-200 p-6">
        <h3 className="font-semibold text-slate-800 mb-3">
          Environment Variables
        </h3>
        <p className="text-sm text-slate-600 mb-4">
          Settings are configured via environment variables for security. Create a
          <code className="mx-1 px-1 bg-slate-200 rounded">.env</code> file in the
          project root:
        </p>
        <pre className="bg-slate-800 text-slate-100 p-4 rounded-lg text-sm overflow-x-auto">
          {`# CRM API Configuration
VITE_API_KEY=your_api_key_here
VITE_API_LOCATION_ID=your_location_id_here
VITE_API_BASE_URL=https://services.leadconnectorhq.com

# Google Calendar Integration
VITE_GOOGLE_CLIENT_ID=your_google_client_id.apps.googleusercontent.com
VITE_GOOGLE_API_KEY=your_google_api_key_here`}
        </pre>
        <p className="text-xs text-slate-500 mt-3">
          Google Calendar credentials can be obtained from the{' '}
          <a
            href="https://console.cloud.google.com/apis/credentials"
            target="_blank"
            rel="noopener noreferrer"
            className="text-primary-600 hover:underline"
          >
            Google Cloud Console
          </a>
          . Enable the Google Calendar API and create OAuth 2.0 credentials.
        </p>
      </div>
    </div>
  )
}
