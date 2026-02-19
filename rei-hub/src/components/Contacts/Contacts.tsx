import { useState, useMemo } from 'react'
import { Search, Phone, Mail, MessageSquare, Loader2, Star } from 'lucide-react'
import ContactDetailModal from './ContactDetailModal'
import { useContacts } from '@/hooks/useApi'
import { useStore } from '@/hooks/useStore'
import { formatPhone, formatRelativeTime, getInitials, cn } from '@/utils/helpers'
import type { Contact } from '@/types'

const ROLE_LABELS: Record<string, string> = {
  agent: 'Agent',
  broker: 'Broker',
  lender: 'Lender',
  contractor: 'Contractor',
  wholesaler: 'Wholesaler',
  property_manager: 'PM',
  attorney: 'Attorney',
  cpa: 'CPA',
  seller: 'Seller',
  buyer: 'Buyer',
  partner: 'Partner',
}

const ROLE_COLORS: Record<string, string> = {
  agent: 'bg-blue-100 text-blue-700',
  broker: 'bg-purple-100 text-purple-700',
  lender: 'bg-green-100 text-green-700',
  contractor: 'bg-orange-100 text-orange-700',
  wholesaler: 'bg-yellow-100 text-yellow-700',
  property_manager: 'bg-teal-100 text-teal-700',
  attorney: 'bg-indigo-100 text-indigo-700',
  cpa: 'bg-pink-100 text-pink-700',
  seller: 'bg-red-100 text-red-700',
  buyer: 'bg-emerald-100 text-emerald-700',
  partner: 'bg-slate-100 text-slate-700',
}

export default function Contacts() {
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedContact, setSelectedContact] = useState<Contact | null>(null)
  const { setSMSModalOpen, setSMSTargetContact } = useStore()

  const { data: contacts, isLoading } = useContacts()

  const filteredContacts = useMemo(() => {
    if (!contacts) return []
    if (!searchQuery.trim()) return contacts
    const q = searchQuery.toLowerCase()
    return contacts.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        (c.email && c.email.toLowerCase().includes(q)) ||
        (c.phone && c.phone.includes(q)) ||
        (c.company && c.company.toLowerCase().includes(q))
    )
  }, [contacts, searchQuery])

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
          placeholder="Search by name, phone, email, or company..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="w-full pl-10 pr-4 py-2.5 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
        />
      </div>

      {/* Contact Stats */}
      <div className="flex items-center gap-4 p-4 bg-white rounded-lg border border-slate-200">
        <div>
          <p className="text-sm text-slate-500">Total Contacts</p>
          <p className="text-xl font-bold text-slate-800">{contacts?.length || 0}</p>
        </div>
      </div>

      {/* Contact List */}
      <div className="bg-white rounded-lg border border-slate-200 overflow-hidden">
        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-6 h-6 animate-spin text-primary-500" />
          </div>
        ) : filteredContacts.length === 0 ? (
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
            {filteredContacts.map((contact) => (
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
                    <div className="flex items-center gap-2">
                      <p className="font-medium text-slate-800">{contact.name}</p>
                      <span className={`px-1.5 py-0.5 text-xs font-medium rounded ${ROLE_COLORS[contact.role] || 'bg-slate-100 text-slate-700'}`}>
                        {ROLE_LABELS[contact.role] || contact.role}
                      </span>
                    </div>
                    <div className="flex items-center gap-3 text-sm text-slate-500">
                      {contact.company && <span>{contact.company}</span>}
                      {contact.phone && <span>{formatPhone(contact.phone)}</span>}
                      {contact.email && <span>{contact.email}</span>}
                    </div>
                  </div>
                </div>

                {/* Actions */}
                <div className="flex items-center gap-2">
                  {/* Rating */}
                  {contact.rating != null && contact.rating > 0 && (
                    <div className="hidden md:flex items-center gap-0.5">
                      {Array.from({ length: 5 }).map((_, i) => (
                        <Star
                          key={i}
                          className={cn(
                            'w-3 h-3',
                            i < (contact.rating || 0)
                              ? 'fill-yellow-400 text-yellow-400'
                              : 'text-slate-200'
                          )}
                        />
                      ))}
                    </div>
                  )}

                  {/* Tags */}
                  {contact.tags && contact.tags.length > 0 && (
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
