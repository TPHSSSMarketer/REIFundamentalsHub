import { useState, useEffect } from 'react'
import { BarChart3, TrendingUp, Target, DollarSign, Loader2 } from 'lucide-react'

interface SourceStat {
  source: string
  totalDeals: number
  totalValue: number
  wonDeals: number
  wonValue: number
  avgOfferPrice: number
  conversionRate: number
}

interface CampaignStat {
  campaignId: string
  campaignName: string
  campaignType: string
  source: string
  totalDeals: number
  wonDeals: number
  totalValue: number
}

interface AnalyticsData {
  sources: SourceStat[]
  campaigns: CampaignStat[]
  totalDeals: number
  totalWon: number
  totalValue: number
}

const SOURCE_LABELS: Record<string, string> = {
  driving_for_dollars: 'Driving for Dollars',
  direct_mail: 'Direct Mail',
  cold_calling: 'Cold Calling',
  phone_call: 'Phone Call (Inbound)',
  sms_campaign: 'SMS Campaign',
  website: 'Website / LeadHub',
  referral: 'Referral',
  wholesaler: 'Wholesaler',
  mls: 'MLS',
  auction: 'Auction',
  bandit_signs: 'Bandit Signs',
  door_knocking: 'Door Knocking',
  social_media: 'Social Media',
  probate: 'Probate / Court Records',
  tax_lien: 'Tax Lien List',
  code_violation: 'Code Violation List',
  networking: 'Networking / REIA',
  other: 'Other',
  unknown: 'Unknown',
}

function formatCurrency(val: number): string {
  if (val >= 1_000_000) return `$${(val / 1_000_000).toFixed(1)}M`
  if (val >= 1_000) return `$${(val / 1_000).toFixed(0)}K`
  return `$${val.toFixed(0)}`
}

export default function MarketingSourceKPIs() {
  const [data, setData] = useState<AnalyticsData | null>(null)
  const [loading, setLoading] = useState(true)
  const [showCampaigns, setShowCampaigns] = useState(false)

  useEffect(() => {
    const BASE_URL = import.meta.env.VITE_API_URL || ''
    const token = localStorage.getItem('rei_token')
    fetch(`${BASE_URL}/api/crm/deals/source-analytics`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => setData(d))
      .catch(() => setData(null))
      .finally(() => setLoading(false))
  }, [])

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-6 h-6 animate-spin text-primary-500" />
      </div>
    )
  }

  if (!data || data.sources.length === 0) {
    return (
      <div className="text-center py-8 text-slate-400">
        <BarChart3 className="w-10 h-10 mx-auto mb-2 opacity-50" />
        <p>No deal data yet. Start adding deals to see marketing analytics.</p>
      </div>
    )
  }

  const maxDeals = Math.max(...data.sources.map((s) => s.totalDeals))

  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-white rounded-xl border border-slate-200 p-4">
          <div className="flex items-center gap-2 text-slate-500 text-xs mb-1">
            <Target className="w-3.5 h-3.5" />
            Total Deals
          </div>
          <p className="text-2xl font-bold text-slate-800">{data.totalDeals}</p>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 p-4">
          <div className="flex items-center gap-2 text-slate-500 text-xs mb-1">
            <TrendingUp className="w-3.5 h-3.5" />
            Deals Won
          </div>
          <p className="text-2xl font-bold text-green-600">{data.totalWon}</p>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 p-4">
          <div className="flex items-center gap-2 text-slate-500 text-xs mb-1">
            <DollarSign className="w-3.5 h-3.5" />
            Total Value
          </div>
          <p className="text-2xl font-bold text-slate-800">{formatCurrency(data.totalValue)}</p>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 p-4">
          <div className="flex items-center gap-2 text-slate-500 text-xs mb-1">
            <BarChart3 className="w-3.5 h-3.5" />
            Conversion Rate
          </div>
          <p className="text-2xl font-bold text-primary-600">
            {data.totalDeals > 0 ? ((data.totalWon / data.totalDeals) * 100).toFixed(1) : 0}%
          </p>
        </div>
      </div>

      {/* Source Breakdown Table */}
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-100">
          <h3 className="font-semibold text-slate-800">Lead Source Performance</h3>
          <p className="text-xs text-slate-400 mt-0.5">
            Where your deals are coming from and how they convert
          </p>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-50 text-slate-500 text-xs uppercase tracking-wide">
                <th className="text-left px-5 py-3">Source</th>
                <th className="text-right px-4 py-3">Deals</th>
                <th className="text-right px-4 py-3">Won</th>
                <th className="text-right px-4 py-3">Conv %</th>
                <th className="text-right px-4 py-3">Total Value</th>
                <th className="text-right px-4 py-3">Won Value</th>
                <th className="px-5 py-3 w-40"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {data.sources.map((s) => (
                <tr key={s.source} className="hover:bg-slate-50 transition-colors">
                  <td className="px-5 py-3 font-medium text-slate-800">
                    {SOURCE_LABELS[s.source] || s.source}
                  </td>
                  <td className="text-right px-4 py-3 text-slate-600">{s.totalDeals}</td>
                  <td className="text-right px-4 py-3 text-green-600 font-medium">{s.wonDeals}</td>
                  <td className="text-right px-4 py-3">
                    <span
                      className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                        s.conversionRate >= 30
                          ? 'bg-green-100 text-green-700'
                          : s.conversionRate >= 15
                            ? 'bg-amber-100 text-amber-700'
                            : 'bg-slate-100 text-slate-600'
                      }`}
                    >
                      {s.conversionRate}%
                    </span>
                  </td>
                  <td className="text-right px-4 py-3 text-slate-600">{formatCurrency(s.totalValue)}</td>
                  <td className="text-right px-4 py-3 text-green-600 font-medium">
                    {formatCurrency(s.wonValue)}
                  </td>
                  <td className="px-5 py-3">
                    {/* Visual bar */}
                    <div className="w-full bg-slate-100 rounded-full h-2">
                      <div
                        className="bg-primary-500 rounded-full h-2 transition-all"
                        style={{ width: `${(s.totalDeals / maxDeals) * 100}%` }}
                      />
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Campaign Breakdown (toggle) */}
      {data.campaigns.length > 0 && (
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          <button
            onClick={() => setShowCampaigns(!showCampaigns)}
            className="w-full flex items-center justify-between px-5 py-4 text-left hover:bg-slate-50 transition-colors"
          >
            <div>
              <h3 className="font-semibold text-slate-800">Campaign Breakdown</h3>
              <p className="text-xs text-slate-400 mt-0.5">
                {data.campaigns.length} campaign{data.campaigns.length !== 1 ? 's' : ''} linked to deals
              </p>
            </div>
            <span className="text-xs text-primary-500 font-medium">
              {showCampaigns ? 'Hide' : 'Show'}
            </span>
          </button>

          {showCampaigns && (
            <div className="border-t border-slate-100 overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-slate-50 text-slate-500 text-xs uppercase tracking-wide">
                    <th className="text-left px-5 py-3">Campaign</th>
                    <th className="text-left px-4 py-3">Type</th>
                    <th className="text-left px-4 py-3">Source</th>
                    <th className="text-right px-4 py-3">Deals</th>
                    <th className="text-right px-4 py-3">Won</th>
                    <th className="text-right px-5 py-3">Value</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {data.campaigns.map((c) => (
                    <tr key={c.campaignId} className="hover:bg-slate-50">
                      <td className="px-5 py-3 font-medium text-slate-800">{c.campaignName}</td>
                      <td className="px-4 py-3">
                        <span
                          className={`px-2 py-0.5 rounded text-xs font-medium ${
                            c.campaignType === 'sms'
                              ? 'bg-blue-100 text-blue-700'
                              : c.campaignType === 'email'
                                ? 'bg-purple-100 text-purple-700'
                                : 'bg-slate-100 text-slate-600'
                          }`}
                        >
                          {c.campaignType === 'sms' ? 'SMS' : c.campaignType === 'email' ? 'Email' : c.campaignType}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-slate-500">
                        {SOURCE_LABELS[c.source] || c.source}
                      </td>
                      <td className="text-right px-4 py-3 text-slate-600">{c.totalDeals}</td>
                      <td className="text-right px-4 py-3 text-green-600 font-medium">{c.wonDeals}</td>
                      <td className="text-right px-5 py-3 text-slate-600">{formatCurrency(c.totalValue)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
