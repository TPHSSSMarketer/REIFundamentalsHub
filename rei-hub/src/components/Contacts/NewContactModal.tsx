import { useState } from 'react'
import { X, UserPlus } from 'lucide-react'
import { useCreateContact } from '@/hooks/useApi'
import type { Contact } from '@/types'

interface NewContactModalProps {
  isOpen: boolean
  onClose: () => void
}

const ROLES: { value: Contact['role']; label: string }[] = [
  { value: 'seller', label: 'Seller' },
  { value: 'buyer', label: 'Buyer' },
  { value: 'agent', label: 'Agent' },
  { value: 'broker', label: 'Broker' },
  { value: 'lender', label: 'Lender' },
  { value: 'wholesaler', label: 'Wholesaler' },
  { value: 'contractor', label: 'Contractor' },
  { value: 'property_manager', label: 'Property Manager' },
  { value: 'attorney', label: 'Attorney' },
  { value: 'cpa', label: 'CPA' },
  { value: 'partner', label: 'Partner' },
]

const SOURCES = [
  'Direct Mail',
  'Cold Call',
  'Driving for Dollars',
  'Referral',
  'Zillow',
  'MLS',
  'Facebook Ads',
  'Google Ads',
  'Bandit Signs',
  'Website',
  'Networking Event',
  'Other',
]

export default function NewContactModal({ isOpen, onClose }: NewContactModalProps) {
  const createContact = useCreateContact()

  const [form, setForm] = useState({
    firstName: '',
    lastName: '',
    role: 'seller' as Contact['role'],
    company: '',
    phone: '',
    email: '',
    source: '',
    notes: '',
    tags: '',
  })

  if (!isOpen) return null

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()

    if (!form.firstName.trim() && !form.lastName.trim()) return

    const name = `${form.firstName.trim()} ${form.lastName.trim()}`.trim()
    const tags = form.tags
      .split(',')
      .map((t) => t.trim())
      .filter(Boolean)

    createContact.mutate(
      {
        name,
        firstName: form.firstName.trim(),
        lastName: form.lastName.trim(),
        role: form.role,
        company: form.company.trim() || undefined,
        phone: form.phone.trim() || undefined,
        email: form.email.trim() || undefined,
        source: form.source || undefined,
        notes: form.notes.trim() || undefined,
        tags: tags.length > 0 ? tags : undefined,
        interactionCount: 0,
        dateAdded: new Date().toISOString(),
      },
      {
        onSuccess: () => {
          setForm({
            firstName: '',
            lastName: '',
            role: 'seller',
            company: '',
            phone: '',
            email: '',
            source: '',
            notes: '',
            tags: '',
          })
          onClose()
        },
      }
    )
  }

  const updateField = (field: string, value: string) => {
    setForm((prev) => ({ ...prev, [field]: value }))
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />

      {/* Modal */}
      <div className="relative bg-white rounded-xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-slate-200">
          <div className="flex items-center gap-2">
            <UserPlus className="w-5 h-5 text-primary-600" />
            <h2 className="text-lg font-bold text-slate-800">Add New Contact</h2>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-slate-100 transition-colors"
          >
            <X className="w-5 h-5 text-slate-500" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          {/* Name row */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                First Name *
              </label>
              <input
                type="text"
                value={form.firstName}
                onChange={(e) => updateField('firstName', e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 text-sm"
                placeholder="John"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Last Name *
              </label>
              <input
                type="text"
                value={form.lastName}
                onChange={(e) => updateField('lastName', e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 text-sm"
                placeholder="Smith"
                required
              />
            </div>
          </div>

          {/* Role */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Role</label>
            <select
              value={form.role}
              onChange={(e) => updateField('role', e.target.value)}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 text-sm bg-white"
            >
              {ROLES.map((r) => (
                <option key={r.value} value={r.value}>
                  {r.label}
                </option>
              ))}
            </select>
          </div>

          {/* Phone & Email */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Phone</label>
              <input
                type="tel"
                value={form.phone}
                onChange={(e) => updateField('phone', e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 text-sm"
                placeholder="(555) 123-4567"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Email</label>
              <input
                type="email"
                value={form.email}
                onChange={(e) => updateField('email', e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 text-sm"
                placeholder="john@example.com"
              />
            </div>
          </div>

          {/* Company */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Company</label>
            <input
              type="text"
              value={form.company}
              onChange={(e) => updateField('company', e.target.value)}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 text-sm"
              placeholder="ABC Realty"
            />
          </div>

          {/* Source */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Lead Source</label>
            <select
              value={form.source}
              onChange={(e) => updateField('source', e.target.value)}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 text-sm bg-white"
            >
              <option value="">Select source...</option>
              {SOURCES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </div>

          {/* Tags */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              Tags <span className="text-slate-400 font-normal">(comma-separated)</span>
            </label>
            <input
              type="text"
              value={form.tags}
              onChange={(e) => updateField('tags', e.target.value)}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 text-sm"
              placeholder="motivated, pre-foreclosure, absentee"
            />
          </div>

          {/* Notes */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Notes</label>
            <textarea
              value={form.notes}
              onChange={(e) => updateField('notes', e.target.value)}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 text-sm resize-none"
              rows={3}
              placeholder="Any notes about this contact..."
            />
          </div>

          {/* Actions */}
          <div className="flex items-center justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm font-medium text-slate-600 hover:text-slate-800 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={createContact.isPending}
              className="px-5 py-2 text-sm font-medium text-white bg-primary-600 rounded-lg hover:bg-primary-700 transition-colors disabled:opacity-50"
            >
              {createContact.isPending ? 'Adding...' : 'Add Contact'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
