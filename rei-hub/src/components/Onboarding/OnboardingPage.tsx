import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  getOnboardingStatus,
  saveStep,
  completeOnboarding,
  skipOnboarding,
} from '@/services/onboardingApi'

const BASE_URL = import.meta.env.VITE_REI_SERVER_URL ?? 'http://localhost:8001'

// ── Types ────────────────────────────────────────────────────────────

interface OnboardingData {
  company_name: string
  company_logo_url: string
  company_address: string
  company_city: string
  company_state: string
  company_zip: string
  company_phone: string
  company_website: string
  investing_experience: string
  deal_types: string[]
  primary_market: string
  storage_provider: string
  phone_number: string
  area_code: string
  friendly_number: string
  domain: string
  from_name: string
  from_email: string
  dns_records: Array<{ type: string; host: string; value: string }>
}

const STEP_LABELS = [
  'Company Info',
  'Investing Profile',
  'Document Storage',
  'Phone Number',
  'Email Domain',
  'Review & Launch',
]

// ── Main Component ────────────────────────────────────────────────────

export default function OnboardingPage() {
  const navigate = useNavigate()
  const [step, setStep] = useState(1)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [direction, setDirection] = useState<'forward' | 'backward'>('forward')
  const [animating, setAnimating] = useState(false)

  const [data, setData] = useState<OnboardingData>({
    company_name: '',
    company_logo_url: '',
    company_address: '',
    company_city: '',
    company_state: '',
    company_zip: '',
    company_phone: '',
    company_website: '',
    investing_experience: '',
    deal_types: [],
    primary_market: '',
    storage_provider: '',
    phone_number: '',
    area_code: '',
    friendly_number: '',
    domain: '',
    from_name: '',
    from_email: '',
    dns_records: [],
  })

  // Phone search state
  const [searchingNumbers, setSearchingNumbers] = useState(false)
  const [availableNumbers, setAvailableNumbers] = useState<
    Array<{
      phone_number: string
      friendly_name: string
      capabilities: { voice: boolean; sms: boolean; fax: boolean }
    }>
  >([])
  const [selectedNumber, setSelectedNumber] = useState('')
  const [numberPurchased, setNumberPurchased] = useState(false)
  const [forwardMode, setForwardMode] = useState<'forward' | 'softphone'>('forward')
  const [forwardNumber, setForwardNumber] = useState('')

  // Email domain state
  const [domainAdded, setDomainAdded] = useState(false)
  const [dnsConfirmed, setDnsConfirmed] = useState(false)

  // Storage state
  const [storageConnected, setStorageConnected] = useState(false)

  useEffect(() => {
    getOnboardingStatus()
      .then((res) => {
        if (res.completed) {
          navigate('/dashboard', { replace: true })
          return
        }
        const u = res.user
        const dealTypes = u.deal_types ? JSON.parse(u.deal_types) : []
        setData((prev) => ({
          ...prev,
          company_name: u.company_name || '',
          company_logo_url: (u as any).company_logo_url || '',
          company_address: u.company_address || '',
          company_city: u.company_city || '',
          company_state: u.company_state || '',
          company_zip: u.company_zip || '',
          company_phone: u.company_phone || '',
          company_website: u.company_website || '',
          investing_experience: u.investing_experience || '',
          deal_types: dealTypes,
          primary_market: u.primary_market || '',
          storage_provider: u.storage_provider || '',
          from_name: u.company_name || u.full_name || '',
        }))
        if (u.storage_provider) setStorageConnected(true)
        if (res.current_step > 0) setStep(Math.min(res.current_step + 1, 6))
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [navigate])

  const goToStep = useCallback(
    (next: number) => {
      setDirection(next > step ? 'forward' : 'backward')
      setAnimating(true)
      setTimeout(() => {
        setStep(next)
        setAnimating(false)
      }, 200)
    },
    [step]
  )

  const handleSaveStep = useCallback(
    async (stepNum: number, body: Record<string, unknown>, nextStep?: number) => {
      setSaving(true)
      setError('')
      try {
        const res = await saveStep(stepNum, body)
        if (res.number_purchased) {
          setNumberPurchased(true)
          setData((prev) => ({
            ...prev,
            phone_number: res.number_purchased!,
            friendly_number: res.friendly_number || res.number_purchased!,
          }))
        }
        if (res.dns_records) {
          setDomainAdded(true)
          setData((prev) => ({ ...prev, dns_records: res.dns_records! }))
        }
        goToStep(nextStep ?? res.next_step)
      } catch (err: any) {
        setError(err.message || 'Failed to save')
      } finally {
        setSaving(false)
      }
    },
    [goToStep]
  )

  const handleSkip = useCallback(async () => {
    setSaving(true)
    try {
              localStorage.setItem('rei-onboarding-skipped', 'true')
      await skipOnboarding()
      navigate('/dashboard', { replace: true })
    } catch {
      navigate('/dashboard', { replace: true })
    }
  }, [navigate])

  const handleComplete = useCallback(async () => {
    setSaving(true)
    setError('')
    try {
      await completeOnboarding()
      navigate('/dashboard', { replace: true })
    } catch (err: any) {
      setError(err.message || 'Failed to complete onboarding')
      setSaving(false)
    }
  }, [navigate])

  const searchNumbers = useCallback(async () => {
    if (!data.area_code || data.area_code.length !== 3) return
    setSearchingNumbers(true)
    setAvailableNumbers([])
    try {
      const res = await fetch(
        `${BASE_URL}/api/phone/numbers/search?area_code=${data.area_code}`,
        { credentials: 'include' }
      )
      if (!res.ok) throw new Error('Search failed')
      const json = await res.json()
      setAvailableNumbers(json.numbers || [])
    } catch {
      setError('Failed to search numbers. Please try again.')
    } finally {
      setSearchingNumbers(false)
    }
  }, [data.area_code])

  if (loading) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-white flex flex-col">
      {/* Header */}
      <header className="flex items-center justify-between px-4 md:px-6 py-3 md:py-4">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 bg-blue-700 rounded-lg flex items-center justify-center">
            <span className="text-white text-sm font-bold">R</span>
          </div>
          <span className="text-sm font-semibold text-gray-800">
            REI Fundamentals Hub
          </span>
        </div>
        <button
          onClick={handleSkip}
          className="text-sm text-gray-500 hover:text-gray-700"
        >
          Skip for now
        </button>
      </header>

      {/* Progress */}
      <div className="px-4 md:px-6">
        <div className="flex gap-2 mb-1">
          {STEP_LABELS.map((_, i) => (
            <div
              key={i}
              className={`h-1 flex-1 rounded-full transition-colors duration-300 ${
                i + 1 <= step ? 'bg-blue-600' : 'bg-gray-200'
              }`}
            />
          ))}
        </div>
        <p className="text-xs text-gray-500">
          Step {step} of {STEP_LABELS.length} — {STEP_LABELS[step - 1]}
        </p>
      </div>

      {/* Error */}
      {error && (
        <div className="mx-4 md:mx-6 mt-2 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
          {error}
        </div>
      )}

      {/* Step Content */}
      <div
        className={`flex-1 px-4 md:px-6 py-4 md:py-6 overflow-y-auto transition-all duration-200 ${
          animating
            ? direction === 'forward'
              ? 'opacity-0 translate-x-4'
              : 'opacity-0 -translate-x-4'
            : 'opacity-100 translate-x-0'
        }`}
      >
        <div className="max-w-2xl mx-auto w-full">
          {step === 1 && (
            <Step1Company
              data={data}
              setData={setData}
              onNext={() =>
                handleSaveStep(1, {
                  company_name: data.company_name,
                  company_address: data.company_address,
                  company_city: data.company_city,
                  company_state: data.company_state,
                  company_zip: data.company_zip,
                  company_phone: data.company_phone,
                  company_website: data.company_website,
                })
              }
              saving={saving}
            />
          )}

          {step === 2 && (
            <Step2InvestingProfile
              data={data}
              setData={setData}
              onContinue={() =>
                handleSaveStep(2, {
                  investing_experience: data.investing_experience,
                  deal_types: JSON.stringify(data.deal_types),
                  primary_market: data.primary_market,
                })
              }
              saving={saving}
            />
          )}

          {step === 3 && (
            <Step3Storage
              data={data}
              setData={setData}
              onContinue={() =>
                handleSaveStep(3, { storage_provider: data.storage_provider })
              }
              onSkipStep={() => goToStep(4)}
              saving={saving}
              storageConnected={storageConnected}
              setStorageConnected={setStorageConnected}
            />
          )}

          {step === 4 && (
            <Step4Phone
              data={data}
              setData={setData}
              onContinue={() => {
                if (selectedNumber) {
                  handleSaveStep(4, { phone_number: selectedNumber })
                } else if (numberPurchased) {
                  goToStep(5)
                }
              }}
              onSkipStep={() => goToStep(5)}
              saving={saving}
              searchingNumbers={searchingNumbers}
              availableNumbers={availableNumbers}
              selectedNumber={selectedNumber}
              setSelectedNumber={setSelectedNumber}
              numberPurchased={numberPurchased}
              forwardMode={forwardMode}
              setForwardMode={setForwardMode}
              forwardNumber={forwardNumber}
              setForwardNumber={setForwardNumber}
              onSearch={searchNumbers}
            />
          )}

          {step === 5 && (
            <Step5EmailDomain
              data={data}
              setData={setData}
              onContinue={() => {
                if (!domainAdded) {
                  handleSaveStep(5, {
                    domain: data.domain,
                    from_name: data.from_name,
                    from_email: data.from_email,
                  })
                } else {
                  goToStep(6)
                }
              }}
              onSkipStep={() => goToStep(6)}
              onAddDomain={() => setDomainAdded(true)}
              saving={saving}
              domainAdded={domainAdded}
              dnsConfirmed={dnsConfirmed}
              setDnsConfirmed={setDnsConfirmed}
            />
          )}

          {step === 6 && (
            <Step6Review
              data={data}
              saving={saving}
              onLaunch={handleComplete}
            />
          )}
        </div>
      </div>
    </div>
  )
}

// ── Step 1: Company Info ────────────────────────────────────────

function Step1Company({
  data,
  setData,
  onNext,
  saving,
}: {
  data: OnboardingData
  setData: React.Dispatch<React.SetStateAction<OnboardingData>>
  onNext: () => void
  saving: boolean
}) {
  return (
    <div>
      <h2 className="text-xl font-bold text-gray-900 mb-1">Company Information</h2>
      <p className="text-sm text-gray-500 mb-6">
        Tell us about your business so we can personalize your experience.
      </p>

      <div className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Company Name *
          </label>
          <input
            type="text"
            value={data.company_name}
            onChange={(e) => setData((d) => ({ ...d, company_name: e.target.value }))}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            placeholder="e.g. Sunset Realty LLC"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Street Address
          </label>
          <input
            type="text"
            value={data.company_address}
            onChange={(e) => setData((d) => ({ ...d, company_address: e.target.value }))}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            placeholder="123 Main Street"
          />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">City</label>
            <input
              type="text"
              value={data.company_city}
              onChange={(e) => setData((d) => ({ ...d, company_city: e.target.value }))}
              className="w
-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">State</label>
            <input
              type="text"
              value={data.company_state}
              onChange={(e) => setData((d) => ({ ...d, company_state: e.target.value }))}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">ZIP</label>
            <input
              type="text"
              value={data.company_zip}
              onChange={(e) => setData((d) => ({ ...d, company_zip: e.target.value }))}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Phone</label>
            <input
              type="tel"
              value={data.company_phone}
              onChange={(e) => setData((d) => ({ ...d, company_phone: e.target.value }))}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
          </div>
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Website</label>
          <input
            type="url"
            value={data.company_website}
            onChange={(e) => setData((d) => ({ ...d, company_website: e.target.value }))}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            placeholder="https://www.example.com"
          />
        </div>
      </div>

      <button
        onClick={onNext}
        disabled={!data.company_name || saving}
        className="mt-8 w-full py-2.5 bg-blue-600 text-white rounded-lg font-medium text-sm hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {saving ? 'Saving...' : 'Continue'}
      </button>
    </div>
  )
}


const EXPERIENCE_OPTIONS = [
  {
    value: 'beginner',
    emoji: '🌱',
    label: 'Just Getting Started',
    desc: 'Learning the ropes',
  },
  {
    value: 'intermediate',
    emoji: '📈',
    label: 'Some Experience',
    desc: 'Completed a few deals',
  },
  {
    value: 'experienced',
    emoji: '🏆',
    label: 'Experienced Investor',
    desc: 'Active portfolio, multiple deals',
  },
]

const DEAL_TYPE_OPTIONS = [
  { value: 'subject_to', label: 'Subject To' },
  { value: 'cash_purchase', label: 'Cash Purchase' },
  { value: 'owner_financing', label: 'Owner Financing' },
  { value: 'lease_option', label: 'Lease Option' },
  { value: 'fix_and_flip', label: 'Fix & Flip' },
]

function Step2InvestingProfile({
  data,
  setData,
  saving,
  onContinue,
}: {
  data: OnboardingData
  setData: React.Dispatch<React.SetStateAction<OnboardingData>>
  saving: boolean
  onContinue: () => void
}) {
  const toggleDealType = (val: string) => {
    setData((prev) => ({
      ...prev,
      deal_types: prev.deal_types.includes(val)
        ? prev.deal_types.filter((d) => d !== val)
        : [...prev.deal_types, val],
    }))
  }

  return (
    <div>
      <div className="text-center mb-8">
        <div className="text-5xl mb-4">📊</div>
        <h1 className="text-2xl font-bold text-slate-900">Tell us about your investing</h1>
        <p className="text-slate-500 mt-2">
          This helps us customize your experience and pre-load the right contract templates.
        </p>
      </div>

      <div className="space-y-6">
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-3">Experience Level</label>
          <div className="space-y-2">
            {EXPERIENCE_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                onClick={() => setData((prev) => ({ ...prev, investing_experience: opt.value }))}
                className={`w-full flex items-center gap-4 p-4 rounded-xl border-2 transition-all text-left ${
                  data.investing_experience === opt.value
                    ? 'border-blue-500 bg-blue-50'
                    : 'border-slate-200 hover:border-slate-300'
                }`}
              >
                <span className="text-3xl">{opt.emoji}</span>
                <div>
                  <div className="font-semibold text-slate-900">{opt.label}</div>
                  <div className="text-sm text-slate-500">{opt.desc}</div>
                </div>
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-700 mb-3">
            Deal Types (select all that apply)
          </label>
          <div className="space-y-2">
            {DEAL_TYPE_OPTIONS.map((opt) => (
              <label
                key={opt.value}
                className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-all ${
                  data.deal_types.includes(opt.value)
                    ? 'border-blue-500 bg-blue-50'
                    : 'border-slate-200 hover:border-slate-300'
                }`}
              >
                <input
                  type="checkbox"
                  checked={data.deal_types.includes(opt.value)}
                  onChange={() => toggleDealType(opt.value)}
                  className="w-4 h-4 text-blue-600 rounded border-slate-300 focus:ring-blue-500"
                />
                <span className="font-medium text-slate-700">{opt.label}</span>
              </label>
            ))}
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">Primary Market</label>
          <input
            type="text"
            value={data.primary_market}
            onChange={(e) => setData((prev) => ({ ...prev, primary_market: e.target.value }))}
            className="w-full px-4 py-2.5 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            placeholder="City, State (e.g. Austin, TX)"
          />
        </div>
      </div>

      <button
        onClick={onContinue}
        disabled={saving}
        className="mt-8 w-full py-3 bg-blue-600 text-white font-semibold rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors text-lg"
      >
        {saving ? 'Saving...' : 'Continue →'}
      </button>
    </div>
  )
}

function Step3Storage({
  data,
  setData,
  saving,
  storageConnected,
  setStorageConnected,
  onContinue,
  onSkipStep,
}: {
  data: OnboardingData
  setData: React.Dispatch<React.SetStateAction<OnboardingData>>
  saving: boolean
  storageConnected: boolean
  setStorageConnected: (v: boolean) => void
  onContinue: () => void
  onSkipStep: () => void
}) {
  const selectProvider = (provider: string) => {
    setData((prev) => ({ ...prev, storage_provider: provider }))
    setStorageConnected(true)
  }

  return (
    <div>
      <div className="text-center mb-8">
        <div className="text-5xl mb-4">📁</div>
        <h1 className="text-2xl font-bold text-slate-900">Where should we save your contracts?</h1>
        <p className="text-slate-500 mt-2">
          Generated contracts will be automatically organized in your chosen cloud storage.
        </p>
      </div>

      <div className="space-y-4">
        {/* Google Drive card */}
        <div
          className={`p-6 rounded-xl border-2 transition-all ${
            data.storage_provider === 'google_drive'
              ? 'border-blue-500 bg-blue-50'
              : 'border-slate-200'
          }`}
        >
          <div className="flex items-center gap-3 mb-3">
            <div className="w-10 h-10 rounded-lg bg-white border border-slate-200 flex items-center justify-center text-lg font-bold">
              <span className="text-blue-500">G</span>
            </div>
            <div>
              <div className="font-semibold text-slate-900">Google Drive</div>
              <div className="text-sm text-slate-500">
                Contracts saved to your Google Drive in organized folders
              </div>
            </div>
          </div>
          <div className="ml-13 mb-4 text-sm text-slate-600 bg-slate-50 rounded-lg p-3 font-mono">
            <div>📁 {data.company_name || 'Your Company Name'}/</div>
            <div className="ml-4">📁 John Smith/</div>
            <div className="ml-8">📁 Contracts/</div>
          </div>
          {data.storage_provider === 'google_drive' && storageConnected ? (
            <div className="flex items-center gap-2 text-green-600 font-medium text-sm">
              <span>✓</span> Connected
            </div>
          ) : (
            <button
              onClick={() => selectProvider('google_drive')}
              className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors"
            >
              Connect Google Drive
            </button>
          )}
        </div>

        {/* Dropbox card */}
        <div
          className={`p-6 rounded-xl border-2 transition-all ${
            data.storage_provider === 'dropbox'
              ? 'border-blue-500 bg-blue-50'
              : 'border-slate-200'
          }`}
        >
          <div className="flex items-center gap-3 mb-3">
            <div className="w-10 h-10 rounded-lg bg-white border border-slate-200 flex items-center justify-center">
              <span className="text-blue-600 font-bold text-lg">D</span>
            </div>
            <div>
              <div className="font-semibold text-slate-900">Dropbox</div>
              <div className="text-sm text-slate-500">
                Same organized folder structure in your Dropbox account
              </div>
            </div>
          </div>
          {data.storage_provider === 'dropbox' && storageConnected ? (
            <div className="flex items-center gap-2 text-green-600 font-medium text-sm">
              <span>✓</span> Connected
            </div>
          ) : (
            <button
              onClick={() => selectProvider('dropbox')}
              className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors"
            >
              Connect Dropbox
            </button>
          )}
        </div>
      </div>

      <div className="text-center mt-4">
        <button
          onClick={onSkipStep}
          className="text-sm text-slate-500 hover:text-slate-700 transition-colors"
        >
          I'll set this up later
        </button>
      </div>

      <button
        onClick={onContinue}
        disabled={saving || !data.storage_provider}
        className="mt-4 w-full py-3 bg-blue-600 text-white font-semibold rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors text-lg"
      >
        {saving ? 'Saving...' : 'Continue →'}
      </button>
    </div>
  )
}

function Step4Phone({
  data,
  setData,
  saving,
  searchingNumbers,
  availableNumbers,
  selectedNumber,
  setSelectedNumber,
  numberPurchased,
  forwardMode,
  setForwardMode,
  forwardNumber,
  setForwardNumber,
  onSearch,
  onContinue,
  onSkipStep,
}: {
  data: OnboardingData
  setData: React.Dispatch<React.SetStateAction<OnboardingData>>
  saving: boolean
  searchingNumbers: boolean
  availableNumbers: Array<{
    phone_number: string
    friendly_name: string
    capabilities: { voice: boolean; sms: boolean; fax: boolean }
  }>
  selectedNumber: string
  setSelectedNumber: (n: string) => void
  numberPurchased: boolean
  forwardMode: 'forward' | 'softphone'
  setForwardMode: (m: 'forward' | 'softphone') => void
  forwardNumber: string
  setForwardNumber: (n: string) => void
  onSearch: () => void
  onContinue: () => void
  onSkipStep: () => void
}) {
  const formatNumber = (num: string) => {
    const raw = num.replace('+1', '').replace(/\D/g, '')
    if (raw.length === 10) return `(${raw.slice(0, 3)}) ${raw.slice(3, 6)}-${raw.slice(6)}`
    return num
  }

  return (
    <div>
      <div className="text-center mb-8">
        <div className="text-5xl mb-4">📞</div>
        <h1 className="text-2xl font-bold text-slate-900">Set up your business phone number</h1>
        <p className="text-slate-500 mt-2">
          Your first number is included with your plan. Choose an area code that matches your market.
        </p>
      </div>

      {!numberPurchased ? (
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Area Code</label>
            <div className="flex gap-2">
              <input
                type="text"
                maxLength={3}
                value={data.area_code}
                onChange={(e) =>
                  setData((prev) => ({
                    ...prev,
                    area_code: e.target.value.replace(/\D/g, '').slice(0, 3),
                  }))
                }
                className="w-24 px-4 py-2.5 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-center text-lg"
                placeholder="512"
              />
              <button
                onClick={onSearch}
                disabled={searchingNumbers || data.area_code.length !== 3}
                className="px-4 py-2.5 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {searchingNumbers ? (
                  <span className="flex items-center gap-2">
                    <span className="animate-spin rounded-full h-4 w-4 border-b-2 border-white" />
                    Searching...
                  </span>
                ) : (
                  'Search Available Numbers'
                )}
              </button>
            </div>
            <p className="text-xs text-slate-500 mt-1">
              Enter the area code for your primary investing market
            </p>
          </div>

          {availableNumbers.length > 0 && (
            <div className="space-y-2">
              <label className="block text-sm font-medium text-slate-700">
                Available Numbers
              </label>
              <div className="grid gap-2 max-h-64 overflow-y-auto">
                {availableNumbers.map((n) => (
                  <button
                    key={n.phone_number}
                    onClick={() => setSelectedNumber(n.phone_number)}
                    className={`flex items-center justify-between p-3 rounded-lg border-2 transition-all ${
                      selectedNumber === n.phone_number
                        ? 'border-blue-500 bg-blue-50'
                        : 'border-slate-200 hover:border-slate-300'
                    }`}
                  >
                    <div>
                      <div className="font-mono font-semibold text-slate-900">
                        {formatNumber(n.phone_number)}
                      </div>
                      <div className="flex gap-1 mt-1">
                        {n.capabilities.voice && (
                          <span className="text-[10px] px-1.5 py-0.5 bg-green-100 text-green-700 rounded">
                            Voice
                          </span>
                        )}
                        {n.capabilities.sms && (
                          <span className="text-[10px] px-1.5 py-0.5 bg-blue-100 text-blue-700 rounded">
                            SMS
                          </span>
                        )}
                        {n.capabilities.fax && (
                          <span className="text-[10px] px-1.5 py-0.5 bg-purple-100 text-purple-700 rounded">
                            Fax
                          </span>
                        )}
                      </div>
                    </div>
                    {selectedNumber === n.phone_number && (
                      <span className="text-blue-600 font-medium text-sm">Selected</span>
                    )}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      ) : (
        <div className="space-y-6">
          <div className="flex items-center gap-3 p-4 bg-green-50 border border-green-200 rounded-xl">
            <span className="text-green-600 text-2xl">✓</span>
            <div>
              <div className="font-semibold text-green-800">
                Your number: {data.friendly_number || formatNumber(data.phone_number)}
              </div>
              <div className="text-sm text-green-600">This number is included in your plan</div>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-3">
              Where should calls ring?
            </label>
            <div className="space-y-2">
              <label
                className={`flex items-center gap-3 p-3 rounded-lg border-2 cursor-pointer transition-all ${
                  forwardMode === 'forward' ? 'border-blue-500 bg-blue-50' : 'border-slate-200'
                }`}
              >
                <input
                  type="radio"
                  name="callRouting"
                  checked={forwardMode === 'forward'}
                  onChange={() => setForwardMode('forward')}
                  className="w-4 h-4 text-blue-600"
                />
                <span className="font-medium text-slate-700">Forward to my cell</span>
              </label>
              <label
                className={`flex items-center gap-3 p-3 rounded-lg border-2 cursor-pointer transition-all ${
                  forwardMode === 'softphone' ? 'border-blue-500 bg-blue-50' : 'border-slate-200'
                }`}
              >
                <input
                  type="radio"
                  name="callRouting"
                  checked={forwardMode === 'softphone'}
                  onChange={() => setForwardMode('softphone')}
                  className="w-4 h-4 text-blue-600"
                />
                <span className="font-medium text-slate-700">Use browser softphone</span>
              </label>
            </div>

            {forwardMode === 'forward' && (
              <input
                type="tel"
                value={forwardNumber}
                onChange={(e) => setForwardNumber(e.target.value)}
                className="mt-3 w-full px-4 py-2.5 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                placeholder="(555) 123-4567"
              />
            )}
          </div>
        </div>
      )}

      <div className="text-center mt-4">
        <button
          onClick={onSkipStep}
          className="text-sm text-slate-500 hover:text-slate-700 transition-colors"
        >
          I'll set this up later
        </button>
      </div>

      <button
        onClick={onContinue}
        disabled={saving || (!numberPurchased && !selectedNumber && availableNumbers.length > 0)}
        className="mt-4 w-full py-3 bg-blue-600 text-white font-semibold rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors text-lg"
      >
        {saving ? 'Setting up...' : 'Continue →'}
      </button>
    </div>
  )
}

function Step5EmailDomain({
  data,
  setData,
  saving,
  domainAdded,
  dnsConfirmed,
  setDnsConfirmed,
  onAddDomain,
  onContinue,
  onSkipStep,
}: {
  data: OnboardingData
  setData: React.Dispatch<React.SetStateAction<OnboardingData>>
  saving: boolean
  domainAdded: boolean
  dnsConfirmed: boolean
  setDnsConfirmed: (v: boolean) => void
  onAddDomain: () => void
  onContinue: () => void
  onSkipStep: () => void
}) {
  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text).catch(() => {})
  }

  return (
    <div>
      <div className="text-center mb-8">
        <div className="text-5xl mb-4">📧</div>
        <h1 className="text-2xl font-bold text-slate-900">Send emails from your own domain</h1>
        <p className="text-slate-500 mt-2">
          Emails sent from your domain look more professional and get better deliverability than
          shared domains.
        </p>
      </div>

      {!domainAdded ? (
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Your Domain</label>
            <input
              type="text"
              value={data.domain}
              onChange={(e) => setData((prev) => ({ ...prev, domain: e.target.value }))}
              className="w-full px-4 py-2.5 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              placeholder="abcinvestments.com"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">From Name</label>
            <input
              type="text"
              value={data.from_name}
              onChange={(e) => setData((prev) => ({ ...prev, from_name: e.target.value }))}
              className="w-full px-4 py-2.5 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              placeholder="ABC Investments"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">From Email</label>
            <input
              type="email"
              value={data.from_email}
              onChange={(e) => setData((prev) => ({ ...prev, from_email: e.target.value }))}
              className="w-full px-4 py-2.5 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              placeholder="deals@abcinvestments.com"
            />
          </div>

          <button
            onClick={onAddDomain}
            disabled={saving || !data.domain || !data.from_name || !data.from_email}
            className="w-full py-2.5 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {saving ? (
              <span className="flex items-center justify-center gap-2">
                <span className="animate-spin rounded-full h-4 w-4 border-b-2 border-white" />
                Adding Domain...
              </span>
            ) : (
              'Add Domain'
            )}
          </button>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="p-4 bg-blue-50 border border-blue-200 rounded-xl">
            <h3 className="font-semibold text-blue-800 mb-3">
              Add these records to your domain registrar
            </h3>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-blue-700">
                    <th className="pb-2 pr-3">Type</th>
                    <th className="pb-2 pr-3">Host</th>
                    <th className="pb-2 pr-3">Value</th>
                    <th className="pb-2"></th>
                  </tr>
                </thead>
                <tbody>
                  {data.dns_records.map((r, i) => (
                    <tr key={i} className="border-t border-blue-200">
                      <td className="py-2 pr-3 font-mono text-xs">{r.type}</td>
                      <td className="py-2 pr-3 font-mono text-xs max-w-[120px] truncate">
                        {r.host}
                      </td>
                      <td className="py-2 pr-3 font-mono text-xs max-w-[180px] truncate">
                        {r.value}
                      </td>
                      <td className="py-2">
                        <button
                          onClick={() => copyToClipboard(r.value)}
                          className="text-blue-600 hover:text-blue-800 text-xs"
                        >
                          Copy
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="text-xs text-blue-600 mt-3">
              DNS changes can take up to 48 hours to propagate.
            </p>
          </div>

          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={dnsConfirmed}
              onChange={(e) => setDnsConfirmed(e.target.checked)}
              className="w-4 h-4 text-blue-600 rounded border-slate-300 focus:ring-blue-500"
            />
            <span className="text-sm text-slate-700">I've added the records</span>
          </label>
        </div>
      )}

      <div className="text-center mt-4">
        <button
          onClick={onSkipStep}
          className="text-sm text-slate-500 hover:text-slate-700 transition-colors"
        >
          I'll set this up later
        </button>
      </div>

      <button
        onClick={onContinue}
        disabled={saving}
        className="mt-4 w-full py-3 bg-blue-600 text-white font-semibold rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors text-lg"
      >
        Continue →
      </button>
    </div>
  )
}

function Step6Review({
  data,
  saving,
  onLaunch,
}: {
  data: OnboardingData
  saving: boolean
  onLaunch: () => void
}) {
  return (
    <div>
      <div className="text-center mb-8">
        <div className="text-5xl mb-4">🚀</div>
        <h1 className="text-2xl font-bold text-slate-900">You're all set!</h1>
        <p className="text-slate-500 mt-2">Here's a summary of your setup.</p>
      </div>

      <div className="space-y-3 mb-8">
        <SummaryRow label="Company" value={data.company_name || 'Not set up yet'} />
        <SummaryRow label="Market" value={data.primary_market || 'Not set up yet'} />
        <div className="flex items-start justify-between py-2 border-b border-slate-100 gap-3">
          <span className="text-sm text-slate-500 shrink-0">Deal Types</span>
          <div className="flex flex-wrap gap-1 justify-end max-w-[200px] sm:max-w-[300px]">
            {data.deal_types.length > 0 ? (
              data.deal_types.map((dt) => (
                <span
                  key={dt}
                  className="text-xs px-2 py-0.5 bg-blue-100 text-blue-700 rounded-full"
                >
                  {dt.replace(/_/g, ' ')}
                </span>
              ))
            ) : (
              <span className="text-sm text-slate-400">Not set up yet</span>
            )}
          </div>
        </div>
        <SummaryRow
          label="Phone"
          value={data.friendly_number || data.phone_number || 'Not set up yet'}
        />
        <SummaryRow label="Email Domain" value={data.domain || 'Not set up yet'} />
        <SummaryRow
          label="Storage"
          value={
            data.storage_provider
              ? data.storage_provider === 'google_drive'
                ? 'Google Drive'
                : 'Dropbox'
              : 'Not set up yet'
          }
        />
      </div>

      <div className="mb-8">
        <h3 className="font-semibold text-slate-900 mb-3">What's ready for you:</h3>
        <div className="space-y-2">
          {[
            'Deal Pipeline & CRM',
            'Contract Templates pre-loaded for your deal types',
            'Proof of Funds verification',
            'Document generation',
            'Email marketing',
            'Phone system',
            'AI Voicemail Drops (Pro plan)',
            'AI-powered legal research',
          ].map((item) => (
            <div key={item} className="flex items-center gap-2 text-sm text-slate-700">
              <span className="text-green-500">✅</span>
              {item}
            </div>
          ))}
        </div>
      </div>

      <button
        onClick={onLaunch}
        disabled={saving}
        className="w-full py-4 bg-blue-600 text-white font-bold rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors text-xl"
      >
        {saving ? (
          <span className="flex items-center justify-center gap-2">
            <span className="animate-spin rounded-full h-5 w-5 border-b-2 border-white" />
            Setting up your workspace...
          </span>
        ) : (
          'Launch REI Hub →'
        )}
      </button>

      <p className="text-center text-xs text-slate-400 mt-4">
        You can update all these settings anytime in your account settings.
      </p>
    </div>
  )
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between py-2 border-b border-slate-100">
      <span className="text-sm text-slate-500">{label}</span>
      <span className={`text-sm font-medium ${value === 'Not set up yet' ? 'text-slate-400' : 'text-slate-900'}`}>
        {value}
      </span>
    </div>
  )
}
