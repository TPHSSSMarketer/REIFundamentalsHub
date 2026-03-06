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
  Camera,
  Send,
  Upload,
  X,
  Eye,
  SkipForward,
  Mail,
  Users,
  Home,
  HeartHandshake,
  ListChecks,
  Banknote,
  Gavel,
  FolderOpen,
  Download,
  ChevronRight,
  RefreshCw,
  Building2,
} from 'lucide-react'
import { toast } from 'sonner'
import { useDeal, useUpdateDeal, usePipelines } from '@/hooks/useApi'
import { formatCurrency, formatDate, cn } from '@/utils/helpers'
import { getAuthHeader } from '@/services/auth'
import { getNegotiationsForDeal } from '@/services/bankNegotiationApi'
import { getTemplates, generateContractFromDeal } from '@/services/documentsApi'
import { createPortfolioProperty } from '@/services/crmApi'
import AddTaskModal from './AddTaskModal'
import ContractChecklist from '@/components/Documents/ContractChecklist'
import DealAnalyzer from './DealAnalyzer'
import DealExpenditures from './DealExpenditures'
import PropertyMap from '@/components/Map/PropertyMap'
import type { Deal, DealFile, DealBuyerMatch } from '@/types'

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

// ── Photo / Document categories ──────────────────────────────────────
const PHOTO_CATEGORIES = [
  { id: 'front', label: 'Front' },
  { id: 'back', label: 'Back' },
  { id: 'kitchen', label: 'Kitchen' },
  { id: 'living_room', label: 'Living Room' },
  { id: 'bedroom_1', label: 'Bedroom 1' },
  { id: 'bedroom_2', label: 'Bedroom 2' },
  { id: 'bedroom_3', label: 'Bedroom 3' },
  { id: 'bathroom_1', label: 'Bathroom 1' },
  { id: 'bathroom_2', label: 'Bathroom 2' },
  { id: 'garage', label: 'Garage' },
  { id: 'yard', label: 'Yard' },
  { id: 'miscellaneous', label: 'Miscellaneous' },
] as const

const DOC_CATEGORIES = [
  { id: 'contract', label: 'Contract' },
  { id: 'inspection', label: 'Inspection' },
  { id: 'title', label: 'Title' },
  { id: 'appraisal', label: 'Appraisal' },
  { id: 'insurance', label: 'Insurance' },
  { id: 'disclosure', label: 'Disclosure' },
  { id: 'other', label: 'Other' },
] as const

const TABS = [
  { id: 'overview', label: 'Overview', icon: BarChart3 },
  { id: 'expenditures', label: 'Expenditures', icon: Receipt },
  { id: 'documents', label: 'Documents', icon: FolderOpen },
  { id: 'photos', label: 'Photos', icon: Camera },
  { id: 'files', label: 'Files', icon: FileText },
  { id: 'matches', label: 'Matched Buyers', icon: Users },
  { id: 'checklist', label: 'Contracts & Checklist', icon: ClipboardList },
  { id: 'analyzer', label: 'Deal Analyzer', icon: Calculator },
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

  // Photos & Documents
  const [photos, setPhotos] = useState<DealFile[]>([])
  const [documents, setDocuments] = useState<DealFile[]>([])
  const [filesLoading, setFilesLoading] = useState(false)
  const [uploading, setUploading] = useState<string | null>(null) // category being uploaded
  const [lightboxImg, setLightboxImg] = useState<string | null>(null)

  // Matched Buyers
  const [matches, setMatches] = useState<DealBuyerMatch[]>([])
  const [matchesLoading, setMatchesLoading] = useState(false)
  const [sendingMatch, setSendingMatch] = useState<string | null>(null)
  const [sendingAll, setSendingAll] = useState(false)

  // Add Task Modal
  const [showAddTaskModal, setShowAddTaskModal] = useState(false)

  // Deal Analyzer preferences
  const [analyzerPreferences, setAnalyzerPreferences] = useState<any>(null)

  // Document Templates & Generation
  const [templates, setTemplates] = useState<Array<{ id: string; name: string; category: string }>>([])
  const [templatesLoaded, setTemplatesLoaded] = useState(false)
  const [generatingDoc, setGeneratingDoc] = useState(false)
  const [expandedPhase, setExpandedPhase] = useState<string | null>('buying')

  // Add to Portfolio
  const [addingToPortfolio, setAddingToPortfolio] = useState(false)
  const [addedToPortfolio, setAddedToPortfolio] = useState(false)

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

  // Fetch deal files (photos + documents)
  const loadDealFiles = useCallback(async () => {
    if (!dealId) return
    setFilesLoading(true)
    try {
      const res = await fetch(`${BASE_URL}/api/crm/deals/${dealId}/files`, {
        headers: getAuthHeader(),
      })
      if (res.ok) {
        const files: DealFile[] = await res.json()
        setPhotos(files.filter(f => f.fileType === 'photo'))
        setDocuments(files.filter(f => f.fileType === 'document'))
      }
    } catch {
      // ignore
    } finally {
      setFilesLoading(false)
    }
  }, [dealId])

  useEffect(() => {
    loadDealFiles()
  }, [loadDealFiles])

  // Fetch matched buyers
  const loadMatches = useCallback(async () => {
    if (!dealId) return
    setMatchesLoading(true)
    try {
      const res = await fetch(`${BASE_URL}/api/crm/deals/${dealId}/matches`, {
        headers: getAuthHeader(),
      })
      if (res.ok) {
        setMatches(await res.json())
      }
    } catch {
      // ignore
    } finally {
      setMatchesLoading(false)
    }
  }, [dealId])

  useEffect(() => {
    loadMatches()
  }, [loadMatches])

  // Fetch bank negotiation lender data for this deal's property
  useEffect(() => {
    if (!deal?.address) return
    setLenderLoading(true)
    getNegotiationsForDeal(deal.address)
      .then((data) => setLenderData(data))
      .catch(() => setLenderData(null))
      .finally(() => setLenderLoading(false))
  }, [deal?.address])

  // Load document templates when Documents tab is opened
  useEffect(() => {
    if (activeTab === 'documents' && !templatesLoaded) {
      getTemplates()
        .then((data) => {
          setTemplates(data.templates || [])
          setTemplatesLoaded(true)
        })
        .catch(() => setTemplatesLoaded(true))
    }
  }, [activeTab, templatesLoaded])

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

  const handleAddToPortfolio = async () => {
    if (!deal) return
    setAddingToPortfolio(true)
    try {
      await createPortfolioProperty({
        address: deal.address || '',
        city: deal.city,
        state: deal.state,
        zip: deal.zip,
        propertyType: (deal.propertyType as any) || 'single_family',
        units: 1,
        purchaseDate: new Date().toISOString().slice(0, 10),
        purchasePrice: deal.purchasePrice ?? undefined,
        loanBalance: deal.loanAmount ?? undefined,
        monthlyRent: deal.monthlyRent ?? undefined,
        notes: `Added from deal: ${deal.contactName || deal.address || ''}`,
        sourceDealId: deal.id,
      })
      setAddedToPortfolio(true)
      toast.success('Property added to Portfolio!')
    } catch {
      toast.error('Failed to add to portfolio')
    } finally {
      setAddingToPortfolio(false)
    }
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

  // ── Document Upload (with transaction phase) ────────────────
  const handleDocUpload = async (phase: 'buying' | 'selling' | 'holding', file: File) => {
    if (!dealId) return
    setUploading(`doc-phase-${phase}`)
    try {
      const formData = new FormData()
      formData.append('file', file)
      formData.append('category', 'other')
      formData.append('file_type', 'document')
      formData.append('transaction_phase', phase)
      const res = await fetch(`${BASE_URL}/api/crm/deals/${dealId}/files`, {
        method: 'POST',
        headers: getAuthHeader(),
        body: formData,
      })
      if (!res.ok) throw new Error('Upload failed')
      toast.success('Document uploaded')
      await loadDealFiles()
    } catch {
      toast.error('Upload failed')
    } finally {
      setUploading(null)
    }
  }

  // ── Replace / Overwrite Document ─────────────────────────────
  const handleDocReplace = async (fileId: string, file: File) => {
    if (!dealId) return
    setUploading(`replace-${fileId}`)
    try {
      const formData = new FormData()
      formData.append('file', file)
      formData.append('category', 'other')
      formData.append('file_type', 'document')
      formData.append('replace_file_id', fileId)
      const res = await fetch(`${BASE_URL}/api/crm/deals/${dealId}/files`, {
        method: 'POST',
        headers: getAuthHeader(),
        body: formData,
      })
      if (!res.ok) throw new Error('Replace failed')
      toast.success('Document replaced')
      await loadDealFiles()
    } catch {
      toast.error('Failed to replace document')
    } finally {
      setUploading(null)
    }
  }

  // ── Generate Contract from Deal ────────────────────────────
  const handleGenerateContract = async (templateId: string, phase: 'buying' | 'selling' | 'holding') => {
    if (!dealId) return
    setGeneratingDoc(true)
    try {
      await generateContractFromDeal(dealId, templateId, phase)
      toast.success('Contract generated')
      await loadDealFiles()
    } catch (err: any) {
      toast.error(err.message || 'Failed to generate contract')
    } finally {
      setGeneratingDoc(false)
    }
  }

  // ── Download document ──────────────────────────────────────
  const handleDocDownload = async (fileId: string, fileName: string) => {
    if (!dealId) return
    try {
      const res = await fetch(`${BASE_URL}/api/crm/deals/${dealId}/files/${fileId}`, {
        headers: getAuthHeader(),
      })
      if (!res.ok) throw new Error('Download failed')
      const data = await res.json()
      if (data.fileContent) {
        const byteChars = atob(data.fileContent)
        const byteArray = new Uint8Array(byteChars.length)
        for (let i = 0; i < byteChars.length; i++) byteArray[i] = byteChars.charCodeAt(i)
        const blob = new Blob([byteArray], { type: data.mimeType || 'application/octet-stream' })
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = fileName
        a.click()
        URL.revokeObjectURL(url)
      }
    } catch {
      toast.error('Failed to download file')
    }
  }

  // ── File Upload / Delete ─────────────────────────────────────
  const handleFileUpload = async (category: string, fileType: 'photo' | 'document', file: File) => {
    if (!dealId) return
    setUploading(category)
    try {
      const formData = new FormData()
      formData.append('file', file)
      formData.append('category', category)
      formData.append('file_type', fileType)
      const res = await fetch(`${BASE_URL}/api/crm/deals/${dealId}/files`, {
        method: 'POST',
        headers: getAuthHeader(),
        body: formData,
      })
      if (!res.ok) throw new Error('Upload failed')
      toast.success(`${fileType === 'photo' ? 'Photo' : 'Document'} uploaded`)
      await loadDealFiles()
    } catch {
      toast.error('Upload failed')
    } finally {
      setUploading(null)
    }
  }

  const handleFileDelete = async (fileId: string) => {
    if (!dealId) return
    try {
      const res = await fetch(`${BASE_URL}/api/crm/deals/${dealId}/files/${fileId}`, {
        method: 'DELETE',
        headers: getAuthHeader(),
      })
      if (!res.ok) throw new Error('Delete failed')
      toast.success('File deleted')
      await loadDealFiles()
    } catch {
      toast.error('Failed to delete file')
    }
  }

  const handleViewFullImage = async (fileId: string) => {
    if (!dealId) return
    try {
      const res = await fetch(`${BASE_URL}/api/crm/deals/${dealId}/files/${fileId}`, {
        headers: getAuthHeader(),
      })
      if (!res.ok) throw new Error('Failed to load image')
      const data = await res.json()
      if (data.fileContent) {
        setLightboxImg(`data:${data.mimeType || 'image/jpeg'};base64,${data.fileContent}`)
      }
    } catch {
      toast.error('Failed to load full image')
    }
  }

  // ── Match Actions ───────────────────────────────────────────
  const handleSendMatch = async (matchId: string) => {
    if (!dealId) return
    setSendingMatch(matchId)
    try {
      const res = await fetch(`${BASE_URL}/api/crm/deals/${dealId}/matches/${matchId}/send`, {
        method: 'POST',
        headers: getAuthHeader(),
      })
      if (!res.ok) throw new Error('Send failed')
      toast.success('Email sent to buyer')
      await loadMatches()
    } catch {
      toast.error('Failed to send email')
    } finally {
      setSendingMatch(null)
    }
  }

  const handleSkipMatch = async (matchId: string) => {
    if (!dealId) return
    try {
      const res = await fetch(`${BASE_URL}/api/crm/deals/${dealId}/matches/${matchId}/skip`, {
        method: 'PATCH',
        headers: getAuthHeader(),
      })
      if (!res.ok) throw new Error('Skip failed')
      toast.success('Buyer skipped')
      await loadMatches()
    } catch {
      toast.error('Failed to skip buyer')
    }
  }

  const handleSendAllMatches = async () => {
    if (!dealId) return
    setSendingAll(true)
    try {
      const res = await fetch(`${BASE_URL}/api/crm/deals/${dealId}/matches/send-all`, {
        method: 'POST',
        headers: getAuthHeader(),
      })
      if (!res.ok) throw new Error('Send all failed')
      const data = await res.json()
      toast.success(`Sent ${data.sent} emails${data.failed ? `, ${data.failed} failed` : ''}`)
      await loadMatches()
    } catch {
      toast.error('Failed to send emails')
    } finally {
      setSendingAll(false)
    }
  }

  const handleDeleteMatch = async (matchId: string) => {
    if (!dealId) return
    try {
      const res = await fetch(`${BASE_URL}/api/crm/deals/${dealId}/matches/${matchId}`, {
        method: 'DELETE',
        headers: getAuthHeader(),
      })
      if (!res.ok) throw new Error('Delete failed')
      toast.success('Match removed')
      await loadMatches()
    } catch {
      toast.error('Failed to remove match')
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
            <h1 className="text-xl md:text-2xl font-bold text-slate-800 truncate">{deal.address || deal.title}</h1>
            {deal.isUrgent && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-red-100 text-red-700 text-xs font-medium rounded-full shrink-0">
                <AlertTriangle className="w-3 h-3" />
                Urgent
              </span>
            )}
            <button
              onClick={() => setShowAddTaskModal(true)}
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

            {/* Add to Portfolio — visible on closed_won */}
            {deal.stage === 'closed_won' && !addedToPortfolio && (
              <button
                onClick={handleAddToPortfolio}
                disabled={addingToPortfolio}
                className="mt-3 w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors disabled:opacity-50 font-medium text-sm"
              >
                {addingToPortfolio ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Building2 className="w-4 h-4" />
                )}
                Add to Portfolio
              </button>
            )}
            {deal.stage === 'closed_won' && addedToPortfolio && (
              <p className="mt-3 text-center text-sm text-green-600 font-medium">Added to Portfolio</p>
            )}
          </div>

          {/* Property Map */}
          {deal.latitude != null && deal.longitude != null && (
            <div className="bg-white rounded-xl border border-slate-200 p-4 md:p-5">
              <h3 className="text-sm font-semibold text-slate-500 uppercase tracking-wide mb-3">Location</h3>
              <PropertyMap
                pins={[{
                  id: deal.id,
                  latitude: deal.latitude,
                  longitude: deal.longitude,
                  label: deal.address || deal.title || 'Property',
                  sublabel: [deal.city, deal.state, deal.zip].filter(Boolean).join(', '),
                  type: 'deal',
                }]}
                height="220px"
                zoom={15}
              />
            </div>
          )}

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

          {/* Property Details */}
          {(deal.propertyType || deal.bedrooms || deal.bathrooms || deal.squareFootage || deal.yearBuilt || deal.lotSize || deal.garage || deal.propertyCondition || deal.occupancyStatus || deal.repairsNeeded || deal.specialFeatures) && (
            <div className="bg-white rounded-xl border border-slate-200 p-5">
              <h3 className="text-sm font-semibold text-slate-500 uppercase tracking-wide mb-3 flex items-center gap-1.5">
                <Home className="w-3.5 h-3.5" />
                Property Details
              </h3>
              <div className="space-y-2.5">
                {deal.propertyType && (
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-slate-500">Property Type</span>
                    <span className="text-sm font-medium text-slate-800 capitalize">{deal.propertyType}</span>
                  </div>
                )}
                {(deal.bedrooms != null || deal.bathrooms != null) && (
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-slate-500">Bed / Bath</span>
                    <span className="text-sm font-medium text-slate-800">
                      {deal.bedrooms ?? '—'} bd / {deal.bathrooms ?? '—'} ba
                    </span>
                  </div>
                )}
                {deal.squareFootage != null && (
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-slate-500">Sq Ft</span>
                    <span className="text-sm font-medium text-slate-800">{deal.squareFootage.toLocaleString()}</span>
                  </div>
                )}
                {deal.lotSize && (
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-slate-500">Lot Size</span>
                    <span className="text-sm font-medium text-slate-800">{deal.lotSize}</span>
                  </div>
                )}
                {deal.yearBuilt != null && (
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-slate-500">Year Built</span>
                    <span className="text-sm font-medium text-slate-800">{deal.yearBuilt}</span>
                  </div>
                )}
                {deal.garage && (
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-slate-500">Garage</span>
                    <span className="text-sm font-medium text-slate-800">{deal.garage}</span>
                  </div>
                )}
                {deal.propertyCondition && (
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-slate-500">Condition</span>
                    <span className="text-sm font-medium text-slate-800 capitalize">{deal.propertyCondition}</span>
                  </div>
                )}
                {deal.occupancyStatus && (
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-slate-500">Occupancy</span>
                    <span className="text-sm font-medium text-slate-800 capitalize">{deal.occupancyStatus}</span>
                  </div>
                )}
                {deal.repairsNeeded && (
                  <div>
                    <p className="text-sm text-slate-500 mb-1">Repairs Needed</p>
                    <p className="text-sm text-slate-700 bg-slate-50 rounded-lg p-2">{deal.repairsNeeded}</p>
                  </div>
                )}
                {deal.specialFeatures && (
                  <div>
                    <p className="text-sm text-slate-500 mb-1">Special Features</p>
                    <p className="text-sm text-slate-700 bg-slate-50 rounded-lg p-2">{deal.specialFeatures}</p>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Seller Motivation */}
          {(deal.reasonForSelling || deal.motivationLevel || deal.timelineToSell || deal.askingPrice != null || deal.priceFlexible || deal.howEstablishedPrice || deal.bestCashOffer != null || deal.whatIfDoesntSell || deal.openToTerms) && (
            <div className="bg-white rounded-xl border border-slate-200 p-5">
              <h3 className="text-sm font-semibold text-slate-500 uppercase tracking-wide mb-3 flex items-center gap-1.5">
                <HeartHandshake className="w-3.5 h-3.5" />
                Seller Motivation
              </h3>
              <div className="space-y-2.5">
                {deal.reasonForSelling && (
                  <div>
                    <p className="text-sm text-slate-500 mb-1">Reason for Selling</p>
                    <p className="text-sm text-slate-700 bg-slate-50 rounded-lg p-2">{deal.reasonForSelling}</p>
                  </div>
                )}
                {deal.motivationLevel && (
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-slate-500">Motivation Level</span>
                    <span className={cn(
                      'text-sm font-semibold px-2 py-0.5 rounded-full',
                      deal.motivationLevel === 'high' ? 'bg-green-100 text-green-700' :
                      deal.motivationLevel === 'medium' ? 'bg-amber-100 text-amber-700' :
                      'bg-slate-100 text-slate-600'
                    )}>
                      {deal.motivationLevel.charAt(0).toUpperCase() + deal.motivationLevel.slice(1)}
                    </span>
                  </div>
                )}
                {deal.timelineToSell && (
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-slate-500">Timeline to Sell</span>
                    <span className="text-sm font-medium text-slate-800">{deal.timelineToSell}</span>
                  </div>
                )}
                {deal.askingPrice != null && (
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-slate-500">Asking Price</span>
                    <span className="text-sm font-medium text-slate-800">{formatCurrency(deal.askingPrice)}</span>
                  </div>
                )}
                {deal.priceFlexible && (
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-slate-500">Price Flexible?</span>
                    <span className="text-sm font-medium text-slate-800 capitalize">{deal.priceFlexible}</span>
                  </div>
                )}
                {deal.howEstablishedPrice && (
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-slate-500">How Price Established</span>
                    <span className="text-sm font-medium text-slate-800">{deal.howEstablishedPrice}</span>
                  </div>
                )}
                {deal.bestCashOffer != null && (
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-slate-500">Best Cash Offer</span>
                    <span className="text-sm font-semibold text-green-600">{formatCurrency(deal.bestCashOffer)}</span>
                  </div>
                )}
                {deal.whatIfDoesntSell && (
                  <div>
                    <p className="text-sm text-slate-500 mb-1">What If Doesn't Sell?</p>
                    <p className="text-sm text-slate-700 bg-slate-50 rounded-lg p-2">{deal.whatIfDoesntSell}</p>
                  </div>
                )}
                {deal.openToTerms && (
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-slate-500">Open to Terms?</span>
                    <span className="text-sm font-medium text-slate-800 capitalize">{deal.openToTerms}</span>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Listing Information */}
          {(deal.isListed || deal.realtorName || deal.realtorPhone || deal.listingExpires || deal.howLongListed || deal.anyOffers || deal.previousOfferAmount != null) && (
            <div className="bg-white rounded-xl border border-slate-200 p-5">
              <h3 className="text-sm font-semibold text-slate-500 uppercase tracking-wide mb-3 flex items-center gap-1.5">
                <ListChecks className="w-3.5 h-3.5" />
                Listing Information
              </h3>
              <div className="space-y-2.5">
                {deal.isListed && (
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-slate-500">Currently Listed?</span>
                    <span className={cn(
                      'text-sm font-semibold px-2 py-0.5 rounded-full',
                      deal.isListed === 'yes' ? 'bg-blue-100 text-blue-700' : 'bg-slate-100 text-slate-600'
                    )}>
                      {deal.isListed.charAt(0).toUpperCase() + deal.isListed.slice(1)}
                    </span>
                  </div>
                )}
                {deal.realtorName && (
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-slate-500">Realtor Name</span>
                    <span className="text-sm font-medium text-slate-800">{deal.realtorName}</span>
                  </div>
                )}
                {deal.realtorPhone && (
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-slate-500">Realtor Phone</span>
                    <a href={`tel:${deal.realtorPhone}`} className="text-sm font-medium text-primary-600 hover:underline">{deal.realtorPhone}</a>
                  </div>
                )}
                {deal.howLongListed && (
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-slate-500">How Long Listed</span>
                    <span className="text-sm font-medium text-slate-800">{deal.howLongListed}</span>
                  </div>
                )}
                {deal.listingExpires && (
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-slate-500">Listing Expires</span>
                    <span className="text-sm font-medium text-slate-800">{deal.listingExpires}</span>
                  </div>
                )}
                {deal.anyOffers && (
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-slate-500">Any Offers?</span>
                    <span className="text-sm font-medium text-slate-800 capitalize">{deal.anyOffers}</span>
                  </div>
                )}
                {deal.previousOfferAmount != null && (
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-slate-500">Previous Offer</span>
                    <span className="text-sm font-medium text-slate-800">{formatCurrency(deal.previousOfferAmount)}</span>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Homeowner Financials */}
          {(deal.mortgageCompany1st || deal.mortgageBalance != null || deal.monthlyMortgagePayment != null ||
            deal.mortgageCompany2nd || deal.mortgageBalance2nd != null ||
            deal.mortgageCompany3rd || deal.mortgageBalance3rd != null ||
            deal.taxesInsuranceIncluded || deal.monthlyTaxAmount != null || deal.monthlyInsuranceAmount != null ||
            deal.backTaxes != null || deal.otherLiens || deal.otherLienAmount != null) && (
            <div className="bg-white rounded-xl border border-slate-200 p-5">
              <h3 className="text-sm font-semibold text-slate-500 uppercase tracking-wide mb-3 flex items-center gap-1.5">
                <Banknote className="w-3.5 h-3.5" />
                Homeowner Financials
              </h3>
              <div className="space-y-4">
                {/* Lender 1 */}
                {(deal.mortgageCompany1st || deal.mortgageBalance != null || deal.monthlyMortgagePayment != null) && (
                  <div>
                    <p className="text-xs font-semibold text-primary-600 uppercase mb-2">1st Mortgage</p>
                    <div className="space-y-2 pl-3 border-l-2 border-primary-200">
                      {deal.mortgageCompany1st && (
                        <div className="flex items-center justify-between">
                          <span className="text-sm text-slate-500">Lender</span>
                          <span className="text-sm font-medium text-slate-800">{deal.mortgageCompany1st}</span>
                        </div>
                      )}
                      {deal.mortgageBalance != null && (
                        <div className="flex items-center justify-between">
                          <span className="text-sm text-slate-500">Balance</span>
                          <span className="text-sm font-semibold text-slate-800">{formatCurrency(deal.mortgageBalance)}</span>
                        </div>
                      )}
                      {deal.monthlyMortgagePayment != null && (
                        <div className="flex items-center justify-between">
                          <span className="text-sm text-slate-500">Monthly Payment</span>
                          <span className="text-sm font-medium text-slate-800">{formatCurrency(deal.monthlyMortgagePayment)}</span>
                        </div>
                      )}
                      {deal.interestRate1st != null && (
                        <div className="flex items-center justify-between">
                          <span className="text-sm text-slate-500">Interest Rate</span>
                          <span className="text-sm font-medium text-slate-800">{deal.interestRate1st}%</span>
                        </div>
                      )}
                      {deal.loanType && (
                        <div className="flex items-center justify-between">
                          <span className="text-sm text-slate-500">Loan Type</span>
                          <span className="text-sm font-medium text-slate-800 capitalize">{deal.loanType}</span>
                        </div>
                      )}
                      {deal.paymentsCurrent && (
                        <div className="flex items-center justify-between">
                          <span className="text-sm text-slate-500">Payments Current?</span>
                          <span className={cn(
                            'text-sm font-semibold px-2 py-0.5 rounded-full',
                            deal.paymentsCurrent === 'yes' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
                          )}>
                            {deal.paymentsCurrent.charAt(0).toUpperCase() + deal.paymentsCurrent.slice(1)}
                          </span>
                        </div>
                      )}
                      {deal.monthsBehind != null && deal.monthsBehind > 0 && (
                        <div className="flex items-center justify-between">
                          <span className="text-sm text-slate-500">Months Behind</span>
                          <span className="text-sm font-semibold text-red-600">{deal.monthsBehind}</span>
                        </div>
                      )}
                      {deal.amountBehind != null && deal.amountBehind > 0 && (
                        <div className="flex items-center justify-between">
                          <span className="text-sm text-slate-500">Amount Behind</span>
                          <span className="text-sm font-semibold text-red-600">{formatCurrency(deal.amountBehind)}</span>
                        </div>
                      )}
                      {deal.prepaymentPenalty && (
                        <div className="flex items-center justify-between">
                          <span className="text-sm text-slate-500">Prepayment Penalty?</span>
                          <span className="text-sm font-medium text-slate-800 capitalize">{deal.prepaymentPenalty}</span>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* Lender 2 */}
                {(deal.mortgageCompany2nd || deal.mortgageBalance2nd != null) && (
                  <div>
                    <p className="text-xs font-semibold text-blue-600 uppercase mb-2">2nd Mortgage / HELOC</p>
                    <div className="space-y-2 pl-3 border-l-2 border-blue-200">
                      {deal.mortgageCompany2nd && (
                        <div className="flex items-center justify-between">
                          <span className="text-sm text-slate-500">Lender</span>
                          <span className="text-sm font-medium text-slate-800">{deal.mortgageCompany2nd}</span>
                        </div>
                      )}
                      {deal.mortgageBalance2nd != null && (
                        <div className="flex items-center justify-between">
                          <span className="text-sm text-slate-500">Balance</span>
                          <span className="text-sm font-semibold text-slate-800">{formatCurrency(deal.mortgageBalance2nd)}</span>
                        </div>
                      )}
                      {deal.monthlyPayment2nd != null && (
                        <div className="flex items-center justify-between">
                          <span className="text-sm text-slate-500">Monthly Payment</span>
                          <span className="text-sm font-medium text-slate-800">{formatCurrency(deal.monthlyPayment2nd)}</span>
                        </div>
                      )}
                      {deal.interestRate2nd != null && (
                        <div className="flex items-center justify-between">
                          <span className="text-sm text-slate-500">Interest Rate</span>
                          <span className="text-sm font-medium text-slate-800">{deal.interestRate2nd}%</span>
                        </div>
                      )}
                      {deal.paymentsCurrent2nd && (
                        <div className="flex items-center justify-between">
                          <span className="text-sm text-slate-500">Payments Current?</span>
                          <span className={cn(
                            'text-sm font-semibold px-2 py-0.5 rounded-full',
                            deal.paymentsCurrent2nd === 'yes' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
                          )}>
                            {deal.paymentsCurrent2nd.charAt(0).toUpperCase() + deal.paymentsCurrent2nd.slice(1)}
                          </span>
                        </div>
                      )}
                      {deal.monthsBehind2nd != null && deal.monthsBehind2nd > 0 && (
                        <div className="flex items-center justify-between">
                          <span className="text-sm text-slate-500">Months Behind</span>
                          <span className="text-sm font-semibold text-red-600">{deal.monthsBehind2nd}</span>
                        </div>
                      )}
                      {deal.amountBehind2nd != null && deal.amountBehind2nd > 0 && (
                        <div className="flex items-center justify-between">
                          <span className="text-sm text-slate-500">Amount Behind</span>
                          <span className="text-sm font-semibold text-red-600">{formatCurrency(deal.amountBehind2nd)}</span>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* Lender 3 */}
                {(deal.mortgageCompany3rd || deal.mortgageBalance3rd != null) && (
                  <div>
                    <p className="text-xs font-semibold text-amber-600 uppercase mb-2">3rd Lien</p>
                    <div className="space-y-2 pl-3 border-l-2 border-amber-200">
                      {deal.mortgageCompany3rd && (
                        <div className="flex items-center justify-between">
                          <span className="text-sm text-slate-500">Lender</span>
                          <span className="text-sm font-medium text-slate-800">{deal.mortgageCompany3rd}</span>
                        </div>
                      )}
                      {deal.mortgageBalance3rd != null && (
                        <div className="flex items-center justify-between">
                          <span className="text-sm text-slate-500">Balance</span>
                          <span className="text-sm font-semibold text-slate-800">{formatCurrency(deal.mortgageBalance3rd)}</span>
                        </div>
                      )}
                      {deal.monthlyPayment3rd != null && (
                        <div className="flex items-center justify-between">
                          <span className="text-sm text-slate-500">Monthly Payment</span>
                          <span className="text-sm font-medium text-slate-800">{formatCurrency(deal.monthlyPayment3rd)}</span>
                        </div>
                      )}
                      {deal.interestRate3rd != null && (
                        <div className="flex items-center justify-between">
                          <span className="text-sm text-slate-500">Interest Rate</span>
                          <span className="text-sm font-medium text-slate-800">{deal.interestRate3rd}%</span>
                        </div>
                      )}
                      {deal.paymentsCurrent3rd && (
                        <div className="flex items-center justify-between">
                          <span className="text-sm text-slate-500">Payments Current?</span>
                          <span className={cn(
                            'text-sm font-semibold px-2 py-0.5 rounded-full',
                            deal.paymentsCurrent3rd === 'yes' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
                          )}>
                            {deal.paymentsCurrent3rd.charAt(0).toUpperCase() + deal.paymentsCurrent3rd.slice(1)}
                          </span>
                        </div>
                      )}
                      {deal.monthsBehind3rd != null && deal.monthsBehind3rd > 0 && (
                        <div className="flex items-center justify-between">
                          <span className="text-sm text-slate-500">Months Behind</span>
                          <span className="text-sm font-semibold text-red-600">{deal.monthsBehind3rd}</span>
                        </div>
                      )}
                      {deal.amountBehind3rd != null && deal.amountBehind3rd > 0 && (
                        <div className="flex items-center justify-between">
                          <span className="text-sm text-slate-500">Amount Behind</span>
                          <span className="text-sm font-semibold text-red-600">{formatCurrency(deal.amountBehind3rd)}</span>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* Taxes, Insurance, Liens */}
                {(deal.taxesInsuranceIncluded || deal.monthlyTaxAmount != null || deal.monthlyInsuranceAmount != null || deal.backTaxes != null || deal.otherLiens || deal.otherLienAmount != null) && (
                  <div>
                    <p className="text-xs font-semibold text-slate-500 uppercase mb-2">Taxes, Insurance & Liens</p>
                    <div className="space-y-2 pl-3 border-l-2 border-slate-200">
                      {deal.taxesInsuranceIncluded && (
                        <div className="flex items-center justify-between">
                          <span className="text-sm text-slate-500">T&I Included in Payment?</span>
                          <span className="text-sm font-medium text-slate-800 capitalize">{deal.taxesInsuranceIncluded}</span>
                        </div>
                      )}
                      {deal.monthlyTaxAmount != null && (
                        <div className="flex items-center justify-between">
                          <span className="text-sm text-slate-500">Monthly Tax</span>
                          <span className="text-sm font-medium text-slate-800">{formatCurrency(deal.monthlyTaxAmount)}</span>
                        </div>
                      )}
                      {deal.monthlyInsuranceAmount != null && (
                        <div className="flex items-center justify-between">
                          <span className="text-sm text-slate-500">Monthly Insurance</span>
                          <span className="text-sm font-medium text-slate-800">{formatCurrency(deal.monthlyInsuranceAmount)}</span>
                        </div>
                      )}
                      {deal.backTaxes != null && deal.backTaxes > 0 && (
                        <div className="flex items-center justify-between">
                          <span className="text-sm text-slate-500">Back Taxes Owed</span>
                          <span className="text-sm font-semibold text-red-600">{formatCurrency(deal.backTaxes)}</span>
                        </div>
                      )}
                      {deal.otherLiens && (
                        <div className="flex items-center justify-between">
                          <span className="text-sm text-slate-500">Other Liens?</span>
                          <span className="text-sm font-medium text-slate-800 capitalize">{deal.otherLiens}</span>
                        </div>
                      )}
                      {deal.otherLienAmount != null && deal.otherLienAmount > 0 && (
                        <div className="flex items-center justify-between">
                          <span className="text-sm text-slate-500">Lien Amount</span>
                          <span className="text-sm font-semibold text-red-600">{formatCurrency(deal.otherLienAmount)}</span>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Foreclosure Details */}
          {(deal.foreclosureStatus || deal.auctionDate || deal.reinstatementAmount != null || deal.attorneyInvolved || deal.attorneyName || deal.attorneyPhone) && (
            <div className="bg-white rounded-xl border border-slate-200 p-5">
              <h3 className="text-sm font-semibold text-slate-500 uppercase tracking-wide mb-3 flex items-center gap-1.5">
                <Gavel className="w-3.5 h-3.5" />
                Foreclosure Details
              </h3>
              <div className="space-y-2.5">
                {deal.foreclosureStatus && (
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-slate-500">Status</span>
                    <span className={cn(
                      'text-sm font-semibold px-2 py-0.5 rounded-full',
                      deal.foreclosureStatus === 'none' ? 'bg-green-100 text-green-700' :
                      deal.foreclosureStatus === 'pre_foreclosure' ? 'bg-amber-100 text-amber-700' :
                      'bg-red-100 text-red-700'
                    )}>
                      {deal.foreclosureStatus.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}
                    </span>
                  </div>
                )}
                {deal.auctionDate && (
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-slate-500">Auction Date</span>
                    <span className="text-sm font-semibold text-red-600">{formatDate(deal.auctionDate)}</span>
                  </div>
                )}
                {deal.reinstatementAmount != null && (
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-slate-500">Reinstatement Amount</span>
                    <span className="text-sm font-semibold text-slate-800">{formatCurrency(deal.reinstatementAmount)}</span>
                  </div>
                )}
                {deal.attorneyInvolved && (
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-slate-500">Attorney Involved?</span>
                    <span className="text-sm font-medium text-slate-800 capitalize">{deal.attorneyInvolved}</span>
                  </div>
                )}
                {deal.attorneyName && (
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-slate-500">Attorney Name</span>
                    <span className="text-sm font-medium text-slate-800">{deal.attorneyName}</span>
                  </div>
                )}
                {deal.attorneyPhone && (
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-slate-500">Attorney Phone</span>
                    <a href={`tel:${deal.attorneyPhone}`} className="text-sm font-medium text-primary-600 hover:underline">{deal.attorneyPhone}</a>
                  </div>
                )}
              </div>
            </div>
          )}

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
                  <span className="sm:hidden">{
                    id === 'overview' ? 'Info' :
                    id === 'expenditures' ? 'Costs' :
                    id === 'photos' ? 'Pics' :
                    id === 'files' ? 'Files' :
                    id === 'matches' ? 'Match' :
                    id === 'checklist' ? 'Check' :
                    id === 'analyzer' ? 'Calc' :
                    id === 'pof' ? 'POF' : 'Notes'
                  }</span>
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

              {/* ── Documents Tab (Buying / Selling / Holding) ── */}
              {activeTab === 'documents' && (
                <div className="space-y-4">
                  <h3 className="text-base font-semibold text-slate-900">Deal Documents</h3>
                  <p className="text-sm text-slate-500">
                    Upload and generate documents organized by transaction phase.
                  </p>

                  {(['buying', 'selling', 'holding'] as const).map((phase) => {
                    const phaseDocs = documents.filter(d => d.transactionPhase === phase)
                    const isExpanded = expandedPhase === phase
                    const phaseLabel = phase.charAt(0).toUpperCase() + phase.slice(1)

                    return (
                      <div key={phase} className="border border-slate-200 rounded-lg overflow-hidden">
                        {/* Phase Header */}
                        <button
                          onClick={() => setExpandedPhase(isExpanded ? null : phase)}
                          className="w-full flex items-center justify-between bg-slate-50 px-4 py-3 hover:bg-slate-100 transition-colors"
                        >
                          <div className="flex items-center gap-2">
                            <ChevronRight className={cn('w-4 h-4 text-slate-400 transition-transform', isExpanded && 'rotate-90')} />
                            <FolderOpen className="w-4 h-4 text-primary-500" />
                            <span className="font-medium text-slate-800">{phaseLabel}</span>
                            <span className="text-xs text-slate-400 ml-1">({phaseDocs.length} document{phaseDocs.length !== 1 ? 's' : ''})</span>
                          </div>
                        </button>

                        {/* Expanded Content */}
                        {isExpanded && (
                          <div className="p-4 space-y-3">
                            {/* Action Buttons */}
                            <div className="flex flex-wrap gap-2">
                              {/* Upload Button */}
                              <label className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-primary-600 bg-primary-50 rounded-lg hover:bg-primary-100 cursor-pointer transition-colors">
                                {uploading === `doc-phase-${phase}` ? (
                                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                ) : (
                                  <Upload className="w-3.5 h-3.5" />
                                )}
                                Upload Document
                                <input
                                  type="file"
                                  className="hidden"
                                  disabled={!!uploading}
                                  onChange={(e) => {
                                    const file = e.target.files?.[0]
                                    if (file) handleDocUpload(phase, file)
                                    e.target.value = ''
                                  }}
                                />
                              </label>

                              {/* Generate Contract Dropdown */}
                              {templates.length > 0 && (
                                <div className="relative group">
                                  <button
                                    disabled={generatingDoc}
                                    className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-green-600 bg-green-50 rounded-lg hover:bg-green-100 transition-colors disabled:opacity-50"
                                  >
                                    {generatingDoc ? (
                                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                    ) : (
                                      <FileText className="w-3.5 h-3.5" />
                                    )}
                                    Generate Contract
                                    <ChevronDown className="w-3 h-3" />
                                  </button>
                                  <div className="absolute left-0 top-full mt-1 w-56 bg-white border border-slate-200 rounded-lg shadow-lg z-20 hidden group-hover:block">
                                    {templates.map(t => (
                                      <button
                                        key={t.id}
                                        onClick={() => handleGenerateContract(t.id, phase)}
                                        disabled={generatingDoc}
                                        className="w-full text-left px-3 py-2 text-sm text-slate-700 hover:bg-slate-50 first:rounded-t-lg last:rounded-b-lg"
                                      >
                                        {t.name}
                                      </button>
                                    ))}
                                  </div>
                                </div>
                              )}
                            </div>

                            {/* Document List */}
                            {phaseDocs.length === 0 ? (
                              <p className="text-sm text-slate-400 italic py-2">No documents yet for this phase.</p>
                            ) : (
                              <div className="divide-y divide-slate-100 border border-slate-100 rounded-lg">
                                {phaseDocs.map(doc => (
                                  <div key={doc.id} className="flex items-center justify-between px-4 py-2.5 hover:bg-slate-50">
                                    <div className="flex items-center gap-2.5 min-w-0">
                                      <FileText className="w-4 h-4 text-slate-400 shrink-0" />
                                      <div className="min-w-0">
                                        <p className="text-sm text-slate-700 truncate">{doc.fileName}</p>
                                        <p className="text-xs text-slate-400">
                                          {doc.fileSize ? `${(doc.fileSize / 1024).toFixed(0)} KB` : ''}
                                          {doc.category && ` · ${doc.category}`}
                                          {doc.createdAt && ` · ${formatDate(doc.createdAt)}`}
                                        </p>
                                      </div>
                                    </div>
                                    <div className="flex items-center gap-1">
                                      {/* Replace / Overwrite */}
                                      <label
                                        className="p-1.5 rounded hover:bg-amber-50 transition-colors cursor-pointer"
                                        title="Replace (overwrite with signed version)"
                                      >
                                        {uploading === `replace-${doc.id}` ? (
                                          <Loader2 className="w-3.5 h-3.5 animate-spin text-amber-400" />
                                        ) : (
                                          <RefreshCw className="w-3.5 h-3.5 text-amber-500" />
                                        )}
                                        <input
                                          type="file"
                                          className="hidden"
                                          disabled={!!uploading}
                                          onChange={(e) => {
                                            const f = e.target.files?.[0]
                                            if (f) handleDocReplace(doc.id, f)
                                            e.target.value = ''
                                          }}
                                        />
                                      </label>
                                      <button
                                        onClick={() => handleDocDownload(doc.id, doc.fileName)}
                                        className="p-1.5 rounded hover:bg-blue-50 transition-colors"
                                        title="Download"
                                      >
                                        <Download className="w-3.5 h-3.5 text-blue-400" />
                                      </button>
                                      <button
                                        onClick={() => handleFileDelete(doc.id)}
                                        className="p-1.5 rounded hover:bg-red-50 transition-colors"
                                        title="Delete"
                                      >
                                        <Trash2 className="w-3.5 h-3.5 text-red-400" />
                                      </button>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              )}

              {/* ── Photos Tab ────────────────────────── */}
              {activeTab === 'photos' && (
                <div className="space-y-6">
                  <h3 className="text-base font-semibold text-slate-900">Property Photos</h3>
                  {filesLoading ? (
                    <div className="flex items-center justify-center h-24">
                      <Loader2 className="w-5 h-5 animate-spin text-primary-500" />
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                      {PHOTO_CATEGORIES.map(cat => {
                        const catPhotos = photos.filter(p => p.category === cat.id)
                        return (
                          <div key={cat.id} className="border border-slate-200 rounded-lg overflow-hidden">
                            <div className="bg-slate-50 px-3 py-2 flex items-center justify-between">
                              <span className="text-xs font-semibold text-slate-600 uppercase">{cat.label}</span>
                              <span className="text-xs text-slate-400">{catPhotos.length}</span>
                            </div>
                            {catPhotos.length > 0 ? (
                              <div className="p-2 space-y-2">
                                {catPhotos.map(photo => (
                                  <div key={photo.id} className="group relative">
                                    {photo.thumbnail ? (
                                      <img
                                        src={`data:image/jpeg;base64,${photo.thumbnail}`}
                                        alt={photo.fileName}
                                        className="w-full h-32 object-cover rounded cursor-pointer hover:opacity-90"
                                        onClick={() => handleViewFullImage(photo.id)}
                                      />
                                    ) : (
                                      <div className="w-full h-32 bg-slate-100 rounded flex items-center justify-center">
                                        <Camera className="w-6 h-6 text-slate-300" />
                                      </div>
                                    )}
                                    <div className="absolute top-1 right-1 opacity-0 group-hover:opacity-100 flex gap-1">
                                      <button
                                        onClick={() => handleViewFullImage(photo.id)}
                                        className="p-1 bg-white/90 rounded shadow-sm hover:bg-white"
                                      >
                                        <Eye className="w-3.5 h-3.5 text-slate-600" />
                                      </button>
                                      <button
                                        onClick={() => handleFileDelete(photo.id)}
                                        className="p-1 bg-white/90 rounded shadow-sm hover:bg-red-50"
                                      >
                                        <Trash2 className="w-3.5 h-3.5 text-red-500" />
                                      </button>
                                    </div>
                                    <p className="text-[10px] text-slate-400 mt-1 truncate">{photo.fileName}</p>
                                  </div>
                                ))}
                              </div>
                            ) : (
                              <div className="p-4 text-center">
                                <Camera className="w-6 h-6 text-slate-200 mx-auto mb-1" />
                                <p className="text-xs text-slate-400">No photos</p>
                              </div>
                            )}
                            {/* Upload button */}
                            <div className="px-2 pb-2">
                              <label className="flex items-center justify-center gap-1.5 w-full px-3 py-2 text-xs font-medium text-primary-600 bg-primary-50 rounded-lg hover:bg-primary-100 cursor-pointer transition-colors">
                                {uploading === cat.id ? (
                                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                ) : (
                                  <Upload className="w-3.5 h-3.5" />
                                )}
                                {uploading === cat.id ? 'Uploading...' : 'Upload'}
                                <input
                                  type="file"
                                  accept="image/*"
                                  className="hidden"
                                  disabled={uploading === cat.id}
                                  onChange={(e) => {
                                    const file = e.target.files?.[0]
                                    if (file) handleFileUpload(cat.id, 'photo', file)
                                    e.target.value = ''
                                  }}
                                />
                              </label>
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  )}
                </div>
              )}

              {/* ── Files / Documents Tab ────────────────── */}
              {activeTab === 'files' && (
                <div className="space-y-6">
                  <div className="flex items-center justify-between">
                    <h3 className="text-base font-semibold text-slate-900">Deal Documents</h3>
                  </div>
                  {filesLoading ? (
                    <div className="flex items-center justify-center h-24">
                      <Loader2 className="w-5 h-5 animate-spin text-primary-500" />
                    </div>
                  ) : (
                    <div className="space-y-4">
                      {DOC_CATEGORIES.map(cat => {
                        const catDocs = documents.filter(d => d.category === cat.id)
                        return (
                          <div key={cat.id} className="border border-slate-200 rounded-lg">
                            <div className="bg-slate-50 px-4 py-2.5 flex items-center justify-between">
                              <span className="text-sm font-medium text-slate-700">{cat.label}</span>
                              <div className="flex items-center gap-2">
                                <span className="text-xs text-slate-400">{catDocs.length} file{catDocs.length !== 1 ? 's' : ''}</span>
                                <label className="flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-primary-600 bg-primary-50 rounded hover:bg-primary-100 cursor-pointer">
                                  {uploading === `doc-${cat.id}` ? (
                                    <Loader2 className="w-3 h-3 animate-spin" />
                                  ) : (
                                    <Upload className="w-3 h-3" />
                                  )}
                                  Upload
                                  <input
                                    type="file"
                                    className="hidden"
                                    disabled={uploading === `doc-${cat.id}`}
                                    onChange={(e) => {
                                      const file = e.target.files?.[0]
                                      if (file) {
                                        setUploading(`doc-${cat.id}`)
                                        handleFileUpload(cat.id, 'document', file).finally(() => setUploading(null))
                                      }
                                      e.target.value = ''
                                    }}
                                  />
                                </label>
                              </div>
                            </div>
                            {catDocs.length > 0 && (
                              <div className="divide-y divide-slate-100">
                                {catDocs.map(doc => (
                                  <div key={doc.id} className="flex items-center justify-between px-4 py-2.5 hover:bg-slate-50">
                                    <div className="flex items-center gap-2.5 min-w-0">
                                      <FileText className="w-4 h-4 text-slate-400 shrink-0" />
                                      <div className="min-w-0">
                                        <p className="text-sm text-slate-700 truncate">{doc.fileName}</p>
                                        <p className="text-xs text-slate-400">
                                          {doc.fileSize ? `${(doc.fileSize / 1024).toFixed(0)} KB` : ''} &middot; {doc.createdAt ? formatDate(doc.createdAt) : ''}
                                        </p>
                                      </div>
                                    </div>
                                    <button
                                      onClick={() => handleFileDelete(doc.id)}
                                      className="p-1.5 rounded hover:bg-red-50 transition-colors"
                                    >
                                      <Trash2 className="w-3.5 h-3.5 text-red-400" />
                                    </button>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        )
                      })}
                    </div>
                  )}
                </div>
              )}

              {/* ── Matched Buyers Tab ─────────────────── */}
              {activeTab === 'matches' && (
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <h3 className="text-base font-semibold text-slate-900">Matched Buyers</h3>
                    {matches.filter(m => m.status === 'pending').length > 0 && (
                      <button
                        onClick={handleSendAllMatches}
                        disabled={sendingAll}
                        className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50"
                      >
                        {sendingAll ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                          <Send className="w-4 h-4" />
                        )}
                        Send All Pending
                      </button>
                    )}
                  </div>

                  <p className="text-xs text-slate-500">
                    When a deal moves to "Under Contract", the system automatically matches buyers whose criteria fit this deal.
                    Review the matches below and send marketing emails when ready.
                  </p>

                  {matchesLoading ? (
                    <div className="flex items-center justify-center h-24">
                      <Loader2 className="w-5 h-5 animate-spin text-primary-500" />
                    </div>
                  ) : matches.length === 0 ? (
                    <div className="text-center py-8">
                      <Users className="w-8 h-8 text-slate-200 mx-auto mb-2" />
                      <p className="text-sm text-slate-400">No matched buyers yet</p>
                      <p className="text-xs text-slate-400 mt-1">Matches are generated when a deal moves to "Under Contract"</p>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {matches.map(match => (
                        <div
                          key={match.id}
                          className={cn(
                            'flex items-center justify-between p-3 rounded-lg border',
                            match.status === 'sent' ? 'bg-green-50 border-green-200' :
                            match.status === 'skipped' ? 'bg-slate-50 border-slate-200 opacity-60' :
                            'bg-white border-slate-200'
                          )}
                        >
                          <div className="flex items-center gap-3 min-w-0">
                            <div className={cn(
                              'w-8 h-8 rounded-full flex items-center justify-center shrink-0',
                              match.status === 'sent' ? 'bg-green-100' :
                              match.status === 'skipped' ? 'bg-slate-100' :
                              'bg-primary-100'
                            )}>
                              <User className={cn(
                                'w-4 h-4',
                                match.status === 'sent' ? 'text-green-600' :
                                match.status === 'skipped' ? 'text-slate-400' :
                                'text-primary-600'
                              )} />
                            </div>
                            <div className="min-w-0">
                              <p className="text-sm font-medium text-slate-800 truncate">
                                {match.buyerName || 'Unknown Buyer'}
                              </p>
                              <p className="text-xs text-slate-500 truncate">
                                {match.buyerEmail}
                                {match.buyingEntity && ` · ${match.buyingEntity}`}
                              </p>
                            </div>
                          </div>

                          <div className="flex items-center gap-2 shrink-0">
                            {match.status === 'sent' ? (
                              <span className="flex items-center gap-1 text-xs font-medium text-green-700 bg-green-100 px-2.5 py-1 rounded-full">
                                <Mail className="w-3 h-3" />
                                Sent {match.sentAt ? formatDate(match.sentAt) : ''}
                              </span>
                            ) : match.status === 'skipped' ? (
                              <span className="text-xs font-medium text-slate-500 bg-slate-100 px-2.5 py-1 rounded-full">
                                Skipped
                              </span>
                            ) : (
                              <>
                                <button
                                  onClick={() => handleSendMatch(match.id)}
                                  disabled={sendingMatch === match.id}
                                  className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50"
                                >
                                  {sendingMatch === match.id ? (
                                    <Loader2 className="w-3 h-3 animate-spin" />
                                  ) : (
                                    <Send className="w-3 h-3" />
                                  )}
                                  Send
                                </button>
                                <button
                                  onClick={() => handleSkipMatch(match.id)}
                                  className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-slate-600 bg-slate-100 rounded-lg hover:bg-slate-200"
                                >
                                  <SkipForward className="w-3 h-3" />
                                  Skip
                                </button>
                              </>
                            )}
                            <button
                              onClick={() => handleDeleteMatch(match.id)}
                              className="p-1.5 rounded hover:bg-red-50"
                            >
                              <Trash2 className="w-3.5 h-3.5 text-red-400" />
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Summary */}
                  {matches.length > 0 && (
                    <div className="flex gap-4 pt-2 border-t border-slate-100">
                      <span className="text-xs text-slate-500">
                        {matches.filter(m => m.status === 'pending').length} pending
                      </span>
                      <span className="text-xs text-green-600">
                        {matches.filter(m => m.status === 'sent').length} sent
                      </span>
                      <span className="text-xs text-slate-400">
                        {matches.filter(m => m.status === 'skipped').length} skipped
                      </span>
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

              {/* (Old Documents tab removed — replaced by Files tab above) */}

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

      {/* ── Lightbox Modal ──────────────────────────────────── */}
      {lightboxImg && (
        <div
          className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4"
          onClick={() => setLightboxImg(null)}
        >
          <button
            onClick={() => setLightboxImg(null)}
            className="absolute top-4 right-4 p-2 bg-white/20 rounded-full hover:bg-white/40 transition-colors"
          >
            <X className="w-6 h-6 text-white" />
          </button>
          <img
            src={lightboxImg}
            alt="Full size"
            className="max-w-full max-h-[90vh] object-contain rounded-lg shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}

      {/* ── Add Task / Event Modal ──────────────────────────── */}
      <AddTaskModal
        isOpen={showAddTaskModal}
        onClose={() => setShowAddTaskModal(false)}
        dealId={dealId}
        dealAddress={deal?.address}
        contactId={deal?.contactId}
      />
    </div>
  )
}
