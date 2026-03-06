import { useState, useEffect } from 'react'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
  PieChart, Pie, Cell, Line, ComposedChart,
} from 'recharts'
import { getPortfolioOverview, getPortfolioProperties, exportPortfolio } from '../../../services/analyticsApi'

interface Props { period: string; startDate: string; endDate: string }

const NAVY = '#1B3A6B'
const PIE_COLORS = ['#1B3A6B', '#CC2229', '#16a34a', '#f59e0b', '#8b5cf6', '#06b6d4', '#ec4899', '#64748b']
const PAGE_SIZE = 20

function fmt$(n: number) { return '$' + (n ?? 0).toLocaleString(undefined, { maximumFractionDigits: 0 }) }

function buildParams(period: string, startDate: string, endDate: string): Record<string, string> {
  const p: Record<string, string> = { period }
  if (period === 'custom' && startDate) p.start_date = startDate
  if (period === 'custom' && endDate) p.end_date = endDate
  return p
}

export default function PortfolioTab({ period, startDate, endDate }: Props) {
  const [loading, setLoading] = useState(true)
  const [overview, setOverview] = useState<any>(null)
  const [properties, setProperties] = useState<any[]>([])
  const [page, setPage] = useState(0)
  const [exporting, setExporting] = useState(false)

  useEffect(() => {
    let cancelled = false
    async function load() {
      setLoading(true)
      const params = buildParams(period, startDate, endDate)
      try {
        const [ov, props] = await Promise.all([
          getPortfolioOverview(params),
          getPortfolioProperties(params),
        ])
        if (cancelled) return
        setOverview(ov)
        setProperties(Array.isArray(props) ? props : (props as any)?.properties ?? [])
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
      const blob = await exportPortfolio(buildParams(period, startDate, endDate))
      const url = URL.createObjectURL(blob as Blob)
      const a = document.createElement('a'); a.href = url; a.download = 'portfolio.csv'; a.click()
      URL.revokeObjectURL(url)
    } catch { /* */ }
    setExporting(false)
  }

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
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
    { label: 'Total Properties', value: (overview.total_properties ?? 0).toLocaleString() },
    { label: 'Portfolio Value', value: fmt$(overview.portfolio_value) },
    { label: 'Total Equity', value: fmt$(overview.total_equity) },
    { label: 'Avg Property Value', value: fmt$(overview.avg_property_value) },
  ]

  const byState: any[] = Array.isArray(overview.by_state) ? overview.by_state : []
  const byType: any[] = Array.isArray(overview.by_type) ? overview.by_type : []
  const acqTrend: any[] = Array.isArray(overview.acquisition_trend) ? overview.acquisition_trend : []

  const totalPages = Math.max(1, Math.ceil(properties.length / PAGE_SIZE))
  const paged = properties.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE)

  return (
    <div className="space-y-6">
      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {kpis.map((k) => (
          <div key={k.label} className="bg-white rounded-xl border-l-4 border-[#1B3A6B] shadow-sm p-4">
            <p className="text-xs text-slate-500 mb-1">{k.label}</p>
            <p className="text-lg font-bold text-slate-800">{k.value}</p>
          </div>
        ))}
      </div>

      {/* Charts row */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {byState.length > 0 && (
          <div className="bg-white rounded-xl shadow-sm p-6">
            <h3 className="text-sm font-bold text-slate-800 mb-4">Properties by State</h3>
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={byState}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="state" tick={{ fontSize: 11 }} stroke="#94a3b8" />
                <YAxis tick={{ fontSize: 11 }} stroke="#94a3b8" />
                <Tooltip />
                <Bar dataKey="count" fill={NAVY} radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}

        {byType.length > 0 && (
          <div className="bg-white rounded-xl shadow-sm p-6">
            <h3 className="text-sm font-bold text-slate-800 mb-4">Properties by Type</h3>
            <ResponsiveContainer width="100%" height={280}>
              <PieChart>
                <Pie data={byType} dataKey="count" nameKey="type" cx="50%" cy="50%" innerRadius={60} outerRadius={100} paddingAngle={2} label={({ type }: { type: string }) => type}>
                  {byType.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
                </Pie>
                <Tooltip />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>

      {/* Acquisition Trend */}
      {acqTrend.length > 0 && (
        <div className="bg-white rounded-xl shadow-sm p-6">
          <h3 className="text-sm font-bold text-slate-800 mb-4">Acquisition Trend (Last 12 Months)</h3>
          <div className="overflow-x-auto">
            <ResponsiveContainer width="100%" height={280}>
              <ComposedChart data={acqTrend}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="month" tick={{ fontSize: 11 }} stroke="#94a3b8" />
                <YAxis yAxisId="left" tick={{ fontSize: 11 }} stroke="#94a3b8" />
                <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 11 }} stroke="#94a3b8" />
                <Tooltip />
                <Legend />
                <Bar yAxisId="left" dataKey="acquired" fill={NAVY} name="Acquired" radius={[4, 4, 0, 0]} />
                <Line yAxisId="right" type="monotone" dataKey="cumulative_value" stroke="#CC2229" name="Cumulative Value" strokeWidth={2} dot={false} />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* Properties Table */}
      <div className="bg-white rounded-xl shadow-sm">
        <div className="flex items-center justify-between px-6 pt-5 pb-3">
          <h3 className="text-sm font-bold text-slate-800">Properties</h3>
          <button onClick={handleExport} disabled={exporting} className="px-3 py-1.5 text-xs border border-[#1B3A6B] text-[#1B3A6B] rounded-lg hover:bg-slate-50 disabled:opacity-50">
            {exporting ? 'Exporting...' : 'Export CSV'}
          </button>
        </div>
        {properties.length === 0 ? (
          <div className="px-6 pb-6 text-sm text-slate-500">No data available</div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 border-b">
                  <tr>
                    {['Address', 'State', 'Value', 'Equity', 'Status', 'Acquired'].map((h) => (
                      <th key={h} className="text-left px-6 py-3 text-xs font-semibold text-slate-500 uppercase whitespace-nowrap">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {paged.map((p: any, i: number) => (
                    <tr key={p.id || i} className="border-b last:border-0 hover:bg-slate-50">
                      <td className="px-6 py-3 text-slate-800 font-medium">{p.address}</td>
                      <td className="px-6 py-3 text-slate-600">{p.state}</td>
                      <td className="px-6 py-3 text-slate-600">{fmt$(p.value)}</td>
                      <td className="px-6 py-3 text-slate-600">{fmt$(p.equity)}</td>
                      <td className="px-6 py-3">
                        <span className={`px-2 py-0.5 text-xs font-semibold rounded-full ${
                          p.status === 'active' ? 'bg-green-100 text-green-800' : 'bg-slate-100 text-slate-600'
                        }`}>{p.status}</span>
                      </td>
                      <td className="px-6 py-3 text-slate-600">{p.acquired_date}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="flex items-center justify-between px-6 py-3 border-t">
              <span className="text-xs text-slate-500">
                Page {page + 1} of {totalPages} ({properties.length} total)
              </span>
              <div className="flex gap-2">
                <button onClick={() => setPage((p) => Math.max(0, p - 1))} disabled={page === 0} className="px-3 py-1.5 text-xs border border-slate-300 rounded-lg hover:bg-slate-50 disabled:opacity-40">
                  Prev
                </button>
                <button onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))} disabled={page >= totalPages - 1} className="px-3 py-1.5 text-xs border border-slate-300 rounded-lg hover:bg-slate-50 disabled:opacity-40">
                  Next
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
