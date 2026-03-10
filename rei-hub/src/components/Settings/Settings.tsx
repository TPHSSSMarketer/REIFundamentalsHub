import { useState, useEffect } from 'react'
import { Save, Globe, Calculator, Loader2, Cloud, HardDrive, Building2, User, Sun, Moon, Monitor, DollarSign, Share2, Users, Sliders, Link2, Bell, MessageCircle } from 'lucide-react'
import { useSearchParams } from 'react-router-dom'
import { getAuthHeader } from '@/services/auth'
import { toast } from 'sonner'
import AiProviderUserSettings from './AiProviderUserSettings'
import TeamManagementSection from './TeamManagementSection'
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
import {
  getSocialAuthUrl,
  submitSocialCallback,
  getSocialStatus,
  disconnectSocial,
  type SocialPlatform,
  type SocialStatusResponse,
} from '@/services/socialMediaApi'
import {
  saveWordPressCredentials,
  getWordPressCredentials,
  deleteWordPressCredentials,
  getWordPressStatus,
} from '@/services/wordPressApi'

const BASE_URL = import.meta.env.VITE_REI_SERVER_URL ?? 'http://localhost:8001'

export default function Settings() {
  const [searchParams, setSearchParams] = useSearchParams()
  const { theme, setTheme } = useTheme()
  const [activeTab, setActiveTab] = useState(searchParams.get('tab') || 'profile')

  const TABS = [
    { id: 'profile', label: 'Profile', icon: Building2 },
    { id: 'analyzer', label: 'Deal Analyzer', icon: Calculator },
    { id: 'integrations', label: 'Integrations', icon: Link2 },
    { id: 'team', label: 'Team', icon: Users },
    { id: 'preferences', label: 'Preferences', icon: Sliders },
  ]

  function switchTab(tabId: string) {
    setActiveTab(tabId)
    setSearchParams({ tab: tabId })
  }

  // WordPress state
  const [wpUrl, setWpUrl] = useState('')
  const [wpUsername, setWpUsername] = useState('')
  const [wpAppPassword, setWpAppPassword] = useState('')
  const [wpLoading, setWpLoading] = useState(true)
  const [wpSaving, setWpSaving] = useState(false)
  const [wpConnected, setWpConnected] = useState(false)

  const [settings, setSettings] = useState({
    wpUrl: '',
    wpUsername: '',
    wpAppPassword: '',
  })

  // Cloud Storage state
  const [googleDriveStatus, setGoogleDriveStatus] = useState<{ connected: boolean; email?: string } | null>(null)
  const [dropboxStatus, setDropboxStatus] = useState<{ connected: boolean; email?: string } | null>(null)
  const [cloudStorageLoading, setCloudStorageLoading] = useState(true)
  const [googleDriveConnecting, setGoogleDriveConnecting] = useState(false)
  const [dropboxConnecting, setDropboxConnecting] = useState(false)
  const [googleDriveDisconnecting, setGoogleDriveDisconnecting] = useState(false)
  const [dropboxDisconnecting, setDropboxDisconnecting] = useState(false)

  // Social Media state
  const [socialStatuses, setSocialStatuses] = useState<Record<SocialPlatform, SocialStatusResponse>>({
    facebook: { connected: false, account_name: '' },
    linkedin: { connected: false, account_name: '' },
    x: { connected: false, account_name: '' },
    instagram: { connected: false, account_name: '' },
  })
  const [socialLoading, setSocialLoading] = useState(true)
  const [socialConnecting, setSocialConnecting] = useState<SocialPlatform | null>(null)
  const [socialDisconnecting, setSocialDisconnecting] = useState<SocialPlatform | null>(null)

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
    investing_strategy: '',
    mission_statement: '',
    content_tone: '',
  })
  const [logoPreview, setLogoPreview] = useState<string | null>(null)
  const [logoB64, setLogoB64] = useState<string | null>(null)

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
          investing_strategy: u.investing_strategy ?? '',
          mission_statement: u.mission_statement ?? '',
          content_tone: u.content_tone ?? '',
        })
        if (u.has_company_logo) setLogoPreview('saved')
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
        investing_strategy: investingProfile.investing_strategy,
        mission_statement: investingProfile.mission_statement,
        content_tone: investingProfile.content_tone,
        ...(logoB64 ? { company_logo_b64: logoB64 } : {}),
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
  // Currency converter state
  const [currencyEnabled, setCurrencyEnabled] = useState(false)
  const [preferredCurrency, setPreferredCurrency] = useState('EUR')

  // Notification preferences state
  const [notifPrefs, setNotifPrefs] = useState({
    telegram_enabled: false,
    telegram_chat_id: '',
    whatsapp_enabled: false,
    whatsapp_phone_number: '',
    slack_enabled: false,
    slack_webhook_url: '',
    assistant_channel: 'web',
    voice_enabled: false,
    preferred_voice: 'nova',
  })
  const [notifSaving, setNotifSaving] = useState(false)

  const [analyzerLoading, setAnalyzerLoading] = useState(true)
  const [analyzerSaving, setAnalyzerSaving] = useState(false)

  useEffect(() => {
    async function loadAnalyzerPrefs() {
      try {
        const res = await fetch(`${BASE_URL}/api/deals/analyzer/preferences`, {
          headers: getAuthHeader(),
          credentials: 'include',
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

  // Load notification preferences
  useEffect(() => {
    async function loadNotifPrefs() {
      try {
        const res = await fetch(`${BASE_URL}/api/user/notifications/preferences`, {
          headers: getAuthHeader(),
          credentials: 'include',
        })
        if (res.ok) {
          const data = await res.json()
          setNotifPrefs({
            telegram_enabled: data.telegram_enabled ?? false,
            telegram_chat_id: data.telegram_chat_id ?? '',
            whatsapp_enabled: data.whatsapp_enabled ?? false,
            whatsapp_phone_number: data.whatsapp_phone_number ?? '',
            slack_enabled: data.slack_enabled ?? false,
            slack_webhook_url: data.slack_webhook_url ?? '',
            assistant_channel: data.assistant_channel ?? 'web',
            voice_enabled: data.voice_enabled ?? false,
            preferred_voice: data.preferred_voice ?? 'nova',
          })
        }
      } catch {
        // use defaults
      }
    }
    loadNotifPrefs()
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

  // ── WordPress Credentials ─────────────────────────────────
  useEffect(() => {
    loadWordPressStatus()
  }, [])

  async function loadWordPressStatus() {
    setWpLoading(true)
    try {
      // First check if credentials are configured
      const status = await getWordPressStatus()
      setWpConnected(status.configured)

      // If configured, load the credentials
      if (status.configured) {
        const creds = await getWordPressCredentials()
        setWpUrl(creds.wp_url)
        setWpUsername(creds.wp_username)
        setWpAppPassword(creds.wp_app_password)
      }
    } catch {
      // WordPress not configured or error loading
      setWpConnected(false)
    } finally {
      setWpLoading(false)
    }
  }

  // ── Social Media ──────────────────────────────────────────
  useEffect(() => {
    loadSocialStatuses()
  }, [])

  useEffect(() => {
    const platforms: SocialPlatform[] = ['facebook', 'linkedin', 'x', 'instagram']
    for (const p of platforms) {
      const code = searchParams.get(`${p}_code`)
      const verifier = searchParams.get(`${p}_code_verifier`)
      if (code) {
        handleSocialCallback(p, code, verifier || undefined)
        break
      }
    }
  }, [searchParams])

  async function loadSocialStatuses() {
    setSocialLoading(true)
    try {
      const platforms: SocialPlatform[] = ['facebook', 'linkedin', 'x', 'instagram']
      const results = await Promise.allSettled(platforms.map((p) => getSocialStatus(p)))
      const fallback: SocialStatusResponse = { connected: false, account_name: '' }
      setSocialStatuses({
        facebook: results[0].status === 'fulfilled' ? results[0].value : fallback,
        linkedin: results[1].status === 'fulfilled' ? results[1].value : fallback,
        x: results[2].status === 'fulfilled' ? results[2].value : fallback,
        instagram: results[3].status === 'fulfilled' ? results[3].value : fallback,
      })
    } catch {
      // use defaults
    } finally {
      setSocialLoading(false)
    }
  }

  async function handleSocialConnect(platform: SocialPlatform) {
    setSocialConnecting(platform)
    try {
      const data = await getSocialAuthUrl(platform)
      window.location.href = data.auth_url
    } catch {
      toast.error(`Failed to initiate ${platform} connection`)
      setSocialConnecting(null)
    }
  }

  async function handleSocialCallback(platform: SocialPlatform, code: string, codeVerifier?: string) {
    try {
      const result = await submitSocialCallback(platform, code, codeVerifier)
      if (result.success) {
        toast.success(`${platform.charAt(0).toUpperCase() + platform.slice(1)} connected successfully`)
      } else {
        toast.error(result.error || `Failed to connect ${platform}`)
      }
      await loadSocialStatuses()
    } catch {
      toast.error(`Failed to connect ${platform}`)
    }
  }

  async function handleSocialDisconnect(platform: SocialPlatform) {
    setSocialDisconnecting(platform)
    try {
      await disconnectSocial(platform)
      toast.success(`${platform.charAt(0).toUpperCase() + platform.slice(1)} disconnected`)
      await loadSocialStatuses()
    } catch {
      toast.error(`Failed to disconnect ${platform}`)
    } finally {
      setSocialDisconnecting(null)
    }
  }

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
        credentials: 'include',
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

  const handleSaveNotifPrefs = async () => {
    setNotifSaving(true)
    try {
      const res = await fetch(`${BASE_URL}/api/user/notifications/preferences`, {
        method: 'PATCH',
        headers: { ...getAuthHeader(), 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(notifPrefs),
      })
      if (!res.ok) throw new Error('Failed to save')
      toast.success('Notification preferences saved.')
    } catch {
      toast.error('Failed to save notification preferences.')
    } finally {
      setNotifSaving(false)
    }
  }

  const handleSaveWordPress = async () => {
    if (!wpUrl || !wpUsername || !wpAppPassword) {
      toast.error('Please fill in all WordPress fields.')
      return
    }

    setWpSaving(true)
    try {
      await saveWordPressCredentials(wpUrl, wpUsername, wpAppPassword)
      setWpConnected(true)
      toast.success('WordPress connection saved securely.')
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to save WordPress credentials'
      toast.error(msg)
    } finally {
      setWpSaving(false)
    }
  }

  const handleDeleteWordPress = async () => {
    if (!confirm('Delete WordPress credentials? You can reconfigure them later.')) return

    setWpSaving(true)
    try {
      await deleteWordPressCredentials()
      setWpUrl('')
      setWpUsername('')
      setWpAppPassword('')
      setWpConnected(false)
      toast.success('WordPress credentials deleted.')
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to delete WordPress credentials'
      toast.error(msg)
    } finally {
      setWpSaving(false)
    }
  }

  return (
    <div className="space-y-6 max-w-2xl mx-auto">
      {/* Header */}
      <div>
        <h1 className="text-xl md:text-2xl font-bold text-slate-800">Settings</h1>
        <p className="text-sm md:text-base text-slate-600">Configure your preferences and integrations</p>
      </div>

      {/* Tab Bar */}
      <div className="flex gap-1 overflow-x-auto border-b border-slate-200 pb-px -mb-px">
        {TABS.map((tab) => {
          const Icon = tab.icon
          return (
            <button
              key={tab.id}
              onClick={() => switchTab(tab.id)}
              className={`flex items-center gap-1.5 px-3 py-2 text-sm font-medium whitespace-nowrap rounded-t-lg transition-colors border-b-2 ${
                activeTab === tab.id
                  ? 'border-primary-600 text-primary-700 bg-primary-50'
                  : 'border-transparent text-slate-500 hover:text-slate-700 hover:bg-slate-50'
              }`}
            >
              <Icon className="w-4 h-4" />
              {tab.label}
            </button>
          )
        })}
      </div>

      {/* ══ Profile Tab ══ */}
      {activeTab === 'profile' && <>

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

                {/* ── Content Profile ── */}
                <div className="border-t border-slate-200 pt-4 mt-4">
                  <h4 className="text-sm font-semibold text-slate-700 mb-3">Content Profile</h4>
                  <p className="text-xs text-slate-500 mb-4">This info personalizes all AI-generated content in ContentHub to match your brand.</p>
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Investing Strategy</label>
                  <textarea
                    rows={3}
                    value={investingProfile.investing_strategy}
                    onChange={(e) => setInvestingProfile({ ...investingProfile, investing_strategy: e.target.value })}
                    placeholder="Describe your investment approach (e.g., I focus on fix-and-flips in the DFW area, targeting distressed properties under $200k...)"
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 resize-none"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Mission Statement</label>
                  <textarea
                    rows={3}
                    value={investingProfile.mission_statement}
                    onChange={(e) => setInvestingProfile({ ...investingProfile, mission_statement: e.target.value })}
                    placeholder="What's your mission? (e.g., We help homeowners in difficult situations find fair solutions while creating value for our investors...)"
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 resize-none"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">Content Tone</label>
                  <div className="grid grid-cols-2 gap-2 mb-2">
                    {[
                      { value: 'Professional & Educational', label: 'Professional & Educational' },
                      { value: 'Casual & Conversational', label: 'Casual & Conversational' },
                      { value: 'Motivational & Inspiring', label: 'Motivational & Inspiring' },
                      { value: 'Direct & No-Nonsense', label: 'Direct & No-Nonsense' },
                    ].map((preset) => (
                      <button
                        key={preset.value}
                        type="button"
                        onClick={() => setInvestingProfile({ ...investingProfile, content_tone: preset.value })}
                        className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                          investingProfile.content_tone === preset.value
                            ? 'bg-primary-500 text-white border-primary-500'
                            : 'bg-white text-slate-600 border-slate-300 hover:border-primary-400'
                        }`}
                      >
                        {preset.label}
                      </button>
                    ))}
                  </div>
                  <input
                    type="text"
                    placeholder="Or type a custom tone (e.g., Friendly but authoritative, like a mentor)"
                    value={
                      ['Professional & Educational', 'Casual & Conversational', 'Motivational & Inspiring', 'Direct & No-Nonsense'].includes(investingProfile.content_tone)
                        ? ''
                        : investingProfile.content_tone
                    }
                    onChange={(e) => setInvestingProfile({ ...investingProfile, content_tone: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 text-sm"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Company Logo (for image watermark)</label>
                  <p className="text-xs text-slate-500 mb-2">Upload your logo and it will be watermarked onto every AI-generated image.</p>
                  <div className="flex items-center gap-4">
                    <label className="flex items-center gap-2 px-4 py-2 bg-slate-100 text-slate-700 rounded-lg hover:bg-slate-200 transition-colors cursor-pointer text-sm">
                      <Cloud className="w-4 h-4" />
                      {logoPreview ? 'Change Logo' : 'Upload Logo'}
                      <input
                        type="file"
                        accept="image/png,image/jpeg,image/webp"
                        className="hidden"
                        onChange={(e) => {
                          const file = e.target.files?.[0]
                          if (!file) return
                          if (file.size > 2 * 1024 * 1024) {
                            toast.error('Logo must be under 2MB.')
                            return
                          }
                          const reader = new FileReader()
                          reader.onload = () => {
                            const b64 = (reader.result as string).split(',')[1]
                            setLogoB64(b64)
                            setLogoPreview(reader.result as string)
                          }
                          reader.readAsDataURL(file)
                        }}
                      />
                    </label>
                    {logoPreview && (
                      <div className="flex items-center gap-2">
                        {logoPreview === 'saved' ? (
                          <span className="text-xs text-green-600 font-medium">Logo saved</span>
                        ) : (
                          <img src={logoPreview} alt="Logo preview" className="h-10 w-auto rounded border border-slate-200" />
                        )}
                        <button
                          type="button"
                          onClick={() => { setLogoPreview(null); setLogoB64('') }}
                          className="text-xs text-red-500 hover:text-red-700"
                        >
                          Remove
                        </button>
                      </div>
                    )}
                  </div>
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

      </>}

      {/* ══ Deal Analyzer Tab ══ */}
      {activeTab === 'analyzer' && <>

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

      </>}

      {/* ══ Integrations Tab ══ */}
      {activeTab === 'integrations' && <>

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

        {wpLoading ? (
          <div className="flex items-center justify-center h-24">
            <Loader2 className="w-5 h-5 animate-spin text-primary-500" />
          </div>
        ) : (
          <>
            <div className="space-y-4">
              {/* WordPress Site URL */}
              <div>
                <label className="flex items-center gap-2 text-sm font-medium text-slate-700 mb-1">
                  <Globe className="w-4 h-4" />
                  WordPress Site URL
                </label>
                <input
                  type="url"
                  value={wpUrl}
                  onChange={(e) => setWpUrl(e.target.value)}
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
                  value={wpUsername}
                  onChange={(e) => setWpUsername(e.target.value)}
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
                  value={wpAppPassword}
                  onChange={(e) => setWpAppPassword(e.target.value)}
                  placeholder="xxxx xxxx xxxx xxxx"
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                />
                <p className="text-xs text-slate-500 mt-1">
                  Generate in WordPress → Users → Your Profile → Application Passwords
                </p>
              </div>
            </div>

            <div className="mt-6 pt-4 border-t border-slate-200 flex gap-2">
              <button
                onClick={handleSaveWordPress}
                disabled={wpSaving}
                className="flex items-center gap-2 px-4 py-2 bg-primary-500 text-white rounded-lg hover:bg-primary-600 transition-colors disabled:opacity-50"
              >
                {wpSaving ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Saving...
                  </>
                ) : (
                  <>
                    <Save className="w-4 h-4" />
                    Save WordPress Settings
                  </>
                )}
              </button>
              {wpConnected && (
                <button
                  onClick={handleDeleteWordPress}
                  disabled={wpSaving}
                  className="flex items-center gap-2 px-4 py-2 bg-red-100 text-red-700 rounded-lg hover:bg-red-200 transition-colors disabled:opacity-50"
                >
                  Delete
                </button>
              )}
            </div>
          </>
        )}
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

      {/* Social Accounts */}
      <div className="bg-white rounded-xl border border-slate-200 p-4 md:p-6">
        <div className="flex items-center gap-2 mb-1">
          <Share2 className="w-5 h-5 text-primary-500" />
          <h2 className="text-lg font-semibold text-slate-800">Social Accounts</h2>
        </div>
        <p className="text-sm text-slate-600 mb-4">
          Connect your social media accounts to publish content directly from ContentHub.
        </p>

        {socialLoading ? (
          <div className="flex items-center justify-center h-24">
            <Loader2 className="w-5 h-5 animate-spin text-primary-500" />
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* Facebook */}
            <div className="border border-slate-200 rounded-lg p-4">
              <div className="flex items-center gap-3 mb-3">
                <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center text-lg">
                  <span>f</span>
                </div>
                <div>
                  <h3 className="font-medium text-slate-800">Facebook</h3>
                  {socialStatuses.facebook.connected && (
                    <p className="text-xs text-slate-500">{socialStatuses.facebook.account_name}</p>
                  )}
                </div>
                {socialStatuses.facebook.connected && (
                  <span className="ml-auto bg-green-100 text-green-700 text-xs px-2 py-0.5 rounded-full">
                    Connected
                  </span>
                )}
              </div>
              {socialStatuses.facebook.connected ? (
                <button
                  onClick={() => handleSocialDisconnect('facebook')}
                  disabled={socialDisconnecting === 'facebook'}
                  className="w-full px-3 py-2 text-sm font-medium border border-slate-300 text-slate-700 rounded-lg hover:bg-slate-50 disabled:opacity-50 transition-colors"
                >
                  {socialDisconnecting === 'facebook' ? (
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
                  onClick={() => handleSocialConnect('facebook')}
                  disabled={socialConnecting === 'facebook'}
                  className="w-full px-3 py-2 text-sm font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
                >
                  {socialConnecting === 'facebook' ? (
                    <span className="flex items-center justify-center gap-2">
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Connecting...
                    </span>
                  ) : (
                    'Connect Facebook Page'
                  )}
                </button>
              )}
              <p className="text-xs text-slate-400 mt-2">Posts to your Facebook Page (must be an admin)</p>
            </div>

            {/* LinkedIn */}
            <div className="border border-slate-200 rounded-lg p-4">
              <div className="flex items-center gap-3 mb-3">
                <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center text-lg font-bold text-blue-700">
                  <span>in</span>
                </div>
                <div>
                  <h3 className="font-medium text-slate-800">LinkedIn</h3>
                  {socialStatuses.linkedin.connected && (
                    <p className="text-xs text-slate-500">{socialStatuses.linkedin.account_name}</p>
                  )}
                </div>
                {socialStatuses.linkedin.connected && (
                  <span className="ml-auto bg-green-100 text-green-700 text-xs px-2 py-0.5 rounded-full">
                    Connected
                  </span>
                )}
              </div>
              {socialStatuses.linkedin.connected ? (
                <button
                  onClick={() => handleSocialDisconnect('linkedin')}
                  disabled={socialDisconnecting === 'linkedin'}
                  className="w-full px-3 py-2 text-sm font-medium border border-slate-300 text-slate-700 rounded-lg hover:bg-slate-50 disabled:opacity-50 transition-colors"
                >
                  {socialDisconnecting === 'linkedin' ? (
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
                  onClick={() => handleSocialConnect('linkedin')}
                  disabled={socialConnecting === 'linkedin'}
                  className="w-full px-3 py-2 text-sm font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
                >
                  {socialConnecting === 'linkedin' ? (
                    <span className="flex items-center justify-center gap-2">
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Connecting...
                    </span>
                  ) : (
                    'Connect LinkedIn'
                  )}
                </button>
              )}
              <p className="text-xs text-slate-400 mt-2">Posts to your personal LinkedIn profile</p>
            </div>

            {/* X (Twitter) */}
            <div className="border border-slate-200 rounded-lg p-4">
              <div className="flex items-center gap-3 mb-3">
                <div className="w-10 h-10 bg-slate-900 rounded-lg flex items-center justify-center text-lg font-bold text-white">
                  <span>X</span>
                </div>
                <div>
                  <h3 className="font-medium text-slate-800">X (Twitter)</h3>
                  {socialStatuses.x.connected && (
                    <p className="text-xs text-slate-500">{socialStatuses.x.account_name}</p>
                  )}
                </div>
                {socialStatuses.x.connected && (
                  <span className="ml-auto bg-green-100 text-green-700 text-xs px-2 py-0.5 rounded-full">
                    Connected
                  </span>
                )}
              </div>
              {socialStatuses.x.connected ? (
                <button
                  onClick={() => handleSocialDisconnect('x')}
                  disabled={socialDisconnecting === 'x'}
                  className="w-full px-3 py-2 text-sm font-medium border border-slate-300 text-slate-700 rounded-lg hover:bg-slate-50 disabled:opacity-50 transition-colors"
                >
                  {socialDisconnecting === 'x' ? (
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
                  onClick={() => handleSocialConnect('x')}
                  disabled={socialConnecting === 'x'}
                  className="w-full px-3 py-2 text-sm font-medium bg-slate-900 text-white rounded-lg hover:bg-slate-800 disabled:opacity-50 transition-colors"
                >
                  {socialConnecting === 'x' ? (
                    <span className="flex items-center justify-center gap-2">
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Connecting...
                    </span>
                  ) : (
                    'Connect X'
                  )}
                </button>
              )}
              <p className="text-xs text-slate-400 mt-2">Posts tweets (280 char max). Free tier: 1,500/month.</p>
            </div>

            {/* Instagram */}
            <div className="border border-slate-200 rounded-lg p-4">
              <div className="flex items-center gap-3 mb-3">
                <div className="w-10 h-10 bg-gradient-to-br from-purple-500 to-pink-500 rounded-lg flex items-center justify-center text-lg text-white">
                  <span>IG</span>
                </div>
                <div>
                  <h3 className="font-medium text-slate-800">Instagram</h3>
                  {socialStatuses.instagram.connected && (
                    <p className="text-xs text-slate-500">{socialStatuses.instagram.account_name}</p>
                  )}
                </div>
                {socialStatuses.instagram.connected && (
                  <span className="ml-auto bg-green-100 text-green-700 text-xs px-2 py-0.5 rounded-full">
                    Connected
                  </span>
                )}
              </div>
              {socialStatuses.instagram.connected ? (
                <button
                  onClick={() => handleSocialDisconnect('instagram')}
                  disabled={socialDisconnecting === 'instagram'}
                  className="w-full px-3 py-2 text-sm font-medium border border-slate-300 text-slate-700 rounded-lg hover:bg-slate-50 disabled:opacity-50 transition-colors"
                >
                  {socialDisconnecting === 'instagram' ? (
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
                  onClick={() => handleSocialConnect('instagram')}
                  disabled={socialConnecting === 'instagram'}
                  className="w-full px-3 py-2 text-sm font-medium bg-gradient-to-r from-purple-600 to-pink-600 text-white rounded-lg hover:from-purple-700 hover:to-pink-700 disabled:opacity-50 transition-colors"
                >
                  {socialConnecting === 'instagram' ? (
                    <span className="flex items-center justify-center gap-2">
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Connecting...
                    </span>
                  ) : (
                    'Connect Instagram'
                  )}
                </button>
              )}
              <p className="text-xs text-slate-400 mt-2">Requires a Business account linked to a Facebook Page. Image required.</p>
            </div>
          </div>
        )}
      </div>

      </>}

      {/* ══ Team Tab ══ */}
      {activeTab === 'team' && <>
      <TeamManagementSection />
      </>}

      {/* ══ Preferences Tab ══ */}
      {activeTab === 'preferences' && <>

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

      {/* Currency Converter */}
      <div className="bg-white rounded-xl border border-slate-200 p-4 md:p-6">
        <div className="flex items-center gap-2 mb-1">
          <DollarSign className="w-5 h-5 text-primary-500" />
          <h2 className="text-lg font-semibold text-slate-800">Currency Converter</h2>
        </div>
        <p className="text-sm text-slate-600 mb-4">
          Show deal amounts in a secondary currency alongside USD. Powered by the European Central Bank.
        </p>

        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-slate-700">Enable Currency Conversion</p>
              <p className="text-xs text-slate-500">Show converted amounts in Deal Analyzer and deal cards</p>
            </div>
            <button
              onClick={() => setCurrencyEnabled(!currencyEnabled)}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                currencyEnabled ? 'bg-primary-500' : 'bg-slate-300'
              }`}
            >
              <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                currencyEnabled ? 'translate-x-6' : 'translate-x-1'
              }`} />
            </button>
          </div>

          {currencyEnabled && (
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Preferred Currency</label>
              <select
                value={preferredCurrency}
                onChange={(e) => setPreferredCurrency(e.target.value)}
                className="w-full max-w-xs px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 bg-white text-sm"
              >
                <option value="EUR">EUR — Euro</option>
                <option value="GBP">GBP — British Pound</option>
                <option value="CAD">CAD — Canadian Dollar</option>
                <option value="AUD">AUD — Australian Dollar</option>
                <option value="JPY">JPY — Japanese Yen</option>
                <option value="CHF">CHF — Swiss Franc</option>
                <option value="CNY">CNY — Chinese Yuan</option>
                <option value="MXN">MXN — Mexican Peso</option>
                <option value="BRL">BRL — Brazilian Real</option>
                <option value="INR">INR — Indian Rupee</option>
              </select>
              <p className="text-xs text-slate-500 mt-2">
                Exchange rates from the European Central Bank, updated daily. No API key needed.
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Notifications */}
      <div className="bg-white rounded-xl border border-slate-200 p-4 md:p-6">
        <div className="flex items-center gap-2 mb-1">
          <Bell className="w-5 h-5 text-primary-500" />
          <h2 className="text-lg font-semibold text-slate-800">Notifications</h2>
        </div>
        <p className="text-sm text-slate-600 mb-6">
          Get negotiation updates, lead alerts, and case activity via Telegram, WhatsApp, or Slack — in addition to email.
        </p>

        <div className="space-y-6">
          {/* Telegram */}
          <div className="border-b border-slate-200 pb-6">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <MessageCircle className="w-5 h-5 text-blue-500" />
                <div>
                  <h3 className="text-sm font-semibold text-slate-800">Telegram</h3>
                  <p className="text-xs text-slate-500">Instant alerts on Telegram</p>
                </div>
              </div>
              <button
                onClick={() => setNotifPrefs({ ...notifPrefs, telegram_enabled: !notifPrefs.telegram_enabled })}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                  notifPrefs.telegram_enabled ? 'bg-primary-500' : 'bg-slate-300'
                }`}
              >
                <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                  notifPrefs.telegram_enabled ? 'translate-x-6' : 'translate-x-1'
                }`} />
              </button>
            </div>
            {notifPrefs.telegram_enabled && (
              <div className="ml-7">
                <label className="block text-sm font-medium text-slate-700 mb-1">Telegram Chat ID</label>
                <input
                  type="text"
                  value={notifPrefs.telegram_chat_id}
                  onChange={(e) => setNotifPrefs({ ...notifPrefs, telegram_chat_id: e.target.value })}
                  placeholder="e.g., 123456789"
                  className="w-full max-w-sm px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 text-sm"
                />
                <p className="text-xs text-slate-500 mt-1">
                  Message our Telegram bot to get your Chat ID. Ask your admin for the bot link.
                </p>
              </div>
            )}
          </div>

          {/* WhatsApp */}
          <div className="border-b border-slate-200 pb-6">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <MessageCircle className="w-5 h-5 text-green-500" />
                <div>
                  <h3 className="text-sm font-semibold text-slate-800">WhatsApp</h3>
                  <p className="text-xs text-slate-500">Receive notifications via WhatsApp</p>
                </div>
              </div>
              <button
                onClick={() => setNotifPrefs({ ...notifPrefs, whatsapp_enabled: !notifPrefs.whatsapp_enabled })}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                  notifPrefs.whatsapp_enabled ? 'bg-primary-500' : 'bg-slate-300'
                }`}
              >
                <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                  notifPrefs.whatsapp_enabled ? 'translate-x-6' : 'translate-x-1'
                }`} />
              </button>
            </div>
            {notifPrefs.whatsapp_enabled && (
              <div className="ml-7">
                <label className="block text-sm font-medium text-slate-700 mb-1">WhatsApp Phone Number</label>
                <input
                  type="tel"
                  value={notifPrefs.whatsapp_phone_number}
                  onChange={(e) => setNotifPrefs({ ...notifPrefs, whatsapp_phone_number: e.target.value })}
                  placeholder="e.g., +18005550000"
                  className="w-full max-w-sm px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 text-sm"
                />
                <p className="text-xs text-slate-500 mt-1">
                  Enter your number in international format: +1 followed by 10 digits for US numbers.
                </p>
              </div>
            )}
          </div>

          {/* Slack */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <MessageCircle className="w-5 h-5 text-purple-500" />
                <div>
                  <h3 className="text-sm font-semibold text-slate-800">Slack</h3>
                  <p className="text-xs text-slate-500">Send alerts to a Slack channel</p>
                </div>
              </div>
              <button
                onClick={() => setNotifPrefs({ ...notifPrefs, slack_enabled: !notifPrefs.slack_enabled })}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                  notifPrefs.slack_enabled ? 'bg-primary-500' : 'bg-slate-300'
                }`}
              >
                <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                  notifPrefs.slack_enabled ? 'translate-x-6' : 'translate-x-1'
                }`} />
              </button>
            </div>
            {notifPrefs.slack_enabled && (
              <div className="ml-7">
                <label className="block text-sm font-medium text-slate-700 mb-1">Slack Webhook URL</label>
                <input
                  type="password"
                  value={notifPrefs.slack_webhook_url}
                  onChange={(e) => setNotifPrefs({ ...notifPrefs, slack_webhook_url: e.target.value })}
                  placeholder="https://hooks.slack.com/services/..."
                  className="w-full max-w-sm px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 text-sm"
                />
                <p className="text-xs text-slate-500 mt-1">
                  Create an Incoming Webhook at api.slack.com and paste the URL here.
                </p>
              </div>
            )}
          </div>
        </div>

        {/* ── AI Assistant Chat Channel ─────────────────────────────── */}
        <div className="mt-8 pt-6 border-t border-slate-200">
          <h3 className="text-base font-semibold text-slate-900 mb-1">AI Assistant Channel</h3>
          <p className="text-sm text-slate-500 mb-4">
            Choose how you want to chat with the Assistant. You can message it from your preferred platform instead of the web app.
          </p>

          <div className="space-y-3">
            <label className="block text-sm font-medium text-slate-700">Preferred Chat Channel</label>
            <div className="flex flex-wrap gap-2">
              {[
                { value: 'web', label: 'Web App', desc: 'Chat in the browser' },
                { value: 'telegram', label: 'Telegram', desc: 'Message via Telegram bot' },
                { value: 'whatsapp', label: 'WhatsApp', desc: 'Coming soon' },
                { value: 'slack', label: 'Slack', desc: 'Coming soon' },
              ].map((ch) => (
                <button
                  key={ch.value}
                  onClick={() => setNotifPrefs({ ...notifPrefs, assistant_channel: ch.value })}
                  disabled={ch.value === 'whatsapp' || ch.value === 'slack'}
                  className={`px-4 py-2.5 rounded-lg border text-sm font-medium transition-all ${
                    notifPrefs.assistant_channel === ch.value
                      ? 'bg-primary-50 border-primary-500 text-primary-700 ring-2 ring-primary-200'
                      : ch.value === 'whatsapp' || ch.value === 'slack'
                        ? 'bg-slate-50 border-slate-200 text-slate-400 cursor-not-allowed'
                        : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50 hover:border-slate-300'
                  }`}
                >
                  <span className="block">{ch.label}</span>
                  <span className="block text-xs font-normal mt-0.5 opacity-70">{ch.desc}</span>
                </button>
              ))}
            </div>

            {notifPrefs.assistant_channel === 'telegram' && !notifPrefs.telegram_chat_id && (
              <p className="text-xs text-amber-600 bg-amber-50 rounded-lg px-3 py-2">
                To use Telegram, enter your Telegram Chat ID in the Telegram section above and enable it.
              </p>
            )}
          </div>

          {/* Voice On/Off */}
          <div className="mt-5">
            <div className="flex items-center gap-3">
              <button
                onClick={() => setNotifPrefs({ ...notifPrefs, voice_enabled: !notifPrefs.voice_enabled })}
                className={`relative inline-flex h-7 w-12 items-center rounded-full transition-colors ${
                  notifPrefs.voice_enabled ? 'bg-primary-500' : 'bg-slate-300'
                }`}
              >
                <span className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform ${
                  notifPrefs.voice_enabled ? 'translate-x-6' : 'translate-x-1'
                }`} />
              </button>
              <div>
                <h4 className="text-sm font-semibold text-slate-800">Voice Messages</h4>
                <p className="text-xs text-slate-500">
                  When enabled, the Assistant will send voice notes along with text replies.
                  You can also send voice messages to the Assistant and it will transcribe them.
                </p>
              </div>
            </div>
            <p className="text-xs text-slate-400 mt-2 ml-15">
              You can also toggle this anytime by sending "Voice On" or "Voice Off" in the chat.
            </p>

            {/* Voice Selection with Preview */}
            {notifPrefs.voice_enabled && (
              <div className="mt-4 ml-15">
                <label className="block text-sm font-medium text-slate-700 mb-1">Preferred Voice</label>
                <p className="text-xs text-slate-500 mb-3">Choose the voice your AI Assistant will use for voice replies. Click the play button to hear a preview.</p>
                <div className="space-y-2 max-w-md">
                  {[
                    { value: 'nova', label: 'Nova', desc: 'Female, warm & natural' },
                    { value: 'alloy', label: 'Alloy', desc: 'Neutral, balanced' },
                    { value: 'echo', label: 'Echo', desc: 'Male, clear & smooth' },
                    { value: 'fable', label: 'Fable', desc: 'Expressive, storytelling' },
                    { value: 'onyx', label: 'Onyx', desc: 'Male, deep & authoritative' },
                    { value: 'shimmer', label: 'Shimmer', desc: 'Female, bright & energetic' },
                  ].map((v) => (
                    <div
                      key={v.value}
                      onClick={() => setNotifPrefs({ ...notifPrefs, preferred_voice: v.value })}
                      className={`flex items-center gap-3 px-3 py-2.5 rounded-lg border cursor-pointer transition-all ${
                        notifPrefs.preferred_voice === v.value
                          ? 'bg-primary-50 border-primary-500 ring-2 ring-primary-200'
                          : 'bg-white border-slate-200 hover:border-slate-300 hover:bg-slate-50'
                      }`}
                    >
                      <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center flex-shrink-0 ${
                        notifPrefs.preferred_voice === v.value
                          ? 'border-primary-500'
                          : 'border-slate-300'
                      }`}>
                        {notifPrefs.preferred_voice === v.value && (
                          <div className="w-2 h-2 rounded-full bg-primary-500" />
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <span className="text-sm font-medium text-slate-800">{v.label}</span>
                        <span className="text-xs text-slate-500 ml-2">{v.desc}</span>
                      </div>
                      <button
                        type="button"
                        onClick={async (e) => {
                          e.stopPropagation()
                          const btn = e.currentTarget
                          const originalHtml = btn.innerHTML
                          btn.innerHTML = '<svg class="w-4 h-4 animate-spin" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10" stroke="currentColor" stroke-width="3" fill="none" stroke-dasharray="31.4 31.4" /></svg>'
                          btn.disabled = true
                          try {
                            const res = await fetch(`${BASE_URL}/api/user/notifications/voice-preview`, {
                              method: 'POST',
                              headers: { ...getAuthHeader(), 'Content-Type': 'application/json' },
                              credentials: 'include',
                              body: JSON.stringify({ voice: v.value }),
                            })
                            if (!res.ok) {
                              const err = await res.json().catch(() => ({ detail: 'Preview failed' }))
                              toast.error(err.detail || 'Failed to load preview')
                              return
                            }
                            const blob = await res.blob()
                            const url = URL.createObjectURL(new Blob([blob], { type: 'audio/mpeg' }))
                            const audio = new Audio(url)
                            audio.onended = () => URL.revokeObjectURL(url)
                            audio.onerror = () => {
                              URL.revokeObjectURL(url)
                              toast.error('Browser could not play the audio. Try a different browser.')
                            }
                            await audio.play()
                          } catch (err: any) {
                            console.error('Voice preview error:', err)
                            toast.error(err?.message || 'Could not play voice preview')
                          } finally {
                            btn.innerHTML = originalHtml
                            btn.disabled = false
                          }
                        }}
                        className="flex items-center justify-center w-8 h-8 rounded-full bg-slate-100 hover:bg-primary-100 text-slate-500 hover:text-primary-600 transition-colors flex-shrink-0"
                        title={`Preview ${v.label}`}
                      >
                        <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
                          <path d="M8 5v14l11-7z" />
                        </svg>
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="mt-6">
          <button
            onClick={handleSaveNotifPrefs}
            disabled={notifSaving}
            className="flex items-center gap-2 px-4 py-2.5 rounded-lg bg-primary-500 text-white font-medium hover:bg-primary-600 disabled:opacity-50 transition-colors text-sm"
          >
            {notifSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            {notifSaving ? 'Saving...' : 'Save Preferences'}
          </button>
        </div>
      </div>

      {/* AI Provider Settings (only shown if admin allows override) */}
      <AiProviderUserSettings />

      </>}

    </div>
  )
}