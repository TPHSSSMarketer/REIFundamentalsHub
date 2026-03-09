import { useState, useEffect, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import {
  ArrowLeft,
  Phone,
  MessageSquare,
  FileText,
  Shield,
  Mail,
  Edit2,
  Check,
  X,
  Trash2,
  Play,
  ChevronDown,
  ChevronRight,
  Loader2,
  Plus,
  Calendar,
} from 'lucide-react'
import { getContact as fetchContact, getDeals as fetchDeals, updateContact as patchContact } from '@/services/crmApi'
import * as phoneApi from '@/services/phoneApi'
import { getAuthHeader } from '@/services/auth'
import ContactSmsThread from '@/components/Phone/ContactSmsThread'
import PofRequestModal from './PofRequestModal'
import EmailComposeModal from './EmailComposeModal'
import { formatPhone, getInitials, cn } from '@/utils/helpers'
import type { Contact } from '@/types'
import { validateEmail, validatePhone } from '@/services/contactValidationApi'
import type { EmailValidationResult, PhoneValidationResult } from '@/services/contactValidationApi'

const BASE_URL = import.meta.env.VITE_REI_SERVER_URL ?? 'http://localhost:8001'

type Tab = 'activity' | 'sms' | 'calls' | 'deals' | 'documents' | 'notes'

const STATUS_OPTIONS = ['Lead', 'Active', 'Closed', 'Dead']
const STATUS_COLORS: Record<string, string> = {
  Lead: 'bg-yellow-100 text-yellow-700',
  Active: 'bg-green-100 text-green-700',
  Closed: 'bg-blue-100 text-blue-700',
  Dead: 'bg-slate-100 text-slate-600',
}

const ACTIVITY_BORDER: Record<string, string> = {
  call: 'border-l-blue-400',
  sms: 'border-l-green-400',
  email: 'border-l-purple-400',
  contract: 'border-l-orange-400',
  pof: 'border-l-teal-400',
  note: 'border-l-slate-300',
  deal: 'border-l-indigo-400',
}

const ACTIVITY_ICON: Record<string, string> = {
  call: '\u{1F4DE}',
  sms: '\u{1F4AC}',
  email: '\u{1F4E7}',
  contract: '\u{1F4C4}',
  pof: '\u{1F6E1}\uFE0F',
  note: '\u{1F4DD}',
  deal: '\u{1F3E0}',
}

const PROPERTY_TYPES = ['Single Family', 'Multi-Family', 'Commercial', 'Land', 'Mobile Home']
const LOAN_TYPES = ['Conventional', 'FHA', 'VA', 'USDA', 'Hard Money', 'Private']
const DEAL_TYPES = ['Subject To', 'Cash Purchase', 'Owner Financing', 'Lease Option', 'Fix & Flip']
const LEAD_SOURCES = ['Direct Mail', 'Cold Call', 'Driving for Dollars', 'Referral', 'Website', 'Social Media']

export default function ContactDetailPage() {
  const { contactId } = useParams<{ contactId: string }>()
  const navigate = useNavigate()
  const [contact, setContact] = useState<Contact | null>(null)
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<Tab>('activity')

  // Backend data
  const [callLogs, setCallLogs] = useState<any[]>([])
  const [smsMessages, setSmsMessages] = useState<any[]>([])
  const [pofRequests, setPofRequests] = useState<any[]>([])
  const [pofCertificates, setPofCertificates] = useState<any[]>([])
  const [generatedContracts, setGeneratedContracts] = useState<any[]>([])
  const [notes, setNotes] = useState<any[]>([])
  const [activityFeed, setActivityFeed] = useState<any[]>([])
  const [deals, setDeals] = useState<any[]>([])

  // UI state
  const [editingName, setEditingName] = useState(false)
  const [editName, setEditName] = useState('')
  const [contactStatus, setContactStatus] = useState('Lead')
  const [showStatusDropdown, setShowStatusDropdown] = useState(false)
  const [newNote, setNewNote] = useState('')
  const [addingNote, setAddingNote] = useState(false)
  const [showPofModal, setShowPofModal] = useState(false)
  const [showEmailModal, setShowEmailModal] = useState(false)
  const [expandedCall, setExpandedCall] = useState<string | null>(null)

  // Editable contact fields
  const [editingSection, setEditingSection] = useState<string | null>(null)
  const [editFields, setEditFields] = useState<Record<string, any>>({})

  // Email & Phone Validation
  const [emailValidation, setEmailValidation] = useState<EmailValidationResult | null>(null)
  const [phoneValidation, setPhoneValidation] = useState<PhoneValidationResult | null>(null)
  const [validatingEmail, setValidatingEmail] = useState(false)
  const [validatingPhone, setValidatingPhone] = useState(false)

  const loadContact = useCallback(async () => {
    if (!contactId) return
    try {
      const c = await fetchContact(contactId).then(c => c!)
      setContact(c)
      setEditName(`${c.firstName || ''} ${c.lastName || ''}`.trim())
      setContactStatus(c.tags?.find(t => STATUS_OPTIONS.includes(t)) || 'Lead')
    } catch {
      // Contact might not exist yet — still load backend data
    }
  }, [contactId])

  const loadBackendData = useCallback(async () => {
    if (!contactId) return
    try {
      const res = await fetch(`${BASE_URL}/api/contacts/${contactId}`, {
        headers: getAuthHeader(),
        credentials: 'include',
      })
      if (res.ok) {
        const data = await res.json()
        setCallLogs(data.call_logs || [])
        setSmsMessages(data.sms_messages || [])
        setPofRequests(data.pof_requests || [])
        setPofCertificates(data.pof_certificates || [])
        setGeneratedContracts(data.generated_contracts || [])
        setNotes(data.notes || [])
        setActivityFeed(data.activity_feed || [])
      }
    } catch {
      // silently fail — data will just be empty
    }
  }, [contactId])

  const loadDeals = useCallback(async () => {
    if (!contactId) return
    try {
      const allDeals = await fetchDeals()
      setDeals(allDeals.filter(d => d.contactId === contactId))
    } catch {
      // ignore
    }
  }, [contactId])

  useEffect(() => {
    setLoading(true)
    Promise.all([loadContact(), loadBackendData(), loadDeals()]).finally(() =>
      setLoading(false)
    )
  }, [loadContact, loadBackendData, loadDeals])

  const handleAddNote = useCallback(async () => {
    if (!newNote.trim() || !contactId || addingNote) return
    setAddingNote(true)
    try {
      const res = await fetch(`${BASE_URL}/api/contacts/${contactId}/notes`, {
        method: 'POST',
        headers: { ...getAuthHeader(), 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ content: newNote }),
      })
      if (res.ok) {
        setNewNote('')
        await loadBackendData()
      }
    } catch {
      // ignore
    } finally {
      setAddingNote(false)
    }
  }, [newNote, contactId, addingNote, loadBackendData])

  const handleDeleteNote = useCallback(
    async (noteId: string) => {
      if (!contactId) return
      try {
        await fetch(`${BASE_URL}/api/contacts/${contactId}/notes/${noteId}`, {
          method: 'DELETE',
          headers: getAuthHeader(),
          credentials: 'include',
        })
        await loadBackendData()
      } catch {
        // ignore
      }
    },
    [contactId, loadBackendData]
  )

  const handleSaveName = useCallback(async () => {
    if (!contact || !contactId) return
    const parts = editName.trim().split(/\s+/)
    const firstName = parts[0] || ''
    const lastName = parts.slice(1).join(' ') || ''
    try {
      await patchContact(contactId, { firstName, lastName })
      await loadContact()
    } catch {
      // ignore
    }
    setEditingName(false)
  }, [contact, contactId, editName, loadContact])

  const handleStatusChange = useCallback(
    async (newStatus: string) => {
      if (!contact || !contactId) return
      setContactStatus(newStatus)
      setShowStatusDropdown(false)
      // Update tags to include the new status
      const otherTags = (contact.tags || []).filter(t => !STATUS_OPTIONS.includes(t))
      try {
        await patchContact(contactId, { tags: [...otherTags, newStatus] })
        await loadContact()
      } catch {
        // ignore
      }
    },
    [contact, contactId, loadContact]
  )

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <Loader2 className="w-8 h-8 animate-spin text-primary-500" />
      </div>
    )
  }

  const displayName = contact?.name || 'Unknown Contact'
  const initials = getInitials(displayName)

  return (
    <div className="h-full">
      {/* Top bar */}
      <div className="flex items-center gap-3 mb-4 md:mb-6">
        <button
          onClick={() => navigate('/contacts')}
          className="p-2 rounded-lg hover:bg-slate-100 transition-colors min-w-[44px] min-h-[44px] flex items-center justify-center"
        >
          <ArrowLeft className="w-5 h-5 text-slate-600" />
        </button>
        <h1 className="text-lg md:text-xl font-bold text-slate-800">Contact Details</h1>
      </div>

      <div className="flex flex-col lg:flex-row gap-4 md:gap-6 h-auto lg:h-[calc(100%-3.5rem)]">
        {/* LEFT COLUMN — 40% */}
        <div className="w-full lg:w-2/5 overflow-y-auto space-y-4 pb-6">
          {/* Contact Header */}
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 md:p-6">
            <div className="flex items-start gap-4">
              <div className="w-16 h-16 rounded-full bg-primary-100 flex items-center justify-center shrink-0">
                <span className="text-xl font-bold text-primary-600">{initials}</span>
              </div>
              <div className="flex-1 min-w-0">
                {editingName ? (
                  <div className="flex items-center gap-2">
                    <input
                      autoFocus
                      value={editName}
                      onChange={e => setEditName(e.target.value)}
                      onKeyDown={e => e.key === 'Enter' && handleSaveName()}
                      className="text-xl font-bold text-slate-800 border-b-2 border-primary-500 outline-none bg-transparent"
                    />
                    <button onClick={handleSaveName} className="p-1 text-green-600 hover:bg-green-50 rounded"><Check className="w-4 h-4" /></button>
                    <button onClick={() => setEditingName(false)} className="p-1 text-red-500 hover:bg-red-50 rounded"><X className="w-4 h-4" /></button>
                  </div>
                ) : (
                  <button
                    onClick={() => { setEditName(displayName); setEditingName(true) }}
                    className="group flex items-center gap-2"
                  >
                    <h2 className="text-xl font-bold text-slate-800 truncate">{displayName}</h2>
                    <Edit2 className="w-4 h-4 text-slate-300 opacity-0 group-hover:opacity-100 transition-opacity" />
                  </button>
                )}
                {contact?.company && (
                  <p className="text-sm text-slate-500">{contact.company}</p>
                )}
                <div className="mt-2 relative inline-block">
                  <button
                    onClick={() => setShowStatusDropdown(!showStatusDropdown)}
                    className={`px-3 py-1 text-xs font-semibold rounded-full ${STATUS_COLORS[contactStatus] || STATUS_COLORS.Lead}`}
                  >
                    {contactStatus} <ChevronDown className="w-3 h-3 inline" />
                  </button>
                  {showStatusDropdown && (
                    <div className="absolute top-full left-0 mt-1 bg-white border border-slate-200 rounded-lg shadow-lg z-10 py-1 min-w-[120px]">
                      {STATUS_OPTIONS.map(s => (
                        <button
                          key={s}
                          onClick={() => handleStatusChange(s)}
                          className={`block w-full text-left px-3 py-1.5 text-sm hover:bg-slate-50 ${contactStatus === s ? 'font-semibold' : ''}`}
                        >
                          {s}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Quick Actions */}
            <div className="grid grid-cols-3 sm:flex sm:flex-wrap gap-2 mt-4 pt-4 border-t border-slate-100">
              <button
                onClick={() => {
                  if (contact?.phone) navigate(`/phone?dial=${contact.phone}`)
                }}
                className="flex items-center justify-center sm:justify-start gap-1.5 px-3 py-2 text-xs font-medium bg-blue-50 text-blue-700 rounded-lg hover:bg-blue-100 transition-colors min-h-[40px]"
              >
                <Phone className="w-3.5 h-3.5" /> Call
              </button>
              <button
                onClick={() => setActiveTab('sms')}
                className="flex items-center justify-center sm:justify-start gap-1.5 px-3 py-2 text-xs font-medium bg-green-50 text-green-700 rounded-lg hover:bg-green-100 transition-colors min-h-[40px]"
              >
                <MessageSquare className="w-3.5 h-3.5" /> SMS
              </button>
              <button
                onClick={() => navigate('/documents')}
                className="flex items-center justify-center sm:justify-start gap-1.5 px-3 py-2 text-xs font-medium bg-orange-50 text-orange-700 rounded-lg hover:bg-orange-100 transition-colors min-h-[40px]"
              >
                <FileText className="w-3.5 h-3.5" /> Contract
              </button>
              <button
                onClick={() => setShowPofModal(true)}
                className="flex items-center justify-center sm:justify-start gap-1.5 px-3 py-2 text-xs font-medium bg-teal-50 text-teal-700 rounded-lg hover:bg-teal-100 transition-colors min-h-[40px]"
              >
                <Shield className="w-3.5 h-3.5" /> POF
              </button>
              <button
                onClick={() => setShowEmailModal(true)}
                className="flex items-center justify-center sm:justify-start gap-1.5 px-3 py-2 text-xs font-medium bg-purple-50 text-purple-700 rounded-lg hover:bg-purple-100 transition-colors min-h-[40px]"
              >
                <Mail className="w-3.5 h-3.5" /> Email
              </button>
              <button
                onClick={() => navigate(`/calendar?contact=${contactId}&action=add-task`)}
                className="flex items-center justify-center sm:justify-start gap-1.5 px-3 py-2 text-xs font-medium bg-indigo-50 text-indigo-700 rounded-lg hover:bg-indigo-100 transition-colors min-h-[40px]"
              >
                <Calendar className="w-3.5 h-3.5" /> Task
              </button>
            </div>
          </div>

          {/* Contact Info (editable sections) */}
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6 space-y-5">
            <InfoSection
              title="Personal"
              fields={[
                { label: 'First Name', value: contact?.firstName || '' },
                { label: 'Last Name', value: contact?.lastName || '' },
                { label: 'Email', value: contact?.email || '' },
                { label: 'Phone', value: contact?.phone ? formatPhone(contact.phone) : '' },
              ]}
            />

            {/* Email & Phone Validation */}
            <div className="flex flex-wrap gap-3 -mt-2">
              {contact?.email && (
                <div className="flex items-center gap-2">
                  <button
                    onClick={async () => {
                      setValidatingEmail(true)
                      try {
                        const result = await validateEmail(contact.email!)
                        setEmailValidation(result)
                      } catch { setEmailValidation(null) }
                      finally { setValidatingEmail(false) }
                    }}
                    disabled={validatingEmail}
                    className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium bg-blue-50 text-blue-700 rounded-lg hover:bg-blue-100 transition-colors disabled:opacity-50"
                  >
                    {validatingEmail ? <Loader2 className="w-3 h-3 animate-spin" /> : <Shield className="w-3 h-3" />}
                    Verify Email
                  </button>
                  {emailValidation && (
                    <span className={cn(
                      'inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium rounded-full',
                      emailValidation.is_deliverable === true ? 'bg-green-100 text-green-700' :
                      emailValidation.is_deliverable === false ? 'bg-red-100 text-red-700' :
                      emailValidation.is_valid ? 'bg-yellow-100 text-yellow-700' :
                      'bg-red-100 text-red-700'
                    )}>
                      {emailValidation.is_deliverable === true ? '✓ Deliverable' :
                       emailValidation.is_deliverable === false ? '✗ Undeliverable' :
                       emailValidation.is_valid ? '? Unknown' : '✗ Invalid'}
                      {emailValidation.quality_score != null && (
                        <span className="text-[10px] opacity-70">({Math.round(emailValidation.quality_score * 100)}%)</span>
                      )}
                    </span>
                  )}
                  {emailValidation?.suggestion && (
                    <span className="text-xs text-amber-600">Did you mean: {emailValidation.suggestion}?</span>
                  )}
                </div>
              )}
              {contact?.phone && (
                <div className="flex items-center gap-2">
                  <button
                    onClick={async () => {
                      setValidatingPhone(true)
                      try {
                        const result = await validatePhone(contact.phone!)
                        setPhoneValidation(result)
                      } catch { setPhoneValidation(null) }
                      finally { setValidatingPhone(false) }
                    }}
                    disabled={validatingPhone}
                    className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium bg-purple-50 text-purple-700 rounded-lg hover:bg-purple-100 transition-colors disabled:opacity-50"
                  >
                    {validatingPhone ? <Loader2 className="w-3 h-3 animate-spin" /> : <Shield className="w-3 h-3" />}
                    Verify Phone
                  </button>
                  {phoneValidation && (
                    <span className={cn(
                      'inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium rounded-full',
                      phoneValidation.is_valid ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
                    )}>
                      {phoneValidation.is_valid ? '✓ Valid' : '✗ Invalid'}
                      {phoneValidation.phone_type && (
                        <span className="text-[10px] opacity-70">({phoneValidation.phone_type})</span>
                      )}
                    </span>
                  )}
                  {phoneValidation?.carrier && (
                    <span className="text-xs text-slate-500">{phoneValidation.carrier}</span>
                  )}
                </div>
              )}
            </div>

            <InfoSection
              title="Property"
              fields={[
                { label: 'Property Address', value: '' },
                { label: 'Property Type', value: '', options: PROPERTY_TYPES },
                { label: 'Estimated Value', value: '' },
              ]}
            />

            <InfoSection
              title="Mortgage Info"
              fields={[
                { label: 'Mortgage Balance', value: '' },
                { label: 'Monthly Payment', value: '' },
                { label: 'Interest Rate', value: '' },
                { label: 'Lender Name', value: '' },
                { label: 'Loan Type', value: '', options: LOAN_TYPES },
              ]}
            />

            <InfoSection
              title="Deal Info"
              fields={[
                { label: 'Deal Type', value: '', options: DEAL_TYPES },
                { label: 'Company', value: contact?.company || '' },
                { label: 'Buying Entity', value: contact?.buyingEntity || '' },
                { label: 'Lead Source', value: contact?.source || '', options: LEAD_SOURCES },
              ]}
            />

            {/* Tags */}
            <div>
              <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">Tags</h3>
              <div className="flex flex-wrap gap-1.5">
                {(contact?.tags || []).map(tag => (
                  <span key={tag} className="flex items-center gap-1 px-2 py-0.5 text-xs bg-slate-100 text-slate-600 rounded-full">
                    {tag}
                  </span>
                ))}
                {(!contact?.tags || contact.tags.length === 0) && (
                  <span className="text-xs text-slate-400">No tags</span>
                )}
              </div>
            </div>

            <p className="text-[10px] text-slate-400">
              Last updated: {contact?.lastActivity ? new Date(contact.lastActivity).toLocaleString() : 'N/A'}
            </p>
          </div>

          {/* Buyer Criteria — only for buyer/wholesaler/partner roles */}
          {contact && ['buyer', 'wholesaler', 'partner'].includes(contact.role) && (
            <BuyerCriteriaSection contactId={contactId || ''} />
          )}

          {/* Deals */}
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6">
            <h3 className="text-sm font-semibold text-slate-800 mb-3">Deals</h3>
            {deals.length === 0 ? (
              <p className="text-sm text-slate-400">No deals linked to this contact</p>
            ) : (
              <div className="space-y-2">
                {deals.map(d => (
                  <div key={d.id} className="flex items-center justify-between p-3 bg-slate-50 rounded-lg">
                    <div>
                      <p className="text-sm font-medium text-slate-800">{d.address || d.title}</p>
                      <p className="text-xs text-slate-500">{d.stage} &middot; ${d.purchasePrice?.toLocaleString() || '0'}</p>
                    </div>
                    <button
                      onClick={() => navigate(`/pipeline`)}
                      className="text-xs text-primary-600 hover:underline"
                    >
                      View
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* RIGHT COLUMN — 60% */}
        <div className="w-full lg:w-3/5 flex flex-col min-h-0">
          {/* Tabs */}
          <div className="sticky top-0 z-10 bg-white border border-slate-200 rounded-t-xl flex overflow-x-auto scrollbar-hide">
            {(['activity', 'sms', 'calls', 'deals', 'documents', 'notes'] as Tab[]).map(tab => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={cn(
                  'px-3 md:px-4 py-3 text-sm font-medium whitespace-nowrap border-b-2 transition-colors min-h-[44px]',
                  activeTab === tab
                    ? 'border-primary-600 text-primary-600'
                    : 'border-transparent text-slate-500 hover:text-slate-700'
                )}
              >
                {tab.charAt(0).toUpperCase() + tab.slice(1)}
              </button>
            ))}
          </div>

          {/* Tab Content */}
          <div className="flex-1 bg-white border-x border-b border-slate-200 rounded-b-xl overflow-y-auto p-5">
            {activeTab === 'activity' && (
              <ActivityTab
                activityFeed={activityFeed}
                newNote={newNote}
                setNewNote={setNewNote}
                addingNote={addingNote}
                onAddNote={handleAddNote}
                onDeleteNote={handleDeleteNote}
              />
            )}
            {activeTab === 'sms' && contact && (
              <div className="h-full">
                {contact.phone ? (
                  <ContactSmsThread
                    contactId={contactId!}
                    contactPhone={contact.phone}
                    contactName={displayName}
                  />
                ) : (
                  <EmptyState
                    icon="\u{1F4AC}"
                    title="No phone number"
                    description="Add a phone number to this contact to send SMS messages."
                  />
                )}
              </div>
            )}
            {activeTab === 'calls' && (
              <CallsTab
                calls={callLogs}
                expandedCall={expandedCall}
                setExpandedCall={setExpandedCall}
                contactPhone={contact?.phone}
              />
            )}
            {activeTab === 'deals' && (
              <DealsTab deals={deals} />
            )}
            {activeTab === 'documents' && (
              <DocumentsTab
                contracts={generatedContracts}
                certificates={pofCertificates}
              />
            )}
            {activeTab === 'notes' && (
              <NotesTab
                notes={notes}
                newNote={newNote}
                setNewNote={setNewNote}
                addingNote={addingNote}
                onAddNote={handleAddNote}
                onDeleteNote={handleDeleteNote}
              />
            )}
          </div>
        </div>
      </div>

      {/* Modals */}
      {showPofModal && contact && (
        <PofRequestModal
          contact={contact}
          onClose={() => setShowPofModal(false)}
          onSuccess={() => { setShowPofModal(false); loadBackendData() }}
        />
      )}
      {showEmailModal && contact && (
        <EmailComposeModal
          contact={contact}
          onClose={() => setShowEmailModal(false)}
          onSuccess={() => setShowEmailModal(false)}
        />
      )}
    </div>
  )
}

// ── Sub-Components ────────────────────────────────────────────────────

// ── Buyer Criteria Section ──────────────────────────────
const PROPERTY_TYPE_OPTIONS = ['sfr', 'multi_family', 'condo_townhouse', 'mobile_home', 'land', 'any']
const CONDITION_OPTIONS = ['excellent', 'good', 'fair', 'needs_full_rehab', 'any']
const FINANCING_OPTIONS = ['cash', 'conventional', 'fha', 'va', 'hard_money', 'private_money']

const PROPERTY_TYPE_LABELS: Record<string, string> = {
  sfr: 'SFR (Single Family)', multi_family: 'Multi-Family', condo_townhouse: 'Condo/Townhouse',
  mobile_home: 'Mobile Home', land: 'Land', any: 'Any',
}
const CONDITION_LABELS: Record<string, string> = {
  excellent: 'Move-In Ready', good: 'Light Rehab', fair: 'Medium Rehab',
  needs_full_rehab: 'Full Rehab OK', any: 'Any Condition',
}
const FINANCING_LABELS: Record<string, string> = {
  cash: 'Cash', conventional: 'Conventional', fha: 'FHA', va: 'VA',
  hard_money: 'Hard Money', private_money: 'Private Money',
}

function BuyerCriteriaSection({ contactId }: { contactId: string }) {
  const [criteria, setCriteria] = useState<{
    propertyTypes: string[]
    markets: string[]
    conditionsAccepted: string[]
    financingTypes: string[]
    minBudget: string
    maxBudget: string
    timelineToPurchase: string
    isActive: boolean
  }>({
    propertyTypes: [], markets: [], conditionsAccepted: [], financingTypes: [],
    minBudget: '', maxBudget: '', timelineToPurchase: '', isActive: true,
  })
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [hasExisting, setHasExisting] = useState(false)
  const [expanded, setExpanded] = useState(false)

  const fetchCriteria = useCallback(async () => {
    try {
      const authHeader = await getAuthHeader()
      const resp = await fetch(`${BASE_URL}/api/crm/buyer-criteria/${contactId}`, {
        headers: { ...authHeader },
        credentials: 'include',
      })
      if (resp.ok) {
        const data = await resp.json()
        setCriteria({
          propertyTypes: data.propertyTypes || [],
          markets: data.markets || [],
          conditionsAccepted: data.conditionsAccepted || [],
          financingTypes: data.financingTypes || [],
          minBudget: data.minBudget ? String(data.minBudget) : '',
          maxBudget: data.maxBudget ? String(data.maxBudget) : '',
          timelineToPurchase: data.timelineToPurchase || '',
          isActive: data.isActive !== false,
        })
        setHasExisting(true)
      }
    } catch { /* no criteria yet */ }
    setLoading(false)
  }, [contactId])

  useEffect(() => { fetchCriteria() }, [fetchCriteria])

  const toggleArray = (arr: string[], val: string) =>
    arr.includes(val) ? arr.filter(v => v !== val) : [...arr, val]

  const saveCriteria = async () => {
    setSaving(true)
    try {
      const authHeader = await getAuthHeader()
      const body = {
        buyerContactId: contactId,
        propertyTypes: criteria.propertyTypes,
        markets: criteria.markets,
        conditionsAccepted: criteria.conditionsAccepted,
        financingTypes: criteria.financingTypes,
        minBudget: criteria.minBudget ? parseFloat(criteria.minBudget) : null,
        maxBudget: criteria.maxBudget ? parseFloat(criteria.maxBudget) : null,
        timelineToPurchase: criteria.timelineToPurchase || null,
        isActive: criteria.isActive,
      }
      const method = hasExisting ? 'PATCH' : 'POST'
      const url = hasExisting
        ? `${BASE_URL}/api/crm/buyer-criteria/${contactId}`
        : `${BASE_URL}/api/crm/buyer-criteria`
      const resp = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json', ...authHeader },
        credentials: 'include',
        body: JSON.stringify(body),
      })
      if (resp.ok) {
        setHasExisting(true)
      }
    } catch (e) {
      console.error('Failed to save buyer criteria:', e)
    }
    setSaving(false)
  }

  if (loading) return null

  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6">
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex items-center justify-between w-full text-left"
      >
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-semibold text-slate-800">Buyer Criteria</h3>
          {criteria.isActive && hasExisting && (
            <span className="text-[10px] px-1.5 py-0.5 bg-green-100 text-green-700 rounded-full font-medium">Active</span>
          )}
        </div>
        {expanded ? <ChevronDown className="w-4 h-4 text-slate-400" /> : <ChevronRight className="w-4 h-4 text-slate-400" />}
      </button>

      {expanded && (
        <div className="mt-4 space-y-4">
          {/* Property Types */}
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1.5">Property Types</label>
            <div className="flex flex-wrap gap-1.5">
              {PROPERTY_TYPE_OPTIONS.map(pt => (
                <button
                  key={pt}
                  type="button"
                  onClick={() => setCriteria(p => ({ ...p, propertyTypes: toggleArray(p.propertyTypes, pt) }))}
                  className={cn(
                    'px-2.5 py-1 text-xs rounded-full border transition-colors',
                    criteria.propertyTypes.includes(pt)
                      ? 'bg-primary-100 border-primary-300 text-primary-700'
                      : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                  )}
                >
                  {PROPERTY_TYPE_LABELS[pt] || pt}
                </button>
              ))}
            </div>
          </div>

          {/* Conditions Accepted */}
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1.5">Condition Accepted</label>
            <div className="flex flex-wrap gap-1.5">
              {CONDITION_OPTIONS.map(c => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setCriteria(p => ({ ...p, conditionsAccepted: toggleArray(p.conditionsAccepted, c) }))}
                  className={cn(
                    'px-2.5 py-1 text-xs rounded-full border transition-colors',
                    criteria.conditionsAccepted.includes(c)
                      ? 'bg-primary-100 border-primary-300 text-primary-700'
                      : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                  )}
                >
                  {CONDITION_LABELS[c] || c}
                </button>
              ))}
            </div>
          </div>

          {/* Financing Types */}
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1.5">Financing Types</label>
            <div className="flex flex-wrap gap-1.5">
              {FINANCING_OPTIONS.map(f => (
                <button
                  key={f}
                  type="button"
                  onClick={() => setCriteria(p => ({ ...p, financingTypes: toggleArray(p.financingTypes, f) }))}
                  className={cn(
                    'px-2.5 py-1 text-xs rounded-full border transition-colors',
                    criteria.financingTypes.includes(f)
                      ? 'bg-primary-100 border-primary-300 text-primary-700'
                      : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                  )}
                >
                  {FINANCING_LABELS[f] || f}
                </button>
              ))}
            </div>
          </div>

          {/* Budget Range */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Min Budget</label>
              <input
                type="number"
                value={criteria.minBudget}
                onChange={e => setCriteria(p => ({ ...p, minBudget: e.target.value }))}
                placeholder="$0"
                className="w-full px-3 py-1.5 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Max Budget</label>
              <input
                type="number"
                value={criteria.maxBudget}
                onChange={e => setCriteria(p => ({ ...p, maxBudget: e.target.value }))}
                placeholder="$500,000"
                className="w-full px-3 py-1.5 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
              />
            </div>
          </div>

          {/* Markets / Target Areas */}
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Target Markets / Areas</label>
            <input
              type="text"
              value={criteria.markets.join(', ')}
              onChange={e => setCriteria(p => ({ ...p, markets: e.target.value.split(',').map(s => s.trim()).filter(Boolean) }))}
              placeholder="San Antonio, Austin, DFW"
              className="w-full px-3 py-1.5 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
            />
            <p className="text-[10px] text-slate-400 mt-0.5">Separate multiple markets with commas</p>
          </div>

          {/* Timeline */}
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Timeline to Purchase</label>
            <input
              type="text"
              value={criteria.timelineToPurchase}
              onChange={e => setCriteria(p => ({ ...p, timelineToPurchase: e.target.value }))}
              placeholder="ASAP, 30 days, 60 days..."
              className="w-full px-3 py-1.5 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
            />
          </div>

          {/* Active toggle + Save */}
          <div className="flex items-center justify-between pt-2 border-t border-slate-100">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={criteria.isActive}
                onChange={e => setCriteria(p => ({ ...p, isActive: e.target.checked }))}
                className="w-4 h-4 rounded border-slate-300"
              />
              <span className="text-xs text-slate-600">Actively looking for deals</span>
            </label>
            <button
              onClick={saveCriteria}
              disabled={saving}
              className="flex items-center gap-1.5 px-4 py-1.5 bg-primary-600 text-white text-xs font-medium rounded-lg hover:bg-primary-700 transition disabled:opacity-50"
            >
              {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
              {saving ? 'Saving...' : 'Save Criteria'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}


function InfoSection({
  title,
  fields,
}: {
  title: string
  fields: Array<{ label: string; value: string; options?: string[] }>
}) {
  return (
    <div>
      <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">{title}</h3>
      <div className="space-y-2">
        {fields.map(f => (
          <div key={f.label} className="flex items-center justify-between group">
            <span className="text-sm text-slate-500">{f.label}</span>
            <span className="text-sm font-medium text-slate-800">
              {f.value || <span className="text-slate-300">--</span>}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}

function EmptyState({ icon, title, description, action }: {
  icon: string
  title: string
  description: string
  action?: React.ReactNode
}) {
  return (
    <div className="flex flex-col items-center justify-center py-12 text-center">
      <span className="text-4xl mb-3">{icon}</span>
      <h3 className="text-sm font-semibold text-slate-700">{title}</h3>
      <p className="text-xs text-slate-500 mt-1 max-w-xs">{description}</p>
      {action && <div className="mt-3">{action}</div>}
    </div>
  )
}

function ActivityTab({
  activityFeed,
  newNote,
  setNewNote,
  addingNote,
  onAddNote,
  onDeleteNote,
}: {
  activityFeed: any[]
  newNote: string
  setNewNote: (v: string) => void
  addingNote: boolean
  onAddNote: () => void
  onDeleteNote: (id: string) => void
}) {
  return (
    <div>
      {/* Add Note */}
      <div className="flex gap-2 mb-5">
        <textarea
          value={newNote}
          onChange={e => setNewNote(e.target.value)}
          placeholder="Add a note..."
          rows={2}
          className="flex-1 px-3 py-2 border border-slate-200 rounded-lg text-sm resize-none focus:outline-none focus:ring-2 focus:ring-primary-500"
        />
        <button
          onClick={onAddNote}
          disabled={!newNote.trim() || addingNote}
          className="self-end px-4 py-2 bg-primary-600 text-white text-sm font-medium rounded-lg hover:bg-primary-700 disabled:opacity-50 transition-colors"
        >
          {addingNote ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Add Note'}
        </button>
      </div>

      {activityFeed.length === 0 ? (
        <EmptyState
          icon="\u{1F4CB}"
          title="No activity yet"
          description="Calls, SMS, emails, documents, and notes will appear here."
        />
      ) : (
        <div className="space-y-2">
          {activityFeed.map(item => (
            <div
              key={`${item.type}-${item.id}`}
              className={cn(
                'border-l-4 pl-4 py-3 rounded-r-lg bg-slate-50 flex items-start justify-between gap-2',
                ACTIVITY_BORDER[item.type] || 'border-l-slate-200'
              )}
            >
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-sm">{ACTIVITY_ICON[item.type] || ''}</span>
                  <span className="text-sm text-slate-700">{item.summary}</span>
                </div>
                <p className="text-[10px] text-slate-400 mt-0.5">
                  {item.timestamp ? new Date(item.timestamp).toLocaleString() : ''}
                </p>
                {item.type === 'call' && item.data?.recording_url && (
                  <audio controls className="mt-2 h-8" src={item.data.recording_url}>
                    <track kind="captions" />
                  </audio>
                )}
              </div>
              {item.type === 'note' && (
                <button
                  onClick={() => onDeleteNote(item.id)}
                  className="p-1 text-slate-400 hover:text-red-500 transition-colors shrink-0"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function CallsTab({
  calls,
  expandedCall,
  setExpandedCall,
  contactPhone,
}: {
  calls: any[]
  expandedCall: string | null
  setExpandedCall: (id: string | null) => void
  contactPhone?: string
}) {
  if (calls.length === 0) {
    return (
      <EmptyState
        icon="\u{1F4DE}"
        title="No call history"
        description="When you call this contact, their call logs will appear here."
      />
    )
  }

  return (
    <div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-slate-500 border-b border-slate-200">
              <th className="pb-2 pr-3">Direction</th>
              <th className="pb-2 pr-3">Date/Time</th>
              <th className="pb-2 pr-3">Duration</th>
              <th className="pb-2 pr-3">Disposition</th>
              <th className="pb-2">Recording</th>
            </tr>
          </thead>
          <tbody>
            {calls.map(c => {
              const dur = c.duration_seconds || 0
              const mins = Math.floor(dur / 60)
              const secs = dur % 60
              const isExpanded = expandedCall === c.id

              return (
                <>
                  <tr
                    key={c.id}
                    onClick={() => setExpandedCall(isExpanded ? null : c.id)}
                    className="border-b border-slate-100 hover:bg-slate-50 cursor-pointer"
                  >
                    <td className="py-2.5 pr-3">
                      <span className={cn(
                        'px-2 py-0.5 text-xs rounded-full font-medium',
                        c.direction === 'inbound' ? 'bg-green-100 text-green-700' : 'bg-blue-100 text-blue-700'
                      )}>
                        {c.direction}
                      </span>
                    </td>
                    <td className="py-2.5 pr-3 text-slate-700">
                      {c.created_at ? new Date(c.created_at).toLocaleString() : '--'}
                    </td>
                    <td className="py-2.5 pr-3 text-slate-700">{mins}m {secs}s</td>
                    <td className="py-2.5 pr-3 text-slate-700">{c.disposition || c.status}</td>
                    <td className="py-2.5">
                      {c.recording_url ? (
                        <Play className="w-4 h-4 text-primary-600" />
                      ) : (
                        <span className="text-slate-300">--</span>
                      )}
                    </td>
                  </tr>
                  {isExpanded && (
                    <tr key={`${c.id}-expanded`}>
                      <td colSpan={5} className="p-4 bg-slate-50 border-b border-slate-100">
                        {c.recording_url && (
                          <div className="mb-3">
                            <p className="text-xs font-medium text-slate-600 mb-1">Recording</p>
                            <audio controls className="h-8 w-full max-w-md" src={c.recording_url}>
                              <track kind="captions" />
                            </audio>
                          </div>
                        )}
                        {c.transcription && (
                          <div className="mb-3">
                            <p className="text-xs font-medium text-slate-600 mb-1">Transcription</p>
                            <p className="text-sm text-slate-700 bg-white p-2 rounded border border-slate-200">{c.transcription}</p>
                          </div>
                        )}
                        {c.notes && (
                          <div>
                            <p className="text-xs font-medium text-slate-600 mb-1">Notes</p>
                            <p className="text-sm text-slate-700">{c.notes}</p>
                          </div>
                        )}
                        {!c.recording_url && !c.transcription && !c.notes && (
                          <p className="text-xs text-slate-400">No additional details</p>
                        )}
                      </td>
                    </tr>
                  )}
                </>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function DealsTab({ deals }: { deals: any[] }) {
  const navigate = useNavigate()

  if (deals.length === 0) {
    return (
      <EmptyState
        icon="\u{1F3E0}"
        title="No deals yet"
        description="Create a deal linked to this contact to track it here."
      />
    )
  }

  return (
    <div className="space-y-3">
      {deals.map(d => (
        <div key={d.id} className="p-4 border border-slate-200 rounded-lg">
          <div className="flex items-start justify-between">
            <div>
              <p className="font-medium text-slate-800">{d.address || d.title}</p>
              <div className="flex items-center gap-2 mt-1">
                <span className="px-2 py-0.5 text-xs rounded-full bg-blue-100 text-blue-700 font-medium">
                  {d.stage}
                </span>
                <span className="text-sm text-slate-500">${d.purchasePrice?.toLocaleString() || '0'}</span>
              </div>
            </div>
            <button
              onClick={() => navigate('/pipeline')}
              className="text-xs text-primary-600 hover:underline font-medium"
            >
              View Full Deal
            </button>
          </div>
        </div>
      ))}
    </div>
  )
}

function DocumentsTab({
  contracts,
  certificates,
}: {
  contracts: any[]
  certificates: any[]
}) {
  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-sm font-semibold text-slate-800 mb-3">Generated Contracts</h3>
        {contracts.length === 0 ? (
          <EmptyState
            icon="\u{1F4C4}"
            title="No contracts"
            description="Generate a contract for this contact to see it here."
          />
        ) : (
          <div className="space-y-2">
            {contracts.map(c => (
              <div key={c.id} className="flex items-center justify-between p-3 bg-slate-50 rounded-lg">
                <div>
                  <p className="text-sm font-medium text-slate-800">{c.file_name}</p>
                  <p className="text-xs text-slate-500">
                    {c.created_at ? new Date(c.created_at).toLocaleDateString() : ''}
                  </p>
                </div>
                {c.storage_url && (
                  <a
                    href={c.storage_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-primary-600 hover:underline"
                  >
                    View
                  </a>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      <div>
        <h3 className="text-sm font-semibold text-slate-800 mb-3">POF Certificates</h3>
        {certificates.length === 0 ? (
          <EmptyState
            icon="\u{1F6E1}\uFE0F"
            title="No certificates"
            description="POF certificates for this contact will appear here."
          />
        ) : (
          <div className="space-y-2">
            {certificates.map(c => (
              <div key={c.id} className="flex items-center justify-between p-3 bg-slate-50 rounded-lg">
                <div>
                  <p className="text-sm font-medium text-slate-800">
                    {c.buyer_name} &mdash; ${c.required_amount?.toLocaleString()}
                  </p>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className={cn(
                      'px-2 py-0.5 text-xs rounded-full font-medium',
                      c.verified ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700'
                    )}>
                      {c.verified ? 'Verified' : 'Pending'}
                    </span>
                    {c.expires_at && (
                      <span className="text-xs text-slate-500">
                        Expires {new Date(c.expires_at).toLocaleDateString()}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

function NotesTab({
  notes,
  newNote,
  setNewNote,
  addingNote,
  onAddNote,
  onDeleteNote,
}: {
  notes: any[]
  newNote: string
  setNewNote: (v: string) => void
  addingNote: boolean
  onAddNote: () => void
  onDeleteNote: (id: string) => void
}) {
  return (
    <div>
      {/* Add Note */}
      <div className="flex gap-2 mb-5">
        <textarea
          value={newNote}
          onChange={e => setNewNote(e.target.value)}
          placeholder="Add a note..."
          rows={2}
          className="flex-1 px-3 py-2 border border-slate-200 rounded-lg text-sm resize-none focus:outline-none focus:ring-2 focus:ring-primary-500"
        />
        <button
          onClick={onAddNote}
          disabled={!newNote.trim() || addingNote}
          className="self-end px-4 py-2 bg-primary-600 text-white text-sm font-medium rounded-lg hover:bg-primary-700 disabled:opacity-50 transition-colors"
        >
          {addingNote ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Add Note'}
        </button>
      </div>

      {notes.length === 0 ? (
        <EmptyState
          icon="\u{1F4DD}"
          title="No notes"
          description="Add notes about this contact to keep track of important details."
        />
      ) : (
        <div className="space-y-2">
          {[...notes].reverse().map(n => (
            <div key={n.id} className="flex items-start justify-between p-3 bg-slate-50 rounded-lg">
              <div>
                <p className="text-sm text-slate-700">{n.content}</p>
                <p className="text-[10px] text-slate-400 mt-1">
                  {n.created_at ? new Date(n.created_at).toLocaleString() : ''}
                </p>
              </div>
              <button
                onClick={() => onDeleteNote(n.id)}
                className="p-1 text-slate-400 hover:text-red-500 transition-colors shrink-0"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
