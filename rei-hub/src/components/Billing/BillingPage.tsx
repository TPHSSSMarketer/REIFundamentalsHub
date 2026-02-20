import { Link } from 'react-router-dom'
import { useBilling } from '@/hooks/useBilling'

function formatDate(iso: string | null): string {
  if (!iso) return '\u2014'
  return new Date(iso).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })
}

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

export default function BillingPage() {
  const { billingStatus, isLoadingBilling, billingError } = useBilling()

  return (
    <div className="p-6 max-w-2xl mx-auto">
      <h1 className="text-2xl font-bold text-slate-900 mb-6">Your Plan</h1>

      {/* Loading */}
      {isLoadingBilling && (
        <div className="flex items-center justify-center py-16">
          <div className="w-10 h-10 border-4 border-primary-500 border-t-transparent rounded-full animate-spin" />
        </div>
      )}

      {/* Error */}
      {billingError && (
        <div className="rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3 mb-6">
          {billingError}
        </div>
      )}

      {/* Status Card */}
      {!isLoadingBilling && !billingError && billingStatus && (
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 space-y-5">
          {/* Plan name */}
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-slate-500">Current Plan</p>
              <p className="text-lg font-semibold text-slate-900 capitalize">
                {billingStatus.plan ?? 'None'}
              </p>
            </div>
            {billingStatus.status && <StatusBadge status={billingStatus.status} />}
          </div>

          {/* Dates */}
          {billingStatus.status === 'trialing' && billingStatus.trial_ends_at && (
            <p className="text-sm text-slate-600">
              Trial ends {formatDate(billingStatus.trial_ends_at)}
            </p>
          )}
          {billingStatus.status === 'active' && billingStatus.current_period_end && (
            <p className="text-sm text-slate-600">
              Renews {formatDate(billingStatus.current_period_end)}
            </p>
          )}

          {/* Helm addon */}
          <div className="flex items-center justify-between border-t border-slate-100 pt-4">
            <p className="text-sm text-slate-700">Helm Hub Add-on</p>
            {billingStatus.helm_addon ? (
              <span className="text-sm font-medium text-green-700">Active</span>
            ) : (
              <Link
                to="/pricing"
                className="text-sm font-medium text-primary-600 hover:text-primary-700"
              >
                Not active &mdash; View plans
              </Link>
            )}
          </div>
        </div>
      )}

      {/* No subscription state */}
      {!isLoadingBilling && !billingError && billingStatus && !billingStatus.plan && (
        <p className="mt-4 text-sm text-slate-500">
          You don&apos;t have an active plan.{' '}
          <Link to="/pricing" className="font-medium text-primary-600 hover:text-primary-700">
            View plans
          </Link>
        </p>
      )}

      {/* Footer link */}
      <div className="mt-6">
        <Link
          to="/pricing"
          className="text-sm font-medium text-primary-600 hover:text-primary-700"
        >
          View all plans
        </Link>
      </div>
    </div>
  )
}
