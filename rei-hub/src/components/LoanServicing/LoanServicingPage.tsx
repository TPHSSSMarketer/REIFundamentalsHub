import { useState, useEffect } from 'react'
import { getCurrentUser } from '@/services/auth'
import PropertiesTab from './tabs/PropertiesTab'
import ContractsTab from './tabs/ContractsTab'
import PaymentsTab from './tabs/PaymentsTab'
import InvestorsTab from './tabs/InvestorsTab'
import DistributionsTab from './tabs/DistributionsTab'
import LoanServicingOnboarding from '../Onboarding/LoanServicingOnboarding'

const TABS = [
  { id: 'properties', label: '\u{1F3E0} Properties', short: 'Props' },
  { id: 'contracts', label: '\u{1F4CB} Contracts', short: 'CFDs' },
  { id: 'payments', label: '\u{1F4B0} Payments', short: 'Pmts' },
  { id: 'investors', label: '\u{1F465} Investors', short: 'Investors' },
  { id: 'distributions', label: '\u{1F4CA} Distributions', short: 'Dist' },
] as const

export default function LoanServicingPage() {
  const [activeTab, setActiveTab] = useState<string>('properties')
  const [user, setUser] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [showOnboarding, setShowOnboarding] = useState(false)

  useEffect(() => {
    getCurrentUser()
      .then((u) => {
        setUser(u)
        if (u?.loan_servicing_enabled === true && u?.loan_servicing_onboarding_complete === false) {
          setShowOnboarding(true)
        }
      })
      .catch(() => setUser(null))
      .finally(() => setLoading(false))
  }, [])

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="w-10 h-10 border-4 border-[#1B3A6B] border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  const isSuperAdmin = !!user?.is_superadmin

  if (!user?.loan_servicing_enabled && !isSuperAdmin) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="bg-white rounded-xl shadow p-8 max-w-sm text-center">
          <p className="text-4xl mb-3">{'\u{1F512}'}</p>
          <h2 className="text-lg font-bold text-slate-800 mb-2">Loan Servicing</h2>
          <p className="text-sm text-slate-600">
            This feature is not enabled for your account. Contact your administrator to enable access.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-0">
      {showOnboarding && (
        <LoanServicingOnboarding onComplete={() => setShowOnboarding(false)} />
      )}

      {/* Header */}
      <div className="bg-[#1B3A6B] rounded-t-xl px-6 py-5">
        <h1 className="text-xl font-bold text-white">Loan Servicing</h1>
        <p className="text-sm text-blue-200">Contract for Deed Management</p>
      </div>

      {/* Tab Bar */}
      <div className="bg-white border-b border-slate-200 overflow-x-auto">
        <div className="flex">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`px-4 py-3 text-sm font-medium whitespace-nowrap border-b-2 transition-colors ${
                activeTab === tab.id
                  ? 'border-[#1B3A6B] text-[#1B3A6B] font-bold'
                  : 'border-transparent text-slate-500 hover:text-slate-700'
              }`}
            >
              <span className="hidden sm:inline">{tab.label}</span>
              <span className="sm:hidden">{tab.short}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Tab Content */}
      <div className="p-4 md:p-6">
        {activeTab === 'properties' && (
          <PropertiesTab isSuperAdmin={isSuperAdmin} onNavigateContracts={() => setActiveTab('contracts')} />
        )}
        {activeTab === 'contracts' && <ContractsTab isSuperAdmin={isSuperAdmin} />}
        {activeTab === 'payments' && <PaymentsTab />}
        {activeTab === 'investors' && <InvestorsTab isSuperAdmin={isSuperAdmin} />}
        {activeTab === 'distributions' && <DistributionsTab isSuperAdmin={isSuperAdmin} />}
      </div>
    </div>
  )
}
