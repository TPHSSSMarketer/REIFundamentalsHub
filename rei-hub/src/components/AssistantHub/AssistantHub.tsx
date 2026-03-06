import { useState, useEffect } from 'react'
import {
  Mic, Phone, PhoneCall, Clock, Users, MessageSquare, Mail, Send, Search,
  Loader2, Bot, Sparkles, BookOpen, History, Megaphone, Globe, List,
  GitBranch, FileText, MessageCircle, Headphones, ChevronRight,
} from 'lucide-react'
import { toast } from 'sonner'
import { useContacts, useSendSMS, useSendEmail } from '@/hooks/useApi'
import { formatPhone } from '@/utils/helpers'
import { aiChat, AiServiceError, extractContactData } from '../../services/aiService'
import type { Contact } from '@/types'

// Voice sub-tabs (existing)
import AgentsTab from './AgentsTab'
import KnowledgeBaseTab from './KnowledgeBaseTab'
import ConversationsTab from './ConversationsTab'
import CampaignsTab from './CampaignsTab'

// Email Marketing tabs (extracted from EmailMarketingPage)
import {
  DomainsTab,
  ListsSubscribersTab,
  EmailCampaignsTab,
  SequencesTab,
  TemplatesTab,
} from './EmailTabs'

// SMS Marketing tabs (extracted from PhonePage)
import SMSCampaignsTab from './SMSTabs/SMSCampaignsTab'

// Voice tabs (extracted from PhonePage)
import VoicemailDropsTab from './VoiceTabs/VoicemailDropsTab'

// Placeholder
import WebChatTab from './WebChatTab'

// Flow Builder tabs (now integrated into AssistantHub)
import FlowList from '../FlowBuilder/FlowList'
import PersonaManager from '../FlowBuilder/PersonaManager'
import ExecutionHistory from '../FlowBuilder/ExecutionHistory'
import WebchatConfig from '../FlowBuilder/WebchatConfig'

// Unified persona + voice hooks (replaces hardcoded personas)
import { usePersonas, useVoices } from '@/hooks/useFlowBuilder'
import type { ElevenLabsVoice } from '@/hooks/useFlowBuilder'
import type { Persona as DBPersona } from '@/types'

// ── Tab Group Definitions ─────────────────────────────────────

type TabGroup = 'email' | 'sms' | 'voice' | 'webchat' | 'knowledge' | 'flows'

type EmailSubTab = 'domains' | 'lists' | 'campaigns' | 'sequences' | 'templates'
type SMSSubTab = 'sms-campaigns'
type VoiceSubTab = 'callcommander' | 'agents' | 'voicemail-drops' | 'voice-campaigns' | 'conversations'
type WebChatSubTab = 'settings'
type KnowledgeSubTab = 'knowledge-base'
type FlowsSubTab = 'my-flows' | 'flow-personas' | 'exec-history' | 'widget-config'

const TAB_GROUPS: { id: TabGroup; label: string; icon: React.ElementType; subTabs: { id: string; label: string; icon: React.ElementType }[] }[] = [
  {
    id: 'voice', label: 'VoiceAI', icon: Mic,
    subTabs: [
      { id: 'callcommander', label: 'CallCommander AI', icon: Headphones },
      { id: 'agents', label: 'AI Agents', icon: Bot },
      { id: 'voicemail-drops', label: 'Voicemail Drops', icon: Phone },
      { id: 'voice-campaigns', label: 'Campaigns', icon: Megaphone },
      { id: 'conversations', label: 'Conversations', icon: History },
    ],
  },
  {
    id: 'sms', label: 'SMS Marketing', icon: MessageSquare,
    subTabs: [
      { id: 'sms-campaigns', label: 'SMS Campaigns', icon: Megaphone },
    ],
  },
  {
    id: 'webchat', label: 'Web Chat', icon: MessageCircle,
    subTabs: [
      { id: 'settings', label: 'Settings', icon: Globe },
    ],
  },
  {
    id: 'email', label: 'Email Marketing', icon: Mail,
    subTabs: [
      { id: 'domains', label: 'Domains', icon: Globe },
      { id: 'lists', label: 'Lists & Subscribers', icon: List },
      { id: 'campaigns', label: 'Campaigns', icon: Send },
      { id: 'sequences', label: 'Sequences', icon: GitBranch },
      { id: 'templates', label: 'Templates', icon: FileText },
    ],
  },
  {
    id: 'knowledge', label: 'Knowledge Base', icon: BookOpen,
    subTabs: [
      { id: 'knowledge-base', label: 'Knowledge Base', icon: BookOpen },
    ],
  },
  {
    id: 'flows', label: 'Flow Builder', icon: GitBranch,
    subTabs: [
      { id: 'my-flows', label: 'My Flows', icon: GitBranch },
      { id: 'flow-personas', label: 'Personas', icon: Bot },
      { id: 'exec-history', label: 'Execution History', icon: History },
      { id: 'widget-config', label: 'Widget Config', icon: Globe },
    ],
  },
]

// Default fallback prompt when no DB personas are loaded yet
const DEFAULT_SYSTEM_PROMPT = 'You are a helpful, professional real estate assistant. Your job is to qualify motivated seller leads — understand their situation, timeline, and motivation. Ask one question at a time. Be conversational, not salesy.'

// ═══════════════════════════════════════════════════════════════
// Main Component
// ═══════════════════════════════════════════════════════════════

export default function AssistantHub() {
  const [activeGroup, setActiveGroup] = useState<TabGroup>('voice')
  const [activeSubTab, setActiveSubTab] = useState<string>('callcommander')
  const [emailProvider, setEmailProvider] = useState('')

  // Unified personas from database (replaces hardcoded Grace/Marcus/Sofia)
  const { data: dbPersonas } = usePersonas()
  // Available voices for showing voice names on persona cards
  const { data: voicesList } = useVoices()
  const getVoiceName = (voiceId?: string) => {
    if (!voiceId || !voicesList) return null
    return voicesList.find((v: ElevenLabsVoice) => v.voice_id === voiceId)?.name ?? null
  }

  // Voice / CallCommander state
  const [activePersona, setActivePersona] = useState('')
  const [conversations, setConversations] = useState<Record<string, Array<{ role: 'user' | 'assistant'; content: string }>>>({})
  const [chatInput, setChatInput] = useState('')
  const [isChatLoading, setIsChatLoading] = useState(false)
  const [activeLead, setActiveLead] = useState<Contact | null>(null)
  const conversationMessages = activeLead ? (conversations[activeLead.id] ?? []) : []

  // SMS quick-send state
  const [smsContactId, setSmsContactId] = useState('')
  const [smsMessage, setSmsMessage] = useState('')
  const [smsSearch, setSmsSearch] = useState('')
  const [isSmsAiLoading, setIsSmsAiLoading] = useState(false)

  // Email quick-send state
  const [emailContactId, setEmailContactId] = useState('')
  const [emailSubject, setEmailSubject] = useState('')
  const [emailBody, setEmailBody] = useState('')
  const [emailSearch, setEmailSearch] = useState('')

  const { data: contactsData, isLoading: contactsLoading } = useContacts()
  const sendSMS = useSendSMS()
  const sendEmail = useSendEmail()

  // When switching groups, set first sub-tab
  const handleGroupChange = (group: TabGroup) => {
    setActiveGroup(group)
    const groupDef = TAB_GROUPS.find(g => g.id === group)
    if (groupDef?.subTabs[0]) setActiveSubTab(groupDef.subTabs[0].id)
  }

  // Initialize first sub-tab on mount
  useEffect(() => {
    handleGroupChange('voice')
  }, [])

  // ── Contact search helpers ──────────────────────────────────

  const filteredSmsContacts = contactsData?.filter(
    (c) => c.name.toLowerCase().includes(smsSearch.toLowerCase()) || c.phone.includes(smsSearch)
  )
  const filteredEmailContacts = contactsData?.filter(
    (c) => c.name.toLowerCase().includes(emailSearch.toLowerCase()) || c.email.toLowerCase().includes(emailSearch.toLowerCase())
  )

  // ── Background data extraction (NVIDIA, free) ──────────────

  const _extractContactData = (contactId: string, msgs: Array<{ role: string; content: string }>) => {
    // Fire-and-forget: extract lead info from conversation using NVIDIA (free)
    extractContactData(contactId, msgs).catch(() => {
      // Silently fail — extraction is best-effort
    })
  }

  // ── SMS handlers ────────────────────────────────────────────

  const handleSendSMS = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!smsContactId || !smsMessage.trim()) return
    await sendSMS.mutateAsync({ contactId: smsContactId, message: smsMessage })
    setSmsMessage('')
    setSmsContactId('')
  }

  const handleSmsDraft = async () => {
    if (!smsContactId) return
    const contact = contactsData?.find(c => c.id === smsContactId)
    if (!contact) return
    setIsSmsAiLoading(true)
    try {
      const result = await aiChat([
        { role: 'user', content: `Write a short, friendly SMS message (under 160 characters) to a motivated seller lead named ${contact.name}. The message should re-engage them and invite a quick reply. Do not include any explanation — just the SMS text itself.` },
      ], undefined, 'sms_draft')
      setSmsMessage(result.content)
    } catch (error) {
      if (error instanceof AiServiceError && error.status === 429) {
        toast.error('You\'ve used your monthly AI allowance and have no credits remaining. Buy credits or add your own API key to continue.', { duration: 8000 })
      } else if (error instanceof AiServiceError && error.status === 403) {
        toast.error('AI features coming soon — being upgraded to native AI.')
      } else {
        toast.error(error instanceof Error ? error.message : 'Failed to generate draft')
      }
    } finally {
      setIsSmsAiLoading(false)
    }
  }

  // ── Email handler ───────────────────────────────────────────

  const handleSendEmail = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!emailContactId || !emailSubject.trim() || !emailBody.trim()) return
    await sendEmail.mutateAsync({ contactId: emailContactId, subject: emailSubject, body: emailBody })
    setEmailSubject('')
    setEmailBody('')
    setEmailContactId('')
  }

  // ── Voice / CallCommander handlers ──────────────────────────

  const handleSendChat = async () => {
    if (!chatInput.trim() || isChatLoading) return
    const userMessage = { role: 'user' as const, content: chatInput.trim() }
    setConversations(prev => ({
      ...prev,
      [activeLead!.id]: [...(prev[activeLead!.id] ?? []), userMessage],
    }))
    setChatInput('')
    setIsChatLoading(true)
    try {
      const persona = dbPersonas?.find((p: DBPersona) => p.id === activePersona) ?? dbPersonas?.[0]
      const systemPrompt = persona?.personality_prompt || persona?.system_prompt || DEFAULT_SYSTEM_PROMPT
      const updatedMessages = [...conversationMessages, userMessage]
      // Conversation windowing: only send the last 10 messages to save tokens
      const MAX_HISTORY = 10
      const recentMessages = updatedMessages.slice(-MAX_HISTORY)
      const response = await aiChat(recentMessages, systemPrompt, 'chat', activeLead?.id)
      setConversations(prev => ({
        ...prev,
        [activeLead!.id]: [...(prev[activeLead!.id] ?? []), { role: 'assistant', content: response.content }],
      }))
      // Show usage warning toast if a threshold was crossed
      const warningPct = (response as any).usage?.warning_pct
      if (warningPct) {
        toast.warning(`You've used ${warningPct}% of your monthly AI allowance. Buy credits or add your own API key to avoid interruption.`, { duration: 8000 })
      }
      // Fire-and-forget: extract lead data from conversation via NVIDIA (free)
      if (activeLead) {
        const allMessages = [...conversationMessages, userMessage, { role: 'assistant' as const, content: response.content }]
        _extractContactData(activeLead.id, allMessages)
      }
    } catch (err) {
      if (err instanceof AiServiceError && err.status === 429) {
        toast.error('You\'ve used your monthly AI allowance and have no credits remaining. Buy credits or add your own API key to continue.', { duration: 8000 })
      } else if (err instanceof AiServiceError && err.status === 403) {
        toast.error('AI features coming soon — being upgraded to native AI.')
      } else if (err instanceof Error) {
        toast.error(err.message)
      }
    } finally {
      setIsChatLoading(false)
    }
  }

  const handleGenerateOpener = async () => {
    if (!activeLead || isChatLoading) return
    setIsChatLoading(true)
    try {
      const persona = dbPersonas?.find((p: DBPersona) => p.id === activePersona) ?? dbPersonas?.[0]
      const systemPrompt = persona?.personality_prompt || persona?.system_prompt || DEFAULT_SYSTEM_PROMPT
      const response = await aiChat(
        [{ role: 'user', content: `Generate a warm, professional opening message to qualify a motivated seller lead named ${activeLead.name}. Keep it under 3 sentences.` }],
        systemPrompt,
        'opener',
      )
      setConversations(prev => ({
        ...prev,
        [activeLead!.id]: [...(prev[activeLead!.id] ?? []), { role: 'assistant', content: response.content }],
      }))
    } catch (err) {
      if (err instanceof AiServiceError && err.status === 429) {
        toast.error('You\'ve used your monthly AI allowance and have no credits remaining. Buy credits or add your own API key to continue.', { duration: 8000 })
      } else if (err instanceof AiServiceError && err.status === 403) {
        toast.error('AI features coming soon — being upgraded to native AI.')
      } else if (err instanceof Error) {
        toast.error(err.message)
      }
    } finally {
      setIsChatLoading(false)
    }
  }

  // ── Stats ───────────────────────────────────────────────────

  const stats = {
    totalContacts: contactsData?.length ?? 0,
    hotLeads: contactsData?.filter(c => c.tags.includes('urgent') || c.tags.includes('pre-foreclosure')).length ?? 0,
    motivatedLeads: contactsData?.filter(c => c.tags.includes('motivated')).length ?? 0,
  }

  // ── Current group definition ────────────────────────────────

  const currentGroup = TAB_GROUPS.find(g => g.id === activeGroup)!

  // ═══════════════════════════════════════════════════════════════
  // Render
  // ═══════════════════════════════════════════════════════════════

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-slate-800">AI Studio</h1>
        <p className="text-slate-600">Marketing Command Center — generate and nurture new leads</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white rounded-xl border border-slate-200 p-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-primary-100 rounded-lg"><Users className="w-5 h-5 text-primary-600" /></div>
            <div>
              <p className="text-sm text-slate-500">Total Contacts</p>
              <p className="text-2xl font-bold text-slate-800">{stats.totalContacts}</p>
            </div>
          </div>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 p-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-success-100 rounded-lg"><PhoneCall className="w-5 h-5 text-success-600" /></div>
            <div>
              <p className="text-sm text-slate-500">Hot Leads</p>
              <p className={`text-2xl font-bold ${stats.hotLeads > 0 ? 'text-red-600' : 'text-slate-800'}`}>{stats.hotLeads}</p>
            </div>
          </div>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 p-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-warning-100 rounded-lg"><Sparkles className="w-5 h-5 text-warning-600" /></div>
            <div>
              <p className="text-sm text-slate-500">Motivated</p>
              <p className={`text-2xl font-bold ${stats.motivatedLeads > 0 ? 'text-yellow-600' : 'text-slate-800'}`}>{stats.motivatedLeads}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Group selector (top-level tabs) */}
      <div className="flex gap-2 overflow-x-auto scrollbar-hide pb-1">
        {TAB_GROUPS.map((group) => (
          <button
            key={group.id}
            onClick={() => handleGroupChange(group.id)}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium whitespace-nowrap transition-colors ${
              activeGroup === group.id
                ? 'bg-primary-500 text-white shadow-sm'
                : 'bg-white border border-slate-200 text-slate-600 hover:border-primary-300 hover:text-primary-600'
            }`}
          >
            <group.icon className="w-4 h-4" />
            {group.label}
          </button>
        ))}
      </div>

      {/* Content area with sub-tab navigation */}
      <div className="bg-white rounded-xl border border-slate-200">
        {/* Sub-tab bar */}
        {currentGroup.subTabs.length > 1 && (
          <div className="flex border-b border-slate-200 overflow-x-auto scrollbar-hide">
            {currentGroup.subTabs.map((sub) => (
              <button
                key={sub.id}
                onClick={() => setActiveSubTab(sub.id)}
                className={`flex items-center gap-2 px-5 py-3 text-sm font-medium whitespace-nowrap transition-colors border-b-2 ${
                  activeSubTab === sub.id
                    ? 'border-primary-500 text-primary-600'
                    : 'border-transparent text-slate-500 hover:text-slate-700'
                }`}
              >
                <sub.icon className="w-4 h-4" />
                {sub.label}
              </button>
            ))}
          </div>
        )}

        {/* ── Email Marketing Tabs ───────────────────────────── */}
        {activeGroup === 'email' && activeSubTab === 'domains' && (
          <div className="p-6"><DomainsTab onProviderChange={setEmailProvider} /></div>
        )}
        {activeGroup === 'email' && activeSubTab === 'lists' && (
          <div className="p-6"><ListsSubscribersTab /></div>
        )}
        {activeGroup === 'email' && activeSubTab === 'campaigns' && (
          <div className="p-6"><EmailCampaignsTab provider={emailProvider} /></div>
        )}
        {activeGroup === 'email' && activeSubTab === 'sequences' && (
          <div className="p-6"><SequencesTab /></div>
        )}
        {activeGroup === 'email' && activeSubTab === 'templates' && (
          <div className="p-6"><TemplatesTab /></div>
        )}

        {/* ── SMS Marketing Tab ──────────────────────────────── */}
        {activeGroup === 'sms' && activeSubTab === 'sms-campaigns' && (
          <div className="p-6"><SMSCampaignsTab /></div>
        )}

        {/* ── AI Voice Tabs ──────────────────────────────────── */}
        {activeGroup === 'voice' && activeSubTab === 'callcommander' && (
          <div>
            {/* Persona Selector */}
            <div className="p-4 border-b border-slate-200">
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {dbPersonas?.map((p: DBPersona) => (
                  <button
                    key={p.id}
                    onClick={() => setActivePersona(p.id)}
                    className={`p-3 rounded-lg text-left transition-all ${
                      activePersona === p.id
                        ? 'ring-2 ring-primary-500 bg-primary-50'
                        : 'border border-slate-200 bg-white'
                    }`}
                  >
                    <p className="font-semibold text-slate-800">{p.name}</p>
                    <p className="text-sm text-slate-500">{p.role || p.description || ''}</p>
                    <div className="flex flex-wrap gap-1 mt-1">
                      {p.tone && <span className="text-xs bg-slate-100 text-slate-600 rounded-full px-2 py-0.5">{p.tone}</span>}
                      {getVoiceName(p.elevenlabs_voice_id) ? (
                        <span className="text-xs bg-emerald-50 text-emerald-700 rounded-full px-2 py-0.5">
                          {getVoiceName(p.elevenlabs_voice_id)}
                        </span>
                      ) : (
                        <span className="text-xs bg-slate-50 text-slate-400 rounded-full px-2 py-0.5">No voice</span>
                      )}
                    </div>
                  </button>
                ))}
              </div>
            </div>
            <div className="flex">
              {/* Left Panel - Lead Queue */}
              <div className="w-1/3 border-r border-slate-200">
                <div className="p-4 border-b border-slate-200">
                  <div className="flex items-center gap-2">
                    <Users className="w-4 h-4 text-slate-600" />
                    <h2 className="text-lg font-semibold text-slate-800">Lead Queue</h2>
                  </div>
                </div>
                <div className="divide-y divide-slate-200 max-h-[500px] overflow-y-auto">
                  {contactsLoading ? (
                    <div className="flex items-center gap-3 p-4 text-slate-500">
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span className="text-sm">Loading leads...</span>
                    </div>
                  ) : !contactsData?.length ? (
                    <div className="p-4 text-sm text-slate-500">No contacts found. Add contacts to get started.</div>
                  ) : (
                    contactsData.map((contact) => (
                      <button
                        key={contact.id}
                        onClick={() => setActiveLead(contact)}
                        className={`w-full p-4 text-left transition-colors hover:bg-slate-50 ${
                          activeLead?.id === contact.id ? 'bg-primary-50 border-l-2 border-primary-600' : ''
                        }`}
                      >
                        <p className="font-medium text-slate-800">{contact.name}</p>
                        <p className="text-sm text-slate-500">{formatPhone(contact.phone)}</p>
                        <span className={`inline-block mt-1 px-2 py-0.5 text-xs font-medium rounded-full ${
                          contact.tags?.includes('urgent') || contact.tags?.includes('pre-foreclosure')
                            ? 'bg-red-100 text-red-700'
                            : contact.tags?.includes('motivated')
                            ? 'bg-yellow-100 text-yellow-700'
                            : 'bg-blue-100 text-blue-700'
                        }`}>
                          {contact.tags?.includes('urgent') || contact.tags?.includes('pre-foreclosure') ? 'Hot'
                            : contact.tags?.includes('motivated') ? 'Motivated' : 'New'}
                        </span>
                      </button>
                    ))
                  )}
                </div>
              </div>
              {/* Right Panel - AI Conversation */}
              <div className="w-2/3 p-4">
                {!activeLead ? (
                  <div className="flex flex-col items-center justify-center h-64 text-slate-400">
                    <MessageSquare className="w-10 h-10 mb-3" />
                    <p className="text-sm">Select a lead to begin qualification</p>
                  </div>
                ) : (
                  <div>
                    <div className="flex items-center gap-2 mb-4">
                      <Bot className="w-5 h-5 text-primary-600" />
                      <div>
                        <h2 className="text-lg font-semibold text-slate-800">Qualifying: {activeLead.name}</h2>
                        <p className="text-sm text-slate-500">{formatPhone(activeLead.phone ?? '')}</p>
                        <span className="text-xs text-slate-400">
                          AI Persona: {dbPersonas?.find((p: DBPersona) => p.id === activePersona)?.name ?? 'Default'} — {dbPersonas?.find((p: DBPersona) => p.id === activePersona)?.role ?? 'Assistant'}
                          {(() => {
                            const voiceName = getVoiceName(dbPersonas?.find((p: DBPersona) => p.id === activePersona)?.elevenlabs_voice_id)
                            return voiceName ? ` · Voice: ${voiceName}` : ''
                          })()}
                        </span>
                      </div>
                    </div>
                    <div className="max-h-96 overflow-y-auto space-y-3 mb-4">
                      {conversationMessages.length === 0 && (
                        <div className="flex justify-center">
                          <button
                            onClick={handleGenerateOpener}
                            disabled={isChatLoading}
                            className="flex items-center gap-2 px-4 py-2 bg-primary-50 text-primary-700 rounded-lg hover:bg-primary-100 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                          >
                            <Sparkles className="w-4 h-4" />
                            Generate AI opener for {activeLead.name}
                          </button>
                        </div>
                      )}
                      {conversationMessages.map((msg, i) => (
                        <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                          {msg.role === 'assistant' && (
                            <div className="shrink-0 mr-2 mt-1"><Bot className="w-4 h-4 text-slate-400" /></div>
                          )}
                          <div className={`max-w-[75%] rounded-lg px-4 py-2 ${
                            msg.role === 'user'
                              ? 'bg-primary-600 text-white'
                              : 'bg-white border border-slate-200 text-slate-800'
                          }`}>
                            <p className="text-sm whitespace-pre-wrap">{msg.content}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                    <div className="flex items-center gap-2">
                      <input
                        type="text"
                        value={chatInput}
                        onChange={(e) => setChatInput(e.target.value)}
                        onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSendChat() } }}
                        disabled={isChatLoading}
                        placeholder="Type a message or question..."
                        className="flex-1 px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 disabled:opacity-50"
                      />
                      <button
                        onClick={handleSendChat}
                        disabled={isChatLoading || !chatInput.trim()}
                        className="flex items-center gap-2 px-4 py-2 bg-primary-500 text-white rounded-lg hover:bg-primary-600 transition-colors disabled:opacity-50"
                      >
                        {isChatLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {activeGroup === 'voice' && activeSubTab === 'agents' && (
          <div className="p-6"><AgentsTab /></div>
        )}
        {activeGroup === 'voice' && activeSubTab === 'voicemail-drops' && (
          <div className="p-6"><VoicemailDropsTab /></div>
        )}
        {activeGroup === 'voice' && activeSubTab === 'voice-campaigns' && (
          <div className="p-6"><CampaignsTab /></div>
        )}
        {activeGroup === 'voice' && activeSubTab === 'conversations' && (
          <div className="p-6"><ConversationsTab /></div>
        )}

        {/* ── Web Chat Tab ───────────────────────────────────── */}
        {activeGroup === 'webchat' && (
          <WebChatTab />
        )}

        {/* ── Knowledge Base Tab ─────────────────────────────── */}
        {activeGroup === 'knowledge' && (
          <div className="p-6"><KnowledgeBaseTab /></div>
        )}

        {/* ── Flow Builder Tabs ────────────────────────────────── */}
        {activeGroup === 'flows' && activeSubTab === 'my-flows' && (
          <div className="p-6"><FlowList /></div>
        )}
        {activeGroup === 'flows' && activeSubTab === 'flow-personas' && (
          <div className="p-6"><PersonaManager /></div>
        )}
        {activeGroup === 'flows' && activeSubTab === 'exec-history' && (
          <div className="p-6"><ExecutionHistory /></div>
        )}
        {activeGroup === 'flows' && activeSubTab === 'widget-config' && (
          <div className="p-6"><WebchatConfig /></div>
        )}
      </div>
    </div>
  )
}
