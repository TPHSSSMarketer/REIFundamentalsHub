import { useState, useEffect } from 'react'
import {
  Clock,
  CheckCircle,
  AlertCircle,
  XCircle,
  ChevronDown,
  Inbox,
  FileText,
  MapPin,
  Send,
  ArrowLeft,
  Home,
  MessageSquare,
} from 'lucide-react'
import { toast } from 'sonner'
import type { NegotiationRequest, NegotiationCase } from '@/types'
import {
  listNegotiationRequests,
  listCases,
  acceptRequest,
  requestMoreInfo,
  declineRequest,
} from '@/services/negotiationApi'
import AdminCaseWorkspace from './AdminCaseWorkspace'

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

// Unified row type — either a request or a case
type UnifiedRow =
  | { kind: 'request'; data: NegotiationRequest }
  | { kind: 'case'; data: NegotiationCase }

function getUnifiedStatus(row: UnifiedRow): string {
  if (row.kind === 'request') {
    return row.data.status === 'info_requested' ? 'info_requested' : 'pending'
  }
  return row.data.status
}

function getUnifiedDate(row: UnifiedRow): string {
  return row.data.createdAt
}

function getUnifiedAddress(row: UnifiedRow): string {
  if (row.kind === 'request') return row.data.propertyAddress || 'Unknown Address'
  return row.data.propertyAddress || 'Unknown Address'
}

// All possible statuses in pipeline order
const ALL_STATUSES = [
  'pending',
  'info_requested',
  'intake',
  'researching',
  'in_progress',
  'awaiting_response',
  'resolved',
  'closed',
] as const

function getStatusBadgeColor(status: string): string {
  switch (status) {
    case 'pending':
      return 'bg-amber-100 text-amber-700'
    case 'info_requested':
      return 'bg-sky-100 text-sky-700'
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

function getStatusLabel(status: string): string {
  switch (status) {
    case 'pending': return 'Pending Request'
    case 'info_requested': return 'Info Requested'
    case 'intake': return 'Intake'
    case 'researching': return 'Researching'
    case 'in_progress': return 'In Progress'
    case 'awaiting_response': return 'Awaiting Response'
    case 'resolved': return 'Resolved'
    case 'closed': return 'Closed'
    default: return status.replace('_', ' ')
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

/* ── Info Request Modal ──────────────────────────────────────────── */

function InfoRequestModal({
  requestId,
  onClose,
  onSubmit,
}: {
  requestId: string
  onClose: () => void
  onSubmit: (message: string) => Promise<void>
}) {
  const [message, setMessage] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSubmit() {
    if (!message.trim()) {
      toast.error('Please enter a message')
      return
    }
    setLoading(true)
    try {
      await onSubmit(message)
      onClose()
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-lg w-96 p-6">
        <h3 className="text-lg font-semibold text-slate-900 mb-4">Request More Information</h3>
        <textarea
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder="Enter your message..."
          className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm mb-4 focus:outline-none focus:ring-2 focus:ring-blue-500"
          rows={4}
        />
        <div className="flex gap-2 justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 border border-slate-300 rounded-lg text-slate-700 font-medium hover:bg-slate-50"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={loading}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 disabled:opacity-50"
          >
            {loading ? 'Sending...' : 'Send'}
          </button>
        </div>
      </div>
    </div>
  )
}

/* ── Request Detail View ─────────────────────────────────────────── */

function RequestDetailView({
  request,
  onBack,
  onAccept,
  onRequestInfo,
  onDecline,
}: {
  request: NegotiationRequest
  onBack: () => void
  onAccept: () => Promise<void>
  onRequestInfo: () => void
  onDecline: () => Promise<void>
}) {
  const [actionLoading, setActionLoading] = useState<string | null>(null)

  const handleAction = async (action: 'accept' | 'info' | 'decline') => {
    setActionLoading(action)
    try {
      if (action === 'accept') await onAccept()
      else if (action === 'info') onRequestInfo()
      else if (action === 'decline') await onDecline()
    } finally {
      setActionLoading(null)
    }
  }

  const serviceLabels: Record<string, string> = {
    bank: 'Bank Negotiation',
    county_tax: 'County Tax Negotiation',
    other_lien: 'Other Lien Negotiation',
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-4">
          <button onClick={onBack} className="p-2 hover:bg-slate-100 rounded-lg transition">
            <ArrowLeft className="w-5 h-5 text-slate-600" />
          </button>
          <div>
            <h1 className="text-2xl font-bold text-slate-900">
              {request.propertyAddress || 'Unknown Address'}
            </h1>
            <div className="flex items-center gap-2 mt-1 text-sm text-slate-500">
              <MapPin className="w-4 h-4" />
              <span>
                {[request.propertyCity, request.propertyState].filter(Boolean).join(', ')}
              </span>
              <span className="mx-1">·</span>
              <span className={`inline-block text-xs font-medium px-2.5 py-0.5 rounded ${getStatusBadgeColor(request.status)}`}>
                {getStatusLabel(request.status)}
              </span>
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Left Column — Request Details */}
        <div className="lg:col-span-2 space-y-4">
          {/* Service Types Requested */}
          <div className="bg-white rounded-lg border border-slate-200 p-5">
            <h3 className="text-sm font-semibold text-slate-500 uppercase tracking-wide mb-3">
              Services Requested
            </h3>
            <div className="flex flex-wrap gap-2">
              {request.serviceTypes?.map((t) => (
                <span
                  key={t}
                  className="inline-flex items-center gap-2 px-4 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm font-medium text-slate-700"
                >
                  <Home className="w-4 h-4 text-slate-400" />
                  {serviceLabels[t] || t}
                </span>
              ))}
            </div>
          </div>

          {/* Sender's Message */}
          {request.message && (
            <div className="bg-white rounded-lg border border-slate-200 p-5">
              <h3 className="text-sm font-semibold text-slate-500 uppercase tracking-wide mb-3">
                <MessageSquare className="w-4 h-4 inline mr-1" />
                Message from Sender
              </h3>
              <div className="bg-slate-50 rounded-lg p-4 text-sm text-slate-700 leading-relaxed">
                {request.message}
              </div>
            </div>
          )}

          {/* Request Info */}
          <div className="bg-white rounded-lg border border-slate-200 p-5">
            <h3 className="text-sm font-semibold text-slate-500 uppercase tracking-wide mb-3">
              Request Details
            </h3>
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <span className="text-slate-500 block text-xs">Request ID</span>
                <span className="text-slate-900 font-mono text-xs">{request.id.slice(0, 8)}...</span>
              </div>
              <div>
                <span className="text-slate-500 block text-xs">Submitted</span>
                <span className="text-slate-900">{formatDate(request.createdAt)}</span>
              </div>
              <div>
                <span className="text-slate-500 block text-xs">Deal ID</span>
                <span className="text-slate-900 font-mono text-xs">{request.dealId.slice(0, 8)}...</span>
              </div>
              <div>
                <span className="text-slate-500 block text-xs">User ID</span>
                <span className="text-slate-900">{request.userId}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Right Column — Actions */}
        <div className="space-y-4">
          <div className="bg-white rounded-lg border border-slate-200 p-5 space-y-3">
            <h3 className="text-sm font-semibold text-slate-500 uppercase tracking-wide">
              Actions
            </h3>

            <button
              onClick={() => handleAction('accept')}
              disabled={actionLoading !== null}
              className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-green-600 text-white rounded-lg font-medium hover:bg-green-700 transition disabled:opacity-50"
            >
              <CheckCircle className="w-5 h-5" />
              {actionLoading === 'accept' ? 'Accepting...' : 'Accept Request'}
            </button>

            <button
              onClick={() => handleAction('info')}
              disabled={actionLoading !== null}
              className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 transition disabled:opacity-50"
            >
              <Send className="w-5 h-5" />
              {actionLoading === 'info' ? 'Opening...' : 'Request More Info'}
            </button>

            <button
              onClick={() => handleAction('decline')}
              disabled={actionLoading !== null}
              className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-white text-red-600 border border-red-300 rounded-lg font-medium hover:bg-red-50 transition disabled:opacity-50"
            >
              <XCircle className="w-5 h-5" />
              {actionLoading === 'decline' ? 'Declining...' : 'Decline Request'}
            </button>
          </div>

          {/* Status Info */}
          <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
            <p className="text-sm text-amber-800">
              <strong>Tip:</strong> Accept the request to create a case and start AI research. Use "Request More Info" to message the sender first.
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}

/* ── Main Dashboard Component ────────────────────────────────────── */

export default function AdminNegotiationsDashboard() {
  const [requests, setRequests] = useState<NegotiationRequest[]>([])
  const [cases, setCases] = useState<NegotiationCase[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedCaseId, setSelectedCaseId] = useState<string | null>(null)
  const [selectedRequestId, setSelectedRequestId] = useState<string | null>(null)
  const [infoModal, setInfoModal] = useState<{ requestId: string } | null>(null)
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [serviceTypeFilter, setServiceTypeFilter] = useState<string>('all')

  // Load data
  useEffect(() => {
    async function loadData() {
      setLoading(true)
      try {
        const [reqData, caseData] = await Promise.all([
          listNegotiationRequests(),
          listCases(),
        ])
        setRequests(reqData)
        setCases(caseData)
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Failed to load data')
      } finally {
        setLoading(false)
      }
    }
    loadData()
  }, [])

  // Handle request actions
  async function handleAction(action: 'accept' | 'info' | 'decline', requestId: string) {
    try {
      if (action === 'accept') {
        await acceptRequest(requestId)
        toast.success('Request accepted — case created')
        // Reload everything to get the new case
        const [reqData, caseData] = await Promise.all([
          listNegotiationRequests(),
          listCases(),
        ])
        setRequests(reqData)
        setCases(caseData)
      } else if (action === 'decline') {
        if (!window.confirm('Decline this request?')) return
        await declineRequest(requestId)
        toast.success('Request declined')
        setRequests(requests.filter((r) => r.id !== requestId))
      } else if (action === 'info') {
        setInfoModal({ requestId })
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Action failed')
    }
  }

  async function handleInfoSubmit(message: string) {
    if (!infoModal) return
    try {
      await requestMoreInfo(infoModal.requestId, message)
      toast.success('Information request sent')
      setRequests(requests.map((r) =>
        r.id === infoModal.requestId ? { ...r, status: 'info_requested' as const } : r
      ))
      setInfoModal(null)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to send request')
    }
  }

  // Build unified rows — requests + cases in one stream
  const unifiedRows: UnifiedRow[] = [
    ...requests
      .filter((r) => r.status === 'pending' || r.status === 'info_requested')
      .map((r): UnifiedRow => ({ kind: 'request', data: r })),
    ...cases.map((c): UnifiedRow => ({ kind: 'case', data: c })),
  ]

  // Apply filters
  const filteredRows = unifiedRows.filter((row) => {
    const status = getUnifiedStatus(row)
    if (statusFilter !== 'all' && status !== statusFilter) return false
    if (serviceTypeFilter !== 'all') {
      if (row.kind === 'request') {
        if (!row.data.serviceTypes?.includes(serviceTypeFilter)) return false
      } else {
        if (row.data.serviceType !== serviceTypeFilter) return false
      }
    }
    return true
  })

  // Sort: newest first
  filteredRows.sort((a, b) => {
    return new Date(getUnifiedDate(b)).getTime() - new Date(getUnifiedDate(a)).getTime()
  })

  // Count by status for filter badges
  const statusCounts: Record<string, number> = {}
  for (const row of unifiedRows) {
    const s = getUnifiedStatus(row)
    statusCounts[s] = (statusCounts[s] || 0) + 1
  }

  // If a case is selected, show workspace
  if (selectedCaseId) {
    return (
      <AdminCaseWorkspace
        caseId={selectedCaseId}
        onBack={() => setSelectedCaseId(null)}
      />
    )
  }

  // If a request is selected, show request detail view
  const selectedRequest = selectedRequestId
    ? requests.find((r) => r.id === selectedRequestId)
    : null

  if (selectedRequest) {
    return (
      <>
        <RequestDetailView
          request={selectedRequest}
          onBack={() => setSelectedRequestId(null)}
          onAccept={async () => {
            await handleAction('accept', selectedRequest.id)
            setSelectedRequestId(null)
          }}
          onRequestInfo={() => {
            setInfoModal({ requestId: selectedRequest.id })
          }}
          onDecline={async () => {
            await handleAction('decline', selectedRequest.id)
            setSelectedRequestId(null)
          }}
        />
        {infoModal && (
          <InfoRequestModal
            requestId={infoModal.requestId}
            onClose={() => setInfoModal(null)}
            onSubmit={handleInfoSubmit}
          />
        )}
      </>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold text-slate-900">Negotiations</h1>
        <p className="text-slate-600">
          {unifiedRows.length} total &middot;{' '}
          {statusCounts['pending'] || 0} pending &middot;{' '}
          {(statusCounts['in_progress'] || 0) + (statusCounts['researching'] || 0) + (statusCounts['intake'] || 0)} active
        </p>
      </div>

      {/* Filters — status pills + service type dropdown */}
      <div className="flex flex-wrap items-end gap-4">
        <div className="flex-1">
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => setStatusFilter('all')}
              className={`px-3 py-1.5 text-xs font-medium rounded-full transition-all ${
                statusFilter === 'all'
                  ? 'bg-slate-800 text-white'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              All ({unifiedRows.length})
            </button>
            {ALL_STATUSES.map((s) => {
              const count = statusCounts[s] || 0
              if (count === 0) return null
              return (
                <button
                  key={s}
                  onClick={() => setStatusFilter(statusFilter === s ? 'all' : s)}
                  className={`px-3 py-1.5 text-xs font-medium rounded-full transition-all ${
                    statusFilter === s
                      ? `${getStatusBadgeColor(s)} ring-2 ring-offset-1 ring-current`
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  {getStatusLabel(s)} ({count})
                </button>
              )
            })}
          </div>
        </div>

        <div className="w-40">
          <div className="relative">
            <select
              value={serviceTypeFilter}
              onChange={(e) => setServiceTypeFilter(e.target.value)}
              className="w-full px-3 py-1.5 border border-slate-300 rounded-lg text-xs appearance-none bg-white cursor-pointer focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="all">All Types</option>
              <option value="bank">Bank</option>
              <option value="county_tax">County Tax</option>
              <option value="other_lien">Other Lien</option>
            </select>
            <ChevronDown className="absolute right-2 top-1.5 w-4 h-4 text-slate-400 pointer-events-none" />
          </div>
        </div>
      </div>

      {/* Loading state */}
      {loading && (
        <div className="text-center py-12">
          <Clock className="w-8 h-8 text-slate-400 mx-auto mb-2 animate-spin" />
          <p className="text-slate-600">Loading...</p>
        </div>
      )}

      {/* Unified stream */}
      {!loading && filteredRows.length === 0 && (
        <div className="text-center py-12 bg-slate-50 rounded-lg">
          <Inbox className="w-8 h-8 text-slate-400 mx-auto mb-2" />
          <p className="text-slate-600">
            {statusFilter === 'all' ? 'No negotiations yet' : `No negotiations with status "${getStatusLabel(statusFilter)}"`}
          </p>
        </div>
      )}

      {!loading && filteredRows.length > 0 && (
        <div className="bg-white rounded-lg border border-slate-200 overflow-hidden">
          <table className="w-full">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                <th className="px-4 py-3 text-left text-sm font-semibold text-slate-900">Property</th>
                <th className="px-4 py-3 text-left text-sm font-semibold text-slate-900">Type</th>
                <th className="px-4 py-3 text-left text-sm font-semibold text-slate-900">Status</th>
                <th className="px-4 py-3 text-left text-sm font-semibold text-slate-900">Priority</th>
                <th className="px-4 py-3 text-left text-sm font-semibold text-slate-900">Date</th>
                <th className="px-4 py-3 text-left text-sm font-semibold text-slate-900">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredRows.map((row) => {
                const status = getUnifiedStatus(row)
                const isRequest = row.kind === 'request'

                return (
                  <tr
                    key={isRequest ? `req-${row.data.id}` : `case-${row.data.id}`}
                    className={`border-b border-slate-100 transition cursor-pointer ${
                      isRequest
                        ? 'bg-amber-50/40 hover:bg-amber-50/70'
                        : 'hover:bg-slate-50'
                    }`}
                    onClick={() => {
                      if (isRequest) {
                        setSelectedRequestId(row.data.id)
                      } else {
                        setSelectedCaseId(row.data.id)
                      }
                    }}
                  >
                    {/* Property */}
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        {isRequest ? (
                          <Inbox className="w-4 h-4 text-amber-500 flex-shrink-0" />
                        ) : (
                          <FileText className="w-4 h-4 text-slate-400 flex-shrink-0" />
                        )}
                        <div>
                          <span className="text-slate-900 font-medium text-sm">
                            {getUnifiedAddress(row)}
                          </span>
                          {isRequest && row.data.propertyCity && (
                            <p className="text-xs text-slate-500">
                              {row.data.propertyCity}, {row.data.propertyState}
                            </p>
                          )}
                        </div>
                      </div>
                    </td>

                    {/* Service Type */}
                    <td className="px-4 py-3">
                      {isRequest ? (
                        <div className="flex flex-wrap gap-1">
                          {row.data.serviceTypes?.map((t: string) => (
                            <ServiceTypeBadge key={t} serviceType={t} />
                          ))}
                        </div>
                      ) : (
                        <ServiceTypeBadge serviceType={(row.data as NegotiationCase).serviceType} />
                      )}
                    </td>

                    {/* Status */}
                    <td className="px-4 py-3">
                      <span className={`inline-block text-xs font-medium px-2.5 py-0.5 rounded ${getStatusBadgeColor(status)}`}>
                        {getStatusLabel(status)}
                      </span>
                    </td>

                    {/* Priority */}
                    <td className="px-4 py-3">
                      {isRequest ? (
                        <span className="text-xs text-slate-400">—</span>
                      ) : (
                        <span className={`inline-block text-xs font-medium px-2.5 py-0.5 rounded ${getPriorityBadgeColor((row.data as NegotiationCase).priority)}`}>
                          {(row.data as NegotiationCase).priority}
                        </span>
                      )}
                    </td>

                    {/* Date */}
                    <td className="px-4 py-3 text-sm text-slate-500">
                      {formatDate(getUnifiedDate(row))}
                    </td>

                    {/* Actions */}
                    <td className="px-4 py-3">
                      {isRequest && (
                        <div className="flex gap-1.5" onClick={(e) => e.stopPropagation()}>
                          <button
                            onClick={() => handleAction('accept', row.data.id)}
                            title="Accept"
                            className="p-1.5 bg-green-100 text-green-700 rounded hover:bg-green-200 transition"
                          >
                            <CheckCircle className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => handleAction('info', row.data.id)}
                            title="Request Info"
                            className="p-1.5 bg-blue-100 text-blue-700 rounded hover:bg-blue-200 transition"
                          >
                            <AlertCircle className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => handleAction('decline', row.data.id)}
                            title="Decline"
                            className="p-1.5 bg-red-100 text-red-700 rounded hover:bg-red-200 transition"
                          >
                            <XCircle className="w-4 h-4" />
                          </button>
                        </div>
                      )}
                      {!isRequest && (
                        <span className="text-xs text-blue-600 font-medium">Open →</span>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Info Request Modal */}
      {infoModal && (
        <InfoRequestModal
          requestId={infoModal.requestId}
          onClose={() => setInfoModal(null)}
          onSubmit={handleInfoSubmit}
        />
      )}
    </div>
  )
}
