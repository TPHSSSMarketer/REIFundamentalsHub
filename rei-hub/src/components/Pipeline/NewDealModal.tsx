import { useState, useMemo } from 'react'
import { X, DollarSign } from 'lucide-react'
import { useCreateDeal } from '@/hooks/useApi'

interface NewDealModalProps {
  isOpen: boolean
  onClose: () => void
  stages: Array<{ id: string; name: string; order: number }>
  contacts: Array<{ id: string; name: string; phone: string }>
}

export default function NewDealModal({ isOpen, onClose, stages, contacts }: NewDealModalProps) {
  const createDeal = useCreateDeal()

  const [title, setTitle] = useState('')
  const [stageId, setStageId] = useState('')
  const [contactId, setContactId] = useState('')
  const [contactSearch, setContactSearch] = useState('')
  const [showContactDropdown, setShowContactDropdown] = useState(false)
  const [value, setValue] = useState('')
  const [notes, setNotes] = useState('')
  const [errors, setErrors] = useState<{ title?: string; stageId?: string }>({})

  const filteredContacts = useMemo(() => {
    if (!contactSearch.trim()) return contacts.slice(0, 10)
    const q = contactSearch.toLowerCase()
    return contacts.filter(
      (c) => c.name.toLowerCase().includes(q) || c.phone.includes(q)
    ).slice(0, 10)
  }, [contacts, contactSearch])

  const resetForm = () => {
    setTitle('')
    setStageId('')
    setContactId('')
    setContactSearch('')
    setShowContactDropdown(false)
    setValue('')
    setNotes('')
    setErrors({})
  }

  const handleClose = () => {
    resetForm()
    onClose()
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    const newErrors: { title?: string; stageId?: string } = {}
    if (!title.trim()) newErrors.title = 'Deal title is required'
    if (!stageId) newErrors.stageId = 'Stage is required'
    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors)
      return
    }
    setErrors({})

    try {
      await createDeal.mutateAsync({
        title: title.trim(),
        stageId,
        contactId: contactId || undefined,
        value: value ? parseFloat(value) : undefined,
      })
      resetForm()
      onClose()
    } catch {
      // Error handled by hook's onError toast
    }
  }

  const handleSelectContact = (contact: { id: string; name: string }) => {
    setContactId(contact.id)
    setContactSearch(contact.name)
    setShowContactDropdown(false)
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/30" onClick={handleClose} />

      {/* Modal */}
      <div className="relative bg-white rounded-xl shadow-xl w-full max-w-md mx-auto mt-20 border border-slate-200">
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-slate-200">
          <h2 className="text-lg font-semibold text-slate-800">Add New Deal</h2>
          <button
            onClick={handleClose}
            className="p-1.5 rounded-lg hover:bg-slate-100 transition-colors"
          >
            <X className="w-5 h-5 text-slate-500" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          {/* Deal Title */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              Deal Title <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. 123 Main St Property"
              className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 text-sm"
            />
            {errors.title && (
              <p className="text-xs text-red-500 mt-1">{errors.title}</p>
            )}
          </div>

          {/* Stage */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              Stage <span className="text-red-500">*</span>
            </label>
            <select
              value={stageId}
              onChange={(e) => setStageId(e.target.value)}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 text-sm"
            >
              <option value="">Select a stage...</option>
              {stages
                .sort((a, b) => a.order - b.order)
                .map((stage) => (
                  <option key={stage.id} value={stage.id}>
                    {stage.name}
                  </option>
                ))}
            </select>
            {errors.stageId && (
              <p className="text-xs text-red-500 mt-1">{errors.stageId}</p>
            )}
          </div>

          {/* Contact (searchable) */}
          <div className="relative">
            <label className="block text-sm font-medium text-slate-700 mb-1">
              Contact
            </label>
            <input
              type="text"
              value={contactSearch}
              onChange={(e) => {
                setContactSearch(e.target.value)
                setContactId('')
                setShowContactDropdown(true)
              }}
              onFocus={() => setShowContactDropdown(true)}
              placeholder="Search contacts..."
              className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 text-sm"
            />
            {showContactDropdown && filteredContacts.length > 0 && (
              <div className="absolute z-10 w-full mt-1 bg-white border border-slate-200 rounded-lg shadow-lg max-h-40 overflow-y-auto">
                {filteredContacts.map((contact) => (
                  <button
                    key={contact.id}
                    type="button"
                    onClick={() => handleSelectContact(contact)}
                    className="w-full text-left px-3 py-2 text-sm hover:bg-slate-50 transition-colors flex items-center justify-between"
                  >
                    <span className="font-medium text-slate-700">{contact.name}</span>
                    {contact.phone && (
                      <span className="text-xs text-slate-400">{contact.phone}</span>
                    )}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Value */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              Value ($)
            </label>
            <div className="relative">
              <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input
                type="number"
                value={value}
                onChange={(e) => setValue(e.target.value)}
                placeholder="0"
                min="0"
                step="any"
                className="w-full pl-9 pr-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 text-sm"
              />
            </div>
          </div>

          {/* Notes */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              Notes
            </label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
              placeholder="Any additional details..."
              className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 text-sm resize-none"
            />
          </div>

          {/* Actions */}
          <div className="flex items-center justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={handleClose}
              className="px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={createDeal.isPending}
              className="px-4 py-2 text-sm font-medium text-white bg-primary-500 rounded-lg hover:bg-primary-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {createDeal.isPending ? 'Creating...' : 'Create Deal'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
