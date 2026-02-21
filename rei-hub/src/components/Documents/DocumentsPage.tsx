import { useState, useEffect, useCallback, useRef } from 'react'
import {
  FileText,
  Upload,
  Download,
  Trash2,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  ExternalLink,
  ChevronDown,
  X,
} from 'lucide-react'
import {
  getTemplates,
  uploadTemplate,
  downloadTemplate,
  deleteTemplate,
  generateContract,
  getContracts,
  deleteContract,
  updateSettings,
} from '@/services/documentsApi'
import { getCurrentUser } from '@/services/auth'

// ── Types ──────────────────────────────────────────────────────

interface Template {
  id: string
  name: string
  category: string
  file_name: string
  is_default: boolean
  merge_fields: string[]
  created_at: string
  updated_at: string
}

interface Contract {
  id: string
  template_id: string
  deal_id: string | null
  file_name: string
  homeowner_name: string
  buying_entity: string
  property_address: string
  purchase_price: number | null
  closing_date: string | null
  emd_amount: number | null
  storage_provider: string
  storage_url: string
  created_at: string
}

const CATEGORIES = ['Purchase', 'Subject To', 'Wholesale', 'Custom']

const STANDARD_FIELDS = [
  'COMPANY_NAME', 'HOMEOWNER_NAME', 'BUYING_ENTITY', 'PROPERTY_ADDRESS',
  'PURCHASE_PRICE', 'CLOSING_DATE', 'EMD_AMOUNT', 'ADDITIONAL_CLAUSES',
]

// ═══════════════════════════════════════════════════════════════
// Main page
// ═══════════════════════════════════════════════════════════════

export default function DocumentsPage() {
  const [activeTab, setActiveTab] = useState<'templates' | 'generate' | 'history'>('templates')
  const [toast, setToast] = useState('')

  const showToast = (msg: string) => {
    setToast(msg)
    setTimeout(() => setToast(''), 3000)
  }

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
          <FileText className="w-7 h-7 text-primary-600" />
          Documents &amp; Contracts
        </h1>
        <p className="text-slate-500 mt-1">
          Manage contract templates, merge with deal data, and save to cloud storage
        </p>
      </div>

      {toast && (
        <div className="fixed top-4 right-4 z-50 bg-slate-800 text-white px-4 py-2 rounded-lg shadow-lg text-sm">
          {toast}
        </div>
      )}

      <div className="flex gap-1 bg-slate-100 rounded-lg p-1">
        {(['templates', 'generate', 'history'] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`flex-1 py-2 px-4 rounded-md text-sm font-medium transition-colors ${
              activeTab === tab
                ? 'bg-white text-primary-700 shadow-sm'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            {tab === 'templates' ? 'Templates' : tab === 'generate' ? 'Generate Contract' : 'Contract History'}
          </button>
        ))}
      </div>

      {activeTab === 'templates' && <TemplatesTab showToast={showToast} />}
      {activeTab === 'generate' && <GenerateTab showToast={showToast} />}
      {activeTab === 'history' && <HistoryTab showToast={showToast} />}
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════
// TAB 1 — Templates
// ═══════════════════════════════════════════════════════════════

function TemplatesTab({ showToast }: { showToast: (m: string) => void }) {
  const [loading, setLoading] = useState(true)
  const [templates, setTemplates] = useState<Template[]>([])
  const [companyName, setCompanyName] = useState('')
  const [companyNameInput, setCompanyNameInput] = useState('')
  const [savingCompany, setSavingCompany] = useState(false)

  // Upload state
  const [uploadName, setUploadName] = useState('')
  const [uploadCategory, setUploadCategory] = useState('Purchase')
  const [uploadFile, setUploadFile] = useState<File | null>(null)
  const [uploading, setUploading] = useState(false)
  const [uploadResult, setUploadResult] = useState<string[] | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const loadData = useCallback(async () => {
    try {
      const [tplData, user] = await Promise.all([
        getTemplates(),
        getCurrentUser(),
      ])
      setTemplates(tplData.templates as Template[])
      const cn = (user?.company_name as string) || ''
      setCompanyName(cn)
      setCompanyNameInput(cn)
    } catch {
      // ignore
    }
  }, [])

  useEffect(() => {
    loadData().finally(() => setLoading(false))
  }, [loadData])

  const handleSaveCompany = async () => {
    if (!companyNameInput.trim()) return
    setSavingCompany(true)
    try {
      await updateSettings(companyNameInput.trim())
      setCompanyName(companyNameInput.trim())
      showToast('Company name saved')
    } catch {
      showToast('Failed to save company name')
    } finally {
      setSavingCompany(false)
    }
  }

  const handleUpload = async () => {
    if (!uploadName.trim()) { showToast('Enter a template name'); return }
    if (!uploadFile) { showToast('Select a .docx file'); return }

    setUploading(true)
    setUploadResult(null)
    try {
      const formData = new FormData()
      formData.append('name', uploadName.trim())
      formData.append('category', uploadCategory)
      formData.append('file', uploadFile)

      const result = await uploadTemplate(formData)
      const fields = result.merge_fields as string[]
      setUploadResult(fields)
      setUploadName('')
      setUploadFile(null)
      if (fileInputRef.current) fileInputRef.current.value = ''
      await loadData()
      showToast('Template uploaded successfully')
    } catch {
      showToast('Failed to upload template')
    } finally {
      setUploading(false)
    }
  }

  const handleDownload = async (tpl: Template) => {
    try {
      const data = await downloadTemplate(tpl.id)
      const blob = new Blob(
        [Uint8Array.from(atob(data.file_content), (c) => c.charCodeAt(0))],
        { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' }
      )
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = data.file_name
      a.click()
      URL.revokeObjectURL(url)
    } catch {
      showToast('Failed to download template')
    }
  }

  const handleDelete = async (id: string) => {
    try {
      await deleteTemplate(id)
      showToast('Template deleted')
      await loadData()
    } catch {
      showToast('Failed to delete template')
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-4 border-primary-500 border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  const grouped = CATEGORIES.map((cat) => ({
    category: cat,
    items: templates.filter((t) => t.category === cat),
  })).filter((g) => g.items.length > 0)

  return (
    <div className="space-y-8">
      {/* Company Setup Banner */}
      {!companyName && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
          <div className="flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-amber-500 mt-0.5 shrink-0" />
            <div className="flex-1">
              <p className="text-sm font-medium text-amber-800 mb-2">
                Set your company name to enable document generation
              </p>
              <div className="flex gap-2">
                <input
                  type="text"
                  placeholder="ABC Investments LLC"
                  value={companyNameInput}
                  onChange={(e) => setCompanyNameInput(e.target.value)}
                  className="flex-1 px-3 py-1.5 border border-amber-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
                />
                <button
                  onClick={handleSaveCompany}
                  disabled={savingCompany}
                  className="px-4 py-1.5 bg-primary-600 text-white rounded-lg text-sm font-medium hover:bg-primary-700 disabled:opacity-50"
                >
                  {savingCompany ? 'Saving...' : 'Save'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Template Library */}
      <section className="bg-white rounded-xl border border-slate-200 p-6">
        <h2 className="text-lg font-semibold text-slate-900 mb-4">Template Library</h2>

        {grouped.length === 0 ? (
          <p className="text-slate-400 text-sm text-center py-6">
            No templates yet. Upload a .docx template below.
          </p>
        ) : (
          <div className="space-y-6">
            {grouped.map((group) => (
              <div key={group.category}>
                <h3 className="text-sm font-semibold text-slate-500 uppercase tracking-wide mb-3">
                  {group.category}
                </h3>
                <div className="grid sm:grid-cols-2 gap-4">
                  {group.items.map((tpl) => (
                    <div
                      key={tpl.id}
                      className="border border-slate-200 rounded-lg p-4 hover:border-slate-300 transition-colors"
                    >
                      <div className="flex items-start justify-between mb-2">
                        <div>
                          <p className="font-medium text-slate-800">{tpl.name}</p>
                          <p className="text-xs text-slate-400">{tpl.file_name}</p>
                        </div>
                        <div className="flex items-center gap-1">
                          <span className="text-xs bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full">
                            {tpl.category}
                          </span>
                          {tpl.is_default && (
                            <span className="text-xs bg-primary-50 text-primary-700 px-2 py-0.5 rounded-full">
                              Default
                            </span>
                          )}
                        </div>
                      </div>
                      {tpl.merge_fields.length > 0 && (
                        <div className="flex flex-wrap gap-1 mb-3">
                          {tpl.merge_fields.map((f) => (
                            <span key={f} className="text-[10px] bg-slate-50 text-slate-500 px-1.5 py-0.5 rounded">
                              {`{{${f}}}`}
                            </span>
                          ))}
                        </div>
                      )}
                      <div className="flex gap-2">
                        <button
                          onClick={() => handleDownload(tpl)}
                          className="inline-flex items-center gap-1 text-xs text-primary-600 hover:text-primary-800"
                        >
                          <Download className="w-3.5 h-3.5" />
                          Download
                        </button>
                        {!tpl.is_default && (
                          <button
                            onClick={() => handleDelete(tpl.id)}
                            className="inline-flex items-center gap-1 text-xs text-red-500 hover:text-red-700"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                            Delete
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Upload New Template */}
      <section className="bg-white rounded-xl border border-slate-200 p-6">
        <h2 className="text-lg font-semibold text-slate-900 mb-4">
          Upload Contract Template (.docx)
        </h2>

        <div className="grid sm:grid-cols-2 gap-4 mb-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              Template Name
            </label>
            <input
              type="text"
              placeholder="Purchase Agreement"
              value={uploadName}
              onChange={(e) => setUploadName(e.target.value)}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              Category
            </label>
            <select
              value={uploadCategory}
              onChange={(e) => setUploadCategory(e.target.value)}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
            >
              {CATEGORIES.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </div>
        </div>

        <div className="mb-4">
          <label className="block text-sm font-medium text-slate-700 mb-1">
            File (.docx)
          </label>
          <div className="border-2 border-dashed border-slate-300 rounded-lg p-6 text-center hover:border-primary-400 transition-colors">
            <input
              ref={fileInputRef}
              type="file"
              accept=".docx"
              onChange={(e) => setUploadFile(e.target.files?.[0] || null)}
              className="hidden"
              id="docx-upload"
            />
            <label htmlFor="docx-upload" className="cursor-pointer">
              <Upload className="w-8 h-8 text-slate-400 mx-auto mb-2" />
              {uploadFile ? (
                <p className="text-sm text-slate-700 font-medium">{uploadFile.name}</p>
              ) : (
                <p className="text-sm text-slate-500">
                  Click to select or drag and drop a .docx file
                </p>
              )}
            </label>
          </div>
        </div>

        <button
          onClick={handleUpload}
          disabled={uploading}
          className="inline-flex items-center gap-2 px-5 py-2.5 bg-primary-600 text-white rounded-lg font-medium hover:bg-primary-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {uploading ? (
            <>
              <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
              Uploading...
            </>
          ) : (
            <>
              <Upload className="w-4 h-4" />
              Upload Template
            </>
          )}
        </button>

        <p className="text-xs text-slate-400 mt-3">
          Use {'{{FIELD_NAME}}'} in your Word document for automatic data merge.
          Supported fields: COMPANY_NAME, HOMEOWNER_NAME, BUYING_ENTITY,
          PROPERTY_ADDRESS, PURCHASE_PRICE, CLOSING_DATE, EMD_AMOUNT,
          ADDITIONAL_CLAUSES
        </p>

        {uploadResult && (
          <div className="mt-3 p-3 bg-green-50 border border-green-200 rounded-lg text-sm text-green-700">
            <CheckCircle2 className="w-4 h-4 inline mr-1.5" />
            Detected merge fields: {uploadResult.length > 0
              ? uploadResult.map((f) => `{{${f}}}`).join(', ')
              : 'None found'}
          </div>
        )}
      </section>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════
// TAB 2 — Generate Contract
// ═══════════════════════════════════════════════════════════════

function GenerateTab({ showToast }: { showToast: (m: string) => void }) {
  const [loading, setLoading] = useState(true)
  const [templates, setTemplates] = useState<Template[]>([])
  const [companyName, setCompanyName] = useState('')

  // Form state
  const [selectedTemplateId, setSelectedTemplateId] = useState('')
  const [homeowner, setHomeowner] = useState('')
  const [entity, setEntity] = useState('')
  const [address, setAddress] = useState('')
  const [price, setPrice] = useState('')
  const [closingDate, setClosingDate] = useState('')
  const [emd, setEmd] = useState('')
  const [clauses, setClauses] = useState('')
  const [customFieldValues, setCustomFieldValues] = useState<Record<string, string>>({})
  const [storageProvider, setStorageProvider] = useState<'google_drive' | 'dropbox'>('google_drive')
  const [generating, setGenerating] = useState(false)
  const [genError, setGenError] = useState('')
  const [genResult, setGenResult] = useState<{ file_name: string; storage_url: string } | null>(null)

  useEffect(() => {
    Promise.all([getTemplates(), getCurrentUser()])
      .then(([tplData, user]) => {
        setTemplates(tplData.templates as Template[])
        setCompanyName((user?.company_name as string) || '')
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  const selectedTemplate = templates.find((t) => t.id === selectedTemplateId)
  const customFields = (selectedTemplate?.merge_fields || []).filter(
    (f) => !STANDARD_FIELDS.includes(f)
  )

  const handleGenerate = async () => {
    if (!selectedTemplateId) { setGenError('Select a template'); return }
    if (!homeowner.trim()) { setGenError('Enter the homeowner name'); return }
    if (!entity.trim()) { setGenError('Enter the buying entity name'); return }

    setGenerating(true)
    setGenError('')
    setGenResult(null)

    try {
      const result = await generateContract({
        template_id: selectedTemplateId,
        homeowner_name: homeowner.trim(),
        buying_entity: entity.trim(),
        property_address: address.trim() || undefined,
        purchase_price: price ? parseFloat(price) : undefined,
        closing_date: closingDate || undefined,
        emd_amount: emd ? parseFloat(emd) : undefined,
        additional_clauses: clauses.trim() || undefined,
        custom_fields: Object.keys(customFieldValues).length > 0 ? customFieldValues : undefined,
        storage_provider: storageProvider,
      })
      setGenResult({ file_name: result.file_name, storage_url: result.storage_url })
    } catch (err: any) {
      setGenError(err.message || 'Failed to generate contract')
    } finally {
      setGenerating(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-4 border-primary-500 border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Success banner */}
      {genResult && (
        <div className="bg-green-50 border border-green-200 rounded-xl p-4">
          <div className="flex items-start gap-3">
            <CheckCircle2 className="w-5 h-5 text-green-500 mt-0.5 shrink-0" />
            <div>
              <p className="text-sm font-medium text-green-800 mb-1">
                Contract generated successfully!
              </p>
              <p className="text-sm text-green-700">{genResult.file_name}</p>
              {genResult.storage_url && (
                <a
                  href={genResult.storage_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-sm text-primary-600 hover:text-primary-800 font-medium mt-2"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                  Open in {storageProvider === 'google_drive' ? 'Google Drive' : 'Dropbox'}
                </a>
              )}
            </div>
            <button onClick={() => setGenResult(null)} className="text-green-500 hover:text-green-700">
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* Step 1 — Select Template */}
      <section className="bg-white rounded-xl border border-slate-200 p-6">
        <h2 className="text-sm font-semibold text-slate-900 mb-3">
          Step 1 &mdash; Select Template
        </h2>
        <div className="relative">
          <select
            value={selectedTemplateId}
            onChange={(e) => {
              setSelectedTemplateId(e.target.value)
              setCustomFieldValues({})
            }}
            className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent appearance-none"
          >
            <option value="">Choose a template...</option>
            {templates.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name} ({t.category})
              </option>
            ))}
          </select>
          <ChevronDown className="w-4 h-4 text-slate-400 absolute right-3 top-3 pointer-events-none" />
        </div>

        {selectedTemplate && selectedTemplate.merge_fields.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-1">
            <span className="text-xs text-slate-400 mr-1">Merge fields:</span>
            {selectedTemplate.merge_fields.map((f) => (
              <span key={f} className="text-[10px] bg-slate-50 text-slate-500 px-1.5 py-0.5 rounded">
                {`{{${f}}}`}
              </span>
            ))}
          </div>
        )}
      </section>

      {/* Step 2 — Deal Information */}
      <section className="bg-white rounded-xl border border-slate-200 p-6">
        <h2 className="text-sm font-semibold text-slate-900 mb-3">
          Step 2 &mdash; Deal Information
        </h2>

        <div className="grid sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              Homeowner Name *
            </label>
            <input
              type="text"
              placeholder="John Smith"
              value={homeowner}
              onChange={(e) => setHomeowner(e.target.value)}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              Buying Entity Name *
            </label>
            <input
              type="text"
              placeholder="ABC Investments LLC"
              value={entity}
              onChange={(e) => setEntity(e.target.value)}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              Property Address
            </label>
            <input
              type="text"
              placeholder="123 Main St, City, State 12345"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              Purchase Price ($)
            </label>
            <input
              type="number"
              min="0"
              step="1000"
              placeholder="250000"
              value={price}
              onChange={(e) => setPrice(e.target.value)}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              Closing Date
            </label>
            <input
              type="date"
              value={closingDate}
              onChange={(e) => setClosingDate(e.target.value)}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              EMD Amount ($)
            </label>
            <input
              type="number"
              min="0"
              step="100"
              placeholder="5000"
              value={emd}
              onChange={(e) => setEmd(e.target.value)}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
            />
          </div>
        </div>

        <div className="mt-4">
          <label className="block text-sm font-medium text-slate-700 mb-1">
            Additional Clauses
          </label>
          <textarea
            placeholder="Enter any special terms, contingencies, or custom language for this deal..."
            value={clauses}
            onChange={(e) => setClauses(e.target.value)}
            rows={3}
            className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent resize-none"
          />
        </div>
      </section>

      {/* Step 3 — Custom Fields */}
      {customFields.length > 0 && (
        <section className="bg-white rounded-xl border border-slate-200 p-6">
          <h2 className="text-sm font-semibold text-slate-900 mb-3">
            Step 3 &mdash; Custom Fields
          </h2>
          <div className="grid sm:grid-cols-2 gap-4">
            {customFields.map((field) => (
              <div key={field}>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  {field.replace(/_/g, ' ')}
                </label>
                <input
                  type="text"
                  value={customFieldValues[field] || ''}
                  onChange={(e) =>
                    setCustomFieldValues((prev) => ({ ...prev, [field]: e.target.value }))
                  }
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                />
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Step 4 — Save To */}
      <section className="bg-white rounded-xl border border-slate-200 p-6">
        <h2 className="text-sm font-semibold text-slate-900 mb-3">
          {customFields.length > 0 ? 'Step 4' : 'Step 3'} &mdash; Save To
        </h2>

        <div className="grid grid-cols-2 gap-4 mb-6">
          <button
            type="button"
            onClick={() => setStorageProvider('google_drive')}
            className={`p-4 rounded-lg border-2 text-left transition-colors ${
              storageProvider === 'google_drive'
                ? 'border-primary-500 bg-primary-50'
                : 'border-slate-200 hover:border-slate-300'
            }`}
          >
            <p className="font-medium text-slate-800">Google Drive</p>
            <p className="text-xs text-slate-400 mt-1">
              Save to your Drive account
            </p>
          </button>
          <button
            type="button"
            onClick={() => setStorageProvider('dropbox')}
            className={`p-4 rounded-lg border-2 text-left transition-colors ${
              storageProvider === 'dropbox'
                ? 'border-primary-500 bg-primary-50'
                : 'border-slate-200 hover:border-slate-300'
            }`}
          >
            <p className="font-medium text-slate-800">Dropbox</p>
            <p className="text-xs text-slate-400 mt-1">
              Save to your Dropbox account
            </p>
          </button>
        </div>

        {genError && (
          <p className="text-sm text-red-600 mb-3 flex items-center gap-1">
            <XCircle className="w-4 h-4" />
            {genError}
          </p>
        )}

        <button
          onClick={handleGenerate}
          disabled={generating}
          className="inline-flex items-center gap-2 px-6 py-2.5 bg-primary-600 text-white rounded-lg font-medium hover:bg-primary-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {generating ? (
            <>
              <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
              Generating contract...
            </>
          ) : (
            <>
              <FileText className="w-4 h-4" />
              Generate &amp; Save Contract
            </>
          )}
        </button>
      </section>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════
// TAB 3 — Contract History
// ═══════════════════════════════════════════════════════════════

function HistoryTab({ showToast }: { showToast: (m: string) => void }) {
  const [loading, setLoading] = useState(true)
  const [contracts, setContracts] = useState<Contract[]>([])

  const loadContracts = useCallback(async () => {
    try {
      const data = await getContracts()
      setContracts(data.contracts as Contract[])
    } catch {
      // ignore
    }
  }, [])

  useEffect(() => {
    loadContracts().finally(() => setLoading(false))
  }, [loadContracts])

  const handleDelete = async (id: string) => {
    try {
      await deleteContract(id)
      showToast('Contract record deleted')
      await loadContracts()
    } catch {
      showToast('Failed to delete contract')
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-4 border-primary-500 border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  return (
    <section className="bg-white rounded-xl border border-slate-200 p-6">
      <h2 className="text-lg font-semibold text-slate-900 mb-4">
        Generated Contracts
      </h2>

      {contracts.length === 0 ? (
        <p className="text-slate-400 text-sm text-center py-6">
          No contracts generated yet
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-left text-slate-500">
                <th className="pb-2 font-medium">File Name</th>
                <th className="pb-2 font-medium">Property</th>
                <th className="pb-2 font-medium">Entity</th>
                <th className="pb-2 font-medium">Storage</th>
                <th className="pb-2 font-medium">Date</th>
                <th className="pb-2 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {contracts.map((c) => (
                <tr
                  key={c.id}
                  className="border-b border-slate-100 hover:bg-slate-50 transition-colors"
                >
                  <td className="py-2.5 max-w-[200px] truncate font-medium text-slate-700">
                    {c.file_name}
                  </td>
                  <td className="py-2.5 max-w-[160px] truncate text-slate-500">
                    {c.property_address || '—'}
                  </td>
                  <td className="py-2.5 text-slate-500">{c.buying_entity}</td>
                  <td className="py-2.5">
                    <span className="text-xs bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full">
                      {c.storage_provider === 'google_drive' ? 'Google Drive' : 'Dropbox'}
                    </span>
                  </td>
                  <td className="py-2.5 text-slate-500">
                    {new Date(c.created_at).toLocaleDateString()}
                  </td>
                  <td className="py-2.5">
                    <div className="flex items-center gap-2">
                      {c.storage_url && (
                        <a
                          href={c.storage_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-xs text-primary-600 hover:text-primary-800"
                        >
                          <ExternalLink className="w-3.5 h-3.5" />
                          Open
                        </a>
                      )}
                      <button
                        onClick={() => handleDelete(c.id)}
                        className="inline-flex items-center gap-1 text-xs text-red-500 hover:text-red-700"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        Delete
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}
