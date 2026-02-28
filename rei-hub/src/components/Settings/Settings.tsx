import { useState, useEffect } from 'react'
import { Save, Key, MapPin, Check, AlertTriangle, Globe, Calculator, Loader2 } from 'lucide-react'
import { getConfigStatus, getAuthHeader } from '@/services/auth'
import { toast } from 'sonner'
import HelmHubConnect from './helmhubconnect'
import AiProviderUserSettings from './AiProviderUserSettings'

const BASE_URL = import.meta.env.VITE_REI_SERVER_URL ?? 'http://localhost:8001'

export default function Settings() {
  const config = getConfigStatus()

  const [settings, setSettings] = useState({
    apiKey: import.meta.env.VITE_API_KEY ? '••••••••••••••••' : '',
    locationId: import.meta.env.VITE_API_LOCATION_ID || '',
    wpUrl: localStorage.getItem('wp_url') || '',
    wpUsername: localStorage.getItem('wp_username') || '',
    wpAppPassword: localStorage.getItem('wp_app_password') || '',
  })

  // ── Deal Analyzer Preferences ──────────────────────────────
  const [analyzerPrefs, setAnalyzerPrefs] = useState({
    arv_multiplier: '70',
    default_closing_costs_pct: '3',
    default_agent_commission_pct: '6',
    default_holding_months: '6',
    default_monthly_holding_cost: '1000',
    min_profit: '20000',
    min_roi_pct: '15',
    sub2_default_interest_rate: '4',
    sub2_default_rental_income: '1500',
    sub2_default_vacancy_pct: '8',
    sub2_default_mgmt_pct: '10',
    of_default_interest_rate: '6',
    of_default_term_years: '30',
    of_default_down_pct: '10',
    lo_default_option_term_years: '3',
    lo_default_monthly_credit_pct: '20',
    blend_cash_pct: '50',
  })
  const [analyzerLoading, setAnalyzerLoading] = useState(true)
  const [analyzerSaving, setAnalyzerSaving] = useState(false)

  useEffect(() => {
    async function loadAnalyzerPrefs() {
      try {
        const res = await fetch(`${BASE_URL}/api/deals/analyzer/preferences`, {
          headers: getAuthHeader(),
        })
        if (res.ok) {
          const data = await res.json()
          setAnalyzerPrefs({
            arv_multiplier: ((data.arv_multiplier ?? 0.70) * 100).toString(),
            default_closing_costs_pct: ((data.default_closing_costs_pct ?? 0.03) * 100).toString(),
            default_agent_commission_pct: ((data.default_agent_commission_pct ?? 0.06) * 100).toString(),
            default_holding_months: (data.default_holding_months ?? 6).toString(),
            default_monthly_holding_cost: (data.default_monthly_holding_cost ?? 1000).toString(),
            min_profit: (data.min_profit ?? 20000).toString(),
            min_roi_pct: ((data.min_roi_pct ?? 0.15) * 100).toString(),
            sub2_default_interest_rate: ((data.sub2_default_interest_rate ?? 0.04) * 100).toString(),
            sub2_default_rental_income: (data.sub2_default_rental_income ?? 1500).toString(),
            sub2_default_vacancy_pct: ((data.sub2_default_vacancy_pct ?? 0.08) * 100).toString(),
            sub2_default_mgmt_pct: ((data.sub2_default_mgmt_pct ?? 0.10) * 100).toString(),
            of_default_interest_rate: ((data.of_default_interest_rate ?? 0.06) * 100).toString(),
            of_default_term_years: (data.of_default_term_years ?? 30).toString(),
            of_default_down_pct: ((data.of_default_down_pct ?? 0.10) * 100).toString(),
            lo_default_option_term_years: (data.lo_default_option_term_years ?? 3).toString(),
            lo_default_monthly_credit_pct: ((data.lo_default_monthly_credit_pct ?? 0.20) * 100).toString(),
            blend_cash_pct: ((data.blend_cash_pct ?? 0.50) * 100).toString(),
          })
        }
      } catch {
        // use defaults
      } finally {
        setAnalyzerLoading(false)
      }
    }
    loadAnalyzerPrefs()
  }, [])

  const handleSaveAnalyzerPrefs = async () => {
    setAnalyzerSaving(true)
    try {
      const payload: Record<string, number> = {
        arv_multiplier: parseFloat(analyzerPrefs.arv_multiplier) / 100,
        default_closing_costs_pct: parseFloat(analyzerPrefs.default_closing_costs_pct) / 100,
        default_agent_commission_pct: parseFloat(analyzerPrefs.default_agent_commission_pct) / 100,
        default_holding_months: parseInt(analyzerPrefs.default_holding_months),
        default_monthly_holding_cost: parseFloat(analyzerPrefs.default_monthly_holding_cost),
        min_profit: parseFloat(analyzerPrefs.min_profit),
        min_roi_pct: parseFloat(analyzerPrefs.min_roi_pct) / 100,
        sub2_default_interest_rate: parseFloat(analyzerPrefs.sub2_default_interest_rate) / 100,
        sub2_default_rental_income: parseFloat(analyzerPrefs.sub2_default_rental_income),
        sub2_default_vacancy_pct: parseFloat(analyzerPrefs.sub2_default_vacancy_pct) / 100,
        sub2_default_mgmt_pct: parseFloat(analyzerPrefs.sub2_default_mgmt_pct) / 100,
        of_default_interest_rate: parseFloat(analyzerPrefs.of_default_interest_rate) / 100,
        of_default_term_years: parseInt(analyzerPrefs.of_default_term_years),
        of_default_down_pct: parseFloat(analyzerPrefs.of_default_down_pct) / 100,
        lo_default_option_term_years: parseInt(analyzerPrefs.lo_default_option_term_years),
        lo_default_monthly_credit_pct: parseFloat(analyzerPrefs.lo_default_monthly_credit_pct) / 100,
        blend_cash_pct: parseFloat(analyzerPrefs.blend_cash_pct) / 100,
      }
      const res = await fetch(`${BASE_URL}/api/deals/analyzer/preferences`, {
        method: 'PATCH',
        headers: { ...getAuthHeader(), 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      if (!res.ok) throw new Error('Failed to save')
      toast.success('Analyzer defaults saved.')
    } catch {
      toast.error('Failed to save analyzer defaults.')
    } finally {
      setAnalyzerSaving(false)
    }
  }

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
    <div className="space-y-6 max-w-2xl mx-auto">
      {/* Header */}
      <div>
        <h1 className="text-xl md:text-2xl font-bold text-slate-800">Settings</h1>
        <p className="text-sm md:text-base text-slate-600">Configure your API connection and preferences</p>
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
      <div className="bg-white rounded-xl border border-slate-200 p-4 md:p-6">
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

      {/* AI Provider Settings (only shown if admin allows override) */}
      <AiProviderUserSettings />

      {/* Deal Analyzer Defaults */}
      <div className="bg-white rounded-xl border border-slate-200 p-4 md:p-6">
        <div className="flex items-center gap-2 mb-1">
          <Calculator className="w-5 h-5 text-primary-500" />
          <h2 className="text-lg font-semibold text-slate-800">Deal Analyzer</h2>
        </div>
        <p className="text-sm text-slate-600 mb-4">
          Set default values for your deal analysis calculations.
        </p>

        {analyzerLoading ? (
          <div className="flex items-center justify-center h-24">
            <Loader2 className="w-5 h-5 animate-spin text-primary-500" />
          </div>
        ) : (
          <div className="space-y-5">
            {/* General */}
            <div>
              <h3 className="text-sm font-semibold text-slate-700 mb-3">General</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">ARV Multiplier (%)</label>
                  <input type="number" step="1" value={analyzerPrefs.arv_multiplier}
                    onChange={(e) => setAnalyzerPrefs({ ...analyzerPrefs, arv_multiplier: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Closing Costs (%)</label>
                  <input type="number" step="0.5" value={analyzerPrefs.default_closing_costs_pct}
                    onChange={(e) => setAnalyzerPrefs({ ...analyzerPrefs, default_closing_costs_pct: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Agent Commission (%)</label>
                  <input type="number" step="0.5" value={analyzerPrefs.default_agent_commission_pct}
                    onChange={(e) => setAnalyzerPrefs({ ...analyzerPrefs, default_agent_commission_pct: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Holding Months</label>
                  <input type="number" step="1" value={analyzerPrefs.default_holding_months}
                    onChange={(e) => setAnalyzerPrefs({ ...analyzerPrefs, default_holding_months: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Monthly Holding Cost ($)</label>
                  <input type="number" value={analyzerPrefs.default_monthly_holding_cost}
                    onChange={(e) => setAnalyzerPrefs({ ...analyzerPrefs, default_monthly_holding_cost: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Min Profit Target ($)</label>
                  <input type="number" value={analyzerPrefs.min_profit}
                    onChange={(e) => setAnalyzerPrefs({ ...analyzerPrefs, min_profit: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Min ROI Target (%)</label>
                  <input type="number" step="1" value={analyzerPrefs.min_roi_pct}
                    onChange={(e) => setAnalyzerPrefs({ ...analyzerPrefs, min_roi_pct: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500" />
                </div>
              </div>
            </div>

            {/* Subject-To */}
            <div>
              <h3 className="text-sm font-semibold text-slate-700 mb-3">Subject-To Defaults</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Interest Rate (%)</label>
                  <input type="number" step="0.25" value={analyzerPrefs.sub2_default_interest_rate}
                    onChange={(e) => setAnalyzerPrefs({ ...analyzerPrefs, sub2_default_interest_rate: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Rental Income ($)</label>
                  <input type="number" value={analyzerPrefs.sub2_default_rental_income}
                    onChange={(e) => setAnalyzerPrefs({ ...analyzerPrefs, sub2_default_rental_income: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Vacancy Rate (%)</label>
                  <input type="number" step="1" value={analyzerPrefs.sub2_default_vacancy_pct}
                    onChange={(e) => setAnalyzerPrefs({ ...analyzerPrefs, sub2_default_vacancy_pct: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Management Fee (%)</label>
                  <input type="number" step="1" value={analyzerPrefs.sub2_default_mgmt_pct}
                    onChange={(e) => setAnalyzerPrefs({ ...analyzerPrefs, sub2_default_mgmt_pct: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500" />
                </div>
              </div>
            </div>

            {/* Owner Financing */}
            <div>
              <h3 className="text-sm font-semibold text-slate-700 mb-3">Owner Financing Defaults</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Interest Rate (%)</label>
                  <input type="number" step="0.25" value={analyzerPrefs.of_default_interest_rate}
                    onChange={(e) => setAnalyzerPrefs({ ...analyzerPrefs, of_default_interest_rate: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Term (Years)</label>
                  <input type="number" step="1" value={analyzerPrefs.of_default_term_years}
                    onChange={(e) => setAnalyzerPrefs({ ...analyzerPrefs, of_default_term_years: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Down Payment (%)</label>
                  <input type="number" step="1" value={analyzerPrefs.of_default_down_pct}
                    onChange={(e) => setAnalyzerPrefs({ ...analyzerPrefs, of_default_down_pct: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500" />
                </div>
              </div>
            </div>

            {/* Lease Option */}
            <div>
              <h3 className="text-sm font-semibold text-slate-700 mb-3">Lease Option Defaults</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Option Term (Years)</label>
                  <input type="number" step="1" value={analyzerPrefs.lo_default_option_term_years}
                    onChange={(e) => setAnalyzerPrefs({ ...analyzerPrefs, lo_default_option_term_years: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Monthly Rent Credit (%)</label>
                  <input type="number" step="1" value={analyzerPrefs.lo_default_monthly_credit_pct}
                    onChange={(e) => setAnalyzerPrefs({ ...analyzerPrefs, lo_default_monthly_credit_pct: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500" />
                </div>
              </div>
            </div>

            {/* Blend */}
            <div>
              <h3 className="text-sm font-semibold text-slate-700 mb-3">Blend Defaults</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Cash Weight (%)</label>
                  <input type="number" step="5" value={analyzerPrefs.blend_cash_pct}
                    onChange={(e) => setAnalyzerPrefs({ ...analyzerPrefs, blend_cash_pct: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500" />
                </div>
              </div>
            </div>

            <div className="pt-4 border-t border-slate-200">
              <button
                onClick={handleSaveAnalyzerPrefs}
                disabled={analyzerSaving}
                className="flex items-center gap-2 px-4 py-2 bg-primary-500 text-white rounded-lg hover:bg-primary-600 transition-colors disabled:opacity-50"
              >
                {analyzerSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                Save Defaults
              </button>
            </div>
          </div>
        )}
      </div>

      {/* WordPress Publishing */}
      <div className="bg-white rounded-xl border border-slate-200 p-4 md:p-6">
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
      <div className="bg-slate-50 rounded-xl border border-slate-200 p-4 md:p-6">
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
VITE_API_BASE_URL=https://your-crm-api-url.com
VITE_REI_SERVER_URL=http://localhost:8001`}
        </pre>
      </div>
    </div>
  )
}