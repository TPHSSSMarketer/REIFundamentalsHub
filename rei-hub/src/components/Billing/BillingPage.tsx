import { useState, useEffect } from 'react'
import { useAuth } from '@/hooks/useAuth'
import {
  getBillingStatus,
  getPlans,
  createCheckout,
  openBillingPortal,
  type BillingStatus,
  type PlanInfo,
} from '@/services/billingApi'

/* ── Helpers ─────────────────────────────────────────────────── */

function formatDate(iso: string | null): string {
  if (!iso) return '\u2014'
  return new Date(iso).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })
}

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
  helm_hub: 'Helm Hub AI',
}

const PLAN_ORDER = ['starter', 'pro', 'team'] as const

/* ── Sub-components ──────────────────────────────────────────── */

function StatusBadge({ status }: { status: string }) {
  const colorMap: Record<string, string> = {
    trialing: 'bg-blue-100 text-blue-700',
    active: 'bg-green-100 text-green-700',
    canceled: 'bg-slate-100 text-slate-600',
    past_due: 'bg-red-100 text-red-700',
  }
  const cls = colorMap[status] ?? 'bg-slate-100 text-slate-600'
  return (
    <span className={`inline-block text-xs font-medium px-2.5 py-0.5 rounded-full ${cls}`}>
      {status}
    </span>
  )
}

function Toast({ message, onClose }: { message: string; onClose: () => void }) {
  useEffect(() => {
    const t = setTimeout(onClose, 4000)
    return () => clearTimeout(t)
  }, [onClose])

  return (
    <div className="fixed bottom-6 right-6 z-50 bg-slate-900 text-white text-sm px-4 py-3 rounded-lg shadow-lg flex items-center gap-3">
      {message}
      <button onClick={onClose} className="text-slate-300 hover:text-white">&times;</button>
    </div>
  )
}

/* ── Main Component ──────────────────────────────────────────── */

export default function BillingPage() {
  const { token } = useAuth()
  const [billingStatus, setBillingStatus] = useState<BillingStatus | null>(null)
  const [plans, setPlans] = useState<Record<string, PlanInfo> | null>(null)
  const [trialDays, setTrialDays] = useState(7)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [annual, setAnnual] = useState(false)
  const [toast, setToast] = useState<string | null>(null)
  const [checkoutLoading, setCheckoutLoading] = useState<string | null>(null)
  const [helmAddon, setHelmAddon] = useState(false)
  const [portalLoading, setPortalLoading] = useState(false)
  const [showSuccess, setShowSuccess] = useState(false)
  const [paymentMethod, setPaymentMethod] = useState<'stripe' | 'paypal'>('stripe')

  // Check for ?session_id= or ?paypal=success on mount (checkout success redirect)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    if (params.get('session_id') || params.get('paypal') === 'success') {
      setShowSuccess(true)
      window.history.replaceState({}, '', window.location.pathname)
    }
  }, [])

  useEffect(() => {
    let cancelled = false

    async function load() {
      setIsLoading(true)
      setError(null)
      try {
        const [plansRes, statusRes] = await Promise.all([
          getPlans(),
          token ? getBillingStatus(token) : Promise.resolve(null),
        ])
        if (cancelled) return
        setPlans(plansRes.plans)
        setTrialDays(plansRes.trial_days)
        if (statusRes) setBillingStatus(statusRes)
      } catch (err: unknown) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to load billing data')
      } finally {
        if (!cancelled) setIsLoading(false)
      }
    }

    load()
    return () => { cancelled = true }
  }, [token])

  async function handleSelectPlan(planKey: string) {
    if (!token || checkoutLoading) return
    setCheckoutLoading(planKey)
    try {
      const res = await createCheckout(
        token,
        planKey,
        annual ? 'annual' : 'monthly',
        paymentMethod,
        planKey === 'team' ? false : helmAddon,
      )
      if (res.checkout_url) {
        window.location.href = res.checkout_url
      } else {
        setToast('Billing setup coming soon — we\u2019ll notify you when payments are live')
      }
    } catch {
      setToast('Something went wrong — please try again')
    } finally {
      setCheckoutLoading(null)
    }
  }

  async function handleOpenPortal() {
    if (!token || portalLoading) return
    setPortalLoading(true)
    try {
      const res = await openBillingPortal(token)
      if (res.portal_url) {
        window.location.href = res.portal_url
      } else {
        setToast('Billing portal not yet configured')
      }
    } catch {
      setToast('Something went wrong — please try again')
    } finally {
      setPortalLoading(false)
    }
  }

  /* ── Loading state ───────────────────────────────────────── */

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="w-10 h-10 border-4 border-primary-500 border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  /* ── Error state ─────────────────────────────────────────── */

  if (error) {
    return (
      <div className="p-6 max-w-4xl mx-auto">
        <div className="rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3">
          {error}
        </div>
      </div>
    )
  }

  const currentPlan = billingStatus?.plan ?? 'starter'
  const anyCheckoutLoading = checkoutLoading !== null

  return (
    <div className="p-4 md:p-6 max-w-5xl mx-auto space-y-8 md:space-y-10">

      {/* ── Success Banner ─────────────────────────────────────── */}
      {showSuccess && (
        <div className="rounded-lg bg-green-50 border border-green-200 px-4 py-3 flex items-center justify-between">
          <span className="text-sm text-green-800">
            Welcome! Your subscription is now active.
          </span>
          <button
            onClick={() => setShowSuccess(false)}
            className="text-green-600 hover:text-green-800 text-sm font-medium"
          >
            &times;
          </button>
        </div>
      )}

      {/* ── Current Plan Banner ──────────────────────────────── */}
      {billingStatus && (
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
              <p className="text-sm text-slate-500">Current Plan</p>
              <p className="text-xl font-bold text-slate-900 capitalize">{billingStatus.plan ?? 'None'}</p>
            </div>

            <div className="flex items-center gap-3">
              {billingStatus.subscription_status && (
                <StatusBadge status={billingStatus.subscription_status} />
              )}
              {billingStatus.billing_interval && (
                <span className="text-xs text-slate-500 capitalize">
                  {billingStatus.billing_interval}
                </span>
              )}
            </div>
          </div>

          {/* Trial warning */}
          {billingStatus.is_trial_active && billingStatus.days_remaining_in_trial !== null && (
            <div className="mt-4 flex items-center gap-2 bg-blue-50 border border-blue-200 rounded-lg px-4 py-2.5 text-sm text-blue-700">
              <span className="font-medium">Trial</span>
              {billingStatus.days_remaining_in_trial} day{billingStatus.days_remaining_in_trial !== 1 ? 's' : ''} remaining
              {billingStatus.trial_ends_at && (
                <span className="text-blue-500 ml-1">(ends {formatDate(billingStatus.trial_ends_at)})</span>
              )}
            </div>
          )}

          {/* Past due warning */}
          {billingStatus.subscription_status === 'past_due' && (
            <div className="mt-4 bg-red-50 border border-red-200 rounded-lg px-4 py-2.5 text-sm text-red-700">
              Your payment is past due. Please update your payment method to keep access.
            </div>
          )}

          {/* Canceled warning */}
          {billingStatus.subscription_status === 'canceled' && (
            <div className="mt-4 bg-slate-50 border border-slate-200 rounded-lg px-4 py-2.5 text-sm text-slate-600">
              Your subscription has been canceled.
              {billingStatus.subscription_ends_at && (
                <span> Access continues until {formatDate(billingStatus.subscription_ends_at)}.</span>
              )}
            </div>
          )}

          {/* Helm addon status */}
          <div className="mt-4 flex items-center justify-between border-t border-slate-100 pt-4">
            <p className="text-sm text-slate-700">Helm Hub Add-on</p>
            {billingStatus.helm_addon_active ? (
              <span className="text-sm font-medium text-green-700">Active</span>
            ) : (
              <span className="text-sm text-slate-400">Not active</span>
            )}
          </div>
        </div>
      )}

      {/* ── Pricing Section ──────────────────────────────────── */}
      {plans && (
        <>
          {/* Header + Toggle */}
          <div className="text-center">
            <h2 className="text-xl md:text-2xl font-bold text-slate-900">
              {billingStatus ? 'Change Your Plan' : 'Choose a Plan'}
            </h2>

            {/* Monthly / Annual toggle */}
            <div className="mt-5 flex items-center justify-center gap-3">
              <span className={`text-sm font-medium ${!annual ? 'text-slate-900' : 'text-slate-400'}`}>
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
              <span className={`text-sm font-medium ${annual ? 'text-slate-900' : 'text-slate-400'}`}>
                Annual{' '}
                <span className="text-primary-600 font-semibold">(Save 2 months)</span>
              </span>
            </div>

            {/* Helm addon checkbox */}
            <div className="mt-4 flex items-center justify-center gap-2">
              <input
                type="checkbox"
                id="helm-addon-toggle"
                checked={helmAddon}
                onChange={(e) => setHelmAddon(e.target.checked)}
                className="h-4 w-4 rounded border-slate-300 text-primary-600 focus:ring-primary-500"
              />
              <label htmlFor="helm-addon-toggle" className="text-sm text-slate-700">
                Add Helm Hub AI Assistant
                {plans[currentPlan] && (
                  <span className="ml-1 text-slate-500">
                    (+{cents(
                      annual
                        ? (plans[currentPlan]?.helm_addon_annual_cents ?? 0)
                        : (plans[currentPlan]?.helm_addon_monthly_cents ?? 0)
                    )}{annual ? '/yr' : '/mo'})
                  </span>
                )}
              </label>
            </div>

            {/* Payment method selector */}
            <div className="mt-4 flex items-center justify-center gap-2">
              <button
                type="button"
                onClick={() => setPaymentMethod('stripe')}
                className={`px-4 py-2 text-sm font-medium rounded-lg border transition-colors ${
                  paymentMethod === 'stripe'
                    ? 'border-primary-500 bg-primary-50 text-primary-700'
                    : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                }`}
              >
                Pay with Stripe
              </button>
              <button
                type="button"
                onClick={() => setPaymentMethod('paypal')}
                className={`px-4 py-2 text-sm font-medium rounded-lg border transition-colors ${
                  paymentMethod === 'paypal'
                    ? 'border-primary-500 bg-primary-50 text-primary-700'
                    : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                }`}
              >
                Pay with PayPal
              </button>
            </div>

            <p className="mt-3 text-sm text-slate-500">
              {trialDays}-day free trial, no credit card required
            </p>
          </div>

          {/* Plan Cards */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {PLAN_ORDER.map((planKey) => {
              const plan = plans[planKey]
              if (!plan) return null

              const isPopular = planKey === 'pro'
              const isCurrent = planKey === currentPlan
              const price = annual ? plan.annual_price_cents : plan.monthly_price_cents
              const period = annual ? '/yr' : '/mo'
              const helmPrice = annual ? plan.helm_addon_annual_cents : plan.helm_addon_monthly_cents
              const helmIncluded = plan.features.includes('helm_hub')
              const isTeam = planKey === 'team'

              return (
                <div
                  key={planKey}
                  className={`relative bg-white rounded-xl shadow-sm border p-5 md:p-8 flex flex-col ${
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

                  <h3 className="text-xl font-bold text-slate-900">{plan.name}</h3>

                  <div className="mt-4 flex items-baseline gap-1">
                    <span className="text-3xl md:text-4xl font-extrabold text-slate-900">
                      {cents(price)}
                    </span>
                    <span className="text-slate-500 text-sm">{period}</span>
                  </div>

                  <p className="mt-1 text-xs text-slate-400">
                    Up to {plan.max_seats === 999 ? 'unlimited' : plan.max_seats} user{plan.max_seats !== 1 ? 's' : ''}
                  </p>

                  {/* Features list */}
                  <ul className="mt-6 space-y-3 flex-1">
                    {plan.features.map((f) => (
                      <li key={f} className="flex items-start gap-2 text-sm text-slate-700">
                        <span className="text-primary-600 mt-0.5">&#10003;</span>
                        {FEATURE_LABELS[f] ?? f}
                      </li>
                    ))}

                    {/* Helm addon line */}
                    {helmIncluded ? (
                      <li className="flex items-start gap-2 text-sm text-slate-700">
                        <span className="text-primary-600 mt-0.5">&#10003;</span>
                        Helm Hub AI{' '}
                        <span className="inline-block bg-primary-100 text-primary-700 text-xs font-medium px-2 py-0.5 rounded-full">
                          Included
                        </span>
                      </li>
                    ) : helmPrice > 0 ? (
                      <li className="flex items-start gap-2 text-sm text-slate-700">
                        <span className="text-primary-600 mt-0.5">+</span>
                        Helm Hub add-on (+{cents(helmPrice)}{period})
                      </li>
                    ) : null}
                  </ul>

                  {/* Helm addon note for Team */}
                  {isTeam && (
                    <p className="mt-2 text-xs text-primary-600 font-medium">
                      Helm Hub AI included free
                    </p>
                  )}

                  {/* CTA */}
                  <button
                    onClick={() => handleSelectPlan(planKey)}
                    disabled={isCurrent || anyCheckoutLoading}
                    className={`mt-8 w-full rounded-lg py-2.5 text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 ${
                      isPopular
                        ? 'bg-primary-600 text-white hover:bg-primary-700'
                        : 'bg-slate-100 text-slate-900 hover:bg-slate-200'
                    }`}
                  >
                    {checkoutLoading === planKey && (
                      <span className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
                    )}
                    {checkoutLoading === planKey
                      ? 'Processing...'
                      : isCurrent
                        ? 'Current Plan'
                        : 'Select Plan'}
                  </button>
                </div>
              )
            })}
          </div>

          {/* ── Helm Hub Add-on Callout ───────────────────────── */}
          <div className="bg-gradient-to-r from-primary-50 to-primary-100 rounded-xl border border-primary-200 p-6 flex flex-col sm:flex-row sm:items-center gap-4">
            <div className="flex-1">
              <h3 className="text-lg font-bold text-primary-900">Helm Hub AI Assistant</h3>
              <p className="mt-1 text-sm text-primary-700">
                Supercharge your real estate workflow with AI-powered deal analysis,
                market insights, and automated follow-ups. Available as an add-on for
                Starter and Pro plans, or included free with Team.
              </p>
            </div>
            <div className="shrink-0 text-right">
              <p className="text-sm font-semibold text-primary-900">Starting at</p>
              <p className="text-2xl font-extrabold text-primary-900">
                {cents(annual
                  ? (plans.starter?.helm_addon_annual_cents ?? 49000)
                  : (plans.starter?.helm_addon_monthly_cents ?? 4900)
                )}
                <span className="text-sm font-normal text-primary-600">{annual ? '/yr' : '/mo'}</span>
              </p>
            </div>
          </div>
        </>
      )}

      {/* ── Manage Billing Section ────────────────────────────── */}
      {billingStatus && (billingStatus.subscription_status === 'active' || billingStatus.subscription_status === 'past_due') && (
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h3 className="text-lg font-bold text-slate-900">Manage Billing</h3>
            <p className="text-sm text-slate-500">
              View invoices, update payment method, or cancel your subscription.
            </p>
          </div>
          <button
            onClick={handleOpenPortal}
            disabled={portalLoading}
            className="shrink-0 rounded-lg bg-slate-100 text-slate-900 hover:bg-slate-200 px-5 py-2.5 text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
          >
            {portalLoading && (
              <span className="w-4 h-4 border-2 border-slate-600 border-t-transparent rounded-full animate-spin" />
            )}
            {portalLoading ? 'Opening...' : 'Manage Billing & Invoices'}
          </button>
        </div>
      )}

      {/* Toast */}
      {toast && <Toast message={toast} onClose={() => setToast(null)} />}
    </div>
  )
}
