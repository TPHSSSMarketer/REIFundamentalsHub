import { useState, useEffect, useCallback } from 'react'
import {
  ShieldCheck,
  Landmark,
  CheckCircle2,
  XCircle,
  Copy,
  FileDown,
  Unlink,
  Send,
  Clock,
  Trash2,
  Eye,
} from 'lucide-react'
import {
  getLinkToken,
  verifyFunds,
  getCertificates,
  disconnectBank,
  requestPof,
  getRequests,
  cancelRequest,
  getCertificate,
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

interface PofReq {
  id: string
  buyer_email: string
  buyer_name: string
  property_address: string
  required_amount: number
  status: string
  request_token: string
  expires_at: string
  completed_at: string | null
  certificate_id: string | null
  notes: string | null
  created_at: string
}

export default function ProofOfFundsPage() {
  const [activeTab, setActiveTab] = useState<'verify' | 'request'>('verify')

  // ── Shared state ────────────────────────────────────────────
  const [toast, setToast] = useState('')

  const showToast = (msg: string) => {
    setToast(msg)
    setTimeout(() => setToast(''), 3000)
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6">
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

      {/* Tabs */}
      <div className="flex gap-1 bg-slate-100 rounded-lg p-1">
        <button
          onClick={() => setActiveTab('verify')}
          className={`flex-1 py-2 px-4 rounded-md text-sm font-medium transition-colors ${
            activeTab === 'verify'
              ? 'bg-white text-primary-700 shadow-sm'
              : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          My Verification
        </button>
        <button
          onClick={() => setActiveTab('request')}
          className={`flex-1 py-2 px-4 rounded-md text-sm font-medium transition-colors ${
            activeTab === 'request'
              ? 'bg-white text-primary-700 shadow-sm'
              : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          Request from Buyer
        </button>
      </div>

      {activeTab === 'verify' ? (
        <MyVerificationTab showToast={showToast} />
      ) : (
        <RequestFromBuyerTab showToast={showToast} />
      )}
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════
// Tab 1 — My Verification (original content, unchanged)
// ═══════════════════════════════════════════════════════════════

function MyVerificationTab({ showToast }: { showToast: (m: string) => void }) {
  const [bankConnected, setBankConnected] = useState(false)
  const [linkedAt, setLinkedAt] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  const [amount, setAmount] = useState('')
  const [address, setAddress] = useState('')
  const [verifying, setVerifying] = useState(false)
  const [verifyError, setVerifyError] = useState('')

  const [activeCert, setActiveCert] = useState<Certificate | null>(null)
  const [certificates, setCertificates] = useState<Certificate[]>([])

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
    <div className="space-y-8">
      {/* Connect Bank */}
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

      {/* Generate Certificate */}
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

          {activeCert && <CertificateCard cert={activeCert} showToast={showToast} onCopyLink={handleCopyLink} />}
        </section>
      )}

      {/* Certificate History */}
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
                {certificates.map((c) => {
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

// ═══════════════════════════════════════════════════════════════
// Tab 2 — Request from Buyer
// ═══════════════════════════════════════════════════════════════

function RequestFromBuyerTab({ showToast }: { showToast: (m: string) => void }) {
  const [loading, setLoading] = useState(true)
  const [requests, setRequests] = useState<PofReq[]>([])
  const [viewCert, setViewCert] = useState<Certificate | null>(null)

  // Form state
  const [buyerName, setBuyerName] = useState('')
  const [buyerEmail, setBuyerEmail] = useState('')
  const [propAddress, setPropAddress] = useState('')
  const [reqAmount, setReqAmount] = useState('')
  const [notes, setNotes] = useState('')
  const [sending, setSending] = useState(false)
  const [sendError, setSendError] = useState('')
  const [successEmail, setSuccessEmail] = useState('')

  const loadRequests = useCallback(async () => {
    try {
      const data = await getRequests()
      setRequests(data.requests as PofReq[])
    } catch {
      // ignore
    }
  }, [])

  useEffect(() => {
    loadRequests().finally(() => setLoading(false))
  }, [loadRequests])

  const handleSend = async () => {
    if (!buyerName.trim()) { setSendError('Enter the buyer name'); return }
    if (!buyerEmail.trim()) { setSendError('Enter the buyer email'); return }
    if (!propAddress.trim()) { setSendError('Enter the property address'); return }
    const parsed = parseFloat(reqAmount)
    if (!parsed || parsed <= 0) { setSendError('Enter a valid dollar amount'); return }

    setSending(true)
    setSendError('')
    setSuccessEmail('')

    try {
      await requestPof({
        buyer_name: buyerName.trim(),
        buyer_email: buyerEmail.trim(),
        property_address: propAddress.trim(),
        required_amount: parsed,
        notes: notes.trim() || undefined,
      })
      setSuccessEmail(buyerEmail.trim())
      setBuyerName('')
      setBuyerEmail('')
      setPropAddress('')
      setReqAmount('')
      setNotes('')
      await loadRequests()
    } catch {
      setSendError('Failed to send request. Please try again.')
    } finally {
      setSending(false)
    }
  }

  const handleCancel = async (id: string) => {
    try {
      await cancelRequest(id)
      showToast('Request canceled')
      await loadRequests()
    } catch {
      showToast('Failed to cancel request')
    }
  }

  const handleViewCert = async (certId: string) => {
    try {
      const cert = (await getCertificate(certId)) as Certificate
      setViewCert(cert)
    } catch {
      showToast('Failed to load certificate')
    }
  }

  const handleCopyLink = (certId: string) => {
    const url = `${window.location.origin}/proof-of-funds?cert=${certId}`
    navigator.clipboard.writeText(url)
    showToast('Certificate link copied to clipboard')
  }

  const statusBadge = (s: string) => {
    switch (s) {
      case 'pending':
        return (
          <span className="inline-flex items-center gap-1 text-xs font-medium text-yellow-600 bg-yellow-50 px-2 py-0.5 rounded-full">
            <Clock className="w-3 h-3" />
            Awaiting Verification
          </span>
        )
      case 'completed':
        return (
          <span className="inline-flex items-center gap-1 text-xs font-medium text-green-600 bg-green-50 px-2 py-0.5 rounded-full">
            <CheckCircle2 className="w-3 h-3" />
            Verified
          </span>
        )
      case 'expired':
        return (
          <span className="inline-flex items-center gap-1 text-xs font-medium text-slate-400 bg-slate-50 px-2 py-0.5 rounded-full">
            <Clock className="w-3 h-3" />
            Expired
          </span>
        )
      case 'declined':
        return (
          <span className="inline-flex items-center gap-1 text-xs font-medium text-red-500 bg-red-50 px-2 py-0.5 rounded-full">
            <XCircle className="w-3 h-3" />
            Declined
          </span>
        )
      default:
        return <span className="text-xs text-slate-400">{s}</span>
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-4 border-primary-500 border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  return (
    <div className="space-y-8">
      {/* Send Request Form */}
      <section className="bg-white rounded-xl border border-slate-200 p-6">
        <h2 className="text-lg font-semibold text-slate-900 flex items-center gap-2 mb-4">
          <Send className="w-5 h-5 text-slate-600" />
          Send POF Request
        </h2>

        {successEmail && (
          <div className="mb-4 p-3 bg-green-50 border border-green-200 rounded-lg text-sm text-green-700">
            <CheckCircle2 className="w-4 h-4 inline mr-1.5" />
            Request sent to <strong>{successEmail}</strong>
          </div>
        )}

        <div className="grid sm:grid-cols-2 gap-4 mb-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              Buyer Name
            </label>
            <input
              type="text"
              placeholder="John Doe"
              value={buyerName}
              onChange={(e) => setBuyerName(e.target.value)}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              Buyer Email
            </label>
            <input
              type="email"
              placeholder="buyer@example.com"
              value={buyerEmail}
              onChange={(e) => setBuyerEmail(e.target.value)}
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
              value={propAddress}
              onChange={(e) => setPropAddress(e.target.value)}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              Required Amount ($)
            </label>
            <input
              type="number"
              min="0"
              step="1000"
              placeholder="50000"
              value={reqAmount}
              onChange={(e) => setReqAmount(e.target.value)}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
            />
          </div>
        </div>

        <div className="mb-4">
          <label className="block text-sm font-medium text-slate-700 mb-1">
            Notes (optional)
          </label>
          <textarea
            placeholder="Any additional context for the buyer..."
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={2}
            className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent resize-none"
          />
        </div>

        {sendError && (
          <p className="text-sm text-red-600 mb-3 flex items-center gap-1">
            <XCircle className="w-4 h-4" />
            {sendError}
          </p>
        )}

        <button
          onClick={handleSend}
          disabled={sending}
          className="inline-flex items-center gap-2 px-5 py-2.5 bg-primary-600 text-white rounded-lg font-medium hover:bg-primary-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {sending ? (
            <>
              <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
              Sending...
            </>
          ) : (
            <>
              <Send className="w-4 h-4" />
              Send POF Request
            </>
          )}
        </button>
      </section>

      {/* View certificate overlay */}
      {viewCert && (
        <section className="bg-white rounded-xl border border-slate-200 p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-slate-900">Certificate</h2>
            <button
              onClick={() => setViewCert(null)}
              className="text-sm text-slate-500 hover:text-slate-700"
            >
              Close
            </button>
          </div>
          <CertificateCard cert={viewCert} showToast={showToast} onCopyLink={handleCopyLink} />
        </section>
      )}

      {/* Requests Table */}
      <section className="bg-white rounded-xl border border-slate-200 p-6">
        <h2 className="text-lg font-semibold text-slate-900 mb-4">
          Sent Requests
        </h2>

        {requests.length === 0 ? (
          <p className="text-slate-400 text-sm text-center py-6">
            No requests sent yet
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-left text-slate-500">
                  <th className="pb-2 font-medium">Buyer</th>
                  <th className="pb-2 font-medium">Property</th>
                  <th className="pb-2 font-medium">Amount</th>
                  <th className="pb-2 font-medium">Status</th>
                  <th className="pb-2 font-medium">Sent</th>
                  <th className="pb-2 font-medium">Expires</th>
                  <th className="pb-2 font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {requests.map((r) => (
                  <tr
                    key={r.id}
                    className="border-b border-slate-100 hover:bg-slate-50 transition-colors"
                  >
                    <td className="py-2.5">
                      <div className="font-medium text-slate-700">{r.buyer_name}</div>
                      <div className="text-xs text-slate-400">{r.buyer_email}</div>
                    </td>
                    <td className="py-2.5 max-w-[160px] truncate">
                      {r.property_address}
                    </td>
                    <td className="py-2.5">
                      ${r.required_amount.toLocaleString()}
                    </td>
                    <td className="py-2.5">{statusBadge(r.status)}</td>
                    <td className="py-2.5 text-slate-500">
                      {new Date(r.created_at).toLocaleDateString()}
                    </td>
                    <td className="py-2.5 text-slate-500">
                      {new Date(r.expires_at).toLocaleDateString()}
                    </td>
                    <td className="py-2.5">
                      {r.status === 'pending' && (
                        <button
                          onClick={() => handleCancel(r.id)}
                          className="inline-flex items-center gap-1 text-xs text-red-500 hover:text-red-700"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                          Cancel
                        </button>
                      )}
                      {r.status === 'completed' && r.certificate_id && (
                        <button
                          onClick={() => handleViewCert(r.certificate_id!)}
                          className="inline-flex items-center gap-1 text-xs text-primary-600 hover:text-primary-800"
                        >
                          <Eye className="w-3.5 h-3.5" />
                          View Certificate
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════
// Shared Certificate Card
// ═══════════════════════════════════════════════════════════════

function CertificateCard({
  cert,
  showToast,
  onCopyLink,
}: {
  cert: Certificate
  showToast: (m: string) => void
  onCopyLink: (id: string) => void
}) {
  return (
    <div
      className={`mt-6 rounded-xl border-2 p-6 ${
        cert.verified
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
            {cert.certificate_id.slice(0, 8)}...
          </span>
        </div>
        <div>
          <span className="text-slate-500">Buyer:</span>{' '}
          <span className="text-slate-700">{cert.buyer_name}</span>
        </div>
        <div>
          <span className="text-slate-500">Email:</span>{' '}
          <span className="text-slate-700">{cert.buyer_email}</span>
        </div>
        <div>
          <span className="text-slate-500">Property:</span>{' '}
          <span className="text-slate-700">{cert.property_address}</span>
        </div>
        <div>
          <span className="text-slate-500">Required:</span>{' '}
          <span className="font-semibold text-slate-700">
            ${cert.required_amount.toLocaleString()}
          </span>
        </div>
        <div>
          <span className="text-slate-500">Verified Amount:</span>{' '}
          <span className="font-semibold text-green-700">
            {cert.available_balance}
          </span>
        </div>
        <div>
          <span className="text-slate-500">Issued:</span>{' '}
          <span className="text-slate-700">
            {new Date(cert.issued_at).toLocaleString()}
          </span>
        </div>
        <div>
          <span className="text-slate-500">Expires:</span>{' '}
          <span className="text-slate-700">
            {new Date(cert.expires_at).toLocaleString()}
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
          onClick={() => onCopyLink(cert.certificate_id)}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm border border-slate-300 rounded-lg hover:bg-white transition-colors"
        >
          <Copy className="w-3.5 h-3.5" />
          Share Link
        </button>
      </div>
    </div>
  )
}
