import { useState } from 'react'
import { useNavigate } from 'react-router-dom'

const PLANS = [
  {
    key: 'starter',
    name: 'Starter',
    monthlyPrice: 99,
    annualPrice: 825,
    badge: null,
    features: [
      '100 voice minutes included',
      '500 SMS included',
      '5,000 emails included',
      '1 phone number included',
      'Deal Pipeline + CRM',
      'Documents + Contracts',
      'Proof of Funds',
    ],
    excluded: ['AI Voicemail Drops (Pro+)'],
    helmAddon: { monthly: 49, annual: 399 },
    helmIncluded: false,
  },
  {
    key: 'pro',
    name: 'Pro',
    monthlyPrice: 179,
    annualPrice: 1492,
    badge: 'Most Popular',
    features: [
      '500 voice minutes included',
      '2,000 SMS included',
      '25,000 emails included',
      '1 phone number included',
      'Everything in Starter',
      'AI Voicemail Drops ($0.25/drop, credits)',
      'Market Analysis',
      'Portfolio Tracking',
    ],
    excluded: [],
    helmAddon: { monthly: 79, annual: 659 },
    helmIncluded: false,
  },
  {
    key: 'team',
    name: 'Team',
    monthlyPrice: 299,
    annualPrice: 2492,
    badge: null,
    features: [
      '2,000 voice minutes included',
      '5,000 SMS included',
      '100,000 emails included',
      '1 phone number included',
      'Everything in Pro',
      'Priority support',
      'Team member access',
    ],
    excluded: [],
    helmAddon: null,
    helmIncluded: true,
  },
]

export default function PricingPage() {
  const navigate = useNavigate()
  const [annual, setAnnual] = useState(false)

  return (
    <div className="min-h-screen bg-slate-50 px-3 md:px-4 py-8 md:py-16">
      <div className="max-w-5xl mx-auto">
        {/* Header */}
        <div className="text-center mb-8 md:mb-10">
          <h1 className="text-2xl md:text-3xl font-bold text-slate-900">
            REI Fundamentals Hub &mdash; Pricing
          </h1>

          {/* Toggle */}
          <div className="mt-6 flex items-center justify-center gap-3">
            <span
              className={`text-sm font-medium ${!annual ? 'text-slate-900' : 'text-slate-400'}`}
            >
              Monthly
            </span>
            <button
              type="button"
              onClick={() => setAnnual(!annual)}
              className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors ${
                annual ? 'bg-primary-600' : 'bg-slate-300'
              }`}
            >
              <span
                className={`pointer-events-none inline-block h-5 w-5 rounded-full bg-white shadow transform transition-transform ${
                  annual ? 'translate-x-5' : 'translate-x-0'
                }`}
              />
            </button>
            <span
              className={`text-sm font-medium ${annual ? 'text-slate-900' : 'text-slate-400'}`}
            >
              Annual{' '}
              <span className="text-primary-600 font-semibold">(Save 2 months)</span>
            </span>
          </div>

          <p className="mt-4 text-sm text-slate-500">
            7-day free trial, no credit card required
          </p>
        </div>

        {/* Plan Cards */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {PLANS.map((plan) => {
            const price = annual ? plan.annualPrice : plan.monthlyPrice
            const period = annual ? '/yr' : '/mo'

            return (
              <div
                key={plan.key}
                className={`relative bg-white rounded-xl shadow-sm border p-5 md:p-8 flex flex-col ${
                  plan.badge
                    ? 'border-primary-500 ring-2 ring-primary-500'
                    : 'border-slate-200'
                }`}
              >
                {plan.badge && (
                  <span className="absolute -top-3 left-1/2 -translate-x-1/2 bg-primary-600 text-white text-xs font-semibold px-3 py-1 rounded-full">
                    {plan.badge}
                  </span>
                )}

                <h2 className="text-xl font-bold text-slate-900">{plan.name}</h2>

                <div className="mt-4 flex items-baseline gap-1">
                  <span className="text-3xl md:text-4xl font-extrabold text-slate-900">
                    ${price.toLocaleString()}
                  </span>
                  <span className="text-slate-500 text-sm">{period}</span>
                </div>

                {/* Features */}
                <ul className="mt-6 space-y-3 flex-1">
                  {plan.features.map((f) => (
                    <li key={f} className="flex items-start gap-2 text-sm text-slate-700">
                      <span className="text-primary-600 mt-0.5">&#10003;</span>
                      {f}
                    </li>
                  ))}

                  {plan.excluded.map((f) => (
                    <li key={f} className="flex items-start gap-2 text-sm text-slate-400">
                      <span className="mt-0.5">&times;</span>
                      {f}
                    </li>
                  ))}

                  {/* Helm addon line */}
                  {plan.helmIncluded && (
                    <li className="flex items-start gap-2 text-sm text-slate-700">
                      <span className="text-primary-600 mt-0.5">&#10003;</span>
                      Helm Hub AI{' '}
                      <span className="inline-block bg-primary-100 text-primary-700 text-xs font-medium px-2 py-0.5 rounded-full">
                        Included
                      </span>
                    </li>
                  )}
                  {plan.helmAddon && (
                    <li className="flex items-start gap-2 text-sm text-slate-700">
                      <span className="text-primary-600 mt-0.5">+</span>
                      Helm Hub add-on available (+$
                      {annual ? plan.helmAddon.annual : plan.helmAddon.monthly}
                      {period})
                    </li>
                  )}
                </ul>

                {/* CTA */}
                <button
                  onClick={() => navigate('/register')}
                  className={`mt-8 w-full rounded-lg py-2.5 text-sm font-medium transition-colors ${
                    plan.badge
                      ? 'bg-primary-600 text-white hover:bg-primary-700'
                      : 'bg-slate-100 text-slate-900 hover:bg-slate-200'
                  }`}
                >
                  Start Free Trial
                </button>
              </div>
            )
          })}
        </div>

        {/* All plans note */}
        <div className="mt-6 md:mt-8 bg-white rounded-xl shadow-sm border border-slate-200 p-4 md:p-6">
          <h3 className="text-sm font-semibold text-slate-900 mb-3">All plans include:</h3>
          <ul className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-sm text-slate-600">
            <li className="flex items-center gap-2"><span className="text-primary-600">&#10003;</span> Additional numbers: $2.00/mo each</li>
            <li className="flex items-center gap-2"><span className="text-primary-600">&#10003;</span> Credits never expire and roll over</li>
            <li className="flex items-center gap-2"><span className="text-primary-600">&#10003;</span> Overage: pay-as-you-go via credits</li>
          </ul>
        </div>

        {/* Helm Hub upsell note */}
        <p className="mt-10 text-center text-sm text-slate-500">
          Helm Hub is an optional AI assistant add-on. Available standalone or as
          an add-on to Starter and Pro plans.
        </p>
      </div>
    </div>
  )
}
