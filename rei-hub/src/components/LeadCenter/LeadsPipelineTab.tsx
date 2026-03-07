import { useState, useEffect, useRef } from 'react'
import {
  Upload, Search, Filter, ChevronDown, Trash2, Plus, ArrowUpRight, Mail,
  User, Phone, MapPin, Tag, FileText, X, Check, AlertCircle, Loader2,
} from 'lucide-react'
import { toast } from 'sonner'
import * as api from '@/services/leadsPipelineApi'

// ── Status config ────────────────────────────────────────

const STATUS_OPTIONS = [
  { value: 'new', label: 'New', color: 'bg-blue-100 text-blue-700' },
  { value: 'contacted', label: 'Contacted', color: 'bg-yellow-100 text-yellow-700' },
  { value: 'mailed', label: 'Mailed', color: 'bg-purple-100 text-purple-700' },
  { value: 'responded', label: 'Responded', color: 'bg-green-100 text-green-700' },
  { value: 'converted', label: 'Converted', color: 'bg-emerald-100 text-emerald-700' },
  { value: 'dead', label: 'Dead', color: 'bg-slate-100 text-slate-500' },
]

function StatusBadge({ status }: { status: string }) {
  const cfg = STATUS_OPTIONS.find((s) => s.value === status) || STATUS_OPTIONS[0]
  return (
    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${cfg.color}`}>
      {cfg.label}
    </span>
  )
}

// ── Main Component ───────────────────────────────────────

export default function LeadsPipelineTab() {
  // Lists state
  const [lists, setLists] = useState<api.LeadList[]>([])
  const [selectedListId, setSelectedListId] = useState<number | null>(null)

  // Leads state
  const [leads, setLeads] = useState<api.Lead[]>([])
  const [totalLeads, setTotalLeads] = useState(0)
  const [loading, setLoading] = useState(false)

  // Filters
  const [statusFilter, setStatusFilter] = useState('')
  const [searchText, setSearchText] = useState('')

  // Upload state
  const [showUpload, setShowUpload] = useState(false)
  const [uploadStep, setUploadStep] = useState<'name' | 'file' | 'mapping' | 'done'>('name')
  const [newListName, setNewListName] = useState('')
  const [newListSource, setNewListSource] = useState('')
  const [createdListId, setCreatedListId] = useState<number | null>(null)
  const [uploadResult, setUploadResult] = useState<api.UploadResult | null>(null)
  const [columnMapping, setColumnMapping] = useState<Record<string, string>>({})
  const [uploadFile, setUploadFile] = useState<File | null>(null)
  const [uploading, setUploading] = useState(false)

  // Detail panel
  const [selectedLead, setSelectedLead] = useState<api.Lead | null>(null)
  const [touches, setTouches] = useState<api.MarketingTouchItem[]>([])

  const fileInputRef = useRef<HTMLInputElement>(null)

  // ── Load data ────────────────────────────────────────────

  useEffect(() => {
    loadLists()
    loadLeads()
  }, [])

  useEffect(() => {
    loadLeads()
  }, [selectedListId, statusFilter, searchText])

  async function loadLists() {
    try {
      const data = await api.getLists()
      setLists(data)
    } catch {
      // Lists may not exist yet
    }
  }

  async function loadLeads() {
    setLoading(true)
    try {
      const params: Parameters<typeof api.getLeads>[0] = { limit: 200 }
      if (selectedListId) params.list_id = selectedListId
      if (statusFilter) params.status = statusFilter
      if (searchText) params.search = searchText
      const data = await api.getLeads(params)
      setLeads(data.leads)
      setTotalLeads(data.total)
    } catch {
      // Demo mode or no leads yet
      setLeads([])
      setTotalLeads(0)
    }
    setLoading(false)
  }

  // ── Upload flow ──────────────────────────────────────────

  function resetUpload() {
    setShowUpload(false)
    setUploadStep('name')
    setNewListName('')
    setNewListSource('')
    setCreatedListId(null)
    setUploadResult(null)
    setColumnMapping({})
    setUploadFile(null)
  }

  async function handleCreateList() {
    if (!newListName.trim()) return toast.error('Enter a list name')
    try {
      const res = await api.createList({
        list_name: newListName,
        source: newListSource || undefined,
      })
      setCreatedListId(res.id)
      setUploadStep('file')
      toast.success('List created! Now upload your file.')
      loadLists()
    } catch (err: any) {
      toast.error(err.message)
    }
  }

  async function handleFileUpload(file: File) {
    if (!createdListId) return
    setUploadFile(file)
    setUploading(true)
    try {
      const result = await api.uploadListFile(createdListId, file)
      setUploadResult(result)
      setColumnMapping(result.suggested_mapping)
      setUploadStep('mapping')
    } catch (err: any) {
      toast.error(err.message)
    }
    setUploading(false)
  }

  async function handleConfirmImport() {
    if (!createdListId || !uploadFile) return
    setUploading(true)
    try {
      const res = await api.confirmImport(createdListId, columnMapping, uploadFile)
      toast.success(`Imported ${res.imported} leads!`)
      setUploadStep('done')
      loadLists()
      loadLeads()
      setTimeout(resetUpload, 1500)
    } catch (err: any) {
      toast.error(err.message)
    }
    setUploading(false)
  }

  // ── Lead actions ─────────────────────────────────────────

  async function handleStatusChange(leadId: string, newStatus: string) {
    try {
      await api.updateLead(leadId, { status: newStatus } as Partial<api.Lead>)
      setLeads((prev) => prev.map((l) => (l.id === leadId ? { ...l, status: newStatus } : l)))
      toast.success('Status updated')
    } catch (err: any) {
      toast.error(err.message)
    }
  }

  async function handlePromote(leadId: string) {
    if (!confirm('Promote this lead to a CRM Contact + Deal?')) return
    try {
      const res = await api.promoteToDeal(leadId)
      toast.success('Lead promoted to CRM!')
      setLeads((prev) =>
        prev.map((l) =>
          l.id === leadId
            ? { ...l, status: 'converted', crm_contact_id: res.crm_contact_id, crm_deal_id: res.crm_deal_id }
            : l,
        ),
      )
    } catch (err: any) {
      toast.error(err.message)
    }
  }

  async function handleDelete(leadId: string) {
    if (!confirm('Delete this lead?')) return
    try {
      await api.deleteLead(leadId)
      setLeads((prev) => prev.filter((l) => l.id !== leadId))
      toast.success('Lead deleted')
    } catch (err: any) {
      toast.error(err.message)
    }
  }

  async function handleSelectLead(lead: api.Lead) {
    setSelectedLead(lead)
    try {
      const t = await api.getLeadTouches(lead.id)
      setTouches(t)
    } catch {
      setTouches([])
    }
  }

  // ── Render ───────────────────────────────────────────────

  const LEAD_FIELDS = [
    { value: '', label: '-- Skip --' },
    { value: 'first_name', label: 'First Name' },
    { value: 'last_name', label: 'Last Name' },
    { value: 'full_name', label: 'Full Name' },
    { value: 'phone', label: 'Phone' },
    { value: 'email', label: 'Email' },
    { value: 'address', label: 'Address' },
    { value: 'city', label: 'City' },
    { value: 'state', label: 'State' },
    { value: 'zip_code', label: 'Zip Code' },
    { value: 'property_type', label: 'Property Type' },
  ]

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-3">
        <button
          onClick={() => setShowUpload(true)}
          className="px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors flex items-center gap-2 text-sm font-medium"
        >
          <Upload className="w-4 h-4" />
          Upload List
        </button>

        {/* List filter */}
        <select
          value={selectedListId ?? ''}
          onChange={(e) => setSelectedListId(e.target.value ? Number(e.target.value) : null)}
          className="px-3 py-2 border border-slate-300 rounded-lg text-sm"
        >
          <option value="">All Lists</option>
          {lists.map((l) => (
            <option key={l.id} value={l.id}>
              {l.list_name} ({l.lead_count})
            </option>
          ))}
        </select>

        {/* Status filter */}
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="px-3 py-2 border border-slate-300 rounded-lg text-sm"
        >
          <option value="">All Statuses</option>
          {STATUS_OPTIONS.map((s) => (
            <option key={s.value} value={s.value}>{s.label}</option>
          ))}
        </select>

        {/* Search */}
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            type="text"
            placeholder="Search leads..."
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
            className="w-full pl-10 pr-4 py-2 border border-slate-300 rounded-lg text-sm"
          />
        </div>

        <span className="text-sm text-slate-500">{totalLeads} leads</span>
      </div>

      {/* Upload Modal */}
      {showUpload && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl max-h-[80vh] overflow-y-auto">
            <div className="flex items-center justify-between p-6 border-b border-slate-200">
              <h3 className="text-lg font-bold text-slate-900">Upload Lead List</h3>
              <button onClick={resetUpload} className="text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 space-y-4">
              {/* Step 1: Name */}
              {uploadStep === 'name' && (
                <>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">List Name *</label>
                    <input
                      type="text"
                      value={newListName}
                      onChange={(e) => setNewListName(e.target.value)}
                      placeholder="e.g. San Antonio Absentee Owners - March 2026"
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Source (optional)</label>
                    <input
                      type="text"
                      value={newListSource}
                      onChange={(e) => setNewListSource(e.target.value)}
                      placeholder="e.g. PropStream, BatchLeads, ListSource"
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
                    />
                  </div>
                  <button
                    onClick={handleCreateList}
                    className="px-6 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 text-sm font-medium"
                  >
                    Next: Upload File
                  </button>
                </>
              )}

              {/* Step 2: File Upload */}
              {uploadStep === 'file' && (
                <>
                  <div
                    className="border-2 border-dashed border-slate-300 rounded-lg p-8 text-center hover:border-primary-400 transition-colors cursor-pointer"
                    onClick={() => fileInputRef.current?.click()}
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={(e) => {
                      e.preventDefault()
                      const f = e.dataTransfer.files[0]
                      if (f) handleFileUpload(f)
                    }}
                  >
                    {uploading ? (
                      <Loader2 className="w-12 h-12 text-primary-400 mx-auto mb-3 animate-spin" />
                    ) : (
                      <Upload className="w-12 h-12 text-slate-300 mx-auto mb-3" />
                    )}
                    <p className="text-slate-600 font-medium">
                      {uploading ? 'Processing file...' : 'Drop your CSV or XLSX here, or click to browse'}
                    </p>
                    <p className="text-sm text-slate-400 mt-1">Supports .csv, .xlsx, .xls</p>
                  </div>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".csv,.xlsx,.xls,.tsv"
                    className="hidden"
                    onChange={(e) => {
                      const f = e.target.files?.[0]
                      if (f) handleFileUpload(f)
                    }}
                  />
                </>
              )}

              {/* Step 3: Column Mapping */}
              {uploadStep === 'mapping' && uploadResult && (
                <>
                  <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-sm text-blue-800">
                    Found <strong>{uploadResult.row_count}</strong> rows in <strong>{uploadResult.filename}</strong>.
                    Confirm the column mapping below.
                  </div>
                  <div className="space-y-2 max-h-[300px] overflow-y-auto">
                    {uploadResult.headers.map((header) => (
                      <div key={header} className="flex items-center gap-3">
                        <span className="w-1/3 text-sm font-mono text-slate-600 truncate" title={header}>
                          {header}
                        </span>
                        <span className="text-slate-400">→</span>
                        <select
                          value={columnMapping[header] || ''}
                          onChange={(e) =>
                            setColumnMapping((prev) => ({ ...prev, [header]: e.target.value }))
                          }
                          className="flex-1 px-3 py-1.5 border border-slate-300 rounded text-sm"
                        >
                          {LEAD_FIELDS.map((f) => (
                            <option key={f.value} value={f.value}>{f.label}</option>
                          ))}
                        </select>
                      </div>
                    ))}
                  </div>

                  {/* Preview */}
                  {uploadResult.preview_rows.length > 0 && (
                    <div className="mt-3">
                      <p className="text-xs text-slate-500 mb-1">Preview (first {uploadResult.preview_rows.length} rows):</p>
                      <div className="overflow-x-auto">
                        <table className="text-xs border border-slate-200 rounded">
                          <thead>
                            <tr className="bg-slate-50">
                              {uploadResult.headers.slice(0, 6).map((h) => (
                                <th key={h} className="px-2 py-1 text-left font-medium text-slate-600 border-b">{h}</th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {uploadResult.preview_rows.slice(0, 3).map((row, i) => (
                              <tr key={i}>
                                {uploadResult!.headers.slice(0, 6).map((h) => (
                                  <td key={h} className="px-2 py-1 text-slate-500 border-b">{row[h] || '-'}</td>
                                ))}
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}

                  <button
                    onClick={handleConfirmImport}
                    disabled={uploading}
                    className="px-6 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 text-sm font-medium disabled:opacity-50 flex items-center gap-2"
                  >
                    {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                    Import {uploadResult.row_count} Leads
                  </button>
                </>
              )}

              {/* Step 4: Done */}
              {uploadStep === 'done' && (
                <div className="text-center py-8">
                  <Check className="w-16 h-16 text-green-500 mx-auto mb-3" />
                  <p className="text-lg font-semibold text-slate-900">Import Complete!</p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Lead Detail Side Panel */}
      {selectedLead && (
        <div className="fixed inset-0 bg-black/30 flex justify-end z-50">
          <div className="bg-white w-full max-w-md shadow-2xl overflow-y-auto">
            <div className="flex items-center justify-between p-4 border-b">
              <h3 className="font-bold text-slate-900">
                {selectedLead.full_name || `${selectedLead.first_name || ''} ${selectedLead.last_name || ''}`}
              </h3>
              <button onClick={() => setSelectedLead(null)} className="text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-4 space-y-4">
              <div className="space-y-2 text-sm">
                {selectedLead.address && (
                  <div className="flex items-center gap-2 text-slate-600">
                    <MapPin className="w-4 h-4" />
                    {selectedLead.address}, {selectedLead.city} {selectedLead.state} {selectedLead.zip_code}
                  </div>
                )}
                {selectedLead.phone && (
                  <div className="flex items-center gap-2 text-slate-600">
                    <Phone className="w-4 h-4" /> {selectedLead.phone}
                  </div>
                )}
                {selectedLead.email && (
                  <div className="flex items-center gap-2 text-slate-600">
                    <Mail className="w-4 h-4" /> {selectedLead.email}
                  </div>
                )}
              </div>

              <div>
                <label className="block text-xs text-slate-500 mb-1">Status</label>
                <select
                  value={selectedLead.status}
                  onChange={(e) => {
                    handleStatusChange(selectedLead.id, e.target.value)
                    setSelectedLead({ ...selectedLead, status: e.target.value })
                  }}
                  className="w-full px-3 py-2 border rounded text-sm"
                >
                  {STATUS_OPTIONS.map((s) => (
                    <option key={s.value} value={s.value}>{s.label}</option>
                  ))}
                </select>
              </div>

              {/* Marketing History */}
              <div>
                <h4 className="font-medium text-slate-900 text-sm mb-2 flex items-center gap-2">
                  <Mail className="w-4 h-4" /> Marketing History ({selectedLead.total_mailers_sent} mailers)
                </h4>
                {touches.length > 0 ? (
                  <div className="space-y-2">
                    {touches.map((t) => (
                      <div key={t.id} className="bg-slate-50 rounded p-2 text-xs">
                        <span className="font-medium capitalize">{t.touch_type}</span>
                        {' - '}
                        <span className={t.delivery_status === 'delivered' ? 'text-green-600' : 'text-slate-500'}>
                          {t.delivery_status}
                        </span>
                        {t.cost != null && <span className="text-slate-400 ml-2">${t.cost.toFixed(2)}</span>}
                        {t.sent_date && (
                          <span className="text-slate-400 ml-2">
                            {new Date(t.sent_date).toLocaleDateString()}
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-slate-400">No mailers sent yet</p>
                )}
              </div>

              {/* Actions */}
              <div className="flex gap-2">
                {!selectedLead.crm_deal_id && (
                  <button
                    onClick={() => handlePromote(selectedLead.id)}
                    className="flex-1 px-3 py-2 bg-emerald-600 text-white rounded text-sm font-medium hover:bg-emerald-700 flex items-center justify-center gap-1"
                  >
                    <ArrowUpRight className="w-4 h-4" /> Promote to Deal
                  </button>
                )}
                {selectedLead.crm_deal_id && (
                  <span className="flex-1 px-3 py-2 bg-emerald-50 text-emerald-700 rounded text-sm text-center font-medium">
                    Already in CRM
                  </span>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Leads Table */}
      {loading ? (
        <div className="text-center py-12">
          <Loader2 className="w-8 h-8 text-primary-400 mx-auto animate-spin" />
          <p className="text-slate-500 mt-2">Loading leads...</p>
        </div>
      ) : leads.length === 0 ? (
        <div className="text-center py-16 bg-slate-50 rounded-lg border border-slate-200">
          <Upload className="w-16 h-16 text-slate-300 mx-auto mb-4" />
          <h3 className="text-xl font-semibold text-slate-700 mb-2">No leads yet</h3>
          <p className="text-slate-500 max-w-md mx-auto mb-4">
            Upload a CSV or XLSX lead list to get started. You can then filter, manage, and send mail to your leads.
          </p>
          <button
            onClick={() => setShowUpload(true)}
            className="px-6 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 text-sm font-medium"
          >
            Upload Your First List
          </button>
        </div>
      ) : (
        <div className="bg-white rounded-lg border border-slate-200 overflow-x-auto">
          <table className="w-full">
            <thead className="bg-slate-50">
              <tr>
                <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase">Name</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase">Address</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase">Contact</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase">Status</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase">Mailers</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {leads.map((lead) => (
                <tr
                  key={lead.id}
                  className="hover:bg-slate-50 cursor-pointer transition-colors"
                  onClick={() => handleSelectLead(lead)}
                >
                  <td className="px-4 py-3">
                    <div className="text-sm font-medium text-slate-900">
                      {lead.full_name || `${lead.first_name || ''} ${lead.last_name || ''}`.trim() || '-'}
                    </div>
                    {lead.property_type && (
                      <div className="text-xs text-slate-400">{lead.property_type}</div>
                    )}
                  </td>
                  <td className="px-4 py-3 text-sm text-slate-600">
                    {lead.address ? (
                      <div>
                        <div>{lead.address}</div>
                        <div className="text-xs text-slate-400">
                          {lead.city}{lead.state ? `, ${lead.state}` : ''} {lead.zip_code}
                        </div>
                      </div>
                    ) : '-'}
                  </td>
                  <td className="px-4 py-3 text-sm text-slate-600">
                    {lead.phone && <div>{lead.phone}</div>}
                    {lead.email && <div className="text-xs text-slate-400">{lead.email}</div>}
                    {!lead.phone && !lead.email && '-'}
                  </td>
                  <td className="px-4 py-3">
                    <StatusBadge status={lead.status} />
                  </td>
                  <td className="px-4 py-3 text-sm text-slate-600">
                    {lead.total_mailers_sent > 0 ? (
                      <span className="flex items-center gap-1">
                        <Mail className="w-3 h-3" /> {lead.total_mailers_sent}
                      </span>
                    ) : '-'}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                      {!lead.crm_deal_id && (
                        <button
                          onClick={() => handlePromote(lead.id)}
                          className="p-1.5 text-emerald-600 hover:bg-emerald-50 rounded"
                          title="Promote to Deal"
                        >
                          <ArrowUpRight className="w-4 h-4" />
                        </button>
                      )}
                      <button
                        onClick={() => handleDelete(lead.id)}
                        className="p-1.5 text-red-400 hover:bg-red-50 rounded"
                        title="Delete"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
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
