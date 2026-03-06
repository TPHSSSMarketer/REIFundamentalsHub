import { useState, useEffect } from 'react'
import { useParams } from 'react-router-dom'
import {
  ShieldCheck,
  Landmark,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Clock,
} from 'lucide-react'
import {
  getPublicRequest,
  getPublicLinkToken,
  submitPublicVerification,
} from '@/services/plaidApi'

type PageState = 'loading' | 'active' | 'completed' | 'expired' | 'error'

interface RequestData {
  requestor_name: string
  property_address: string
  required_amount: number
  expires_at: string
  status: string
  notes: string | null
}

interface VerifyResult {
  verified: boolean
  verified_amount_display: string
  requestor_name: string
}

export default function BuyerVerifyPage() {
  const { requestToken } = useParams<{ requestToken: string }>()
  const [pageState, setPageState] = useState<PageState>('loading')
  const [request, setRequest] = useState<RequestData | null>(null)

  // Flow state
  const [bankConnected, setBankConnected] = useState(false)
  const [publicToken, setPublicToken] = useState<string | null>(null)
  const [verifying, setVerifying] = useState(false)
  const [result, setResult] = useState<VerifyResult | null>(null)
  const [errorMsg, setErrorMsg] = useState('')

  useEffect(() => {
    if (!requestToken) {
      setPageState('expired')
      return
    }

    getPublicRequest(requestToken)
      .then((data) => {
        const d = data as unknown as RequestData
        setRequest(d)
        if (d.status === 'completed') {
          setPageState('completed')
        } else {
          setPageState('active')
        }
      })
      .catch((err: Error) => {
        if (err.message.includes('expired') || err.message.includes('410') || err.message.includes('completed')) {
          setPageState('expired')
        } else {
          setPageState('expired')
        }
      })
  }, [requestToken])

  const handleConnectBank = async () => {
    if (!requestToken) return
    try {
      const { link_token } = await getPublicLinkToken(requestToken)
      // Plaid Link JS SDK is a future task — stub with popup
      window.open(
        `https://cdn.plaid.com/link/v2/stable/link.html?token=${link_token}`,
        'plaid-link',
        'width=500,height=700'
      )
      // In a real integration, Plaid Link would call onSuccess with the
      // public_token. For now we simulate with a prompt.
      const token = window.prompt(
        'Paste the public_token from Plaid Link (sandbox testing):'
      )
      if (token) {
        setPublicToken(token)
        setBankConnected(true)
      }
    } catch {
      setErrorMsg('Failed to start bank connection')
    }
  }

  const handleVerify = async () => {
    if (!requestToken || !publicToken) return
    setVerifying(true)
    setErrorMsg('')

    try {
      const cert = await submitPublicVerification(requestToken, publicToken)
      const verified = cert.verified as boolean
      const verifiedDisplay = (cert.verified_amount_display || cert.available_balance) as string

      setResult({
        verified,
        verified_amount_display: verifiedDisplay,
        requestor_name: request?.requestor_name || '',
      })
    } catch {
      setErrorMsg('Verification failed. Please try again.')
    } finally {
      setVerifying(false)
    }
  }

  // ── Loading ────────────────────────────────────────────────
  if (pageState === 'loading') {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-primary-500 border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  // ── Expired / Not Found ────────────────────────────────────
  if (pageState === 'expired') {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-white rounded-xl border border-slate-200 p-8 text-center">
          <AlertTriangle className="w-12 h-12 text-amber-400 mx-auto mb-4" />
          <h1 className="text-xl font-bold text-slate-900 mb-2">
            This verification link has expired or is invalid
          </h1>
          <p className="text-slate-500">
            Please contact the requesting party for a new link.
          </p>
        </div>
      </div>
    )
  }

  // ── Already Completed ──────────────────────────────────────
  if (pageState === 'completed') {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-white rounded-xl border border-slate-200 p-8 text-center">
          <CheckCircle2 className="w-12 h-12 text-green-500 mx-auto mb-4" />
          <h1 className="text-xl font-bold text-slate-900 mb-2">
            Verification already submitted
          </h1>
          <p className="text-slate-500">
            Thank you &mdash; {request?.requestor_name || 'the requestor'} has been notified.
          </p>
        </div>
      </div>
    )
  }

  // ── Active (main flow) ─────────────────────────────────────
  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
      <div className="max-w-lg w-full space-y-6">
        {/* Header */}
        <div className="text-center">
          <h1 className="text-xl font-bold text-primary-800 mb-1">
            REIFundamentals Hub
          </h1>
          <p className="text-slate-500 text-sm">
            Proof of Funds Verification Request
          </p>
        </div>

        {/* Request Details Card */}
        {request && (
          <div className="bg-white rounded-xl border border-slate-200 p-6">
            <div className="space-y-3 text-sm">
              <div className="flex justify-between">
                <span className="text-slate-500">Requested by</span>
                <span className="font-medium text-slate-700">
                  {request.requestor_name}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Property</span>
                <span className="font-medium text-slate-700 text-right max-w-[60%]">
                  {request.property_address}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Amount Required</span>
                <span className="font-semibold text-slate-900">
                  ${request.required_amount.toLocaleString()}
                </span>
              </div>
              {request.notes && (
                <div className="pt-2 border-t border-slate-100">
                  <span className="text-slate-500 block mb-1">Notes</span>
                  <p className="text-slate-600">{request.notes}</p>
                </div>
              )}
              <div className="flex justify-between text-xs text-slate-400 pt-2 border-t border-slate-100">
                <span className="flex items-center gap-1">
                  <Clock className="w-3 h-3" />
                  Expires
                </span>
                <span>{new Date(request.expires_at).toLocaleString()}</span>
              </div>
            </div>
          </div>
        )}

        {/* Verification result — success */}
        {result?.verified && (
          <div className="bg-white rounded-xl border-2 border-green-300 p-6 text-center">
            <CheckCircle2 className="w-12 h-12 text-green-500 mx-auto mb-3" />
            <h2 className="text-lg font-bold text-slate-900 mb-1">
              Verification Complete!
            </h2>
            <p className="text-slate-600 mb-2">
              {result.requestor_name} has been notified.
            </p>
            <p className="text-green-700 font-semibold">
              Verified Amount: {result.verified_amount_display}
            </p>
            <p className="text-xs text-slate-400 mt-1">
              Buyer confirmed funds meet this requirement
            </p>
            <p className="text-xs text-slate-400 mt-3">
              This verification is valid for 24 hours.
            </p>
          </div>
        )}

        {/* Verification result — insufficient */}
        {result && !result.verified && (
          <div className="bg-white rounded-xl border-2 border-red-300 p-6 text-center">
            <XCircle className="w-12 h-12 text-red-400 mx-auto mb-3" />
            <h2 className="text-lg font-bold text-slate-900 mb-1">
              Verification could not be completed
            </h2>
            <p className="text-slate-600 mb-2">
              Available funds do not meet the required amount.
            </p>
            <p className="text-sm text-slate-500">
              Please contact {result.requestor_name || 'the requestor'} directly.
            </p>
          </div>
        )}

        {/* Steps (only if no result yet) */}
        {!result && (
          <div className="bg-white rounded-xl border border-slate-200 p-6 space-y-6">
            {/* Step 1 — Connect Bank */}
            <div>
              <h2 className="text-sm font-semibold text-slate-900 mb-3">
                Step 1 &mdash; Connect Bank
              </h2>
              {!bankConnected ? (
                <div className="text-center">
                  <p className="text-sm text-slate-600 mb-4">
                    Connect your bank account securely via Plaid
                  </p>
                  <button
                    onClick={handleConnectBank}
                    className="inline-flex items-center gap-2 px-6 py-2.5 bg-primary-600 text-white rounded-lg font-medium hover:bg-primary-700 transition-colors"
                  >
                    <Landmark className="w-4 h-4" />
                    Connect Bank Account
                  </button>
                  <p className="text-xs text-slate-400 mt-3">
                    Read-only access &middot; Bank-level security &middot; We
                    never store your credentials
                  </p>
                </div>
              ) : (
                <div className="flex items-center gap-2 text-green-600">
                  <CheckCircle2 className="w-5 h-5" />
                  <span className="font-medium">Your bank has been connected</span>
                </div>
              )}
            </div>

            {/* Step 2 — Verify */}
            {bankConnected && (
              <div className="pt-4 border-t border-slate-100">
                <h2 className="text-sm font-semibold text-slate-900 mb-3">
                  Step 2 &mdash; Verify
                </h2>

                {errorMsg && (
                  <p className="text-sm text-red-600 mb-3 flex items-center gap-1">
                    <XCircle className="w-4 h-4" />
                    {errorMsg}
                  </p>
                )}

                <button
                  onClick={handleVerify}
                  disabled={verifying}
                  className="inline-flex items-center gap-2 px-6 py-2.5 bg-primary-600 text-white rounded-lg font-medium hover:bg-primary-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {verifying ? (
                    <>
                      <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      Verifying...
                    </>
                  ) : (
                    <>
                      <ShieldCheck className="w-4 h-4" />
                      Verify My Funds
                    </>
                  )}
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
