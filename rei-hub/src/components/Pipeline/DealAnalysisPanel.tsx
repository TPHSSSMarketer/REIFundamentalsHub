import { useState } from 'react'
import { Brain, Sparkles, Loader2 } from 'lucide-react'
import { aiAnalyzeDeal } from '@/services/aiService'
import { toast } from 'sonner'

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

  const handleAnalyze = async () => {
    setAnalysisState('loading')
    setErrorMessage('')
    setAnalysisText('')

    try {
      const response = await aiAnalyzeDeal({
        address,
        arv,
        asking_price: askingPrice,
        repair_estimate: repairEstimate,
        notes,
      })
      setAnalysisText(response.analysis)
      setAnalysisState('success')
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'An unexpected error occurred.'
      setErrorMessage(msg)
      setAnalysisState('error')
    }
  }

  return (
    <div className="bg-white rounded-xl border border-slate-200 p-6">
      <div className="flex items-center gap-3 mb-4">
        <Brain className="w-5 h-5 text-primary-600" />
        <h2 className="text-lg font-semibold text-slate-800">AI Deal Analysis</h2>
        <span className="text-xs bg-yellow-100 text-yellow-700 px-2 py-0.5 rounded-full font-medium">Coming Soon</span>
      </div>

      <p className="text-sm text-slate-500 mb-4">
        AI-powered deal analysis is being upgraded to native AI. This feature will be available soon.
      </p>

      <button
        onClick={handleAnalyze}
        disabled={true}
        className="flex items-center gap-2 px-4 py-2 bg-primary-500 text-white rounded-lg hover:bg-primary-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
      >
        <Sparkles className="w-4 h-4" />
        Analyze This Deal
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
