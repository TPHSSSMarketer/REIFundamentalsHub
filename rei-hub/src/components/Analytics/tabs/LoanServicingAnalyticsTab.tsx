import { useState, useEffect } from 'react'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
  PieChart, Pie, Cell,
} from 'recharts'
import { getLoansOverview, getLoanPayments, exportLoans } from '../../../services/analyticsApi'

interface Props { period: string; startDate: string; endDate: string }

const NAVY = '#1B3A6B'
const BLUE = '#3b82f6'
const RED = '#CC2229'
const GREEN = '#16a34a'
const GRAY = '#94a3b8'
const STATUS_COLORS: Record<string, string> = { active: GREEN, default: RED, paid_off: GRAY, other: BLUE }
const PAGE_SIZE = 20

function fmt$(n: number) { return '$' + (n ?? 0).toLocaleString(undefined, { maximumFractionDigits: 0 }) }
function fmtPct(n: number) { return (n ?? 0).toFixed(1) + '%' }

function buildParams(period: string, startDate: string, endDate: string): Record<string, string> {
  const p: Record<string, string> = { period }
  if (period === 'custom' && startDate) p.start_date = startDate
  if (period === 'custom' && endDate) p.end_date = endDate
  return p
}

export default function LoanServicingAnalyticsTab({ period, startDate, endDate }: Props) {
  const [loading, setLoading] = useState(true)
  const [overview, setOverview] = useState<any>(null)
  const [payments, setPayments] = useState<any[]>([])
  const [page, setPage] = useState(0)
  const [exporting, setExporting] = useState(false)

  useEffect(() => {
    let cancelled = false
    async function load() {
      setLoading(true)
      const params = buildParams(period, startDate, endDate)
      try {
        const [ov, pay] = await Promise.all([
          getLoansOverview(params),
          getLoanPayments(params),
        ])
        if (cancelled) return
        setOverview(ov)
        setPayments(Array.isArray(pay) ? pay : (pay as any)?.data ?? [])
        setPage(0)
      } catch { /* handled by auth */ }
      if (!cancelled) setLoading(false)
    }
    load()
    return () => { cancelled = true }
  }, [period, startDate, endDate])

  async function handleExport() {
    setExporting(true)
    try {
      const blob = await exportLoans(buildParams(period, startDate, endDate))
      const url = URL.createObjectURL(blob as Blob)
      const a = document.createElement('a'); a.href = url; a.download = 'loan_servicing.csv'; a.click()
      URL.revokeObjectURL(url)
    } catch { /* toast could go here */ }
    setExporting(false)
  }

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="bg-white rounded-xl border-l-4 border-[#1B3A6B] p-4 animate-pulse">
              <div className="h-3 w-20 bg-slate-200 rounded mb-3" />
              <div className="h-6 w-16 bg-slate-200 rounded" />
            </div>
          ))}
        </div>
        <div className="bg-white rounded-xl shadow-sm p-6 h-64 animate-pulse" />
      </div>
    )
  }

  if (!overview) return <div className="text-sm text-slate-500 text-center py-12">No data available</div>

  const kpis = [
    { label: 'Active CFDs', value: (overview.active_cfds ?? 0).toLocaleString() },
    { label: 'Portfolio Balance', value: fmt$(overview.portfolio_balance) },
    { label: `Collected (${period})`, value: fmt$(overview.collected) },
    { label: 'Active Defaults', value: (overview.active_defaults ?? 0).toLocaleString() },
    { label: 'Delinquency Rate', value: fmtPct(overview.delinquency_rate) },
    { label: 'Avg Days Late', value: (overview.avg_days_late ?? 0).toLocaleString() },
  ]

  const collectionTrend: any[] = Array.isArray(overview.collection_trend) ? overview.collection_trend : []
  const statusBreakdown: any[] = Array.isArray(overview.status_breakdown) ? overview.status_breakdown : []
  const paged = payments.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE)
  const totalPages = Math.max(1, Math.ceil(payments.length / PAGE_SIZE))

  return (
    <div className="space-y-6">
      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        {kpis.map((k) => (
          <div key={k.label} className="bg-white rounded-xl border-l-4 border-[#1B3A6B] shadow-sm p-4">
            <p className="text-xs text-slate-500 mb-1">{k.label}</p>
            <p className="text-lg font-bold text-slate-800">{k.value}</p>
          </div>
        ))}
      </div>

      {/* Collection Trend */}
      {collectionTrend.length > 0 ? (
        <div className="bg-white rounded-xl shadow-sm p-6">
          <h3 className="text-sm font-bold text-slate-800 mb-4">Collection Trend (Last 12 Months)</h3>
          <div className="overflow-x-auto">
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={collectionTrend}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="month" tick={{ fontSize: 11 }} stroke="#94a3b8" />
                <YAxis tick={{ fontSize: 11 }} stroke="#94a3b8" />
                <Tooltip formatter={(v: number) => fmt$(v)} />
                <Legend />
                <Bar dataKey="principal" stackId="a" fill={NAVY} name="Principal" />
                <Bar dataKey="interest" stackId="a" fill={BLUE} name="Interest" />
                <Bar dataKey="late_fees" stackId="a" fill={RED} name="Late Fees" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      ) : (
        <div className="bg-white rounded-xl shadow-sm p-6 text-sm text-slate-500 text-center">No collection data available</div>
      )}

      {/* CFDs by Status + Fee Summary */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {statusBreakdown.length > 0 ? (
          <div className="bg-white rounded-xl shadow-sm p-6">
            <h3 className="text-sm font-bold text-slate-800 mb-4">CFDs by Status</h3>
            <ResponsiveContainer width="100%" height={280}>
              <PieChart>
                <Pie data={statusBreakdown} dataKey="count" nameKey="status" cx="50%" cy="50%" innerRadius={60} outerRadius={100} paddingAngle={2} label={({ status }: { status: string }) => status}>
                  {statusBreakdown.map((s: any, i: number) => (
                    <Cell key={i} fill={STATUS_COLORS[s.status] ?? STATUS_COLORS.other} />
                  ))}
                </Pie>
                <Tooltip />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <div className="bg-white rounded-xl shadow-sm p-6 text-sm text-slate-500 text-center">No status data available</div>
        )}

        <div className="bg-white rounded-xl shadow-sm p-6">
          <h3 className="text-sm font-bold text-slate-800 mb-4">Fee Summary</h3>
          <div className="space-y-4 mt-6">
            <div className="flex justify-between items-center py-2 border-b border-slate-100">
              <span className="text-sm text-slate-600">Servicing Fees Collected</span>
              <span className="text-sm font-bold text-slate-800">{fmt$(overview.servicing_fees_collected)}</span>
            </div>
            <div className="flex justify-between items-center py-2 border-b border-slate-100">
              <span className="text-sm text-slate-600">Investor Distributions</span>
              <span className="text-sm font-bold text-slate-800">{fmt$(overview.investor_distributions)}</span>
            </div>
            <div className="flex justify-between items-center py-2">
              <span className="text-sm font-semibold text-slate-800">Net to Entity</span>
              <span className="text-lg font-bold text-[#1B3A6B]">
                {fmt$((overview.servicing_fees_collected ?? 0) - (overview.investor_distributions ?? 0))}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Payments Table */}
      <div className="bg-white rounded-xl shadow-sm">
        <div className="flex items-center justify-between px-6 pt-5 pb-3">
          <h3 className="text-sm font-bold text-slate-800">Payments</h3>
          <button onClick={handleExport} disabled={exporting} className="px-3 py-1.5 text-xs border border-[#1B3A6B] text-[#1B3A6B] rounded-lg hover:bg-slate-50 disabled:opacity-50">
            {exporting ? 'Exporting...' : 'Export CSV'}
          </button>
        </div>
        {payments.length > 0 ? (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 border-b">
                  <tr>
                    {['Date', 'Account #', 'Amount', 'Principal', 'Interest', 'Late Fee', 'Method', 'Status'].map((h) => (
                      <th key={h} className="text-left px-6 py-3 text-xs font-semibold text-slate-500 uppercase whitespace-nowrap">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {paged.map((p: any, i: number) => (
                    <tr key={i} className="border-b last:border-0 hover:bg-slate-50">
                      <td className="px-6 py-3 text-slate-600 whitespace-nowrap">{p.date}</td>
                      <td className="px-6 py-3 text-slate-800 font-medium">{p.account_number}</td>
                      <td className="px-6 py-3 text-slate-600">{fmt$(p.amount)}</td>
                      <td className="px-6 py-3 text-slate-600">{fmt$(p.principal)}</td>
                      <td className="px-6 py-3 text-slate-600">{fmt$(p.interest)}</td>
                      <td className="px-6 py-3 text-slate-600">{fmt$(p.late_fee)}</td>
                      <td className="px-6 py-3 text-slate-600">{p.method ?? '—'}</td>
                      <td className="px-6 py-3">
                        <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                          p.status === 'completed' ? 'bg-green-100 text-green-700' :
                          p.status === 'failed' ? 'bg-red-100 text-red-700' :
                          'bg-slate-100 text-slate-600'
                        }`}>{p.status}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {totalPages > 1 && (
              <div className="flex items-center justify-between px-6 py-3 border-t border-slate-100">
                <span className="text-xs text-slate-500">Page {page + 1} of {totalPages}</span>
                <div className="flex gap-2">
                  <button onClick={() => setPage((p) => Math.max(0, p - 1))} disabled={page === 0} className="px-3 py-1 text-xs border rounded-md disabled:opacity-40">Prev</button>
                  <button onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))} disabled={page >= totalPages - 1} className="px-3 py-1 text-xs border rounded-md disabled:opacity-40">Next</button>
                </div>
              </div>
            )}
          </>
        ) : (
          <div className="px-6 py-12 text-sm text-slate-500 text-center">No payment data available</div>
        )}
      </div>
    </div>
  )
}
