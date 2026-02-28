'use client'

import { useState, useEffect } from 'react'
import {
  Loader2,
  Phone,
  MessageSquare,
  ChevronDown,
  ChevronUp,
  MessageCircle,
  AlertCircle,
  Smile,
  TrendingUp,
  CheckCircle,
  XCircle,
} from 'lucide-react'
import { toast } from 'sonner'
import {
  getConversations,
  getConversation,
  type ConversationLog,
} from '@/services/voiceAiApi'

type OutcomeFilter = 'all' | 'qualified' | 'appointment_set' | 'not_interested' | 'callback_requested' | 'voicemail'

const OUTCOME_LABELS: Record<string, string> = {
  qualified: 'Qualified Lead',
  appointment_set: 'Appointment Set',
  not_interested: 'Not Interested',
  callback_requested: 'Callback Requested',
  voicemail: 'Voicemail',
}

const OUTCOME_COLORS: Record<string, string> = {
  qualified: 'bg-green-100 text-green-700',
  appointment_set: 'bg-blue-100 text-blue-700',
  not_interested: 'bg-red-100 text-red-700',
  callback_requested: 'bg-yellow-100 text-yellow-700',
  voicemail: 'bg-slate-100 text-slate-700',
}

const MOOD_COLORS: Record<string, string> = {
  positive: 'bg-green-100 text-green-700',
  neutral: 'bg-slate-100 text-slate-700',
  negative: 'bg-red-100 text-red-700',
}

const EAGERNESS_COLORS: Record<string, string> = {
  high: 'bg-green-100 text-green-700',
  medium: 'bg-yellow-100 text-yellow-700',
  low: 'bg-red-100 text-red-700',
}

export default function ConversationsTab() {
  const [conversations, setConversations] = useState<ConversationLog[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [expandedConvId, setExpandedConvId] = useState<string | null>(null)
  const [selectedConversation, setSelectedConversation] = useState<ConversationLog | null>(null)
  const [outcomeFilter, setOutcomeFilter] = useState<OutcomeFilter>('all')

  useEffect(() => {
    loadConversations()
  }, [outcomeFilter])

  const loadConversations = async () => {
    setIsLoading(true)
    try {
      const data = await getConversations({
        limit: 100,
        outcome: outcomeFilter === 'all' ? undefined : outcomeFilter,
      })
      setConversations(data)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to load conversations')
    } finally {
      setIsLoading(false)
    }
  }

  const handleExpandConversation = async (convId: string) => {
    if (expandedConvId === convId) {
      setExpandedConvId(null)
      setSelectedConversation(null)
    } else {
      setExpandedConvId(convId)
      try {
        const fullConversation = await getConversation(convId)
        setSelectedConversation(fullConversation)
      } catch (error) {
        toast.error(error instanceof Error ? error.message : 'Failed to load conversation details')
      }
    }
  }

  // Calculate stats
  const stats = {
    total: conversations.length,
    qualified: conversations.filter(c => c.outcome === 'qualified').length,
    appointments: conversations.filter(c => c.outcome === 'appointment_set').length,
  }

  // Format phone number
  const formatPhone = (phone?: string) => {
    if (!phone) return 'N/A'
    const cleaned = phone.replace(/\D/g, '')
    if (cleaned.length === 10) {
      return `(${cleaned.slice(0, 3)}) ${cleaned.slice(3, 6)}-${cleaned.slice(6)}`
    }
    return phone
  }

  // Format datetime
  const formatDateTime = (dateString?: string) => {
    if (!dateString) return 'N/A'
    const date = new Date(dateString)
    return date.toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  }

  // Calculate call duration
  const calculateDuration = (started?: string, ended?: string) => {
    if (!started || !ended) return 'N/A'
    const start = new Date(started).getTime()
    const end = new Date(ended).getTime()
    const minutes = Math.floor((end - start) / 60000)
    return `${minutes}m`
  }

  if (isLoading && conversations.length === 0) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="w-8 h-8 text-primary-600 animate-spin" />
          <p className="text-sm text-slate-600">Loading conversations...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="p-6 space-y-6">
      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white rounded-lg border border-slate-200 p-4">
          <p className="text-sm text-slate-600">Total Conversations</p>
          <p className="text-2xl font-bold text-slate-800">{stats.total}</p>
        </div>
        <div className="bg-white rounded-lg border border-slate-200 p-4">
          <div className="flex items-center gap-3">
            <CheckCircle className="w-5 h-5 text-green-600" />
            <div>
              <p className="text-sm text-slate-600">Qualified Leads</p>
              <p className="text-2xl font-bold text-green-600">{stats.qualified}</p>
            </div>
          </div>
        </div>
        <div className="bg-white rounded-lg border border-slate-200 p-4">
          <div className="flex items-center gap-3">
            <TrendingUp className="w-5 h-5 text-blue-600" />
            <div>
              <p className="text-sm text-slate-600">Appointments Set</p>
              <p className="text-2xl font-bold text-blue-600">{stats.appointments}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-lg border border-slate-200 p-4">
        <p className="text-sm font-medium text-slate-700 mb-3">Filter by Outcome:</p>
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => setOutcomeFilter('all')}
            className={`px-3 py-1.5 text-sm rounded-lg transition-colors ${
              outcomeFilter === 'all'
                ? 'bg-primary-600 text-white'
                : 'border border-slate-300 text-slate-700 hover:bg-slate-50'
            }`}
          >
            All
          </button>
          {Object.entries(OUTCOME_LABELS).map(([key, label]) => (
            <button
              key={key}
              onClick={() => setOutcomeFilter(key as OutcomeFilter)}
              className={`px-3 py-1.5 text-sm rounded-lg transition-colors ${
                outcomeFilter === key
                  ? 'bg-primary-600 text-white'
                  : 'border border-slate-300 text-slate-700 hover:bg-slate-50'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Conversations List */}
      {conversations.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 text-slate-500">
          <MessageCircle className="w-12 h-12 mb-3 opacity-50" />
          <p className="text-center">No conversations found</p>
        </div>
      ) : (
        <div className="space-y-3">
          {conversations.map(conversation => (
            <div key={conversation.id} className="bg-white rounded-lg border border-slate-200 overflow-hidden">
              {/* Collapsed Header */}
              <button
                onClick={() => handleExpandConversation(conversation.id)}
                className="w-full px-4 py-4 flex items-center justify-between hover:bg-slate-50 transition-colors"
              >
                <div className="flex items-center gap-4 flex-1 text-left">
                  <Phone className="w-5 h-5 text-slate-400 flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      <p className="font-medium text-slate-800">{formatPhone(conversation.caller_phone)}</p>
                      {conversation.agent_name && (
                        <span className="text-sm text-slate-600">• {conversation.agent_name}</span>
                      )}
                    </div>
                    <div className="flex items-center gap-2 flex-wrap text-sm">
                      {conversation.caller_mood && (
                        <span className={`px-2 py-0.5 text-xs font-medium rounded-full ${MOOD_COLORS[conversation.caller_mood] || 'bg-slate-100 text-slate-700'}`}>
                          {conversation.caller_mood}
                        </span>
                      )}
                      {conversation.deal_eagerness && (
                        <span className={`px-2 py-0.5 text-xs font-medium rounded-full ${EAGERNESS_COLORS[conversation.deal_eagerness] || 'bg-slate-100 text-slate-700'}`}>
                          Eagerness: {conversation.deal_eagerness}
                        </span>
                      )}
                      {conversation.outcome && (
                        <span className={`px-2 py-0.5 text-xs font-medium rounded-full ${OUTCOME_COLORS[conversation.outcome] || 'bg-slate-100 text-slate-700'}`}>
                          {OUTCOME_LABELS[conversation.outcome] || conversation.outcome}
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-slate-500 mt-1">
                      {formatDateTime(conversation.started_at)} • {calculateDuration(conversation.started_at, conversation.ended_at)}
                    </p>
                  </div>
                </div>
                <div>
                  {expandedConvId === conversation.id ? (
                    <ChevronUp className="w-5 h-5 text-slate-400" />
                  ) : (
                    <ChevronDown className="w-5 h-5 text-slate-400" />
                  )}
                </div>
              </button>

              {/* Expanded Details */}
              {expandedConvId === conversation.id && selectedConversation && (
                <div className="border-t border-slate-200 p-4 space-y-4 bg-slate-50">
                  {/* Summary */}
                  {selectedConversation.summary && (
                    <div>
                      <h4 className="font-semibold text-slate-800 mb-2">Summary</h4>
                      <p className="text-sm text-slate-700 bg-white rounded p-3 border border-slate-200">
                        {selectedConversation.summary}
                      </p>
                    </div>
                  )}

                  {/* Extracted Data */}
                  {selectedConversation.extracted_data && Object.keys(selectedConversation.extracted_data).length > 0 && (
                    <div>
                      <h4 className="font-semibold text-slate-800 mb-2">Extracted Data</h4>
                      <div className="bg-white rounded p-3 border border-slate-200 space-y-2">
                        {Object.entries(selectedConversation.extracted_data).map(([key, value]) => (
                          <div key={key} className="text-sm">
                            <span className="font-medium text-slate-700">{key}:</span>
                            <span className="text-slate-600 ml-2">{String(value)}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Transcript */}
                  {selectedConversation.transcript && selectedConversation.transcript.length > 0 && (
                    <div>
                      <h4 className="font-semibold text-slate-800 mb-2">Transcript</h4>
                      <div className="space-y-3 max-h-96 overflow-y-auto">
                        {selectedConversation.transcript.map((msg, idx) => (
                          <div
                            key={idx}
                            className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
                          >
                            <div
                              className={`max-w-xs px-3 py-2 rounded-lg text-sm ${
                                msg.role === 'user'
                                  ? 'bg-primary-600 text-white'
                                  : 'bg-white border border-slate-200 text-slate-800'
                              }`}
                            >
                              <p className="whitespace-pre-wrap">{msg.content}</p>
                              {msg.timestamp && (
                                <p className={`text-xs mt-1 ${msg.role === 'user' ? 'text-primary-100' : 'text-slate-500'}`}>
                                  {new Date(msg.timestamp).toLocaleTimeString()}
                                </p>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
