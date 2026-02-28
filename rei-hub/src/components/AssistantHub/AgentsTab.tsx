'use client'

import { useState, useEffect } from 'react'
import {
  Loader2,
  Save,
  Zap,
  Settings2,
  ChevronDown,
  ChevronUp,
  Volume2,
} from 'lucide-react'
import { toast } from 'sonner'
import {
  getAgents,
  updateAgent,
  provisionAgent,
  getVoices,
  type AiAgent,
  type ElevenLabsVoice,
  type UpdateAgentPayload,
} from '@/services/voiceAiApi'

export default function AgentsTab() {
  const [agents, setAgents] = useState<AiAgent[]>([])
  const [voices, setVoices] = useState<ElevenLabsVoice[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [expandedAgentId, setExpandedAgentId] = useState<string | null>(null)
  const [isSaving, setIsSaving] = useState(false)
  const [isProvisioning, setIsProvisioning] = useState<string | null>(null)

  // Edit form state
  const [editFormData, setEditFormData] = useState<Record<string, UpdateAgentPayload>>({})

  useEffect(() => {
    loadData()
  }, [])

  const loadData = async () => {
    setIsLoading(true)
    try {
      const [agentsData, voicesData] = await Promise.all([
        getAgents(),
        getVoices(),
      ])
      setAgents(agentsData)
      setVoices(voicesData)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to load agents')
    } finally {
      setIsLoading(false)
    }
  }

  const handleExpand = (agentId: string) => {
    if (expandedAgentId === agentId) {
      setExpandedAgentId(null)
    } else {
      setExpandedAgentId(agentId)
      // Initialize form data if not already done
      if (!editFormData[agentId]) {
        const agent = agents.find(a => a.id === agentId)
        if (agent) {
          setEditFormData(prev => ({
            ...prev,
            [agentId]: {
              personality: agent.personality || '',
              system_prompt: agent.system_prompt || '',
              first_message: agent.first_message || '',
              elevenlabs_voice_id: agent.elevenlabs_voice_id || '',
            },
          }))
        }
      }
    }
  }

  const handleFormChange = (agentId: string, field: string, value: string | boolean) => {
    setEditFormData(prev => ({
      ...prev,
      [agentId]: {
        ...prev[agentId],
        [field]: value,
      },
    }))
  }

  const handleSaveAgent = async (agentId: string) => {
    setIsSaving(true)
    try {
      const formData = editFormData[agentId]
      if (!formData) return

      await updateAgent(agentId, formData)

      // Update local state
      setAgents(prev =>
        prev.map(a =>
          a.id === agentId
            ? { ...a, ...formData }
            : a
        )
      )

      toast.success('Agent updated successfully')
      setExpandedAgentId(null)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to save agent')
    } finally {
      setIsSaving(false)
    }
  }

  const handleProvisionAgent = async (agentId: string) => {
    setIsProvisioning(agentId)
    try {
      await provisionAgent(agentId)

      // Reload agents to get updated elevenlabs_agent_id
      const updatedAgents = await getAgents()
      setAgents(updatedAgents)

      toast.success('Agent provisioned successfully')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to provision agent')
    } finally {
      setIsProvisioning(null)
    }
  }

  const handleToggleActive = (agentId: string) => {
    const agent = agents.find(a => a.id === agentId)
    if (!agent) return

    handleFormChange(agentId, 'is_active', !agent.is_active)
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="w-8 h-8 text-primary-600 animate-spin" />
          <p className="text-sm text-slate-600">Loading agents...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="p-6 space-y-4">
      {/* Stats */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        <div className="bg-white rounded-lg border border-slate-200 p-4">
          <p className="text-sm text-slate-600">Total Agents</p>
          <p className="text-2xl font-bold text-slate-800">{agents.length}</p>
        </div>
        <div className="bg-white rounded-lg border border-slate-200 p-4">
          <p className="text-sm text-slate-600">Active</p>
          <p className="text-2xl font-bold text-green-600">{agents.filter(a => a.is_active).length}</p>
        </div>
        <div className="bg-white rounded-lg border border-slate-200 p-4">
          <p className="text-sm text-slate-600">Provisioned</p>
          <p className="text-2xl font-bold text-blue-600">{agents.filter(a => a.elevenlabs_agent_id).length}</p>
        </div>
      </div>

      {/* Agents List */}
      <div className="space-y-3">
        {agents.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-slate-500">
            <Settings2 className="w-12 h-12 mb-3 opacity-50" />
            <p className="text-center">No agents found</p>
          </div>
        ) : (
          agents.map(agent => (
            <div key={agent.id} className="bg-white rounded-lg border border-slate-200 overflow-hidden">
              {/* Collapsed Header */}
              <button
                onClick={() => handleExpand(agent.id)}
                className="w-full px-4 py-4 flex items-center justify-between hover:bg-slate-50 transition-colors"
              >
                <div className="flex items-center gap-4 flex-1 text-left">
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <h3 className="font-semibold text-slate-800">{agent.name}</h3>
                      <span className={`px-2 py-0.5 text-xs font-medium rounded-full ${
                        agent.is_active
                          ? 'bg-green-100 text-green-700'
                          : 'bg-slate-100 text-slate-600'
                      }`}>
                        {agent.is_active ? 'Active' : 'Inactive'}
                      </span>
                      {agent.elevenlabs_agent_id && (
                        <span className="px-2 py-0.5 text-xs font-medium bg-blue-100 text-blue-700 rounded-full">
                          Provisioned
                        </span>
                      )}
                    </div>
                    <p className="text-sm text-slate-600 mt-0.5">{agent.role}</p>
                    {agent.personality && (
                      <p className="text-sm text-slate-500 mt-1 line-clamp-1">{agent.personality}</p>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  {agent.elevenlabs_voice_id && (
                    <div className="flex items-center gap-1 px-2 py-1 bg-slate-100 rounded text-xs text-slate-600">
                      <Volume2 className="w-3 h-3" />
                      Voice Assigned
                    </div>
                  )}
                  {expandedAgentId === agent.id ? (
                    <ChevronUp className="w-5 h-5 text-slate-400" />
                  ) : (
                    <ChevronDown className="w-5 h-5 text-slate-400" />
                  )}
                </div>
              </button>

              {/* Expanded Form */}
              {expandedAgentId === agent.id && (
                <div className="border-t border-slate-200 p-4 space-y-4 bg-slate-50">
                  {/* Active Toggle */}
                  <div className="flex items-center justify-between">
                    <label className="text-sm font-medium text-slate-700">Status</label>
                    <button
                      onClick={() => handleToggleActive(agent.id)}
                      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                        editFormData[agent.id]?.is_active !== false
                          ? 'bg-green-500'
                          : 'bg-slate-300'
                      }`}
                    >
                      <span
                        className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                          editFormData[agent.id]?.is_active !== false
                            ? 'translate-x-6'
                            : 'translate-x-1'
                        }`}
                      />
                    </button>
                  </div>

                  {/* Personality */}
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">
                      Personality
                    </label>
                    <textarea
                      rows={3}
                      value={editFormData[agent.id]?.personality || ''}
                      onChange={(e) => handleFormChange(agent.id, 'personality', e.target.value)}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 resize-none"
                      placeholder="Describe the agent's personality and tone..."
                    />
                  </div>

                  {/* System Prompt */}
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">
                      System Prompt
                    </label>
                    <textarea
                      rows={4}
                      value={editFormData[agent.id]?.system_prompt || ''}
                      onChange={(e) => handleFormChange(agent.id, 'system_prompt', e.target.value)}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 resize-none"
                      placeholder="System prompt for the AI agent..."
                    />
                  </div>

                  {/* First Message */}
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">
                      First Message
                    </label>
                    <input
                      type="text"
                      value={editFormData[agent.id]?.first_message || ''}
                      onChange={(e) => handleFormChange(agent.id, 'first_message', e.target.value)}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                      placeholder="Message to start the conversation..."
                    />
                  </div>

                  {/* Voice Selection */}
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">
                      Voice
                    </label>
                    <select
                      value={editFormData[agent.id]?.elevenlabs_voice_id || ''}
                      onChange={(e) => handleFormChange(agent.id, 'elevenlabs_voice_id', e.target.value)}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                    >
                      <option value="">Select a voice...</option>
                      {voices.map(voice => (
                        <option key={voice.voice_id} value={voice.voice_id}>
                          {voice.name}
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Action Buttons */}
                  <div className="flex gap-3 pt-4">
                    <button
                      onClick={() => handleSaveAgent(agent.id)}
                      disabled={isSaving}
                      className="flex items-center gap-2 px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {isSaving ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <Save className="w-4 h-4" />
                      )}
                      Save Changes
                    </button>

                    {!agent.elevenlabs_agent_id && (
                      <button
                        onClick={() => handleProvisionAgent(agent.id)}
                        disabled={isProvisioning === agent.id}
                        className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        {isProvisioning === agent.id ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                          <Zap className="w-4 h-4" />
                        )}
                        Provision Agent
                      </button>
                    )}
                  </div>
                </div>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  )
}
