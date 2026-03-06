import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from 'recharts'
import { getNegotiationsOverview, exportNegotiations } from '../../../services/analyticsApi'

interface Props { period: string; startDate: string; endDate: string }

const NAVY = '#1B3A6B'
const RED = '#CC2229'
const GREEN = '#16a34a'

function fmtPct(n: number) { return (n ?? 0).toFixed(1) + '%' }

function buildParams(period: string, startDate: string, endDate: string): Record<string, string> {
  const p: Record<string, string> = { period }
  if (period === 'custom' && startDate) p.start_date = startDate
  if (period === 'custom' && endDate) p.end_date = endDate
  return p
}

export default function BankNegotiationAnalyticsTab({ period, startDate, endDate }: Props) {
  const navigate = useNavigate()
  const [loading, setLoading] = useState(true)
  const [overview, setOverview] = useState<any>(null)

  useEffect(() => {
    let cancelled = false
    async function load() {
      setLoading(true)
      const params = buildParams(period, startDate, endDate)
      try {
        const ov = await getNegotiationsOverview(params)
        if (cancelled) return
        setOverview(ov)
      } catch { /* handled by auth */ }
      if (!cancelled) setLoading(false)
    }
    load()
    return () => { cancelled = true }
  }, [period, startDate, endDate])

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
    { label: 'Active Negotiations', value: (overview.active_negotiations ?? 0).toLocaleString() },
    { label: 'Approved', value: (overview.approved ?? 0).toLocaleString() },
    { label: 'Denied', value: (overview.denied ?? 0).toLocaleString() },
    { label: 'Approval Rate', value: fmtPct(overview.approval_rate) },
    { label: `Letters Sent (${period})`, value: (overview.letters_sent ?? 0).toLocaleString() },
    { label: 'Delivery Rate', value: fmtPct(overview.delivery_rate) },
  ]

  const byType: any[] = Array.isArray(overview.by_type) ? overview.by_type : []
  const letterSeries: any[] = Array.isArray(overview.letter_series) ? overview.letter_series : []
  const byBank: any[] = Array.isArray(overview.by_bank) ? overview.by_bank.slice(0, 10) : []

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

      {/* By Type + Letter Series */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {byType.length > 0 ? (
          <div className="bg-white rounded-xl shadow-sm p-6">
            <h3 className="text-sm font-bold text-slate-800 mb-4">By Negotiation Type</h3>
            <div className="overflow-x-auto">
              <ResponsiveContainer width="100%" height={280}>
                <BarChart data={byType}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis dataKey="type" tick={{ fontSize: 11 }} stroke="#94a3b8" />
                  <YAxis tick={{ fontSize: 11 }} stroke="#94a3b8" />
                  <Tooltip />
                  <Legend />
                  <Bar dataKey="total" fill={NAVY} name="Total" />
                  <Bar dataKey="approved" fill={GREEN} name="Approved" />
                  <Bar dataKey="denied" fill={RED} name="Denied" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        ) : (
          <div className="bg-white rounded-xl shadow-sm p-6 text-sm text-slate-500 text-center">No negotiation type data available</div>
        )}

        {letterSeries.length > 0 ? (
          <div className="bg-white rounded-xl shadow-sm p-6">
            <h3 className="text-sm font-bold text-slate-800 mb-4">Letter Series Progress</h3>
            <div className="overflow-x-auto">
              <ResponsiveContainer width="100%" height={280}>
                <BarChart data={letterSeries}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis dataKey="letter" tick={{ fontSize: 11 }} stroke="#94a3b8" />
                  <YAxis tick={{ fontSize: 11 }} stroke="#94a3b8" />
                  <Tooltip />
                  <Bar dataKey="count" fill={NAVY} name="Sent" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        ) : (
          <div className="bg-white rounded-xl shadow-sm p-6 text-sm text-slate-500 text-center">No letter series data available</div>
        )}
      </div>

      {/* By Bank Table */}
      {byBank.length > 0 ? (
        <div className="bg-white rounded-xl shadow-sm">
          <div className="px-6 pt-5 pb-3">
            <h3 className="text-sm font-bold text-slate-800">By Bank (Top 10)</h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 border-b">
                <tr>
                  {['Bank Name', 'Count', 'Approved', 'Denied', 'Pending', 'Success Rate'].map((h) => (
                    <th key={h} className="text-left px-6 py-3 text-xs font-semibold text-slate-500 uppercase whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {byBank.map((b: any, i: number) => (
                  <tr key={i} className="border-b last:border-0 hover:bg-slate-50">
                    <td className="px-6 py-3 text-slate-800 font-medium">{b.bank_name}</td>
                    <td className="px-6 py-3 text-slate-600">{(b.count ?? 0).toLocaleString()}</td>
                    <td className="px-6 py-3 text-green-600 font-medium">{(b.approved ?? 0).toLocaleString()}</td>
                    <td className="px-6 py-3 text-red-600 font-medium">{(b.denied ?? 0).toLocaleString()}</td>
                    <td className="px-6 py-3 text-slate-600">{(b.pending ?? 0).toLocaleString()}</td>
                    <td className="px-6 py-3 text-slate-600">{fmtPct(b.success_rate)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <div className="bg-white rounded-xl shadow-sm p-6 text-sm text-slate-500 text-center">No bank data available</div>
      )}

      {/* Follow-up Status */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="bg-amber-50 border border-amber-200 rounded-xl shadow-sm p-6">
          <p className="text-xs text-amber-600 font-semibold uppercase tracking-wide mb-1">Pending Follow-ups (Next 7 Days)</p>
          <p className="text-3xl font-bold text-amber-700">{(overview.pending_followups ?? 0).toLocaleString()}</p>
          <p className="text-xs text-amber-500 mt-1">Action needed</p>
        </div>
        <div className="bg-red-50 border border-red-200 rounded-xl shadow-sm p-6">
          <p className="text-xs text-[#CC2229] font-semibold uppercase tracking-wide mb-1">Overdue Follow-ups</p>
          <p className="text-3xl font-bold text-[#CC2229]">{(overview.overdue_followups ?? 0).toLocaleString()}</p>
          <p className="text-xs text-red-400 mt-1">Past due</p>
        </div>
      </div>

      <div className="flex justify-center">
        <button
          onClick={() => navigate('/bank-negotiation?tab=followups')}
          className="px-5 py-2 text-sm font-medium bg-[#1B3A6B] text-white rounded-lg hover:bg-[#152e55] transition-colors"
        >
          Go to Follow-Ups
        </button>
      </div>
    </div>
  )
}
