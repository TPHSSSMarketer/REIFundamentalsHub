import { useState, useEffect } from 'react'
import { Save, Globe, Calculator, Loader2, Cloud, HardDrive, Building2, User, Sun, Moon, Monitor } from 'lucide-react'
import { useSearchParams } from 'react-router-dom'
import { getAuthHeader } from '@/services/auth'
import { toast } from 'sonner'
import HelmHubConnect from './helmhubconnect'
import AiProviderUserSettings from './AiProviderUserSettings'
import { useTheme } from '@/hooks/useTheme'
import { getOnboardingStatus, saveStep } from '@/services/onboardingApi'
import {
  getGoogleDriveAuthUrl,
  submitGoogleDriveCode,
  disconnectGoogleDrive,
  getGoogleDriveStatus,
  getDropboxAuthUrl,
  submitDropboxCode,
  disconnectDropbox,
  getDropboxStatus,
} from '@/services/cloudStorageApi'

const BASE_URL = import.meta.env.VITE_REI_SERVER_URL ?? 'http://localhost:8001'

export default function Settings() {
  const [searchParams] = useSearchParams()
  const { theme, setTheme } = useTheme()

  const [settings, setSettings] = useState({
    wpUrl: localStorage.getItem('wp_url') || '',
    wpUsername: localStorage.getItem('wp_username') || '',
    wpAppPassword: localStorage.getItem('wp_app_password') || '',
  })

  // Cloud Storage state
  const [googleDriveStatus, setGoogleDriveStatus] = useState<{ connected: boolean; email?: string } | null>(null)
  const [dropboxStatus, setDropboxStatus] = useState<{ connected: boolean; email?: string } | null>(null)
  const [cloudStorageLoading, setCloudStorageLoading] = useState(true)
  const [googleDriveConnecting, setGoogleDriveConnecting] = useState(false)
  const [dropboxConnecting, setDropboxConnecting] = useState(false)
  const [googleDriveDisconnecting, setGoogleDriveDisconnecting] = useState(false)
  const [dropboxDisconnecting, setDropboxDisconnecting] = useState(false)

  // ── Profile & Company ────────────────────────────────────
  const [profileLoading, setProfileLoading] = useState(true)
  const [profileSaving, setProfileSaving] = useState(false)
  const [companyInfo, setCompanyInfo] = useState({
    company_name: '',
    company_address: '',
    company_city: '',
    company_state: '',
    company_zip: '',
    company_phone: '',
    company_website: '',
  })
  const [investingProfile, setInvestingProfile] = useState({
    investing_experience: '',
    deal_types: [] as string[],
    primary_market: '',
  })

  useEffect(() => {
    async function loadProfile() {
      try {
        const status = await getOnboardingStatus()
        const u = status.user
        setCompanyInfo({
          company_name: u.company_name ?? '',
          company_address: u.company_address ?? '',
          company_city: u.company_city ?? '',
          company_state: u.company_state ?? '',
          company_zip: u.company_zip ?? '',
          company_phone: u.company_phone ?? '',
          company_website: u.company_website ?? '',
        })
        // deal_types comes as comma-separated string from the backend
        const dtArr = u.deal_types ? u.deal_types.split(',').map((s: string) => s.trim()).filter(Boolean) : []
        setInvestingProfile({
          investing_experience: u.investing_experience ?? '',
          deal_types: dtArr,
          primary_market: u.primary_market ?? '',
        })
      } catch {
        // silently fail — user may not be fully authenticated yet
      } finally {
        setProfileLoading(false)
      }
    }
    loadProfile()
  }, [])

  const handleSaveCompanyInfo = async () => {
    setProfileSaving(true)
    try {
      await saveStep(1, companyInfo)
      toast.success('Company info saved.')
    } catch {
      toast.error('Failed to save company info.')
    } finally {
      setProfileSaving(false)
    }
  }

  const handleSaveInvestingProfile = async () => {
    setProfileSaving(true)
    try {
      await saveStep(2, {
        investing_experience: investingProfile.investing_experience,
        deal_types: investingProfile.deal_types,
        primary_market: investingProfile.primary_market,
      })
      toast.success('Investing profile saved.')
    } catch {
      toast.error('Failed to save investing profile.')
    } finally {
      setProfileSaving(false)
    }
  }

  const toggleDealType = (type: string) => {
    setInvestingProfile((prev) => ({
      ...prev,
      deal_types: prev.deal_types.includes(type)
        ? prev.deal_types.filter((t) => t !== type)
        : [...prev.deal_types, type],
    }))
  }

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

  useEffect(() => {
    loadCloudStorageStatus()
  }, [])

  useEffect(() => {
    const driveCode = searchParams.get('drive_code')
    if (driveCode) {
      handleGoogleDriveCallback(driveCode)
    }
    const dropboxCode = searchParams.get('dropbox_code')
    if (dropboxCode) {
      handleDropboxCallback(dropboxCode)
    }
  }, [searchParams])

  async function loadCloudStorageStatus() {
    setCloudStorageLoading(true)
    try {
      const [driveRes, dropboxRes] = await Promise.all([
        getGoogleDriveStatus(),
        getDropboxStatus(),
      ])
      setGoogleDriveStatus(driveRes)
      setDropboxStatus(dropboxRes)
    } catch {
      // use defaults
    } finally {
      setCloudStorageLoading(false)
    }
  }

  async function handleGoogleDriveConnect() {
    setGoogleDriveConnecting(true)
    try {
      const data = await getGoogleDriveAuthUrl()
      window.location.href = data.url
    } catch {
      toast.error('Failed to initiate Google Drive connection')
      setGoogleDriveConnecting(false)
    }
  }

  async function handleGoogleDriveCallback(code: string) {
    try {
      await submitGoogleDriveCode(code)
      toast.success('Google Drive connected successfully')
      await loadCloudStorageStatus()
    } catch {
      toast.error('Failed to connect Google Drive')
    }
  }

  async function handleGoogleDriveDisconnect() {
    setGoogleDriveDisconnecting(true)
    try {
      await disconnectGoogleDrive()
      toast.success('Google Drive disconnected')
      await loadCloudStorageStatus()
    } catch {
      toast.error('Failed to disconnect Google Drive')
      setGoogleDriveDisconnecting(false)
    }
  }

  async function handleDropboxConnect() {
    setDropboxConnecting(true)
    try {
      const data = await getDropboxAuthUrl()
      window.location.href = data.url
    } catch {
      toast.error('Failed to initiate Dropbox connection')
      setDropboxConnecting(false)
    }
  }

  async function handleDropboxCallback(code: string) {
    try {
      await submitDropboxCode(code)
      toast.success('Dropbox connected successfully')
      await loadCloudStorageStatus()
    } catch {
      toast.error('Failed to connect Dropbox')
    }
  }

  async function handleDropboxDisconnect() {
    setDropboxDisconnecting(true)
    try {
      await disconnectDropbox()
      toast.success('Dropbox disconnected')
      await loadCloudStorageStatus()
    } catch {
      toast.error('Failed to disconnect Dropbox')
      setDropboxDisconnecting(false)
    }
  }

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

  return (
    <div className="space-y-6 max-w-2xl mx-auto">
      {/* Header */}
      <div>
        <h1 className="text-xl md:text-2xl font-bold text-slate-800">Settings</h1>
        <p className="text-sm md:text-base text-slate-600">Configure your preferences and integrations</p>
      </div>

      {/* Appearance */}
      <div className="bg-white rounded-xl border border-slate-200 p-4 md:p-6">
        <div className="flex items-center gap-2 mb-1">
          <Monitor className="w-5 h-5 text-primary-500" />
          <h2 className="text-lg font-semibold text-slate-800">Appearance</h2>
        </div>
        <p className="text-sm text-slate-600 mb-4">
          Choose how the app looks. Pick Light or Dark mode.
        </p>
        <div className="flex gap-3">
          <button
            onClick={() => setTheme('light')}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-lg border text-sm font-medium transition-colors ${
              theme === 'light'
                ? 'bg-primary-50 border-primary-500 text-primary-700'
                : 'bg-white border-slate-300 text-slate-600 hover:border-primary-400'
            }`}
          >
            <Sun className="w-4 h-4" />
            Light Mode
          </button>
          <button
            onClick={() => setTheme('dark')}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-lg border text-sm font-medium transition-colors ${
              theme === 'dark'
                ? 'bg-primary-50 border-primary-500 text-primary-700'
                : 'bg-white border-slate-300 text-slate-600 hover:border-primary-400'
            }`}
          >
            <Moon className="w-4 h-4" />
            Dark Mode
          </button>
        </div>
      </div>

      {/* Profile & Company */}
      <div className="bg-white rounded-xl border border-slate-200 p-4 md:p-6">
        <div className="flex items-center gap-2 mb-1">
          <Building2 className="w-5 h-5 text-primary-500" />
          <h2 className="text-lg font-semibold text-slate-800">Profile & Company</h2>
        </div>
        <p className="text-sm text-slate-600 mb-4">
          Your company details and investing profile. You can update these any time.
        </p>

        {profileLoading ? (
          <div className="flex items-center justify-center h-24">
            <Loader2 className="w-5 h-5 animate-spin text-primary-500" />
          </div>
        ) : (
          <div className="space-y-6">
            {/* Company Info */}
            <div>
              <h3 className="text-sm font-semibold text-slate-700 mb-3">Company Information</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
                <div className="sm:col-span-2">
                  <label className="block text-sm font-medium text-slate-700 mb-1">Company Name</label>
                  <input type="text" value={companyInfo.company_name}
                    onChange={(e) => setCompanyInfo({ ...companyInfo, company_name: e.target.value })}
                    placeholder="Your Company LLC"
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500" />
                </div>
                <div className="sm:col-span-2">
                  <label className="block text-sm font-medium text-slate-700 mb-1">Street Address</label>
                  <input type="text" value={companyInfo.company_address}
                    onChange={(e) => setCompanyInfo({ ...companyInfo, company_address: e.target.value })}
                    placeholder="123 Main St"
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">City</label>
                  <input type="text" value={companyInfo.company_city}
                    onChange={(e) => setCompanyInfo({ ...companyInfo, company_city: e.target.value })}
                    placeholder="Austin"
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500" />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">State</label>
                    <input type="text" value={companyInfo.company_state} maxLength={2}
                      onChange={(e) => setCompanyInfo({ ...companyInfo, company_state: e.target.value.toUpperCase() })}
                      placeholder="TX"
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">ZIP</label>
                    <input type="text" value={companyInfo.company_zip} maxLength={10}
                      onChange={(e) => setCompanyInfo({ ...companyInfo, company_zip: e.target.value })}
                      placeholder="78701"
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500" />
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Phone</label>
                  <input type="tel" value={companyInfo.company_phone}
                    onChange={(e) => setCompanyInfo({ ...companyInfo, company_phone: e.target.value })}
                    placeholder="(555) 123-4567"
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Website</label>
                  <input type="url" value={companyInfo.company_website}
                    onChange={(e) => setCompanyInfo({ ...companyInfo, company_website: e.target.value })}
                    placeholder="https://yourcompany.com"
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500" />
                </div>
              </div>
              <div className="mt-4">
                <button
                  onClick={handleSaveCompanyInfo}
                  disabled={profileSaving}
                  className="flex items-center gap-2 px-4 py-2 bg-primary-500 text-white rounded-lg hover:bg-primary-600 transition-colors disabled:opacity-50"
                >
                  {profileSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                  Save Company Info
                </button>
              </div>
            </div>

            {/* Investing Profile */}
            <div className="border-t border-slate-200 pt-5">
              <h3 className="text-sm font-semibold text-slate-700 mb-3">Investing Profile</h3>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Experience Level</label>
                  <select
                    value={investingProfile.investing_experience}
                    onChange={(e) => setInvestingProfile({ ...investingProfile, investing_experience: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 bg-white"
                  >
                    <option value="">Select your experience level</option>
                    <option value="beginner">Beginner (0-2 deals)</option>
                    <option value="intermediate">Intermediate (3-10 deals)</option>
                    <option value="experienced">Experienced (10+ deals)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">Deal Types</label>
                  <div className="flex flex-wrap gap-2">
                    {[
                      { value: 'subject_to', label: 'Subject-To' },
                      { value: 'cash_purchase', label: 'Cash Purchase' },
                      { value: 'owner_financing', label: 'Owner Financing' },
                      { value: 'lease_option', label: 'Lease Option' },
                      { value: 'fix_and_flip', label: 'Fix & Flip' },
                    ].map((dt) => (
                      <button
                        key={dt.value}
                        type="button"
                        onClick={() => toggleDealType(dt.value)}
                        className={`px-3 py-1.5 rounded-full text-sm font-medium border transition-colors ${
                          investingProfile.deal_types.includes(dt.value)
                            ? 'bg-primary-500 text-white border-primary-500'
                            : 'bg-white text-slate-600 border-slate-300 hover:border-primary-400'
                        }`}
                      >
                        {dt.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Primary Market</label>
                  <input type="text" value={investingProfile.primary_market}
                    onChange={(e) => setInvestingProfile({ ...investingProfile, primary_market: e.target.value })}
                    placeholder="e.g. Dallas-Fort Worth, TX"
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500" />
                </div>
              </div>
              <div className="mt-4">
                <button
                  onClick={handleSaveInvestingProfile}
                  disabled={profileSaving}
                  className="flex items-center gap-2 px-4 py-2 bg-primary-500 text-white rounded-lg hover:bg-primary-600 transition-colors disabled:opacity-50"
                >
                  {profileSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                  Save Investing Profile
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

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

      {/* Cloud Storage */}
      <div className="bg-white rounded-xl border border-slate-200 p-4 md:p-6">
        <div className="flex items-center gap-2 mb-1">
          <Cloud className="w-5 h-5 text-primary-500" />
          <h2 className="text-lg font-semibold text-slate-800">Cloud Storage</h2>
        </div>
        <p className="text-sm text-slate-600 mb-4">
          Connect your cloud storage accounts for seamless file syncing.
        </p>

        {cloudStorageLoading ? (
          <div className="flex items-center justify-center h-24">
            <Loader2 className="w-5 h-5 animate-spin text-primary-500" />
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* Google Drive */}
            <div className="border border-slate-200 rounded-lg p-4">
              <div className="flex items-center gap-3 mb-3">
                <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center">
                  <HardDrive className="w-5 h-5 text-blue-600" />
                </div>
                <div>
                  <h3 className="font-medium text-slate-800">Google Drive</h3>
                  {googleDriveStatus?.connected && (
                    <p className="text-xs text-slate-500">{googleDriveStatus.email}</p>
                  )}
                </div>
                {googleDriveStatus?.connected && (
                  <span className="ml-auto bg-green-100 text-green-700 text-xs px-2 py-0.5 rounded-full">
                    Connected
                  </span>
                )}
              </div>
              {googleDriveStatus?.connected ? (
                <button
                  onClick={handleGoogleDriveDisconnect}
                  disabled={googleDriveDisconnecting}
                  className="w-full px-3 py-2 text-sm font-medium border border-slate-300 text-slate-700 rounded-lg hover:bg-slate-50 disabled:opacity-50 transition-colors"
                >
                  {googleDriveDisconnecting ? (
                    <span className="flex items-center justify-center gap-2">
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Disconnecting...
                    </span>
                  ) : (
                    'Disconnect'
                  )}
                </button>
              ) : (
                <button
                  onClick={handleGoogleDriveConnect}
                  disabled={googleDriveConnecting}
                  className="w-full px-3 py-2 text-sm font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
                >
                  {googleDriveConnecting ? (
                    <span className="flex items-center justify-center gap-2">
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Connecting...
                    </span>
                  ) : (
                    'Connect Google Drive'
                  )}
                </button>
              )}
            </div>

            {/* Dropbox */}
            <div className="border border-slate-200 rounded-lg p-4">
              <div className="flex items-center gap-3 mb-3">
                <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center">
                  <Cloud className="w-5 h-5 text-blue-600" />
                </div>
                <div>
                  <h3 className="font-medium text-slate-800">Dropbox</h3>
                  {dropboxStatus?.connected && (
                    <p className="text-xs text-slate-500">{dropboxStatus.email}</p>
                  )}
                </div>
                {dropboxStatus?.connected && (
                  <span className="ml-auto bg-green-100 text-green-700 text-xs px-2 py-0.5 rounded-full">
                    Connected
                  </span>
                )}
              </div>
              {dropboxStatus?.connected ? (
                <button
                  onClick={handleDropboxDisconnect}
                  disabled={dropboxDisconnecting}
                  className="w-full px-3 py-2 text-sm font-medium border border-slate-300 text-slate-700 rounded-lg hover:bg-slate-50 disabled:opacity-50 transition-colors"
                >
                  {dropboxDisconnecting ? (
                    <span className="flex items-center justify-center gap-2">
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Disconnecting...
                    </span>
                  ) : (
                    'Disconnect'
                  )}
                </button>
              ) : (
                <button
                  onClick={handleDropboxConnect}
                  disabled={dropboxConnecting}
                  className="w-full px-3 py-2 text-sm font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
                >
                  {dropboxConnecting ? (
                    <span className="flex items-center justify-center gap-2">
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Connecting...
                    </span>
                  ) : (
                    'Connect Dropbox'
                  )}
                </button>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Helm Hub AI Connection */}
      <HelmHubConnect />

      {/* AI Provider Settings (only shown if admin allows override) */}
      <AiProviderUserSettings />

    </div>
  )
}