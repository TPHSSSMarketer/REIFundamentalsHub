import { useState, useEffect } from 'react'
import { getStripeConnectStatus, getStripeConnectOnboardUrl } from '../../services/loanServicingApi'

interface Props {
  token: string
}

interface ConnectStatus {
  charges_enabled: boolean
  payouts_enabled: boolean
}

export default function StripeConnectSetup({ token }: Props) {
  const [status, setStatus] = useState<ConnectStatus | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    getStripeConnectStatus(token)
      .then(setStatus)
      .catch(() => setStatus(null))
      .finally(() => setLoading(false))
  }, [token])

  const handleConnect = async () => {
    try {
      const { url } = await getStripeConnectOnboardUrl(token)
      window.location.href = url
    } catch {
      // ignore
    }
  }

  if (loading) {
    return (
      <div className="bg-white rounded-xl shadow p-6">
        <p className="text-sm text-slate-400">Loading...</p>
      </div>
    )
  }

  if (!status || !status.charges_enabled) {
    return (
      <div className="bg-white rounded-xl shadow p-6">
        <h3 className="text-lg font-semibold text-slate-800 mb-2">Connect TPHS Payment Account</h3>
        <p className="text-sm text-slate-600 mb-4">
          Buyer payments go directly to your TPHS Stripe account. Funds never touch REI Hub.
        </p>
        <button
          onClick={handleConnect}
          className="px-4 py-2 bg-[#1B3A6B] text-white text-sm font-medium rounded-lg hover:opacity-90"
        >
          Connect TPHS Stripe Account
        </button>
      </div>
    )
  }

  return (
    <div className="bg-white rounded-xl shadow overflow-hidden">
      <div className="bg-green-600 px-4 py-2">
        <span className="text-white text-sm font-semibold">&#10003; Connected</span>
      </div>
      <div className="p-4 space-y-2">
        <div className="flex items-center gap-2 text-sm">
          <span className={status.charges_enabled ? 'text-green-600' : 'text-red-500'}>
            {status.charges_enabled ? '✓' : '✗'}
          </span>
          <span className="text-slate-700">Charges enabled</span>
        </div>
        <div className="flex items-center gap-2 text-sm">
          <span className={status.payouts_enabled ? 'text-green-600' : 'text-red-500'}>
            {status.payouts_enabled ? '✓' : '✗'}
          </span>
          <span className="text-slate-700">Payouts enabled</span>
        </div>
        <a
          href="https://dashboard.stripe.com"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-block text-sm text-blue-600 hover:underline mt-2"
        >
          View Stripe Dashboard &rarr;
        </a>
      </div>
    </div>
  )
}
