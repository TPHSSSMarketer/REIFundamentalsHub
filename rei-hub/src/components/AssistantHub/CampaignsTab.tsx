'use client'

import { useState, useEffect } from 'react'
import {
  Loader2,
  Plus,
  Play,
  Pause,
  Trash2,
  Phone,
  Calendar,
  ChevronDown,
  ChevronUp,
  AlertCircle,
  TrendingUp,
} from 'lucide-react'
import { toast } from 'sonner'
import {
  getCallbacks,
  createCallback,
  updateCallback,
  cancelCallback,
  getCampaigns,
  createCampaign,
  startCampaign,
  pauseCampaign,
  getCampaignContacts,
  getAgents,
  type ScheduledCallback,
  type CallCampaign,
  type CampaignContact,
  type CreateCallbackPayload,
  type CreateCampaignPayload,
  type AiAgent,
} from '@/services/voiceAiApi'

const DAYS_OF_WEEK = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']

export default function CampaignsTab() {
  const [callbacks, setCallbacks] = useState<ScheduledCallback[]>([])
  const [campaigns, setCampaigns] = useState<CallCampaign[]>([])
  const [agents, setAgents] = useState<AiAgent[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [isDeleting, setIsDeleting] = useState<string | null>(null)
  const [expandedCampaignId, setExpandedCampaignId] = useState<string | null>(null)
  const [campaignContacts, setCampaignContacts] = useState<Record<string, CampaignContact[]>>({})

  // Callback form state
  const [showCallbackForm, setShowCallbackForm] = useState(false)
  const [callbackForm, setCallbackForm] = useState<CreateCallbackPayload>({
    contact_phone: '',
    contact_name: '',
    contact_email: '',
    property_address: '',
    scheduled_at: '',
    callback_type: 'ai',
  })

  // Campaign form state
  const [showCampaignForm, setShowCampaignForm] = useState(false)
  const [campaignForm, setCampaignForm] = useState<CreateCampaignPayload>({
    name: '',
    calling_window_start: '09:00',
    calling_window_end: '17:00',
    calling_days: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'],
    seconds_between_calls: 60,
  })

  useEffect(() => {
    loadData()
  }, [])

  const loadData = async () => {
    setIsLoading(true)
    try {
      const [callbacksData, campaignsData, agentsData] = await Promise.all([
        getCallbacks(),
        getCampaigns(),
        getAgents(),
      ])
      setCallbacks(callbacksData)
      setCampaigns(campaignsData)
      setAgents(agentsData)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to load data')
    } finally {
      setIsLoading(false)
    }
  }

  // Callbacks
  const handleAddCallback = async () => {
    if (!callbackForm.contact_phone.trim() || !callbackForm.scheduled_at) {
      toast.error('Please fill in required fields')
      return
    }

    setIsSaving(true)
    try {
      await createCallback(callbackForm)
      toast.success('Callback scheduled successfully')
      setCallbackForm({
        contact_phone: '',
        contact_name: '',
        contact_email: '',
        property_address: '',
        scheduled_at: '',
        callback_type: 'ai',
      })
      setShowCallbackForm(false)
      await loadData()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to schedule callback')
    } finally {
      setIsSaving(false)
    }
  }

  const handleCancelCallback = async (callbackId: string) => {
    setIsDeleting(callbackId)
    try {
      await cancelCallback(callbackId)
      setCallbacks(prev => prev.filter(c => c.id !== callbackId))
      toast.success('Callback cancelled')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to cancel callback')
    } finally {
      setIsDeleting(null)
    }
  }

  // Campaigns
  const handleCreateCampaign = async () => {
    if (!campaignForm.name.trim()) {
      toast.error('Please enter campaign name')
      return
    }

    setIsSaving(true)
    try {
      await createCampaign(campaignForm)
      toast.success('Campaign created successfully')
      setCampaignForm({
        name: '',
        calling_window_start: '09:00',
        calling_window_end: '17:00',
        calling_days: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'],
        seconds_between_calls: 60,
      })
      setShowCampaignForm(false)
      await loadData()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to create campaign')
    } finally {
      setIsSaving(false)
    }
  }

  const handleStartCampaign = async (campaignId: string) => {
    setIsSaving(true)
    try {
      await startCampaign(campaignId)
      const updated = await getCampaigns()
      setCampaigns(updated)
      toast.success('Campaign started')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to start campaign')
    } finally {
      setIsSaving(false)
    }
  }

  const handlePauseCampaign = async (campaignId: string) => {
    setIsSaving(true)
    try {
      await pauseCampaign(campaignId)
      const updated = await getCampaigns()
      setCampaigns(updated)
      toast.success('Campaign paused')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to pause campaign')
    } finally {
      setIsSaving(false)
    }
  }

  const handleExpandCampaign = async (campaignId: string) => {
    if (expandedCampaignId === campaignId) {
      setExpandedCampaignId(null)
    } else {
      setExpandedCampaignId(campaignId)
      try {
        const contacts = await getCampaignContacts(campaignId)
        setCampaignContacts(prev => ({
          ...prev,
          [campaignId]: contacts,
        }))
      } catch (error) {
        toast.error(error instanceof Error ? error.message : 'Failed to load campaign contacts')
      }
    }
  }

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

  const formatPhone = (phone?: string) => {
    if (!phone) return 'N/A'
    const cleaned = phone.replace(/\D/g, '')
    if (cleaned.length === 10) {
      return `(${cleaned.slice(0, 3)}) ${cleaned.slice(3, 6)}-${cleaned.slice(6)}`
    }
    return phone
  }

  const getProgressPercentage = (campaign: CallCampaign) => {
    if (campaign.total_contacts === 0) return 0
    return Math.round((campaign.calls_made / campaign.total_contacts) * 100)
  }

  const getAgentName = (agentId?: string) => {
    if (!agentId) return 'Any'
    const agent = agents.find(a => a.id === agentId)
    return agent?.name || 'Unknown'
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="w-8 h-8 text-primary-600 animate-spin" />
          <p className="text-sm text-slate-600">Loading campaigns and callbacks...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="p-6 space-y-6">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* LEFT COLUMN - CALLBACKS */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-semibold text-slate-800 flex items-center gap-2">
              <Calendar className="w-5 h-5" />
              Scheduled Callbacks
            </h3>
            <button
              onClick={() => setShowCallbackForm(!showCallbackForm)}
              className="flex items-center gap-2 px-3 py-1.5 bg-primary-600 text-white rounded-lg hover:bg-primary-700 text-sm"
            >
              <Plus className="w-4 h-4" />
              Schedule
            </button>
          </div>

          {/* Callback Form */}
          {showCallbackForm && (
            <div className="bg-white rounded-lg border border-slate-200 p-4 space-y-3">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Contact Phone *</label>
                <input
                  type="tel"
                  value={callbackForm.contact_phone}
                  onChange={(e) => setCallbackForm(prev => ({ ...prev, contact_phone: e.target.value }))}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                  placeholder="(555) 123-4567"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Contact Name</label>
                <input
                  type="text"
                  value={callbackForm.contact_name || ''}
                  onChange={(e) => setCallbackForm(prev => ({ ...prev, contact_name: e.target.value }))}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                  placeholder="John Doe"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Email</label>
                <input
                  type="email"
                  value={callbackForm.contact_email || ''}
                  onChange={(e) => setCallbackForm(prev => ({ ...prev, contact_email: e.target.value }))}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                  placeholder="john@example.com"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Property Address</label>
                <input
                  type="text"
                  value={callbackForm.property_address || ''}
                  onChange={(e) => setCallbackForm(prev => ({ ...prev, property_address: e.target.value }))}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                  placeholder="123 Main St"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Schedule Date & Time *</label>
                <input
                  type="datetime-local"
                  value={callbackForm.scheduled_at}
                  onChange={(e) => setCallbackForm(prev => ({ ...prev, scheduled_at: e.target.value }))}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                />
              </div>

              <div className="flex gap-2 pt-2">
                <button
                  onClick={handleAddCallback}
                  disabled={isSaving}
                  className="flex items-center gap-2 px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 disabled:opacity-50 text-sm"
                >
                  {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                  Schedule
                </button>
                <button
                  onClick={() => setShowCallbackForm(false)}
                  className="px-4 py-2 border border-slate-300 text-slate-700 rounded-lg hover:bg-slate-50 text-sm"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}

          {/* Callbacks List */}
          <div className="space-y-2">
            {callbacks.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-8 text-slate-500">
                <AlertCircle className="w-10 h-10 mb-2 opacity-50" />
                <p className="text-sm">No scheduled callbacks</p>
              </div>
            ) : (
              callbacks.map(callback => (
                <div key={callback.id} className="bg-white rounded-lg border border-slate-200 p-3">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <p className="font-medium text-slate-800">{callback.contact_name || formatPhone(callback.contact_phone)}</p>
                      <p className="text-sm text-slate-600">{formatPhone(callback.contact_phone)}</p>
                      <p className="text-xs text-slate-500 mt-1">
                        {formatDateTime(callback.scheduled_at)}
                      </p>
                      <div className="flex items-center gap-2 mt-1">
                        <span className={`px-2 py-0.5 text-xs font-medium rounded-full ${
                          callback.status === 'scheduled' ? 'bg-blue-100 text-blue-700' :
                          callback.status === 'completed' ? 'bg-green-100 text-green-700' :
                          'bg-slate-100 text-slate-700'
                        }`}>
                          {callback.status}
                        </span>
                      </div>
                    </div>
                    <button
                      onClick={() => handleCancelCallback(callback.id)}
                      disabled={isDeleting === callback.id}
                      className="text-red-600 hover:text-red-700 disabled:opacity-50 p-1"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* RIGHT COLUMN - CAMPAIGNS */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-semibold text-slate-800 flex items-center gap-2">
              <TrendingUp className="w-5 h-5" />
              Call Campaigns
            </h3>
            <button
              onClick={() => setShowCampaignForm(!showCampaignForm)}
              className="flex items-center gap-2 px-3 py-1.5 bg-primary-600 text-white rounded-lg hover:bg-primary-700 text-sm"
            >
              <Plus className="w-4 h-4" />
              New Campaign
            </button>
          </div>

          {/* Campaign Form */}
          {showCampaignForm && (
            <div className="bg-white rounded-lg border border-slate-200 p-4 space-y-3">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Campaign Name *</label>
                <input
                  type="text"
                  value={campaignForm.name}
                  onChange={(e) => setCampaignForm(prev => ({ ...prev, name: e.target.value }))}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                  placeholder="Summer Outreach 2024"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Agent</label>
                <select
                  value={campaignForm.agent_id || ''}
                  onChange={(e) => setCampaignForm(prev => ({ ...prev, agent_id: e.target.value }))}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                >
                  <option value="">Select Agent (Optional)</option>
                  {agents.map(agent => (
                    <option key={agent.id} value={agent.id}>{agent.name}</option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Start Time</label>
                  <input
                    type="time"
                    value={campaignForm.calling_window_start || '09:00'}
                    onChange={(e) => setCampaignForm(prev => ({ ...prev, calling_window_start: e.target.value }))}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">End Time</label>
                  <input
                    type="time"
                    value={campaignForm.calling_window_end || '17:00'}
                    onChange={(e) => setCampaignForm(prev => ({ ...prev, calling_window_end: e.target.value }))}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">Calling Days</label>
                <div className="grid grid-cols-2 gap-2">
                  {DAYS_OF_WEEK.map(day => (
                    <label key={day} className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={campaignForm.calling_days?.includes(day) || false}
                        onChange={(e) => {
                          const days = campaignForm.calling_days || []
                          if (e.target.checked) {
                            setCampaignForm(prev => ({ ...prev, calling_days: [...days, day] }))
                          } else {
                            setCampaignForm(prev => ({ ...prev, calling_days: days.filter(d => d !== day) }))
                          }
                        }}
                        className="w-4 h-4 rounded border-slate-300"
                      />
                      <span className="text-sm text-slate-700">{day}</span>
                    </label>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Seconds Between Calls</label>
                <input
                  type="number"
                  value={campaignForm.seconds_between_calls || 60}
                  onChange={(e) => setCampaignForm(prev => ({ ...prev, seconds_between_calls: parseInt(e.target.value) }))}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                  min="30"
                />
              </div>

              <div className="flex gap-2 pt-2">
                <button
                  onClick={handleCreateCampaign}
                  disabled={isSaving}
                  className="flex items-center gap-2 px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 disabled:opacity-50 text-sm"
                >
                  {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                  Create
                </button>
                <button
                  onClick={() => setShowCampaignForm(false)}
                  className="px-4 py-2 border border-slate-300 text-slate-700 rounded-lg hover:bg-slate-50 text-sm"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}

          {/* Campaigns List */}
          <div className="space-y-2">
            {campaigns.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-8 text-slate-500">
                <AlertCircle className="w-10 h-10 mb-2 opacity-50" />
                <p className="text-sm">No campaigns created yet</p>
              </div>
            ) : (
              campaigns.map(campaign => (
                <div key={campaign.id} className="bg-white rounded-lg border border-slate-200 overflow-hidden">
                  {/* Campaign Header */}
                  <button
                    onClick={() => handleExpandCampaign(campaign.id)}
                    className="w-full px-4 py-3 flex items-center justify-between hover:bg-slate-50 transition-colors"
                  >
                    <div className="flex-1 text-left">
                      <div className="flex items-center gap-2 mb-1">
                        <p className="font-medium text-slate-800">{campaign.name}</p>
                        <span className={`px-2 py-0.5 text-xs font-medium rounded-full ${
                          campaign.status === 'running' ? 'bg-green-100 text-green-700' :
                          campaign.status === 'paused' ? 'bg-yellow-100 text-yellow-700' :
                          campaign.status === 'completed' ? 'bg-blue-100 text-blue-700' :
                          'bg-slate-100 text-slate-700'
                        }`}>
                          {campaign.status}
                        </span>
                      </div>

                      {/* Progress Bar */}
                      <div className="mb-2">
                        <div className="w-full bg-slate-200 rounded-full h-2 overflow-hidden">
                          <div
                            className="bg-primary-600 h-full transition-all"
                            style={{ width: `${getProgressPercentage(campaign)}%` }}
                          />
                        </div>
                        <p className="text-xs text-slate-600 mt-1">
                          {campaign.calls_made} / {campaign.total_contacts} calls ({getProgressPercentage(campaign)}%)
                        </p>
                      </div>

                      {/* Stats */}
                      <div className="grid grid-cols-3 gap-2 text-xs">
                        <div>
                          <span className="text-slate-600">Answered:</span>
                          <p className="font-medium text-slate-800">{campaign.calls_answered}</p>
                        </div>
                        <div>
                          <span className="text-slate-600">Qualified:</span>
                          <p className="font-medium text-green-600">{campaign.leads_qualified}</p>
                        </div>
                        <div>
                          <span className="text-slate-600">Appointments:</span>
                          <p className="font-medium text-blue-600">{campaign.appointments_set}</p>
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      {campaign.status === 'running' ? (
                        <button
                          onClick={(e) => {
                            e.stopPropagation()
                            handlePauseCampaign(campaign.id)
                          }}
                          disabled={isSaving}
                          className="p-2 text-yellow-600 hover:bg-yellow-50 rounded disabled:opacity-50"
                          title="Pause campaign"
                        >
                          <Pause className="w-4 h-4" />
                        </button>
                      ) : campaign.status === 'draft' || campaign.status === 'paused' ? (
                        <button
                          onClick={(e) => {
                            e.stopPropagation()
                            handleStartCampaign(campaign.id)
                          }}
                          disabled={isSaving}
                          className="p-2 text-green-600 hover:bg-green-50 rounded disabled:opacity-50"
                          title="Start campaign"
                        >
                          <Play className="w-4 h-4" />
                        </button>
                      ) : null}

                      {expandedCampaignId === campaign.id ? (
                        <ChevronUp className="w-5 h-5 text-slate-400" />
                      ) : (
                        <ChevronDown className="w-5 h-5 text-slate-400" />
                      )}
                    </div>
                  </button>

                  {/* Campaign Contacts */}
                  {expandedCampaignId === campaign.id && (
                    <div className="border-t border-slate-200 p-4 bg-slate-50 space-y-3">
                      <h4 className="font-semibold text-slate-800 text-sm">Campaign Contacts ({campaignContacts[campaign.id]?.length || 0})</h4>
                      <div className="space-y-2 max-h-64 overflow-y-auto">
                        {campaignContacts[campaign.id]?.length === 0 ? (
                          <p className="text-sm text-slate-600">No contacts in this campaign</p>
                        ) : (
                          campaignContacts[campaign.id]?.map(contact => (
                            <div key={contact.id} className="bg-white rounded p-2 text-sm border border-slate-200">
                              <div className="flex justify-between items-start">
                                <div>
                                  <p className="font-medium text-slate-800">{contact.contact_name || formatPhone(contact.contact_phone)}</p>
                                  <p className="text-xs text-slate-600">{formatPhone(contact.contact_phone)}</p>
                                </div>
                                <span className={`px-2 py-0.5 text-xs font-medium rounded-full ${
                                  contact.outcome === 'qualified' ? 'bg-green-100 text-green-700' :
                                  contact.outcome === 'appointment' ? 'bg-blue-100 text-blue-700' :
                                  contact.outcome === 'not_interested' ? 'bg-red-100 text-red-700' :
                                  'bg-slate-100 text-slate-700'
                                }`}>
                                  {contact.outcome || contact.status}
                                </span>
                              </div>
                            </div>
                          ))
                        )}
                      </div>
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
