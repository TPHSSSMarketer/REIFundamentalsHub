import { useState, useEffect } from 'react'
import {
  getPipelineOverview,
  getPortfolioOverview,
  getLoansOverview,
  getNegotiationsOverview,
  getRevenueOverview,
} from '../../../services/analyticsApi'

interface Props {
  token: string
  period: string
  startDate: string
  endDate: string
  isSuperAdmin: boolean
  loanServicingEnabled: boolean
  bankNegotiationEnabled: boolean
}

interface KpiCard {
  label: string
  value: string
  visible: boolean
}

function fmt(n: number | undefined | null, type: 'currency' | 'percent' | 'count'): string {
  const v = n ?? 0
  if (type === 'currency') return '$' + v.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })
  if (type === 'percent') return v.toFixed(1) + '%'
  return v.toLocaleString()
}

function buildParams(period: string, startDate: string, endDate: string): Record<string, string> {
  const p: Record<string, string> = { period }
  if (period === 'custom' && startDate) p.start_date = startDate
  if (period === 'custom' && endDate) p.end_date = endDate
  return p
}

export default function OverviewTab({
  token, period, startDate, endDate,
  isSuperAdmin, loanServicingEnabled, bankNegotiationEnabled,
}: Props) {
  const [loading, setLoading] = useState(true)
  const [pipeline, setPipeline] = useState<any>(null)
  const [portfolio, setPortfolio] = useState<any>(null)
  const [loans, setLoans] = useState<any>(null)
  const [negotiations, setNegotiations] = useState<any>(null)
  const [revenue, setRevenue] = useState<any>(null)

  useEffect(() => {
    let cancelled = false
    async function load() {
      setLoading(true)
      const params = buildParams(period, startDate, endDate)
      try {
        const promises: Promise<any>[] = [
          getPipelineOverview(token, params),
          getPortfolioOverview(token, params),
        ]
        if (loanServicingEnabled) promises.push(getLoansOverview(token, params))
        if (bankNegotiationEnabled) promises.push(getNegotiationsOverview(token, params))
        if (isSuperAdmin) promises.push(getRevenueOverview(token, params))

        const results = await Promise.all(promises)
        if (cancelled) return
        let idx = 0
        setPipeline(results[idx++])
        setPortfolio(results[idx++])
        if (loanServicingEnabled) setLoans(results[idx++])
        if (bankNegotiationEnabled) setNegotiations(results[idx++])
        if (isSuperAdmin) setRevenue(results[idx++])
      } catch {
        /* errors handled by auth interceptor */
      }
      if (!cancelled) setLoading(false)
    }
    load()
    return () => { cancelled = true }
  }, [token, period, startDate, endDate, loanServicingEnabled, bankNegotiationEnabled, isSuperAdmin])

  if (loading) {
    return (
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="bg-white rounded-xl border-l-4 border-[#1B3A6B] p-4 animate-pulse">
            <div className="h-3 w-20 bg-slate-200 rounded mb-3" />
            <div className="h-6 w-16 bg-slate-200 rounded" />
          </div>
        ))}
      </div>
    )
  }

  const cards: KpiCard[] = [
    { label: 'Total Leads', value: fmt(pipeline?.total_leads, 'count'), visible: true },
    { label: 'Active Deals', value: fmt(pipeline?.active_deals, 'count'), visible: true },
    { label: 'Total Properties', value: fmt(portfolio?.total_properties, 'count'), visible: true },
    { label: 'Portfolio Value', value: fmt(portfolio?.portfolio_value, 'currency'), visible: true },
    { label: 'Collections', value: fmt(loans?.collections, 'currency'), visible: loanServicingEnabled },
    { label: 'Active Defaults', value: fmt(loans?.active_defaults, 'count'), visible: loanServicingEnabled },
    { label: 'Delinquency Rate', value: fmt(loans?.delinquency_rate, 'percent'), visible: loanServicingEnabled },
    { label: 'Active Negotiations', value: fmt(negotiations?.active_negotiations, 'count'), visible: bankNegotiationEnabled },
    { label: 'Letters Sent', value: fmt(negotiations?.letters_sent, 'count'), visible: bankNegotiationEnabled },
    { label: 'Approval Rate', value: fmt(negotiations?.approval_rate, 'percent'), visible: bankNegotiationEnabled },
    { label: 'MRR', value: fmt(revenue?.mrr, 'currency'), visible: isSuperAdmin },
    { label: 'Active Subscribers', value: fmt(revenue?.active_subscribers, 'count'), visible: isSuperAdmin },
    { label: 'Churn Rate', value: fmt(revenue?.churn_rate, 'percent'), visible: isSuperAdmin },
  ]

  const visible = cards.filter((c) => c.visible)

  if (visible.length === 0) {
    return <div className="text-sm text-slate-500 text-center py-12">No data available</div>
  }

  return (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
      {visible.map((card) => (
        <div
          key={card.label}
          className="bg-white rounded-xl border-l-4 border-[#1B3A6B] shadow-sm p-4"
        >
          <p className="text-xs text-slate-500 mb-1">{card.label}</p>
          <p className="text-xl font-bold text-slate-800">{card.value}</p>
        </div>
      ))}
    </div>
  )
}
