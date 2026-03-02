import { useNavigate } from 'react-router-dom'
import { useBilling } from '@/hooks/useBilling'

export default function TrialBanner() {
  const { billingStatus, isTrialActive, daysRemainingInTrial } = useBilling()
  const navigate = useNavigate()

  if (isTrialActive && daysRemainingInTrial !== null) {
    return (
      <div className="sticky top-0 z-50 bg-yellow-50 border-b border-yellow-200 px-4 py-2 flex items-center justify-between">
        <span className="text-sm text-yellow-800">
          {daysRemainingInTrial} days left in your free trial — Upgrade now to keep access
        </span>
        <button
          onClick={() => navigate('/billing')}
          className="text-sm font-medium text-yellow-900 bg-yellow-200 hover:bg-yellow-300 px-3 py-1 rounded-lg transition-colors"
        >
          Upgrade
        </button>
      </div>
    )
  }

  if (billingStatus?.subscription_status === 'past_due') {
    return (
      <div className="sticky top-0 z-50 bg-red-50 border-b border-red-200 px-4 py-2 flex items-center justify-between">
        <span className="text-sm text-red-800">
          Payment failed — Update billing to avoid losing access
        </span>
        <button
          onClick={() => navigate('/billing')}
          className="text-sm font-medium text-red-900 bg-red-200 hover:bg-red-300 px-3 py-1 rounded-lg transition-colors"
        >
          Update Billing
        </button>
      </div>
    )
  }

  if (billingStatus?.subscription_status === 'canceled') {
    return (
      <div className="sticky top-0 z-50 bg-red-50 border-b border-red-200 px-4 py-2 flex items-center justify-between">
        <span className="text-sm text-red-800">
          Your subscription has ended — Reactivate to regain access
        </span>
        <button
          onClick={() => navigate('/billing')}
          className="text-sm font-medium text-red-900 bg-red-200 hover:bg-red-300 px-3 py-1 rounded-lg transition-colors"
        >
          Reactivate
        </button>
      </div>
    )
  }

  return null
}
