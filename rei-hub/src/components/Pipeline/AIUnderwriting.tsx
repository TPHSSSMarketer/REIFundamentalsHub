import { useState, useEffect } from 'react'
import { Loader2, Sparkles, AlertTriangle, CheckCircle2, XCircle, RefreshCw, TrendingUp, Shield, FileText } from 'lucide-react'
import { getAuthHeader } from '@/services/auth'
import { toast } from 'sonner'
import { formatCurrency } from '@/utils/helpers'

const BASE_URL = import.meta.env.VITE_REI_SERVER_URL ?? 'http://localhost:8001'

interface AIUnderwritingProps {
  dealId: string
  dealData?: {
    address?: string
    city?: string
    state?: string
    purchase_price?: number
    arv?: number
  }
}

interface RiskFlag {
  flag: string
  severity: 'high' | 'medium' | 'low'
  detail: string
}

interface CompAnalysis {
  description: string
  sale_price: string
  sale_date: string
  relevance: string
}

interface UnderwritingResult {
  has_analysis?: boolean
  score: number
  rating: string
  risk_flags: RiskFlag[]
  strengths: string[]
  comp_analysis: CompAnalysis[]
  memo: string
  recommendation: string
  recommended_offer: number | null
  max_allowable_offer: number | null
  analyzed_at: string
  provider: string
  model: string
  tokens_used: number
  attom_available: boolean
}

// ── Score ring ─────────────────────────────────────────────────

function ScoreRing({ score }: { score: number }) {
  const radius = 54
  const circumference = 2 * Math.PI * radius
  const offset = circumference - (score / 100) * circumference

  const color =
    score >= 70 ? '#10B981' : score >= 40 ? '#F59E0B' : '#EF4444'
  const bg =
    score >= 70 ? 'bg-green-50' : score >= 40 ? 'bg-amber-50' : 'bg-red-50'

  return (
    <div className={`relative w-36 h-36 ${bg} rounded-full flex items-center justify-center`}>
      <svg className="absolute w-full h-full -rotate-90" viewBox="0 0 120 120">
        <circle cx="60" cy="60" r={radius} fill="none" stroke="#e2e8f0" strokeWidth="8" />
        <circle
          cx="60" cy="60" r={radius} fill="none"
          stroke={color} strokeWidth="8" strokeLinecap="round"
          strokeDasharray={circumference} strokeDashoffset={offset}
          className="transition-all duration-1000 ease-out"
        />
      </svg>
      <div className="text-center z-10">
        <span className="text-3xl font-bold" style={{ color }}>{score}</span>
        <p className="text-[10px] text-slate-500 font-medium">/ 100</p>
      </div>
    </div>
  )
}

// ── Rating badge ───────────────────────────────────────────────

function RatingBadge({ rating }: { rating: string }) {
  const config: Record<string, { bg: string; text: string; label: string }> = {
    STRONG_BUY: { bg: 'bg-green-100', text: 'text-green-800', label: 'STRONG BUY' },
    BUY: { bg: 'bg-green-50', text: 'text-green-700', label: 'BUY' },
    HOLD: { bg: 'bg-amber-100', text: 'text-amber-800', label: 'HOLD' },
    NEGOTIATE: { bg: 'bg-amber-50', text: 'text-amber-700', label: 'NEGOTIATE' },
    PASS: { bg: 'bg-red-100', text: 'text-red-700', label: 'PASS' },
  }
  const c = config[rating] || config.HOLD
  return (
    <span className={`px-3 py-1.5 rounded-full text-sm font-bold ${c.bg} ${c.text}`}>
      {c.label}
    </span>
  )
}

// ── Severity icon ──────────────────────────────────────────────

function SeverityIcon({ severity }: { severity: string }) {
  if (severity === 'high') return <XCircle className="w-4 h-4 text-red-500 shrink-0" />
  if (severity === 'medium') return <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0" />
  return <CheckCircle2 className="w-4 h-4 text-green-500 shrink-0" />
}

// ── Main Component ─────────────────────────────────────────────

export default function AIUnderwriting({ dealId, dealData }: AIUnderwritingProps) {
  const [analysis, setAnalysis] = useState<UnderwritingResult | null>(null)
  const [loading, setLoading] = useState(true)
  const [running, setRunning] = useState(false)

  useEffect(() => {
    fetchExisting()
  }, [dealId])

  async function fetchExisting() {
    setLoading(true)
    try {
      const res = await fetch(`${BASE_URL}/api/underwriting/${dealId}`, {
        headers: getAuthHeader(),
        credentials: 'include',
      })
      if (res.ok) {
        const data = await res.json()
        if (data.has_analysis !== false) {
          setAnalysis(data)
        }
      }
    } catch {
      // No existing analysis — that's fine
    } finally {
      setLoading(false)
    }
  }

  async function runAnalysis() {
    setRunning(true)
    try {
      const res = await fetch(`${BASE_URL}/api/underwriting/${dealId}/analyze`, {
        method: 'POST',
        headers: { ...getAuthHeader(), 'Content-Type': 'application/json' },
        credentials: 'include',
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.detail || 'Analysis failed')
      }
      const data = await res.json()
      setAnalysis(data)
      toast.success('Underwriting analysis complete')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Analysis failed')
    } finally {
      setRunning(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="w-6 h-6 animate-spin text-primary-500" />
      </div>
    )
  }

  // No analysis yet — show CTA
  if (!analysis) {
    return (
      <div className="space-y-4">
        <div className="bg-gradient-to-br from-purple-50 to-blue-50 rounded-xl border border-purple-200 p-8 text-center">
          <Sparkles className="w-12 h-12 text-purple-500 mx-auto mb-4" />
          <h3 className="text-lg font-bold text-slate-800 mb-2">AI Underwriting Analysis</h3>
          <p className="text-sm text-slate-600 mb-1 max-w-md mx-auto">
            Get a comprehensive deal score, risk assessment, comp analysis, and investment memo — powered by NVIDIA Nemotron AI.
          </p>
          {dealData?.address && (
            <p className="text-xs text-slate-500 mb-4">
              {dealData.address}{dealData.city ? `, ${dealData.city}` : ''}{dealData.state ? `, ${dealData.state}` : ''}
            </p>
          )}
          <button
            onClick={runAnalysis}
            disabled={running}
            className="inline-flex items-center gap-2 px-6 py-2.5 bg-purple-600 text-white text-sm font-medium rounded-lg hover:bg-purple-700 disabled:opacity-50 transition-colors"
          >
            {running ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Analyzing Deal (10-15 sec)...
              </>
            ) : (
              <>
                <Sparkles className="w-4 h-4" />
                Run AI Underwriting
              </>
            )}
          </button>
        </div>
      </div>
    )
  }

  // Show analysis results
  return (
    <div className="space-y-5">
      {/* Header with re-run */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-bold text-slate-800 flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-purple-500" />
            AI Underwriting Analysis
          </h3>
          {analysis.analyzed_at && (
            <p className="text-xs text-slate-500 mt-0.5">
              Last analyzed: {new Date(analysis.analyzed_at).toLocaleString()}
              {' · '}{analysis.provider}/{analysis.model}
              {analysis.attom_available && ' · ATTOM data included'}
            </p>
          )}
        </div>
        <button
          onClick={runAnalysis}
          disabled={running}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-purple-700 bg-purple-50 rounded-lg hover:bg-purple-100 disabled:opacity-50 transition-colors"
        >
          {running ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
          Re-analyze
        </button>
      </div>

      {/* Score + Rating + Recommendation */}
      <div className="bg-white rounded-xl border border-slate-200 p-5">
        <div className="flex flex-col sm:flex-row items-center gap-6">
          <ScoreRing score={analysis.score} />
          <div className="text-center sm:text-left space-y-3">
            <RatingBadge rating={analysis.rating} />
            <div className="flex flex-wrap gap-3 mt-2">
              {analysis.recommended_offer != null && (
                <div className="bg-blue-50 rounded-lg px-3 py-2">
                  <p className="text-[10px] text-blue-600 font-medium uppercase">Recommended Offer</p>
                  <p className="text-lg font-bold text-blue-800">{formatCurrency(analysis.recommended_offer)}</p>
                </div>
              )}
              {analysis.max_allowable_offer != null && (
                <div className="bg-slate-50 rounded-lg px-3 py-2">
                  <p className="text-[10px] text-slate-500 font-medium uppercase">Max Allowable</p>
                  <p className="text-lg font-bold text-slate-800">{formatCurrency(analysis.max_allowable_offer)}</p>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Risk Flags */}
      {analysis.risk_flags && analysis.risk_flags.length > 0 && (
        <div className="bg-white rounded-xl border border-slate-200 p-5">
          <h4 className="text-sm font-semibold text-slate-800 flex items-center gap-2 mb-3">
            <Shield className="w-4 h-4 text-red-500" />
            Risk Flags
          </h4>
          <div className="space-y-2">
            {analysis.risk_flags.map((flag, i) => (
              <div key={i} className="flex items-start gap-2 p-2.5 bg-slate-50 rounded-lg">
                <SeverityIcon severity={flag.severity} />
                <div>
                  <p className="text-sm font-medium text-slate-800">{flag.flag}</p>
                  <p className="text-xs text-slate-600 mt-0.5">{flag.detail}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Strengths */}
      {analysis.strengths && analysis.strengths.length > 0 && (
        <div className="bg-white rounded-xl border border-slate-200 p-5">
          <h4 className="text-sm font-semibold text-slate-800 flex items-center gap-2 mb-3">
            <TrendingUp className="w-4 h-4 text-green-500" />
            Strengths
          </h4>
          <div className="space-y-1.5">
            {analysis.strengths.map((s, i) => (
              <div key={i} className="flex items-start gap-2">
                <CheckCircle2 className="w-4 h-4 text-green-500 shrink-0 mt-0.5" />
                <p className="text-sm text-slate-700">{s}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Comp Analysis */}
      {analysis.comp_analysis && analysis.comp_analysis.length > 0 && (
        <div className="bg-white rounded-xl border border-slate-200 p-5">
          <h4 className="text-sm font-semibold text-slate-800 mb-3">Comparable Sales</h4>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50">
                  <th className="text-left px-3 py-2 font-medium text-slate-500">Description</th>
                  <th className="text-left px-3 py-2 font-medium text-slate-500">Price</th>
                  <th className="text-left px-3 py-2 font-medium text-slate-500">Date</th>
                  <th className="text-left px-3 py-2 font-medium text-slate-500">Relevance</th>
                </tr>
              </thead>
              <tbody>
                {analysis.comp_analysis.map((comp, i) => (
                  <tr key={i} className="border-b border-slate-100">
                    <td className="px-3 py-2 text-slate-700">{comp.description}</td>
                    <td className="px-3 py-2 text-slate-700 font-medium">{comp.sale_price}</td>
                    <td className="px-3 py-2 text-slate-500">{comp.sale_date}</td>
                    <td className="px-3 py-2 text-slate-600 text-xs">{comp.relevance}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Memo */}
      {analysis.memo && (
        <div className="bg-white rounded-xl border border-slate-200 p-5">
          <h4 className="text-sm font-semibold text-slate-800 flex items-center gap-2 mb-3">
            <FileText className="w-4 h-4 text-slate-500" />
            Underwriting Memo
          </h4>
          <div className="prose prose-sm max-w-none text-slate-700 whitespace-pre-wrap">
            {analysis.memo}
          </div>
        </div>
      )}

      {/* ATTOM Status */}
      <div className="text-center">
        <p className="text-xs text-slate-400">
          {analysis.attom_available
            ? 'Analysis includes ATTOM property data (tax, comps, liens)'
            : 'ATTOM data not available — analysis based on CRM data only. Configure ATTOM API key in Admin > Credentials for enhanced analysis.'}
        </p>
      </div>
    </div>
  )
}
