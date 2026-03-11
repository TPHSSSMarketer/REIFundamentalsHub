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
  Sparkles,
} from 'lucide-react'
import { toast } from 'sonner'
import { useQueryClient } from '@tanstack/react-query'
import { useDeal, useUpdateDeal, usePipelines } from '@/hooks/useApi'
import { formatCurrency, formatDate, cn } from '@/utils/helpers'
import { getAuthHeader } from '@/services/auth'
import DealLienManager from './DealLienManager'
import DealNegotiationsTab from './DealNegotiationsTab'
import { getTemplates, generateContractFromDeal } from '@/services/documentsApi'
import { createPortfolioProperty, deleteDeal } from '@/services/crmApi'
import { analyzeDocument, analyzePropertyPhotos, type DocumentAnalysis, type PhotoAnalysisResult } from '@/services/aiApi'
import AddTaskModal from './AddTaskModal'
import ContractChecklist from '@/components/Documents/ContractChecklist'
import DealAnalyzer from './DealAnalyzer'
import DealExpenditures from './DealExpenditures'
import AIUnderwriting from './AIUnderwriting'
import PropertyMap from '@/components/Map/PropertyMap'
import ContactSmsThread from '@/components/Phone/ContactSmsThread'
import type { Deal, DealFile, DealBuyerMatch } from '@/types'

const BASE_URL = import.meta.env.VITE_REI_SERVER_URL ?? 'http://localhost:8001'

// ── Helpers ─────────────────────────────────────────────────────────

async function fetchDealDetail(dealId: string) {
  const res = await fetch(`${BASE_URL}/api/deals/${dealId}`, {
    credentials: 'include',
    headers: getAuthHeader(),
  })
  if (!res.ok) return null
  return res.json()
}

async function addDealNote(dealId: string, content: string) {
  const res = await fetch(`${BASE_URL}/api/deals/${dealId}/notes`, {
    method: 'POST',
    credentials: 'include',
    headers: { ...getAuthHeader(), 'Content-Type': 'application/json' },
    body: JSON.stringify({ content }),
  })
  if (!res.ok) throw new Error('Failed to add note')
  return res.json()
}

async function deleteDealNote(dealId: string, noteId: string) {
  const res = await fetch(`${BASE_URL}/api/deals/${dealId}/notes/${noteId}`, {
    method: 'DELETE',
    credentials: 'include',
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
}

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
  { id: 'underwriting_report', label: 'Property Underwriting' },
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
  { id: 'notes', label: 'Notes', icon: StickyNote },
  { id: 'analyzer', label: 'Deal Analyzer', icon: Calculator },
  { id: 'photos', label: 'Photos', icon: Camera },
  { id: 'research', label: 'Property Research', icon: Building2 },
  { id: 'documents', label: 'Documents', icon: FolderOpen },
  { id: 'negotiations', label: 'Negotiations', icon: HeartHandshake },
  { id: 'underwriting', label: 'AI Underwriting', icon: Sparkles },
  { id: 'checklist', label: 'Contracts & Checklist', icon: ClipboardList },
  { id: 'expenditures', label: 'Expenditures', icon: Receipt },
  { id: 'pof', label: 'Proof of Funds', icon: Shield },
  { id: 'files', label: 'Files', icon: FileText },
  { id: 'matches', label: 'Matched Buyers', icon: Users },
  { id: 'comms', label: 'SMS & Calls', icon: Send },
] as const

type TabId = (typeof TABS)[number]['id']

// ── EditableField Component ─────────────────────────────────────────

function EditableField({
  label,
  value,
  field,
  dealId,
  updateDeal,
  format = 'currency',
  className = ''
}: {
  label: string
  value: number | string | null | undefined
  field: string
  dealId: string
  updateDeal: any
  format?: 'currency' | 'number' | 'text' | 'percent'
  className?: string
}) {
  const [editing, setEditing] = useState(false)
  const [editValue, setEditValue] = useState('')

  const handleStartEdit = () => {
    setEditValue(value != null ? String(value) : '')
    setEditing(true)
  }

  const handleSave = () => {
    setEditing(false)
    const parsed = format === 'text' ? editValue :
                   format === 'percent' ? parseFloat(editValue) || null :
                   parseFloat(editValue.replace(/[,$]/g, '')) || null
    updateDeal.mutate({ id: dealId, [field]: parsed })
  }

  if (editing) {
    return (
      <div className={cn("flex items-center justify-between", className)}>
        <span className="text-xs text-slate-500">{label}</span>
        <input
          autoFocus
          className="text-sm font-medium text-right bg-white border border-primary-300 rounded px-2 py-0.5 w-32 focus:outline-none focus:ring-1 focus:ring-primary-500"
          value={editValue}
          onChange={(e) => setEditValue(e.target.value)}
          onBlur={handleSave}
          onKeyDown={(e) => { if (e.key === 'Enter') handleSave(); if (e.key === 'Escape') setEditing(false); }}
        />
      </div>
    )
  }

  const displayValue = value != null ? (
    format === 'currency' ? formatCurrency(Number(value)) :
    format === 'percent' ? `${value}%` :
    format === 'number' ? Number(value).toLocaleString() :
    String(value)
  ) : '—'

  return (
    <div className={cn("flex items-center justify-between cursor-pointer group", className)} onClick={handleStartEdit}>
      <span className="text-xs text-slate-500">{label}</span>
      <span className="text-sm font-medium text-slate-800 group-hover:text-primary-600 group-hover:underline">{displayValue}</span>
    </div>
  )
}

// ── Main Component ──────────────────────────────────────────────────

export default function DealDetailPage() {
  const { dealId } = useParams<{ dealId: string }>()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
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

  // AI Document Analysis
  const [analyzingFile, setAnalyzingFile] = useState<string | null>(null)
  const [docAnalysis, setDocAnalysis] = useState<Record<string, DocumentAnalysis>>({})
  const [expandedAnalysis, setExpandedAnalysis] = useState<string | null>(null)

  // AI Photo Analysis
  const [analyzingPhotos, setAnalyzingPhotos] = useState(false)
  const [photoAnalysis, setPhotoAnalysis] = useState<PhotoAnalysisResult | null>(null)

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

  // SMS & Calls
  const [contactPhone, setContactPhone] = useState<string>('')

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
        credentials: 'include',
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
        credentials: 'include',
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

  // Load contact phone number for SMS & Calls tab
  useEffect(() => {
    if (!deal?.contactId) return
    const loadContact = async () => {
      try {
        const res = await fetch(`${BASE_URL}/api/contacts/${deal.contactId}`, {
          headers: getAuthHeader(),
          credentials: 'include',
        })
        if (res.ok) {
          const contact = await res.json()
          setContactPhone(contact.phone || '')
        }
      } catch {}
    }
    loadContact()
  }, [deal?.contactId])

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
          credentials: 'include',
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
        credentials: 'include',
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
        credentials: 'include',
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
        credentials: 'include',
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
        credentials: 'include',
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
        credentials: 'include',
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
        credentials: 'include',
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
        credentials: 'include',
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
        credentials: 'include',
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
        credentials: 'include',
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
        credentials: 'include',
      })
      if (!res.ok) throw new Error('Delete failed')
      toast.success('Match removed')
      await loadMatches()
    } catch {
      toast.error('Failed to remove match')
    }
  }

  const handleDeleteDeal = async () => {
    if (!dealId) return
    if (!confirm('Are you sure you want to delete this deal? This cannot be undone.')) return
    try {
      await deleteDeal(dealId)
      await queryClient.invalidateQueries({ queryKey: ['deals'] })
      toast.success('Deal deleted')
      navigate('/pipeline')
    } catch {
      toast.error('Failed to delete deal')
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
            <button
              onClick={handleDeleteDeal}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-red-50 text-red-700 rounded-lg hover:bg-red-100 transition-colors min-h-[36px] shrink-0"
            >
              <Trash2 className="w-3.5 h-3.5" /> Delete Deal
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
            <div className="flex flex-wrap gap-1.5">
              {stages.map((stage) => {
                const cfg = STAGE_CONFIG[stage.id] || STAGE_CONFIG[stage.name?.toLowerCase().replace(/\s+/g, '_')] || { label: stage.name, color: 'text-slate-700', bg: 'bg-slate-100' }
                const isActive = deal.stage === stage.id
                return (
                  <button
                    key={stage.id}
                    onClick={() => handleStageChange(stage.id)}
                    className={cn(
                      'px-3 py-1.5 text-xs font-medium rounded-full transition-all whitespace-nowrap min-h-[32px]',
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
            <div className="space-y-3">
              {deal.listPrice != null && (
                <div className="p-3 bg-slate-50 rounded-lg">
                  <EditableField
                    label="List Price"
                    value={deal.listPrice}
                    field="listPrice"
                    dealId={dealId || ''}
                    updateDeal={updateDeal}
                    format="currency"
                  />
                </div>
              )}
              {deal.purchasePrice != null && (
                <div className="p-3 bg-green-50 rounded-lg">
                  <EditableField
                    label="Purchase Price"
                    value={deal.purchasePrice}
                    field="purchasePrice"
                    dealId={dealId || ''}
                    updateDeal={updateDeal}
                    format="currency"
                  />
                </div>
              )}
              {deal.arv != null && (
                <div className="p-3 bg-primary-50 rounded-lg">
                  <EditableField
                    label="ARV"
                    value={deal.arv}
                    field="arv"
                    dealId={dealId || ''}
                    updateDeal={updateDeal}
                    format="currency"
                  />
                </div>
              )}
              {deal.rehabEstimate != null && (
                <div className="p-3 bg-amber-50 rounded-lg">
                  <EditableField
                    label="Rehab Estimate"
                    value={deal.rehabEstimate}
                    field="rehabEstimate"
                    dealId={dealId || ''}
                    updateDeal={updateDeal}
                    format="currency"
                  />
                </div>
              )}
              {deal.monthlyRent != null && (
                <div className="p-3 bg-slate-50 rounded-lg">
                  <EditableField
                    label="Monthly Rent"
                    value={deal.monthlyRent}
                    field="monthlyRent"
                    dealId={dealId || ''}
                    updateDeal={updateDeal}
                    format="currency"
                  />
                </div>
              )}
              {deal.allInCost != null && (
                <div className="p-3 bg-slate-50 rounded-lg">
                  <EditableField
                    label="All-In Cost"
                    value={deal.allInCost}
                    field="allInCost"
                    dealId={dealId || ''}
                    updateDeal={updateDeal}
                    format="currency"
                  />
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
              {deal.ownerName && (
                <div className="flex items-center justify-between">
                  <span className="text-sm text-slate-500 flex items-center gap-1.5">
                    <User className="w-3.5 h-3.5" />
                    Owner
                  </span>
                  <span className="text-sm font-medium text-slate-800">{deal.ownerName}</span>
                </div>
              )}
              {deal.mailingAddress && (
                <div className="flex flex-col gap-0.5">
                  <span className="text-sm text-slate-500 flex items-center gap-1.5">
                    <Mail className="w-3.5 h-3.5" />
                    Mailing Address
                  </span>
                  <span className="text-sm font-medium text-slate-800">
                    {deal.mailingAddress}
                    {deal.mailingCity && `, ${deal.mailingCity}`}
                    {deal.mailingState && `, ${deal.mailingState}`}
                    {deal.mailingZip && ` ${deal.mailingZip}`}
                  </span>
                </div>
              )}
              {deal.source && (
                <div className="flex items-center justify-between">
                  <span className="text-sm text-slate-500">Source</span>
                  <span className="text-sm font-medium text-slate-800">{SOURCE_LABELS[deal.source || ''] || deal.source}</span>
                </div>
              )}
              {deal.campaignName && (
                <div className="flex items-center justify-between">
                  <span className="text-sm text-slate-500">Campaign</span>
                  <span className="text-sm font-medium text-slate-800">
                    {deal.campaignName}
                    {deal.campaignType && (
                      <span className="ml-1 text-xs text-slate-400">
                        ({deal.campaignType === 'sms' ? 'SMS' : deal.campaignType === 'email' ? 'Email' : deal.campaignType})
                      </span>
                    )}
                  </span>
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
                  <EditableField
                    label="Property Type"
                    value={deal.propertyType}
                    field="propertyType"
                    dealId={dealId || ''}
                    updateDeal={updateDeal}
                    format="text"
                  />
                )}
                {deal.bedrooms != null && (
                  <EditableField
                    label="Bedrooms"
                    value={deal.bedrooms}
                    field="bedrooms"
                    dealId={dealId || ''}
                    updateDeal={updateDeal}
                    format="number"
                  />
                )}
                {deal.bathrooms != null && (
                  <EditableField
                    label="Bathrooms"
                    value={deal.bathrooms}
                    field="bathrooms"
                    dealId={dealId || ''}
                    updateDeal={updateDeal}
                    format="number"
                  />
                )}
                {deal.squareFootage != null && (
                  <EditableField
                    label="Sq Ft"
                    value={deal.squareFootage}
                    field="squareFootage"
                    dealId={dealId || ''}
                    updateDeal={updateDeal}
                    format="number"
                  />
                )}
                {deal.lotSize && (
                  <EditableField
                    label="Lot Size"
                    value={deal.lotSize}
                    field="lotSize"
                    dealId={dealId || ''}
                    updateDeal={updateDeal}
                    format="text"
                  />
                )}
                {deal.yearBuilt != null && (
                  <EditableField
                    label="Year Built"
                    value={deal.yearBuilt}
                    field="yearBuilt"
                    dealId={dealId || ''}
                    updateDeal={updateDeal}
                    format="number"
                  />
                )}
                {deal.garage && (
                  <EditableField
                    label="Garage"
                    value={deal.garage}
                    field="garage"
                    dealId={dealId || ''}
                    updateDeal={updateDeal}
                    format="text"
                  />
                )}
                {deal.propertyCondition && (
                  <EditableField
                    label="Condition"
                    value={deal.propertyCondition}
                    field="propertyCondition"
                    dealId={dealId || ''}
                    updateDeal={updateDeal}
                    format="text"
                  />
                )}
                {deal.occupancyStatus && (
                  <EditableField
                    label="Occupancy"
                    value={deal.occupancyStatus}
                    field="occupancyStatus"
                    dealId={dealId || ''}
                    updateDeal={updateDeal}
                    format="text"
                  />
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

          {/* Liens & Encumbrances (dynamic — replaces old mortgage sections) */}
          {dealId && (
            <DealLienManager dealId={dealId} initialLiens={deal.liens} />
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
            <div className="flex flex-wrap gap-1.5 p-3 border-b border-slate-200">
              {TABS.map(({ id, label, icon: Icon }) => (
                <button
                  key={id}
                  onClick={() => setActiveTab(id)}
                  className={cn(
                    'flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-full transition-all whitespace-nowrap min-h-[32px]',
                    activeTab === id
                      ? 'bg-blue-100 text-blue-700 ring-2 ring-offset-1 ring-blue-400'
                      : 'bg-slate-50 text-slate-500 hover:bg-slate-100 hover:text-slate-700'
                  )}
                >
                  <Icon className="w-3.5 h-3.5" />
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
                  <div className="flex items-center justify-between">
                    <h3 className="text-base font-semibold text-slate-900">Property Photos</h3>
                    {photos.length > 0 && (
                      <button
                        onClick={async () => {
                          if (!dealId) return
                          setAnalyzingPhotos(true)
                          try {
                            const result = await analyzePropertyPhotos(dealId)
                            setPhotoAnalysis(result)
                            toast.success('Photo analysis complete!')
                          } catch (err: any) {
                            toast.error(err.message || 'Photo analysis failed')
                          } finally {
                            setAnalyzingPhotos(false)
                          }
                        }}
                        disabled={analyzingPhotos}
                        className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-amber-700 bg-amber-50 rounded-lg hover:bg-amber-100 disabled:opacity-50"
                      >
                        {analyzingPhotos ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        ) : (
                          <Sparkles className="w-3.5 h-3.5" />
                        )}
                        {analyzingPhotos ? 'Analyzing...' : 'Analyze All Photos'}
                      </button>
                    )}
                  </div>

                  {/* AI Photo Analysis Summary */}
                  {photoAnalysis && photoAnalysis.summary && (
                    <div className="p-4 bg-gradient-to-r from-amber-50 to-orange-50 border border-amber-200 rounded-lg">
                      <div className="flex items-center gap-3 mb-3">
                        <div className={cn(
                          'w-10 h-10 rounded-full flex items-center justify-center text-lg font-bold text-white',
                          photoAnalysis.summary.overall_grade === 'A' ? 'bg-green-500' :
                          photoAnalysis.summary.overall_grade === 'B' ? 'bg-blue-500' :
                          photoAnalysis.summary.overall_grade === 'C' ? 'bg-yellow-500' :
                          photoAnalysis.summary.overall_grade === 'D' ? 'bg-orange-500' :
                          'bg-red-500'
                        )}>
                          {photoAnalysis.summary.overall_grade}
                        </div>
                        <div>
                          <p className="text-sm font-semibold text-slate-800">Overall Property Condition</p>
                          <p className="text-xs text-slate-600">
                            Estimated Repairs: {typeof photoAnalysis.summary.total_estimated_repairs === 'number'
                              ? formatCurrency(photoAnalysis.summary.total_estimated_repairs)
                              : photoAnalysis.summary.total_estimated_repairs}
                          </p>
                        </div>
                      </div>
                      <p className="text-sm text-slate-700 mb-2">{photoAnalysis.summary.condition_description}</p>
                      {photoAnalysis.summary.key_concerns?.length > 0 && (
                        <div className="mt-2">
                          <p className="text-xs font-medium text-slate-600 mb-1">Key Concerns:</p>
                          <div className="flex flex-wrap gap-1.5">
                            {photoAnalysis.summary.key_concerns.map((concern, i) => (
                              <span key={i} className="px-2 py-0.5 text-xs bg-red-100 text-red-700 rounded-full">{concern}</span>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )}

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
                                    {/* Per-photo AI analysis badge */}
                                    {photoAnalysis?.per_photo && (() => {
                                      const photoIdx = photos.indexOf(photo)
                                      const pa = photoAnalysis.per_photo.find(p => p.photo_index === photoIdx)
                                      if (!pa) return null
                                      return (
                                        <div className="mt-1 flex items-center gap-1.5">
                                          <span className={cn(
                                            'px-1.5 py-0.5 text-[10px] font-bold rounded',
                                            pa.condition_grade === 'A' ? 'bg-green-100 text-green-700' :
                                            pa.condition_grade === 'B' ? 'bg-blue-100 text-blue-700' :
                                            pa.condition_grade === 'C' ? 'bg-yellow-100 text-yellow-700' :
                                            pa.condition_grade === 'D' ? 'bg-orange-100 text-orange-700' :
                                            'bg-red-100 text-red-700'
                                          )}>
                                            {pa.condition_grade}
                                          </span>
                                          <span className="text-[10px] text-slate-500">{pa.repair_cost_range}</span>
                                        </div>
                                      )
                                    })()}
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

              {/* ── Property Research Tab ─────────────── */}
              {activeTab === 'research' && (
                <div className="space-y-5">
                  <h3 className="text-base font-semibold text-slate-900">Property Research</h3>

                  {/* ATTOM Location & Parcel */}
                  {(deal.county || deal.subdivision || deal.schoolDistrict || deal.zoning || deal.apn || deal.fips || deal.absenteeOwner || deal.legalDescription) && (
                    <div className="bg-white rounded-xl border border-slate-200 p-5">
                      <h3 className="text-sm font-semibold text-slate-500 uppercase tracking-wide mb-3 flex items-center gap-1.5">
                        <MapPin className="w-3.5 h-3.5" />
                        Location & Parcel
                      </h3>
                      <div className="space-y-2.5">
                        {deal.county && (
                          <div className="flex items-center justify-between">
                            <span className="text-sm text-slate-500">County</span>
                            <span className="text-sm font-medium text-slate-800">{deal.county}</span>
                          </div>
                        )}
                        {deal.subdivision && (
                          <div className="flex items-center justify-between">
                            <span className="text-sm text-slate-500">Subdivision</span>
                            <span className="text-sm font-medium text-slate-800">{deal.subdivision}</span>
                          </div>
                        )}
                        {deal.schoolDistrict && (
                          <div className="flex items-center justify-between">
                            <span className="text-sm text-slate-500">School District</span>
                            <span className="text-sm font-medium text-slate-800">{deal.schoolDistrict}</span>
                          </div>
                        )}
                        {deal.zoning && (
                          <div className="flex items-center justify-between">
                            <span className="text-sm text-slate-500">Zoning</span>
                            <span className="text-sm font-medium text-slate-800">{deal.zoning}</span>
                          </div>
                        )}
                        {deal.apn && (
                          <div className="flex items-center justify-between">
                            <span className="text-sm text-slate-500">APN</span>
                            <span className="text-sm font-medium text-slate-800">{deal.apn}</span>
                          </div>
                        )}
                        {deal.fips && (
                          <div className="flex items-center justify-between">
                            <span className="text-sm text-slate-500">FIPS</span>
                            <span className="text-sm font-medium text-slate-800">{deal.fips}</span>
                          </div>
                        )}
                        {deal.absenteeOwner && (
                          <div className="flex items-center justify-between">
                            <span className="text-sm text-slate-500">Absentee Owner</span>
                            <span className={cn(
                              'text-sm font-semibold px-2 py-0.5 rounded-full',
                              deal.absenteeOwner === 'Y' || deal.absenteeOwner === 'Yes'
                                ? 'bg-amber-100 text-amber-700'
                                : 'bg-slate-100 text-slate-600'
                            )}>
                              {deal.absenteeOwner === 'Y' ? 'Yes' : deal.absenteeOwner}
                            </span>
                          </div>
                        )}
                        {deal.lotSizeAcres != null && (
                          <div className="flex items-center justify-between">
                            <span className="text-sm text-slate-500">Lot Size (Acres)</span>
                            <span className="text-sm font-medium text-slate-800">{deal.lotSizeAcres.toFixed(2)}</span>
                          </div>
                        )}
                        {deal.legalDescription && (
                          <div>
                            <p className="text-sm text-slate-500 mb-1">Legal Description</p>
                            <p className="text-sm text-slate-700 bg-slate-50 rounded-lg p-2">{deal.legalDescription}</p>
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {/* ATTOM Construction & Features */}
                  {(deal.constructionType || deal.exteriorWalls || deal.roofType || deal.foundationType || deal.basementType || deal.heating || deal.cooling || deal.waterType || deal.sewerType || deal.pool || deal.fireplaceCount || deal.parkingSpaces || deal.stories || deal.totalRooms) && (
                    <div className="bg-white rounded-xl border border-slate-200 p-5">
                      <h3 className="text-sm font-semibold text-slate-500 uppercase tracking-wide mb-3 flex items-center gap-1.5">
                        <Building2 className="w-3.5 h-3.5" />
                        Construction & Features
                      </h3>
                      <div className="space-y-2.5">
                        {deal.stories != null && (
                          <div className="flex items-center justify-between">
                            <span className="text-sm text-slate-500">Stories</span>
                            <span className="text-sm font-medium text-slate-800">{deal.stories}</span>
                          </div>
                        )}
                        {deal.totalRooms != null && (
                          <div className="flex items-center justify-between">
                            <span className="text-sm text-slate-500">Total Rooms</span>
                            <span className="text-sm font-medium text-slate-800">{deal.totalRooms}</span>
                          </div>
                        )}
                        {deal.constructionType && (
                          <div className="flex items-center justify-between">
                            <span className="text-sm text-slate-500">Construction</span>
                            <span className="text-sm font-medium text-slate-800">{deal.constructionType}</span>
                          </div>
                        )}
                        {deal.exteriorWalls && (
                          <div className="flex items-center justify-between">
                            <span className="text-sm text-slate-500">Exterior Walls</span>
                            <span className="text-sm font-medium text-slate-800">{deal.exteriorWalls}</span>
                          </div>
                        )}
                        {deal.roofType && (
                          <div className="flex items-center justify-between">
                            <span className="text-sm text-slate-500">Roof</span>
                            <span className="text-sm font-medium text-slate-800">{deal.roofType}</span>
                          </div>
                        )}
                        {deal.foundationType && (
                          <div className="flex items-center justify-between">
                            <span className="text-sm text-slate-500">Foundation</span>
                            <span className="text-sm font-medium text-slate-800">{deal.foundationType}</span>
                          </div>
                        )}
                        {deal.basementType && (
                          <div className="flex items-center justify-between">
                            <span className="text-sm text-slate-500">Basement</span>
                            <span className="text-sm font-medium text-slate-800">
                              {deal.basementType}{deal.basementSqft ? ` (${deal.basementSqft.toLocaleString()} sqft)` : ''}
                            </span>
                          </div>
                        )}
                        {deal.heating && (
                          <div className="flex items-center justify-between">
                            <span className="text-sm text-slate-500">Heating</span>
                            <span className="text-sm font-medium text-slate-800">{deal.heating}</span>
                          </div>
                        )}
                        {deal.cooling && (
                          <div className="flex items-center justify-between">
                            <span className="text-sm text-slate-500">Cooling</span>
                            <span className="text-sm font-medium text-slate-800">{deal.cooling}</span>
                          </div>
                        )}
                        {deal.waterType && (
                          <div className="flex items-center justify-between">
                            <span className="text-sm text-slate-500">Water</span>
                            <span className="text-sm font-medium text-slate-800">{deal.waterType}</span>
                          </div>
                        )}
                        {deal.sewerType && (
                          <div className="flex items-center justify-between">
                            <span className="text-sm text-slate-500">Sewer</span>
                            <span className="text-sm font-medium text-slate-800">{deal.sewerType}</span>
                          </div>
                        )}
                        {deal.pool && (
                          <div className="flex items-center justify-between">
                            <span className="text-sm text-slate-500">Pool</span>
                            <span className="text-sm font-medium text-slate-800">{deal.pool}</span>
                          </div>
                        )}
                        {deal.fireplaceCount != null && deal.fireplaceCount > 0 && (
                          <div className="flex items-center justify-between">
                            <span className="text-sm text-slate-500">Fireplaces</span>
                            <span className="text-sm font-medium text-slate-800">{deal.fireplaceCount}</span>
                          </div>
                        )}
                        {deal.parkingSpaces != null && (
                          <div className="flex items-center justify-between">
                            <span className="text-sm text-slate-500">Parking Spaces</span>
                            <span className="text-sm font-medium text-slate-800">{deal.parkingSpaces}</span>
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {/* ATTOM Tax Assessment */}
                  {(deal.marketValue != null || deal.assessedValue != null || deal.taxYear != null) && (
                    <div className="bg-white rounded-xl border border-slate-200 p-5">
                      <h3 className="text-sm font-semibold text-slate-500 uppercase tracking-wide mb-3 flex items-center gap-1.5">
                        <Landmark className="w-3.5 h-3.5" />
                        Tax Assessment {deal.taxYear ? `(${deal.taxYear})` : ''}
                      </h3>
                      <div className="space-y-2.5">
                        {deal.marketValue != null && (
                          <div className="flex items-center justify-between">
                            <span className="text-sm text-slate-500">Market Value (Total)</span>
                            <span className="text-sm font-bold text-slate-800">{formatCurrency(deal.marketValue)}</span>
                          </div>
                        )}
                        {deal.marketLandValue != null && (
                          <div className="flex items-center justify-between">
                            <span className="text-sm text-slate-500 pl-3">Land</span>
                            <span className="text-sm font-medium text-slate-700">{formatCurrency(deal.marketLandValue)}</span>
                          </div>
                        )}
                        {deal.marketImprovementValue != null && (
                          <div className="flex items-center justify-between">
                            <span className="text-sm text-slate-500 pl-3">Improvements</span>
                            <span className="text-sm font-medium text-slate-700">{formatCurrency(deal.marketImprovementValue)}</span>
                          </div>
                        )}
                        {deal.assessedValue != null && (
                          <div className="flex items-center justify-between mt-2">
                            <span className="text-sm text-slate-500">Assessed Value (Total)</span>
                            <span className="text-sm font-bold text-slate-800">{formatCurrency(deal.assessedValue)}</span>
                          </div>
                        )}
                        {deal.assessedLandValue != null && (
                          <div className="flex items-center justify-between">
                            <span className="text-sm text-slate-500 pl-3">Land</span>
                            <span className="text-sm font-medium text-slate-700">{formatCurrency(deal.assessedLandValue)}</span>
                          </div>
                        )}
                        {deal.assessedImprovementValue != null && (
                          <div className="flex items-center justify-between">
                            <span className="text-sm text-slate-500 pl-3">Improvements</span>
                            <span className="text-sm font-medium text-slate-700">{formatCurrency(deal.assessedImprovementValue)}</span>
                          </div>
                        )}
                        {deal.propertyTaxAnnual != null && (
                          <div className="flex items-center justify-between mt-2">
                            <span className="text-sm text-slate-500">Annual Tax</span>
                            <span className="text-sm font-bold text-slate-800">{formatCurrency(deal.propertyTaxAnnual)}</span>
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {/* ATTOM Last Sale */}
                  {(deal.lastSaleDate || deal.lastSalePrice != null) && (
                    <div className="bg-white rounded-xl border border-slate-200 p-5">
                      <h3 className="text-sm font-semibold text-slate-500 uppercase tracking-wide mb-3 flex items-center gap-1.5">
                        <Banknote className="w-3.5 h-3.5" />
                        Last Sale
                      </h3>
                      <div className="space-y-2.5">
                        {deal.lastSaleDate && (
                          <div className="flex items-center justify-between">
                            <span className="text-sm text-slate-500">Date</span>
                            <span className="text-sm font-medium text-slate-800">{deal.lastSaleDate}</span>
                          </div>
                        )}
                        {deal.lastSalePrice != null && (
                          <div className="flex items-center justify-between">
                            <span className="text-sm text-slate-500">Price</span>
                            <span className="text-sm font-bold text-slate-800">{formatCurrency(deal.lastSalePrice)}</span>
                          </div>
                        )}
                        {deal.lastSaleBuyer && (
                          <div className="flex items-center justify-between">
                            <span className="text-sm text-slate-500">Buyer</span>
                            <span className="text-sm font-medium text-slate-800">{deal.lastSaleBuyer}</span>
                          </div>
                        )}
                        {deal.lastSaleSeller && (
                          <div className="flex items-center justify-between">
                            <span className="text-sm text-slate-500">Seller</span>
                            <span className="text-sm font-medium text-slate-800">{deal.lastSaleSeller}</span>
                          </div>
                        )}
                      </div>
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
                                  <div key={doc.id} className="px-4 py-2.5 hover:bg-slate-50">
                                    <div className="flex items-center justify-between">
                                      <div className="flex items-center gap-2.5 min-w-0">
                                        <FileText className="w-4 h-4 text-slate-400 shrink-0" />
                                        <div className="min-w-0">
                                          <p className="text-sm text-slate-700 truncate">{doc.fileName}</p>
                                          <p className="text-xs text-slate-400">
                                            {doc.fileSize ? `${(doc.fileSize / 1024).toFixed(0)} KB` : ''} &middot; {doc.createdAt ? formatDate(doc.createdAt) : ''}
                                          </p>
                                        </div>
                                      </div>
                                      <div className="flex items-center gap-1">
                                        <button
                                          onClick={async () => {
                                            if (!dealId) return
                                            setAnalyzingFile(doc.id)
                                            try {
                                              const result = await analyzeDocument(doc.id, dealId, cat.id)
                                              setDocAnalysis(prev => ({ ...prev, [doc.id]: result }))
                                              setExpandedAnalysis(doc.id)
                                              toast.success('Document analysis complete!')
                                            } catch (err: any) {
                                              toast.error(err.message || 'Analysis failed')
                                            } finally {
                                              setAnalyzingFile(null)
                                            }
                                          }}
                                          disabled={analyzingFile === doc.id}
                                          className="p-1.5 rounded hover:bg-amber-50 transition-colors"
                                          title="Analyze with AI"
                                        >
                                          {analyzingFile === doc.id ? (
                                            <Loader2 className="w-3.5 h-3.5 animate-spin text-amber-500" />
                                          ) : (
                                            <Sparkles className="w-3.5 h-3.5 text-amber-500" />
                                          )}
                                        </button>
                                        <button
                                          onClick={() => handleFileDelete(doc.id)}
                                          className="p-1.5 rounded hover:bg-red-50 transition-colors"
                                        >
                                          <Trash2 className="w-3.5 h-3.5 text-red-400" />
                                        </button>
                                      </div>
                                    </div>
                                    {/* AI Analysis Results */}
                                    {docAnalysis[doc.id] && (
                                      <div className="mt-2">
                                        <button
                                          onClick={() => setExpandedAnalysis(expandedAnalysis === doc.id ? null : doc.id)}
                                          className="flex items-center gap-1 text-xs font-medium text-amber-600 hover:text-amber-700"
                                        >
                                          <Sparkles className="w-3 h-3" />
                                          AI Analysis
                                          {expandedAnalysis === doc.id ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                                        </button>
                                        {expandedAnalysis === doc.id && (
                                          <div className="mt-2 p-3 bg-amber-50 border border-amber-200 rounded-lg text-sm space-y-3">
                                            <div>
                                              <p className="font-medium text-slate-800 mb-1">Summary</p>
                                              <p className="text-slate-600 text-xs leading-relaxed">{docAnalysis[doc.id].summary}</p>
                                            </div>
                                            {docAnalysis[doc.id].key_issues?.length > 0 && (
                                              <div>
                                                <p className="font-medium text-slate-800 mb-1">Key Issues</p>
                                                <div className="space-y-1.5">
                                                  {docAnalysis[doc.id].key_issues.map((issue, i) => (
                                                    <div key={i} className="flex items-start gap-2">
                                                      <span className={cn(
                                                        'px-1.5 py-0.5 text-[10px] font-bold rounded shrink-0 mt-0.5',
                                                        issue.severity === 'high' ? 'bg-red-100 text-red-700' :
                                                        issue.severity === 'medium' ? 'bg-yellow-100 text-yellow-700' :
                                                        'bg-green-100 text-green-700'
                                                      )}>
                                                        {issue.severity.toUpperCase()}
                                                      </span>
                                                      <div>
                                                        <p className="text-xs font-medium text-slate-700">{issue.issue}</p>
                                                        <p className="text-xs text-slate-500">{issue.detail}</p>
                                                      </div>
                                                    </div>
                                                  ))}
                                                </div>
                                              </div>
                                            )}
                                            {docAnalysis[doc.id].risk_flags?.length > 0 && (
                                              <div>
                                                <p className="font-medium text-slate-800 mb-1">Risk Flags</p>
                                                <div className="flex flex-wrap gap-1">
                                                  {docAnalysis[doc.id].risk_flags.map((flag, i) => (
                                                    <span key={i} className="px-2 py-0.5 text-xs bg-red-100 text-red-700 rounded-full">{flag}</span>
                                                  ))}
                                                </div>
                                              </div>
                                            )}
                                            <div>
                                              <p className="font-medium text-slate-800 mb-1">Recommendation</p>
                                              <p className="text-slate-600 text-xs">{docAnalysis[doc.id].recommendation}</p>
                                            </div>
                                          </div>
                                        )}
                                      </div>
                                    )}
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

              {/* ── AI Underwriting Tab ────────────────── */}
              {activeTab === 'underwriting' && dealId && (
                <AIUnderwriting
                  dealId={dealId}
                  dealData={{
                    address: deal.address,
                    city: deal.city,
                    state: deal.state,
                    purchase_price: deal.purchasePrice,
                    arv: deal.arv,
                  }}
                />
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

              {/* ── SMS & Calls Tab ────────────────────── */}
              {activeTab === 'comms' && (
                <div className="space-y-4">
                  <h3 className="text-base font-semibold text-slate-900">SMS & Calls</h3>
                  {deal.contactId && contactPhone ? (
                    <ContactSmsThread
                      contactId={deal.contactId}
                      contactPhone={contactPhone}
                      contactName={deal.contactName || 'Contact'}
                    />
                  ) : (
                    <div className="text-center py-12 text-slate-400">
                      <Send className="w-8 h-8 mx-auto mb-2 text-slate-300" />
                      <p className="text-sm">
                        {!deal.contactId
                          ? 'No contact linked to this deal.'
                          : 'Contact has no phone number.'}
                      </p>
                      <p className="text-xs mt-1">Add a phone number to the contact to send SMS messages.</p>
                    </div>
                  )}
                </div>
              )}

              {/* ── Negotiations Tab ─────────────────────── */}
              {activeTab === 'negotiations' && dealId && (
                <DealNegotiationsTab dealId={dealId} />
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
