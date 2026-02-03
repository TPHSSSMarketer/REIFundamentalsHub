import { AlertTriangle, RefreshCw, Settings, Play } from 'lucide-react'
import { getConfigStatus } from '@/services/auth'

interface ConnectionTestProps {
  onRetry: () => void
  onDemoMode?: () => void
}

export default function ConnectionTest({ onRetry, onDemoMode }: ConnectionTestProps) {
  const config = getConfigStatus()

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 p-4">
      <div className="max-w-md w-full bg-white rounded-xl shadow-lg p-8 text-center">
        <div className="w-16 h-16 bg-danger-50 rounded-full flex items-center justify-center mx-auto mb-4">
          <AlertTriangle className="w-8 h-8 text-danger-500" />
        </div>

        <h1 className="text-xl font-bold text-slate-800 mb-2">
          Connection Failed
        </h1>

        <p className="text-slate-600 mb-6">
          Unable to connect to GoHighLevel. Please check your configuration.
        </p>

        {/* Config Status */}
        <div className="bg-slate-50 rounded-lg p-4 mb-6 text-left">
          <h3 className="text-sm font-medium text-slate-700 mb-3">
            Configuration Status:
          </h3>
          <ul className="space-y-2 text-sm">
            <li className="flex items-center gap-2">
              <span
                className={`w-2 h-2 rounded-full ${
                  config.hasApiKey ? 'bg-success-500' : 'bg-danger-500'
                }`}
              />
              <span className="text-slate-600">
                API Key: {config.hasApiKey ? 'Configured' : 'Missing'}
              </span>
            </li>
            <li className="flex items-center gap-2">
              <span
                className={`w-2 h-2 rounded-full ${
                  config.hasLocationId ? 'bg-success-500' : 'bg-warning-500'
                }`}
              />
              <span className="text-slate-600">
                Location ID: {config.hasLocationId ? 'Configured' : 'Not Set'}
              </span>
            </li>
          </ul>
        </div>

        {/* Instructions */}
        <div className="bg-primary-50 rounded-lg p-4 mb-6 text-left">
          <h3 className="text-sm font-medium text-primary-700 mb-2">
            Setup Instructions:
          </h3>
          <ol className="text-sm text-primary-600 space-y-1 list-decimal list-inside">
            <li>Copy .env.example to .env</li>
            <li>Add your GHL API key</li>
            <li>Add your Location ID</li>
            <li>Restart the application</li>
          </ol>
        </div>

        {/* Actions */}
        <div className="space-y-3">
          <div className="flex gap-3">
            <button
              onClick={onRetry}
              className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-primary-500 text-white rounded-lg hover:bg-primary-600 transition-colors"
            >
              <RefreshCw className="w-4 h-4" />
              Retry Connection
            </button>
            <a
              href="https://app.gohighlevel.com"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-center gap-2 px-4 py-2.5 bg-slate-100 text-slate-700 rounded-lg hover:bg-slate-200 transition-colors"
            >
              <Settings className="w-4 h-4" />
              GHL Settings
            </a>
          </div>

          {/* Demo Mode Button */}
          {onDemoMode && (
            <button
              onClick={onDemoMode}
              className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-gradient-to-r from-purple-500 to-primary-500 text-white rounded-lg hover:from-purple-600 hover:to-primary-600 transition-all font-medium"
            >
              <Play className="w-4 h-4" />
              Try Demo Mode (No API Required)
            </button>
          )}
        </div>

        {onDemoMode && (
          <p className="text-xs text-slate-500 mt-4">
            Demo mode uses sample data so you can explore all features without connecting to GHL.
          </p>
        )}
      </div>
    </div>
  )
}
