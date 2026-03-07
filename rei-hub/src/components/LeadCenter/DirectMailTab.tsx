import { useState, useEffect } from 'react'
import {
  Send, Plus, Sparkles, Edit, Trash2, ChevronRight, ChevronLeft,
  FileText, Mail, Loader2, X, Check, AlertCircle, DollarSign, Users,
  Image as ImageIcon, Upload as UploadIcon, Palette,
} from 'lucide-react'
import { toast } from 'sonner'
import * as mailApi from '@/services/directMailApi'
import * as leadsApi from '@/services/leadsPipelineApi'
import { POSTCARD_TEMPLATES, getPostcardTemplate, PostcardDesignConfig } from './postcardTemplates'
import { getCSRFHeaders } from '@/services/authApi'

// ── Campaign Type Options ────────────────────────────────

const CAMPAIGN_TYPES = [
  { value: 'motivated_seller', label: 'Motivated Seller' },
  { value: 'cash_offer', label: 'Cash Offer' },
  { value: 'we_buy_houses', label: 'We Buy Houses' },
  { value: 'follow_up', label: 'Follow Up' },
  { value: 'probate', label: 'Probate' },
  { value: 'pre_foreclosure', label: 'Pre-Foreclosure' },
  { value: 'absentee_owner', label: 'Absentee Owner' },
  { value: 'vacant_property', label: 'Vacant Property' },
]

// ── Status Colors ────────────────────────────────────────

function CampaignStatusBadge({ status }: { status: string }) {
  const colors: Record<string, string> = {
    draft: 'bg-slate-100 text-slate-600',
    sending: 'bg-yellow-100 text-yellow-700',
    sent: 'bg-green-100 text-green-700',
    partially_sent: 'bg-orange-100 text-orange-700',
    failed: 'bg-red-100 text-red-700',
  }
  return (
    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${colors[status] || colors.draft}`}>
      {status.replace('_', ' ')}
    </span>
  )
}

// ── Main Component ───────────────────────────────────────

export default function DirectMailTab() {
  const [view, setView] = useState<'list' | 'create'>('list')
  const [campaigns, setCampaigns] = useState<mailApi.Campaign[]>([])
  const [loading, setLoading] = useState(false)

  // Create Campaign Wizard State
  const [wizardStep, setWizardStep] = useState(1)
  const [campaignName, setCampaignName] = useState('')
  const [mailType, setMailType] = useState<'postcard' | 'letter'>('postcard')
  const [campaignType, setCampaignType] = useState('motivated_seller')
  const [customInstructions, setCustomInstructions] = useState('')

  // Recipient selection
  const [lists, setLists] = useState<leadsApi.LeadList[]>([])
  const [selectedListId, setSelectedListId] = useState<number | null>(null)
  const [selectedStatusFilter, setSelectedStatusFilter] = useState('')
  const [recipientCount, setRecipientCount] = useState(0)
  const [recipientLeadIds, setRecipientLeadIds] = useState<string[]>([])

  // Copy state
  const [copyText, setCopyText] = useState('')
  const [generatingCopy, setGeneratingCopy] = useState(false)

  // Front design state (postcards only)
  const [selectedTemplateId, setSelectedTemplateId] = useState<string | null>(null)
  const [frontImageB64, setFrontImageB64] = useState<string | null>(null)
  const [generatingImage, setGeneratingImage] = useState(false)
  const [designMode, setDesignMode] = useState<'template' | 'ai' | 'upload' | 'saved'>('template')
  const [customImagePrompt, setCustomImagePrompt] = useState('')

  // Saved templates (user's library)
  const [savedTemplates, setSavedTemplates] = useState<mailApi.MailTemplate[]>([])
  const [savingTemplate, setSavingTemplate] = useState(false)
  const [saveTemplateName, setSaveTemplateName] = useState('')

  // User profile for branding
  const [userProfile, setUserProfile] = useState<{
    company_name?: string
    company_phone?: string
    company_website?: string
    company_logo_b64?: string
    company_address?: string
    company_city?: string
    company_state?: string
    company_zip?: string
    primary_color?: string
  } | null>(null)

  // Send state
  const [createdCampaignId, setCreatedCampaignId] = useState<number | null>(null)
  const [sending, setSending] = useState(false)

  // ── Load campaigns ─────────────────────────────────────

  useEffect(() => {
    loadCampaigns()
    loadLists()
    loadSavedTemplates()
    loadProfile()
  }, [])

  async function loadCampaigns() {
    setLoading(true)
    try {
      const data = await mailApi.getCampaigns()
      setCampaigns(data)
    } catch {
      setCampaigns([])
    }
    setLoading(false)
  }

  async function loadLists() {
    try {
      const data = await leadsApi.getLists()
      setLists(data)
    } catch {
      setLists([])
    }
  }

  async function loadSavedTemplates() {
    try {
      const data = await mailApi.getTemplates()
      setSavedTemplates(data.filter(t => t.mail_type === 'postcard' && t.front_image_b64))
    } catch {
      setSavedTemplates([])
    }
  }

  async function loadProfile() {
    try {
      const BASE_URL = import.meta.env.VITE_REI_SERVER_URL ?? 'http://localhost:8001'
      const res = await fetch(`${BASE_URL}/api/auth/me/profile`, {
        credentials: 'include',
      })
      if (res.ok) {
        const data = await res.json()
        setUserProfile(data)
      }
    } catch {
      // Profile not available, use defaults
    }
  }

  // ── Recipient count ────────────────────────────────────

  useEffect(() => {
    updateRecipientCount()
  }, [selectedListId, selectedStatusFilter])

  async function updateRecipientCount() {
    try {
      const params: Parameters<typeof leadsApi.getLeads>[0] = { limit: 1 }
      if (selectedListId) params.list_id = selectedListId
      if (selectedStatusFilter) params.status = selectedStatusFilter
      const data = await leadsApi.getLeads(params)
      setRecipientCount(data.total)

      // Fetch all IDs for actual campaign creation
      const full = await leadsApi.getLeads({
        list_id: selectedListId ?? undefined,
        status: selectedStatusFilter || undefined,
        limit: 500,
      })
      setRecipientLeadIds(full.leads.map((l) => l.id))
    } catch {
      setRecipientCount(0)
      setRecipientLeadIds([])
    }
  }

  // ── AI Copy Generation ─────────────────────────────────

  async function handleGenerateCopy() {
    if (recipientLeadIds.length === 0) return toast.error('No recipients selected')
    setGeneratingCopy(true)
    try {
      // Generate copy based on first lead as example
      const res = await mailApi.generateCopy({
        lead_id: recipientLeadIds[0],
        mail_type: mailType,
        campaign_type: campaignType,
        custom_instructions: customInstructions || undefined,
      })
      setCopyText(res.copy_text)
      toast.success('AI copy generated! Review and edit below.')
    } catch (err: any) {
      toast.error(err.message)
    }
    setGeneratingCopy(false)
  }

  // ── AI Image Generation ─────────────────────────────────

  async function handleGenerateImage() {
    setGeneratingImage(true)
    try {
      const res = await mailApi.generateFrontImage({
        campaign_type: campaignType,
        custom_prompt: customImagePrompt || undefined,
      })
      setFrontImageB64(res.image_b64)
      toast.success('AI postcard image generated!')
    } catch (err: any) {
      toast.error(err.message || 'Image generation failed')
    }
    setGeneratingImage(false)
  }

  // ── Handle Image Upload ─────────────────────────────────

  function handleImageUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    if (!file.type.startsWith('image/')) {
      toast.error('Please upload an image file (PNG, JPG)')
      return
    }
    if (file.size > 5 * 1024 * 1024) {
      toast.error('Image must be under 5MB')
      return
    }
    const reader = new FileReader()
    reader.onload = () => {
      const result = reader.result as string
      // Strip the data URI prefix to get raw base64
      const b64 = result.includes(',') ? result.split(',')[1] : result
      setFrontImageB64(b64)
      setDesignMode('upload')
      toast.success('Image uploaded!')
    }
    reader.readAsDataURL(file)
  }

  async function handleSaveAsTemplate() {
    if (!frontImageB64) return toast.error('No image to save')
    if (!saveTemplateName.trim()) return toast.error('Enter a template name')
    setSavingTemplate(true)
    try {
      await mailApi.createTemplate({
        name: saveTemplateName,
        mail_type: 'postcard',
        front_image_b64: frontImageB64,
      })
      toast.success('Template saved to your library!')
      setSaveTemplateName('')
      loadSavedTemplates()
    } catch (err: any) {
      toast.error(err.message || 'Failed to save template')
    }
    setSavingTemplate(false)
  }

  // ── Create + Send Campaign ─────────────────────────────

  async function handleCreateCampaign() {
    if (!campaignName.trim()) return toast.error('Enter a campaign name')
    if (!copyText.trim()) return toast.error('Add some copy text first')
    if (recipientLeadIds.length === 0) return toast.error('No recipients')

    try {
      const res = await mailApi.createCampaign({
        name: campaignName,
        mail_type: mailType,
        copy_text: copyText,
        lead_ids: recipientLeadIds,
        list_id: selectedListId ?? undefined,
        status_filter: selectedStatusFilter || undefined,
        front_image_b64: frontImageB64 || undefined,
      })
      setCreatedCampaignId(res.id)
      toast.success(`Campaign created with ${res.total_recipients} recipients. Estimated cost: $${res.estimated_cost.toFixed(2)}`)
      setWizardStep(6)
    } catch (err: any) {
      toast.error(err.message)
    }
  }

  async function handleSendCampaign() {
    if (!createdCampaignId) return
    setSending(true)
    try {
      const res = await mailApi.sendCampaign(createdCampaignId)
      toast.success(`Sent! ${res.sent} delivered, ${res.failed} failed. Total cost: $${res.total_cost.toFixed(2)}`)
      resetWizard()
      setView('list')
      loadCampaigns()
    } catch (err: any) {
      toast.error(err.message)
    }
    setSending(false)
  }

  function resetWizard() {
    setWizardStep(1)
    setCampaignName('')
    setMailType('postcard')
    setCampaignType('motivated_seller')
    setCustomInstructions('')
    setSelectedListId(null)
    setSelectedStatusFilter('')
    setRecipientCount(0)
    setRecipientLeadIds([])
    setCopyText('')
    setCreatedCampaignId(null)
    setSelectedTemplateId(null)
    setFrontImageB64(null)
    setGeneratingImage(false)
    setDesignMode('template')
    setCustomImagePrompt('')
    setSavedTemplates([])
    setSavingTemplate(false)
    setSaveTemplateName('')
  }

  // ── Cost calculation ───────────────────────────────────

  const costPerPiece = mailType === 'postcard' ? 0.59 : 0.99
  const estimatedCost = recipientCount * costPerPiece

  // ── Step helpers ────────────────────────────────────────

  const totalSteps = mailType === 'postcard' ? 6 : 5
  const steps = mailType === 'postcard' ? [1, 2, 3, 4, 5, 6] : [1, 2, 4, 5, 6]

  function getStepLabel(internalStep: number): string {
    if (mailType === 'letter') {
      const letterLabels: Record<number, string> = {
        1: 'Step 1',
        2: 'Step 2',
        4: 'Step 3',
        5: 'Step 4',
        6: 'Step 5',
      }
      return letterLabels[internalStep] || `Step ${internalStep}`
    }
    return `Step ${internalStep}`
  }

  // ── Render ─────────────────────────────────────────────

  if (view === 'create') {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-bold text-slate-900">Create Campaign</h3>
          <button
            onClick={() => { resetWizard(); setView('list') }}
            className="text-sm text-slate-500 hover:text-slate-700"
          >
            Cancel
          </button>
        </div>

        {/* Step Indicators */}
        <div className="flex items-center gap-2">
          {steps.map((step, idx, arr) => (
            <div key={step} className="flex items-center gap-2">
              <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium ${
                wizardStep >= step ? 'bg-primary-600 text-white' : 'bg-slate-200 text-slate-500'
              }`}>
                {idx + 1}
              </div>
              {idx < arr.length - 1 && <div className={`w-8 h-0.5 ${wizardStep > step ? 'bg-primary-600' : 'bg-slate-200'}`} />}
            </div>
          ))}
        </div>

        {/* Step 1: Recipients */}
        {wizardStep === 1 && (
          <div className="bg-white rounded-lg border border-slate-200 p-6 space-y-4">
            <h4 className="font-semibold text-slate-900">Step 1: Select Recipients</h4>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">From List</label>
                <select
                  value={selectedListId ?? ''}
                  onChange={(e) => setSelectedListId(e.target.value ? Number(e.target.value) : null)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
                >
                  <option value="">All Lists</option>
                  {lists.map((l) => (
                    <option key={l.id} value={l.id}>{l.list_name} ({l.lead_count})</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Status Filter</label>
                <select
                  value={selectedStatusFilter}
                  onChange={(e) => setSelectedStatusFilter(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
                >
                  <option value="">All Statuses</option>
                  <option value="new">New</option>
                  <option value="contacted">Contacted</option>
                  <option value="mailed">Mailed</option>
                  <option value="responded">Responded</option>
                </select>
              </div>
            </div>
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
              <div className="flex items-center gap-2 text-blue-800">
                <Users className="w-5 h-5" />
                <span className="font-semibold text-lg">{recipientCount}</span>
                <span className="text-sm">recipients with mailable addresses</span>
              </div>
            </div>
            <div className="flex justify-end">
              <button
                onClick={() => {
                  if (recipientCount === 0) return toast.error('No recipients found with mailable addresses')
                  setWizardStep(2)
                }}
                className="px-6 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 text-sm font-medium flex items-center gap-2"
              >
                Next <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}

        {/* Step 2: Mail Type + Campaign Type */}
        {wizardStep === 2 && (
          <div className="bg-white rounded-lg border border-slate-200 p-6 space-y-4">
            <h4 className="font-semibold text-slate-900">Step 2: Mail Type & Campaign</h4>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">Campaign Name</label>
              <input
                type="text"
                value={campaignName}
                onChange={(e) => setCampaignName(e.target.value)}
                placeholder="e.g. March 2026 - Absentee Owners"
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">Mail Type</label>
              <div className="flex gap-3">
                <button
                  onClick={() => setMailType('postcard')}
                  className={`flex-1 px-4 py-3 border-2 rounded-lg transition-colors ${
                    mailType === 'postcard'
                      ? 'border-primary-500 bg-primary-50 text-primary-700'
                      : 'border-slate-200 hover:border-slate-300'
                  }`}
                >
                  <div className="font-semibold">Postcard</div>
                  <div className="text-sm text-slate-500 mt-1">$0.59 each - Quick, high open rate</div>
                </button>
                <button
                  onClick={() => setMailType('letter')}
                  className={`flex-1 px-4 py-3 border-2 rounded-lg transition-colors ${
                    mailType === 'letter'
                      ? 'border-primary-500 bg-primary-50 text-primary-700'
                      : 'border-slate-200 hover:border-slate-300'
                  }`}
                >
                  <div className="font-semibold">Letter</div>
                  <div className="text-sm text-slate-500 mt-1">$0.99 each - More detail, professional</div>
                </button>
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">Campaign Type</label>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                {CAMPAIGN_TYPES.map((ct) => (
                  <button
                    key={ct.value}
                    onClick={() => setCampaignType(ct.value)}
                    className={`px-3 py-2 text-sm rounded-lg border transition-colors ${
                      campaignType === ct.value
                        ? 'border-primary-500 bg-primary-50 text-primary-700 font-medium'
                        : 'border-slate-200 hover:border-slate-300 text-slate-600'
                    }`}
                  >
                    {ct.label}
                  </button>
                ))}
              </div>
            </div>
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 flex items-center gap-3">
              <DollarSign className="w-5 h-5 text-amber-600" />
              <span className="text-sm text-amber-800">
                Estimated cost: <strong>${estimatedCost.toFixed(2)}</strong> ({recipientCount} x ${costPerPiece.toFixed(2)})
              </span>
            </div>
            <div className="flex justify-between">
              <button
                onClick={() => setWizardStep(1)}
                className="px-4 py-2 text-sm text-slate-600 hover:text-slate-900 flex items-center gap-1"
              >
                <ChevronLeft className="w-4 h-4" /> Back
              </button>
              <button
                onClick={() => {
                  if (!campaignName.trim()) return toast.error('Enter a campaign name')
                  setWizardStep(mailType === 'postcard' ? 3 : 4)
                }}
                className="px-6 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 text-sm font-medium flex items-center gap-2"
              >
                Next <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}

        {/* Step 3: Design Front (postcards only) */}
        {wizardStep === 3 && mailType === 'postcard' && (
          <div className="bg-white rounded-lg border border-slate-200 p-6 space-y-4">
            <h4 className="font-semibold text-slate-900">Step 3: Design Postcard Front</h4>

            {/* Design mode tabs */}
            <div className="flex gap-2 border-b border-slate-200 pb-2">
              <button
                onClick={() => { setDesignMode('saved'); loadSavedTemplates() }}
                className={`px-4 py-2 text-sm rounded-t-lg flex items-center gap-2 ${
                  designMode === 'saved' ? 'bg-blue-50 text-blue-700 border-b-2 border-blue-500 font-medium' : 'text-slate-500 hover:text-slate-700'
                }`}
              >
                <ImageIcon className="w-4 h-4" /> My Templates
              </button>
              <button
                onClick={() => setDesignMode('template')}
                className={`px-4 py-2 text-sm rounded-t-lg flex items-center gap-2 ${
                  designMode === 'template'
                    ? 'bg-primary-50 text-primary-700 border-b-2 border-primary-500 font-medium'
                    : 'text-slate-500 hover:text-slate-700'
                }`}
              >
                <Palette className="w-4 h-4" /> Templates
              </button>
              <button
                onClick={() => setDesignMode('ai')}
                className={`px-4 py-2 text-sm rounded-t-lg flex items-center gap-2 ${
                  designMode === 'ai'
                    ? 'bg-purple-50 text-purple-700 border-b-2 border-purple-500 font-medium'
                    : 'text-slate-500 hover:text-slate-700'
                }`}
              >
                <Sparkles className="w-4 h-4" /> AI Generate
              </button>
              <button
                onClick={() => setDesignMode('upload')}
                className={`px-4 py-2 text-sm rounded-t-lg flex items-center gap-2 ${
                  designMode === 'upload'
                    ? 'bg-green-50 text-green-700 border-b-2 border-green-500 font-medium'
                    : 'text-slate-500 hover:text-slate-700'
                }`}
              >
                <UploadIcon className="w-4 h-4" /> Upload
              </button>
            </div>

            {/* My Templates */}
            {designMode === 'saved' && (
              <div className="space-y-4">
                <p className="text-sm text-slate-500">Your saved postcard designs. Upload or generate new ones, then save them here for reuse.</p>
                {savedTemplates.length === 0 ? (
                  <div className="text-center py-8 bg-slate-50 rounded-lg">
                    <ImageIcon className="w-10 h-10 text-slate-300 mx-auto mb-2" />
                    <p className="text-sm text-slate-500">No saved templates yet</p>
                    <p className="text-xs text-slate-400 mt-1">Upload or AI-generate a design, then save it as a template</p>
                  </div>
                ) : (
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                    {savedTemplates.map((t) => (
                      <button
                        key={t.id}
                        onClick={() => {
                          setFrontImageB64(t.front_image_b64)
                          setSelectedTemplateId(null) // clear pre-built selection
                          toast.success(`Using template: ${t.name}`)
                        }}
                        className={`border-2 rounded-lg overflow-hidden transition-all hover:shadow-md ${
                          frontImageB64 === t.front_image_b64 ? 'border-primary-500 ring-2 ring-primary-200' : 'border-slate-200'
                        }`}
                      >
                        {t.front_image_b64 && (
                          <img
                            src={`data:image/png;base64,${t.front_image_b64}`}
                            alt={t.name}
                            className="w-full h-32 object-cover"
                          />
                        )}
                        <div className="p-2">
                          <div className="text-sm font-medium text-slate-800 truncate">{t.name}</div>
                          <div className="text-xs text-slate-400">
                            {t.created_at ? new Date(t.created_at).toLocaleDateString() : ''}
                          </div>
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Template selection */}
            {designMode === 'template' && (
              <div className="space-y-4">
                <p className="text-sm text-slate-500">
                  Choose a pre-built template. Your company info will be automatically filled in.
                </p>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  {POSTCARD_TEMPLATES.map((t) => (
                    <button
                      key={t.id}
                      onClick={() => {
                        setSelectedTemplateId(t.id)
                        setFrontImageB64(null)
                      }}
                      className={`p-3 border-2 rounded-lg text-left transition-all ${
                        selectedTemplateId === t.id
                          ? 'border-primary-500 bg-primary-50 ring-2 ring-primary-200'
                          : 'border-slate-200 hover:border-slate-300'
                      }`}
                    >
                      <div className="text-2xl mb-2">{t.thumbnail_emoji}</div>
                      <div className="text-sm font-medium text-slate-800">{t.name}</div>
                      <div className="text-xs text-slate-500 mt-1">{t.description}</div>
                    </button>
                  ))}
                </div>
                {selectedTemplateId && (
                  <div className="bg-slate-50 rounded-lg p-4">
                    <p className="text-xs text-slate-500 mb-2">Preview (your company info will be applied):</p>
                    <div className="border border-slate-200 rounded overflow-hidden bg-white" style={{ maxHeight: 300 }}>
                      <div
                        dangerouslySetInnerHTML={{
                          __html:
                            getPostcardTemplate(selectedTemplateId)?.render({
                              company_name: userProfile?.company_name || 'Your Company',
                              company_phone: userProfile?.company_phone || '(555) 123-4567',
                              company_website: userProfile?.company_website || '',
                              company_logo_url: userProfile?.company_logo_b64 ? `data:image/png;base64,${userProfile.company_logo_b64}` : '',
                              primary_color: userProfile?.primary_color || '#1a3a5c',
                            }) || '',
                        }}
                        style={{
                          transform: 'scale(0.2)',
                          transformOrigin: 'top left',
                          width: 1875,
                          height: 1275,
                        }}
                      />
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* AI image generation */}
            {designMode === 'ai' && (
              <div className="space-y-4">
                <p className="text-sm text-slate-500">
                  Generate a unique postcard front image using AI. Your logo will be watermarked automatically.
                </p>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Custom Prompt (optional)</label>
                  <input
                    type="text"
                    value={customImagePrompt}
                    onChange={(e) => setCustomImagePrompt(e.target.value)}
                    placeholder="e.g. Beautiful suburban house with for sale sign, golden hour lighting"
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
                  />
                  <p className="text-xs text-slate-400 mt-1">Leave blank for a campaign-type-appropriate image</p>
                </div>
                <button
                  onClick={handleGenerateImage}
                  disabled={generatingImage}
                  className="px-6 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 text-sm font-medium flex items-center gap-2 disabled:opacity-50"
                >
                  {generatingImage ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Sparkles className="w-4 h-4" />
                  )}
                  {generatingImage ? 'Generating Image...' : 'Generate with AI'}
                </button>
                {frontImageB64 && designMode === 'ai' && (
                  <div className="bg-slate-50 rounded-lg p-4">
                    <p className="text-xs text-slate-500 mb-2">Generated Image Preview:</p>
                    <img
                      src={`data:image/png;base64,${frontImageB64}`}
                      alt="Generated postcard front"
                      className="rounded border border-slate-200 max-w-full"
                      style={{ maxHeight: 300 }}
                    />
                  </div>
                )}
              </div>
            )}

            {/* Upload */}
            {designMode === 'upload' && (
              <div className="space-y-4">
                <p className="text-sm text-slate-500">
                  Upload your own postcard front design. Recommended size: 1875×1275px (6.25" × 4.25" at 300 DPI).
                </p>
                <label className="flex flex-col items-center justify-center border-2 border-dashed border-slate-300 rounded-lg p-8 cursor-pointer hover:border-primary-400 hover:bg-slate-50 transition-colors">
                  <UploadIcon className="w-10 h-10 text-slate-400 mb-2" />
                  <span className="text-sm text-slate-600 font-medium">Click to upload image</span>
                  <span className="text-xs text-slate-400 mt-1">PNG, JPG up to 5MB</span>
                  <input
                    type="file"
                    accept="image/*"
                    onChange={handleImageUpload}
                    className="hidden"
                  />
                </label>
                {frontImageB64 && designMode === 'upload' && (
                  <div className="bg-slate-50 rounded-lg p-4">
                    <p className="text-xs text-slate-500 mb-2">Uploaded Image Preview:</p>
                    <img
                      src={`data:image/png;base64,${frontImageB64}`}
                      alt="Uploaded postcard front"
                      className="rounded border border-slate-200 max-w-full"
                      style={{ maxHeight: 300 }}
                    />
                  </div>
                )}
              </div>
            )}

            {/* Save as Template option */}
            {frontImageB64 && (
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 flex items-center gap-3">
                <input
                  type="text"
                  value={saveTemplateName}
                  onChange={(e) => setSaveTemplateName(e.target.value)}
                  placeholder="Template name..."
                  className="flex-1 px-3 py-1.5 border border-blue-300 rounded text-sm"
                />
                <button
                  onClick={handleSaveAsTemplate}
                  disabled={savingTemplate}
                  className="px-4 py-1.5 bg-blue-600 text-white rounded text-sm font-medium hover:bg-blue-700 disabled:opacity-50 whitespace-nowrap"
                >
                  {savingTemplate ? 'Saving...' : 'Save to Library'}
                </button>
              </div>
            )}

            {/* Navigation */}
            <div className="flex justify-between">
              <button
                onClick={() => setWizardStep(2)}
                className="px-4 py-2 text-sm text-slate-600 hover:text-slate-900 flex items-center gap-1"
              >
                <ChevronLeft className="w-4 h-4" /> Back
              </button>
              <div className="flex gap-3">
                <button
                  onClick={() => setWizardStep(4)}
                  className="px-4 py-2 text-sm text-slate-500 hover:text-slate-700"
                >
                  Skip Design
                </button>
                <button
                  onClick={() => {
                    if (!selectedTemplateId && !frontImageB64) {
                      return toast.error('Select a template, generate an image, or upload a design')
                    }
                    setWizardStep(4)
                  }}
                  className="px-6 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 text-sm font-medium flex items-center gap-2"
                >
                  Next <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Step 4: Copy (formerly Step 3) */}
        {wizardStep === 4 && (
          <div className="bg-white rounded-lg border border-slate-200 p-6 space-y-4">
            <h4 className="font-semibold text-slate-900">
              {mailType === 'postcard' ? 'Step 4' : 'Step 3'}: Write Your Copy
            </h4>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Custom Instructions (optional)</label>
              <input
                type="text"
                value={customInstructions}
                onChange={(e) => setCustomInstructions(e.target.value)}
                placeholder="e.g. Mention we close in 14 days, emphasize no repairs needed"
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
              />
            </div>
            <button
              onClick={handleGenerateCopy}
              disabled={generatingCopy}
              className="px-6 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 text-sm font-medium flex items-center gap-2 disabled:opacity-50"
            >
              {generatingCopy ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Sparkles className="w-4 h-4" />
              )}
              {generatingCopy ? 'Generating...' : 'Generate with AI'}
            </button>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                {mailType === 'postcard' ? 'Postcard Back Copy' : 'Letter Body'}
              </label>
              <textarea
                value={copyText}
                onChange={(e) => setCopyText(e.target.value)}
                rows={mailType === 'postcard' ? 6 : 12}
                placeholder={mailType === 'postcard'
                  ? 'Your postcard message here (3-5 sentences)...'
                  : 'Your letter content here (2-3 paragraphs)...'
                }
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm font-mono"
              />
              <p className="text-xs text-slate-400 mt-1">
                This copy will be sent to all {recipientCount} recipients. You can edit it above.
              </p>
            </div>
            <div className="flex justify-between">
              <button
                onClick={() => setWizardStep(mailType === 'postcard' ? 3 : 2)}
                className="px-4 py-2 text-sm text-slate-600 hover:text-slate-900 flex items-center gap-1"
              >
                <ChevronLeft className="w-4 h-4" /> Back
              </button>
              <button
                onClick={() => {
                  if (!copyText.trim()) return toast.error('Write or generate some copy first')
                  setWizardStep(5)
                }}
                className="px-6 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 text-sm font-medium flex items-center gap-2"
              >
                Review <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}

        {/* Step 5: Review (formerly Step 4) */}
        {wizardStep === 5 && (
          <div className="bg-white rounded-lg border border-slate-200 p-6 space-y-4">
            <h4 className="font-semibold text-slate-900">
              {mailType === 'postcard' ? 'Step 5' : 'Step 4'}: Review & Create
            </h4>
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <span className="text-slate-500">Campaign:</span>
                <span className="ml-2 font-medium">{campaignName}</span>
              </div>
              <div>
                <span className="text-slate-500">Type:</span>
                <span className="ml-2 font-medium capitalize">{mailType}</span>
              </div>
              <div>
                <span className="text-slate-500">Recipients:</span>
                <span className="ml-2 font-medium">{recipientCount}</span>
              </div>
              <div>
                <span className="text-slate-500">Estimated Cost:</span>
                <span className="ml-2 font-medium text-amber-700">${estimatedCost.toFixed(2)}</span>
              </div>
            </div>
            {mailType === 'postcard' && (selectedTemplateId || frontImageB64) && (
              <div>
                <p className="text-xs text-slate-500 mb-1">Front Design:</p>
                {frontImageB64 ? (
                  <img
                    src={`data:image/png;base64,${frontImageB64}`}
                    alt="Postcard front"
                    className="rounded border border-slate-200 max-w-full"
                    style={{ maxHeight: 200 }}
                  />
                ) : selectedTemplateId ? (
                  <div className="bg-slate-100 rounded px-3 py-2 text-sm text-slate-600">
                    Template: {getPostcardTemplate(selectedTemplateId)?.name || selectedTemplateId}
                  </div>
                ) : null}
              </div>
            )}
            <div className="bg-slate-50 rounded-lg p-4">
              <p className="text-xs text-slate-500 mb-1">Copy Preview:</p>
              <p className="text-sm text-slate-700 whitespace-pre-wrap">{copyText}</p>
            </div>
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-sm text-amber-800">
              <AlertCircle className="w-4 h-4 inline mr-2" />
              Creating this campaign will lock in the recipients. You can review before sending.
            </div>
            <div className="flex justify-between">
              <button
                onClick={() => setWizardStep(4)}
                className="px-4 py-2 text-sm text-slate-600 hover:text-slate-900 flex items-center gap-1"
              >
                <ChevronLeft className="w-4 h-4" /> Back
              </button>
              <button
                onClick={handleCreateCampaign}
                className="px-6 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 text-sm font-medium flex items-center gap-2"
              >
                <Check className="w-4 h-4" /> Create Campaign
              </button>
            </div>
          </div>
        )}

        {/* Step 6: Send (formerly Step 5) */}
        {wizardStep === 6 && (
          <div className="bg-white rounded-lg border border-slate-200 p-6 space-y-4 text-center">
            <Check className="w-16 h-16 text-green-500 mx-auto" />
            <h4 className="font-semibold text-slate-900 text-lg">
              {mailType === 'postcard' ? 'Step 6' : 'Step 5'}: Campaign Created!
            </h4>
            <p className="text-slate-500">
              Ready to send <strong>{recipientCount}</strong> {mailType}s for an estimated <strong>${estimatedCost.toFixed(2)}</strong>.
            </p>
            <div className="flex justify-center gap-4 pt-4">
              <button
                onClick={() => { resetWizard(); setView('list'); loadCampaigns() }}
                className="px-6 py-2 border border-slate-300 text-slate-700 rounded-lg hover:bg-slate-50 text-sm"
              >
                Save as Draft
              </button>
              <button
                onClick={handleSendCampaign}
                disabled={sending}
                className="px-8 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 text-sm font-medium flex items-center gap-2 disabled:opacity-50"
              >
                {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                {sending ? 'Sending...' : 'Send Now'}
              </button>
            </div>
          </div>
        )}
      </div>
    )
  }

  // ── Campaign List View ─────────────────────────────────

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <span className="text-sm text-slate-500">{campaigns.length} campaigns</span>
        <button
          onClick={() => setView('create')}
          className="px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors flex items-center gap-2 text-sm font-medium"
        >
          <Plus className="w-4 h-4" /> New Campaign
        </button>
      </div>

      {loading ? (
        <div className="text-center py-12">
          <Loader2 className="w-8 h-8 text-primary-400 mx-auto animate-spin" />
        </div>
      ) : campaigns.length === 0 ? (
        <div className="text-center py-16 bg-slate-50 rounded-lg border border-slate-200">
          <Send className="w-16 h-16 text-slate-300 mx-auto mb-4" />
          <h3 className="text-xl font-semibold text-slate-700 mb-2">No campaigns yet</h3>
          <p className="text-slate-500 max-w-md mx-auto mb-4">
            Create your first direct mail campaign to send postcards or letters to your leads.
          </p>
          <button
            onClick={() => setView('create')}
            className="px-6 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 text-sm font-medium"
          >
            Create Your First Campaign
          </button>
        </div>
      ) : (
        <div className="bg-white rounded-lg border border-slate-200 overflow-x-auto">
          <table className="w-full">
            <thead className="bg-slate-50">
              <tr>
                <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase">Campaign</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase">Type</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase">Status</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase">Recipients</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase">Sent/Failed</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase">Cost</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase">Date</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {campaigns.map((c) => (
                <tr key={c.id} className="hover:bg-slate-50">
                  <td className="px-4 py-3 text-sm font-medium text-slate-900">{c.name}</td>
                  <td className="px-4 py-3 text-sm text-slate-600 capitalize">{c.mail_type}</td>
                  <td className="px-4 py-3"><CampaignStatusBadge status={c.status} /></td>
                  <td className="px-4 py-3 text-sm text-slate-600">{c.total_recipients}</td>
                  <td className="px-4 py-3 text-sm text-slate-600">
                    <span className="text-green-600">{c.sent_count}</span>
                    {c.failed_count > 0 && <span className="text-red-500"> / {c.failed_count}</span>}
                  </td>
                  <td className="px-4 py-3 text-sm text-slate-600">${c.total_cost.toFixed(2)}</td>
                  <td className="px-4 py-3 text-sm text-slate-400">
                    {c.sent_at ? new Date(c.sent_at).toLocaleDateString() : c.created_at ? new Date(c.created_at).toLocaleDateString() : '-'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
