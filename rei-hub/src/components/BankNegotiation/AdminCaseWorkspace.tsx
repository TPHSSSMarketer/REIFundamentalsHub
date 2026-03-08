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
} from '@/services/negotiationApi'

/* ── Helpers ─────────────────────────────────────────────────────── */

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  })
}

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
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

function ActivityJournal({
  activities,
  onAddActivity,
}: {
  activities: NegotiationActivity[]
  onAddActivity: (activity: Omit<NegotiationActivity, 'id' | 'createdBy' | 'createdAt'>) => Promise<void>
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
                  <p>
                    <span className="font-medium text-slate-700">Send Method:</span> {activity.sendMethod}
                  </p>
                  {activity.uspsTrackingNumber && (
                    <p>
                      <span className="font-medium text-slate-700">Tracking:</span> {activity.uspsTrackingNumber}
                    </p>
                  )}
                  {activity.uspsSignatureTrackingNumber && (
                    <p>
                      <span className="font-medium text-slate-700">Signature Tracking:</span>{' '}
                      {activity.uspsSignatureTrackingNumber}
                    </p>
                  )}
                  {activity.trackingStatus && (
                    <p>
                      <span className="font-medium text-slate-700">Status:</span> {activity.trackingStatus}
                    </p>
                  )}
                  {activity.uspsDeliveredDate && (
                    <p>
                      <span className="font-medium text-slate-700">Delivered:</span> {activity.uspsDeliveredDate}
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
}: {
  recipients: NegotiationRecipient[]
  onRerunResearch: () => void
  loading: boolean
}) {
  if (recipients.length === 0) return null

  return (
    <div className="bg-white rounded-lg border border-slate-200 p-5 space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold text-slate-900">Research Results</h3>
        <button
          onClick={onRerunResearch}
          disabled={loading}
          className="flex items-center gap-1.5 text-xs text-purple-600 hover:text-purple-800 transition"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          Re-run Research
        </button>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {recipients.map((r) => (
          <RecipientCard key={r.id} recipient={r} />
        ))}
      </div>
    </div>
  )
}

function QuickActions({
  caseItem,
  onStatusChange,
  onPriorityChange,
  onStartResearch,
}: {
  caseItem: NegotiationCase
  onStatusChange: (status: string) => Promise<void>
  onPriorityChange: (priority: string) => Promise<void>
  onStartResearch: () => Promise<void>
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

      {/* Research Button */}
      <button
        onClick={handleResearch}
        disabled={loading}
        className="w-full px-4 py-2.5 bg-purple-600 text-white rounded-lg font-medium hover:bg-purple-700 transition flex items-center justify-center gap-2 disabled:opacity-50"
      >
        <Zap className="w-4 h-4" />
        Start AI Research
      </button>
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

        const [msgs, recs] = await Promise.all([
          listMessages(caseId),
          listRecipients(caseId),
        ])
        setMessages(msgs)
        setRecipients(recs)
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

  async function handleStartResearch() {
    try {
      setResearchLoading(true)
      await triggerResearch(caseId)
      // Poll for research results (background task takes a few seconds)
      setTimeout(async () => {
        try {
          const recs = await listRecipients(caseId)
          setRecipients(recs)
          // Reload case data to get updated status + activity
          const data = await getCase(caseId)
          setCaseData(data.case)
          setActivities(data.activities)
        } catch { /* will be picked up on next manual refresh */ }
        setResearchLoading(false)
      }, 15000) // Check after 15 seconds
    } catch (err) {
      setResearchLoading(false)
      throw err
    }
  }

  return (
    <div className="space-y-6">
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

      {/* Research Results */}
      <ResearchResults
        recipients={recipients}
        onRerunResearch={handleStartResearch}
        loading={researchLoading}
      />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main Content */}
        <div className="lg:col-span-2 space-y-6">
          {/* Activity Journal */}
          <ActivityJournal
            activities={activities}
            onAddActivity={handleAddActivity}
          />

          {/* Chat Thread */}
          <ChatThread
            messages={messages}
            unreadCount={unreadMessages}
            userId={currentUserId}
            onSendMessage={handleSendMessage}
          />
        </div>

        {/* Sidebar */}
        <div>
          <QuickActions
            caseItem={caseData}
            onStatusChange={handleStatusChange}
            onPriorityChange={handlePriorityChange}
            onStartResearch={handleStartResearch}
          />
        </div>
      </div>
    </div>
  )
}
