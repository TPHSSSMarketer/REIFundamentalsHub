import { Phone, Mail, MessageSquare, Tag, Calendar, Trash2 } from 'lucide-react'
import Modal from '../Common/Modal'
import { formatPhone, formatDate, getInitials } from '@/utils/helpers'
import { useDeleteContact } from '@/hooks/useApi'
import { useStore } from '@/hooks/useStore'
import type { Contact } from '@/types'

interface ContactDetailModalProps {
  contact: Contact | null
  onClose: () => void
}

export default function ContactDetailModal({
  contact,
  onClose,
}: ContactDetailModalProps) {
  const deleteContact = useDeleteContact()
  const { setSMSModalOpen, setSMSTargetContact } = useStore()

  if (!contact) return null

  const handleDelete = async () => {
    if (!confirm('Are you sure you want to delete this contact?')) return
    await deleteContact.mutateAsync(contact.id)
    onClose()
  }

  const handleSendSMS = () => {
    setSMSTargetContact(contact)
    setSMSModalOpen(true)
    onClose()
  }

  return (
    <Modal isOpen={!!contact} onClose={onClose} title="Contact Details" size="md">
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center gap-4">
          <div className="w-16 h-16 rounded-full bg-primary-100 flex items-center justify-center">
            <span className="text-xl font-bold text-primary-600">
              {getInitials(contact.name)}
            </span>
          </div>
          <div>
            <h3 className="text-xl font-bold text-slate-800">{contact.name}</h3>
            {contact.source && (
              <p className="text-sm text-slate-500">Source: {contact.source}</p>
            )}
          </div>
        </div>

        {/* Contact Info */}
        <div className="space-y-3">
          {contact.phone && (
            <div className="flex items-center gap-3 p-3 bg-slate-50 rounded-lg">
              <Phone className="w-5 h-5 text-slate-400" />
              <div className="flex-1">
                <p className="text-sm text-slate-500">Phone</p>
                <p className="font-medium text-slate-800">
                  {formatPhone(contact.phone)}
                </p>
              </div>
              <a
                href={`tel:${contact.phone}`}
                className="px-3 py-1.5 text-sm bg-primary-500 text-white rounded-lg hover:bg-primary-600 transition-colors"
              >
                Call
              </a>
            </div>
          )}

          {contact.email && (
            <div className="flex items-center gap-3 p-3 bg-slate-50 rounded-lg">
              <Mail className="w-5 h-5 text-slate-400" />
              <div className="flex-1">
                <p className="text-sm text-slate-500">Email</p>
                <p className="font-medium text-slate-800">{contact.email}</p>
              </div>
              <a
                href={`mailto:${contact.email}`}
                className="px-3 py-1.5 text-sm bg-primary-500 text-white rounded-lg hover:bg-primary-600 transition-colors"
              >
                Email
              </a>
            </div>
          )}

          {contact.dateAdded && (
            <div className="flex items-center gap-3 p-3 bg-slate-50 rounded-lg">
              <Calendar className="w-5 h-5 text-slate-400" />
              <div>
                <p className="text-sm text-slate-500">Added</p>
                <p className="font-medium text-slate-800">
                  {formatDate(contact.dateAdded)}
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Tags */}
        {contact.tags?.length > 0 && (
          <div>
            <div className="flex items-center gap-2 mb-2">
              <Tag className="w-4 h-4 text-slate-400" />
              <span className="text-sm font-medium text-slate-600">Tags</span>
            </div>
            <div className="flex flex-wrap gap-2">
              {contact.tags.map((tag) => (
                <span
                  key={tag}
                  className="px-3 py-1 text-sm bg-primary-50 text-primary-700 rounded-full"
                >
                  {tag}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Actions */}
        <div className="flex flex-col gap-2 pt-4 border-t border-slate-200">
          {contact.phone && (
            <button
              onClick={handleSendSMS}
              className="flex items-center justify-center gap-2 px-4 py-2.5 bg-warning-500 text-white rounded-lg hover:bg-warning-600 transition-colors"
            >
              <MessageSquare className="w-4 h-4" />
              Send SMS
            </button>
          )}

          <button
            onClick={handleDelete}
            disabled={deleteContact.isPending}
            className="flex items-center justify-center gap-2 px-4 py-2 text-danger-600 hover:bg-danger-50 rounded-lg transition-colors"
          >
            <Trash2 className="w-4 h-4" />
            Delete Contact
          </button>
        </div>
      </div>
    </Modal>
  )
}
