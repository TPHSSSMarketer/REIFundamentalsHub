import { useState, useEffect, useCallback } from 'react'
import {
  ShieldCheck,
  Landmark,
  CheckCircle2,
  XCircle,
  Copy,
  FileDown,
  Unlink,
} from 'lucide-react'
import {
  getLinkToken,
  verifyFunds,
  getCertificates,
  disconnectBank,
} from '@/services/plaidApi'
import { getCurrentUser } from '@/services/auth'

interface Certificate {
  certificate_id: string
  verified: boolean
  buyer_name: string
  buyer_email: string
  required_amount: number
  available_balance: string
  property_address: string
  issued_at: string
  expires_at: string
  issuer: string
}

export default function ProofOfFundsPage() {
  const [bankConnected, setBankConnected] = useState(false)
  const [linkedAt, setLinkedAt] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  // Generate certificate form
  const [amount, setAmount] = useState('')
  const [address, setAddress] = useState('')
  const [verifying, setVerifying] = useState(false)
  const [verifyError, setVerifyError] = useState('')

  // Certificate display
  const [activeCert, setActiveCert] = useState<Certificate | null>(null)
  const [certificates, setCertificates] = useState<Certificate[]>([])
  const [toast, setToast] = useState('')

  const showToast = (msg: string) => {
    setToast(msg)
    setTimeout(() => setToast(''), 3000)
  }

  const loadUser = useCallback(async () => {
    try {
      const user = await getCurrentUser()
      if (user && user.plaid_linked_at) {
        setBankConnected(true)
        setLinkedAt(user.plaid_linked_at as string)
      } else {
        setBankConnected(false)
        setLinkedAt(null)
      }
    } catch {
      // ignore
    }
  }, [])

  const loadCertificates = useCallback(async () => {
    try {
      const data = await getCertificates()
      setCertificates(data.certificates as Certificate[])
    } catch {
      // ignore
    }
  }, [])

  useEffect(() => {
    Promise.all([loadUser(), loadCertificates()]).finally(() =>
      setLoading(false)
    )
  }, [loadUser, loadCertificates])

  const handleConnectBank = async () => {
    try {
      const { link_token } = await getLinkToken()
      // Plaid Link JS SDK integration is a future task.
      // For now, open the Plaid Link hosted URL in a new window as a stub.
      window.open(
        `https://cdn.plaid.com/link/v2/stable/link.html?token=${link_token}`,
        'plaid-link',
        'width=500,height=700'
      )
      showToast('Complete bank connection in the popup window')
    } catch {
      showToast('Failed to start bank connection')
    }
  }

  const handleDisconnect = async () => {
    try {
      await disconnectBank()
      setBankConnected(false)
      setLinkedAt(null)
      showToast('Bank account disconnected')
    } catch {
      showToast('Failed to disconnect bank')
    }
  }

  const handleVerify = async () => {
    const parsedAmount = parseFloat(amount)
    if (!parsedAmount || parsedAmount <= 0) {
      setVerifyError('Enter a valid dollar amount')
      return
    }
    if (!address.trim()) {
      setVerifyError('Enter the property address')
      return
    }

    setVerifying(true)
    setVerifyError('')

    try {
      const cert = (await verifyFunds(parsedAmount, address.trim())) as Certificate
      setActiveCert(cert)
      if (!cert.verified) {
        setVerifyError('Insufficient funds for the requested amount')
      }
      await loadCertificates()
    } catch {
      setVerifyError('Verification failed. Please try again.')
    } finally {
      setVerifying(false)
    }
  }

  const handleCopyLink = (certId: string) => {
    const url = `${window.location.origin}/proof-of-funds?cert=${certId}`
    navigator.clipboard.writeText(url)
    showToast('Certificate link copied to clipboard')
  }

  const isExpired = (expiresAt: string) => new Date(expiresAt) < new Date()

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-4 border-primary-500 border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  return (
    <div className="max-w-4xl mx-auto space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
          <ShieldCheck className="w-7 h-7 text-primary-600" />
          Proof of Funds
        </h1>
        <p className="text-slate-500 mt-1">
          Verify bank balances and generate certificates for earnest money
          deposits
        </p>
      </div>

      {/* Toast */}
      {toast && (
        <div className="fixed top-4 right-4 z-50 bg-slate-800 text-white px-4 py-2 rounded-lg shadow-lg text-sm">
          {toast}
        </div>
      )}

      {/* ── Section 1: Connect Bank ─────────────────────────────── */}
      <section className="bg-white rounded-xl border border-slate-200 p-6">
        <h2 className="text-lg font-semibold text-slate-900 flex items-center gap-2 mb-4">
          <Landmark className="w-5 h-5 text-slate-600" />
          Bank Connection
        </h2>

        {!bankConnected ? (
          <div className="text-center py-6">
            <p className="text-slate-600 mb-4">
              Connect your bank account to verify funds for real estate
              transactions
            </p>
            <button
              onClick={handleConnectBank}
              className="inline-flex items-center gap-2 px-6 py-2.5 bg-primary-600 text-white rounded-lg font-medium hover:bg-primary-700 transition-colors"
            >
              <Landmark className="w-4 h-4" />
              Connect Bank
            </button>
            <p className="text-xs text-slate-400 mt-3">
              256-bit encryption &middot; Read-only access &middot; We never see
              your account number
            </p>
          </div>
        ) : (
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <CheckCircle2 className="w-5 h-5 text-green-500" />
              <div>
                <p className="font-medium text-green-700">
                  Bank account connected
                </p>
                {linkedAt && (
                  <p className="text-xs text-slate-400">
                    Last connected:{' '}
                    {new Date(linkedAt).toLocaleDateString()}
                  </p>
                )}
              </div>
            </div>
            <button
              onClick={handleDisconnect}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm text-slate-600 border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors"
            >
              <Unlink className="w-3.5 h-3.5" />
              Disconnect
            </button>
          </div>
        )}
      </section>

      {/* ── Section 2: Generate Certificate ─────────────────────── */}
      {bankConnected && (
        <section className="bg-white rounded-xl border border-slate-200 p-6">
          <h2 className="text-lg font-semibold text-slate-900 mb-4">
            Generate Certificate
          </h2>

          <div className="grid sm:grid-cols-2 gap-4 mb-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Required Amount ($)
              </label>
              <input
                type="number"
                min="0"
                step="1000"
                placeholder="50000"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Property Address
              </label>
              <input
                type="text"
                placeholder="123 Main St, City, State 12345"
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
              />
            </div>
          </div>

          {verifyError && (
            <p className="text-sm text-red-600 mb-3 flex items-center gap-1">
              <XCircle className="w-4 h-4" />
              {verifyError}
            </p>
          )}

          <button
            onClick={handleVerify}
            disabled={verifying}
            className="inline-flex items-center gap-2 px-5 py-2.5 bg-primary-600 text-white rounded-lg font-medium hover:bg-primary-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {verifying ? (
              <>
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                Verifying...
              </>
            ) : (
              <>
                <ShieldCheck className="w-4 h-4" />
                Verify &amp; Generate Certificate
              </>
            )}
          </button>

          {/* Active certificate card */}
          {activeCert && (
            <div
              className={`mt-6 rounded-xl border-2 p-6 ${
                activeCert.verified
                  ? 'border-green-300 bg-green-50/50'
                  : 'border-red-300 bg-red-50/50'
              }`}
            >
              <p className="text-xs font-semibold text-primary-700 tracking-wide uppercase mb-1">
                REIFundamentals Hub
              </p>
              <h3 className="text-lg font-bold text-slate-900 mb-4">
                PROOF OF FUNDS CERTIFICATE
              </h3>

              <div className="grid sm:grid-cols-2 gap-x-8 gap-y-2 text-sm">
                <div>
                  <span className="text-slate-500">Certificate ID:</span>{' '}
                  <span className="font-mono text-slate-700">
                    {activeCert.certificate_id.slice(0, 8)}...
                  </span>
                </div>
                <div>
                  <span className="text-slate-500">Buyer:</span>{' '}
                  <span className="text-slate-700">
                    {activeCert.buyer_name}
                  </span>
                </div>
                <div>
                  <span className="text-slate-500">Email:</span>{' '}
                  <span className="text-slate-700">
                    {activeCert.buyer_email}
                  </span>
                </div>
                <div>
                  <span className="text-slate-500">Property:</span>{' '}
                  <span className="text-slate-700">
                    {activeCert.property_address}
                  </span>
                </div>
                <div>
                  <span className="text-slate-500">Required:</span>{' '}
                  <span className="font-semibold text-slate-700">
                    ${activeCert.required_amount.toLocaleString()}
                  </span>
                </div>
                <div>
                  <span className="text-slate-500">Verified Amount:</span>{' '}
                  <span className="font-semibold text-green-700">
                    {activeCert.available_balance}
                  </span>
                </div>
                <div>
                  <span className="text-slate-500">Issued:</span>{' '}
                  <span className="text-slate-700">
                    {new Date(activeCert.issued_at).toLocaleString()}
                  </span>
                </div>
                <div>
                  <span className="text-slate-500">Expires:</span>{' '}
                  <span className="text-slate-700">
                    {new Date(activeCert.expires_at).toLocaleString()}
                  </span>
                </div>
              </div>

              <div className="flex gap-3 mt-5">
                <button
                  onClick={() => showToast('PDF export coming soon')}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm border border-slate-300 rounded-lg hover:bg-white transition-colors"
                >
                  <FileDown className="w-3.5 h-3.5" />
                  Download PDF
                </button>
                <button
                  onClick={() =>
                    handleCopyLink(activeCert.certificate_id)
                  }
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm border border-slate-300 rounded-lg hover:bg-white transition-colors"
                >
                  <Copy className="w-3.5 h-3.5" />
                  Share Link
                </button>
              </div>
            </div>
          )}
        </section>
      )}

      {/* ── Section 3: Certificate History ──────────────────────── */}
      {certificates.length > 0 && (
        <section className="bg-white rounded-xl border border-slate-200 p-6">
          <h2 className="text-lg font-semibold text-slate-900 mb-4">
            Certificate History
          </h2>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-left text-slate-500">
                  <th className="pb-2 font-medium">Date</th>
                  <th className="pb-2 font-medium">Property</th>
                  <th className="pb-2 font-medium">Amount</th>
                  <th className="pb-2 font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {certificates.map((cert) => {
                  const c = cert as Certificate
                  const expired = isExpired(c.expires_at)
                  return (
                    <tr
                      key={c.certificate_id}
                      onClick={() => setActiveCert(c)}
                      className="border-b border-slate-100 hover:bg-slate-50 cursor-pointer transition-colors"
                    >
                      <td className="py-2.5">
                        {new Date(c.issued_at).toLocaleDateString()}
                      </td>
                      <td className="py-2.5 max-w-[200px] truncate">
                        {c.property_address}
                      </td>
                      <td className="py-2.5">
                        ${c.required_amount.toLocaleString()}
                      </td>
                      <td className="py-2.5">
                        {expired ? (
                          <span className="inline-flex items-center gap-1 text-xs font-medium text-slate-400">
                            <XCircle className="w-3.5 h-3.5" />
                            Expired
                          </span>
                        ) : c.verified ? (
                          <span className="inline-flex items-center gap-1 text-xs font-medium text-green-600">
                            <CheckCircle2 className="w-3.5 h-3.5" />
                            Valid
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-xs font-medium text-red-500">
                            <XCircle className="w-3.5 h-3.5" />
                            Insufficient
                          </span>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  )
}
