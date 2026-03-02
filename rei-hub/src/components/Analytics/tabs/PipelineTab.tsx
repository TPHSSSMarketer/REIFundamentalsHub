import { useState, useEffect } from 'react'
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
  BarChart, Bar, PieChart, Pie, Cell,
} from 'recharts'
import { getPipelineOverview, getPipelineTrend, getPipelineFunnel, exportPipeline } from '../../../services/analyticsApi'

interface Props { period: string; startDate: string; endDate: string }

const NAVY = '#1B3A6B'
const RED = '#CC2229'
const GREEN = '#16a34a'
const PIE_COLORS = [NAVY, RED, GREEN, '#f59e0b', '#8b5cf6', '#06b6d4', '#ec4899', '#64748b']

function fmt$(n: number) { return '$' + (n ?? 0).toLocaleString(undefined, { maximumFractionDigits: 0 }) }

function buildParams(period: string, startDate: string, endDate: string): Record<string, string> {
  const p: Record<string, string> = { period }
  if (period === 'custom' && startDate) p.start_date = startDate
  if (period === 'custom' && endDate) p.end_date = endDate
  return p
}

export default function PipelineTab({ period, startDate, endDate }: Props) {
  const [loading, setLoading] = useState(true)
  const [overview, setOverview] = useState<any>(null)
  const [trend, setTrend] = useState<any[]>([])
  const [funnel, setFunnel] = useState<any>(null)
  const [exporting, setExporting] = useState(false)

  useEffect(() => {
    let cancelled = false
    async function load() {
      setLoading(true)
      const params = buildParams(period, startDate, endDate)
      try {
        const [ov, tr, fn] = await Promise.all([
          getPipelineOverview(params),
          getPipelineTrend(params),
          getPipelineFunnel(params),
        ])
        if (cancelled) return
        setOverview(ov)
        setTrend(Array.isArray(tr) ? tr : (tr as any)?.data ?? [])
        setFunnel(fn)
      } catch { /* handled by auth */ }
      if (!cancelled) setLoading(false)
    }
    load()
    return () => { cancelled = true }
  }, [period, startDate, endDate])

  async function handleExport() {
    setExporting(true)
    try {
      const blob = await exportPipeline(buildParams(period, startDate, endDate))
      const url = URL.createObjectURL(blob as Blob)
      const a = document.createElement('a'); a.href = url; a.download = 'pipeline.csv'; a.click()
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
    { label: 'Total Leads', value: (overview.total_leads ?? 0).toLocaleString() },
    { label: 'Active Deals', value: (overview.active_deals ?? 0).toLocaleString() },
    { label: 'Conversion Rate', value: (overview.conversion_rate ?? 0).toFixed(1) + '%' },
    { label: 'Avg Deal Size', value: fmt$(overview.avg_deal_size) },
    { label: 'Avg Days to Close', value: (overview.avg_days_to_close ?? 0).toLocaleString() },
    { label: 'Pipeline Value', value: fmt$(overview.pipeline_value) },
  ]

  const stages: any[] = Array.isArray(funnel?.stages) ? funnel.stages : []
  const sources: any[] = Array.isArray(funnel?.sources ?? overview?.sources) ? (funnel?.sources ?? overview?.sources) : []

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

      {/* Trend Chart */}
      {trend.length > 0 && (
        <div className="bg-white rounded-xl shadow-sm p-6">
          <h3 className="text-sm font-bold text-slate-800 mb-4">Pipeline Trend</h3>
          <div className="overflow-x-auto">
            <ResponsiveContainer width="100%" height={280}>
              <LineChart data={trend}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="date" tick={{ fontSize: 11 }} stroke="#94a3b8" />
                <YAxis tick={{ fontSize: 11 }} stroke="#94a3b8" />
                <Tooltip />
                <Legend />
                <Line type="monotone" dataKey="leads" stroke={NAVY} name="Leads" strokeWidth={2} dot={false} />
                <Line type="monotone" dataKey="deals_opened" stroke={GREEN} name="Deals Opened" strokeWidth={2} dot={false} />
                <Line type="monotone" dataKey="deals_closed" stroke={RED} name="Deals Closed" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* Funnel + Sources */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {stages.length > 0 && (
          <div className="bg-white rounded-xl shadow-sm p-6">
            <h3 className="text-sm font-bold text-slate-800 mb-4">Pipeline Funnel</h3>
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={stages} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis type="number" tick={{ fontSize: 11 }} stroke="#94a3b8" />
                <YAxis dataKey="stage" type="category" tick={{ fontSize: 11 }} stroke="#94a3b8" width={100} />
                <Tooltip />
                <Bar dataKey="count" fill={NAVY} radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}

        {sources.length > 0 && (
          <div className="bg-white rounded-xl shadow-sm p-6">
            <h3 className="text-sm font-bold text-slate-800 mb-4">Leads by Source</h3>
            <ResponsiveContainer width="100%" height={280}>
              <PieChart>
                <Pie data={sources} dataKey="count" nameKey="source" cx="50%" cy="50%" innerRadius={60} outerRadius={100} paddingAngle={2} label={({ source }: { source: string }) => source}>
                  {sources.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
                </Pie>
                <Tooltip />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>

      {/* Deals by Stage Table */}
      {stages.length > 0 && (
        <div className="bg-white rounded-xl shadow-sm">
          <div className="flex items-center justify-between px-6 pt-5 pb-3">
            <h3 className="text-sm font-bold text-slate-800">Deals by Stage</h3>
            <button onClick={handleExport} disabled={exporting} className="px-3 py-1.5 text-xs border border-[#1B3A6B] text-[#1B3A6B] rounded-lg hover:bg-slate-50 disabled:opacity-50">
              {exporting ? 'Exporting...' : 'Export CSV'}
            </button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 border-b">
                <tr>
                  {['Stage', 'Count', 'Total Value', 'Avg Value'].map((h) => (
                    <th key={h} className="text-left px-6 py-3 text-xs font-semibold text-slate-500 uppercase whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {stages.map((s: any, i: number) => (
                  <tr key={i} className="border-b last:border-0 hover:bg-slate-50">
                    <td className="px-6 py-3 text-slate-800 font-medium">{s.stage}</td>
                    <td className="px-6 py-3 text-slate-600">{(s.count ?? 0).toLocaleString()}</td>
                    <td className="px-6 py-3 text-slate-600">{fmt$(s.total_value)}</td>
                    <td className="px-6 py-3 text-slate-600">{fmt$(s.avg_value)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
