import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { Brain, Sparkles, Loader2 } from 'lucide-react'
import { helmAnalyzeDeal, HelmProxyError } from '@/services/helmProxy'

interface DealAnalysisPanelProps {
  address: string
  arv?: number
  askingPrice?: number
  repairEstimate?: number
  notes?: string
}

export default function DealAnalysisPanel({
  address,
  arv,
  askingPrice,
  repairEstimate,
  notes,
}: DealAnalysisPanelProps) {
  const [analysisState, setAnalysisState] = useState<'idle' | 'loading' | 'success' | 'error'>('idle')
  const [analysisText, setAnalysisText] = useState('')
  const [errorMessage, setErrorMessage] = useState('')
  const [isConnected, setIsConnected] = useState(false)

  useEffect(() => {
    const email = localStorage.getItem('helmHub_linkedEmail')
    setIsConnected(!!email)
  }, [])

  if (!isConnected) {
    return (
      <div className="bg-white rounded-xl border border-slate-200 p-6">
        <div className="flex items-center gap-3 mb-4">
          <Brain className="w-5 h-5 text-primary-600" />
          <h2 className="text-lg font-semibold text-slate-800">AI Deal Analysis</h2>
        </div>
        <p className="text-sm text-slate-600 mb-4">
          Helm Hub is an optional AI assistant add-on. Connect it in Settings to unlock AI-powered deal analysis — or use REI Hub without it.
        </p>
        <Link
          to="/settings"
          className="inline-flex items-center gap-2 px-4 py-2 border border-slate-300 text-slate-700 rounded-lg hover:bg-slate-50 transition-colors text-sm"
        >
          Connect Helm Hub (Optional) →
        </Link>
      </div>
    )
  }

  const handleAnalyze = async () => {
    setAnalysisState('loading')
    setErrorMessage('')
    setAnalysisText('')

    try {
      const response = await helmAnalyzeDeal({
        address,
        arv,
        asking_price: askingPrice,
        repair_estimate: repairEstimate,
        notes,
      })
      setAnalysisText(response.analysis)
      setAnalysisState('success')
    } catch (err) {
      if (err instanceof HelmProxyError && err.status === 403) {
        setErrorMessage('REI plugin subscription required. Check your Helm Hub connection in Settings.')
      } else if (err instanceof Error) {
        setErrorMessage(err.message)
      } else {
        setErrorMessage('An unexpected error occurred.')
      }
      setAnalysisState('error')
    }
  }

  return (
    <div className="bg-white rounded-xl border border-slate-200 p-6">
      <div className="flex items-center gap-3 mb-4">
        <Brain className="w-5 h-5 text-primary-600" />
        <h2 className="text-lg font-semibold text-slate-800">
          AI Deal Analysis — Powered by Helm Hub
        </h2>
      </div>

      <button
        onClick={handleAnalyze}
        disabled={analysisState === 'loading'}
        className="flex items-center gap-2 px-4 py-2 bg-primary-500 text-white rounded-lg hover:bg-primary-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
      >
        {analysisState === 'loading' ? (
          <Loader2 className="w-4 h-4 animate-spin" />
        ) : (
          <Sparkles className="w-4 h-4" />
        )}
        {analysisState === 'loading' ? 'Analyzing...' : 'Analyze This Deal'}
      </button>

      {analysisState === 'success' && (
        <div className="mt-4 max-h-96 overflow-y-auto bg-slate-50 rounded-lg p-4">
          <div className="text-sm whitespace-pre-wrap text-slate-800">{analysisText}</div>
        </div>
      )}

      {analysisState === 'error' && (
        <div className="mt-4 p-4 bg-red-50 border border-red-200 rounded-lg">
          <p className="text-sm text-red-700">{errorMessage}</p>
        </div>
      )}
    </div>
  )
}
