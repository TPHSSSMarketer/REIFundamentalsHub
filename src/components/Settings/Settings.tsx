import { useState } from 'react'
import { Save, Key, MapPin, Check, AlertTriangle } from 'lucide-react'
import { getConfigStatus } from '@/services/auth'
import { toast } from 'sonner'

export default function Settings() {
  const config = getConfigStatus()

  const [settings, setSettings] = useState({
    apiKey: import.meta.env.VITE_GHL_API_KEY ? '••••••••••••••••' : '',
    locationId: import.meta.env.VITE_GHL_LOCATION_ID || '',
  })

  const handleSave = () => {
    // In production, this would update server-side env vars
    toast.info(
      'Settings are managed via environment variables. Update your .env file and restart the app.'
    )
  }

  return (
    <div className="space-y-6 max-w-2xl">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-slate-800">Settings</h1>
        <p className="text-slate-600">Configure your GHL connection and preferences</p>
      </div>

      {/* Connection Status */}
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
                ? 'Connected to GoHighLevel'
                : 'Configuration incomplete'}
            </p>
            <p
              className={`text-sm ${
                config.isFullyConfigured ? 'text-success-600' : 'text-warning-600'
              }`}
            >
              {config.isFullyConfigured
                ? 'Your API connection is working properly'
                : 'Please configure your API key and location ID'}
            </p>
          </div>
        </div>
      </div>

      {/* API Settings */}
      <div className="bg-white rounded-xl border border-slate-200 p-6">
        <h2 className="text-lg font-semibold text-slate-800 mb-4">
          API Configuration
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
              placeholder="Enter your GHL API key"
              className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
            />
            <p className="text-xs text-slate-500 mt-1">
              Find your API key in GHL Settings → Business Profile → API
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
              Your GHL sub-account location identifier
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
          {`VITE_GHL_API_KEY=your_api_key_here
VITE_GHL_LOCATION_ID=your_location_id_here
VITE_GHL_API_BASE_URL=https://services.leadconnectorhq.com`}
        </pre>
      </div>
    </div>
  )
}
