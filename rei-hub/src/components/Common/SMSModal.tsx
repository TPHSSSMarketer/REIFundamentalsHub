import { useState } from 'react'
import { Loader2, Search } from 'lucide-react'
import Modal from './Modal'
import { useStore } from '@/hooks/useStore'
import { useContacts, useSendSMS } from '@/hooks/useApi'
import { formatPhone } from '@/utils/helpers'

export default function SMSModal() {
  const { isSMSModalOpen, setSMSModalOpen, smsTargetContact, setSMSTargetContact } = useStore()
  const sendSMS = useSendSMS()
  const { data: contactsData } = useContacts({ limit: 100 })

  const [selectedContactId, setSelectedContactId] = useState('')
  const [message, setMessage] = useState('')
  const [searchQuery, setSearchQuery] = useState('')

  const filteredContacts = contactsData?.contacts.filter(
    (c) =>
      c.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      c.phone.includes(searchQuery)
  )

  const selectedContact =
    smsTargetContact ||
    contactsData?.contacts.find((c) => c.id === selectedContactId)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    const contactId = smsTargetContact?.id || selectedContactId
    if (!contactId || !message.trim()) return

    await sendSMS.mutateAsync({ contactId, message })

    setMessage('')
    setSelectedContactId('')
    setSMSTargetContact(null)
    setSMSModalOpen(false)
  }

  const handleClose = () => {
    setMessage('')
    setSelectedContactId('')
    setSearchQuery('')
    setSMSTargetContact(null)
    setSMSModalOpen(false)
  }

  return (
    <Modal isOpen={isSMSModalOpen} onClose={handleClose} title="Send SMS">
      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Contact Selection */}
        {smsTargetContact ? (
          <div className="p-3 bg-slate-50 rounded-lg">
            <p className="text-sm text-slate-500">Sending to:</p>
            <p className="font-medium text-slate-800">{smsTargetContact.name}</p>
            <p className="text-sm text-slate-600">
              {formatPhone(smsTargetContact.phone)}
            </p>
          </div>
        ) : (
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              Select Contact *
            </label>
            <div className="relative mb-2">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-9 pr-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                placeholder="Search contacts..."
              />
            </div>
            <div className="max-h-40 overflow-y-auto border border-slate-200 rounded-lg">
              {filteredContacts?.length === 0 ? (
                <p className="p-3 text-sm text-slate-500 text-center">
                  No contacts found
                </p>
              ) : (
                filteredContacts?.map((contact) => (
                  <button
                    key={contact.id}
                    type="button"
                    onClick={() => setSelectedContactId(contact.id)}
                    className={`w-full px-3 py-2 text-left hover:bg-slate-50 transition-colors ${
                      selectedContactId === contact.id
                        ? 'bg-primary-50 border-l-2 border-primary-500'
                        : ''
                    }`}
                  >
                    <p className="font-medium text-slate-800">{contact.name}</p>
                    <p className="text-sm text-slate-500">
                      {formatPhone(contact.phone)}
                    </p>
                  </button>
                ))
              )}
            </div>
          </div>
        )}

        {/* Message */}
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">
            Message *
          </label>
          <textarea
            required
            rows={4}
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 resize-none"
            placeholder="Type your message..."
          />
          <p className="text-xs text-slate-500 mt-1">
            {message.length} / 160 characters
          </p>
        </div>

        {/* Quick Templates */}
        <div>
          <p className="text-sm font-medium text-slate-700 mb-2">Quick Templates:</p>
          <div className="flex flex-wrap gap-2">
            {[
              'Hi! Just following up on our conversation.',
              'Are you still interested in selling?',
              "I'd like to schedule a call. When works for you?",
            ].map((template, i) => (
              <button
                key={i}
                type="button"
                onClick={() => setMessage(template)}
                className="px-2 py-1 text-xs bg-slate-100 text-slate-600 rounded hover:bg-slate-200 transition-colors"
              >
                {template.slice(0, 30)}...
              </button>
            ))}
          </div>
        </div>

        <div className="flex gap-3 pt-4">
          <button
            type="button"
            onClick={handleClose}
            className="flex-1 px-4 py-2 border border-slate-300 rounded-lg text-slate-700 hover:bg-slate-50 transition-colors"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={
              sendSMS.isPending ||
              (!smsTargetContact && !selectedContactId) ||
              !message.trim()
            }
            className="flex-1 px-4 py-2 bg-warning-500 text-white rounded-lg hover:bg-warning-600 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {sendSMS.isPending ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Sending...
              </>
            ) : (
              'Send SMS'
            )}
          </button>
        </div>
      </form>
    </Modal>
  )
}
