import { useState, useEffect } from 'react'
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
    Sparkles,
} from 'lucide-react'
import { toast } from 'sonner'
import { useContacts, useSendSMS, useSendEmail } from '@/hooks/useApi'
import { formatPhone } from '@/utils/helpers'
import { helmChat, HelmProxyError } from '../../services/helmProxy'
import type { Contact } from '@/types'

type ActiveTab = 'voice' | 'sms' | 'email'

interface Persona {
  id: string
  name: string
  role: string
  tone: string
  systemPrompt: string
}

const personas: Persona[] = [
  {
    id: 'lead-qualifier',
    name: 'Maya',
    role: 'Lead Qualifier',
    tone: 'Warm & empathetic',
    systemPrompt: 'You are Maya, a warm and empathetic AI assistant for a real estate investor. Your job is to qualify motivated seller leads — understand their situation, timeline, and motivation. Ask one question at a time. Be conversational, not salesy. Always end your response with a soft follow-up question.',
  },
  {
    id: 'appointment-setter',
    name: 'Marcus',
    role: 'Appointment Setter',
    tone: 'Direct & confident',
    systemPrompt: 'You are Marcus, a direct and confident AI assistant for a real estate investor. Your job is to move qualified leads toward booking a call or walkthrough appointment. Be clear, concise, and action-oriented. Guide every conversation toward a specific next step.',
  },
  {
    id: 'followup-agent',
    name: 'Sofia',
    role: 'Follow-up Agent',
    tone: 'Friendly & persistent',
    systemPrompt: 'You are Sofia, a friendly and persistent AI assistant for a real estate investor. Your job is to re-engage leads who went quiet — check in naturally, remind them of the investor\'s value, and gently re-open the conversation. Never be pushy. Build rapport first.',
  },
]

export default function AssistantHub() {
    const [activeTab, setActiveTab] = useState<ActiveTab>('voice')
    const [activePersona, setActivePersona] = useState('lead-qualifier')
    const [isHelmConnected, setIsHelmConnected] = useState(false)

  // SMS state
  const [smsContactId, setSmsContactId] = useState('')
    const [smsMessage, setSmsMessage] = useState('')
    const [smsSearch, setSmsSearch] = useState('')
    const [isSmsAiLoading, setIsSmsAiLoading] = useState(false)

  // Email state
  const [emailContactId, setEmailContactId] = useState('')
    const [emailSubject, setEmailSubject] = useState('')
    const [emailBody, setEmailBody] = useState('')
    const [emailSearch, setEmailSearch] = useState('')

  // Voice AI conversation state
  const [conversations, setConversations] = useState<Record<string, Array<{ role: 'user' | 'assistant', content: string }>>>({})
    const [chatInput, setChatInput] = useState('')
    const [isChatLoading, setIsChatLoading] = useState(false)
    const [activeLead, setActiveLead] = useState<Contact | null>(null)
  const conversationMessages = activeLead ? (conversations[activeLead.id] ?? []) : []

  useEffect(() => {
        const email = localStorage.getItem('helmHub_linkedEmail')
        setIsHelmConnected(!!email)
  }, [])

  const { data: contactsData, isLoading: contactsLoading } = useContacts({ limit: 50 })
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

  const handleSendSMS = async (e: React.FormEvent) => {
        e.preventDefault()
        if (!smsContactId || !smsMessage.trim()) return
        await sendSMS.mutateAsync({ contactId: smsContactId, message: smsMessage })
        setSmsMessage('')
        setSmsContactId('')
  }

  const handleSmsDraft = async () => {
        if (!smsContactId || !isHelmConnected) return
        const contact = contactsData?.contacts.find(c => c.id === smsContactId)
        if (!contact) return
        setIsSmsAiLoading(true)
        try {
            const result = await helmChat([
                { role: 'user', content: `Write a short, friendly SMS message (under 160 characters) to a motivated seller lead named ${contact.name}. The message should re-engage them and invite a quick reply. Do not include any explanation — just the SMS text itself.` },
            ])
            setSmsMessage(result.content)
        } catch (error) {
            if (error instanceof HelmProxyError && error.status === 403) {
                toast.error('Helm Hub subscription required to use AI drafting.')
            } else {
                toast.error(error instanceof Error ? error.message : 'Failed to generate draft')
            }
        } finally {
            setIsSmsAiLoading(false)
        }
  }

  const handleSendEmail = async (e: React.FormEvent) => {
        e.preventDefault()
        if (!emailContactId || !emailSubject.trim() || !emailBody.trim()) return
        await sendEmail.mutateAsync({ contactId: emailContactId, subject: emailSubject, body: emailBody })
        setEmailSubject('')
        setEmailBody('')
        setEmailContactId('')
  }

  const handleSendChat = async () => {
        if (!chatInput.trim() || isChatLoading) return
        const userMessage = { role: 'user' as const, content: chatInput.trim() }
        const updatedMessages = [...conversationMessages, userMessage]
        setConversations(prev => ({
            ...prev,
            [activeLead!.id]: [...(prev[activeLead!.id] ?? []), userMessage],
        }))
        setChatInput('')
        setIsChatLoading(true)
        try {
            const persona = personas.find(p => p.id === activePersona) ?? personas[0]
            const response = await helmChat(updatedMessages, persona.systemPrompt)
            setConversations(prev => ({
                ...prev,
                [activeLead!.id]: [...(prev[activeLead!.id] ?? []), { role: 'assistant', content: response.content }],
            }))
        } catch (err) {
            if (err instanceof HelmProxyError && err.status === 403) {
                toast.error('Helm Hub subscription required to use CallCommander AI.')
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
        const openerMessages: Array<{ role: 'user' | 'assistant', content: string }> = [
            { role: 'user', content: `Generate a warm, professional opening message to qualify a motivated seller lead named ${activeLead?.name}. Keep it under 3 sentences.` },
        ]
        try {
            const persona = personas.find(p => p.id === activePersona) ?? personas[0]
            const response = await helmChat(openerMessages, persona.systemPrompt)
            setConversations(prev => ({
                ...prev,
                [activeLead!.id]: [...(prev[activeLead!.id] ?? []), { role: 'assistant', content: response.content }],
            }))
        } catch (err) {
            if (err instanceof HelmProxyError && err.status === 403) {
                toast.error('Helm Hub subscription required to use CallCommander AI.')
            } else if (err instanceof Error) {
                toast.error(err.message)
            }
        } finally {
            setIsChatLoading(false)
        }
  }

  const stats = {
        totalCalls: 38,
        activeAgents: personas.length,
                                                   avgDuration: '2:49',
  }

  const tabs = [
    { id: 'voice' as ActiveTab, label: 'CallCommander AI', icon: Mic },
    { id: 'sms' as ActiveTab, label: 'DealCloser SMS', icon: MessageSquare },
    { id: 'email' as ActiveTab, label: 'DealCloser Email', icon: Mail },
      ]

  return (
        <div className="space-y-6">
          {/* Helm Hub connection banner */}
          {!isHelmConnected && (
                  <div className="flex items-center gap-3 px-4 py-3 bg-yellow-50 border border-yellow-200 rounded-lg text-sm text-yellow-800">
                            <span>Connect Helm Hub in Settings to enable AI responses.</span>span>
                            <a href="/settings" className="font-medium underline hover:text-yellow-900">
                                        Go to Settings
                            </a>a>
                  </div>div>
              )}
        
          {/* Header */}
              <div>
                      <h1 className="text-2xl font-bold text-slate-800">AssistantHub</h1>h1>
                      <p className="text-slate-600">
                                Powered by <span className="font-semibold text-primary-700">CallCommander AI</span>span> &{' '}
                                <span className="font-semibold text-accent-600">DealCloser AI</span>span>
                      </p>p>
              </div>div>
        
          {/* Stats */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                      <div className="bg-white rounded-xl border border-slate-200 p-4">
                                <div className="flex items-center gap-3">
                                            <div className="p-2 bg-primary-100 rounded-lg">
                                                          <PhoneCall className="w-5 h-5 text-primary-600" />
                                            </div>div>
                                            <div>
                                                          <p className="text-sm text-slate-500">Calls Today</p>p>
                                                          <p className="text-2xl font-bold text-slate-800">{stats.totalCalls}</p>p>
                                            </div>div>
                                </div>div>
                      </div>div>
                      <div className="bg-white rounded-xl border border-slate-200 p-4">
                                <div className="flex items-center gap-3">
                                            <div className="p-2 bg-success-100 rounded-lg">
                                                          <Users className="w-5 h-5 text-success-600" />
                                            </div>div>
                                            <div>
                                                          <p className="text-sm text-slate-500">Active Agents</p>p>
                                                          <p className="text-2xl font-bold text-slate-800">{stats.activeAgents}</p>p>
                                            </div>div>
                                </div>div>
                      </div>div>
                      <div className="bg-white rounded-xl border border-slate-200 p-4">
                                <div className="flex items-center gap-3">
                                            <div className="p-2 bg-warning-100 rounded-lg">
                                                          <Clock className="w-5 h-5 text-warning-600" />
                                            </div>div>
                                            <div>
                                                          <p className="text-sm text-slate-500">Avg Call Duration</p>p>
                                                          <p className="text-2xl font-bold text-slate-800">{stats.avgDuration}</p>p>
                                            </div>div>
                                </div>div>
                      </div>div>
              </div>div>
        
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
                      </button>button>
                    ))}
                      </div>div>
              
                {/* Voice Agents Tab */}
                {activeTab === 'voice' && (
                    <div>
                        {/* Persona Selector */}
                        <div className="p-4 border-b border-slate-200">
                            <div className="grid grid-cols-3 gap-3">
                                {personas.map((p) => (
                                    <button
                                        key={p.id}
                                        onClick={() => { setActivePersona(p.id) }}
                                        className={`p-3 rounded-lg text-left transition-all ${
                                            activePersona === p.id
                                                ? 'ring-2 ring-primary-500 bg-primary-50'
                                                : 'border border-slate-200 bg-white'
                                        }`}
                                    >
                                        <p className="font-semibold text-slate-800">{p.name}</p>
                                        <p className="text-sm text-slate-500">{p.role}</p>
                                        <span className="inline-block mt-1 text-xs bg-slate-100 text-slate-600 rounded-full px-2 py-0.5">
                                            {p.tone}
                                        </span>
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
                            <div className="divide-y divide-slate-200">
                                {contactsLoading ? (
                                    <div className="flex items-center gap-3 p-4 text-slate-500">
                                        <Loader2 className="w-4 h-4 animate-spin" />
                                        <span className="text-sm">Loading leads...</span>
                                    </div>
                                ) : !contactsData?.contacts?.length ? (
                                    <div className="p-4 text-sm text-slate-500">
                                        No contacts found. Add contacts to get started.
                                    </div>
                                ) : (
                                    contactsData.contacts.map((contact) => (
                                        <button
                                            key={contact.id}
                                            onClick={() => { setActiveLead(contact) }}
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
                                                {contact.tags?.includes('urgent') || contact.tags?.includes('pre-foreclosure')
                                                    ? 'Hot'
                                                    : contact.tags?.includes('motivated')
                                                    ? 'Motivated'
                                                    : 'New'}
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
                                            <h2 className="text-lg font-semibold text-slate-800">Qualifying: {activeLead?.name}</h2>
                                            <p className="text-sm text-slate-500">{formatPhone(activeLead?.phone ?? '')}</p>
                                            <span className="text-xs text-slate-400">AI Persona: {personas.find(p => p.id === activePersona)?.name} — {personas.find(p => p.id === activePersona)?.role}</span>
                                        </div>
                                    </div>
                                    <div className="max-h-96 overflow-y-auto space-y-3 mb-4">
                                        {conversationMessages.length === 0 && (
                                            <div className="flex justify-center">
                                                <button
                                                    onClick={handleGenerateOpener}
                                                    disabled={isChatLoading || !isHelmConnected}
                                                    className="flex items-center gap-2 px-4 py-2 bg-primary-50 text-primary-700 rounded-lg hover:bg-primary-100 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                                                >
                                                    <Sparkles className="w-4 h-4" />
                                                    Generate AI opener for {activeLead?.name}
                                                </button>
                                            </div>
                                        )}
                                        {conversationMessages.map((msg, i) => (
                                            <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                                                {msg.role === 'assistant' && (
                                                    <div className="shrink-0 mr-2 mt-1">
                                                        <Bot className="w-4 h-4 text-slate-400" />
                                                    </div>
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
                                            disabled={isChatLoading || !isHelmConnected}
                                            placeholder="Type a message or question..."
                                            className="flex-1 px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 disabled:opacity-50 disabled:cursor-not-allowed"
                                        />
                                        <button
                                            onClick={handleSendChat}
                                            disabled={isChatLoading || !chatInput.trim() || !isHelmConnected}
                                            className="flex items-center gap-2 px-4 py-2 bg-primary-500 text-white rounded-lg hover:bg-primary-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                                        >
                                            {isChatLoading ? (
                                                <Loader2 className="w-4 h-4 animate-spin" />
                                            ) : (
                                                <Send className="w-4 h-4" />
                                            )}
                                        </button>
                                    </div>
                                    {!isHelmConnected && (
                                        <p className="text-xs text-slate-400 mt-2">Connect Helm Hub in Settings to enable AI</p>
                                    )}
                                </div>
                            )}
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
                                                              </label>label>
                                                              <div className="relative mb-2">
                                                                                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                                                                                <input
                                                                                                      type="text"
                                                                                                      value={smsSearch}
                                                                                                      onChange={(e) => setSmsSearch(e.target.value)}
                                                                                                      className="w-full pl-9 pr-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                                                                                                      placeholder="Search contacts..."
                                                                                                    />
                                                              </div>div>
                                                              <div className="max-h-40 overflow-y-auto border border-slate-200 rounded-lg">
                                                                {filteredSmsContacts?.length === 0 ? (
                                          <p className="p-3 text-sm text-slate-500 text-center">No contacts found</p>p>
                                        ) : (
                                          filteredSmsContacts?.map((contact) => (
                                                                  <button
                                                                                            key={contact.id}
                                                                                            type="button"
                                                                                            onClick={() => setSmsContactId(contact.id)}
                                                                                            className={`w-full px-3 py-2 text-left hover:bg-slate-50 transition-colors ${
                                                                                                                        smsContactId === contact.id ? 'bg-primary-50 border-l-2 border-primary-500' : ''
                                                                                              }`}
                                                                                          >
                                                                                          <p className="font-medium text-slate-800">{contact.name}</p>p>
                                                                                          <p className="text-sm text-slate-500">{formatPhone(contact.phone)}</p>p>
                                                                  </button>button>
                                                                ))
                                        )}
                                                              </div>div>
                                              </div>div>
                                              <div>
                                                              <label className="block text-sm font-medium text-slate-700 mb-1">
                                                                                Message *
                                                              </label>label>
                                                              <div className="flex items-center gap-2 mb-2">
                                                                <button
                                                                    type="button"
                                                                    onClick={handleSmsDraft}
                                                                    disabled={!smsContactId || !isHelmConnected || isSmsAiLoading}
                                                                    className="text-sm px-3 py-1.5 rounded-lg border border-primary-300 text-primary-600 hover:bg-primary-50 flex items-center gap-1.5 disabled:opacity-50 disabled:cursor-not-allowed"
                                                                >
                                                                    {isSmsAiLoading ? (
                                                                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                                                    ) : (
                                                                        <Sparkles className="w-3.5 h-3.5" />
                                                                    )}
                                                                    Draft with AI
                                                                </button>
                                                                {!isHelmConnected && (
                                                                    <span className="text-xs text-slate-400">Connect Helm Hub to enable</span>
                                                                )}
                                                              </div>
                                                              <textarea
                                                                                  required
                                                                                  rows={4}
                                                                                  value={smsMessage}
                                                                                  onChange={(e) => setSmsMessage(e.target.value)}
                                                                                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 resize-none"
                                                                                  placeholder="Type your message..."
                                                                                />
                                                              <p className="text-xs text-slate-500 mt-1">{smsMessage.length} / 160 characters</p>p>
                                              </div>div>
                                
                                  {/* Quick Templates */}
                                              <div>
                                                              <p className="text-sm font-medium text-slate-700 mb-2">Quick Templates:</p>p>
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
                                                              </button>button>
                                                            ))}
                                                              </div>div>
                                              </div>div>
                                
                                              <button
                                                                type="submit"
                                                                disabled={sendSMS.isPending || !smsContactId || !smsMessage.trim()}
                                                                className="flex items-center gap-2 px-6 py-2.5 bg-warning-500 text-white rounded-lg hover:bg-warning-600 transition-colors disabled:opacity-50"
                                                              >
                                                {sendSMS.isPending ? (
                                                                                  <>
                                                                                                      <Loader2 className="w-4 h-4 animate-spin" />
                                                                                                      Sending...
                                                                                    </>>
                                                                                ) : (
                                                                                  <>
                                                                                                      <Send className="w-4 h-4" />
                                                                                                      Send SMS
                                                                                    </>>
                                                                                )}
                                              </button>button>
                                </form>form>
                    </div>div>
                      )}
              
                {/* Email Tab */}
                {activeTab === 'email' && (
                    <div className="p-6">
                                <form onSubmit={handleSendEmail} className="space-y-4 max-w-2xl">
                                              <div>
                                                              <label className="block text-sm font-medium text-slate-700 mb-1">
                                                                                Select Contact *
                                                              </label>label>
                                                              <div className="relative mb-2">
                                                                                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                                                                                <input
                                                                                                      type="text"
                                                                                                      value={emailSearch}
                                                                                                      onChange={(e) => setEmailSearch(e.target.value)}
                                                                                                      className="w-full pl-9 pr-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                                                                                                      placeholder="Search contacts..."
                                                                                                    />
                                                              </div>div>
                                                              <div className="max-h-40 overflow-y-auto border border-slate-200 rounded-lg">
                                                                {filteredEmailContacts?.length === 0 ? (
                                          <p className="p-3 text-sm text-slate-500 text-center">No contacts found</p>p>
                                        ) : (
                                          filteredEmailContacts?.map((contact) => (
                                                                  <button
                                                                                            key={contact.id}
                                                                                            type="button"
                                                                                            onClick={() => setEmailContactId(contact.id)}
                                                                                            className={`w-full px-3 py-2 text-left hover:bg-slate-50 transition-colors ${
                                                                                                                        emailContactId === contact.id ? 'bg-primary-50 border-l-2 border-primary-500' : ''
                                                                                              }`}
                                                                                          >
                                                                                          <p className="font-medium text-slate-800">{contact.name}</p>p>
                                                                                          <p className="text-sm text-slate-500">{contact.email}</p>p>
                                                                  </button>button>
                                                                ))
                                        )}
                                                              </div>div>
                                              </div>div>
                                              <div>
                                                              <label className="block text-sm font-medium text-slate-700 mb-1">
                                                                                Subject *
                                                              </label>label>
                                                              <input
                                                                                  type="text"
                                                                                  required
                                                                                  value={emailSubject}
                                                                                  onChange={(e) => setEmailSubject(e.target.value)}
                                                                                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                                                                                  placeholder="Email subject..."
                                                                                />
                                              </div>div>
                                              <div>
                                                              <label className="block text-sm font-medium text-slate-700 mb-1">
                                                                                Body *
                                                              </label>label>
                                                              <textarea
                                                                                  required
                                                                                  rows={8}
                                                                                  value={emailBody}
                                                                                  onChange={(e) => setEmailBody(e.target.value)}
                                                                                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 resize-none"
                                                                                  placeholder="Write your email..."
                                                                                />
                                              </div>div>
                                              <button
                                                                type="submit"
                                                                disabled={sendEmail.isPending || !emailContactId || !emailSubject.trim() || !emailBody.trim()}
                                                                className="flex items-center gap-2 px-6 py-2.5 bg-primary-500 text-white rounded-lg hover:bg-primary-600 transition-colors disabled:opacity-50"
                                                              >
                                                {sendEmail.isPending ? (
                                                                                  <>
                                                                                                      <Loader2 className="w-4 h-4 animate-spin" />
                                                                                                      Sending...
                                                                                    </>>
                                                                                ) : (
                                                                                  <>
                                                                                                      <Send className="w-4 h-4" />
                                                                                                      Send Email
                                                                                    </>>
                                                                                )}
                                              </button>button>
                                </form>form>
                    </div>div>
                      )}
              </div>div>
        </div>div>
      )
}</></></></></div>
