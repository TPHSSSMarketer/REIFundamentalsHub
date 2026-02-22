import { useState, useEffect, useMemo, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import {
  ArrowLeft,
  MapPin,
  User,
  DollarSign,
  Calendar,
  AlertTriangle,
  FileText,
  Shield,
  StickyNote,
  Calculator,
  BarChart3,
  TrendingUp,
  TrendingDown,
  Star,
  Trash2,
  Plus,
  ExternalLink,
  Loader2,
  Copy,
  ClipboardList,
} from 'lucide-react'
import { toast } from 'sonner'
import { useDeal, useUpdateDeal, usePipelines } from '@/hooks/useApi'
import { formatCurrency, formatDate, cn } from '@/utils/helpers'
import { getAuthHeader } from '@/services/auth'
import { getDealChecklist } from '@/services/documentsApi'
import ContractChecklist from '@/components/Documents/ContractChecklist'
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

  // Deal Analyzer fields
  const [arvInput, setArvInput] = useState('')
  const [rehabInput, setRehabInput] = useState('')
  const [purchaseInput, setPurchaseInput] = useState('')
  const [closingCostPct, setClosingCostPct] = useState('3')
  const [holdingMonths, setHoldingMonths] = useState('6')
  const [holdingCostMonthly, setHoldingCostMonthly] = useState('1500')
  const [rentInput, setRentInput] = useState('')

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

  // Seed analyzer inputs from deal data
  useEffect(() => {
    if (deal) {
      if (deal.arv != null) setArvInput(deal.arv.toString())
      if (deal.rehabEstimate != null) setRehabInput(deal.rehabEstimate.toString())
      if (deal.purchasePrice != null) setPurchaseInput(deal.purchasePrice.toString())
      if (deal.monthlyRent != null) setRentInput(deal.monthlyRent.toString())
    }
  }, [deal])

  // ── Analyzer calculations ──────────────────────────────────

  const analysis = useMemo(() => {
    const arv = parseFloat(arvInput) || 0
    const rehab = parseFloat(rehabInput) || 0
    const purchase = parseFloat(purchaseInput) || 0
    const closingPct = parseFloat(closingCostPct) || 0
    const months = parseInt(holdingMonths) || 0
    const holdingPerMonth = parseFloat(holdingCostMonthly) || 0
    const monthlyRent = parseFloat(rentInput) || 0

    const closingCosts = purchase * (closingPct / 100)
    const holdingCosts = months * holdingPerMonth
    const totalInvestment = purchase + rehab + closingCosts + holdingCosts
    const profit = arv - totalInvestment
    const roi = totalInvestment > 0 ? (profit / totalInvestment) * 100 : 0

    // 70% Rule
    const maxOffer70 = arv * 0.7 - rehab
    const meetsRule = purchase <= maxOffer70

    // Rental metrics
    const annualRent = monthlyRent * 12
    const capRate = totalInvestment > 0 ? (annualRent / totalInvestment) * 100 : 0
    const cashOnCash = totalInvestment > 0 ? ((annualRent - holdingPerMonth * 12) / totalInvestment) * 100 : 0

    // Deal Rating (1-5 stars)
    let rating = 0
    if (roi >= 30) rating += 2
    else if (roi >= 15) rating += 1
    if (meetsRule) rating += 1
    if (capRate >= 8) rating += 1
    if (profit > 0) rating += 1

    return {
      closingCosts,
      holdingCosts,
      totalInvestment,
      profit,
      roi,
      maxOffer70,
      meetsRule,
      annualRent,
      capRate,
      cashOnCash,
      rating: Math.min(rating, 5),
    }
  }, [arvInput, rehabInput, purchaseInput, closingCostPct, holdingMonths, holdingCostMonthly, rentInput])

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
      <div className="flex items-center gap-4">
        <button
          onClick={() => navigate('/pipeline')}
          className="p-2 rounded-lg hover:bg-slate-100 transition-colors"
        >
          <ArrowLeft className="w-5 h-5 text-slate-600" />
        </button>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold text-slate-800 truncate">{deal.title}</h1>
            {deal.isUrgent && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-red-100 text-red-700 text-xs font-medium rounded-full">
                <AlertTriangle className="w-3 h-3" />
                Urgent
              </span>
            )}
          </div>
          {location && (
            <div className="flex items-center gap-1 mt-0.5 text-sm text-slate-500">
              <MapPin className="w-3.5 h-3.5" />
              <span>{location}</span>
            </div>
          )}
        </div>
      </div>

      {/* Two-column layout */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
        {/* LEFT COLUMN — 40% */}
        <div className="lg:col-span-2 space-y-5">
          {/* Stage Selector */}
          <div className="bg-white rounded-xl border border-slate-200 p-5">
            <h3 className="text-sm font-semibold text-slate-500 uppercase tracking-wide mb-3">Stage</h3>
            <div className="flex flex-wrap gap-1.5">
              {stages.map((stage) => {
                const cfg = STAGE_CONFIG[stage.id] || STAGE_CONFIG[stage.name?.toLowerCase().replace(/\s+/g, '_')] || { label: stage.name, color: 'text-slate-700', bg: 'bg-slate-100' }
                const isActive = deal.stage === stage.id
                return (
                  <button
                    key={stage.id}
                    onClick={() => handleStageChange(stage.id)}
                    className={cn(
                      'px-3 py-1.5 text-xs font-medium rounded-full transition-all',
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
            <div className="flex border-b border-slate-200 overflow-x-auto">
              {TABS.map(({ id, label, icon: Icon }) => (
                <button
                  key={id}
                  onClick={() => setActiveTab(id)}
                  className={cn(
                    'flex items-center gap-1.5 px-4 py-3 text-sm font-medium whitespace-nowrap transition-colors border-b-2',
                    activeTab === id
                      ? 'border-primary-500 text-primary-600'
                      : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300'
                  )}
                >
                  <Icon className="w-4 h-4" />
                  {label}
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
              {activeTab === 'analyzer' && (
                <div className="space-y-5">
                  {/* Rating */}
                  <div className="flex items-center justify-between">
                    <h3 className="text-base font-semibold text-slate-900">Deal Analyzer</h3>
                    <div className="flex items-center gap-0.5">
                      {Array.from({ length: 5 }).map((_, i) => (
                        <Star
                          key={i}
                          className={cn(
                            'w-5 h-5',
                            i < analysis.rating
                              ? 'fill-yellow-400 text-yellow-400'
                              : 'text-slate-200'
                          )}
                        />
                      ))}
                    </div>
                  </div>

                  {/* Inputs */}
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-medium text-slate-600 mb-1">Purchase Price ($)</label>
                      <input
                        type="number"
                        value={purchaseInput}
                        onChange={(e) => setPurchaseInput(e.target.value)}
                        className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-600 mb-1">After Repair Value ($)</label>
                      <input
                        type="number"
                        value={arvInput}
                        onChange={(e) => setArvInput(e.target.value)}
                        className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-600 mb-1">Rehab Estimate ($)</label>
                      <input
                        type="number"
                        value={rehabInput}
                        onChange={(e) => setRehabInput(e.target.value)}
                        className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-600 mb-1">Monthly Rent ($)</label>
                      <input
                        type="number"
                        value={rentInput}
                        onChange={(e) => setRentInput(e.target.value)}
                        className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-600 mb-1">Closing Costs (%)</label>
                      <input
                        type="number"
                        step="0.5"
                        value={closingCostPct}
                        onChange={(e) => setClosingCostPct(e.target.value)}
                        className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-600 mb-1">Holding Months</label>
                      <input
                        type="number"
                        value={holdingMonths}
                        onChange={(e) => setHoldingMonths(e.target.value)}
                        className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
                      />
                    </div>
                    <div className="col-span-2">
                      <label className="block text-xs font-medium text-slate-600 mb-1">Monthly Holding Cost ($)</label>
                      <input
                        type="number"
                        value={holdingCostMonthly}
                        onChange={(e) => setHoldingCostMonthly(e.target.value)}
                        className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
                      />
                    </div>
                  </div>

                  {/* Results */}
                  <div className="grid grid-cols-2 gap-3">
                    <div className="p-3 bg-slate-50 rounded-lg">
                      <p className="text-xs text-slate-500">Total Investment</p>
                      <p className="text-sm font-semibold text-slate-800">
                        {formatCurrency(analysis.totalInvestment)}
                      </p>
                    </div>
                    <div className={cn('p-3 rounded-lg', analysis.profit >= 0 ? 'bg-green-50' : 'bg-red-50')}>
                      <p className={cn('text-xs', analysis.profit >= 0 ? 'text-green-600' : 'text-red-600')}>
                        Est. Profit
                      </p>
                      <p className={cn(
                        'text-sm font-semibold flex items-center gap-1',
                        analysis.profit >= 0 ? 'text-green-700' : 'text-red-700'
                      )}>
                        {analysis.profit >= 0 ? <TrendingUp className="w-3.5 h-3.5" /> : <TrendingDown className="w-3.5 h-3.5" />}
                        {formatCurrency(Math.abs(analysis.profit))}
                      </p>
                    </div>
                    <div className="p-3 bg-slate-50 rounded-lg">
                      <p className="text-xs text-slate-500">ROI</p>
                      <p className={cn(
                        'text-sm font-semibold',
                        analysis.roi >= 15 ? 'text-green-700' : analysis.roi >= 0 ? 'text-amber-700' : 'text-red-700'
                      )}>
                        {analysis.roi.toFixed(1)}%
                      </p>
                    </div>
                    <div className={cn('p-3 rounded-lg', analysis.meetsRule ? 'bg-green-50' : 'bg-red-50')}>
                      <p className="text-xs text-slate-500">70% Rule Max Offer</p>
                      <p className={cn(
                        'text-sm font-semibold',
                        analysis.meetsRule ? 'text-green-700' : 'text-red-700'
                      )}>
                        {formatCurrency(analysis.maxOffer70)}
                        <span className="text-[10px] ml-1 font-normal">
                          {analysis.meetsRule ? '(PASS)' : '(FAIL)'}
                        </span>
                      </p>
                    </div>
                    {(parseFloat(rentInput) > 0) && (
                      <>
                        <div className="p-3 bg-slate-50 rounded-lg">
                          <p className="text-xs text-slate-500">Cap Rate</p>
                          <p className="text-sm font-semibold text-slate-800">{analysis.capRate.toFixed(1)}%</p>
                        </div>
                        <div className="p-3 bg-slate-50 rounded-lg">
                          <p className="text-xs text-slate-500">Cash-on-Cash</p>
                          <p className="text-sm font-semibold text-slate-800">{analysis.cashOnCash.toFixed(1)}%</p>
                        </div>
                      </>
                    )}
                  </div>

                  {/* Closing + holding breakdown */}
                  <div className="text-xs text-slate-400 space-y-0.5">
                    <p>Closing costs: {formatCurrency(analysis.closingCosts)}</p>
                    <p>Holding costs ({holdingMonths} mo): {formatCurrency(analysis.holdingCosts)}</p>
                  </div>
                </div>
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
