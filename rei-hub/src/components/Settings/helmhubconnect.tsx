import { useState, useEffect } from 'react'
import { Plug, PlugZap, Loader2, AlertCircle, CheckCircle2 } from 'lucide-react'

type LinkState = 'idle' | 'loading' | 'success' | 'error' | 'not_authorized'

const HELM_HUB_URL = import.meta.env.VITE_HELM_HUB_URL || 'http://localhost:8000'
const LS_EMAIL_KEY = 'helmHub_linkedEmail'
const LS_PLAN_KEY = 'helmHub_plan'

export default function HelmHubConnect() {
  const [linkState, setLinkState] = useState<LinkState>('idle')
  const [linkedEmail, setLinkedEmail] = useState<string | null>(null)
  const [errorMessage, setErrorMessage] = useState<string>('')

  useEffect(() => {
    const email = localStorage.getItem(LS_EMAIL_KEY)
    if (email) {
      setLinkedEmail(email)
      setLinkState('success')
    }
  }, [])

  const handleConnect = async () => {
    setLinkState('loading')
    setErrorMessage('')

    try {
      const res = await fetch(`${HELM_HUB_URL}/api/plugin/rei/entitlement`, {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
      })

      if (res.status === 403) {
        setLinkState('not_authorized')
        setErrorMessage('No active Helm Hub subscription found. Visit helmhub.io to sign up.')
        return
      }

      if (!res.ok) {
        throw new Error(`Helm Hub returned ${res.status}`)
      }

      const data = await res.json()
      const email: string = data.email || 'Connected Account'
      const plan: string = data.plan || 'pro'

      localStorage.setItem(LS_EMAIL_KEY, email)
      localStorage.setItem(LS_PLAN_KEY, plan)
      setLinkedEmail(email)
      setLinkState('success')
    } catch (err: any) {
      setLinkState('error')
      setErrorMessage(err.message || 'Could not reach Helm Hub. Is it running?')
    }
  }

  const handleDisconnect = () => {
    localStorage.removeItem(LS_EMAIL_KEY)
    localStorage.removeItem(LS_PLAN_KEY)
    setLinkedEmail(null)
    setLinkState('idle')
    setErrorMessage('')
  }

  return (
    <div className="bg-white rounded-xl border border-slate-200 p-6">
      <div className="flex items-center gap-3 mb-4">
        <PlugZap className="w-5 h-5 text-primary-600" />
        <h2 className="text-lg font-semibold text-slate-800">Helm Hub — Optional AI Add-on</h2>
      </div>

      <p className="text-sm text-slate-600 mb-6">
        Optionally connect your Helm Hub AI assistant to unlock AI-powered REI skills inside REI Hub — deal analysis, market research, and motivated seller scripts. Helm Hub is a separate product and not required to use REIFundamentals Hub.
      </p>

      {/* Status area */}
      {linkState === 'success' && linkedEmail && (
        <div className="flex items-start gap-3 p-4 bg-success-50 border border-success-200 rounded-lg mb-4">
          <CheckCircle2 className="w-5 h-5 text-success-600 mt-0.5 shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="font-medium text-success-800">Connected</p>
            <p className="text-sm text-success-700 truncate">{linkedEmail}</p>
          </div>
        </div>
      )}

      {(linkState === 'error' || linkState === 'not_authorized') && (
        <div className="flex items-start gap-3 p-4 bg-red-50 border border-red-200 rounded-lg mb-4">
          <AlertCircle className="w-5 h-5 text-red-600 mt-0.5 shrink-0" />
          <div>
            <p className="font-medium text-red-800">
              {linkState === 'not_authorized' ? 'Helm Hub Subscription Required' : 'Connection Failed'}
            </p>
            <p className="text-sm text-red-700">{errorMessage}</p>
          </div>
        </div>
      )}

      {/* Action button */}
      <div className="flex gap-3">
        {linkState !== 'success' ? (
          <button
            onClick={handleConnect}
            disabled={linkState === 'loading'}
            className="flex items-center gap-2 px-4 py-2 bg-primary-500 text-white rounded-lg hover:bg-primary-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {linkState === 'loading' ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Plug className="w-4 h-4" />
            )}
            {linkState === 'loading' ? 'Connecting...' : 'Connect Helm Hub'}
          </button>
        ) : (
          <button
            onClick={handleDisconnect}
            className="flex items-center gap-2 px-4 py-2 border border-slate-300 text-slate-700 rounded-lg hover:bg-slate-50 transition-colors"
          >
            <Plug className="w-4 h-4" />
            Disconnect
          </button>
        )}
      </div>

      <p className="text-xs text-slate-400 mt-4">
        Helm Hub URL: <code className="bg-slate-100 px-1 rounded">{HELM_HUB_URL}</code>
      </p>
    </div>
  )
}