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
} from 'lucide-react'
import { toast } from 'sonner'
import { useContacts, useSendSMS, useSendEmail } from '@/hooks/useApi'
import { formatPhone } from '@/utils/helpers'
import { helmChat, HelmProxyError } from '../../services/helmProxy'
import type { Contact } from '@/types'

type ActiveTab = 'voice' | 'sms' | 'email'

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

export default function AssistantHub() {
    const [activeTab, setActiveTab] = useState<ActiveTab>('voice')
    const [agents, setAgents] = useState(mockAgents)
    const [isHelmConnected, setIsHelmConnected] = useState(false)

  // SMS state
  const [smsContactId, setSmsContactId] = useState('')
    const [smsMessage, setSmsMessage] = useState('')
    const [smsSearch, setSmsSearch] = useState('')

  // Email state
  const [emailContactId, setEmailContactId] = useState('')
    const [emailSubject, setEmailSubject] = useState('')
    const [emailBody, setEmailBody] = useState('')
    const [emailSearch, setEmailSearch] = useState('')

  useEffect(() => {
        const email = localStorage.getItem('helmHub_linkedEmail')
        setIsHelmConnected(!!email)
  }, [])

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

  const stats = {
        totalCalls: agents.reduce((acc, a) => acc + a.callsToday, 0),
        activeAgents: agents.filter((a) => a.status === 'active').length,
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
                                <div className="p-4 border-b border-slate-200">
                                              <h2 className="text-lg font-semibold text-slate-800">CallCommander AI Agents</h2>h2>
                                </div>div>
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
                                                                            </div>div>
                                                                            <div>
                                                                                                  <h3 className="font-medium text-slate-800">{agent.name}</h3>h3>
                                                                                                  <div className="flex items-center gap-3 text-sm text-slate-500">
                                                                                                                          <span className="flex items-center gap-1">
                                                                                                                                                    <Phone className="w-3 h-3" />
                                                                                                                            {agent.callsToday} calls today
                                                                                                                            </span>span>
                                                                                                                          <span className="flex items-center gap-1">
                                                                                                                                                    <Clock className="w-3 h-3" />
                                                                                                                                                    Avg: {agent.avgDuration}
                                                                                                                            </span>span>
                                                                                                    </div>div>
                                                                            </div>div>
                                                        </div>div>
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
                                                                            </span>span>
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
                                                                            </button>button>
                                                        </div>div>
                                      </div>div>
                                    ))}
                                </div>div>
                    
                      {/* Voice Quick Actions */}
                                <div className="p-4 border-t border-slate-200">
                                              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                                              <button
                                                                                  onClick={() => toast.info('Call queue feature coming soon')}
                                                                                  className="flex items-center gap-3 p-4 bg-slate-50 rounded-xl border border-slate-200 hover:border-primary-300 hover:bg-primary-50 transition-colors text-left"
                                                                                >
                                                                                <div className="p-2 bg-primary-100 rounded-lg">
                                                                                                    <Phone className="w-5 h-5 text-primary-600" />
                                                                                </div>div>
                                                                                <div>
                                                                                                    <h3 className="font-medium text-slate-800">Start Call Queue</h3>h3>
                                                                                                    <p className="text-sm text-slate-500">Begin automated outbound calls</p>p>
                                                                                </div>div>
                                                              </button>button>
                                                              <button
                                                                                  onClick={() => toast.info('Agent settings coming soon')}
                                                                                  className="flex items-center gap-3 p-4 bg-slate-50 rounded-xl border border-slate-200 hover:border-primary-300 hover:bg-primary-50 transition-colors text-left"
                                                                                >
                                                                                <div className="p-2 bg-slate-100 rounded-lg">
                                                                                                    <Settings className="w-5 h-5 text-slate-600" />
                                                                                </div>div>
                                                                                <div>
                                                                                                    <h3 className="font-medium text-slate-800">Agent Settings</h3>h3>
                                                                                                    <p className="text-sm text-slate-500">Configure voice agent behavior</p>p>
                                                                                </div>div>
                                                              </button>button>
                                              </div>div>
                                </div>div>
                    </div>div>
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
