import { useState, useEffect, useCallback, useMemo } from 'react'
import {
  Banknote,
  Plus,
  Edit2,
  Trash2,
  X,
  Check,
  AlertCircle,
  CheckCircle2,
  Send,
} from 'lucide-react'
import { toast } from 'sonner'
import type { DealLien } from '@/types'
import {
  listLiens,
  createLien,
  updateLien,
  deleteLien,
  submitNegotiationRequest,
} from '@/services/negotiationApi'

interface DealLienManagerProps {
  dealId: string
  initialLiens?: DealLien[]
}

// ── Lien Type Badge Colors ──────────────────────────────────────────

function getLienTypeBadge(lienType: string): { bg: string; text: string } {
  const type = lienType.toLowerCase()
  if (type.includes('mortgage')) return { bg: 'bg-blue-100', text: 'text-blue-700' }
  if (type.includes('county') || type.includes('tax')) {
    return { bg: 'bg-green-100', text: 'text-green-700' }
  }
  if (type.includes('hoa')) return { bg: 'bg-amber-100', text: 'text-amber-700' }
  return { bg: 'bg-gray-100', text: 'text-gray-700' }
}

function getStatusBadge(status: string): { bg: string; text: string } {
  const s = (status || '').toLowerCase()
  if (s === 'current' || s === 'good standing') {
    return { bg: 'bg-green-100', text: 'text-green-700' }
  }
  if (
    s === 'delinquent' ||
    s === 'default' ||
    s === 'foreclosure'
  ) {
    return { bg: 'bg-red-100', text: 'text-red-700' }
  }
  return { bg: 'bg-gray-100', text: 'text-gray-700' }
}

// ── Format Currency ────────────────────────────────────────────────

function formatCurrency(value?: number): string {
  if (value === undefined || value === null) return '$0.00'
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
  }).format(value)
}

// ── Lien Form ──────────────────────────────────────────────────────

interface LienFormData {
  lienType: string
  lienHolder: string
  accountNumber: string
  balance: number
  monthlyPayment: number
  interestRate: number
  loanType: string
  status: string
  paymentsCurrent: string
  monthsBehind: number
  amountBehind: number
  notes: string
}

const LIEN_TYPES = [
  '1st Mortgage',
  '2nd Mortgage',
  '3rd Mortgage',
  'County Tax',
  'HOA Lien',
  'Mechanics Lien',
  'Judgment Lien',
  'Other',
]

const LOAN_TYPES = [
  'Conventional',
  'FHA',
  'VA',
  'USDA',
  'HELOC',
  'Other',
]

const STATUSES = ['Current', 'Delinquent', 'Default', 'Foreclosure']

function LienForm({
  initialData,
  onSave,
  onCancel,
}: {
  initialData?: DealLien
  onSave: (data: LienFormData) => void
  onCancel: () => void
}) {
  const [form, setForm] = useState<LienFormData>(
    initialData
      ? {
          lienType: initialData.lienType || '',
          lienHolder: initialData.lienHolder || '',
          accountNumber: initialData.accountNumber || '',
          balance: initialData.balance || 0,
          monthlyPayment: initialData.monthlyPayment || 0,
          interestRate: initialData.interestRate || 0,
          loanType: initialData.loanType || 'Conventional',
          status: initialData.status || 'Current',
          paymentsCurrent: initialData.paymentsCurrent || 'Yes',
          monthsBehind: initialData.monthsBehind || 0,
          amountBehind: initialData.amountBehind || 0,
          notes: initialData.notes || '',
        }
      : {
          lienType: '',
          lienHolder: '',
          accountNumber: '',
          balance: 0,
          monthlyPayment: 0,
          interestRate: 0,
          loanType: 'Conventional',
          status: 'Current',
          paymentsCurrent: 'Yes',
          monthsBehind: 0,
          amountBehind: 0,
          notes: '',
        }
  )

  const handleChange = (
    field: keyof LienFormData,
    value: string | number
  ) => {
    setForm((prev) => ({ ...prev, [field]: value }))
  }

  const isNotCurrent = form.status !== 'Current'

  return (
    <div className="space-y-3 p-4 bg-gray-50 rounded-lg border border-gray-200">
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">
            Lien Type *
          </label>
          <select
            value={form.lienType}
            onChange={(e) => handleChange('lienType', e.target.value)}
            className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="">Select type</option>
            {LIEN_TYPES.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">
            Lien Holder *
          </label>
          <input
            type="text"
            value={form.lienHolder}
            onChange={(e) => handleChange('lienHolder', e.target.value)}
            placeholder="Bank, county, etc."
            className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">
            Account Number
          </label>
          <input
            type="text"
            value={form.accountNumber}
            onChange={(e) => handleChange('accountNumber', e.target.value)}
            placeholder="e.g. 123456789"
            className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">
            Balance
          </label>
          <input
            type="number"
            value={form.balance}
            onChange={(e) => handleChange('balance', parseFloat(e.target.value) || 0)}
            placeholder="0.00"
            step="0.01"
            className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">
            Monthly Payment
          </label>
          <input
            type="number"
            value={form.monthlyPayment}
            onChange={(e) => handleChange('monthlyPayment', parseFloat(e.target.value) || 0)}
            placeholder="0.00"
            step="0.01"
            className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">
            Interest Rate (%)
          </label>
          <input
            type="number"
            value={form.interestRate}
            onChange={(e) => handleChange('interestRate', parseFloat(e.target.value) || 0)}
            placeholder="0.00"
            step="0.01"
            className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">
            Loan Type
          </label>
          <select
            value={form.loanType}
            onChange={(e) => handleChange('loanType', e.target.value)}
            className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            {LOAN_TYPES.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">
            Status
          </label>
          <select
            value={form.status}
            onChange={(e) => handleChange('status', e.target.value)}
            className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            {STATUSES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">
            Payments Current?
          </label>
          <select
            value={form.paymentsCurrent}
            onChange={(e) => handleChange('paymentsCurrent', e.target.value)}
            className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="Yes">Yes</option>
            <option value="No">No</option>
          </select>
        </div>
      </div>

      {isNotCurrent && (
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">
              Months Behind
            </label>
            <input
              type="number"
              value={form.monthsBehind}
              onChange={(e) => handleChange('monthsBehind', parseFloat(e.target.value) || 0)}
              placeholder="0"
              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">
              Amount Behind
            </label>
            <input
              type="number"
              value={form.amountBehind}
              onChange={(e) => handleChange('amountBehind', parseFloat(e.target.value) || 0)}
              placeholder="0.00"
              step="0.01"
              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
        </div>
      )}

      <div>
        <label className="block text-xs font-medium text-gray-600 mb-1">
          Notes
        </label>
        <textarea
          value={form.notes}
          onChange={(e) => handleChange('notes', e.target.value)}
          placeholder="Any additional notes..."
          rows={2}
          className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
        />
      </div>

      <div className="flex gap-2 justify-end pt-2">
        <button
          onClick={onCancel}
          className="px-3 py-1.5 text-sm font-medium text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors flex items-center gap-1"
        >
          <X className="w-4 h-4" />
          Cancel
        </button>
        <button
          onClick={() => onSave(form)}
          disabled={!form.lienType || !form.lienHolder}
          className="px-3 py-1.5 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors disabled:bg-gray-400 flex items-center gap-1"
        >
          <Check className="w-4 h-4" />
          Save
        </button>
      </div>
    </div>
  )
}

// ── Lien Card ──────────────────────────────────────────────────────

function LienCard({
  lien,
  isSelected,
  onSelect,
  onEdit,
  onDelete,
}: {
  lien: DealLien
  isSelected: boolean
  onSelect: () => void
  onEdit: () => void
  onDelete: () => void
}) {
  const lienBadge = getLienTypeBadge(lien.lienType)
  const statusBadge = getStatusBadge(lien.status || 'Current')
  const isCurrent = (lien.status || '').toLowerCase() === 'current'

  return (
    <div className="border border-gray-200 rounded-lg p-4 bg-white hover:shadow-sm transition-shadow">
      <div className="flex items-start gap-3">
        {/* Checkbox */}
        <input
          type="checkbox"
          checked={isSelected}
          onChange={onSelect}
          className="mt-1 w-4 h-4 cursor-pointer"
        />

        {/* Content */}
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-2">
            <span
              className={`px-2 py-1 text-xs font-medium rounded ${lienBadge.bg} ${lienBadge.text}`}
            >
              {lien.lienType}
            </span>
            <span
              className={`px-2 py-1 text-xs font-medium rounded flex items-center gap-1 ${statusBadge.bg} ${statusBadge.text}`}
            >
              {isCurrent ? (
                <CheckCircle2 className="w-3 h-3" />
              ) : (
                <AlertCircle className="w-3 h-3" />
              )}
              {lien.status || 'Current'}
            </span>
          </div>

          <p className="text-sm font-semibold text-gray-900 mb-2">
            {lien.lienHolder}
          </p>

          <div className="grid grid-cols-2 gap-2 text-xs mb-2">
            <div>
              <span className="text-gray-600">Balance:</span>
              <p className="text-gray-900 font-semibold">
                {formatCurrency(lien.balance)}
              </p>
            </div>
            <div>
              <span className="text-gray-600">Monthly Payment:</span>
              <p className="text-gray-900 font-semibold">
                {formatCurrency(lien.monthlyPayment)}
              </p>
            </div>
          </div>

          {lien.interestRate !== undefined && lien.interestRate > 0 && (
            <div className="text-xs text-gray-600 mb-2">
              Interest Rate: {lien.interestRate.toFixed(2)}%
            </div>
          )}

          {!isCurrent && (lien.monthsBehind || lien.amountBehind) && (
            <div className="text-xs text-red-600 font-medium mb-2">
              {lien.monthsBehind} months behind ({formatCurrency(lien.amountBehind)} owed)
            </div>
          )}

          {lien.notes && (
            <p className="text-xs text-gray-600 italic">
              {lien.notes}
            </p>
          )}
        </div>

        {/* Actions */}
        <div className="flex gap-1 flex-shrink-0">
          <button
            onClick={onEdit}
            className="p-2 text-gray-600 hover:text-blue-600 hover:bg-blue-50 rounded transition-colors"
            title="Edit"
          >
            <Edit2 className="w-4 h-4" />
          </button>
          <button
            onClick={onDelete}
            className="p-2 text-gray-600 hover:text-red-600 hover:bg-red-50 rounded transition-colors"
            title="Delete"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Negotiation Modal ──────────────────────────────────────────────

/** Map a DealLien's lienType to the service category for negotiations. */
function lienTypeToService(lienType: string): string {
  const lower = lienType.toLowerCase()
  if (lower.includes('mortgage')) return 'Bank/Mortgage'
  if (lower.includes('county') || lower.includes('tax')) return 'County Tax'
  return 'Other Lien'
}

function NegotiationModal({
  selectedLiens,
  onSubmit,
  onCancel,
}: {
  selectedLiens: DealLien[]
  onSubmit: (serviceTypes: string[], message: string) => void
  onCancel: () => void
}) {
  const [message, setMessage] = useState('')

  // Auto-derive unique service types from the selected liens
  const serviceTypes = useMemo(() => {
    const types = new Set(selectedLiens.map((l) => lienTypeToService(l.lienType)))
    return Array.from(types)
  }, [selectedLiens])

  return (
    <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-lg p-6 w-full max-w-md">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">
          Send to Negotiations
        </h3>

        <div className="space-y-3 mb-4">
          {/* Summary of what's being sent */}
          <div>
            <p className="text-sm font-medium text-gray-700 mb-2">
              Selected Liens ({selectedLiens.length})
            </p>
            <div className="space-y-1.5">
              {selectedLiens.map((lien) => (
                <div
                  key={lien.id}
                  className="flex items-center justify-between text-sm bg-gray-50 px-3 py-2 rounded-lg"
                >
                  <div>
                    <span className="font-medium text-gray-900">
                      {lien.lienHolder}
                    </span>
                    <span className="text-gray-500 ml-2">
                      {lien.lienType}
                    </span>
                  </div>
                  {lien.balance != null && (
                    <span className="text-gray-600 font-medium">
                      ${lien.balance.toLocaleString()}
                    </span>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Auto-derived service types (read-only) */}
          <div>
            <p className="text-xs font-medium text-gray-500 mb-1">Service Types</p>
            <div className="flex flex-wrap gap-1.5">
              {serviceTypes.map((type) => (
                <span
                  key={type}
                  className="px-2 py-0.5 text-xs font-medium rounded-full bg-blue-100 text-blue-700"
                >
                  {type}
                </span>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Message (optional)
            </label>
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Add any notes for the negotiator..."
              rows={3}
              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
            />
          </div>
        </div>

        <div className="flex gap-2 justify-end">
          <button
            onClick={onCancel}
            className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={() => onSubmit(serviceTypes, message)}
            className="px-4 py-2 text-sm font-medium text-white bg-green-600 rounded-lg hover:bg-green-700 transition-colors flex items-center gap-2"
          >
            <Send className="w-4 h-4" />
            Submit
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Delete Confirmation ─────────────────────────────────────────────

function DeleteConfirm({
  lienHolder,
  onConfirm,
  onCancel,
}: {
  lienHolder: string
  onConfirm: () => void
  onCancel: () => void
}) {
  return (
    <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-lg p-5 w-full max-w-sm">
        <p className="text-sm text-gray-700 mb-4">
          Delete lien from <strong>{lienHolder}</strong>? This cannot be undone.
        </p>
        <div className="flex gap-2 justify-end">
          <button
            onClick={onCancel}
            className="px-4 py-1.5 text-sm font-medium text-gray-700 bg-gray-100 rounded hover:bg-gray-200 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            className="px-4 py-1.5 text-sm font-medium text-white bg-red-600 rounded hover:bg-red-700 transition-colors"
          >
            Delete
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Main Component ──────────────────────────────────────────────────

export default function DealLienManager({
  dealId,
  initialLiens = [],
}: DealLienManagerProps) {
  const [liens, setLiens] = useState<DealLien[]>(initialLiens)
  const [loading, setLoading] = useState(!initialLiens.length)
  const [showAddForm, setShowAddForm] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [selectedLienIds, setSelectedLienIds] = useState<Set<string>>(
    new Set()
  )
  const [showNegotiationModal, setShowNegotiationModal] = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)

  // Load liens on mount
  useEffect(() => {
    if (!initialLiens.length) {
      loadLiens()
    }
  }, [dealId, initialLiens])

  const loadLiens = async () => {
    try {
      setLoading(true)
      const data = await listLiens(dealId)
      setLiens(data)
    } catch (err: any) {
      toast.error(err.message || 'Failed to load liens')
    } finally {
      setLoading(false)
    }
  }

  const handleAddLien = useCallback(
    async (formData: LienFormData) => {
      try {
        const newLien = await createLien(dealId, {
          ...formData,
          sortOrder: liens.length,
        })
        setLiens((prev) => [...prev, newLien])
        setShowAddForm(false)
        toast.success('Lien added')
      } catch (err: any) {
        toast.error(err.message || 'Failed to add lien')
      }
    },
    [dealId, liens.length]
  )

  const handleEditLien = useCallback(
    async (lienId: string, formData: LienFormData) => {
      try {
        const updated = await updateLien(dealId, lienId, formData)
        setLiens((prev) =>
          prev.map((l) => (l.id === lienId ? updated : l))
        )
        setEditingId(null)
        toast.success('Lien updated')
      } catch (err: any) {
        toast.error(err.message || 'Failed to update lien')
      }
    },
    [dealId]
  )

  const handleDeleteLien = useCallback(
    async (lienId: string) => {
      try {
        await deleteLien(dealId, lienId)
        setLiens((prev) => prev.filter((l) => l.id !== lienId))
        setDeletingId(null)
        toast.success('Lien deleted')
      } catch (err: any) {
        toast.error(err.message || 'Failed to delete lien')
      }
    },
    [dealId]
  )

  const handleSendToNegotiations = useCallback(
    async (serviceTypes: string[], message: string) => {
      try {
        await submitNegotiationRequest({
          dealId,
          lienIds: Array.from(selectedLienIds),
          serviceTypes,
          message: message || undefined,
        })
        setSelectedLienIds(new Set())
        setShowNegotiationModal(false)
        toast.success('Negotiation request submitted')
      } catch (err: any) {
        toast.error(err.message || 'Failed to submit negotiation request')
      }
    },
    [dealId, selectedLienIds]
  )

  const toggleSelection = useCallback((lienId: string) => {
    setSelectedLienIds((prev) => {
      const next = new Set(prev)
      if (next.has(lienId)) {
        next.delete(lienId)
      } else {
        next.add(lienId)
      }
      return next
    })
  }, [])

  const deleteConfirmingLien = liens.find((l) => l.id === deletingId)
  const editingLien = liens.find((l) => l.id === editingId)

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Banknote className="w-5 h-5 text-gray-700" />
          <h2 className="text-base font-semibold text-gray-900">
            Liens & Encumbrances
          </h2>
        </div>
        <button
          onClick={() => setShowAddForm(true)}
          className="px-3 py-1.5 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors flex items-center gap-1"
        >
          <Plus className="w-4 h-4" />
          Add Lien
        </button>
      </div>

      {/* Add Form */}
      {showAddForm && (
        <LienForm
          onSave={handleAddLien}
          onCancel={() => setShowAddForm(false)}
        />
      )}

      {/* Edit Form */}
      {editingLien && (
        <LienForm
          initialData={editingLien}
          onSave={(data) => handleEditLien(editingLien.id, data)}
          onCancel={() => setEditingId(null)}
        />
      )}

      {/* Liens List */}
      {loading ? (
        <div className="text-center py-8 text-gray-500">
          Loading liens...
        </div>
      ) : liens.length === 0 ? (
        <div className="text-center py-8 text-gray-500">
          No liens added yet. Click "Add Lien" to get started.
        </div>
      ) : (
        <div className="space-y-3">
          {liens.map((lien) => (
            <LienCard
              key={lien.id}
              lien={lien}
              isSelected={selectedLienIds.has(lien.id)}
              onSelect={() => toggleSelection(lien.id)}
              onEdit={() => setEditingId(lien.id)}
              onDelete={() => setDeletingId(lien.id)}
            />
          ))}
        </div>
      )}

      {/* Send to Negotiations Button */}
      {selectedLienIds.size > 0 && (
        <div className="flex justify-end pt-2">
          <button
            onClick={() => setShowNegotiationModal(true)}
            className="px-4 py-2 text-sm font-medium text-white bg-green-600 rounded-lg hover:bg-green-700 transition-colors flex items-center gap-2"
          >
            <Send className="w-4 h-4" />
            Send to Negotiations ({selectedLienIds.size})
          </button>
        </div>
      )}

      {/* Modals */}
      {showNegotiationModal && (
        <NegotiationModal
          selectedLiens={liens.filter((l) => selectedLienIds.has(l.id))}
          onSubmit={handleSendToNegotiations}
          onCancel={() => setShowNegotiationModal(false)}
        />
      )}

      {deleteConfirmingLien && (
        <DeleteConfirm
          lienHolder={deleteConfirmingLien.lienHolder}
          onConfirm={() => handleDeleteLien(deleteConfirmingLien.id)}
          onCancel={() => setDeletingId(null)}
        />
      )}
    </div>
  )
}
