import { useState, useEffect, useMemo, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import {
  ArrowLeft,
  MapPin,
  User,
  Calendar,
  AlertTriangle,
  FileText,
  Shield,
  StickyNote,
  Calculator,
  BarChart3,
  Trash2,
  Plus,
  ExternalLink,
  Loader2,
  ClipboardList,
  ChevronDown,
  ChevronUp,
  Landmark,
  Receipt,
} from 'lucide-react'
import { toast } from 'sonner'
import { useDeal, useUpdateDeal, usePipelines } from '@/hooks/useApi'
import { formatCurrency, formatDate, cn } from '@/utils/helpers'
import { getAuthHeader, getToken } from '@/services/auth'
import { getNegotiationsForDeal } from '@/services/bankNegotiationApi'
import ContractChecklist from '@/components/Documents/ContractChecklist'
import DealAnalyzer from './DealAnalyzer'
import DealExpenditures from './DealExpenditures'
import type { Deal } from '@/types'

const BASE_URL = import.meta.env.VITE_REI_SERVER_URL ?? 'http://localhost:8001'

// ── Helpers ─────────────────────────────────────────────────────────

async function fetchDealDetail(dealId: string) {
  const res = await fetch(`${BASE_URL}/api/deals/${dealId}`, {
    headers: getAuthHeader(),
  })
  if (!res.ok) return null
  return res.json()
}

async function addDealNote(dealId: string, content: string) {
  const res = await fetch(`${BASE_URL}/api/deals/${dealId}/notes`, {
    method: 'POST',
    headers: { ...getAuthHeader(), 'Content-Type': 'application/json' },
    body: JSON.stringify({ content }),
  })
  if (!res.ok) throw new Error('Failed to add note')
  return res.json()
}

async function deleteDealNote(dealId: string, noteId: string) {
  const res = await fetch(`${BASE_URL}/api/deals/${dealId}/notes/${noteId}`, {
    method: 'DELETE',
    headers: getAuthHeader(),
  })
  if (!res.ok) throw new Error('Failed to delete note')
  return res.json()
}

// ── Stage config ────────────────────────────────────────────────────

const STAGE_CONFIG: Record<string, { label: string; color: string; bg: string }> = {
  lead: { label: 'New Lead', color: 'text-blue-700', bg: 'bg-blue-100' },
  analysis: { label: 'Analysis', color: 'text-purple-700', bg: 'bg-purple-100' },
  offer: { label: 'Offer Made', color: 'text-amber-700', bg: 'bg-amber-100' },
  under_contract: { label: 'Under Contract', color: 'text-orange-700', bg: 'bg-orange-100' },
  due_diligence: { label: 'Due Diligence', color: 'text-cyan-700', bg: 'bg-cyan-100' },
  closing: { label: 'Closing', color: 'text-indigo-700', bg: 'bg-indigo-100' },
  closed_won: { label: 'Closed Won', color: 'text-green-700', bg: 'bg-green-100' },
  closed_lost: { label: 'Closed Lost', color: 'text-red-700', bg: 'bg-red-100' },
}

const STAGE_ORDER = ['lead', 'analysis', 'offer', 'under_contract', 'due_diligence', 'closing', 'closed_won', 'closed_lost']

const TABS = [
  { id: 'overview', label: 'Overview', icon: BarChart3 },
  { id: 'expenditures', label: 'Expenditures', icon: Receipt },
  { id: 'checklist', label: 'Contracts & Checklist', icon: ClipboardList },
  { id: 'analyzer', label: 'Deal Analyzer', icon: Calculator },
  { id: 'documents', label: 'Documents', icon: FileText },
  { id: 'pof', label: 'Proof of Funds', icon: Shield },
  { id: 'notes', label: 'Notes', icon: StickyNote },
] as const

type TabId = (typeof TABS)[number]['id']

// ── Main Component ──────────────────────────────────────────────────

export default function DealDetailPage() {
  const { dealId } = useParams<{ dealId: string }>()
  const navigate = useNavigate()
  const { data: deal, isLoading: dealLoading } = useDeal(dealId || '')
  const updateDeal = useUpdateDeal()
  const { data: pipelines } = usePipelines()

  const [activeTab, setActiveTab] = useState<TabId>('overview')
  const [backendData, setBackendData] = useState<any>(null)
  const [backendLoading, setBackendLoading] = useState(true)

  // Notes
  const [newNote, setNewNote] = useState('')
  const [addingNote, setAddingNote] = useState(false)

  // Deal Analyzer preferences
  const [analyzerPreferences, setAnalyzerPreferences] = useState<any>(null)

  // Bank Negotiations
  const [lenderData, setLenderData] = useState<any>(null)
  const [lenderLoading, setLenderLoading] = useState(false)
  const [lendersExpanded, setLendersExpanded] = useState(false)

  // Get pipeline stages for stage selector
  const stages = useMemo(() => {
    if (!pipelines?.length) return STAGE_ORDER.map(id => ({ id, name: STAGE_CONFIG[id]?.label || id }))
    return pipelines[0].stages.sort((a, b) => a.order - b.order)
  }, [pipelines])

  // Load backend data
  const loadBackendData = useCallback(async () => {
    if (!dealId) return
    setBackendLoading(true)
    try {
      const data = await fetchDealDetail(dealId)
      setBackendData(data)
    } catch {
      // ignore
    } finally {
      setBackendLoading(false)
    }
  }, [dealId])

  useEffect(() => {
    loadBackendData()
  }, [loadBackendData])

  // Fetch bank negotiation lender data for this deal's property
  useEffect(() => {
    if (!deal?.address) return
    const token = getToken()
    if (!token) return
    setLenderLoading(true)
    getNegotiationsForDeal(token, deal.address)
      .then((data) => setLenderData(data))
      .catch(() => setLenderData(null))
      .finally(() => setLenderLoading(false))
  }, [deal?.address])

  // Fetch analyzer preferences
  useEffect(() => {
    async function fetchPrefs() {
      try {
        const res = await fetch(`${BASE_URL}/api/deals/analyzer/preferences`, {
          headers: getAuthHeader(),
        })
        if (res.ok) {
          const data = await res.json()
          setAnalyzerPreferences(data)
        }
      } catch {
        // use defaults
      }
    }
    fetchPrefs()
  }, [])

  // ── Handlers ───────────────────────────────────────────────

  const handleStageChange = (stageId: string) => {
    if (!deal) return
    updateDeal.mutate({ id: deal.id, data: { stage: stageId as Deal['stage'] } })
  }

  const handleAddNote = async () => {
    if (!dealId || !newNote.trim()) return
    setAddingNote(true)
    try {
      await addDealNote(dealId, newNote.trim())
      setNewNote('')
      await loadBackendData()
      toast.success('Note added')
    } catch {
      toast.error('Failed to add note')
    } finally {
      setAddingNote(false)
    }
  }

  const handleDeleteNote = async (noteId: string) => {
    if (!dealId) return
    try {
      await deleteDealNote(dealId, noteId)
      await loadBackendData()
      toast.success('Note deleted')
    } catch {
      toast.error('Failed to delete note')
    }
  }

  // ── Loading ────────────────────────────────────────────────

  if (dealLoading) {
    return (
      <div className="flex items-center justify-center h-96">
        <Loader2 className="w-8 h-8 animate-spin text-primary-500" />
      </div>
    )
  }

  if (!deal) {
    return (
      <div className="text-center py-12">
        <p className="text-slate-600">Deal not found.</p>
        <button onClick={() => navigate('/pipeline')} className="mt-3 text-primary-600 hover:underline text-sm">
          Back to Pipeline
        </button>
      </div>
    )
  }

  const location = [deal.address, deal.city, deal.state, deal.zip].filter(Boolean).join(', ')
  const stageCfg = STAGE_CONFIG[deal.stage] || { label: deal.stage, color: 'text-slate-700', bg: 'bg-slate-100' }

  const notes = backendData?.notes || []
  const contracts = backendData?.generated_contracts || []
  const pofRequests = backendData?.pof_requests || []
  const pofCerts = backendData?.pof_certificates || []
  const activityFeed = backendData?.activity_feed || []

  // ── Render ─────────────────────────────────────────────────

  return (
    <div className="space-y-6">
      {/* Back button + title */}
      <div className="flex items-start gap-3 md:gap-4">
        <button
          onClick={() => navigate('/pipeline')}
          className="p-2 rounded-lg hover:bg-slate-100 transition-colors min-w-[44px] min-h-[44px] flex items-center justify-center shrink-0"
        >
          <ArrowLeft className="w-5 h-5 text-slate-600" />
        </button>
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-2 md:gap-3">
            <h1 className="text-xl md:text-2xl font-bold text-slate-800 truncate">{deal.title}</h1>
            {deal.isUrgent && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-red-100 text-red-700 text-xs font-medium rounded-full shrink-0">
                <AlertTriangle className="w-3 h-3" />
                Urgent
              </span>
            )}
            <button
              onClick={() => navigate(`/calendar?deal=${dealId}&action=add-task`)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-indigo-50 text-indigo-700 rounded-lg hover:bg-indigo-100 transition-colors min-h-[36px] shrink-0"
            >
              <Calendar className="w-3.5 h-3.5" /> Add Task
            </button>
          </div>
          {location && (
            <div className="flex items-center gap-1 mt-0.5 text-sm text-slate-500">
              <MapPin className="w-3.5 h-3.5 shrink-0" />
              <span className="truncate">{location}</span>
            </div>
          )}
        </div>
      </div>

      {/* Two-column layout */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
        {/* LEFT COLUMN — 40% */}
        <div className="lg:col-span-2 space-y-5">
          {/* Stage Selector */}
          <div className="bg-white rounded-xl border border-slate-200 p-4 md:p-5">
            <h3 className="text-sm font-semibold text-slate-500 uppercase tracking-wide mb-3">Stage</h3>
            <div className="flex flex-nowrap md:flex-wrap gap-1.5 overflow-x-auto pb-1 -mx-1 px-1">
              {stages.map((stage) => {
                const cfg = STAGE_CONFIG[stage.id] || STAGE_CONFIG[stage.name?.toLowerCase().replace(/\s+/g, '_')] || { label: stage.name, color: 'text-slate-700', bg: 'bg-slate-100' }
                const isActive = deal.stage === stage.id
                return (
                  <button
                    key={stage.id}
                    onClick={() => handleStageChange(stage.id)}
                    className={cn(
                      'px-3 py-1.5 text-xs font-medium rounded-full transition-all whitespace-nowrap shrink-0 min-h-[32px]',
                      isActive
                        ? `${cfg.bg} ${cfg.color} ring-2 ring-offset-1 ring-current`
                        : 'bg-slate-50 text-slate-400 hover:bg-slate-100 hover:text-slate-600'
                    )}
                  >
                    {cfg.label}
                  </button>
                )
              })}
            </div>
          </div>

          {/* Financial Summary */}
          <div className="bg-white rounded-xl border border-slate-200 p-5">
            <h3 className="text-sm font-semibold text-slate-500 uppercase tracking-wide mb-3">Financials</h3>
            <div className="grid grid-cols-2 gap-3">
              {deal.listPrice != null && (
                <div className="p-3 bg-slate-50 rounded-lg">
                  <p className="text-xs text-slate-500">List Price</p>
                  <p className="text-sm font-semibold text-slate-800">{formatCurrency(deal.listPrice)}</p>
                </div>
              )}
              {deal.purchasePrice != null && (
                <div className="p-3 bg-green-50 rounded-lg">
                  <p className="text-xs text-green-600">Purchase Price</p>
                  <p className="text-sm font-semibold text-green-700">{formatCurrency(deal.purchasePrice)}</p>
                </div>
              )}
              {deal.arv != null && (
                <div className="p-3 bg-primary-50 rounded-lg">
                  <p className="text-xs text-primary-600">ARV</p>
                  <p className="text-sm font-semibold text-primary-700">{formatCurrency(deal.arv)}</p>
                </div>
              )}
              {deal.rehabEstimate != null && (
                <div className="p-3 bg-amber-50 rounded-lg">
                  <p className="text-xs text-amber-600">Rehab Estimate</p>
                  <p className="text-sm font-semibold text-amber-700">{formatCurrency(deal.rehabEstimate)}</p>
                </div>
              )}
              {deal.monthlyRent != null && (
                <div className="p-3 bg-slate-50 rounded-lg">
                  <p className="text-xs text-slate-500">Monthly Rent</p>
                  <p className="text-sm font-semibold text-slate-800">{formatCurrency(deal.monthlyRent)}</p>
                </div>
              )}
              {deal.allInCost != null && (
                <div className="p-3 bg-slate-50 rounded-lg">
                  <p className="text-xs text-slate-500">All-In Cost</p>
                  <p className="text-sm font-semibold text-slate-800">{formatCurrency(deal.allInCost)}</p>
                </div>
              )}
            </div>
          </div>

          {/* Deal Details */}
          <div className="bg-white rounded-xl border border-slate-200 p-5">
            <h3 className="text-sm font-semibold text-slate-500 uppercase tracking-wide mb-3">Details</h3>
            <div className="space-y-2.5">
              {deal.contactName && (
                <div className="flex items-center justify-between">
                  <span className="text-sm text-slate-500 flex items-center gap-1.5">
                    <User className="w-3.5 h-3.5" />
                    Contact
                  </span>
                  <button
                    onClick={() => deal.contactId && navigate(`/contacts/${deal.contactId}`)}
                    className="text-sm font-medium text-primary-600 hover:underline"
                  >
                    {deal.contactName}
                  </button>
                </div>
              )}
              {deal.source && (
                <div className="flex items-center justify-between">
                  <span className="text-sm text-slate-500">Source</span>
                  <span className="text-sm font-medium text-slate-800">{deal.source}</span>
                </div>
              )}
              {deal.closingDate && (
                <div className="flex items-center justify-between">
                  <span className="text-sm text-slate-500 flex items-center gap-1.5">
                    <Calendar className="w-3.5 h-3.5" />
                    Closing Date
                  </span>
                  <span className="text-sm font-medium text-slate-800">{formatDate(deal.closingDate)}</span>
                </div>
              )}
              {deal.offerExpiresAt && (
                <div className="flex items-center justify-between">
                  <span className="text-sm text-slate-500">Offer Expires</span>
                  <span className="text-sm font-medium text-slate-800">{formatDate(deal.offerExpiresAt)}</span>
                </div>
              )}
              {deal.inspectionDeadline && (
                <div className="flex items-center justify-between">
                  <span className="text-sm text-slate-500">Inspection Deadline</span>
                  <span className="text-sm font-medium text-slate-800">{formatDate(deal.inspectionDeadline)}</span>
                </div>
              )}
              <div className="flex items-center justify-between">
                <span className="text-sm text-slate-500">Created</span>
                <span className="text-sm font-medium text-slate-800">{formatDate(deal.createdAt)}</span>
              </div>
            </div>
          </div>

          {/* Bank Negotiations */}
          <div className="bg-white rounded-xl border border-slate-200 p-5">
            <h3 className="text-sm font-semibold text-slate-500 uppercase tracking-wide mb-3 flex items-center gap-1.5">
              <Landmark className="w-3.5 h-3.5" />
              Bank Negotiations
            </h3>
            {lenderLoading ? (
              <div className="flex items-center justify-center py-4">
                <Loader2 className="w-5 h-5 animate-spin text-[#1B3A6B]" />
              </div>
            ) : !lenderData || (Array.isArray(lenderData.lenders) && lenderData.lenders.length === 0) || (Array.isArray(lenderData) && lenderData.length === 0) ? (
              <div className="text-center py-3">
                <span className="inline-block px-3 py-1.5 text-xs font-medium rounded-full bg-slate-100 text-slate-500">
                  No Active Negotiations
                </span>
                <div className="mt-2">
                  <button
                    onClick={() => navigate('/bank-negotiation')}
                    className="text-xs text-[#1B3A6B] hover:underline"
                  >
                    Set up Bank Negotiation &rarr;
                  </button>
                </div>
              </div>
            ) : (() => {
              const lenders = lenderData.lenders || (Array.isArray(lenderData) ? lenderData : [])
              const active = lenders.filter((l: any) => l.status === 'active' || l.status === 'pending_response').length
              const approved = lenders.filter((l: any) => l.status === 'approved').length
              const LOAN_TYPE_BADGE_DEAL: Record<string, string> = {
                '1st': 'bg-[#1B3A6B] text-white',
                '2nd': 'bg-blue-500 text-white',
                'HELOC': 'bg-teal-600 text-white',
                'HOA': 'bg-orange-500 text-white',
                'Tax': 'bg-[#CC2229] text-white',
                'Other': 'bg-gray-500 text-white',
              }
              const STATUS_BADGE_DEAL: Record<string, string> = {
                active: 'bg-blue-100 text-blue-800',
                pending_response: 'bg-yellow-100 text-yellow-800',
                approved: 'bg-green-100 text-green-800',
                denied: 'bg-red-100 text-red-800',
                completed: 'bg-gray-100 text-gray-600',
              }
              function fmtFollowUp(dateStr: string | null | undefined) {
                if (!dateStr) return { text: '\u2014', color: 'text-slate-400' }
                const d = new Date(dateStr)
                const now = new Date(); now.setHours(0, 0, 0, 0)
                const days = Math.ceil((d.getTime() - now.getTime()) / 86400000)
                if (days < 0) return { text: 'Overdue', color: 'text-[#CC2229] font-semibold' }
                if (days <= 1) return { text: d.toLocaleDateString(), color: 'text-orange-600 font-semibold' }
                return { text: d.toLocaleDateString(), color: 'text-slate-500' }
              }
              return (
                <>
                  <button
                    onClick={() => setLendersExpanded(!lendersExpanded)}
                    className="w-full flex items-center justify-between px-3 py-2 rounded-lg bg-[#1B3A6B]/5 hover:bg-[#1B3A6B]/10 transition-colors"
                  >
                    <span className="text-sm font-medium text-[#1B3A6B]">
                      {lenders.length} Lender{lenders.length !== 1 ? 's' : ''} &mdash; {active} Active, {approved} Approved
                    </span>
                    {lendersExpanded
                      ? <ChevronUp className="w-4 h-4 text-[#1B3A6B]" />
                      : <ChevronDown className="w-4 h-4 text-[#1B3A6B]" />
                    }
                  </button>
                  {lendersExpanded && (
                    <div className="mt-3 space-y-3">
                      <div className="overflow-x-auto">
                        <table className="w-full text-xs">
                          <thead className="bg-slate-50 border-b"><tr>
                            {['Lender', 'Type', 'Balance', 'Status', 'Last Letter', 'Next Follow-Up'].map(h => (
                              <th key={h} className="text-left px-2 py-2 text-[10px] font-semibold text-slate-500 uppercase">{h}</th>
                            ))}
                          </tr></thead>
                          <tbody>{lenders.map((l: any) => {
                            const loanType = l.loan_type || l.negotiation_type || 'Other'
                            const badge = LOAN_TYPE_BADGE_DEAL[loanType] || LOAN_TYPE_BADGE_DEAL['Other']
                            const statusBadge = STATUS_BADGE_DEAL[l.status] || 'bg-gray-100 text-gray-600'
                            const lastLetter = l.last_letter_number
                              ? `Letter ${l.last_letter_number} \u2014 ${l.last_letter_date ? new Date(l.last_letter_date).toLocaleDateString() : ''}`
                              : '\u2014'
                            const fu = fmtFollowUp(l.next_followup)
                            return (
                              <tr key={l.id} className="border-b last:border-0">
                                <td className="px-2 py-2 text-slate-800 font-medium">{l.bank_name}</td>
                                <td className="px-2 py-2"><span className={`px-1.5 py-0.5 text-[10px] font-semibold rounded ${badge}`}>{loanType}</span></td>
                                <td className="px-2 py-2 text-slate-600">{l.current_balance != null ? `$${Number(l.current_balance).toLocaleString()}` : '\u2014'}</td>
                                <td className="px-2 py-2"><span className={`px-1.5 py-0.5 text-[10px] font-semibold rounded-full ${statusBadge}`}>{(l.status || '').replace(/_/g, ' ')}</span></td>
                                <td className="px-2 py-2 text-slate-600">{lastLetter}</td>
                                <td className="px-2 py-2"><span className={fu.color}>{fu.text}</span></td>
                              </tr>
                            )
                          })}</tbody>
                        </table>
                      </div>
                      <div className="flex gap-2">
                        <button
                          onClick={() => navigate(`/bank-negotiation?property=${encodeURIComponent(deal.address)}`)}
                          className="px-3 py-1.5 text-xs font-medium text-[#1B3A6B] border border-[#1B3A6B] rounded hover:bg-slate-50"
                        >
                          View Details
                        </button>
                        <button
                          onClick={() => navigate(`/bank-negotiation?property=${encodeURIComponent(deal.address)}&addLender=true`)}
                          className="px-3 py-1.5 text-xs font-medium bg-[#1B3A6B] text-white rounded hover:opacity-90"
                        >
                          + Add Lender
                        </button>
                      </div>
                    </div>
                  )}
                </>
              )
            })()}
          </div>

          {/* Inline Notes */}
          {deal.notes && (
            <div className="bg-white rounded-xl border border-slate-200 p-5">
              <h3 className="text-sm font-semibold text-slate-500 uppercase tracking-wide mb-2">Quick Notes</h3>
              <p className="text-sm text-slate-700 bg-slate-50 rounded-lg p-3">{deal.notes}</p>
            </div>
          )}
        </div>

        {/* RIGHT COLUMN — 60% */}
        <div className="lg:col-span-3">
          {/* Tab Bar */}
          <div className="bg-white rounded-xl border border-slate-200">
            <div className="flex border-b border-slate-200 overflow-x-auto scrollbar-hide">
              {TABS.map(({ id, label, icon: Icon }) => (
                <button
                  key={id}
                  onClick={() => setActiveTab(id)}
                  className={cn(
                    'flex items-center gap-1.5 px-3 md:px-4 py-3 text-sm font-medium whitespace-nowrap transition-colors border-b-2 min-h-[44px]',
                    activeTab === id
                      ? 'border-primary-500 text-primary-600'
                      : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300'
                  )}
                >
                  <Icon className="w-4 h-4" />
                  <span className="hidden sm:inline">{label}</span>
                  <span className="sm:hidden">{id === 'overview' ? 'Info' : id === 'expenditures' ? 'Costs' : id === 'checklist' ? 'Check' : id === 'analyzer' ? 'Calc' : id === 'documents' ? 'Docs' : id === 'pof' ? 'POF' : 'Notes'}</span>
                </button>
              ))}
            </div>

            <div className="p-5">
              {/* ── Overview Tab ────────────────────────── */}
              {activeTab === 'overview' && (
                <div className="space-y-4">
                  <h3 className="text-base font-semibold text-slate-900">Activity Feed</h3>
                  {backendLoading ? (
                    <div className="flex items-center justify-center h-24">
                      <Loader2 className="w-5 h-5 animate-spin text-primary-500" />
                    </div>
                  ) : activityFeed.length === 0 ? (
                    <p className="text-sm text-slate-400 text-center py-8">No activity yet</p>
                  ) : (
                    <div className="space-y-3">
                      {activityFeed.map((item: any) => {
                        const borderColor =
                          item.type === 'contract' ? 'border-l-blue-500'
                          : item.type === 'pof' ? 'border-l-green-500'
                          : item.type === 'note' ? 'border-l-amber-500'
                          : 'border-l-slate-300'
                        return (
                          <div
                            key={item.id}
                            className={cn('border-l-4 pl-3 py-2', borderColor)}
                          >
                            <p className="text-sm text-slate-700">{item.summary}</p>
                            <p className="text-xs text-slate-400 mt-0.5">
                              {item.timestamp ? formatDate(item.timestamp) : ''}
                            </p>
                          </div>
                        )
                      })}
                    </div>
                  )}
                </div>
              )}

              {/* ── Expenditures Tab ──────────────────── */}
              {activeTab === 'expenditures' && dealId && (
                <DealExpenditures dealId={dealId} />
              )}

              {/* ── Contracts & Checklist Tab ──────────── */}
              {activeTab === 'checklist' && dealId && (
                <ContractChecklist
                  dealId={dealId}
                  dealType="subject_to"
                  homeownerName={deal.contactName}
                  propertyAddress={deal.address}
                  purchasePrice={deal.purchasePrice}
                />
              )}

              {/* ── Deal Analyzer Tab ─────────────────── */}
              {activeTab === 'analyzer' && dealId && (
                <DealAnalyzer
                  dealId={dealId}
                  preferences={analyzerPreferences}
                  dealData={{
                    purchasePrice: deal.purchasePrice,
                    arv: deal.arv,
                    rehabEstimate: deal.rehabEstimate,
                    monthlyRent: deal.monthlyRent,
                    listPrice: deal.listPrice,
                  }}
                />
              )}

              {/* ── Documents Tab ─────────────────────── */}
              {activeTab === 'documents' && (
                <div className="space-y-4">
                  <h3 className="text-base font-semibold text-slate-900">Generated Documents</h3>
                  {backendLoading ? (
                    <div className="flex items-center justify-center h-24">
                      <Loader2 className="w-5 h-5 animate-spin text-primary-500" />
                    </div>
                  ) : contracts.length === 0 ? (
                    <p className="text-sm text-slate-400 text-center py-8">No documents generated for this deal yet</p>
                  ) : (
                    <div className="space-y-2">
                      {contracts.map((doc: any) => (
                        <div
                          key={doc.id}
                          className="flex items-center justify-between p-3 bg-slate-50 rounded-lg"
                        >
                          <div className="flex items-center gap-3 min-w-0">
                            <FileText className="w-4 h-4 text-primary-500 shrink-0" />
                            <div className="min-w-0">
                              <p className="text-sm font-medium text-slate-700 truncate">{doc.file_name}</p>
                              <p className="text-xs text-slate-400">{doc.created_at ? formatDate(doc.created_at) : ''}</p>
                            </div>
                          </div>
                          {doc.storage_url && (
                            <a
                              href={doc.storage_url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-primary-600 hover:text-primary-800"
                            >
                              <ExternalLink className="w-4 h-4" />
                            </a>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* ── Proof of Funds Tab ────────────────── */}
              {activeTab === 'pof' && (
                <div className="space-y-4">
                  <h3 className="text-base font-semibold text-slate-900">Proof of Funds</h3>

                  {/* POF Requests */}
                  {backendLoading ? (
                    <div className="flex items-center justify-center h-24">
                      <Loader2 className="w-5 h-5 animate-spin text-primary-500" />
                    </div>
                  ) : pofRequests.length === 0 && pofCerts.length === 0 ? (
                    <p className="text-sm text-slate-400 text-center py-8">
                      No proof of funds requests or certificates yet
                    </p>
                  ) : (
                    <>
                      {pofRequests.length > 0 && (
                        <div>
                          <h4 className="text-sm font-medium text-slate-600 mb-2">Requests</h4>
                          <div className="space-y-2">
                            {pofRequests.map((req: any) => (
                              <div key={req.id} className="p-3 bg-slate-50 rounded-lg">
                                <div className="flex items-center justify-between">
                                  <div>
                                    <p className="text-sm font-medium text-slate-700">{req.buyer_name}</p>
                                    <p className="text-xs text-slate-500">{req.property_address}</p>
                                  </div>
                                  <div className="text-right">
                                    <p className="text-sm font-semibold text-slate-800">
                                      {formatCurrency(req.required_amount)}
                                    </p>
                                    <span className={cn(
                                      'text-[10px] px-2 py-0.5 rounded-full font-medium',
                                      req.status === 'completed' ? 'bg-green-100 text-green-700'
                                      : req.status === 'pending' ? 'bg-amber-100 text-amber-700'
                                      : 'bg-slate-100 text-slate-600'
                                    )}>
                                      {req.status}
                                    </span>
                                  </div>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {pofCerts.length > 0 && (
                        <div>
                          <h4 className="text-sm font-medium text-slate-600 mb-2">Certificates</h4>
                          <div className="space-y-2">
                            {pofCerts.map((cert: any) => (
                              <div key={cert.id} className="p-3 bg-green-50 rounded-lg">
                                <div className="flex items-center justify-between">
                                  <div>
                                    <p className="text-sm font-medium text-green-700">{cert.buyer_name}</p>
                                    <p className="text-xs text-green-600">{cert.property_address}</p>
                                  </div>
                                  <div className="text-right">
                                    <p className="text-sm font-semibold text-green-800">
                                      {cert.available_balance_display}
                                    </p>
                                    <p className="text-xs text-green-600">
                                      {cert.verified ? 'Verified' : 'Unverified'}
                                    </p>
                                  </div>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </>
                  )}
                </div>
              )}

              {/* ── Notes Tab ─────────────────────────── */}
              {activeTab === 'notes' && (
                <div className="space-y-4">
                  <h3 className="text-base font-semibold text-slate-900">Deal Notes</h3>

                  {/* Add note form */}
                  <div className="flex gap-2">
                    <input
                      type="text"
                      placeholder="Add a note..."
                      value={newNote}
                      onChange={(e) => setNewNote(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && handleAddNote()}
                      className="flex-1 px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
                    />
                    <button
                      onClick={handleAddNote}
                      disabled={addingNote || !newNote.trim()}
                      className="px-4 py-2 bg-primary-600 text-white text-sm font-medium rounded-lg hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {addingNote ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <Plus className="w-4 h-4" />
                      )}
                    </button>
                  </div>

                  {/* Notes list */}
                  {backendLoading ? (
                    <div className="flex items-center justify-center h-24">
                      <Loader2 className="w-5 h-5 animate-spin text-primary-500" />
                    </div>
                  ) : notes.length === 0 ? (
                    <p className="text-sm text-slate-400 text-center py-8">No notes yet</p>
                  ) : (
                    <div className="space-y-2">
                      {notes.map((note: any) => (
                        <div key={note.id} className="group flex items-start gap-3 p-3 bg-slate-50 rounded-lg">
                          <StickyNote className="w-4 h-4 text-amber-500 mt-0.5 shrink-0" />
                          <div className="flex-1 min-w-0">
                            <p className="text-sm text-slate-700">{note.content}</p>
                            <p className="text-xs text-slate-400 mt-1">
                              {note.created_at ? formatDate(note.created_at) : ''}
                            </p>
                          </div>
                          <button
                            onClick={() => handleDeleteNote(note.id)}
                            className="opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded hover:bg-red-100"
                          >
                            <Trash2 className="w-3.5 h-3.5 text-red-500" />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
