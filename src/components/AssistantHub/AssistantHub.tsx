import { useState, useRef, useEffect, useMemo } from 'react'
import {
  Mic,
  Phone,
  PlayCircle,
  StopCircle,
  Settings,
  PhoneCall,
  Clock,
  Users,
  MessageSquare,
  Mail,
  Send,
  Search,
  Loader2,
  Bot,
  Globe,
  Facebook,
  Instagram,
  Sparkles,
  User,
  CalendarPlus,
  UserCheck,
  Target,
  RotateCcw,
  CheckCircle2,
  AlertCircle,
  Zap,
} from 'lucide-react'
import { toast } from 'sonner'
import { useContacts, useSendSMS, useSendEmail } from '@/hooks/useApi'
import { formatPhone } from '@/utils/helpers'
import type { Contact } from '@/types'
import {
  AIChatEngine,
  type ChatMessage as AIChatMessage,
  type LeadQualification,
  type AppointmentRequest,
  type KnowledgeEntry,
} from '@/services/ai-chat'

type ActiveTab = 'voice' | 'sms' | 'email' | 'chat'

type ChatChannel = 'web' | 'sms' | 'facebook' | 'instagram'

interface DisplayMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  channel: ChatChannel
  timestamp: Date
  metadata?: AIChatMessage['metadata']
}

interface VoiceAgent {
  id: string
  name: string
  status: 'active' | 'inactive' | 'busy'
  callsToday: number
  avgDuration: string
}

const mockAgents: VoiceAgent[] = [
  { id: '1', name: 'Lead Qualifier', status: 'active', callsToday: 23, avgDuration: '2:45' },
  { id: '2', name: 'Appointment Setter', status: 'inactive', callsToday: 0, avgDuration: '4:12' },
  { id: '3', name: 'Follow-up Agent', status: 'busy', callsToday: 15, avgDuration: '1:30' },
]

const channelConfig: { id: ChatChannel; label: string; icon: typeof Globe; color: string }[] = [
  { id: 'web', label: 'Web Chat', icon: Globe, color: 'text-primary-600 bg-primary-100' },
  { id: 'sms', label: 'SMS', icon: MessageSquare, color: 'text-success-600 bg-success-100' },
  { id: 'facebook', label: 'Messenger', icon: Facebook, color: 'text-blue-600 bg-blue-100' },
  { id: 'instagram', label: 'Instagram', icon: Instagram, color: 'text-pink-600 bg-pink-100' },
]

// Generate available appointment slots for the next 5 business days
function generateAppointmentSlots(): string[] {
  const slots: string[] = []
  const now = new Date()
  let daysAdded = 0
  const d = new Date(now)

  while (daysAdded < 5) {
    d.setDate(d.getDate() + 1)
    const dow = d.getDay()
    if (dow === 0 || dow === 6) continue // Skip weekends
    const dateStr = d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })
    slots.push(`${dateStr} — 9:00 AM, 10:30 AM, 1:00 PM, 3:00 PM`)
    daysAdded++
  }
  return slots
}

export default function AssistantHub() {
  const [activeTab, setActiveTab] = useState<ActiveTab>('voice')
  const [agents, setAgents] = useState(mockAgents)

  // SMS state
  const [smsContactId, setSmsContactId] = useState('')
  const [smsMessage, setSmsMessage] = useState('')
  const [smsSearch, setSmsSearch] = useState('')

  // Email state
  const [emailContactId, setEmailContactId] = useState('')
  const [emailSubject, setEmailSubject] = useState('')
  const [emailBody, setEmailBody] = useState('')
  const [emailSearch, setEmailSearch] = useState('')

  // AI Chat state
  const [qualification, setQualification] = useState<Partial<LeadQualification>>({ status: 'new', score: 0 })
  const [pendingAppointment, setPendingAppointment] = useState<Partial<AppointmentRequest> | null>(null)
  const [showQualPanel, setShowQualPanel] = useState(true)

  const aiEngine = useMemo(() => new AIChatEngine({
    appointmentSlots: generateAppointmentSlots(),
    onQualificationUpdate: (qual) => setQualification(qual),
    onAppointmentRequest: (appt) => {
      setPendingAppointment(appt)
      toast.success('Appointment request detected!')
    },
  }), [])

  const [chatMessages, setChatMessages] = useState<DisplayMessage[]>([
    {
      id: '1',
      role: 'assistant',
      content: "Hey there! Welcome to REI Fundamentals. I'm here to help with anything real estate investing — whether you're looking at a property, want to analyze a deal, or need to schedule something. What can I help you with today?",
      channel: 'web',
      timestamp: new Date(),
    },
  ])
  const [chatInput, setChatInput] = useState('')
  const [chatChannel, setChatChannel] = useState<ChatChannel>('web')
  const [isChatTyping, setIsChatTyping] = useState(false)
  const chatEndRef = useRef<HTMLDivElement>(null)

  const { data: contactsData } = useContacts({ limit: 100 })
  const sendSMS = useSendSMS()
  const sendEmail = useSendEmail()

  const filteredSmsContacts = contactsData?.contacts.filter(
    (c) =>
      c.name.toLowerCase().includes(smsSearch.toLowerCase()) ||
      c.phone.includes(smsSearch)
  )

  const filteredEmailContacts = contactsData?.contacts.filter(
    (c) =>
      c.name.toLowerCase().includes(emailSearch.toLowerCase()) ||
      c.email.toLowerCase().includes(emailSearch.toLowerCase())
  )

  const toggleAgent = (agentId: string) => {
    setAgents((prev) =>
      prev.map((agent) =>
        agent.id === agentId
          ? { ...agent, status: agent.status === 'active' ? 'inactive' : 'active' }
          : agent
      )
    )
    toast.success('Agent status updated')
  }

  const handleSendSMS = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!smsContactId || !smsMessage.trim()) return
    await sendSMS.mutateAsync({ contactId: smsContactId, message: smsMessage })
    setSmsMessage('')
    setSmsContactId('')
  }

  const handleSendEmail = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!emailContactId || !emailSubject.trim() || !emailBody.trim()) return
    await sendEmail.mutateAsync({ contactId: emailContactId, subject: emailSubject, body: emailBody })
    setEmailSubject('')
    setEmailBody('')
    setEmailContactId('')
  }

  // Auto-scroll chat to bottom
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [chatMessages])

  const handleSendChat = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!chatInput.trim() || isChatTyping) return

    const userContent = chatInput.trim()
    const userMsg: DisplayMessage = {
      id: Date.now().toString(),
      role: 'user',
      content: userContent,
      channel: chatChannel,
      timestamp: new Date(),
    }

    setChatMessages((prev) => [...prev, userMsg])
    setChatInput('')
    setIsChatTyping(true)

    try {
      const { response, metadata } = await aiEngine.sendMessage(userContent, chatChannel)

      const assistantMsg: DisplayMessage = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: response,
        channel: chatChannel,
        timestamp: new Date(),
        metadata,
      }
      setChatMessages((prev) => [...prev, assistantMsg])
    } catch {
      setChatMessages((prev) => [
        ...prev,
        {
          id: (Date.now() + 1).toString(),
          role: 'assistant',
          content: "I'm sorry, I had a brief hiccup. Could you say that again?",
          channel: chatChannel,
          timestamp: new Date(),
        },
      ])
    } finally {
      setIsChatTyping(false)
    }
  }

  const handleResetChat = () => {
    aiEngine.reset()
    setChatMessages([
      {
        id: Date.now().toString(),
        role: 'assistant',
        content: "Fresh start! I'm ready to help. What can I do for you today?",
        channel: 'web',
        timestamp: new Date(),
      },
    ])
    setQualification({ status: 'new', score: 0 })
    setPendingAppointment(null)
    toast.success('Conversation reset')
  }

  const qualScore = qualification.score || 0
  const qualColor = qualScore >= 70 ? 'text-emerald-600' : qualScore >= 40 ? 'text-amber-500' : 'text-slate-400'
  const qualBg = qualScore >= 70 ? 'bg-emerald-50 border-emerald-200' : qualScore >= 40 ? 'bg-amber-50 border-amber-200' : 'bg-slate-50 border-slate-200'

  const stats = {
    totalCalls: agents.reduce((acc, a) => acc + a.callsToday, 0),
    activeAgents: agents.filter((a) => a.status === 'active').length,
    avgDuration: '2:49',
  }

  const tabs = [
    { id: 'voice' as ActiveTab, label: 'CallCommander AI', icon: Mic },
    { id: 'sms' as ActiveTab, label: 'DealCloser SMS', icon: MessageSquare },
    { id: 'email' as ActiveTab, label: 'DealCloser Email', icon: Mail },
    { id: 'chat' as ActiveTab, label: 'AI Chat', icon: Bot },
  ]

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-slate-800">AssistantHub</h1>
        <p className="text-slate-600">
          Powered by <span className="font-semibold text-primary-700">CallCommander AI</span> &{' '}
          <span className="font-semibold text-accent-600">DealCloser AI</span>
        </p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white rounded-xl border border-slate-200 p-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-primary-100 rounded-lg">
              <PhoneCall className="w-5 h-5 text-primary-600" />
            </div>
            <div>
              <p className="text-sm text-slate-500">Calls Today</p>
              <p className="text-2xl font-bold text-slate-800">{stats.totalCalls}</p>
            </div>
          </div>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 p-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-success-100 rounded-lg">
              <Users className="w-5 h-5 text-success-600" />
            </div>
            <div>
              <p className="text-sm text-slate-500">Active Agents</p>
              <p className="text-2xl font-bold text-slate-800">{stats.activeAgents}</p>
            </div>
          </div>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 p-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-warning-100 rounded-lg">
              <Clock className="w-5 h-5 text-warning-600" />
            </div>
            <div>
              <p className="text-sm text-slate-500">Avg Call Duration</p>
              <p className="text-2xl font-bold text-slate-800">{stats.avgDuration}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Tab Navigation */}
      <div className="bg-white rounded-xl border border-slate-200">
        <div className="flex border-b border-slate-200">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-2 px-6 py-3 text-sm font-medium transition-colors border-b-2 ${
                activeTab === tab.id
                  ? 'border-primary-500 text-primary-600'
                  : 'border-transparent text-slate-500 hover:text-slate-700'
              }`}
            >
              <tab.icon className="w-4 h-4" />
              {tab.label}
            </button>
          ))}
        </div>

        {/* Voice Agents Tab */}
        {activeTab === 'voice' && (
          <div>
            <div className="p-4 border-b border-slate-200">
              <h2 className="text-lg font-semibold text-slate-800">CallCommander AI Agents</h2>
            </div>
            <div className="divide-y divide-slate-200">
              {agents.map((agent) => (
                <div
                  key={agent.id}
                  className="p-4 flex items-center justify-between hover:bg-slate-50 transition-colors"
                >
                  <div className="flex items-center gap-4">
                    <div
                      className={`p-3 rounded-full ${
                        agent.status === 'active'
                          ? 'bg-success-100'
                          : agent.status === 'busy'
                          ? 'bg-warning-100'
                          : 'bg-slate-100'
                      }`}
                    >
                      <Mic
                        className={`w-5 h-5 ${
                          agent.status === 'active'
                            ? 'text-success-600'
                            : agent.status === 'busy'
                            ? 'text-warning-600'
                            : 'text-slate-400'
                        }`}
                      />
                    </div>
                    <div>
                      <h3 className="font-medium text-slate-800">{agent.name}</h3>
                      <div className="flex items-center gap-3 text-sm text-slate-500">
                        <span className="flex items-center gap-1">
                          <Phone className="w-3 h-3" />
                          {agent.callsToday} calls today
                        </span>
                        <span className="flex items-center gap-1">
                          <Clock className="w-3 h-3" />
                          Avg: {agent.avgDuration}
                        </span>
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <span
                      className={`px-2 py-1 text-xs font-medium rounded-full ${
                        agent.status === 'active'
                          ? 'bg-success-100 text-success-700'
                          : agent.status === 'busy'
                          ? 'bg-warning-100 text-warning-700'
                          : 'bg-slate-100 text-slate-600'
                      }`}
                    >
                      {agent.status}
                    </span>
                    <button
                      onClick={() => toggleAgent(agent.id)}
                      disabled={agent.status === 'busy'}
                      className={`p-2 rounded-lg transition-colors ${
                        agent.status === 'active'
                          ? 'bg-danger-100 text-danger-600 hover:bg-danger-200'
                          : 'bg-success-100 text-success-600 hover:bg-success-200'
                      } disabled:opacity-50 disabled:cursor-not-allowed`}
                    >
                      {agent.status === 'active' ? (
                        <StopCircle className="w-5 h-5" />
                      ) : (
                        <PlayCircle className="w-5 h-5" />
                      )}
                    </button>
                  </div>
                </div>
              ))}
            </div>

            {/* Voice Quick Actions */}
            <div className="p-4 border-t border-slate-200">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <button
                  onClick={() => toast.info('Call queue feature coming soon')}
                  className="flex items-center gap-3 p-4 bg-slate-50 rounded-xl border border-slate-200 hover:border-primary-300 hover:bg-primary-50 transition-colors text-left"
                >
                  <div className="p-2 bg-primary-100 rounded-lg">
                    <Phone className="w-5 h-5 text-primary-600" />
                  </div>
                  <div>
                    <h3 className="font-medium text-slate-800">Start Call Queue</h3>
                    <p className="text-sm text-slate-500">Begin automated outbound calls</p>
                  </div>
                </button>
                <button
                  onClick={() => toast.info('Agent settings coming soon')}
                  className="flex items-center gap-3 p-4 bg-slate-50 rounded-xl border border-slate-200 hover:border-primary-300 hover:bg-primary-50 transition-colors text-left"
                >
                  <div className="p-2 bg-slate-100 rounded-lg">
                    <Settings className="w-5 h-5 text-slate-600" />
                  </div>
                  <div>
                    <h3 className="font-medium text-slate-800">Agent Settings</h3>
                    <p className="text-sm text-slate-500">Configure voice agent behavior</p>
                  </div>
                </button>
              </div>
            </div>
          </div>
        )}

        {/* SMS Tab */}
        {activeTab === 'sms' && (
          <div className="p-6">
            <form onSubmit={handleSendSMS} className="space-y-4 max-w-2xl">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Select Contact *
                </label>
                <div className="relative mb-2">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                  <input
                    type="text"
                    value={smsSearch}
                    onChange={(e) => setSmsSearch(e.target.value)}
                    className="w-full pl-9 pr-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                    placeholder="Search contacts..."
                  />
                </div>
                <div className="max-h-40 overflow-y-auto border border-slate-200 rounded-lg">
                  {filteredSmsContacts?.length === 0 ? (
                    <p className="p-3 text-sm text-slate-500 text-center">No contacts found</p>
                  ) : (
                    filteredSmsContacts?.map((contact) => (
                      <button
                        key={contact.id}
                        type="button"
                        onClick={() => setSmsContactId(contact.id)}
                        className={`w-full px-3 py-2 text-left hover:bg-slate-50 transition-colors ${
                          smsContactId === contact.id
                            ? 'bg-primary-50 border-l-2 border-primary-500'
                            : ''
                        }`}
                      >
                        <p className="font-medium text-slate-800">{contact.name}</p>
                        <p className="text-sm text-slate-500">{formatPhone(contact.phone)}</p>
                      </button>
                    ))
                  )}
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Message *
                </label>
                <textarea
                  required
                  rows={4}
                  value={smsMessage}
                  onChange={(e) => setSmsMessage(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 resize-none"
                  placeholder="Type your message..."
                />
                <p className="text-xs text-slate-500 mt-1">{smsMessage.length} / 160 characters</p>
              </div>

              {/* Quick Templates */}
              <div>
                <p className="text-sm font-medium text-slate-700 mb-2">Quick Templates:</p>
                <div className="flex flex-wrap gap-2">
                  {[
                    'Hi! Just following up on our conversation.',
                    'Are you still interested in selling?',
                    "I'd like to schedule a call. When works for you?",
                  ].map((template, i) => (
                    <button
                      key={i}
                      type="button"
                      onClick={() => setSmsMessage(template)}
                      className="px-2 py-1 text-xs bg-slate-100 text-slate-600 rounded hover:bg-slate-200 transition-colors"
                    >
                      {template.slice(0, 30)}...
                    </button>
                  ))}
                </div>
              </div>

              <button
                type="submit"
                disabled={sendSMS.isPending || !smsContactId || !smsMessage.trim()}
                className="flex items-center gap-2 px-6 py-2.5 bg-warning-500 text-white rounded-lg hover:bg-warning-600 transition-colors disabled:opacity-50"
              >
                {sendSMS.isPending ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Sending...
                  </>
                ) : (
                  <>
                    <Send className="w-4 h-4" />
                    Send SMS
                  </>
                )}
              </button>
            </form>
          </div>
        )}

        {/* Email Tab */}
        {activeTab === 'email' && (
          <div className="p-6">
            <form onSubmit={handleSendEmail} className="space-y-4 max-w-2xl">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Select Contact *
                </label>
                <div className="relative mb-2">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                  <input
                    type="text"
                    value={emailSearch}
                    onChange={(e) => setEmailSearch(e.target.value)}
                    className="w-full pl-9 pr-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                    placeholder="Search contacts..."
                  />
                </div>
                <div className="max-h-40 overflow-y-auto border border-slate-200 rounded-lg">
                  {filteredEmailContacts?.length === 0 ? (
                    <p className="p-3 text-sm text-slate-500 text-center">No contacts found</p>
                  ) : (
                    filteredEmailContacts?.map((contact) => (
                      <button
                        key={contact.id}
                        type="button"
                        onClick={() => setEmailContactId(contact.id)}
                        className={`w-full px-3 py-2 text-left hover:bg-slate-50 transition-colors ${
                          emailContactId === contact.id
                            ? 'bg-primary-50 border-l-2 border-primary-500'
                            : ''
                        }`}
                      >
                        <p className="font-medium text-slate-800">{contact.name}</p>
                        <p className="text-sm text-slate-500">{contact.email}</p>
                      </button>
                    ))
                  )}
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Subject *
                </label>
                <input
                  type="text"
                  required
                  value={emailSubject}
                  onChange={(e) => setEmailSubject(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                  placeholder="Email subject..."
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Body *
                </label>
                <textarea
                  required
                  rows={8}
                  value={emailBody}
                  onChange={(e) => setEmailBody(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 resize-none"
                  placeholder="Write your email..."
                />
              </div>

              <button
                type="submit"
                disabled={sendEmail.isPending || !emailContactId || !emailSubject.trim() || !emailBody.trim()}
                className="flex items-center gap-2 px-6 py-2.5 bg-primary-500 text-white rounded-lg hover:bg-primary-600 transition-colors disabled:opacity-50"
              >
                {sendEmail.isPending ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Sending...
                  </>
                ) : (
                  <>
                    <Send className="w-4 h-4" />
                    Send Email
                  </>
                )}
              </button>
            </form>
          </div>
        )}

        {/* AI Chat Tab */}
        {activeTab === 'chat' && (
          <div className="flex h-[650px]">
            {/* Chat Column */}
            <div className="flex-1 flex flex-col min-w-0">
              {/* Channel Selector + Controls */}
              <div className="flex items-center justify-between gap-2 p-3 border-b border-slate-200 bg-slate-50">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-slate-600 mr-1">Channel:</span>
                  {channelConfig.map((ch) => (
                    <button
                      key={ch.id}
                      onClick={() => setChatChannel(ch.id)}
                      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
                        chatChannel === ch.id
                          ? ch.color + ' ring-2 ring-offset-1 ring-slate-300'
                          : 'bg-white text-slate-500 hover:bg-slate-100 border border-slate-200'
                      }`}
                    >
                      <ch.icon className="w-3.5 h-3.5" />
                      {ch.label}
                    </button>
                  ))}
                </div>
                <div className="flex items-center gap-1.5">
                  <button
                    onClick={() => setShowQualPanel(!showQualPanel)}
                    className={`p-1.5 rounded-lg text-xs transition-colors ${showQualPanel ? 'bg-primary-100 text-primary-600' : 'text-slate-400 hover:bg-slate-100'}`}
                    title="Toggle qualification panel"
                  >
                    <Target className="w-4 h-4" />
                  </button>
                  <button
                    onClick={handleResetChat}
                    className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-100 transition-colors"
                    title="Reset conversation"
                  >
                    <RotateCcw className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {/* AI Status Bar */}
              <div className="flex items-center gap-3 px-4 py-1.5 bg-gradient-to-r from-primary-50 to-white border-b border-slate-100 text-xs">
                <span className="flex items-center gap-1 text-primary-600">
                  <Zap className="w-3 h-3" />
                  {aiEngine.isConfigured ? 'AI Connected' : 'Smart Local Mode'}
                </span>
                <span className="text-slate-300">|</span>
                <span className="text-slate-500">
                  Objective: <strong className="text-slate-700">{aiEngine.currentObjective.name}</strong>
                </span>
                {qualScore > 0 && (
                  <>
                    <span className="text-slate-300">|</span>
                    <span className={qualColor}>
                      Lead Score: <strong>{qualScore}</strong>
                    </span>
                  </>
                )}
              </div>

              {/* Chat Messages */}
              <div className="flex-1 overflow-y-auto p-4 space-y-4">
                {chatMessages.map((msg) => (
                  <div
                    key={msg.id}
                    className={`flex items-end gap-2 ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
                  >
                    {msg.role === 'assistant' && (
                      <div className="w-8 h-8 rounded-full bg-primary-100 flex items-center justify-center shrink-0">
                        <Sparkles className="w-4 h-4 text-primary-600" />
                      </div>
                    )}
                    <div className="max-w-[75%]">
                      <div
                        className={`px-4 py-2.5 rounded-2xl text-sm leading-relaxed whitespace-pre-line ${
                          msg.role === 'user'
                            ? 'bg-primary-500 text-white rounded-br-md'
                            : 'bg-slate-100 text-slate-800 rounded-bl-md'
                        }`}
                      >
                        {msg.content}
                      </div>
                      <div className={`text-[10px] mt-0.5 px-1 ${msg.role === 'user' ? 'text-right text-slate-400' : 'text-slate-400'}`}>
                        {msg.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        {msg.role === 'user' && (
                          <span className="ml-1.5">
                            via {channelConfig.find((c) => c.id === msg.channel)?.label}
                          </span>
                        )}
                        {msg.metadata?.action === 'qualify' && (
                          <span className="ml-1.5 text-emerald-500"><UserCheck className="w-3 h-3 inline" /> Data captured</span>
                        )}
                        {msg.metadata?.action === 'book_appointment' && (
                          <span className="ml-1.5 text-blue-500"><CalendarPlus className="w-3 h-3 inline" /> Booking</span>
                        )}
                      </div>
                    </div>
                    {msg.role === 'user' && (
                      <div className="w-8 h-8 rounded-full bg-slate-200 flex items-center justify-center shrink-0">
                        <User className="w-4 h-4 text-slate-600" />
                      </div>
                    )}
                  </div>
                ))}

                {/* Typing indicator */}
                {isChatTyping && (
                  <div className="flex items-end gap-2">
                    <div className="w-8 h-8 rounded-full bg-primary-100 flex items-center justify-center shrink-0">
                      <Sparkles className="w-4 h-4 text-primary-600" />
                    </div>
                    <div className="bg-slate-100 px-4 py-3 rounded-2xl rounded-bl-md">
                      <div className="flex gap-1">
                        <span className="w-2 h-2 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                        <span className="w-2 h-2 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                        <span className="w-2 h-2 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                      </div>
                    </div>
                  </div>
                )}
                <div ref={chatEndRef} />
              </div>

              {/* Chat Input */}
              <form onSubmit={handleSendChat} className="p-3 border-t border-slate-200 bg-white">
                <div className="flex items-center gap-2">
                  <div className="flex-1 relative">
                    <input
                      type="text"
                      value={chatInput}
                      onChange={(e) => setChatInput(e.target.value)}
                      placeholder={`Message via ${channelConfig.find((c) => c.id === chatChannel)?.label}...`}
                      className="w-full px-4 py-2.5 border border-slate-300 rounded-full focus:outline-none focus:ring-2 focus:ring-primary-500 text-sm"
                      disabled={isChatTyping}
                    />
                  </div>
                  <button
                    type="submit"
                    disabled={!chatInput.trim() || isChatTyping}
                    className="p-2.5 bg-primary-500 text-white rounded-full hover:bg-primary-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <Send className="w-4 h-4" />
                  </button>
                </div>
                <div className="flex items-center gap-4 mt-2 px-2">
                  <p className="text-[10px] text-slate-400">
                    Powered by <span className="font-semibold">REI Fundamentals AI</span> &bull; {aiEngine.isConfigured ? 'OpenAI-connected' : 'Objective-based local engine'} &bull; Natural language across all channels
                  </p>
                </div>
              </form>
            </div>

            {/* Lead Qualification Side Panel */}
            {showQualPanel && (
              <div className="w-72 border-l border-slate-200 bg-slate-50 overflow-y-auto">
                <div className="p-4 space-y-4">
                  {/* Lead Score */}
                  <div className={`rounded-xl border p-4 text-center ${qualBg}`}>
                    <p className="text-xs font-medium text-slate-500 mb-1">Lead Score</p>
                    <p className={`text-3xl font-bold ${qualColor}`}>{qualScore}</p>
                    <div className="w-full bg-slate-200 rounded-full h-2 mt-2">
                      <div
                        className={`h-2 rounded-full transition-all duration-500 ${
                          qualScore >= 70 ? 'bg-emerald-500' : qualScore >= 40 ? 'bg-amber-400' : 'bg-slate-300'
                        }`}
                        style={{ width: `${qualScore}%` }}
                      />
                    </div>
                    <p className="text-xs text-slate-500 mt-1">
                      {qualScore >= 70 ? 'Hot Lead' : qualScore >= 40 ? 'Warm Lead' : 'Gathering Info'}
                    </p>
                  </div>

                  {/* Current Objective */}
                  <div className="bg-white rounded-xl border border-slate-200 p-3">
                    <p className="text-xs font-medium text-slate-500 mb-2 flex items-center gap-1">
                      <Target className="w-3 h-3" /> Current Objective
                    </p>
                    <p className="text-sm font-semibold text-slate-700">{aiEngine.currentObjective.name}</p>
                    <p className="text-xs text-slate-500 mt-0.5">{aiEngine.currentObjective.description}</p>
                  </div>

                  {/* Qualification Data */}
                  <div className="bg-white rounded-xl border border-slate-200 p-3">
                    <p className="text-xs font-medium text-slate-500 mb-2 flex items-center gap-1">
                      <UserCheck className="w-3 h-3" /> Lead Information
                    </p>
                    <div className="space-y-2">
                      {[
                        { label: 'Name', value: qualification.name },
                        { label: 'Phone', value: qualification.phone },
                        { label: 'Email', value: qualification.email },
                        { label: 'Property', value: qualification.propertyAddress },
                        { label: 'Type', value: qualification.propertyType?.replace('_', ' ') },
                        { label: 'Motivation', value: qualification.motivation?.replace('_', ' ') },
                        { label: 'Timeline', value: qualification.timeline?.replace(/_/g, ' ') },
                      ].map(({ label, value }) => (
                        <div key={label} className="flex items-center gap-2">
                          {value ? (
                            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                          ) : (
                            <AlertCircle className="w-3.5 h-3.5 text-slate-300 shrink-0" />
                          )}
                          <span className="text-xs text-slate-500 w-16 shrink-0">{label}</span>
                          <span className={`text-xs truncate ${value ? 'text-slate-800 font-medium' : 'text-slate-300 italic'}`}>
                            {value || 'Not yet'}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Pending Appointment */}
                  {pendingAppointment && (
                    <div className="bg-blue-50 rounded-xl border border-blue-200 p-3">
                      <p className="text-xs font-medium text-blue-600 mb-2 flex items-center gap-1">
                        <CalendarPlus className="w-3 h-3" /> Appointment Request
                      </p>
                      <div className="space-y-1 text-xs">
                        {pendingAppointment.date && (
                          <p className="text-slate-700"><strong>Date:</strong> {pendingAppointment.date}</p>
                        )}
                        {pendingAppointment.startTime && (
                          <p className="text-slate-700"><strong>Time:</strong> {pendingAppointment.startTime}</p>
                        )}
                        {pendingAppointment.type && (
                          <p className="text-slate-700"><strong>Type:</strong> {pendingAppointment.type.replace('_', ' ')}</p>
                        )}
                      </div>
                      <button
                        onClick={() => {
                          toast.success('Appointment confirmed and added to Smart Scheduler!')
                          setPendingAppointment(null)
                        }}
                        className="w-full mt-2 px-3 py-1.5 bg-blue-600 text-white text-xs rounded-lg hover:bg-blue-700 transition-colors"
                      >
                        Confirm & Add to Scheduler
                      </button>
                    </div>
                  )}

                  {/* Quick Stats */}
                  <div className="bg-white rounded-xl border border-slate-200 p-3">
                    <p className="text-xs font-medium text-slate-500 mb-2">Conversation Stats</p>
                    <div className="grid grid-cols-2 gap-2 text-center">
                      <div>
                        <p className="text-lg font-bold text-slate-700">{chatMessages.filter((m) => m.role === 'user').length}</p>
                        <p className="text-[10px] text-slate-400">Messages</p>
                      </div>
                      <div>
                        <p className="text-lg font-bold text-slate-700">
                          {Object.entries(qualification).filter(([k, v]) => v && k !== 'status' && k !== 'score').length}
                        </p>
                        <p className="text-[10px] text-slate-400">Fields Captured</p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
