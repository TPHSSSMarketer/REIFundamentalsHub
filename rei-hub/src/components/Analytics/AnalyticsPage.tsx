import { useState, useEffect } from 'react'
import { getCurrentUser, getToken } from '@/services/auth'
import { useDemoMode } from '@/hooks/useDemoMode'
import OverviewTab from './tabs/OverviewTab'
import PipelineTab from './tabs/PipelineTab'
import PortfolioTab from './tabs/PortfolioTab'
import LoanServicingAnalyticsTab from './tabs/LoanServicingAnalyticsTab'
import BankNegotiationAnalyticsTab from './tabs/BankNegotiationAnalyticsTab'
import RevenueTab from './tabs/RevenueTab'

type Period = '30d' | '90d' | '1y' | 'this_month' | 'last_month' | 'ytd' | 'custom'

const PERIODS: { id: Period; label: string }[] = [
  { id: '30d', label: '30D' },
  { id: '90d', label: '90D' },
  { id: '1y', label: '1Y' },
  { id: 'this_month', label: 'This Month' },
  { id: 'last_month', label: 'Last Month' },
  { id: 'ytd', label: 'YTD' },
  { id: 'custom', label: 'Custom' },
]

interface TabDef {
  id: string
  label: string
  visible: (flags: { isSuperAdmin: boolean; loanEnabled: boolean; bankEnabled: boolean }) => boolean
}

const TABS: TabDef[] = [
  { id: 'overview', label: '\u{1F4CA} Overview', visible: () => true },
  { id: 'pipeline', label: '\u{1F3E0} Pipeline', visible: () => true },
  { id: 'portfolio', label: '\u{1F3D8}\uFE0F Portfolio', visible: () => true },
  {
    id: 'loan_servicing',
    label: '\u{1F4B0} Loan Servicing',
    visible: ({ loanEnabled, isSuperAdmin }) => loanEnabled || isSuperAdmin,
  },
  {
    id: 'bank_negotiation',
    label: '\u{1F3E6} Bank Negotiation',
    visible: ({ bankEnabled, isSuperAdmin }) => bankEnabled || isSuperAdmin,
  },
  {
    id: 'revenue',
    label: '\u{1F4B5} Revenue',
    visible: ({ isSuperAdmin }) => isSuperAdmin,
  },
]

export default function AnalyticsPage() {
  const { isDemoMode } = useDemoMode()
  const [activeTab, setActiveTab] = useState('overview')
  const [selectedPeriod, setSelectedPeriod] = useState<Period>('30d')
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [user, setUser] = useState<Record<string, unknown> | null>(null)
  const [token, setToken] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (isDemoMode) {
      setToken('demo-token')
      setUser({ is_superadmin: false, loan_servicing_enabled: false, bank_negotiation_enabled: false })
      setLoading(false)
      return
    }
    setToken(getToken())
    getCurrentUser()
      .then((u) => setUser(u))
      .catch(() => setUser(null))
      .finally(() => setLoading(false))
  }, [isDemoMode])

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="w-10 h-10 border-4 border-[#1B3A6B] border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  if (!token) return null

  const isSuperAdmin = !!user?.is_superadmin
  const loanEnabled = !!user?.loan_servicing_enabled
  const bankEnabled = !!user?.bank_negotiation_enabled

  const visibleTabs = TABS.filter((t) => t.visible({ isSuperAdmin, loanEnabled, bankEnabled }))

  return (
    <div className="space-y-0">
      {/* Header */}
      <div className="bg-[#1B3A6B] rounded-t-xl px-6 py-5">
        <h1 className="text-xl font-bold text-white">Analytics &amp; Reports</h1>
        <p className="text-sm text-blue-200">Performance insights for your business</p>
      </div>

      {/* Date Range Selector */}
      <div className="bg-white border-b border-slate-200 px-6 py-3">
        <div className="flex flex-wrap items-center gap-2">
          {PERIODS.map((p) => (
            <button
              key={p.id}
              onClick={() => setSelectedPeriod(p.id)}
              className={`px-3 py-1.5 text-xs font-medium rounded-md border transition-colors ${
                selectedPeriod === p.id
                  ? 'bg-[#1B3A6B] text-white border-[#1B3A6B]'
                  : 'bg-white text-slate-600 border-slate-300 hover:border-slate-400'
              }`}
            >
              {p.label}
            </button>
          ))}
          {selectedPeriod === 'custom' && (
            <div className="flex items-center gap-2 ml-2">
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="border border-slate-300 rounded-md px-2 py-1 text-xs"
              />
              <span className="text-xs text-slate-400">to</span>
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="border border-slate-300 rounded-md px-2 py-1 text-xs"
              />
            </div>
          )}
        </div>
      </div>

      {/* Tab Bar */}
      <div className="bg-white border-b border-slate-200 overflow-x-auto">
        <div className="flex">
          {visibleTabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`px-4 py-3 text-sm font-medium whitespace-nowrap border-b-2 transition-colors ${
                activeTab === tab.id
                  ? 'border-[#1B3A6B] text-[#1B3A6B] font-bold'
                  : 'border-transparent text-slate-500 hover:text-slate-700'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Tab Content */}
      <div className="p-4 md:p-6">
        {activeTab === 'overview' && (
          <OverviewTab token={token} period={selectedPeriod} startDate={startDate} endDate={endDate} isSuperAdmin={isSuperAdmin} loanServicingEnabled={loanEnabled} bankNegotiationEnabled={bankEnabled} />
        )}
        {activeTab === 'pipeline' && (
          <PipelineTab token={token} period={selectedPeriod} startDate={startDate} endDate={endDate} />
        )}
        {activeTab === 'portfolio' && (
          <PortfolioTab token={token} period={selectedPeriod} startDate={startDate} endDate={endDate} />
        )}
        {activeTab === 'loan_servicing' && (
          <LoanServicingAnalyticsTab token={token} period={selectedPeriod} startDate={startDate} endDate={endDate} />
        )}
        {activeTab === 'bank_negotiation' && (
          <BankNegotiationAnalyticsTab token={token} period={selectedPeriod} startDate={startDate} endDate={endDate} />
        )}
        {activeTab === 'revenue' && (
          <RevenueTab token={token} period={selectedPeriod} startDate={startDate} endDate={endDate} />
        )}
      </div>
    </div>
  )
}
