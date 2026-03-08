import { useState, useEffect } from 'react'
import {
  Clock,
  CheckCircle,
  AlertCircle,
  XCircle,
  ChevronDown,
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

/* ── Type Definitions ────────────────────────────────────────────── */

type Tab = 'incoming' | 'active'

/* ── Helpers ─────────────────────────────────────────────────────── */

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
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

/* ── Incoming Request Card ──────────────────────────────────────── */

function IncomingRequestCard({
  request,
  onAction,
}: {
  request: NegotiationRequest
  onAction: (action: 'accept' | 'info' | 'decline', requestId: string) => void
}) {
  const isInfoRequested = request.status === 'info_requested'

  return (
    <div className={`bg-white rounded-lg border p-5 space-y-4 ${isInfoRequested ? 'border-blue-300 ring-1 ring-blue-100' : 'border-slate-200'}`}>
      <div className="flex items-start justify-between">
        <div>
          <h4 className="font-semibold text-slate-900">
            {request.propertyAddress || 'Unknown Address'}
          </h4>
          <p className="text-sm text-slate-500">
            {request.propertyCity}, {request.propertyState}
          </p>
        </div>
        {isInfoRequested && (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-semibold rounded bg-blue-100 text-blue-700">
            <Clock className="w-3 h-3" />
            Awaiting User Response
          </span>
        )}
      </div>

      <div className="flex flex-wrap gap-2">
        {request.serviceTypes?.map((type) => (
          <ServiceTypeBadge key={type} serviceType={type} />
        ))}
      </div>

      <div className="text-sm text-slate-600 space-y-1">
        <p>
          <span className="font-medium">User:</span> #{request.userId}
        </p>
        <p>
          <span className="font-medium">Submitted:</span> {formatDate(request.createdAt)}
        </p>
      </div>

      {request.message && (
        <div className="bg-slate-50 rounded p-3 text-sm text-slate-700">
          <p className="font-medium mb-1">Message:</p>
          <p>{request.message}</p>
        </div>
      )}

      <div className="flex gap-2 justify-between">
        <button
          onClick={() => onAction('decline', request.id)}
          className="flex-1 px-3 py-2 bg-red-100 text-red-700 rounded-lg font-medium text-sm hover:bg-red-200 transition"
        >
          <XCircle className="w-4 h-4 inline mr-2" />
          Decline
        </button>
        <button
          onClick={() => onAction('info', request.id)}
          className="flex-1 px-3 py-2 bg-blue-100 text-blue-700 rounded-lg font-medium text-sm hover:bg-blue-200 transition"
        >
          <AlertCircle className="w-4 h-4 inline mr-2" />
          Info
        </button>
        <button
          onClick={() => onAction('accept', request.id)}
          className="flex-1 px-3 py-2 bg-green-100 text-green-700 rounded-lg font-medium text-sm hover:bg-green-200 transition"
        >
          <CheckCircle className="w-4 h-4 inline mr-2" />
          Accept
        </button>
      </div>
    </div>
  )
}

/* ── Active Case Row ────────────────────────────────────────────── */

function ActiveCaseRow({
  case: caseItem,
  onSelect,
}: {
  case: NegotiationCase
  onSelect: (caseId: string) => void
}) {
  return (
    <tr className="border-b border-slate-200 hover:bg-slate-50 cursor-pointer" onClick={() => onSelect(caseItem.id)}>
      <td className="px-4 py-3 text-slate-900 font-medium">{caseItem.propertyAddress || 'Unknown'}</td>
      <td className="px-4 py-3">
        <ServiceTypeBadge serviceType={caseItem.serviceType} />
      </td>
      <td className="px-4 py-3">
        <span className={`inline-block text-xs font-medium px-2.5 py-0.5 rounded ${getStatusBadgeColor(caseItem.status)}`}>
          {caseItem.status.replace('_', ' ')}
        </span>
      </td>
      <td className="px-4 py-3">
        <span className={`inline-block text-xs font-medium px-2.5 py-0.5 rounded ${getPriorityBadgeColor(caseItem.priority)}`}>
          {caseItem.priority}
        </span>
      </td>
      <td className="px-4 py-3 text-sm text-slate-500">{formatDate(caseItem.createdAt)}</td>
    </tr>
  )
}

/* ── Main Dashboard Component ────────────────────────────────────── */

export default function AdminNegotiationsDashboard() {
  const [tab, setTab] = useState<Tab>('incoming')
  const [requests, setRequests] = useState<NegotiationRequest[]>([])
  const [cases, setCases] = useState<NegotiationCase[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedCaseId, setSelectedCaseId] = useState<string | null>(null)
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

  // Handle actions
  async function handleAction(action: 'accept' | 'info' | 'decline', requestId: string) {
    try {
      if (action === 'accept') {
        await acceptRequest(requestId)
        toast.success('Request accepted')
        setRequests(requests.filter((r) => r.id !== requestId))
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
      const updated = await requestMoreInfo(infoModal.requestId, message)
      toast.success('Information request sent')
      // Update the request in-place with new status instead of removing it
      setRequests(requests.map((r) => r.id === infoModal.requestId ? { ...r, status: 'info_requested' as const } : r))
      setInfoModal(null)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to send request')
    }
  }

  // Filter cases
  const filteredCases = cases.filter((c) => {
    if (statusFilter !== 'all' && c.status !== statusFilter) return false
    if (serviceTypeFilter !== 'all' && c.serviceType !== serviceTypeFilter) return false
    return true
  })

  // If a case is selected, show workspace
  if (selectedCaseId) {
    return (
      <AdminCaseWorkspace
        caseId={selectedCaseId}
        onBack={() => setSelectedCaseId(null)}
      />
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold text-slate-900">Negotiations</h1>
        <p className="text-slate-600">Manage client negotiation requests and active cases</p>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 border-b border-slate-200">
        <button
          onClick={() => setTab('incoming')}
          className={`px-4 py-3 font-medium text-sm border-b-2 transition ${
            tab === 'incoming'
              ? 'border-blue-600 text-blue-600'
              : 'border-transparent text-slate-600 hover:text-slate-900'
          }`}
        >
          Incoming Requests
          {requests.length > 0 && (
            <span className="ml-2 bg-blue-100 text-blue-700 px-2 py-1 rounded text-xs font-medium">
              {requests.length}
            </span>
          )}
        </button>
        <button
          onClick={() => setTab('active')}
          className={`px-4 py-3 font-medium text-sm border-b-2 transition ${
            tab === 'active'
              ? 'border-blue-600 text-blue-600'
              : 'border-transparent text-slate-600 hover:text-slate-900'
          }`}
        >
          Active Cases
          {cases.length > 0 && (
            <span className="ml-2 bg-blue-100 text-blue-700 px-2 py-1 rounded text-xs font-medium">
              {cases.length}
            </span>
          )}
        </button>
      </div>

      {/* Loading state */}
      {loading && (
        <div className="text-center py-12">
          <Clock className="w-8 h-8 text-slate-400 mx-auto mb-2 animate-spin" />
          <p className="text-slate-600">Loading...</p>
        </div>
      )}

      {/* Incoming Requests Tab */}
      {!loading && tab === 'incoming' && (
        <div className="space-y-4">
          {requests.length === 0 ? (
            <div className="text-center py-12 bg-slate-50 rounded-lg">
              <CheckCircle className="w-8 h-8 text-slate-400 mx-auto mb-2" />
              <p className="text-slate-600">No incoming requests</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-4">
              {requests.map((request) => (
                <IncomingRequestCard
                  key={request.id}
                  request={request}
                  onAction={handleAction}
                />
              ))}
            </div>
          )}
        </div>
      )}

      {/* Active Cases Tab */}
      {!loading && tab === 'active' && (
        <div className="space-y-4">
          {/* Filters */}
          <div className="flex gap-4">
            <div className="flex-1 max-w-xs">
              <label className="block text-sm font-medium text-slate-700 mb-2">Status</label>
              <div className="relative">
                <select
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm appearance-none bg-white cursor-pointer focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="all">All Statuses</option>
                  <option value="intake">Intake</option>
                  <option value="researching">Researching</option>
                  <option value="in_progress">In Progress</option>
                  <option value="awaiting_response">Awaiting Response</option>
                  <option value="resolved">Resolved</option>
                  <option value="closed">Closed</option>
                </select>
                <ChevronDown className="absolute right-2 top-2.5 w-5 h-5 text-slate-400 pointer-events-none" />
              </div>
            </div>

            <div className="flex-1 max-w-xs">
              <label className="block text-sm font-medium text-slate-700 mb-2">Service Type</label>
              <div className="relative">
                <select
                  value={serviceTypeFilter}
                  onChange={(e) => setServiceTypeFilter(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm appearance-none bg-white cursor-pointer focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="all">All Types</option>
                  <option value="bank">Bank</option>
                  <option value="county_tax">County Tax</option>
                  <option value="other_lien">Other Lien</option>
                </select>
                <ChevronDown className="absolute right-2 top-2.5 w-5 h-5 text-slate-400 pointer-events-none" />
              </div>
            </div>
          </div>

          {/* Cases Table */}
          {filteredCases.length === 0 ? (
            <div className="text-center py-12 bg-slate-50 rounded-lg">
              <AlertCircle className="w-8 h-8 text-slate-400 mx-auto mb-2" />
              <p className="text-slate-600">No cases matching filters</p>
            </div>
          ) : (
            <div className="bg-white rounded-lg border border-slate-200 overflow-hidden">
              <table className="w-full">
                <thead className="bg-slate-50 border-b border-slate-200">
                  <tr>
                    <th className="px-4 py-3 text-left text-sm font-semibold text-slate-900">Property Address</th>
                    <th className="px-4 py-3 text-left text-sm font-semibold text-slate-900">Service Type</th>
                    <th className="px-4 py-3 text-left text-sm font-semibold text-slate-900">Status</th>
                    <th className="px-4 py-3 text-left text-sm font-semibold text-slate-900">Priority</th>
                    <th className="px-4 py-3 text-left text-sm font-semibold text-slate-900">Created</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredCases.map((caseItem) => (
                    <ActiveCaseRow
                      key={caseItem.id}
                      case={caseItem}
                      onSelect={setSelectedCaseId}
                    />
                  ))}
                </tbody>
              </table>
            </div>
          )}
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
