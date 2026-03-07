import { useState, useEffect } from 'react'
import { X, Sparkles } from 'lucide-react'
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

// ── Color Swatches ────────────────────────────────

const COLOR_SWATCHES = [
  '#1a3a5c', // Dark Blue
  '#2d2d2d', // Dark Gray
  '#0d9488', // Teal
  '#059669', // Green
  '#7c3aed', // Purple
  '#dc2626', // Red
]

// ── Copy Generation Logic ──────────────────────────

function generateCopy(
  templateId: string,
  companyName: string,
  market: string
): { headline: string; description: string } {
  const templates: Record<string, (company: string, market: string) => { headline: string; description: string }> = {
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

  const generator = templates[templateId]
  if (!generator) {
    return {
      headline: 'Build Your LeadHub Website',
      description: 'Get started with your LeadHub website today.',
    }
  }

  return generator(companyName, market)
}

// ── Main Component ────────────────────────────────

export default function AIWebsiteBuilder({ isOpen, onClose, onComplete }: AIWebsiteBuilderProps) {
  const [step, setStep] = useState(1)
  const [isLoading, setIsLoading] = useState(false)
  const [answers, setAnswers] = useState({
    companyName: '',
    market: '',
    templateId: 'motivated_sellers',
    phone: '',
    email: '',
    color: 'auto',
  })

  // Reset state when modal opens
  useEffect(() => {
    if (isOpen) {
      setStep(1)
      setAnswers({
        companyName: '',
        market: '',
        templateId: 'motivated_sellers',
        phone: '',
        email: '',
        color: 'auto',
      })
    }
  }, [isOpen])

  if (!isOpen) return null

  const questions = [
    {
      step: 1,
      question: "What's your company name?",
      key: 'companyName',
      type: 'text',
      placeholder: 'e.g., ABC Properties',
    },
    {
      step: 2,
      question: 'What city or market do you operate in?',
      key: 'market',
      type: 'text',
      placeholder: 'e.g., San Antonio, TX',
    },
    {
      step: 3,
      question: 'What type of leads are you looking for?',
      key: 'templateId',
      type: 'buttons',
      options: [
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
      ],
    },
    {
      step: 4,
      question: "What's the best phone number to reach you?",
      key: 'phone',
      type: 'tel',
      placeholder: '(555) 123-4567',
    },
    {
      step: 5,
      question: "What's your email address?",
      key: 'email',
      type: 'email',
      placeholder: 'your.email@example.com',
    },
    {
      step: 6,
      question: "Choose your brand color, or I'll pick one that matches your business:",
      key: 'color',
      type: 'colors',
    },
  ]

  const currentQuestion = questions.find(q => q.step === step)

  const handleInputChange = (value: string) => {
    const key = currentQuestion?.key as keyof typeof answers
    setAnswers(prev => ({ ...prev, [key]: value }))
  }

  const handleColorSelect = (color: string) => {
    setAnswers(prev => ({ ...prev, color }))
  }

  const handleNext = async () => {
    if (step < 6) {
      setStep(step + 1)
    } else {
      // Final step - generate config
      setIsLoading(true)

      // Simulate API delay
      await new Promise(resolve => setTimeout(resolve, 1500))

      // Get the selected template
      const template = templates.find(t => t.id === answers.templateId)
      if (!template) {
        setIsLoading(false)
        return
      }

      // Generate copy
      const { headline, description } = generateCopy(
        answers.templateId,
        answers.companyName,
        answers.market
      )

      // Determine color
      const primaryColor = answers.color === 'auto' ? template.defaultColor : answers.color

      // Build complete config
      const config: FormState = {
        templateId: answers.templateId,
        company_name: answers.companyName,
        headline,
        description,
        phone: answers.phone,
        email: answers.email,
        primary_color: primaryColor,
        form_fields: ['name', 'phone', 'email', 'address', 'message'],
        webhook_url: '',
        custom_domain: '',
        market: answers.market,
        logo_url: '',
      }

      onComplete(config, answers.templateId)
      setIsLoading(false)
      onClose()
    }
  }

  const handleBack = () => {
    if (step > 1) {
      setStep(step - 1)
    }
  }

  const canProceed = () => {
    switch (step) {
      case 1:
        return answers.companyName.trim().length > 0
      case 2:
        return answers.market.trim().length > 0
      case 3:
        return answers.templateId.length > 0
      case 4:
        return answers.phone.trim().length > 0
      case 5:
        return answers.email.trim().length > 0
      case 6:
        return true
      default:
        return false
    }
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="sticky top-0 bg-gradient-to-r from-purple-500 to-blue-500 text-white p-6 flex justify-between items-center">
          <div className="flex items-center gap-3">
            <Sparkles className="w-6 h-6" />
            <div>
              <h2 className="text-2xl font-bold">Build Your Lead Site</h2>
              <p className="text-purple-100 text-sm">Step {step} of 6</p>
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
            style={{ width: `${(step / 6) * 100}%` }}
          />
        </div>

        {/* Content */}
        <div className="p-8">
          <div className="space-y-8 min-h-[400px] flex flex-col justify-between">
            {/* Chat Messages */}
            <div className="space-y-6">
              {/* AI Question */}
              <div className="flex justify-start">
                <div className="bg-gray-100 text-gray-800 rounded-lg p-4 max-w-xs">
                  <p className="text-lg font-medium">{currentQuestion?.question}</p>
                </div>
              </div>

              {/* User Answer Display */}
              {step > 1 && (
                <div className="flex justify-end">
                  <div className="bg-blue-500 text-white rounded-lg p-4 max-w-xs">
                    <p>
                      {step === 2 && answers.companyName}
                      {step === 3 && answers.market}
                      {step === 4 &&
                        templates.find(t => t.id === answers.templateId)?.name}
                      {step === 5 && answers.phone}
                      {step === 6 && answers.email}
                    </p>
                  </div>
                </div>
              )}
            </div>

            {/* Input Section */}
            <div className="space-y-6">
              {currentQuestion?.type === 'text' && (
                <input
                  type="text"
                  placeholder={currentQuestion.placeholder}
                  value={
                    answers[currentQuestion.key as keyof typeof answers] as string
                  }
                  onChange={e => handleInputChange(e.target.value)}
                  onKeyPress={e => {
                    if (e.key === 'Enter' && canProceed()) handleNext()
                  }}
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-200"
                  autoFocus
                />
              )}

              {currentQuestion?.type === 'tel' && (
                <input
                  type="tel"
                  placeholder={currentQuestion.placeholder}
                  value={answers.phone}
                  onChange={e => handleInputChange(e.target.value)}
                  onKeyPress={e => {
                    if (e.key === 'Enter' && canProceed()) handleNext()
                  }}
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-200"
                  autoFocus
                />
              )}

              {currentQuestion?.type === 'email' && (
                <input
                  type="email"
                  placeholder={currentQuestion.placeholder}
                  value={answers.email}
                  onChange={e => handleInputChange(e.target.value)}
                  onKeyPress={e => {
                    if (e.key === 'Enter' && canProceed()) handleNext()
                  }}
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-200"
                  autoFocus
                />
              )}

              {currentQuestion?.type === 'buttons' && (
                <div className="grid grid-cols-2 gap-3">
                  {currentQuestion.options?.map(option => (
                    <button
                      key={option.value}
                      onClick={() => handleInputChange(option.value)}
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
              )}

              {currentQuestion?.type === 'colors' && (
                <div className="space-y-4">
                  <div className="grid grid-cols-6 gap-3">
                    {COLOR_SWATCHES.map(color => (
                      <button
                        key={color}
                        onClick={() => handleColorSelect(color)}
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
                    onClick={() => handleColorSelect('auto')}
                    className={`w-full px-4 py-3 rounded-lg font-medium transition ${
                      answers.color === 'auto'
                        ? 'bg-purple-500 text-white'
                        : 'bg-gray-100 text-gray-800 hover:bg-gray-200'
                    }`}
                  >
                    ✨ Auto-Pick Based on Template
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* Loading State */}
          {isLoading && (
            <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 rounded-lg">
              <div className="bg-white p-8 rounded-lg text-center">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto mb-4" />
                <p className="text-gray-700 font-medium">
                  Building your website...
                </p>
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
            disabled={!canProceed() || isLoading}
            className="px-6 py-2 bg-gradient-to-r from-purple-500 to-blue-500 text-white rounded-lg hover:from-purple-600 hover:to-blue-600 disabled:opacity-50 disabled:cursor-not-allowed transition"
          >
            {step === 6 ? 'Build Website' : 'Next'}
          </button>
        </div>
      </div>
    </div>
  )
}
