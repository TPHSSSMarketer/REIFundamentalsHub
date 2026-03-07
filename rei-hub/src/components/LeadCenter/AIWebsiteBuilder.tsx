import { useState, useEffect } from 'react'
import { X, Sparkles, CheckCircle, AlertCircle, Building2, MapPin, Phone, Mail, FileText } from 'lucide-react'
import { templates } from './templates'

// ── Types ──────────────────────────────────────────

interface FormState {
  templateId: string
  company_name: string
  headline: string
  description: string
  phone: string
  email: string
  primary_color: string
  form_fields: string[]
  webhook_url: string
  custom_domain: string
  market?: string
  logo_url?: string
  slug?: string
}

interface AIWebsiteBuilderProps {
  isOpen: boolean
  onClose: () => void
  onComplete: (config: FormState, templateId: string) => void
}

interface UserProfile {
  company_name?: string | null
  company_phone?: string | null
  company_website?: string | null
  company_logo_b64?: string | null
  mission_statement?: string | null
  content_tone?: string | null
  investing_strategy?: string | null
  primary_market?: string | null
}

// ── Color Swatches ────────────────────────────────

const COLOR_SWATCHES = [
  '#1a3a5c', // Dark Blue
  '#2d2d2d', // Dark Gray
  '#0d9488', // Teal
  '#059669', // Green
  '#7c3aed', // Purple
  '#dc2626', // Red
]

const TOTAL_STEPS = 5

// ── Copy Generation Logic ──────────────────────────

function generateCopy(
  templateId: string,
  companyName: string,
  market: string,
  missionStatement?: string | null,
): { headline: string; description: string } {
  const copyTemplates: Record<string, (company: string, market: string) => { headline: string; description: string }> = {
    motivated_sellers: (company, market) => ({
      headline: `Sell Your ${market} Home Fast For Cash`,
      description: `${company} buys houses in any condition throughout ${market}. Get a fair cash offer in 24 hours — no repairs, no commissions, no hassle.`,
    }),
    cash_buyers: (company, market) => ({
      headline: `Get Exclusive Off-Market Deals in ${market}`,
      description: `Join ${company}'s VIP buyers list and get first access to below-market investment properties in ${market}.`,
    }),
    investor_agent: (company, market) => ({
      headline: `Real Estate Solutions For Every Situation in ${market}`,
      description: `Whether you're buying, selling, or investing in ${market} — ${company} has a solution for you.`,
    }),
    agent: (company, market) => ({
      headline: `What's Your ${market} Home Really Worth?`,
      description: `Get a free, no-obligation home valuation from ${company}, a local real estate expert serving ${market}.`,
    }),
    company_credibility: (company, market) => ({
      headline: `Your Trusted Local Real Estate Partner in ${market}`,
      description: `Learn about ${company}, our values, and why hundreds of homeowners in ${market} trust us.`,
    }),
    mobile_homes: (company, market) => ({
      headline: `We Buy Mobile Homes For Cash in ${market}`,
      description: `Sell your mobile home fast in ${market}. Any condition, any age. ${company} offers fair cash offers today.`,
    }),
    land: (company, market) => ({
      headline: `We Buy Land in ${market} — Any Size, Any Condition`,
      description: `Sell your vacant land fast for cash in ${market}. No listing fees, no waiting, no hassle. Contact ${company} today.`,
    }),
    rent_to_own: (company, market) => ({
      headline: `Own Your Dream Home in ${market} — No Bank Needed`,
      description: `${company}'s rent-to-own homes available now in ${market}. Build equity while you live in your future home.`,
    }),
    owner_finance: (company, market) => ({
      headline: `Owner Financing Available in ${market} — Move In Fast`,
      description: `No bank qualification needed. Low down payment. Flexible terms. ${company}'s owner-financed homes in ${market} await.`,
    }),
    note_buying: (company, market) => ({
      headline: `Sell Your Mortgage Note For Cash`,
      description: `${company} pays competitive cash prices for performing or non-performing mortgage notes. Get a quote today.`,
    }),
  }

  const generator = copyTemplates[templateId]
  if (!generator) {
    return {
      headline: 'Build Your LeadHub Website',
      description: 'Get started with your LeadHub website today.',
    }
  }

  const { headline, description } = generator(companyName, market)

  // If the user has a mission statement, append it to give the page an authentic feel
  if (missionStatement && missionStatement.trim()) {
    return {
      headline,
      description: `${description} ${missionStatement.trim()}`,
    }
  }

  return { headline, description }
}

// ── Main Component ────────────────────────────────

export default function AIWebsiteBuilder({ isOpen, onClose, onComplete }: AIWebsiteBuilderProps) {
  const [step, setStep] = useState(1)
  const [isLoading, setIsLoading] = useState(false)
  const [profile, setProfile] = useState<UserProfile | null>(null)
  const [profileLoading, setProfileLoading] = useState(true)
  const [answers, setAnswers] = useState({
    templateId: 'motivated_sellers',
    email: '',
    color: 'auto',
  })

  // Fetch user profile when modal opens
  useEffect(() => {
    if (isOpen) {
      setStep(1)
      setProfileLoading(true)

      const BASE_URL = import.meta.env.VITE_REI_SERVER_URL ?? 'http://localhost:8001'
      fetch(`${BASE_URL}/api/auth/me/profile`, { credentials: 'include' })
        .then(res => res.ok ? res.json() : null)
        .then((data: UserProfile | null) => {
          setProfile(data)
          setAnswers({ templateId: 'motivated_sellers', email: '', color: 'auto' })
          setProfileLoading(false)
        })
        .catch(() => {
          setProfile(null)
          setAnswers({ templateId: 'motivated_sellers', email: '', color: 'auto' })
          setProfileLoading(false)
        })
    }
  }, [isOpen])

  if (!isOpen) return null

  const handleNext = async () => {
    if (step < TOTAL_STEPS) {
      setStep(step + 1)
    } else {
      // Final step — generate config
      setIsLoading(true)
      await new Promise(resolve => setTimeout(resolve, 1500))

      const template = templates.find(t => t.id === answers.templateId)
      if (!template) {
        setIsLoading(false)
        return
      }

      const companyName = profile?.company_name || 'My Company'
      const market = profile?.primary_market || ''

      const { headline, description } = generateCopy(
        answers.templateId,
        companyName,
        market,
        profile?.mission_statement,
      )

      const primaryColor = answers.color === 'auto' ? template.defaultColor : answers.color

      const config: FormState = {
        templateId: answers.templateId,
        company_name: companyName,
        headline,
        description,
        phone: profile?.company_phone || '',
        email: answers.email,
        primary_color: primaryColor,
        form_fields: ['name', 'phone', 'email', 'address', 'message'],
        webhook_url: '',
        custom_domain: '',
        market,
        logo_url: '',
      }

      onComplete(config, answers.templateId)
      setIsLoading(false)
      onClose()
    }
  }

  const handleBack = () => {
    if (step > 1) setStep(step - 1)
  }

  const canProceed = () => {
    switch (step) {
      case 1: // Profile review — just need company name + market
        return !!(profile?.company_name && profile?.primary_market)
      case 2: // Lead type
        return answers.templateId.length > 0
      case 3: // Email
        return answers.email.trim().length > 0
      case 4: // Color
        return true
      case 5: // Final review
        return true
      default:
        return false
    }
  }

  const hasMission = !!(profile?.mission_statement && profile.mission_statement.trim())
  const profileComplete = !!(profile?.company_name && profile?.primary_market && profile?.company_phone)

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="sticky top-0 bg-gradient-to-r from-purple-500 to-blue-500 text-white p-6 flex justify-between items-center z-10">
          <div className="flex items-center gap-3">
            <Sparkles className="w-6 h-6" />
            <div>
              <h2 className="text-2xl font-bold">Build Your Lead Site</h2>
              <p className="text-purple-100 text-sm">Step {step} of {TOTAL_STEPS}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="hover:bg-white hover:bg-opacity-20 p-2 rounded-lg transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Progress Bar */}
        <div className="h-1 bg-gray-200">
          <div
            className="h-full bg-gradient-to-r from-purple-500 to-blue-500 transition-all duration-300"
            style={{ width: `${(step / TOTAL_STEPS) * 100}%` }}
          />
        </div>

        {/* Content */}
        <div className="p-8">
          {profileLoading ? (
            <div className="flex items-center justify-center py-16">
              <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-purple-500 mr-4" />
              <p className="text-gray-600">Loading your profile...</p>
            </div>
          ) : (
            <>
              {/* ── Step 1: Review Your Company Info ── */}
              {step === 1 && (
                <div className="space-y-6">
                  <div className="flex justify-start">
                    <div className="bg-gray-100 text-gray-800 rounded-lg p-4 max-w-sm">
                      <p className="text-lg font-medium">Here's the company info I have on file. This will be used to build your site:</p>
                    </div>
                  </div>

                  <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-4">
                    {/* Company Name */}
                    <div className="flex items-start gap-3">
                      <Building2 className="w-5 h-5 text-slate-400 mt-0.5 flex-shrink-0" />
                      <div className="flex-grow">
                        <p className="text-xs font-medium text-slate-500 uppercase tracking-wide">Company Name</p>
                        <p className={`text-base font-semibold ${profile?.company_name ? 'text-slate-800' : 'text-red-500'}`}>
                          {profile?.company_name || 'Not set — update in Settings'}
                        </p>
                      </div>
                    </div>

                    {/* Market */}
                    <div className="flex items-start gap-3">
                      <MapPin className="w-5 h-5 text-slate-400 mt-0.5 flex-shrink-0" />
                      <div className="flex-grow">
                        <p className="text-xs font-medium text-slate-500 uppercase tracking-wide">Primary Market</p>
                        <p className={`text-base font-semibold ${profile?.primary_market ? 'text-slate-800' : 'text-red-500'}`}>
                          {profile?.primary_market || 'Not set — update in Settings'}
                        </p>
                      </div>
                    </div>

                    {/* Phone */}
                    <div className="flex items-start gap-3">
                      <Phone className="w-5 h-5 text-slate-400 mt-0.5 flex-shrink-0" />
                      <div className="flex-grow">
                        <p className="text-xs font-medium text-slate-500 uppercase tracking-wide">Phone</p>
                        <p className={`text-base font-semibold ${profile?.company_phone ? 'text-slate-800' : 'text-amber-600'}`}>
                          {profile?.company_phone || 'Not set (optional)'}
                        </p>
                      </div>
                    </div>

                    {/* Mission Statement */}
                    <div className="flex items-start gap-3">
                      <FileText className="w-5 h-5 text-slate-400 mt-0.5 flex-shrink-0" />
                      <div className="flex-grow">
                        <p className="text-xs font-medium text-slate-500 uppercase tracking-wide">Mission Statement</p>
                        {hasMission ? (
                          <p className="text-sm text-slate-700 mt-1 leading-relaxed bg-purple-50 border border-purple-100 rounded-lg p-3">
                            {profile!.mission_statement}
                          </p>
                        ) : (
                          <p className="text-sm text-amber-600 mt-1">
                            Not set — add one in Settings to personalize your website copy
                          </p>
                        )}
                      </div>
                    </div>
                  </div>

                  {!profileComplete && (
                    <div className="flex items-center gap-2 px-4 py-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
                      <AlertCircle className="w-4 h-4 flex-shrink-0" />
                      <span>Please fill in your company name and market in <strong>Settings</strong> before building a site.</span>
                    </div>
                  )}

                  {profileComplete && (
                    <div className="flex items-center gap-2 px-4 py-3 bg-green-50 border border-green-200 rounded-lg text-sm text-green-700">
                      <CheckCircle className="w-4 h-4 flex-shrink-0" />
                      <span>Looks good! Click <strong>Next</strong> to continue.</span>
                    </div>
                  )}
                </div>
              )}

              {/* ── Step 2: What type of leads? ── */}
              {step === 2 && (
                <div className="space-y-6">
                  <div className="flex justify-start">
                    <div className="bg-gray-100 text-gray-800 rounded-lg p-4 max-w-xs">
                      <p className="text-lg font-medium">What type of leads are you looking for?</p>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    {[
                      { value: 'motivated_sellers', label: 'Motivated Sellers' },
                      { value: 'cash_buyers', label: 'Cash Buyers' },
                      { value: 'investor_agent', label: 'Investor/Agent' },
                      { value: 'agent', label: 'Agent/Realtor' },
                      { value: 'company_credibility', label: 'Company Branding' },
                      { value: 'mobile_homes', label: 'Mobile Homes' },
                      { value: 'land', label: 'Land' },
                      { value: 'rent_to_own', label: 'Rent-to-Own' },
                      { value: 'owner_finance', label: 'Owner Financing' },
                      { value: 'note_buying', label: 'Note Buying' },
                    ].map(option => (
                      <button
                        key={option.value}
                        onClick={() => setAnswers(prev => ({ ...prev, templateId: option.value }))}
                        className={`px-4 py-3 rounded-lg font-medium transition ${
                          answers.templateId === option.value
                            ? 'bg-blue-500 text-white'
                            : 'bg-gray-100 text-gray-800 hover:bg-gray-200'
                        }`}
                      >
                        {option.label}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* ── Step 3: Email ── */}
              {step === 3 && (
                <div className="space-y-6">
                  <div className="flex justify-start">
                    <div className="bg-gray-100 text-gray-800 rounded-lg p-4 max-w-xs">
                      <p className="text-lg font-medium">What email should leads contact you at?</p>
                    </div>
                  </div>
                  <input
                    type="email"
                    placeholder="your.email@example.com"
                    value={answers.email}
                    onChange={e => setAnswers(prev => ({ ...prev, email: e.target.value }))}
                    onKeyPress={e => {
                      if (e.key === 'Enter' && canProceed()) handleNext()
                    }}
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-200"
                    autoFocus
                  />
                </div>
              )}

              {/* ── Step 4: Color ── */}
              {step === 4 && (
                <div className="space-y-6">
                  <div className="flex justify-start">
                    <div className="bg-gray-100 text-gray-800 rounded-lg p-4 max-w-sm">
                      <p className="text-lg font-medium">Choose your brand color, or I'll pick one that matches your business:</p>
                    </div>
                  </div>
                  <div className="space-y-4">
                    <div className="grid grid-cols-6 gap-3">
                      {COLOR_SWATCHES.map(color => (
                        <button
                          key={color}
                          onClick={() => setAnswers(prev => ({ ...prev, color }))}
                          className={`h-16 rounded-lg border-4 transition ${
                            answers.color === color
                              ? 'border-gray-800'
                              : 'border-gray-300'
                          }`}
                          style={{ backgroundColor: color }}
                          title={color}
                        />
                      ))}
                    </div>
                    <button
                      onClick={() => setAnswers(prev => ({ ...prev, color: 'auto' }))}
                      className={`w-full px-4 py-3 rounded-lg font-medium transition ${
                        answers.color === 'auto'
                          ? 'bg-purple-500 text-white'
                          : 'bg-gray-100 text-gray-800 hover:bg-gray-200'
                      }`}
                    >
                      Auto-Pick Based on Template
                    </button>
                  </div>
                </div>
              )}

              {/* ── Step 5: Final Review ── */}
              {step === 5 && (
                <div className="space-y-6">
                  <div className="flex justify-start">
                    <div className="bg-gray-100 text-gray-800 rounded-lg p-4 max-w-sm">
                      <p className="text-lg font-medium">Here's a summary. Click "Build Website" when you're ready!</p>
                    </div>
                  </div>
                  <div className="bg-slate-50 border border-slate-200 rounded-xl p-5 space-y-3 text-sm">
                    <div className="flex justify-between">
                      <span className="text-slate-500">Company</span>
                      <span className="font-semibold text-slate-800">{profile?.company_name}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-500">Market</span>
                      <span className="font-semibold text-slate-800">{profile?.primary_market}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-500">Lead Type</span>
                      <span className="font-semibold text-slate-800">
                        {templates.find(t => t.id === answers.templateId)?.name || answers.templateId}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-500">Email</span>
                      <span className="font-semibold text-slate-800">{answers.email}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-500">Phone</span>
                      <span className="font-semibold text-slate-800">{profile?.company_phone || 'None'}</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-slate-500">Color</span>
                      <span className="flex items-center gap-2">
                        {answers.color === 'auto' ? (
                          <span className="font-semibold text-slate-800">Auto</span>
                        ) : (
                          <>
                            <span className="w-5 h-5 rounded border border-slate-300 inline-block" style={{ backgroundColor: answers.color }} />
                            <span className="font-semibold text-slate-800">{answers.color}</span>
                          </>
                        )}
                      </span>
                    </div>
                    {hasMission && (
                      <div className="pt-2 border-t border-slate-200">
                        <span className="text-slate-500 block mb-1">Mission Statement</span>
                        <p className="text-slate-700 bg-purple-50 border border-purple-100 rounded-lg p-3 leading-relaxed">
                          {profile!.mission_statement}
                        </p>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </>
          )}

          {/* Loading State */}
          {isLoading && (
            <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 rounded-lg">
              <div className="bg-white p-8 rounded-lg text-center">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto mb-4" />
                <p className="text-gray-700 font-medium">Building your website...</p>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="bg-gray-50 px-8 py-4 flex justify-between gap-4 border-t border-gray-200">
          <button
            onClick={handleBack}
            disabled={step === 1}
            className="px-6 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed transition"
          >
            Back
          </button>
          <button
            onClick={handleNext}
            disabled={!canProceed() || isLoading || profileLoading}
            className="px-6 py-2 bg-gradient-to-r from-purple-500 to-blue-500 text-white rounded-lg hover:from-purple-600 hover:to-blue-600 disabled:opacity-50 disabled:cursor-not-allowed transition"
          >
            {step === TOTAL_STEPS ? 'Build Website' : 'Next'}
          </button>
        </div>
      </div>
    </div>
  )
}
