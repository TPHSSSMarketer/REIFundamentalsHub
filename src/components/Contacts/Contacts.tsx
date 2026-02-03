import { useState } from 'react'
import { Search, Phone, Mail, MessageSquare, MoreHorizontal, Loader2 } from 'lucide-react'
import ContactDetailModal from './ContactDetailModal'
import { useContacts } from '@/hooks/useGHL'
import { useStore } from '@/hooks/useStore'
import { formatPhone, formatRelativeTime, getInitials, debounce, cn } from '@/utils/helpers'
import type { Contact } from '@/types'

export default function Contacts() {
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedContact, setSelectedContact] = useState<Contact | null>(null)
  const { setSMSModalOpen, setSMSTargetContact } = useStore()

  const { data, isLoading } = useContacts({
    limit: 100,
    query: searchQuery || undefined,
  })

  const handleSearch = debounce((value: string) => {
    setSearchQuery(value)
  }, 300)

  const handleSendSMS = (contact: Contact, e: React.MouseEvent) => {
    e.stopPropagation()
    setSMSTargetContact(contact)
    setSMSModalOpen(true)
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-slate-800">Contacts</h1>
        <p className="text-slate-600">Manage your contacts and leads</p>
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
        <input
          type="text"
          placeholder="Search by name, phone, or email..."
          onChange={(e) => handleSearch(e.target.value)}
          className="w-full pl-10 pr-4 py-2.5 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
        />
      </div>

      {/* Contact Stats */}
      <div className="flex items-center gap-4 p-4 bg-white rounded-lg border border-slate-200">
        <div>
          <p className="text-sm text-slate-500">Total Contacts</p>
          <p className="text-xl font-bold text-slate-800">{data?.total || 0}</p>
        </div>
      </div>

      {/* Contact List */}
      <div className="bg-white rounded-lg border border-slate-200 overflow-hidden">
        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-6 h-6 animate-spin text-primary-500" />
          </div>
        ) : data?.contacts.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-slate-600">No contacts found</p>
            {searchQuery && (
              <p className="text-sm text-slate-500 mt-1">
                Try a different search term
              </p>
            )}
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {data?.contacts.map((contact) => (
              <div
                key={contact.id}
                onClick={() => setSelectedContact(contact)}
                className="flex items-center justify-between p-4 hover:bg-slate-50 transition-colors cursor-pointer"
              >
                <div className="flex items-center gap-3">
                  {/* Avatar */}
                  <div className="w-10 h-10 rounded-full bg-primary-100 flex items-center justify-center">
                    <span className="text-sm font-medium text-primary-600">
                      {getInitials(contact.name)}
                    </span>
                  </div>

                  {/* Info */}
                  <div>
                    <p className="font-medium text-slate-800">{contact.name}</p>
                    <div className="flex items-center gap-3 text-sm text-slate-500">
                      {contact.phone && <span>{formatPhone(contact.phone)}</span>}
                      {contact.email && <span>{contact.email}</span>}
                    </div>
                  </div>
                </div>

                {/* Actions */}
                <div className="flex items-center gap-2">
                  {/* Tags */}
                  {contact.tags?.length > 0 && (
                    <div className="hidden md:flex items-center gap-1">
                      {contact.tags.slice(0, 2).map((tag) => (
                        <span
                          key={tag}
                          className="px-2 py-0.5 text-xs bg-slate-100 text-slate-600 rounded"
                        >
                          {tag}
                        </span>
                      ))}
                      {contact.tags.length > 2 && (
                        <span className="text-xs text-slate-400">
                          +{contact.tags.length - 2}
                        </span>
                      )}
                    </div>
                  )}

                  {/* Quick Actions */}
                  <div className="flex items-center gap-1">
                    {contact.phone && (
                      <a
                        href={`tel:${contact.phone}`}
                        onClick={(e) => e.stopPropagation()}
                        className="p-2 rounded-lg hover:bg-slate-100 transition-colors"
                      >
                        <Phone className="w-4 h-4 text-slate-500" />
                      </a>
                    )}
                    {contact.phone && (
                      <button
                        onClick={(e) => handleSendSMS(contact, e)}
                        className="p-2 rounded-lg hover:bg-slate-100 transition-colors"
                      >
                        <MessageSquare className="w-4 h-4 text-slate-500" />
                      </button>
                    )}
                    {contact.email && (
                      <a
                        href={`mailto:${contact.email}`}
                        onClick={(e) => e.stopPropagation()}
                        className="p-2 rounded-lg hover:bg-slate-100 transition-colors"
                      >
                        <Mail className="w-4 h-4 text-slate-500" />
                      </a>
                    )}
                  </div>

                  {/* Last Activity */}
                  {contact.lastActivity && (
                    <span className="hidden lg:block text-xs text-slate-400 min-w-[80px] text-right">
                      {formatRelativeTime(contact.lastActivity)}
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Contact Detail Modal */}
      <ContactDetailModal
        contact={selectedContact}
        onClose={() => setSelectedContact(null)}
      />
    </div>
  )
}
