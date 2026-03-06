import { useState, useEffect, useCallback, useRef } from 'react'
import {
  FileText,
  Upload,
  CheckCircle2,
  Circle,
  MoreHorizontal,
  Plus,
  ExternalLink,
  X,
  XCircle,
} from 'lucide-react'
import {
  getDealChecklist,
  updateChecklistItem,
  uploadSignedCopy,
  deleteChecklistItem,
  addChecklistItem,
  generateLoi,
  getDealLois,
} from '@/services/documentsApi'

// ── Types ──────────────────────────────────────────────────────

interface ChecklistItem {
  id: string
  deal_id: string
  checklist_template_id: string
  name: string
  status: string
  document_template_id: string | null
  generated_contract_id: string | null
  signed_file_name: string | null
  signed_at: string | null
  completed_at: string | null
  notes: string | null
  sort_order: number
  created_at: string
}

interface Props {
  dealId: string
  dealType: string
  homeownerName?: string
  propertyAddress?: string
  purchasePrice?: number
  asIsValue?: number
  existingMortgageBalance?: number
  monthlyPayment?: number
  interestRate?: number
}

const STATUS_CONFIG: Record<string, { label: string; color: string }> = {
  not_started: { label: 'Not Started', color: 'bg-slate-100 text-slate-600' },
  generated: { label: 'Generated', color: 'bg-blue-100 text-blue-700' },
  sent: { label: 'Sent', color: 'bg-amber-100 text-amber-700' },
  signed: { label: 'Signed', color: 'bg-green-100 text-green-700' },
  filed: { label: 'Filed', color: 'bg-purple-100 text-purple-700' },
}

// ═══════════════════════════════════════════════════════════════
// Main component
// ═══════════════════════════════════════════════════════════════

export default function ContractChecklist({
  dealId,
  dealType,
  homeownerName = '',
  propertyAddress = '',
  purchasePrice,
  asIsValue,
  existingMortgageBalance,
  monthlyPayment,
  interestRate,
}: Props) {
  const [loading, setLoading] = useState(true)
  const [items, setItems] = useState<ChecklistItem[]>([])
  const [showAddForm, setShowAddForm] = useState(false)
  const [addName, setAddName] = useState('')
  const [menuOpen, setMenuOpen] = useState<string | null>(null)
  const [editingNotes, setEditingNotes] = useState<string | null>(null)
  const [notesValue, setNotesValue] = useState('')
  const [showLoiModal, setShowLoiModal] = useState(false)
  const fileRefs = useRef<Record<string, HTMLInputElement | null>>({})

  const loadChecklist = useCallback(async () => {
    try {
      const data = await getDealChecklist(dealId, dealType)
      setItems(data.items as unknown as ChecklistItem[])
    } catch {
      // ignore
    }
  }, [dealId, dealType])

  useEffect(() => {
    loadChecklist().finally(() => setLoading(false))
  }, [loadChecklist])

  const completed = items.filter(
    (i) => i.status === 'signed' || i.status === 'filed'
  ).length

  const handleStatusToggle = async (item: ChecklistItem) => {
    const next =
      item.status === 'filed'
        ? 'not_started'
        : item.status === 'signed'
          ? 'filed'
          : item.status
    if (next === item.status) return
    try {
      await updateChecklistItem(item.id, { status: next })
      await loadChecklist()
    } catch {
      // ignore
    }
  }

  const handleUploadSigned = async (itemId: string, file: File) => {
    try {
      await uploadSignedCopy(itemId, file)
      await loadChecklist()
    } catch {
      // ignore
    }
  }

  const handleDelete = async (id: string) => {
    try {
      await deleteChecklistItem(id)
      await loadChecklist()
    } catch {
      // ignore
    }
    setMenuOpen(null)
  }

  const handleAdd = async () => {
    if (!addName.trim()) return
    try {
      await addChecklistItem(dealId, { name: addName.trim(), sort_order: items.length })
      setAddName('')
      setShowAddForm(false)
      await loadChecklist()
    } catch {
      // ignore
    }
  }

  const handleSaveNotes = async (itemId: string) => {
    try {
      await updateChecklistItem(itemId, { notes: notesValue })
      setEditingNotes(null)
      await loadChecklist()
    } catch {
      // ignore
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-32">
        <div className="w-6 h-6 border-4 border-primary-500 border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-base font-semibold text-slate-900">Contracts &amp; Documents</h3>
          {items.length > 0 && (
            <div className="flex items-center gap-2 mt-1">
              <div className="flex-1 h-1.5 bg-slate-100 rounded-full overflow-hidden max-w-[140px]">
                <div
                  className="h-full bg-primary-500 rounded-full transition-all"
                  style={{ width: `${items.length > 0 ? (completed / items.length) * 100 : 0}%` }}
                />
              </div>
              <span className="text-xs text-slate-400">{completed} of {items.length}</span>
            </div>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowAddForm(true)}
            className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-slate-600 bg-slate-100 rounded-lg hover:bg-slate-200"
          >
            <Plus className="w-3.5 h-3.5" />
            Add Item
          </button>
          <button
            onClick={() => setShowLoiModal(true)}
            className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-white bg-primary-600 rounded-lg hover:bg-primary-700"
          >
            <FileText className="w-3.5 h-3.5" />
            Generate LOI
          </button>
        </div>
      </div>

      {/* Add form */}
      {showAddForm && (
        <div className="flex gap-2 items-center">
          <input
            type="text"
            placeholder="New item name"
            value={addName}
            onChange={(e) => setAddName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
            className="flex-1 px-3 py-1.5 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
            autoFocus
          />
          <button onClick={handleAdd} className="px-3 py-1.5 text-xs font-medium bg-primary-600 text-white rounded-lg">
            Add
          </button>
          <button onClick={() => setShowAddForm(false)} className="text-slate-400 hover:text-slate-600">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Checklist */}
      {items.length === 0 ? (
        <p className="text-sm text-slate-400 text-center py-4">No checklist items yet</p>
      ) : (
        <div className="divide-y divide-slate-100">
          {items.map((item) => {
            const cfg = STATUS_CONFIG[item.status] || STATUS_CONFIG.not_started
            const isComplete = item.status === 'signed' || item.status === 'filed'
            return (
              <div key={item.id} className="py-2.5 flex items-center gap-3 group">
                {/* Toggle */}
                <button onClick={() => handleStatusToggle(item)} className="shrink-0">
                  {isComplete ? (
                    <CheckCircle2 className="w-5 h-5 text-green-500" />
                  ) : (
                    <Circle className="w-5 h-5 text-slate-300" />
                  )}
                </button>

                {/* Name */}
                <span className={`flex-1 text-sm ${isComplete ? 'line-through text-slate-400' : 'text-slate-700'}`}>
                  {item.name}
                </span>

                {/* Status badge */}
                <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${cfg.color}`}>
                  {cfg.label}
                </span>

                {/* Upload signed */}
                <input
                  ref={(el) => { fileRefs.current[item.id] = el }}
                  type="file"
                  accept=".docx,.pdf"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0]
                    if (f) handleUploadSigned(item.id, f)
                  }}
                />
                <button
                  onClick={() => fileRefs.current[item.id]?.click()}
                  className="text-slate-400 hover:text-primary-600 opacity-0 group-hover:opacity-100 transition-opacity"
                  title="Upload signed copy"
                >
                  <Upload className="w-3.5 h-3.5" />
                </button>

                {/* Menu */}
                <div className="relative">
                  <button
                    onClick={() => setMenuOpen(menuOpen === item.id ? null : item.id)}
                    className="text-slate-400 hover:text-slate-600 opacity-0 group-hover:opacity-100 transition-opacity"
                  >
                    <MoreHorizontal className="w-4 h-4" />
                  </button>
                  {menuOpen === item.id && (
                    <div className="absolute right-0 top-6 bg-white border border-slate-200 rounded-lg shadow-lg z-10 py-1 min-w-[130px]">
                      <button
                        onClick={() => {
                          setEditingNotes(item.id)
                          setNotesValue(item.notes || '')
                          setMenuOpen(null)
                        }}
                        className="block w-full text-left px-3 py-1.5 text-xs text-slate-600 hover:bg-slate-50"
                      >
                        Edit notes
                      </button>
                      {(['not_started', 'generated', 'sent', 'signed', 'filed'] as const).map(
                        (st) =>
                          st !== item.status && (
                            <button
                              key={st}
                              onClick={async () => {
                                await updateChecklistItem(item.id, { status: st })
                                setMenuOpen(null)
                                await loadChecklist()
                              }}
                              className="block w-full text-left px-3 py-1.5 text-xs text-slate-600 hover:bg-slate-50"
                            >
                              Set {STATUS_CONFIG[st].label}
                            </button>
                          )
                      )}
                      <button
                        onClick={() => handleDelete(item.id)}
                        className="block w-full text-left px-3 py-1.5 text-xs text-red-500 hover:bg-red-50"
                      >
                        Remove
                      </button>
                    </div>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Notes editor */}
      {editingNotes && (
        <div className="border border-slate-200 rounded-lg p-3 space-y-2">
          <p className="text-xs font-medium text-slate-600">Edit notes</p>
          <textarea
            value={notesValue}
            onChange={(e) => setNotesValue(e.target.value)}
            rows={2}
            className="w-full px-2 py-1.5 border border-slate-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 resize-none"
          />
          <div className="flex gap-2">
            <button
              onClick={() => handleSaveNotes(editingNotes)}
              className="px-3 py-1 text-xs font-medium bg-primary-600 text-white rounded"
            >
              Save
            </button>
            <button
              onClick={() => setEditingNotes(null)}
              className="px-3 py-1 text-xs font-medium text-slate-600 bg-slate-100 rounded"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* LOI Modal */}
      {showLoiModal && (
        <LoiModal
          dealId={dealId}
          homeownerName={homeownerName}
          propertyAddress={propertyAddress}
          purchasePrice={purchasePrice}
          asIsValue={asIsValue}
          existingMortgageBalance={existingMortgageBalance}
          monthlyPayment={monthlyPayment}
          interestRate={interestRate}
          onClose={() => setShowLoiModal(false)}
          onGenerated={loadChecklist}
        />
      )}
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════
// LOI Modal
// ═══════════════════════════════════════════════════════════════

interface LoiModalProps {
  dealId: string
  homeownerName: string
  propertyAddress: string
  purchasePrice?: number
  asIsValue?: number
  existingMortgageBalance?: number
  monthlyPayment?: number
  interestRate?: number
  onClose: () => void
  onGenerated: () => void
}

function LoiModal({
  dealId,
  homeownerName: defaultHomeowner,
  propertyAddress: defaultAddress,
  purchasePrice: defaultPrice,
  asIsValue: defaultAiv,
  existingMortgageBalance: defaultEmb,
  monthlyPayment: defaultMp,
  interestRate: defaultRate,
  onClose,
  onGenerated,
}: LoiModalProps) {
  const [homeowner, setHomeowner] = useState(defaultHomeowner)
  const [address, setAddress] = useState(defaultAddress)
  const [price, setPrice] = useState(defaultPrice?.toString() || '')
  const [aiv, setAiv] = useState(defaultAiv?.toString() || '')
  const [emb, setEmb] = useState(defaultEmb?.toString() || '')
  const [mp, setMp] = useState(defaultMp?.toString() || '')
  const [rate, setRate] = useState(defaultRate?.toString() || '')

  const [options, setOptions] = useState({
    subject_to: true,
    cash_purchase: true,
    owner_financing: true,
    lease_option: true,
  })

  const [ofDown, setOfDown] = useState('')
  const [loTerm, setLoTerm] = useState('')
  const [loPayment, setLoPayment] = useState('')
  const [loPrice, setLoPrice] = useState('')
  const [notes, setNotes] = useState('')
  const [storageProvider, setStorageProvider] = useState<'google_drive' | 'dropbox'>('google_drive')
  const [generating, setGenerating] = useState(false)
  const [error, setError] = useState('')
  const [result, setResult] = useState<{ file_name: string; storage_url: string } | null>(null)

  const toggleOption = (key: keyof typeof options) => {
    setOptions((prev) => ({ ...prev, [key]: !prev[key] }))
  }

  const handleGenerate = async () => {
    if (!homeowner.trim()) { setError('Enter the homeowner name'); return }
    if (!address.trim()) { setError('Enter the property address'); return }

    setGenerating(true)
    setError('')
    setResult(null)

    const included = Object.entries(options)
      .filter(([, v]) => v)
      .map(([k]) => k)

    try {
      const res = await generateLoi({
        deal_id: dealId,
        included_options: included,
        homeowner_name: homeowner.trim(),
        property_address: address.trim(),
        purchase_price: price ? parseFloat(price) : undefined,
        as_is_value: aiv ? parseFloat(aiv) : undefined,
        existing_mortgage_balance: emb ? parseFloat(emb) : undefined,
        monthly_payment: mp ? parseFloat(mp) : undefined,
        interest_rate: rate ? parseFloat(rate) : undefined,
        owner_finance_down: ofDown ? parseFloat(ofDown) : undefined,
        lease_option_term: loTerm || undefined,
        lease_monthly_payment: loPayment ? parseFloat(loPayment) : undefined,
        option_purchase_price: loPrice ? parseFloat(loPrice) : undefined,
        additional_notes: notes || undefined,
        storage_provider: storageProvider,
      })
      setResult({ file_name: res.file_name, storage_url: res.storage_url })
      onGenerated()
    } catch (err: any) {
      setError(err.message || 'Failed to generate LOI')
    } finally {
      setGenerating(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto mx-4">
        <div className="sticky top-0 bg-white border-b border-slate-200 px-6 py-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-slate-900">Generate Letter of Intent</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-5">
          {/* Success banner */}
          {result && (
            <div className="bg-green-50 border border-green-200 rounded-lg p-3">
              <div className="flex items-start gap-2">
                <CheckCircle2 className="w-4 h-4 text-green-500 mt-0.5 shrink-0" />
                <div>
                  <p className="text-sm font-medium text-green-800">LOI generated!</p>
                  <p className="text-xs text-green-700">{result.file_name}</p>
                  {result.storage_url && (
                    <a
                      href={result.storage_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-xs text-primary-600 hover:text-primary-800 mt-1"
                    >
                      <ExternalLink className="w-3 h-3" />
                      Open document
                    </a>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Deal info */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Homeowner Name *</label>
              <input type="text" value={homeowner} onChange={(e) => setHomeowner(e.target.value)}
                className="w-full px-2.5 py-1.5 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500" />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Property Address *</label>
              <input type="text" value={address} onChange={(e) => setAddress(e.target.value)}
                className="w-full px-2.5 py-1.5 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500" />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Purchase Price ($)</label>
              <input type="number" value={price} onChange={(e) => setPrice(e.target.value)}
                className="w-full px-2.5 py-1.5 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500" />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">As-Is Value ($)</label>
              <input type="number" value={aiv} onChange={(e) => setAiv(e.target.value)}
                className="w-full px-2.5 py-1.5 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500" />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Existing Mortgage ($)</label>
              <input type="number" value={emb} onChange={(e) => setEmb(e.target.value)}
                className="w-full px-2.5 py-1.5 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500" />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Monthly Payment ($)</label>
              <input type="number" value={mp} onChange={(e) => setMp(e.target.value)}
                className="w-full px-2.5 py-1.5 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500" />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Interest Rate (%)</label>
              <input type="number" step="0.1" value={rate} onChange={(e) => setRate(e.target.value)}
                className="w-full px-2.5 py-1.5 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500" />
            </div>
          </div>

          {/* Include these options */}
          <div>
            <p className="text-xs font-medium text-slate-600 mb-2">Include these options:</p>
            <div className="space-y-1.5">
              {[
                { key: 'subject_to' as const, label: 'Subject To Existing Financing' },
                { key: 'cash_purchase' as const, label: 'Cash Purchase' },
                { key: 'owner_financing' as const, label: 'Owner Financing' },
                { key: 'lease_option' as const, label: 'Lease Option' },
              ].map(({ key, label }) => (
                <label key={key} className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" checked={options[key]} onChange={() => toggleOption(key)}
                    className="rounded text-primary-600 focus:ring-primary-500" />
                  <span className="text-sm text-slate-700">{label}</span>
                </label>
              ))}
            </div>
          </div>

          {/* Owner Financing extras */}
          {options.owner_financing && (
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Down Payment ($)</label>
              <input type="number" value={ofDown} onChange={(e) => setOfDown(e.target.value)}
                className="w-full px-2.5 py-1.5 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500" />
            </div>
          )}

          {/* Lease Option extras */}
          {options.lease_option && (
            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Term</label>
                <input type="text" placeholder="24 months" value={loTerm} onChange={(e) => setLoTerm(e.target.value)}
                  className="w-full px-2.5 py-1.5 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500" />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Monthly ($)</label>
                <input type="number" value={loPayment} onChange={(e) => setLoPayment(e.target.value)}
                  className="w-full px-2.5 py-1.5 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500" />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Option Price ($)</label>
                <input type="number" value={loPrice} onChange={(e) => setLoPrice(e.target.value)}
                  className="w-full px-2.5 py-1.5 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500" />
              </div>
            </div>
          )}

          {/* Notes */}
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Additional Notes</label>
            <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2}
              className="w-full px-2.5 py-1.5 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 resize-none" />
          </div>

          {/* Storage */}
          <div>
            <p className="text-xs font-medium text-slate-600 mb-2">Save To</p>
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => setStorageProvider('google_drive')}
                className={`p-3 rounded-lg border-2 text-left text-sm ${
                  storageProvider === 'google_drive'
                    ? 'border-primary-500 bg-primary-50'
                    : 'border-slate-200 hover:border-slate-300'
                }`}
              >
                Google Drive
              </button>
              <button
                type="button"
                onClick={() => setStorageProvider('dropbox')}
                className={`p-3 rounded-lg border-2 text-left text-sm ${
                  storageProvider === 'dropbox'
                    ? 'border-primary-500 bg-primary-50'
                    : 'border-slate-200 hover:border-slate-300'
                }`}
              >
                Dropbox
              </button>
            </div>
          </div>

          {error && (
            <p className="text-sm text-red-600 flex items-center gap-1">
              <XCircle className="w-4 h-4" />
              {error}
            </p>
          )}

          <button
            onClick={handleGenerate}
            disabled={generating}
            className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-primary-600 text-white rounded-lg font-medium hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {generating ? (
              <>
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                Generating...
              </>
            ) : (
              <>
                <FileText className="w-4 h-4" />
                Generate Letter of Intent
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  )
}
