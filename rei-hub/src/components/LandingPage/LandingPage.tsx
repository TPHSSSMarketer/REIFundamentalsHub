import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import {
  Home,
  Kanban,
  Users,
  Search,
  Building2,
  Megaphone,
  Zap,
} from 'lucide-react'
import { getPlans, type PlanInfo } from '@/services/billingApi'

/* ── Helpers ─────────────────────────────────────────────────── */

function cents(amount: number): string {
  return `$${(amount / 100).toLocaleString()}`
}

const FEATURE_LABELS: Record<string, string> = {
  dashboard: 'Dashboard',
  pipeline: 'Pipeline',
  contacts: 'Contacts',
  markets: 'Markets',
  portfolio: 'Portfolio',
  content_hub: 'ContentHub',
  wordpress_publish: 'WordPress Publish',
  cloud_sync: 'Cloud Sync',
  assistant_hub: 'AssistantHub',
  csv_export: 'CSV Export',
  priority_support: 'Priority Support',
}

const PLAN_ORDER = ['starter', 'pro', 'team'] as const

/* ── Feature Cards Data ─────────────────────────────────────── */

const features = [
  {
    name: 'Deal Pipeline',
    description: 'Track every deal from lead to close',
    icon: Kanban,
    color: 'bg-blue-100 text-blue-600',
    badge: null as string | null,
  },
  {
    name: 'Contact Management',
    description: 'Keep all your sellers, buyers, and agents organized',
    icon: Users,
    color: 'bg-emerald-100 text-emerald-600',
    badge: null as string | null,
  },
  {
    name: 'Market Analysis',
    description: 'Analyze rent-to-price ratios and market trends',
    icon: Search,
    color: 'bg-orange-100 text-orange-600',
    badge: null as string | null,
  },
  {
    name: 'Portfolio Tracking',
    description: 'Monitor equity, cash flow, and property performance',
    icon: Building2,
    color: 'bg-purple-100 text-purple-600',
    badge: null as string | null,
  },
  {
    name: 'ContentHub',
    description: 'Generate investor content and publish to WordPress',
    icon: Megaphone,
    color: 'bg-yellow-100 text-yellow-600',
    badge: 'Pro',
  },
  {
    name: 'AI Assistant',
    description: 'AI-powered deal insights (coming soon)',
    icon: Zap,
    color: 'bg-accent-100 text-accent-600',
    badge: null,
  },
]

/* ── Testimonials Data ───────────────────────────────────────── */

const testimonials = [
  {
    quote: 'REI Hub replaced 3 separate tools for us.',
    name: 'Sarah K.',
    role: 'Wholesaler',
  },
  {
    quote: 'The pipeline view alone is worth it.',
    name: 'Marcus T.',
    role: 'Buy & Hold Investor',
  },
  {
    quote: 'Finally a CRM that speaks investor language.',
    name: 'Diana R.',
    role: 'Fix & Flip',
  },
]

/* ── Main Component ──────────────────────────────────────────── */

export default function LandingPage() {
  const [plans, setPlans] = useState<Record<string, PlanInfo> | null>(null)
  const [trialDays, setTrialDays] = useState(7)
  const [annual, setAnnual] = useState(false)

  useEffect(() => {
    let cancelled = false
    getPlans()
      .then((res) => {
        if (!cancelled) {
          setPlans(res.plans)
          setTrialDays(res.trial_days)
        }
      })
      .catch(() => {
        /* pricing section will simply not render */
      })
    return () => {
      cancelled = true
    }
  }, [])

  return (
    <div className="min-h-screen bg-white">
      {/* Navigation */}
      <nav className="sticky top-0 z-50 bg-white/95 backdrop-blur-sm border-b border-slate-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 bg-primary-800 rounded-lg flex items-center justify-center">
                <Home className="w-5 h-5 text-white" />
              </div>
              <div>
                <span className="font-bold text-primary-800">REI Fundamentals Hub</span>
              </div>
            </div>
            <div className="hidden md:flex items-center gap-6">
              <a href="#features" className="text-sm text-slate-600 hover:text-primary-700 transition-colors">
                Features
              </a>
              <a href="#pricing" className="text-sm text-slate-600 hover:text-primary-700 transition-colors">
                Pricing
              </a>
              <Link to="/login" className="text-sm text-slate-600 hover:text-primary-700 transition-colors">
                Login
              </Link>
              <Link
                to="/register"
                className="px-4 py-2 bg-accent-600 text-white text-sm font-medium rounded-lg hover:bg-accent-700 transition-colors"
              >
                Register
              </Link>
            </div>
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900" />
        <div className="absolute inset-0 opacity-10">
          <div className="absolute top-20 left-10 w-72 h-72 bg-accent-500 rounded-full filter blur-3xl" />
          <div className="absolute bottom-20 right-10 w-96 h-96 bg-primary-400 rounded-full filter blur-3xl" />
        </div>
        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-20 md:py-32">
          <div className="text-center max-w-4xl mx-auto">
            <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold text-white leading-tight mb-6">
              The CRM Built for{' '}
              <span className="text-accent-400">Real Estate Investors</span>
            </h1>
            <p className="text-xl md:text-2xl text-slate-300 mb-10 max-w-3xl mx-auto">
              Track deals, manage contacts, analyze markets, and grow your portfolio
              &mdash; all in one place.
            </p>
            <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
              <Link
                to="/register"
                className="px-8 py-4 bg-accent-600 text-white font-semibold rounded-xl hover:bg-accent-700 transition-colors text-lg shadow-lg shadow-accent-600/25"
              >
                Start Free Trial
              </Link>
              <a
                href="#features"
                className="px-8 py-4 bg-white/10 text-white font-semibold rounded-xl hover:bg-white/20 transition-colors text-lg border border-white/20"
              >
                See How It Works
              </a>
            </div>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section id="features" className="py-16 md:py-20 bg-slate-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-12">
            <h2 className="text-3xl md:text-4xl font-bold text-slate-800 mb-4">
              Everything You Need to Close More Deals
            </h2>
            <p className="text-lg text-slate-600 max-w-2xl mx-auto">
              Six powerful tools designed specifically for real estate investors.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {features.map((feature) => (
              <div
                key={feature.name}
                className="relative bg-white rounded-xl border border-slate-200 p-6 hover:shadow-lg hover:border-primary-300 transition-all group"
              >
                {feature.badge && (
                  <span
                    className={`absolute top-4 right-4 text-xs font-semibold px-2.5 py-0.5 rounded-full ${
                      feature.badge === 'Pro'
                        ? 'bg-primary-100 text-primary-700'
                        : 'bg-accent-100 text-accent-700'
                    }`}
                  >
                    {feature.badge}
                  </span>
                )}
                <div
                  className={`w-12 h-12 rounded-xl flex items-center justify-center mb-4 ${feature.color}`}
                >
                  <feature.icon className="w-6 h-6" />
                </div>
                <h3 className="text-lg font-bold text-slate-800 mb-2 group-hover:text-primary-700 transition-colors">
                  {feature.name}
                </h3>
                <p className="text-sm text-slate-600 leading-relaxed">
                  {feature.description}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Pricing Section */}
      {plans && (
        <section id="pricing" className="py-16 md:py-20">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="text-center mb-12">
              <h2 className="text-3xl md:text-4xl font-bold text-slate-800 mb-4">
                Simple, Transparent Pricing
              </h2>
              <p className="text-lg text-slate-600 max-w-2xl mx-auto">
                Choose the plan that fits your investing business.
              </p>

              {/* Billing toggle */}
              <div className="mt-6 flex items-center justify-center gap-3">
                <span
                  className={`text-sm font-medium ${!annual ? 'text-slate-900' : 'text-slate-500'}`}
                >
                  Monthly
                </span>
                <button
                  type="button"
                  onClick={() => setAnnual(!annual)}
                  className={`relative w-11 h-6 rounded-full transition-colors ${
                    annual ? 'bg-primary-600' : 'bg-slate-300'
                  }`}
                >
                  <span
                    className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${
                      annual ? 'translate-x-5' : ''
                    }`}
                  />
                </button>
                <span
                  className={`text-sm font-medium ${annual ? 'text-slate-900' : 'text-slate-500'}`}
                >
                  Annual
                </span>
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 max-w-5xl mx-auto">
              {PLAN_ORDER.map((planKey) => {
                const plan = plans[planKey]
                if (!plan) return null

                const isPopular = planKey === 'pro'
                const price = annual
                  ? plan.annual_price_cents
                  : plan.monthly_price_cents
                const period = annual ? '/yr' : '/mo'

                return (
                  <div
                    key={planKey}
                    className={`relative bg-white rounded-xl shadow-sm border p-8 flex flex-col ${
                      isPopular
                        ? 'border-primary-500 ring-2 ring-primary-500'
                        : 'border-slate-200'
                    }`}
                  >
                    {isPopular && (
                      <span className="absolute -top-3 left-1/2 -translate-x-1/2 bg-primary-600 text-white text-xs font-semibold px-3 py-1 rounded-full">
                        Most Popular
                      </span>
                    )}

                    <h3 className="text-xl font-bold text-slate-900">
                      {plan.name}
                    </h3>

                    <div className="mt-4 flex items-baseline gap-1">
                      <span className="text-4xl font-extrabold text-slate-900">
                        {cents(price)}
                      </span>
                      <span className="text-slate-500 text-sm">{period}</span>
                    </div>

                    <p className="mt-1 text-xs text-slate-400">
                      Up to{' '}
                      {plan.max_seats === 999 ? 'unlimited' : plan.max_seats}{' '}
                      user{plan.max_seats !== 1 ? 's' : ''}
                    </p>

                    <ul className="mt-6 space-y-3 flex-1">
                      {plan.features.map((f) => (
                        <li
                          key={f}
                          className="flex items-start gap-2 text-sm text-slate-700"
                        >
                          <span className="text-primary-600 mt-0.5">
                            &#10003;
                          </span>
                          {FEATURE_LABELS[f] ?? f}
                        </li>
                      ))}
                    </ul>

                    <Link
                      to="/register"
                      className={`mt-8 w-full rounded-lg py-2.5 text-sm font-medium transition-colors flex items-center justify-center ${
                        isPopular
                          ? 'bg-primary-600 text-white hover:bg-primary-700'
                          : 'bg-slate-100 text-slate-900 hover:bg-slate-200'
                      }`}
                    >
                      Start Free Trial
                    </Link>
                  </div>
                )
              })}
            </div>

            <p className="text-center text-sm text-slate-500 mt-8">
              {trialDays}-day free trial, no credit card required
            </p>
          </div>
        </section>
      )}

      {/* Social Proof / Testimonials Section */}
      <section className="py-16 md:py-20 bg-slate-100">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-12">
            <h2 className="text-3xl md:text-4xl font-bold text-slate-800 mb-4">
              What Investors Are Saying
            </h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8 max-w-5xl mx-auto">
            {testimonials.map((t) => (
              <div
                key={t.name}
                className="bg-white rounded-xl border border-slate-200 p-6"
              >
                <span className="text-4xl text-slate-300 leading-none">
                  &ldquo;
                </span>
                <p className="text-slate-700 italic mt-2 mb-6">{t.quote}</p>
                <p className="text-sm font-semibold text-slate-800">
                  &mdash; {t.name},{' '}
                  <span className="font-normal text-slate-500">{t.role}</span>
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-slate-900 text-white py-12">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col md:flex-row items-center justify-between gap-6">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 bg-white/10 rounded-lg flex items-center justify-center">
                <Home className="w-5 h-5 text-white" />
              </div>
              <span className="font-bold text-lg">REI Fundamentals Hub</span>
            </div>
            <div className="flex items-center gap-6 text-sm text-slate-400">
              <a
                href="#features"
                className="hover:text-white transition-colors"
              >
                Features
              </a>
              <a
                href="#pricing"
                className="hover:text-white transition-colors"
              >
                Pricing
              </a>
              <Link
                to="/login"
                className="hover:text-white transition-colors"
              >
                Login
              </Link>
              <Link
                to="/register"
                className="hover:text-white transition-colors"
              >
                Register
              </Link>
            </div>
          </div>
          <div className="border-t border-slate-800 mt-8 pt-6 text-center">
            <p className="text-sm text-slate-500">
              &copy; 2025 REIFundamentals Hub. All rights reserved.
            </p>
          </div>
        </div>
      </footer>
    </div>
  )
}
