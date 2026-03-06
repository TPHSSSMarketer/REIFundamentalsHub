import { useState, useEffect } from 'react'
import { getStripeConnectStatus, getStripeConnectOnboardUrl } from '../../services/loanServicingApi'

interface Props {
  servicingFeePct?: number
}

interface ConnectStatus {
  charges_enabled?: boolean
  payouts_enabled?: boolean
  account_id?: string
  connected?: boolean
  email?: string
}

export default function StripeConnectSetup({ servicingFeePct = 0 }: Props) {
  const [status, setStatus] = useState<ConnectStatus | null>(null)
  const [loading, setLoading] = useState(true)
  const [showDisconnectConfirm, setShowDisconnectConfirm] = useState(false)

  useEffect(() => {
    getStripeConnectStatus()
      .then((data: any) => setStatus(data as ConnectStatus))
      .catch(() => setStatus(null))
      .finally(() => setLoading(false))
  }, [])

  const handleConnect = async () => {
    try {
      const response = (await getStripeConnectOnboardUrl()) as any
      const url = response?.url as string
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
        <h3 className="text-lg font-semibold text-slate-800 mb-2">Connect Stripe Payment Account</h3>
        <p className="text-sm text-slate-600 mb-2">
          Your buyers pay directly into YOUR Stripe account.
        </p>
        <p className="text-sm text-slate-600 mb-4">
          REI Hub never touches your funds.
        </p>
        {servicingFeePct > 0 && (
          <div className="bg-slate-100 rounded-lg p-3 mb-4">
            <p className="text-sm text-slate-600">
              Platform fee: {servicingFeePct}% per payment (automatically deducted at collection)
            </p>
          </div>
        )}
        <button
          onClick={handleConnect}
          className="px-4 py-2 bg-[#1B3A6B] text-white text-sm font-medium rounded-lg hover:opacity-90"
        >
          Connect Stripe Account
        </button>
      </div>
    )
  }

  const accountLast4 = status.account_id ? status.account_id.slice(-4) : '****'

  return (
    <div className="bg-white rounded-xl shadow overflow-hidden">
      <div className="bg-green-600 px-4 py-2">
        <span className="text-white text-sm font-semibold">&#10003; Connected</span>
      </div>
      <div className="p-4 space-y-2">
        <p className="text-sm text-slate-700 font-medium">Account: ****{accountLast4}</p>
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
        {servicingFeePct > 0 && (
          <div className="bg-slate-100 rounded-lg p-3 mt-2">
            <p className="text-sm text-slate-600">
              Platform fee: {servicingFeePct}% per payment (automatically deducted at collection)
            </p>
          </div>
        )}
        <div className="flex items-center gap-3 mt-3">
          <a
            href="https://dashboard.stripe.com"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-block text-sm text-blue-600 hover:underline"
          >
            View Stripe Dashboard &rarr;
          </a>
          <button
            onClick={() => setShowDisconnectConfirm(true)}
            className="px-3 py-1.5 text-xs font-medium border border-[#CC2229] text-[#CC2229] rounded-lg hover:bg-red-50"
          >
            Disconnect
          </button>
        </div>
      </div>

      {showDisconnectConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-sm mx-4 p-6">
            <h3 className="text-lg font-bold text-slate-900 mb-3">Disconnect Stripe?</h3>
            <p className="text-sm text-slate-600 mb-6">
              Are you sure? Buyers will not be able to pay online until you reconnect.
            </p>
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => setShowDisconnectConfirm(false)}
                className="px-4 py-2 text-sm text-slate-600 hover:text-slate-800"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  setShowDisconnectConfirm(false)
                  setStatus(null)
                }}
                className="px-4 py-2 text-sm font-medium bg-[#CC2229] text-white rounded-lg hover:opacity-90"
              >
                Disconnect
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
