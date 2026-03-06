import { useState, useEffect } from 'react'
import { getCurrentUser } from '@/services/auth'
import StripeConnectSetup from '../LoanServicing/StripeConnectSetup'

const BASE_URL = import.meta.env.VITE_REI_SERVER_URL ?? 'http://localhost:8001'

interface Props {
  onComplete: () => void
}

export default function LoanServicingOnboarding({ onComplete }: Props) {
  const [step, setStep] = useState(1)
  const [saving, setSaving] = useState(false)
  const [toast, setToast] = useState('')

  // Step 1 — Branding
  const [companyName, setCompanyName] = useState('')
  const [logoUrl, setLogoUrl] = useState('')

  // Step 3 — Portal Color
  const [portalColor, setPortalColor] = useState('#1B3A6B')

  // Step 4 — Default Investor %
  const [defaultInvestorPct, setDefaultInvestorPct] = useState(4)

  // Stripe skip warning
  const [stripeSkipped, setStripeSkipped] = useState(false)

  useEffect(() => {
    getCurrentUser().then((user: any) => {
      if (user) {
        setCompanyName(user.company_name || user.loan_company_name || '')
        setLogoUrl(user.company_logo_url || user.logo_url || '')
        if (user.loan_portal_primary_color) setPortalColor(user.loan_portal_primary_color)
        if (user.loan_default_investor_pct != null) setDefaultInvestorPct(user.loan_default_investor_pct)
      }
    }).catch(() => {})
  }, [])

  async function handleFinish() {
    setSaving(true)
    try {
      const res = await fetch(`${BASE_URL}/api/users/me`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({
          loan_servicing_onboarding_complete: true,
          loan_company_name: companyName,
          company_logo_url: logoUrl,
          loan_portal_primary_color: portalColor,
          loan_default_investor_pct: defaultInvestorPct,
        }),
      })
      if (!res.ok) throw new Error('Failed to save')
      setToast('Loan Servicing is ready to use!')
      setTimeout(() => {
        setToast('')
        onComplete()
      }, 2000)
    } catch {
      setToast('Failed to save — please try again')
      setTimeout(() => setToast(''), 4000)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50">
      {toast && (
        <div className="fixed top-4 right-4 z-[60] bg-[#1B3A6B] text-white px-4 py-2 rounded-lg shadow-lg text-sm">
          {toast}
        </div>
      )}

      <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg mx-4 max-h-[90vh] overflow-y-auto">
        {/* Progress */}
        <div className="px-6 pt-6 pb-3">
          <p className="text-xs font-medium text-slate-500 mb-3">Step {step} of 4</p>
          <div className="flex gap-2">
            {[1, 2, 3, 4].map((s) => (
              <div
                key={s}
                className={`h-2 flex-1 rounded-full transition-colors ${
                  s <= step ? 'bg-[#1B3A6B]' : 'bg-slate-200'
                }`}
              />
            ))}
          </div>
        </div>

        <div className="px-6 pb-6">
          {/* Step 1 — Welcome + Branding */}
          {step === 1 && (
            <div className="space-y-5">
              <div>
                <h2 className="text-xl font-bold text-slate-900 mb-2">Welcome to Loan Servicing</h2>
                <p className="text-sm text-slate-600">
                  Loan Servicing has been enabled for your account. Let's get you set up in 3 quick steps.
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Company Name</label>
                <input
                  type="text"
                  value={companyName}
                  onChange={(e) => setCompanyName(e.target.value)}
                  className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1B3A6B]"
                  placeholder="Your Business Name"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Logo URL</label>
                <input
                  type="url"
                  value={logoUrl}
                  onChange={(e) => setLogoUrl(e.target.value)}
                  className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1B3A6B]"
                  placeholder="https://yoursite.com/logo.png"
                />
                <p className="text-xs text-slate-500 mt-1">Optional — appears on your buyer payment portal</p>
              </div>

              <button
                onClick={() => setStep(2)}
                className="w-full py-2.5 bg-[#1B3A6B] text-white text-sm font-medium rounded-lg hover:opacity-90"
              >
                Continue
              </button>
            </div>
          )}

          {/* Step 2 — Connect Stripe */}
          {step === 2 && (
            <div className="space-y-5">
              <div>
                <h2 className="text-xl font-bold text-slate-900 mb-2">Connect Stripe</h2>
                <p className="text-sm text-slate-600">
                  Your buyers pay directly into your Stripe account. REI Hub never touches your funds.
                </p>
              </div>

              <StripeConnectSetup />

              {stripeSkipped && (
                <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3">
                  <p className="text-sm text-yellow-800">
                    Stripe payments will be unavailable until connected. You can connect later in Settings.
                  </p>
                </div>
              )}

              <div className="flex gap-3">
                <button
                  onClick={() => setStep(1)}
                  className="px-4 py-2.5 text-sm text-slate-600 hover:text-slate-800"
                >
                  Back
                </button>
                <button
                  onClick={() => setStep(3)}
                  className="flex-1 py-2.5 bg-[#1B3A6B] text-white text-sm font-medium rounded-lg hover:opacity-90"
                >
                  Continue
                </button>
              </div>

              <button
                onClick={() => { setStripeSkipped(true); setStep(3) }}
                className="w-full text-center text-sm text-slate-500 hover:text-slate-700"
              >
                Skip for now
              </button>
            </div>
          )}

          {/* Step 3 — Portal Color */}
          {step === 3 && (
            <div className="space-y-5">
              <div>
                <h2 className="text-xl font-bold text-slate-900 mb-2">Portal Brand Color</h2>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Hex Color</label>
                <div className="flex items-center gap-3">
                  <input
                    type="text"
                    value={portalColor}
                    onChange={(e) => setPortalColor(e.target.value)}
                    className="w-40 border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1B3A6B]"
                    placeholder="#1B3A6B"
                  />
                  <div
                    className="w-10 h-10 rounded-lg border border-slate-300"
                    style={{ backgroundColor: portalColor }}
                  />
                </div>
              </div>

              {/* Live preview */}
              <div className="border border-slate-200 rounded-lg overflow-hidden">
                <div className="px-4 py-3" style={{ backgroundColor: portalColor }}>
                  <p className="text-white font-semibold text-sm">{companyName || 'Your Company'}</p>
                </div>
                <div className="px-4 py-3 bg-slate-50">
                  <p className="text-xs text-slate-600">Your payment portal will use this color for headers and buttons</p>
                  <button
                    type="button"
                    className="mt-2 px-3 py-1.5 text-xs text-white rounded"
                    style={{ backgroundColor: portalColor }}
                  >
                    Sample Button
                  </button>
                </div>
              </div>

              <div className="flex gap-3">
                <button
                  onClick={() => setStep(2)}
                  className="px-4 py-2.5 text-sm text-slate-600 hover:text-slate-800"
                >
                  Back
                </button>
                <button
                  onClick={() => setStep(4)}
                  className="flex-1 py-2.5 bg-[#1B3A6B] text-white text-sm font-medium rounded-lg hover:opacity-90"
                >
                  Continue
                </button>
              </div>
            </div>
          )}

          {/* Step 4 — Investor Default % */}
          {step === 4 && (
            <div className="space-y-5">
              <div>
                <h2 className="text-xl font-bold text-slate-900 mb-2">Default Investor Distribution %</h2>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Default Investor %</label>
                <input
                  type="number"
                  min={0}
                  max={100}
                  value={defaultInvestorPct}
                  onChange={(e) => setDefaultInvestorPct(parseFloat(e.target.value) || 0)}
                  className="w-32 border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1B3A6B]"
                />
                <p className="text-xs text-slate-500 mt-1">
                  This default applies when adding new investors. You can override per investor at any time.
                </p>
              </div>

              <div className="flex gap-3">
                <button
                  onClick={() => setStep(3)}
                  className="px-4 py-2.5 text-sm text-slate-600 hover:text-slate-800"
                >
                  Back
                </button>
                <button
                  onClick={handleFinish}
                  disabled={saving}
                  className="flex-1 py-2.5 bg-[#1B3A6B] text-white text-sm font-medium rounded-lg hover:opacity-90 disabled:opacity-50"
                >
                  {saving ? 'Saving...' : 'Finish Setup'}
                </button>
              </div>

              <button
                onClick={() => { setDefaultInvestorPct(4); handleFinish() }}
                disabled={saving}
                className="w-full text-center text-sm text-slate-500 hover:text-slate-700 disabled:opacity-50"
              >
                Skip — set up later
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
