import { useState } from 'react'
import { Save, Key, MapPin, Check, AlertTriangle, Globe } from 'lucide-react'
import { getConfigStatus } from '@/services/auth'
import { toast } from 'sonner'
import HelmHubConnect from './HelmHubConnect'

export default function Settings() {
  const config = getConfigStatus()

  const [settings, setSettings] = useState({
    apiKey: import.meta.env.VITE_API_KEY ? '••••••••••••••••' : '',
    locationId: import.meta.env.VITE_API_LOCATION_ID || '',
    wpUrl: localStorage.getItem('wp_url') || '',
    wpUsername: localStorage.getItem('wp_username') || '',
    wpAppPassword: localStorage.getItem('wp_app_password') || '',
  })

  const handleSaveWordPress = () => {
    localStorage.setItem('wp_url', settings.wpUrl)
    localStorage.setItem('wp_username', settings.wpUsername)
    localStorage.setItem('wp_app_password', settings.wpAppPassword)
    toast.success('WordPress connection saved.')
  }

  const wpConnected = !!(settings.wpUrl && settings.wpUsername && settings.wpAppPassword)

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
        <p className="text-slate-600">Configure your API connection and preferences</p>
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
              {config.isFullyConfigured ? 'API Connected' : 'Configuration incomplete'}
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

      {/* Helm Hub AI Connection */}
      <HelmHubConnect />

      {/* WordPress Publishing */}
      <div className="bg-white rounded-xl border border-slate-200 p-6">
        <div className="flex items-center gap-2 mb-1">
          <h2 className="text-lg font-semibold text-slate-800">
            WordPress Publishing
          </h2>
          {wpConnected && (
            <span className="bg-green-100 text-green-700 text-xs px-2 py-0.5 rounded-full">
              Connected
            </span>
          )}
        </div>
        <p className="text-sm text-slate-600 mb-4">
          Connect your WordPress site to publish blog posts directly from ContentHub.
        </p>

        <div className="space-y-4">
          {/* WordPress Site URL */}
          <div>
            <label className="flex items-center gap-2 text-sm font-medium text-slate-700 mb-1">
              <Globe className="w-4 h-4" />
              WordPress Site URL
            </label>
            <input
              type="url"
              value={settings.wpUrl}
              onChange={(e) =>
                setSettings({ ...settings, wpUrl: e.target.value })
              }
              placeholder="https://yoursite.com"
              className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
            />
          </div>

          {/* Username */}
          <div>
            <label className="flex items-center gap-2 text-sm font-medium text-slate-700 mb-1">
              Username
            </label>
            <input
              type="text"
              value={settings.wpUsername}
              onChange={(e) =>
                setSettings({ ...settings, wpUsername: e.target.value })
              }
              placeholder="your-wp-username"
              className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
            />
          </div>

          {/* Application Password */}
          <div>
            <label className="flex items-center gap-2 text-sm font-medium text-slate-700 mb-1">
              Application Password
            </label>
            <input
              type="password"
              value={settings.wpAppPassword}
              onChange={(e) =>
                setSettings({ ...settings, wpAppPassword: e.target.value })
              }
              placeholder="xxxx xxxx xxxx xxxx"
              className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
            />
            <p className="text-xs text-slate-500 mt-1">
              Generate in WordPress → Users → Your Profile → Application Passwords
            </p>
          </div>
        </div>

        <div className="mt-6 pt-4 border-t border-slate-200">
          <button
            onClick={handleSaveWordPress}
            className="flex items-center gap-2 px-4 py-2 bg-primary-500 text-white rounded-lg hover:bg-primary-600 transition-colors"
          >
            <Save className="w-4 h-4" />
            Save WordPress Settings
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
{`VITE_API_KEY=your_api_key_here
VITE_API_LOCATION_ID=your_location_id_here
VITE_API_BASE_URL=https://services.leadconnectorhq.com
VITE_HELM_HUB_URL=http://localhost:8000`}
        </pre>
      </div>
    </div>
  )
}