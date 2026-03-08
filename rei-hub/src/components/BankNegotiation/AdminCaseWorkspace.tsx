import { useState, useEffect, useRef } from 'react'
import {
  ArrowLeft,
  Zap,
  Plus,
  Send,
  File,
  Clock,
  AlertCircle,
  ChevronDown,
  User,
  Building2,
  Scale,
  MapPin,
  Phone,
  Mail,
  RefreshCw,
  Package,
  FileText,
  Download,
  Eye,
  FolderOpen,
  Upload,
} from 'lucide-react'
import { toast } from 'sonner'
import type {
  NegotiationCase,
  NegotiationActivity,
  NegotiationMessage,
  NegotiationRecipient,
} from '@/types'
import {
  getCase,
  updateCase,
  createActivity,
  listMessages,
  sendMessage,
  triggerResearch,
  listRecipients,
  checkTrackingNow,
  listCaseFiles,
  getCaseFile,
  uploadCaseFile,
  testResearch,
} from '@/services/negotiationApi'
import type { CaseFile } from '@/services/negotiationApi'

/* ── Helpers ─────────────────────────────────────────────────────── */

const EST_TZ = 'America/New_York'

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', {
    timeZone: EST_TZ,
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  })
}

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString('en-US', {
    timeZone: EST_TZ,
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZoneName: 'short',
  })
}

function getStatusBadgeColor(status: string): string {
  switch (status) {
    case 'intake':
      return 'bg-blue-100 text-blue-700'
    case 'researching':
      return 'bg-yellow-100 text-yellow-700'
    case 'in_progress':
      return 'bg-purple-100 text-purple-700'
    case 'awaiting_response':
      return 'bg-orange-100 text-orange-700'
    case 'resolved':
      return 'bg-green-100 text-green-700'
    case 'closed':
      return 'bg-slate-100 text-slate-700'
    default:
      return 'bg-slate-100 text-slate-600'
  }
}

function getPriorityBadgeColor(priority: string): string {
  switch (priority) {
    case 'low':
      return 'bg-slate-100 text-slate-600'
    case 'normal':
      return 'bg-blue-100 text-blue-600'
    case 'high':
      return 'bg-orange-100 text-orange-600'
    case 'urgent':
      return 'bg-red-100 text-red-600'
    default:
      return 'bg-slate-100 text-slate-600'
  }
}

function ServiceTypeBadge({ serviceType }: { serviceType: string }) {
  const colors: Record<string, string> = {
    bank: 'bg-indigo-100 text-indigo-700',
    county_tax: 'bg-amber-100 text-amber-700',
    other_lien: 'bg-purple-100 text-purple-700',
  }
  const label = serviceType === 'county_tax' ? 'County Tax' : serviceType === 'other_lien' ? 'Other Lien' : 'Bank'
  return (
    <span className={`inline-block text-xs font-medium px-2 py-1 rounded ${colors[serviceType] || colors.bank}`}>
      {label}
    </span>
  )
}

/* ── Activity Journal Section ─────────────────────────────────────── */

function TrackingStatusBadge({ status }: { status?: string }) {
  if (!status) return null
  const colors: Record<string, string> = {
    in_transit: 'bg-blue-100 text-blue-700',
    delivered: 'bg-green-100 text-green-700',
    attempted: 'bg-yellow-100 text-yellow-700',
    returned: 'bg-red-100 text-red-700',
    unknown: 'bg-slate-100 text-slate-600',
  }
  return (
    <span className={`inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full ${colors[status] || colors.unknown}`}>
      <Package className="w-3 h-3" />
      {status.replace('_', ' ')}
    </span>
  )
}

function ActivityJournal({
  activities,
  onAddActivity,
  onCheckTracking,
}: {
  activities: NegotiationActivity[]
  onAddActivity: (activity: Omit<NegotiationActivity, 'id' | 'createdBy' | 'createdAt'>) => Promise<void>
  onCheckTracking: (activityId: string) => Promise<void>
}) {
  const [showForm, setShowForm] = useState(false)
  const [activityType, setActivityType] = useState('Note')
  const [adminNote, setAdminNote] = useState('')
  const [sendMethod, setSendMethod] = useState<string>('')
  const [trackingNum, setTrackingNum] = useState('')
  const [signatureTrackingNum, setSignatureTrackingNum] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSubmit() {
    if (!adminNote.trim()) {
      toast.error('Please enter a note')
      return
    }

    setLoading(true)
    try {
      await onAddActivity({
        activityType,
        adminNote,
        sendMethod: sendMethod || undefined,
        uspsTrackingNumber: trackingNum || undefined,
        uspsSignatureTrackingNumber: signatureTrackingNum || undefined,
        caseId: '', // Will be filled by parent
      })
      setAdminNote('')
      setActivityType('Note')
      setSendMethod('')
      setTrackingNum('')
      setSignatureTrackingNum('')
      setShowForm(false)
      toast.success('Activity recorded')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to add activity')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold text-slate-900">Activity Journal</h3>
        <button
          onClick={() => setShowForm(!showForm)}
          className="px-3 py-1.5 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 transition flex items-center gap-2"
        >
          <Plus className="w-4 h-4" />
          Add Activity
        </button>
      </div>

      {/* Activities Timeline */}
      <div className="bg-white rounded-lg border border-slate-200 p-5 space-y-5">
        {activities.length === 0 ? (
          <p className="text-slate-500 text-sm text-center py-8">No activities yet</p>
        ) : (
          activities.map((activity) => (
            <div key={activity.id} className="border-l-2 border-slate-200 pl-4 pb-4 last:pb-0">
              <div className="flex items-start justify-between mb-2">
                <div>
                  <h4 className="font-medium text-slate-900">{activity.activityType}</h4>
                  <p className="text-xs text-slate-500">{formatDateTime(activity.createdAt)}</p>
                </div>
              </div>

              <p className="text-sm text-slate-700 mb-3">{activity.adminNote}</p>

              {activity.sendMethod && (
                <div className="bg-slate-50 rounded p-3 mb-3 space-y-2 text-sm">
                  <div className="flex items-center justify-between">
                    <p>
                      <span className="font-medium text-slate-700">Send Method:</span> {activity.sendMethod}
                    </p>
                    <TrackingStatusBadge status={activity.trackingStatus} />
                  </div>
                  {activity.uspsTrackingNumber && (
                    <div className="flex items-center justify-between gap-2">
                      <p>
                        <span className="font-medium text-slate-700">Tracking:</span>{' '}
                        <span className="font-mono text-xs">{activity.uspsTrackingNumber}</span>
                      </p>
                      {activity.trackingStatus !== 'delivered' && activity.trackingStatus !== 'returned' && (
                        <button
                          onClick={() => onCheckTracking(activity.id)}
                          className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-800 transition px-2 py-1 rounded hover:bg-blue-50"
                        >
                          <RefreshCw className="w-3 h-3" />
                          Check Now
                        </button>
                      )}
                    </div>
                  )}
                  {activity.uspsSignatureTrackingNumber && (
                    <p>
                      <span className="font-medium text-slate-700">Signature Tracking:</span>{' '}
                      <span className="font-mono text-xs">{activity.uspsSignatureTrackingNumber}</span>
                    </p>
                  )}
                  {activity.uspsDeliveredDate && (
                    <p className="text-green-700">
                      <span className="font-medium">Delivered:</span> {activity.uspsDeliveredDate}
                      {activity.uspsSignedBy && ` — Signed by: ${activity.uspsSignedBy}`}
                    </p>
                  )}
                </div>
              )}

              {activity.attachments && activity.attachments.length > 0 && (
                <div className="space-y-2">
                  <p className="text-xs font-medium text-slate-600">Attachments:</p>
                  {activity.attachments.map((att, idx) => (
                    <div key={idx} className="flex items-center gap-2 text-xs text-slate-600">
                      <File className="w-3 h-3" />
                      {att.fileName}
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))
        )}
      </div>

      {/* Add Activity Form */}
      {showForm && (
        <div className="bg-slate-50 rounded-lg border border-slate-200 p-5 space-y-4">
          <h4 className="font-semibold text-slate-900">New Activity</h4>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">Activity Type</label>
              <div className="relative">
                <select
                  value={activityType}
                  onChange={(e) => setActivityType(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm appearance-none bg-white cursor-pointer focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option>Note</option>
                  <option>Correspondence Sent</option>
                  <option>Correspondence Received</option>
                  <option>Phone Call</option>
                  <option>Email</option>
                  <option>Document Added</option>
                </select>
                <ChevronDown className="absolute right-2 top-2.5 w-4 h-4 text-slate-400 pointer-events-none" />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">Send Method</label>
              <div className="relative">
                <select
                  value={sendMethod}
                  onChange={(e) => setSendMethod(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm appearance-none bg-white cursor-pointer focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">—</option>
                  <option value="Certified Mail">Certified Mail</option>
                  <option value="Regular Mail">Regular Mail</option>
                  <option value="Fax">Fax</option>
                  <option value="Email">Email</option>
                  <option value="Phone">Phone</option>
                </select>
                <ChevronDown className="absolute right-2 top-2.5 w-4 h-4 text-slate-400 pointer-events-none" />
              </div>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">Admin Note</label>
            <textarea
              value={adminNote}
              onChange={(e) => setAdminNote(e.target.value)}
              placeholder="Enter activity details..."
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              rows={4}
            />
          </div>

          {sendMethod && (
            <>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">USPS Tracking #</label>
                  <input
                    type="text"
                    value={trackingNum}
                    onChange={(e) => setTrackingNum(e.target.value)}
                    placeholder="(optional)"
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">Signature Tracking #</label>
                  <input
                    type="text"
                    value={signatureTrackingNum}
                    onChange={(e) => setSignatureTrackingNum(e.target.value)}
                    placeholder="(optional)"
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>
            </>
          )}

          <div className="flex gap-2 justify-end">
            <button
              onClick={() => setShowForm(false)}
              className="px-4 py-2 border border-slate-300 rounded-lg text-slate-700 font-medium hover:bg-slate-100"
            >
              Cancel
            </button>
            <button
              onClick={handleSubmit}
              disabled={loading}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 disabled:opacity-50"
            >
              {loading ? 'Saving...' : 'Add Activity'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

/* ── Chat Thread Section ─────────────────────────────────────────── */

function ChatThread({
  messages,
  unreadCount,
  userId,
  onSendMessage,
}: {
  messages: NegotiationMessage[]
  unreadCount: number
  userId: number
  onSendMessage: (content: string) => Promise<void>
}) {
  const [content, setContent] = useState('')
  const [loading, setLoading] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }

  useEffect(() => {
    scrollToBottom()
  }, [messages])

  async function handleSend() {
    if (!content.trim()) return
    setLoading(true)
    try {
      await onSendMessage(content)
      setContent('')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to send message')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="bg-white rounded-lg border border-slate-200 h-96 flex flex-col">
      {/* Header */}
      <div className="border-b border-slate-200 p-4 flex items-center justify-between">
        <h3 className="font-semibold text-slate-900">Messages</h3>
        {unreadCount > 0 && (
          <span className="bg-blue-100 text-blue-700 px-2 py-1 rounded text-xs font-medium">
            {unreadCount} unread
          </span>
        )}
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.length === 0 ? (
          <p className="text-slate-500 text-sm text-center py-8">No messages yet</p>
        ) : (
          messages.map((msg) => (
            <div
              key={msg.id}
              className={`flex ${msg.senderRole === 'admin' ? 'justify-end' : 'justify-start'}`}
            >
              <div
                className={`max-w-xs px-4 py-2 rounded-lg text-sm ${
                  msg.senderRole === 'admin'
                    ? 'bg-blue-600 text-white'
                    : 'bg-slate-100 text-slate-900'
                }`}
              >
                <p>{msg.content}</p>
                <p
                  className={`text-xs mt-1 ${
                    msg.senderRole === 'admin' ? 'text-blue-100' : 'text-slate-500'
                  }`}
                >
                  {formatDateTime(msg.createdAt)}
                </p>
              </div>
            </div>
          ))
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="border-t border-slate-200 p-4 flex gap-2">
        <input
          type="text"
          value={content}
          onChange={(e) => setContent(e.target.value)}
          onKeyPress={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault()
              handleSend()
            }
          }}
          placeholder="Type message..."
          className="flex-1 px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        <button
          onClick={handleSend}
          disabled={loading || !content.trim()}
          className="p-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 transition"
        >
          <Send className="w-4 h-4" />
        </button>
      </div>
    </div>
  )
}

/* ── Quick Actions Sidebar ──────────────────────────────────────── */

// ── Property & Lien Info Card ────────────────────────────────────────

function PropertyInfoCard({
  deal,
  liens,
}: {
  deal: Record<string, unknown> | null
  liens: Record<string, unknown>[]
}) {
  if (!deal && liens.length === 0) return null

  const fmt = (v: unknown) => {
    if (v == null) return '—'
    if (typeof v === 'number') return `$${v.toLocaleString()}`
    return String(v)
  }

  return (
    <div className="bg-white rounded-lg border border-slate-200 p-4 space-y-3">
      <h3 className="font-semibold text-slate-900 text-sm">Property & Lien Details</h3>

      {deal && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-sm">
          <div>
            <span className="text-slate-500 text-xs block">Address</span>
            <span className="font-medium text-slate-900">
              {[deal.address, deal.city, deal.state, deal.zip].filter(Boolean).join(', ')}
            </span>
          </div>
          <div>
            <span className="text-slate-500 text-xs block">Property Type</span>
            <span className="font-medium text-slate-900">{fmt(deal.propertyType)}</span>
          </div>
          <div>
            <span className="text-slate-500 text-xs block">Bed / Bath</span>
            <span className="font-medium text-slate-900">{String(deal.bedrooms ?? 0)} bd / {String(deal.bathrooms ?? 0)} ba</span>
          </div>
          <div>
            <span className="text-slate-500 text-xs block">Sq Ft</span>
            <span className="font-medium text-slate-900">{deal.sqft ? Number(deal.sqft).toLocaleString() : '—'}</span>
          </div>
          <div>
            <span className="text-slate-500 text-xs block">List Price</span>
            <span className="font-medium text-slate-900">{fmt(deal.listPrice)}</span>
          </div>
          <div>
            <span className="text-slate-500 text-xs block">Purchase Price</span>
            <span className="font-medium text-green-700">{fmt(deal.purchasePrice)}</span>
          </div>
          <div>
            <span className="text-slate-500 text-xs block">ARV</span>
            <span className="font-medium text-blue-700">{fmt(deal.arv)}</span>
          </div>
          <div>
            <span className="text-slate-500 text-xs block">Rehab Estimate</span>
            <span className="font-medium text-orange-700">{fmt(deal.rehabEstimate)}</span>
          </div>
        </div>
      )}

      {liens.length > 0 && (
        <div className="space-y-1">
          <h4 className="text-xs font-medium text-slate-700">Liens & Encumbrances ({liens.length})</h4>
          <div className="divide-y divide-slate-100">
            {liens.map((lien, i) => (
              <div key={String(lien.id) || i} className="py-1.5 grid grid-cols-2 md:grid-cols-5 gap-2 text-xs">
                <div>
                  <span className="text-xs text-slate-500 block">{String(lien.lienType || 'Lien')}</span>
                  <span className="font-medium text-slate-900">{String(lien.lienHolder || 'Unknown')}</span>
                </div>
                <div>
                  <span className="text-xs text-slate-500 block">Balance</span>
                  <span className="font-medium text-slate-900">{fmt(lien.balance)}</span>
                </div>
                <div>
                  <span className="text-xs text-slate-500 block">Monthly</span>
                  <span className="font-medium text-slate-900">{fmt(lien.monthlyPayment)}</span>
                </div>
                <div>
                  <span className="text-xs text-slate-500 block">Rate</span>
                  <span className="font-medium text-slate-900">{lien.interestRate != null ? `${lien.interestRate}%` : '—'}</span>
                </div>
                <div>
                  <span className="text-xs text-slate-500 block">Status</span>
                  <span className={`font-medium ${lien.status === 'delinquent' ? 'text-red-600' : lien.status === 'current' ? 'text-green-600' : 'text-slate-900'}`}>
                    {String(lien.status || '—')}{lien.monthsBehind ? ` (${lien.monthsBehind}mo behind)` : ''}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

// ── Recipient Type Config ────────────────────────────────────────────
const RECIPIENT_CONFIG: Record<string, { label: string; icon: typeof User; color: string; bg: string }> = {
  ceo: { label: 'CEO', icon: User, color: 'text-blue-700', bg: 'bg-blue-50' },
  general_counsel: { label: 'General Counsel', icon: Scale, color: 'text-purple-700', bg: 'bg-purple-50' },
  registered_agent: { label: 'Registered Agent', icon: Building2, color: 'text-amber-700', bg: 'bg-amber-50' },
  respa_address: { label: 'RESPA Address', icon: MapPin, color: 'text-green-700', bg: 'bg-green-50' },
}

function ConfidenceDot({ level }: { level?: string }) {
  const color = level === 'high' ? 'bg-green-500' : level === 'medium' ? 'bg-yellow-500' : 'bg-red-500'
  return (
    <span className="flex items-center gap-1.5 text-xs text-slate-500">
      <span className={`w-2 h-2 rounded-full ${color}`} />
      {level || 'unknown'}
    </span>
  )
}

function RecipientCard({ recipient }: { recipient: NegotiationRecipient }) {
  const config = RECIPIENT_CONFIG[recipient.recipientType] || RECIPIENT_CONFIG.ceo
  const Icon = config.icon
  const fullAddress = [recipient.mailingAddress, recipient.mailingCity, recipient.mailingState, recipient.mailingZip]
    .filter(Boolean).join(', ')

  return (
    <div className={`${config.bg} border border-slate-200 rounded-lg p-4 space-y-2`}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Icon className={`w-4 h-4 ${config.color}`} />
          <span className={`text-sm font-semibold ${config.color}`}>{config.label}</span>
        </div>
        <ConfidenceDot level={recipient.confidence} />
      </div>

      {recipient.name && (
        <p className="text-sm font-medium text-slate-900">{recipient.name}</p>
      )}
      {recipient.title && (
        <p className="text-xs text-slate-500">{recipient.title}</p>
      )}

      {fullAddress && (
        <p className="text-xs text-slate-600">{fullAddress}</p>
      )}

      <div className="flex flex-wrap gap-x-4 gap-y-1 pt-1">
        {recipient.phone && (
          <span className="flex items-center gap-1 text-xs text-slate-600">
            <Phone className="w-3 h-3" /> {recipient.phone}
          </span>
        )}
        {recipient.fax && (
          <span className="flex items-center gap-1 text-xs text-slate-600">
            <File className="w-3 h-3" /> Fax: {recipient.fax}
          </span>
        )}
        {recipient.email && (
          <span className="flex items-center gap-1 text-xs text-slate-600">
            <Mail className="w-3 h-3" /> {recipient.email}
          </span>
        )}
      </div>
    </div>
  )
}

function ResearchResults({
  recipients,
  onRerunResearch,
  loading,
  caseStatus,
}: {
  recipients: NegotiationRecipient[]
  onRerunResearch: () => void
  loading: boolean
  caseStatus?: string
}) {
  // Filter out empty recipients (all null fields = failed parse)
  const validRecipients = recipients.filter(
    r => r.name || r.mailingAddress || r.phone || r.email
  )

  // Show section if: we have results, research is loading, or case was researched but got nothing
  const showSection = validRecipients.length > 0 || loading || caseStatus === 'researching'
  if (!showSection && recipients.length === 0) return null

  return (
    <div className="bg-white rounded-lg border border-slate-200 p-4 space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold text-slate-900 text-sm">Address Cards</h3>
        <button
          onClick={onRerunResearch}
          disabled={loading}
          className="flex items-center gap-1.5 text-xs text-purple-600 hover:text-purple-800 transition"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          {loading ? 'Researching...' : 'Re-run'}
        </button>
      </div>

      {loading && validRecipients.length === 0 && (
        <div className="text-center py-4">
          <Zap className="w-5 h-5 text-purple-400 mx-auto mb-2 animate-pulse" />
          <p className="text-xs text-slate-500">AI is researching contacts...</p>
        </div>
      )}

      {!loading && recipients.length > 0 && validRecipients.length === 0 && (
        <div className="text-center py-4">
          <AlertCircle className="w-5 h-5 text-orange-400 mx-auto mb-2" />
          <p className="text-xs text-slate-600">Research ran but returned no usable contacts.</p>
          <p className="text-xs text-slate-500 mt-1">Check that an AI provider key is configured in Admin → AI Provider Settings, then click Re-run.</p>
        </div>
      )}

      {validRecipients.length > 0 && (
        <div className="grid grid-cols-1 gap-3">
          {validRecipients.map((r) => (
            <RecipientCard key={r.id} recipient={r} />
          ))}
        </div>
      )}
    </div>
  )
}

/* ── Case Files Section ───────────────────────────────────────────── */

function CaseFilesSection({
  caseId,
  files,
  onRefresh,
}: {
  caseId: string
  files: CaseFile[]
  onRefresh: () => void
}) {
  const [viewingFile, setViewingFile] = useState<{
    id: string; fileName: string; mimeType?: string; fileContent: string
  } | null>(null)
  const [loadingFile, setLoadingFile] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [showUploadForm, setShowUploadForm] = useState(false)
  const [uploadCategory, setUploadCategory] = useState('other')
  const [uploadNotes, setUploadNotes] = useState('')
  const [activeFolder, setActiveFolder] = useState<'all' | 'negotiations' | 'documents' | 'photos'>('all')
  const fileInputRef = useRef<HTMLInputElement>(null)

  const negotiationCategories = ['authorization', 'correspondence', 'legal', 'other']
  const negotiationFiles = files.filter(f => f.adminOnly || negotiationCategories.includes(f.category))
  const docFiles = files.filter(f => f.fileType === 'document' && !f.adminOnly)
  const photoFiles = files.filter(f => f.fileType === 'photo')

  const filteredFiles = activeFolder === 'all' ? files
    : activeFolder === 'negotiations' ? negotiationFiles
    : activeFolder === 'documents' ? docFiles
    : photoFiles

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const selectedFile = e.target.files?.[0]
    if (!selectedFile) return

    setUploading(true)
    try {
      await uploadCaseFile(caseId, selectedFile, uploadCategory, uploadNotes || undefined)
      toast.success(`Uploaded: ${selectedFile.name}`)
      setShowUploadForm(false)
      setUploadCategory('other')
      setUploadNotes('')
      onRefresh()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Upload failed')
    } finally {
      setUploading(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  async function handleViewFile(fileId: string) {
    setLoadingFile(true)
    try {
      const data = await getCaseFile(caseId, fileId)
      setViewingFile(data)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to load file')
    } finally {
      setLoadingFile(false)
    }
  }

  function handleDownload() {
    if (!viewingFile) return
    const link = document.createElement('a')
    link.href = `data:${viewingFile.mimeType || 'application/octet-stream'};base64,${viewingFile.fileContent}`
    link.download = viewingFile.fileName
    link.click()
  }

  const categoryLabel = (cat: string) =>
    cat.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())

  const fileIcon = (mime?: string) => {
    if (mime?.includes('pdf')) return '📄'
    if (mime?.includes('image')) return '🖼️'
    if (mime?.includes('word') || mime?.includes('docx')) return '📝'
    return '📎'
  }

  const uploadFormBlock = (
    <>
      {showUploadForm && (
        <div className="bg-slate-50 rounded-lg border border-slate-200 p-4 space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Category</label>
              <select
                value={uploadCategory}
                onChange={(e) => setUploadCategory(e.target.value)}
                className="w-full px-2 py-1.5 border border-slate-300 rounded text-sm bg-white"
              >
                <option value="other">Other</option>
                <option value="contract">Contract</option>
                <option value="title">Title</option>
                <option value="inspection">Inspection</option>
                <option value="appraisal">Appraisal</option>
                <option value="insurance">Insurance</option>
                <option value="disclosure">Disclosure</option>
                <option value="authorization">Authorization to Release</option>
                <option value="correspondence">Correspondence</option>
                <option value="legal">Legal</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Notes (optional)</label>
              <input
                type="text"
                value={uploadNotes}
                onChange={(e) => setUploadNotes(e.target.value)}
                placeholder="Brief description..."
                className="w-full px-2 py-1.5 border border-slate-300 rounded text-sm"
              />
            </div>
          </div>
          <div className="flex items-center gap-2">
            <label className="flex-1 flex items-center justify-center gap-2 px-3 py-2 bg-blue-600 text-white text-sm rounded-lg cursor-pointer hover:bg-blue-700 transition">
              <Upload className="w-4 h-4" />
              {uploading ? 'Uploading...' : 'Choose File'}
              <input
                ref={fileInputRef}
                type="file"
                className="hidden"
                onChange={handleUpload}
                disabled={uploading}
              />
            </label>
            <button
              onClick={() => setShowUploadForm(false)}
              className="px-3 py-2 border border-slate-300 rounded-lg text-sm text-slate-700 hover:bg-slate-100"
            >
              Cancel
            </button>
          </div>
          <p className="text-xs text-slate-500">Files uploaded here are hidden from the subscriber (admin only).</p>
        </div>
      )}
    </>
  )

  if (files.length === 0) {
    return (
      <div className="bg-white rounded-lg border border-slate-200 p-5">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-semibold text-slate-900 flex items-center gap-2">
            <FolderOpen className="w-4 h-4" /> Case Files
          </h3>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowUploadForm(!showUploadForm)}
              className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-800 transition"
            >
              <Upload className="w-3.5 h-3.5" /> Upload
            </button>
            <button onClick={onRefresh} className="text-xs text-slate-500 hover:text-slate-700">
              <RefreshCw className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
        {uploadFormBlock}
        {!showUploadForm && <p className="text-slate-500 text-sm text-center py-4">No files uploaded for this deal yet</p>}
      </div>
    )
  }

  return (
    <div className="bg-white rounded-lg border border-slate-200 p-5 space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold text-slate-900 flex items-center gap-2">
          <FolderOpen className="w-4 h-4" /> Case Files ({files.length})
        </h3>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowUploadForm(!showUploadForm)}
            className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-800 transition"
          >
            <Upload className="w-3.5 h-3.5" /> Upload
          </button>
          <button onClick={onRefresh} className="text-xs text-slate-500 hover:text-slate-700">
            <RefreshCw className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Folder Tabs */}
      <div className="flex flex-wrap gap-1.5">
        {([
          { key: 'all', label: 'All', count: files.length },
          { key: 'negotiations', label: 'Negotiations', count: negotiationFiles.length },
          { key: 'documents', label: 'Documents', count: docFiles.length },
          { key: 'photos', label: 'Photos', count: photoFiles.length },
        ] as const).map(tab => (
          <button
            key={tab.key}
            onClick={() => setActiveFolder(tab.key)}
            className={`px-3 py-1 text-xs font-medium rounded-full transition-all ${
              activeFolder === tab.key
                ? 'bg-blue-100 text-blue-700 ring-1 ring-blue-400'
                : 'bg-slate-50 text-slate-500 hover:bg-slate-100'
            }`}
          >
            {tab.label} ({tab.count})
          </button>
        ))}
      </div>

      {uploadFormBlock}

      {/* File List */}
      {filteredFiles.length === 0 ? (
        <p className="text-slate-500 text-sm text-center py-4">No files in this folder</p>
      ) : (
        <div className="space-y-1">
          {filteredFiles.map(f => (
            <div key={f.id} className="flex items-center justify-between py-2 px-3 rounded hover:bg-slate-50 group">
              <div className="flex items-center gap-2 min-w-0">
                <span className="text-sm">{fileIcon(f.mimeType)}</span>
                <div className="min-w-0">
                  <p className="text-sm font-medium text-slate-900 truncate">
                    {f.fileName}
                    {f.adminOnly && <span className="ml-1.5 text-[10px] text-orange-600 font-medium bg-orange-50 px-1.5 py-0.5 rounded">Admin Only</span>}
                  </p>
                  <p className="text-xs text-slate-500">{categoryLabel(f.category)}{f.fileSize ? ` · ${(f.fileSize / 1024).toFixed(0)}KB` : ''}</p>
                </div>
              </div>
              <button
                onClick={() => handleViewFile(f.id)}
                disabled={loadingFile}
                className="opacity-0 group-hover:opacity-100 flex items-center gap-1 text-xs text-blue-600 hover:text-blue-800 transition px-2 py-1 rounded hover:bg-blue-50"
              >
                <Eye className="w-3 h-3" /> View
              </button>
            </div>
          ))}
        </div>
      )}

      {/* File Viewer Modal */}
      {viewingFile && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={() => setViewingFile(null)}>
          <div className="bg-white rounded-lg shadow-xl max-w-3xl w-full max-h-[85vh] flex flex-col" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between p-4 border-b border-slate-200">
              <h4 className="font-semibold text-slate-900 truncate">{viewingFile.fileName}</h4>
              <div className="flex items-center gap-2">
                <button
                  onClick={handleDownload}
                  className="flex items-center gap-1 text-sm text-blue-600 hover:text-blue-800 px-3 py-1.5 rounded hover:bg-blue-50"
                >
                  <Download className="w-4 h-4" /> Download
                </button>
                <button onClick={() => setViewingFile(null)} className="text-slate-400 hover:text-slate-600 text-xl px-2">×</button>
              </div>
            </div>
            <div className="flex-1 overflow-auto p-4">
              {viewingFile.mimeType?.includes('image') ? (
                <img
                  src={`data:${viewingFile.mimeType};base64,${viewingFile.fileContent}`}
                  alt={viewingFile.fileName}
                  className="max-w-full h-auto mx-auto"
                />
              ) : viewingFile.mimeType?.includes('pdf') ? (
                <iframe
                  src={`data:application/pdf;base64,${viewingFile.fileContent}`}
                  className="w-full h-[70vh]"
                  title={viewingFile.fileName}
                />
              ) : (
                <div className="text-center py-12 text-slate-500">
                  <FileText className="w-12 h-12 mx-auto mb-3 text-slate-300" />
                  <p>Preview not available for this file type.</p>
                  <button onClick={handleDownload} className="mt-3 text-blue-600 hover:text-blue-800 text-sm">
                    Download to view
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function QuickActions({
  caseItem,
  onStatusChange,
  onPriorityChange,
  onStartResearch,
  onTestResearch,
}: {
  caseItem: NegotiationCase
  onStatusChange: (status: string) => Promise<void>
  onPriorityChange: (priority: string) => Promise<void>
  onStartResearch: () => Promise<void>
  onTestResearch: () => Promise<void>
}) {
  const [loading, setLoading] = useState(false)

  async function handleStatusChange(status: string) {
    setLoading(true)
    try {
      await onStatusChange(status)
      toast.success('Status updated')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to update status')
    } finally {
      setLoading(false)
    }
  }

  async function handlePriorityChange(priority: string) {
    setLoading(true)
    try {
      await onPriorityChange(priority)
      toast.success('Priority updated')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to update priority')
    } finally {
      setLoading(false)
    }
  }

  async function handleResearch() {
    setLoading(true)
    try {
      await onStartResearch()
      toast.success('AI research started')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to start research')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="bg-white rounded-lg border border-slate-200 p-5 space-y-5">
      <h3 className="font-semibold text-slate-900">Quick Actions</h3>

      {/* Priority Selector */}
      <div>
        <label className="block text-sm font-medium text-slate-700 mb-2">Priority</label>
        <div className="flex flex-wrap gap-1.5">
          {(['low', 'normal', 'high', 'urgent'] as const).map((p) => (
            <button
              key={p}
              onClick={() => handlePriorityChange(p)}
              disabled={loading}
              className={`px-3 py-1.5 text-xs font-medium rounded-full transition-all whitespace-nowrap ${
                caseItem.priority === p
                  ? `${getPriorityBadgeColor(p)} ring-2 ring-offset-1 ring-current`
                  : 'bg-slate-50 text-slate-500 hover:bg-slate-100 hover:text-slate-700'
              }`}
            >
              {p.charAt(0).toUpperCase() + p.slice(1)}
            </button>
          ))}
        </div>
      </div>

      {/* Status Buttons */}
      <div>
        <label className="block text-sm font-medium text-slate-700 mb-2">Status</label>
        <div className="flex flex-wrap gap-1.5">
          {(['intake', 'researching', 'in_progress', 'awaiting_response', 'resolved', 'closed'] as const).map((s) => (
            <button
              key={s}
              onClick={() => handleStatusChange(s)}
              disabled={loading}
              className={`px-3 py-1.5 text-xs font-medium rounded-full transition-all whitespace-nowrap ${
                caseItem.status === s
                  ? `${getStatusBadgeColor(s)} ring-2 ring-offset-1 ring-current`
                  : 'bg-slate-50 text-slate-500 hover:bg-slate-100 hover:text-slate-700'
              }`}
            >
              {s.replace('_', ' ').charAt(0).toUpperCase() + s.replace('_', ' ').slice(1)}
            </button>
          ))}
        </div>
      </div>

      {/* Research Buttons */}
      <div className="space-y-2">
        <button
          onClick={handleResearch}
          disabled={loading}
          className="w-full px-4 py-2.5 bg-purple-600 text-white rounded-lg font-medium hover:bg-purple-700 transition flex items-center justify-center gap-2 disabled:opacity-50"
        >
          <Zap className="w-4 h-4" />
          Start AI Research
        </button>
        <button
          onClick={async () => { setLoading(true); try { await onTestResearch() } finally { setLoading(false) } }}
          disabled={loading}
          className="w-full px-3 py-1.5 bg-slate-100 text-slate-600 rounded-lg text-xs font-medium hover:bg-slate-200 transition flex items-center justify-center gap-1.5 disabled:opacity-50"
        >
          🔍 Test Research (Diagnostic)
        </button>
      </div>
    </div>
  )
}

/* ── Main Workspace Component ────────────────────────────────────── */

export default function AdminCaseWorkspace({
  caseId,
  onBack,
}: {
  caseId: string
  onBack: () => void
}) {
  const [caseData, setCaseData] = useState<NegotiationCase | null>(null)
  const [activities, setActivities] = useState<NegotiationActivity[]>([])
  const [messages, setMessages] = useState<NegotiationMessage[]>([])
  const [recipients, setRecipients] = useState<NegotiationRecipient[]>([])
  const [caseFiles, setCaseFiles] = useState<CaseFile[]>([])
  const [dealInfo, setDealInfo] = useState<Record<string, unknown> | null>(null)
  const [liensInfo, setLiensInfo] = useState<Record<string, unknown>[]>([])
  const [unreadMessages, setUnreadMessages] = useState(0)
  const [loading, setLoading] = useState(true)
  const [researchLoading, setResearchLoading] = useState(false)
  const [currentUserId] = useState(1) // Placeholder - would come from auth context

  // Load case data
  useEffect(() => {
    async function loadCaseData() {
      try {
        const data = await getCase(caseId)
        setCaseData(data.case)
        setActivities(data.activities)
        setUnreadMessages(data.unreadMessages)
        if (data.deal) setDealInfo(data.deal)
        if (data.liens) setLiensInfo(data.liens)

        const msgs = await listMessages(caseId)
        setMessages(msgs)

        // Recipients are optional (only exist after AI research has been run)
        try {
          const recs = await listRecipients(caseId)
          setRecipients(recs)
        } catch {
          // Silently ignore — no recipients yet is normal
        }

        // Case files are optional
        try {
          const cf = await listCaseFiles(caseId)
          setCaseFiles(cf)
        } catch {
          // Silently ignore — files endpoint may not exist yet
        }
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Failed to load case')
      } finally {
        setLoading(false)
      }
    }

    loadCaseData()
  }, [caseId])

  if (loading || !caseData) {
    return (
      <div className="text-center py-12">
        <Clock className="w-8 h-8 text-slate-400 mx-auto mb-2 animate-spin" />
        <p className="text-slate-600">Loading case...</p>
      </div>
    )
  }

  async function handleStatusChange(status: string) {
    try {
      const updated = await updateCase(caseId, { status })
      setCaseData(updated)
    } catch (err) {
      throw err
    }
  }

  async function handlePriorityChange(priority: string) {
    try {
      const updated = await updateCase(caseId, { priority })
      setCaseData(updated)
    } catch (err) {
      throw err
    }
  }

  async function handleAddActivity(activity: Omit<NegotiationActivity, 'id' | 'createdBy' | 'createdAt'>) {
    try {
      const newActivity = await createActivity(caseId, {
        activityType: activity.activityType,
        adminNote: activity.adminNote || '',
        sendMethod: activity.sendMethod,
        uspsTrackingNumber: activity.uspsTrackingNumber,
        uspsSignatureTrackingNumber: activity.uspsSignatureTrackingNumber,
      })
      setActivities([...activities, newActivity])
    } catch (err) {
      throw err
    }
  }

  async function handleSendMessage(content: string) {
    try {
      const newMessage = await sendMessage(caseId, content)
      setMessages([...messages, newMessage])
    } catch (err) {
      throw err
    }
  }

  async function handleCheckTracking(activityId: string) {
    try {
      const result = await checkTrackingNow(activityId)
      // Update the activity in our local state
      setActivities(prev =>
        prev.map(a => a.id === activityId ? result.activity : a)
      )
      if (result.trackingDetail.error) {
        toast.error(`Tracking: ${result.trackingDetail.error}`)
      } else {
        toast.success(`Tracking status: ${result.trackingDetail.status || 'checked'}`)
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to check tracking')
    }
  }

  async function handleRefreshFiles() {
    try {
      const cf = await listCaseFiles(caseId)
      setCaseFiles(cf)
    } catch {
      // ignore
    }
  }

  async function handleTestResearch() {
    try {
      toast.info('Running diagnostic research test...')
      const result = await testResearch(caseId)
      if (result.status === 'error') {
        toast.error(`Research test failed: ${result.error}`)
      } else if (result.has_real_data) {
        toast.success(`Research test OK! Found data for CEO. Provider credentials working.`)
      } else {
        toast.error(`Research returned no data. Parse error: ${result.parse_error}. Check AI Provider Settings.`)
      }
      // Log full result to console for debugging
      console.log('Research diagnostic result:', JSON.stringify(result, null, 2))
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Unknown error'
      toast.error(`Diagnostic failed: ${msg}`)
    }
  }

  async function handleStartResearch() {
    try {
      setResearchLoading(true)
      toast.info('Running AI research — this may take 30-60 seconds...')

      // Research now runs synchronously — the server does all the work and returns results
      const result = await triggerResearch(caseId)
      const validCount = (result as Record<string, unknown>)?.valid_count ?? 0

      // Reload all data now that research is complete
      const recs = await listRecipients(caseId)
      setRecipients(recs)

      const data = await getCase(caseId)
      setCaseData(data.case)
      setActivities(data.activities)
      if (data.deal) setDealInfo(data.deal)
      if (data.liens) setLiensInfo(data.liens)

      if (validCount > 0) {
        toast.success(`Research complete — found ${validCount} of 4 contacts`)
      } else {
        toast.warning('Research completed but could not find contact data. Check the activity journal for details.')
      }
    } catch (err) {
      // Reload case data to see error activity
      try {
        const data = await getCase(caseId)
        setCaseData(data.case)
        setActivities(data.activities)
      } catch { /* ignore */ }
      toast.error(err instanceof Error ? err.message : 'Research failed')
    } finally {
      setResearchLoading(false)
    }
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-4">
          <button
            onClick={onBack}
            className="p-2 hover:bg-slate-100 rounded-lg transition"
          >
            <ArrowLeft className="w-5 h-5 text-slate-600" />
          </button>
          <div>
            <h1 className="text-2xl font-bold text-slate-900">
              {caseData.propertyAddress || 'Unknown Address'}
            </h1>
            <div className="flex items-center gap-3 mt-2">
              <ServiceTypeBadge serviceType={caseData.serviceType} />
              <span className={`inline-block text-xs font-medium px-2.5 py-0.5 rounded ${getStatusBadgeColor(caseData.status)}`}>
                {caseData.status.replace('_', ' ')}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Property & Lien Details + Quick Actions — side by side */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2">
          <PropertyInfoCard deal={dealInfo} liens={liensInfo} />
        </div>
        <div>
          <QuickActions
            caseItem={caseData}
            onStatusChange={handleStatusChange}
            onPriorityChange={handlePriorityChange}
            onStartResearch={handleStartResearch}
            onTestResearch={handleTestResearch}
          />
        </div>
      </div>

      {/* Main Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Left Column — Activity Journal + Case Files */}
        <div className="lg:col-span-2 space-y-4">
          {/* Activity Journal */}
          <ActivityJournal
            activities={activities}
            onAddActivity={handleAddActivity}
            onCheckTracking={handleCheckTracking}
          />

          {/* Case Files */}
          <CaseFilesSection
            caseId={caseId}
            files={caseFiles}
            onRefresh={handleRefreshFiles}
          />
        </div>

        {/* Right Column — Messages + Address Cards */}
        <div className="space-y-4">
          {/* Chat Thread */}
          <ChatThread
            messages={messages}
            unreadCount={unreadMessages}
            userId={currentUserId}
            onSendMessage={handleSendMessage}
          />

          {/* Research Results (address cards) */}
          <ResearchResults
            recipients={recipients}
            onRerunResearch={handleStartResearch}
            loading={researchLoading}
            caseStatus={caseData.status}
          />
        </div>
      </div>
    </div>
  )
}
