import { useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { Search, Phone, Mail, MessageSquare, Loader2, Star, Eye, UserPlus, ChevronDown, ArrowUpDown, Users, Filter, X } from 'lucide-react'
import ContactDetailModal from './ContactDetailModal'
import NewContactModal from './NewContactModal'
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

type SortOption = 'name_asc' | 'name_desc' | 'date_newest' | 'date_oldest' | 'rating' | 'activity'

const SORT_OPTIONS: { value: SortOption; label: string }[] = [
  { value: 'name_asc', label: 'Name (A-Z)' },
  { value: 'name_desc', label: 'Name (Z-A)' },
  { value: 'date_newest', label: 'Newest First' },
  { value: 'date_oldest', label: 'Oldest First' },
  { value: 'rating', label: 'Highest Rated' },
  { value: 'activity', label: 'Recent Activity' },
]

const ITEMS_PER_PAGE = 25

export default function Contacts() {
  const navigate = useNavigate()
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedContact, setSelectedContact] = useState<Contact | null>(null)
  const [showNewContactModal, setShowNewContactModal] = useState(false)
  const [roleFilter, setRoleFilter] = useState<string>('all')
  const [sortBy, setSortBy] = useState<SortOption>('date_newest')
  const [showSortMenu, setShowSortMenu] = useState(false)
  const [currentPage, setCurrentPage] = useState(1)
  const { setSMSModalOpen, setSMSTargetContact } = useStore()

  const { data: contacts, isLoading } = useContacts()

  // Compute role counts for filter badges
  const roleCounts = useMemo(() => {
    if (!contacts) return {} as Record<string, number>
    const counts: Record<string, number> = {}
    contacts.forEach((c) => {
      counts[c.role] = (counts[c.role] || 0) + 1
    })
    return counts
  }, [contacts])

  // Get roles that actually have contacts, sorted by count descending
  const activeRoles = useMemo(() => {
    return Object.entries(roleCounts)
      .sort((a, b) => b[1] - a[1])
      .map(([role]) => role)
  }, [roleCounts])

  // Filter + search + sort
  const filteredContacts = useMemo(() => {
    if (!contacts) return []

    let result = [...contacts]

    // Role filter
    if (roleFilter !== 'all') {
      result = result.filter((c) => c.role === roleFilter)
    }

    // Search
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase()
      result = result.filter(
        (c) =>
          c.name.toLowerCase().includes(q) ||
          (c.email && c.email.toLowerCase().includes(q)) ||
          (c.phone && c.phone.includes(q)) ||
          (c.company && c.company.toLowerCase().includes(q)) ||
          (c.tags && c.tags.some((t) => t.toLowerCase().includes(q))) ||
          (c.source && c.source.toLowerCase().includes(q))
      )
    }

    // Sort
    result.sort((a, b) => {
      switch (sortBy) {
        case 'name_asc':
          return a.name.localeCompare(b.name)
        case 'name_desc':
          return b.name.localeCompare(a.name)
        case 'date_newest':
          return new Date(b.dateAdded).getTime() - new Date(a.dateAdded).getTime()
        case 'date_oldest':
          return new Date(a.dateAdded).getTime() - new Date(b.dateAdded).getTime()
        case 'rating':
          return (b.rating || 0) - (a.rating || 0)
        case 'activity':
          if (!a.lastActivity && !b.lastActivity) return 0
          if (!a.lastActivity) return 1
          if (!b.lastActivity) return -1
          return new Date(b.lastActivity).getTime() - new Date(a.lastActivity).getTime()
        default:
          return 0
      }
    })

    return result
  }, [contacts, searchQuery, roleFilter, sortBy])

  // Pagination
  const totalPages = Math.max(1, Math.ceil(filteredContacts.length / ITEMS_PER_PAGE))
  const paginatedContacts = filteredContacts.slice(
    (currentPage - 1) * ITEMS_PER_PAGE,
    currentPage * ITEMS_PER_PAGE
  )

  // Reset page when filters change
  useMemo(() => {
    setCurrentPage(1)
  }, [searchQuery, roleFilter, sortBy])

  const handleSendSMS = (contact: Contact, e: React.MouseEvent) => {
    e.stopPropagation()
    setSMSTargetContact(contact)
    setSMSModalOpen(true)
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-xl md:text-2xl font-bold text-slate-800">Contacts</h1>
          <p className="text-sm md:text-base text-slate-600">Manage your contacts and leads</p>
        </div>
        <button
          onClick={() => setShowNewContactModal(true)}
          className="inline-flex items-center gap-2 px-4 py-2.5 text-sm font-medium text-white bg-primary-600 rounded-lg hover:bg-primary-700 transition-colors shadow-sm"
        >
          <UserPlus className="w-4 h-4" />
          Add Contact
        </button>
      </div>

      {/* Stats Bar */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="bg-white rounded-lg border border-slate-200 p-3">
          <p className="text-xs text-slate-500 uppercase tracking-wide">Total</p>
          <p className="text-xl font-bold text-slate-800">{contacts?.length || 0}</p>
        </div>
        <div className="bg-white rounded-lg border border-slate-200 p-3">
          <p className="text-xs text-slate-500 uppercase tracking-wide">Sellers</p>
          <p className="text-xl font-bold text-red-600">{roleCounts['seller'] || 0}</p>
        </div>
        <div className="bg-white rounded-lg border border-slate-200 p-3">
          <p className="text-xs text-slate-500 uppercase tracking-wide">Buyers</p>
          <p className="text-xl font-bold text-emerald-600">{roleCounts['buyer'] || 0}</p>
        </div>
        <div className="bg-white rounded-lg border border-slate-200 p-3">
          <p className="text-xs text-slate-500 uppercase tracking-wide">Agents</p>
          <p className="text-xl font-bold text-blue-600">{roleCounts['agent'] || 0}</p>
        </div>
      </div>

      {/* Search + Sort Row */}
      <div className="flex flex-col sm:flex-row gap-3">
        {/* Search */}
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
          <input
            type="text"
            placeholder="Search by name, email, phone, company, tag, or source..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 min-h-[44px] text-sm"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 p-0.5 rounded hover:bg-slate-100"
            >
              <X className="w-4 h-4 text-slate-400" />
            </button>
          )}
        </div>

        {/* Sort Dropdown */}
        <div className="relative">
          <button
            onClick={() => setShowSortMenu(!showSortMenu)}
            className="flex items-center gap-2 px-4 py-2.5 border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors min-h-[44px] text-sm text-slate-700 bg-white whitespace-nowrap"
          >
            <ArrowUpDown className="w-4 h-4 text-slate-400" />
            {SORT_OPTIONS.find((o) => o.value === sortBy)?.label}
            <ChevronDown className="w-4 h-4 text-slate-400" />
          </button>
          {showSortMenu && (
            <>
              <div className="fixed inset-0 z-10" onClick={() => setShowSortMenu(false)} />
              <div className="absolute right-0 top-full mt-1 bg-white border border-slate-200 rounded-lg shadow-lg z-20 py-1 min-w-[180px]">
                {SORT_OPTIONS.map((option) => (
                  <button
                    key={option.value}
                    onClick={() => {
                      setSortBy(option.value)
                      setShowSortMenu(false)
                    }}
                    className={cn(
                      'w-full text-left px-4 py-2 text-sm transition-colors',
                      sortBy === option.value
                        ? 'bg-primary-50 text-primary-700 font-medium'
                        : 'text-slate-700 hover:bg-slate-50'
                    )}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
      </div>

      {/* Role Filter Pills */}
      {activeRoles.length > 0 && (
        <div className="flex items-center gap-2 overflow-x-auto pb-1 -mx-1 px-1">
          <Filter className="w-4 h-4 text-slate-400 shrink-0" />
          <button
            onClick={() => setRoleFilter('all')}
            className={cn(
              'px-3 py-1.5 text-xs font-medium rounded-full whitespace-nowrap transition-colors',
              roleFilter === 'all'
                ? 'bg-slate-800 text-white'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            )}
          >
            All ({contacts?.length || 0})
          </button>
          {activeRoles.map((role) => (
            <button
              key={role}
              onClick={() => setRoleFilter(roleFilter === role ? 'all' : role)}
              className={cn(
                'px-3 py-1.5 text-xs font-medium rounded-full whitespace-nowrap transition-colors',
                roleFilter === role
                  ? 'bg-slate-800 text-white'
                  : `${ROLE_COLORS[role] || 'bg-slate-100 text-slate-600'} hover:opacity-80`
              )}
            >
              {ROLE_LABELS[role] || role} ({roleCounts[role]})
            </button>
          ))}
        </div>
      )}

      {/* Contact List */}
      <div className="bg-white rounded-lg border border-slate-200 overflow-hidden">
        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-6 h-6 animate-spin text-primary-500" />
          </div>
        ) : filteredContacts.length === 0 ? (
          <div className="text-center py-12">
            <Users className="w-10 h-10 text-slate-300 mx-auto mb-3" />
            <p className="text-slate-600 font-medium">
              {searchQuery || roleFilter !== 'all' ? 'No contacts match your filters' : 'No contacts yet'}
            </p>
            <p className="text-sm text-slate-500 mt-1">
              {searchQuery || roleFilter !== 'all' ? (
                <button
                  onClick={() => {
                    setSearchQuery('')
                    setRoleFilter('all')
                  }}
                  className="text-primary-600 hover:underline"
                >
                  Clear filters
                </button>
              ) : (
                <button
                  onClick={() => setShowNewContactModal(true)}
                  className="text-primary-600 hover:underline"
                >
                  Add your first contact
                </button>
              )}
            </p>
          </div>
        ) : (
          <>
            {/* Results count */}
            <div className="px-4 py-2 bg-slate-50 border-b border-slate-100 flex items-center justify-between">
              <p className="text-xs text-slate-500">
                Showing {(currentPage - 1) * ITEMS_PER_PAGE + 1}–{Math.min(currentPage * ITEMS_PER_PAGE, filteredContacts.length)} of {filteredContacts.length} contacts
              </p>
            </div>

            <div className="divide-y divide-slate-100">
              {paginatedContacts.map((contact) => (
                <div
                  key={contact.id}
                  onClick={() => navigate(`/contacts/${contact.id}`)}
                  className="flex flex-col sm:flex-row sm:items-center justify-between p-3 md:p-4 hover:bg-slate-50 transition-colors cursor-pointer gap-2 sm:gap-0"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    {/* Avatar */}
                    <div className="w-10 h-10 rounded-full bg-primary-100 flex items-center justify-center shrink-0">
                      <span className="text-sm font-medium text-primary-600">
                        {getInitials(contact.name)}
                      </span>
                    </div>

                    {/* Info */}
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="font-medium text-slate-800 truncate">{contact.name}</p>
                        <span className={`px-1.5 py-0.5 text-xs font-medium rounded shrink-0 ${ROLE_COLORS[contact.role] || 'bg-slate-100 text-slate-700'}`}>
                          {ROLE_LABELS[contact.role] || contact.role}
                        </span>
                        {contact.source && (
                          <span className="hidden lg:inline px-1.5 py-0.5 text-xs bg-slate-50 text-slate-500 rounded border border-slate-200">
                            {contact.source}
                          </span>
                        )}
                      </div>
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-sm text-slate-500">
                        {contact.company && <span className="truncate">{contact.company}</span>}
                        {contact.phone && <span className="truncate">{formatPhone(contact.phone)}</span>}
                        {contact.email && <span className="hidden sm:inline truncate">{contact.email}</span>}
                      </div>
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-2 ml-13 sm:ml-0 shrink-0">
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
                      <button
                        onClick={(e) => { e.stopPropagation(); navigate(`/contacts/${contact.id}`) }}
                        className="p-2 rounded-lg hover:bg-slate-100 transition-colors min-w-[40px] min-h-[40px] flex items-center justify-center"
                        title="View contact"
                      >
                        <Eye className="w-4 h-4 text-slate-500" />
                      </button>
                      {contact.phone && (
                        <a
                          href={`tel:${contact.phone}`}
                          onClick={(e) => e.stopPropagation()}
                          className="p-2 rounded-lg hover:bg-slate-100 transition-colors min-w-[40px] min-h-[40px] flex items-center justify-center"
                        >
                          <Phone className="w-4 h-4 text-slate-500" />
                        </a>
                      )}
                      {contact.phone && (
                        <button
                          onClick={(e) => handleSendSMS(contact, e)}
                          className="p-2 rounded-lg hover:bg-slate-100 transition-colors min-w-[40px] min-h-[40px] flex items-center justify-center"
                        >
                          <MessageSquare className="w-4 h-4 text-slate-500" />
                        </button>
                      )}
                      {contact.email && (
                        <a
                          href={`mailto:${contact.email}`}
                          onClick={(e) => e.stopPropagation()}
                          className="p-2 rounded-lg hover:bg-slate-100 transition-colors min-w-[40px] min-h-[40px] flex items-center justify-center"
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

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="flex items-center justify-between px-4 py-3 border-t border-slate-100 bg-slate-50">
                <button
                  onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                  disabled={currentPage === 1}
                  className="px-3 py-1.5 text-sm font-medium text-slate-600 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                >
                  Previous
                </button>
                <div className="flex items-center gap-1">
                  {Array.from({ length: Math.min(totalPages, 5) }).map((_, i) => {
                    let pageNum: number
                    if (totalPages <= 5) {
                      pageNum = i + 1
                    } else if (currentPage <= 3) {
                      pageNum = i + 1
                    } else if (currentPage >= totalPages - 2) {
                      pageNum = totalPages - 4 + i
                    } else {
                      pageNum = currentPage - 2 + i
                    }
                    return (
                      <button
                        key={pageNum}
                        onClick={() => setCurrentPage(pageNum)}
                        className={cn(
                          'w-8 h-8 text-sm rounded-lg transition-colors',
                          currentPage === pageNum
                            ? 'bg-primary-600 text-white font-medium'
                            : 'text-slate-600 hover:bg-slate-100'
                        )}
                      >
                        {pageNum}
                      </button>
                    )
                  })}
                </div>
                <button
                  onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                  disabled={currentPage === totalPages}
                  className="px-3 py-1.5 text-sm font-medium text-slate-600 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                >
                  Next
                </button>
              </div>
            )}
          </>
        )}
      </div>

      {/* Contact Detail Modal */}
      <ContactDetailModal
        contact={selectedContact}
        onClose={() => setSelectedContact(null)}
      />

      {/* New Contact Modal */}
      <NewContactModal
        isOpen={showNewContactModal}
        onClose={() => setShowNewContactModal(false)}
      />
    </div>
  )
}
