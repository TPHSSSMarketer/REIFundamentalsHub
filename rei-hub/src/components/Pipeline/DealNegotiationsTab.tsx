import { useState, useEffect, useRef, useCallback } from 'react'
import {
  Mail,
  Phone,
  FileText,
  MessageSquare,
  ChevronDown,
  ChevronUp,
  Send,
  AlertCircle,
  CheckCircle2,
  Clock,
  AlertTriangle,
  Loader2,
} from 'lucide-react'
import { toast } from 'sonner'
import { formatDate } from '@/utils/helpers'
import type {
  NegotiationRequest,
  NegotiationCase,
  NegotiationActivity,
  NegotiationMessage,
} from '@/types'
import {
  listNegotiationRequests,
  listCases,
  listActivities,
  listMessages,
  sendMessage,
  markMessageRead,
  respondToInfoRequest,
} from '@/services/negotiationApi'

interface DealNegotiationsTabProps {
  dealId: string
}

// ── Status Banner ────────────────────────────────────────────────────────

function RequestStatusBanner({ status }: { status: string }) {
  let bgColor = 'bg-slate-100'
  let textColor = 'text-slate-700'
  let borderColor = 'border-slate-200'
  let icon = AlertCircle
  let message = 'Unknown status'

  if (status === 'pending') {
    bgColor = 'bg-yellow-50'
    textColor = 'text-yellow-700'
    borderColor = 'border-yellow-200'
    icon = Clock
    message = 'Your negotiation request is pending review'
  } else if (status === 'info_requested') {
    bgColor = 'bg-blue-50'
    textColor = 'text-blue-700'
    borderColor = 'border-blue-200'
    icon = AlertCircle
    message = 'The negotiator needs more information from you — please respond below'
  } else if (status === 'accepted') {
    bgColor = 'bg-green-50'
    textColor = 'text-green-700'
    borderColor = 'border-green-200'
    icon = CheckCircle2
    message = 'Request accepted — cases are active'
  } else if (status === 'declined') {
    bgColor = 'bg-red-50'
    textColor = 'text-red-700'
    borderColor = 'border-red-200'
    icon = AlertTriangle
    message = 'Request was declined'
  }

  const Icon = icon
  return (
    <div className={`${bgColor} border ${borderColor} rounded-lg p-4 flex items-center gap-3`}>
      <Icon className={`w-5 h-5 ${textColor} flex-shrink-0`} />
      <p className={`text-sm font-medium ${textColor}`}>{message}</p>
    </div>
  )
}

// ── Request Details Card ─────────────────────────────────────────────────

function RequestDetailsCard({ request }: { request: NegotiationRequest }) {
  return (
    <div className="bg-white border border-slate-200 rounded-lg p-5 space-y-4">
      <h4 className="text-sm font-semibold text-slate-900">Request Details</h4>

      <div className="grid grid-cols-2 gap-4 text-sm">
        <div>
          <span className="text-slate-500">Property:</span>
          <p className="font-medium text-slate-900">
            {request.propertyAddress || 'N/A'}
            {request.propertyCity && `, ${request.propertyCity}`}
            {request.propertyState && `, ${request.propertyState}`}
          </p>
        </div>
        <div>
          <span className="text-slate-500">Submitted:</span>
          <p className="font-medium text-slate-900">{formatDate(request.createdAt)}</p>
        </div>
      </div>

      {/* Service Types */}
      <div>
        <span className="text-sm text-slate-500">Service Types:</span>
        <div className="flex flex-wrap gap-2 mt-1">
          {request.serviceTypes?.map((type) => {
            const label =
              type === 'bank' || type.toLowerCase().includes('mortgage')
                ? 'Bank/Mortgage'
                : type === 'county_tax' || type.toLowerCase().includes('tax')
                  ? 'County Tax'
                  : type
            const colors =
              type === 'bank' || type.toLowerCase().includes('mortgage')
                ? 'bg-blue-100 text-blue-700'
                : type === 'county_tax' || type.toLowerCase().includes('tax')
                  ? 'bg-green-100 text-green-700'
                  : 'bg-amber-100 text-amber-700'
            return (
              <span
                key={type}
                className={`inline-block px-2.5 py-1 text-xs font-semibold rounded ${colors}`}
              >
                {label}
              </span>
            )
          })}
        </div>
      </div>

      {/* Liens count */}
      {request.lienIds && request.lienIds.length > 0 && (
        <div className="text-sm">
          <span className="text-slate-500">Liens submitted:</span>{' '}
          <span className="font-medium text-slate-900">{request.lienIds.length}</span>
        </div>
      )}

      {/* Message history */}
      {request.message && (
        <div className="bg-slate-50 rounded-lg p-3">
          <span className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Message History</span>
          <p className="text-sm text-slate-700 mt-1 whitespace-pre-wrap">{request.message}</p>
        </div>
      )}
    </div>
  )
}

// ── Info Response Form ──────────────────────────────────────────────────

function InfoResponseForm({
  requestId,
  onResponseSent,
}: {
  requestId: string
  onResponseSent: (updated: NegotiationRequest) => void
}) {
  const [response, setResponse] = useState('')
  const [sending, setSending] = useState(false)

  async function handleSubmit() {
    if (!response.trim()) {
      toast.error('Please enter your response')
      return
    }
    setSending(true)
    try {
      const updated = await respondToInfoRequest(requestId, response)
      toast.success('Response sent — your request is back under review')
      setResponse('')
      onResponseSent(updated)
    } catch (err: any) {
      toast.error(err.message || 'Failed to send response')
    } finally {
      setSending(false)
    }
  }

  return (
    <div className="bg-blue-50 border border-blue-200 rounded-lg p-5 space-y-3">
      <div className="flex items-center gap-2">
        <AlertCircle className="w-5 h-5 text-blue-600" />
        <h4 className="text-sm font-semibold text-blue-900">Respond to Information Request</h4>
      </div>
      <p className="text-sm text-blue-700">
        The negotiator needs additional information before proceeding. Please provide the
        requested details below.
      </p>
      <textarea
        value={response}
        onChange={(e) => setResponse(e.target.value)}
        placeholder="Type your response here..."
        rows={4}
        className="w-full px-3 py-2 text-sm border border-blue-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
      />
      <div className="flex justify-end">
        <button
          onClick={handleSubmit}
          disabled={sending || !response.trim()}
          className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-2"
        >
          {sending ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <Send className="w-4 h-4" />
          )}
          Send Response
        </button>
      </div>
    </div>
  )
}

// ── Case Status Stepper ──────────────────────────────────────────────────

const CASE_STEPS = ['Intake', 'Researching', 'In Progress', 'Awaiting Response', 'Resolved']

function getCaseStepIndex(status: string): number {
  const mapping: Record<string, number> = {
    intake: 0,
    researching: 1,
    in_progress: 2,
    awaiting_response: 3,
    resolved: 4,
    closed: 4,
  }
  return mapping[status] ?? 0
}

function CaseStepper({ status }: { status: string }) {
  const currentStepIndex = getCaseStepIndex(status)

  return (
    <div className="mb-6">
      <div className="flex items-center justify-between">
        {CASE_STEPS.map((step, index) => (
          <div key={step} className="flex flex-col items-center flex-1">
            <div
              className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-semibold transition-colors ${
                index <= currentStepIndex
                  ? 'bg-primary-500 text-white'
                  : 'bg-slate-200 text-slate-600'
              }`}
            >
              {index < currentStepIndex ? (
                <CheckCircle2 className="w-5 h-5" />
              ) : (
                <span>{index + 1}</span>
              )}
            </div>
            <span className="text-xs font-medium text-slate-600 mt-1 text-center">
              {step}
            </span>
            {index < CASE_STEPS.length - 1 && (
              <div
                className={`w-full h-0.5 mt-2 transition-colors ${
                  index < currentStepIndex ? 'bg-primary-500' : 'bg-slate-200'
                }`}
                style={{ width: 'calc(100% - 20px)', marginLeft: '10px' }}
              />
            )}
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Service Type Badge ───────────────────────────────────────────────────

function ServiceTypeBadge({ serviceType }: { serviceType: string }) {
  const type = serviceType.toLowerCase()
  let bg = 'bg-amber-100'
  let text = 'text-amber-700'
  let label = 'Other Lien'

  if (type === 'bank' || type.includes('mortgage')) {
    bg = 'bg-blue-100'
    text = 'text-blue-700'
    label = 'Bank/Mortgage'
  } else if (type === 'county_tax' || type.includes('tax')) {
    bg = 'bg-green-100'
    text = 'text-green-700'
    label = 'County Tax'
  }

  return (
    <span className={`inline-block px-2.5 py-1 text-xs font-semibold rounded ${bg} ${text}`}>
      {label}
    </span>
  )
}

// ── Priority Badge ──────────────────────────────────────────────────────

function PriorityBadge({ priority }: { priority?: string }) {
  if (priority === 'normal' || !priority) return null

  let bg = 'bg-slate-100'
  let text = 'text-slate-700'
  let label = priority.charAt(0).toUpperCase() + priority.slice(1)

  if (priority === 'high') {
    bg = 'bg-orange-100'
    text = 'text-orange-700'
  } else if (priority === 'urgent') {
    bg = 'bg-red-100'
    text = 'text-red-700'
  } else if (priority === 'low') {
    bg = 'bg-blue-100'
    text = 'text-blue-700'
  }

  return (
    <span className={`inline-block px-2.5 py-1 text-xs font-semibold rounded ${bg} ${text}`}>
      {label} Priority
    </span>
  )
}

// ── Activity Timeline ────────────────────────────────────────────────────

function getActivityIcon(activityType: string) {
  const type = activityType.toLowerCase()
  if (type.includes('mail') || type.includes('letter') || type.includes('correspondence')) {
    return Mail
  }
  if (type.includes('phone') || type.includes('call')) {
    return Phone
  }
  if (type.includes('document') || type.includes('file')) {
    return FileText
  }
  return MessageSquare
}

function ActivityTimeline({
  activities,
  loading,
}: {
  activities: NegotiationActivity[]
  loading: boolean
}) {
  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="w-5 h-5 animate-spin text-slate-400" />
      </div>
    )
  }

  if (!activities.length) {
    return (
      <div className="text-center py-6 text-slate-500 text-sm">
        No activities yet
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {activities.map((activity) => {
        const IconComponent = getActivityIcon(activity.activityType)
        return (
          <div key={activity.id} className="flex gap-4">
            <div className="flex-shrink-0">
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-100">
                <IconComponent className="h-4 w-4 text-slate-600" />
              </div>
            </div>
            <div className="flex-1 pt-0.5">
              <p className="text-sm text-slate-900 font-medium">
                {activity.userSummary || activity.adminNote || 'Activity'}
              </p>
              <div className="flex items-center gap-2 mt-1">
                <p className="text-xs text-slate-500">
                  {formatDate(activity.createdAt)}
                </p>
                {activity.trackingStatus && (
                  <span className="inline-block px-2 py-0.5 text-xs font-medium text-slate-600 bg-slate-100 rounded">
                    {activity.trackingStatus}
                  </span>
                )}
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}

// ── Message Thread ──────────────────────────────────────────────────────

interface MessageThreadProps {
  caseId: string
  expanded: boolean
  onToggle: () => void
}

function MessageThread({ caseId, expanded, onToggle }: MessageThreadProps) {
  const [messages, setMessages] = useState<NegotiationMessage[]>([])
  const [loading, setLoading] = useState(false)
  const [messagesLoaded, setMessagesLoaded] = useState(false)
  const [sending, setSending] = useState(false)
  const [messageContent, setMessageContent] = useState('')
  const messagesEndRef = useRef<HTMLDivElement>(null)

  const loadMessages = useCallback(async () => {
    if (messagesLoaded) return

    setLoading(true)
    try {
      const msgs = await listMessages(caseId)
      setMessages(msgs.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()))
      setMessagesLoaded(true)

      // Mark admin messages as read
      for (const msg of msgs) {
        if (msg.senderRole === 'admin' && !msg.readAt) {
          try {
            await markMessageRead(msg.id)
          } catch {
            // ignore
          }
        }
      }
    } catch (err) {
      toast.error('Failed to load messages')
    } finally {
      setLoading(false)
    }
  }, [caseId, messagesLoaded])

  const handleSend = async () => {
    if (!messageContent.trim()) return

    setSending(true)
    try {
      const newMsg = await sendMessage(caseId, messageContent)
      setMessages((prev) => [
        ...prev,
        newMsg,
      ])
      setMessageContent('')
      toast.success('Message sent')
    } catch (err) {
      toast.error('Failed to send message')
    } finally {
      setSending(false)
    }
  }

  useEffect(() => {
    if (expanded && !messagesLoaded) {
      loadMessages()
    }
  }, [expanded, loadMessages, messagesLoaded])

  useEffect(() => {
    if (expanded && messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' })
    }
  }, [messages, expanded])

  return (
    <div className="border-t border-slate-200 mt-6">
      <button
        onClick={onToggle}
        className="w-full flex items-center justify-between px-4 py-3 hover:bg-slate-50 transition-colors"
      >
        <div className="flex items-center gap-2">
          <MessageSquare className="w-4 h-4 text-slate-600" />
          <span className="text-sm font-semibold text-slate-700">Message Your Negotiator</span>
        </div>
        {expanded ? (
          <ChevronUp className="w-4 h-4 text-slate-400" />
        ) : (
          <ChevronDown className="w-4 h-4 text-slate-400" />
        )}
      </button>

      {expanded && (
        <div className="border-t border-slate-200 bg-slate-50 p-4">
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="w-5 h-5 animate-spin text-slate-400" />
            </div>
          ) : (
            <>
              <div className="space-y-3 mb-4 max-h-64 overflow-y-auto">
                {messages.map((msg) => (
                  <div
                    key={msg.id}
                    className={`flex ${msg.senderRole === 'user' ? 'justify-end' : 'justify-start'}`}
                  >
                    <div
                      className={`max-w-xs px-3 py-2 rounded-lg text-sm ${
                        msg.senderRole === 'user'
                          ? 'bg-primary-500 text-white'
                          : 'bg-white text-slate-900 border border-slate-200'
                      }`}
                    >
                      <p>{msg.content}</p>
                      <div className="flex items-center justify-end gap-1 mt-1">
                        <span className="text-xs opacity-75">
                          {formatDate(msg.createdAt)}
                        </span>
                        {msg.senderRole === 'user' && msg.readAt && (
                          <span className="text-xs opacity-75">✓✓</span>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
                <div ref={messagesEndRef} />
              </div>

              <div className="flex gap-2">
                <input
                  type="text"
                  value={messageContent}
                  onChange={(e) => setMessageContent(e.target.value)}
                  onKeyPress={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault()
                      handleSend()
                    }
                  }}
                  placeholder="Type your message..."
                  className="flex-1 px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                />
                <button
                  onClick={handleSend}
                  disabled={sending || !messageContent.trim()}
                  className="px-3 py-2 bg-primary-500 text-white rounded-lg hover:bg-primary-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  {sending ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Send className="w-4 h-4" />
                  )}
                </button>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  )
}

// ── Case Card ────────────────────────────────────────────────────────────

interface CaseCardProps {
  negotiationCase: NegotiationCase
  dealId: string
}

function CaseCard({ negotiationCase, dealId }: CaseCardProps) {
  const [activities, setActivities] = useState<NegotiationActivity[]>([])
  const [activitiesLoading, setActivitiesLoading] = useState(true)
  const [expanded, setExpanded] = useState(false)
  const [messageThreadExpanded, setMessageThreadExpanded] = useState(false)

  useEffect(() => {
    if (expanded && !activities.length) {
      const loadActivities = async () => {
        setActivitiesLoading(true)
        try {
          const acts = await listActivities(negotiationCase.id)
          setActivities(acts.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()))
        } catch (err) {
          toast.error('Failed to load activities')
        } finally {
          setActivitiesLoading(false)
        }
      }
      loadActivities()
    }
  }, [expanded, negotiationCase.id, activities])

  return (
    <div className="border border-slate-200 rounded-lg overflow-hidden bg-white">
      <div className="px-4 py-4">
        <div className="flex items-start justify-between mb-4">
          <div className="flex items-center gap-3">
            <ServiceTypeBadge serviceType={negotiationCase.serviceType} />
            <PriorityBadge priority={negotiationCase.priority} />
          </div>
          <button
            onClick={() => setExpanded(!expanded)}
            className="text-slate-400 hover:text-slate-600 transition-colors"
          >
            {expanded ? (
              <ChevronUp className="w-5 h-5" />
            ) : (
              <ChevronDown className="w-5 h-5" />
            )}
          </button>
        </div>

        <CaseStepper status={negotiationCase.status} />

        {expanded && (
          <div className="mt-6 space-y-6">
            <div>
              <h4 className="text-sm font-semibold text-slate-700 mb-3">Activity Timeline</h4>
              <ActivityTimeline
                activities={activities}
                loading={activitiesLoading}
              />
            </div>

            <MessageThread
              caseId={negotiationCase.id}
              expanded={messageThreadExpanded}
              onToggle={() => setMessageThreadExpanded(!messageThreadExpanded)}
            />
          </div>
        )}
      </div>
    </div>
  )
}

// ── Main Component ──────────────────────────────────────────────────────

export default function DealNegotiationsTab({ dealId }: DealNegotiationsTabProps) {
  const [request, setRequest] = useState<NegotiationRequest | null>(null)
  const [cases, setCases] = useState<NegotiationCase[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const loadData = async () => {
      setLoading(true)
      try {
        // Fetch negotiation requests for this deal
        const requests = await listNegotiationRequests()
        const dealRequest = requests.find((r) => r.dealId === dealId)

        if (dealRequest) {
          setRequest(dealRequest)

          // If request is accepted, load cases
          if (dealRequest.status === 'accepted') {
            const allCases = await listCases()
            const dealCases = allCases.filter((c) => c.dealId === dealId)
            setCases(dealCases)
          }
        }
      } catch (err) {
        toast.error('Failed to load negotiation data')
      } finally {
        setLoading(false)
      }
    }

    loadData()
  }, [dealId])

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-6 h-6 animate-spin text-slate-400" />
      </div>
    )
  }

  if (!request) {
    return (
      <div className="p-6">
        <div className="text-center py-8">
          <MessageSquare className="w-12 h-12 text-slate-300 mx-auto mb-3" />
          <p className="text-slate-600 text-sm mb-2">
            No negotiation requests for this property.
          </p>
          <p className="text-slate-500 text-xs">
            Use the Liens section to send liens for negotiation.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="p-6 space-y-6">
      {/* Status Banner */}
      <RequestStatusBanner status={request.status} />

      {/* Request Details (always shown) */}
      <RequestDetailsCard request={request} />

      {/* Response Form (shown when info_requested) */}
      {request.status === 'info_requested' && (
        <InfoResponseForm
          requestId={request.id}
          onResponseSent={(updated) => setRequest(updated)}
        />
      )}

      {/* Active Cases */}
      {request.status === 'accepted' && cases.length > 0 && (
        <div>
          <h3 className="text-lg font-semibold text-slate-900 mb-4">
            Active Cases ({cases.length})
          </h3>
          <div className="space-y-4">
            {cases.map((negotiationCase) => (
              <CaseCard
                key={negotiationCase.id}
                negotiationCase={negotiationCase}
                dealId={dealId}
              />
            ))}
          </div>
        </div>
      )}

      {/* No Cases Yet */}
      {request.status === 'accepted' && cases.length === 0 && (
        <div className="border border-slate-200 rounded-lg p-6 text-center">
          <FileText className="w-12 h-12 text-slate-300 mx-auto mb-3" />
          <p className="text-slate-600 text-sm">
            No cases have been created yet. Check back soon.
          </p>
        </div>
      )}
    </div>
  )
}
