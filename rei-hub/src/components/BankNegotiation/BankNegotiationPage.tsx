import { useState, useEffect } from 'react'
import { useSearchParams } from 'react-router-dom'
import { getCurrentUser } from '@/services/auth'
import NegotiationsTab from './tabs/NegotiationsTab'
import CorrespondenceTab from './tabs/CorrespondenceTab'
import FollowUpsTab from './tabs/FollowUpsTab'
import TrackingTab from './tabs/TrackingTab'

const TABS = [
  { id: 'negotiations', label: '\u{1F3E6} Negotiations', short: 'Negs' },
  { id: 'correspondence', label: '\u{1F4EC} Correspondence', short: 'Corr' },
  { id: 'followups', label: '\u{1F4C5} Follow-Ups', short: 'Follow' },
  { id: 'tracking', label: '\u{1F4CA} Tracking', short: 'Track' },
] as const

export default function BankNegotiationPage() {
  const [searchParams] = useSearchParams()
  const [activeTab, setActiveTab] = useState<string>('negotiations')
  const [user, setUser] = useState<Record<string, unknown> | null>(null)
  const [loading, setLoading] = useState(true)

  const preSelectedProperty = searchParams.get('property') || null
  const autoAddLender = searchParams.get('addLender') === 'true' && !!preSelectedProperty

  useEffect(() => {
    getCurrentUser()
      .then(setUser)
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

  if (!user?.bank_negotiation_enabled && !isSuperAdmin) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="bg-white rounded-xl shadow p-8 max-w-sm text-center">
          <p className="text-4xl mb-3">{'\u{1F512}'}</p>
          <h2 className="text-lg font-bold text-slate-800 mb-2">Bank Negotiation</h2>
          <p className="text-sm text-slate-600">
            Contact your administrator to enable this feature.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-0">
      {/* Header */}
      <div className="bg-[#1B3A6B] rounded-t-xl px-6 py-5">
        <h1 className="text-xl font-bold text-white">Bank Negotiation</h1>
        <p className="text-sm text-blue-200">Servicer Communication Management</p>
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
        {activeTab === 'negotiations' && (
          <NegotiationsTab
            isSuperAdmin={isSuperAdmin}
            preSelectedProperty={preSelectedProperty}
            autoAddLender={autoAddLender}
          />
        )}
        {activeTab === 'correspondence' && (
          <CorrespondenceTab />
        )}
        {activeTab === 'followups' && (
          <FollowUpsTab />
        )}
        {activeTab === 'tracking' && (
          <TrackingTab />
        )}
      </div>
    </div>
  )
}
