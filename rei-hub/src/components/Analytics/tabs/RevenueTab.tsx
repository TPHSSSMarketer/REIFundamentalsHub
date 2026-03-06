import { useState, useEffect } from 'react'
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
  PieChart, Pie, Cell,
  BarChart, Bar,
} from 'recharts'
import { getRevenueOverview, getRevenueSubscribers } from '../../../services/analyticsApi'

interface Props { period: string; startDate: string; endDate: string }

const NAVY = '#1B3A6B'
const RED = '#CC2229'
const GREEN = '#16a34a'
const PLAN_COLORS = [NAVY, GREEN, '#f59e0b', '#8b5cf6', '#06b6d4', '#ec4899', '#64748b', RED]
const PAGE_SIZE = 20

function fmt$(n: number) { return '$' + (n ?? 0).toLocaleString(undefined, { maximumFractionDigits: 0 }) }
function fmtPct(n: number) { return (n ?? 0).toFixed(1) + '%' }

function buildParams(period: string, startDate: string, endDate: string): Record<string, string> {
  const p: Record<string, string> = { period }
  if (period === 'custom' && startDate) p.start_date = startDate
  if (period === 'custom' && endDate) p.end_date = endDate
  return p
}

export default function RevenueTab({ period, startDate, endDate }: Props) {
  const [loading, setLoading] = useState(true)
  const [overview, setOverview] = useState<any>(null)
  const [subscribers, setSubscribers] = useState<any[]>([])
  const [page, setPage] = useState(0)

  useEffect(() => {
    let cancelled = false
    async function load() {
      setLoading(true)
      const params = buildParams(period, startDate, endDate)
      try {
        const [ov, subs] = await Promise.all([
          getRevenueOverview(params),
          getRevenueSubscribers(params),
        ])
        if (cancelled) return
        setOverview(ov)
        setSubscribers(Array.isArray(subs) ? subs : (subs as any)?.data ?? [])
        setPage(0)
      } catch { /* handled by auth */ }
      if (!cancelled) setLoading(false)
    }
    load()
    return () => { cancelled = true }
  }, [period, startDate, endDate])

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-4">
          {Array.from({ length: 7 }).map((_, i) => (
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
    { label: 'MRR', value: fmt$(overview.mrr) },
    { label: 'ARR', value: fmt$(overview.arr) },
    { label: 'Active Subscribers', value: (overview.active_subscribers ?? 0).toLocaleString() },
    { label: `New (${period})`, value: (overview.new_subscribers ?? 0).toLocaleString() },
    { label: `Churned (${period})`, value: (overview.churned ?? 0).toLocaleString() },
    { label: 'Churn Rate', value: fmtPct(overview.churn_rate) },
    { label: 'ARPU', value: fmt$(overview.arpu) },
  ]

  const revenueTrend: any[] = Array.isArray(overview.revenue_trend) ? overview.revenue_trend : []
  const byPlan: any[] = Array.isArray(overview.by_plan) ? overview.by_plan : []
  const featureAdoption: any[] = Array.isArray(overview.feature_adoption) ? overview.feature_adoption : []
  const paged = subscribers.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE)
  const totalPages = Math.max(1, Math.ceil(subscribers.length / PAGE_SIZE))

  return (
    <div className="space-y-6">
      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-4">
        {kpis.map((k) => (
          <div key={k.label} className="bg-white rounded-xl border-l-4 border-[#1B3A6B] shadow-sm p-4">
            <p className="text-xs text-slate-500 mb-1">{k.label}</p>
            <p className="text-lg font-bold text-slate-800">{k.value}</p>
          </div>
        ))}
      </div>

      {/* Revenue Trend */}
      {revenueTrend.length > 0 ? (
        <div className="bg-white rounded-xl shadow-sm p-6">
          <h3 className="text-sm font-bold text-slate-800 mb-4">Revenue Trend (Last 12 Months)</h3>
          <div className="overflow-x-auto">
            <ResponsiveContainer width="100%" height={280}>
              <LineChart data={revenueTrend}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="month" tick={{ fontSize: 11 }} stroke="#94a3b8" />
                <YAxis yAxisId="left" tick={{ fontSize: 11 }} stroke="#94a3b8" />
                <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 11 }} stroke="#94a3b8" />
                <Tooltip />
                <Legend />
                <Line yAxisId="left" type="monotone" dataKey="mrr" stroke={NAVY} name="MRR" strokeWidth={2} dot={false} />
                <Line yAxisId="right" type="monotone" dataKey="new_subscribers" stroke={GREEN} name="New Subscribers" strokeWidth={2} dot={false} />
                <Line yAxisId="right" type="monotone" dataKey="churned" stroke={RED} name="Churned" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      ) : (
        <div className="bg-white rounded-xl shadow-sm p-6 text-sm text-slate-500 text-center">No revenue trend data available</div>
      )}

      {/* Revenue by Plan + Feature Adoption */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {byPlan.length > 0 ? (
          <div className="bg-white rounded-xl shadow-sm p-6">
            <h3 className="text-sm font-bold text-slate-800 mb-4">Revenue by Plan</h3>
            <ResponsiveContainer width="100%" height={280}>
              <PieChart>
                <Pie data={byPlan} dataKey="mrr" nameKey="plan" cx="50%" cy="50%" innerRadius={60} outerRadius={100} paddingAngle={2} label={({ plan, count }: { plan: string; count: number }) => `${plan} (${count})`}>
                  {byPlan.map((_: any, i: number) => (
                    <Cell key={i} fill={PLAN_COLORS[i % PLAN_COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip formatter={(v: number) => fmt$(v)} />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <div className="bg-white rounded-xl shadow-sm p-6 text-sm text-slate-500 text-center">No plan data available</div>
        )}

        {featureAdoption.length > 0 ? (
          <div className="bg-white rounded-xl shadow-sm p-6">
            <h3 className="text-sm font-bold text-slate-800 mb-4">Feature Adoption</h3>
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={featureAdoption} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis type="number" tick={{ fontSize: 11 }} stroke="#94a3b8" />
                <YAxis dataKey="feature" type="category" tick={{ fontSize: 11 }} stroke="#94a3b8" width={150} />
                <Tooltip />
                <Bar dataKey="users" fill={NAVY} name="Users" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <div className="bg-white rounded-xl shadow-sm p-6 text-sm text-slate-500 text-center">No feature adoption data available</div>
        )}
      </div>

      {/* Subscribers Table */}
      <div className="bg-white rounded-xl shadow-sm">
        <div className="flex items-center justify-between px-6 pt-5 pb-3">
          <h3 className="text-sm font-bold text-slate-800">Subscribers</h3>
          <button disabled className="px-3 py-1.5 text-xs border border-slate-300 text-slate-400 rounded-lg cursor-not-allowed">
            Export CSV (Coming Soon)
          </button>
        </div>
        {subscribers.length > 0 ? (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 border-b">
                  <tr>
                    {['Email', 'Plan', 'Since', 'MRR', 'Loan Srv', 'Bank Neg', 'Last Active'].map((h) => (
                      <th key={h} className="text-left px-6 py-3 text-xs font-semibold text-slate-500 uppercase whitespace-nowrap">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {paged.map((s: any, i: number) => (
                    <tr key={i} className="border-b last:border-0 hover:bg-slate-50">
                      <td className="px-6 py-3 text-slate-800 font-medium">{s.email}</td>
                      <td className="px-6 py-3 text-slate-600">{s.plan}</td>
                      <td className="px-6 py-3 text-slate-600 whitespace-nowrap">{s.since}</td>
                      <td className="px-6 py-3 text-slate-600">{fmt$(s.mrr)}</td>
                      <td className="px-6 py-3">
                        {s.loan_servicing
                          ? <span className="text-green-600 font-bold">&#10003;</span>
                          : <span className="text-slate-300">&mdash;</span>}
                      </td>
                      <td className="px-6 py-3">
                        {s.bank_negotiation
                          ? <span className="text-green-600 font-bold">&#10003;</span>
                          : <span className="text-slate-300">&mdash;</span>}
                      </td>
                      <td className="px-6 py-3 text-slate-600 whitespace-nowrap">{s.last_active}</td>
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
          <div className="px-6 py-12 text-sm text-slate-500 text-center">No subscriber data available</div>
        )}
      </div>
    </div>
  )
}
