import { useState, useEffect, useRef } from 'react'
import {
  Phone,
  PhoneCall,
  PhoneOff,
  MessageSquare,
  Voicemail,
  FileText,
  CreditCard,
  Search,
  Plus,
  Trash2,
  Edit3,
  Play,
  Pause,
  Mic,
  Square,
  Send,
  X,
  ChevronDown,
  Lock,
  Sparkles,
  ArrowRight,
} from 'lucide-react'
import * as phoneApi from '@/services/phoneApi'

type TabKey = 'numbers' | 'dialer' | 'sms' | 'voicemail' | 'fax' | 'credits'

const TABS: { key: TabKey; label: string; icon: typeof Phone }[] = [
  { key: 'numbers', label: 'Numbers', icon: Phone },
  { key: 'dialer', label: 'Dialer', icon: PhoneCall },
  { key: 'sms', label: 'SMS', icon: MessageSquare },
  { key: 'voicemail', label: 'Voicemail Drops', icon: Voicemail },
  { key: 'fax', label: 'Fax', icon: FileText },
  { key: 'credits', label: 'Credits & Usage', icon: CreditCard },
]

const DISPOSITIONS = [
  'Interested',
  'Not Interested',
  'Schedule Callback',
  'Left Voicemail',
  'No Answer',
  'Wrong Number',
]

const CREDIT_BUNDLES = [
  { key: 'starter', label: 'Starter Pack', price: '$25.00', credits: '$30.00', bonus: '17%' },
  { key: 'growth', label: 'Growth Pack', price: '$50.00', credits: '$65.00', bonus: '30%', popular: true },
  { key: 'power', label: 'Power Pack', price: '$100.00', credits: '$140.00', bonus: '40%' },
]

const PRICING_TABLE = [
  { item: 'Outbound calls', rate: '$0.03/min' },
  { item: 'Inbound calls', rate: '$0.03/min' },
  { item: 'Outbound SMS', rate: '$0.02/msg' },
  { item: 'Inbound SMS', rate: 'Free' },
  { item: 'Fax sent', rate: '$0.04/page' },
  { item: 'Fax received', rate: '$0.02/page' },
  { item: 'Additional numbers', rate: '$2.00/mo' },
  { item: 'AI Voicemail Drops (Pro+)', rate: '$0.25/drop (credits)' },
  { item: 'Standard drop', rate: '$0.05/drop' },
]

export default function PhonePage() {
  const [activeTab, setActiveTab] = useState<TabKey>('numbers')

  // Read tab from URL params
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const tab = params.get('tab')
    if (tab && TABS.some((t) => t.key === tab)) {
      setActiveTab(tab as TabKey)
    }
  }, [])

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl md:text-2xl font-bold text-slate-900">Phone System</h1>
        <p className="text-sm text-slate-500 mt-1">
          Manage numbers, calls, SMS, voicemail drops, fax, and credits
        </p>
      </div>

      {/* Tabs */}
      <div className="border-b border-slate-200">
        <nav className="flex gap-1 -mb-px overflow-x-auto scrollbar-hide">
          {TABS.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`flex items-center gap-1.5 px-3 md:px-4 py-2.5 text-sm font-medium border-b-2 transition-colors whitespace-nowrap min-h-[44px] ${
                activeTab === tab.key
                  ? 'border-primary-600 text-primary-600'
                  : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300'
              }`}
            >
              <tab.icon className="w-4 h-4 shrink-0" />
              <span className="hidden sm:inline">{tab.label}</span>
              <span className="sm:hidden">{tab.key === 'numbers' ? 'Nums' : tab.key === 'dialer' ? 'Dial' : tab.key === 'voicemail' ? 'VM' : tab.key === 'credits' ? 'Credits' : tab.label}</span>
            </button>
          ))}
        </nav>
      </div>

      {/* Tab Content */}
      <div>
        {activeTab === 'numbers' && <NumbersTab />}
        {activeTab === 'dialer' && <DialerTab />}
        {activeTab === 'sms' && <SmsTab />}
        {activeTab === 'voicemail' && <VoicemailTab />}
        {activeTab === 'fax' && <FaxTab />}
        {activeTab === 'credits' && <CreditsTab />}
      </div>
    </div>
  )
}

/* ═══════════════════════════════════════════════════════════════
   TAB 1 — Numbers
   ═══════════════════════════════════════════════════════════════ */

function NumbersTab() {
  const [numbers, setNumbers] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [searchAreaCode, setSearchAreaCode] = useState('')
  const [availableNumbers, setAvailableNumbers] = useState<any[]>([])
  const [searching, setSearching] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editForm, setEditForm] = useState({ friendly_name: '', forward_to: '', use_softphone: false })

  useEffect(() => {
    loadNumbers()
  }, [])

  async function loadNumbers() {
    try {
      const data = await phoneApi.getNumbers()
      setNumbers(data.numbers)
    } catch (e) {
      // Error loading numbers - continue without data
    } finally {
      setLoading(false)
    }
  }

  async function handleSearch() {
    if (!searchAreaCode) return
    setSearching(true)
    try {
      const data = await phoneApi.searchNumbers(searchAreaCode)
      setAvailableNumbers(data.numbers)
    } catch (e) {
      // Error searching numbers - continue without results
    } finally {
      setSearching(false)
    }
  }

  async function handlePurchase(num: any) {
    if (!confirm(`Purchase ${num.phone_number}? ${numbers.length === 0 ? 'Free (primary)' : '$2.00/mo'}`)) return
    try {
      await phoneApi.purchaseNumber({
        phone_number: num.phone_number,
        friendly_name: num.friendly_name || num.phone_number,
        number_type: 'local',
      })
      setAvailableNumbers([])
      loadNumbers()
    } catch (e: any) {
      alert(e.message)
    }
  }

  async function handleRelease(id: string) {
    if (!confirm('Release this number? This cannot be undone.')) return
    try {
      await phoneApi.releaseNumber(id)
      loadNumbers()
    } catch (e: any) {
      alert(e.message)
    }
  }

  async function handleUpdateNumber() {
    if (!editingId) return
    try {
      await phoneApi.updateNumber(editingId, editForm)
      setEditingId(null)
      loadNumbers()
    } catch (e: any) {
      alert(e.message)
    }
  }

  function formatPhone(num: string) {
    if (!num) return ''
    const digits = num.replace(/\D/g, '')
    if (digits.length === 11 && digits[0] === '1') {
      return `(${digits.slice(1, 4)}) ${digits.slice(4, 7)}-${digits.slice(7)}`
    }
    return num
  }

  if (loading) {
    return <div className="animate-pulse space-y-4">{[1, 2].map((i) => <div key={i} className="h-24 bg-slate-100 rounded-lg" />)}</div>
  }

  return (
    <div className="space-y-8">
      {/* My Numbers */}
      <div>
        <h2 className="text-lg font-semibold text-slate-900 mb-4">My Numbers</h2>
        {numbers.length === 0 ? (
          <div className="bg-slate-50 rounded-lg p-8 text-center">
            <Phone className="w-10 h-10 text-slate-300 mx-auto mb-3" />
            <p className="text-slate-500">No phone numbers yet. Purchase your first number below.</p>
            <p className="text-xs text-slate-400 mt-1">First number included in your plan</p>
          </div>
        ) : (
          <div className="grid gap-4 md:grid-cols-2">
            {numbers.map((n: any) => (
              <div key={n.id} className="bg-white border border-slate-200 rounded-lg p-5">
                <div className="flex items-start justify-between">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-lg font-semibold text-slate-900">{formatPhone(n.number)}</span>
                      {n.is_primary && (
                        <span className="text-xs font-medium bg-primary-100 text-primary-700 px-2 py-0.5 rounded-full">Primary</span>
                      )}
                    </div>
                    <p className="text-sm text-slate-500 mt-0.5">{n.friendly_name}</p>
                  </div>
                  <span className="text-sm font-medium text-slate-600">
                    {n.monthly_cost === 0 ? 'Included' : `$${n.monthly_cost.toFixed(2)}/mo`}
                  </span>
                </div>

                {/* Capabilities */}
                <div className="flex gap-1.5 mt-3">
                  {(n.capabilities || []).map((cap: string) => (
                    <span key={cap} className="text-xs bg-slate-100 text-slate-600 px-2 py-0.5 rounded capitalize">
                      {cap}
                    </span>
                  ))}
                </div>

                {/* Routing */}
                <div className="mt-3 text-sm text-slate-500">
                  {n.use_softphone ? 'Softphone enabled' : n.forward_to ? `Forwarding to ${formatPhone(n.forward_to)}` : 'No routing configured'}
                </div>

                {/* Actions */}
                <div className="flex gap-2 mt-4">
                  <button
                    onClick={() => {
                      setEditingId(n.id)
                      setEditForm({ friendly_name: n.friendly_name, forward_to: n.forward_to || '', use_softphone: n.use_softphone })
                    }}
                    className="text-xs flex items-center gap-1 text-primary-600 hover:text-primary-700"
                  >
                    <Edit3 className="w-3.5 h-3.5" /> Edit Routing
                  </button>
                  {!n.is_primary && (
                    <button onClick={() => handleRelease(n.id)} className="text-xs flex items-center gap-1 text-red-500 hover:text-red-600">
                      <Trash2 className="w-3.5 h-3.5" /> Release
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Edit Modal */}
      {editingId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-lg shadow-xl p-6 w-full max-w-md">
            <h3 className="text-lg font-semibold mb-4">Edit Routing</h3>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Friendly Name</label>
                <input
                  type="text"
                  value={editForm.friendly_name}
                  onChange={(e) => setEditForm({ ...editForm, friendly_name: e.target.value })}
                  className="w-full border rounded-lg px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Routing</label>
                <div className="flex gap-3">
                  <label className="flex items-center gap-2 text-sm">
                    <input
                      type="radio"
                      checked={!editForm.use_softphone}
                      onChange={() => setEditForm({ ...editForm, use_softphone: false })}
                    />
                    Forward to Number
                  </label>
                  <label className="flex items-center gap-2 text-sm">
                    <input
                      type="radio"
                      checked={editForm.use_softphone}
                      onChange={() => setEditForm({ ...editForm, use_softphone: true, forward_to: '' })}
                    />
                    Use Softphone
                  </label>
                </div>
              </div>
              {!editForm.use_softphone && (
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Forward To</label>
                  <input
                    type="tel"
                    value={editForm.forward_to}
                    onChange={(e) => setEditForm({ ...editForm, forward_to: e.target.value })}
                    placeholder="+15551234567"
                    className="w-full border rounded-lg px-3 py-2 text-sm"
                  />
                </div>
              )}
            </div>
            <div className="flex justify-end gap-3 mt-6">
              <button onClick={() => setEditingId(null)} className="px-4 py-2 text-sm text-slate-600 hover:text-slate-800">
                Cancel
              </button>
              <button onClick={handleUpdateNumber} className="px-4 py-2 text-sm bg-primary-600 text-white rounded-lg hover:bg-primary-700">
                Save
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Purchase Number */}
      <div>
        <h2 className="text-lg font-semibold text-slate-900 mb-4">Purchase Number</h2>
        <div className="flex gap-3 items-end">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Area Code</label>
            <input
              type="text"
              maxLength={3}
              value={searchAreaCode}
              onChange={(e) => setSearchAreaCode(e.target.value.replace(/\D/g, ''))}
              placeholder="512"
              className="w-28 border rounded-lg px-3 py-2 text-sm"
            />
          </div>
          <button
            onClick={handleSearch}
            disabled={searching || !searchAreaCode}
            className="flex items-center gap-2 px-4 py-2 bg-primary-600 text-white text-sm rounded-lg hover:bg-primary-700 disabled:opacity-50"
          >
            <Search className="w-4 h-4" />
            {searching ? 'Searching...' : 'Search'}
          </button>
        </div>
        {numbers.length === 0 && (
          <p className="text-xs text-green-600 mt-2">First number included in your plan</p>
        )}

        {availableNumbers.length > 0 && (
          <div className="grid gap-3 md:grid-cols-3 mt-4">
            {availableNumbers.map((n: any, i: number) => (
              <div key={i} className="border border-slate-200 rounded-lg p-4">
                <p className="font-semibold text-slate-900">{formatPhone(n.phone_number)}</p>
                <p className="text-xs text-slate-500 mt-1">{n.locality}, {n.region}</p>
                <div className="flex gap-1 mt-2">
                  {n.capabilities?.voice && <span className="text-xs bg-green-50 text-green-700 px-1.5 py-0.5 rounded">Voice</span>}
                  {n.capabilities?.sms && <span className="text-xs bg-blue-50 text-blue-700 px-1.5 py-0.5 rounded">SMS</span>}
                  {n.capabilities?.fax && <span className="text-xs bg-purple-50 text-purple-700 px-1.5 py-0.5 rounded">Fax</span>}
                </div>
                <button
                  onClick={() => handlePurchase(n)}
                  className="w-full mt-3 px-3 py-1.5 bg-primary-600 text-white text-sm rounded-lg hover:bg-primary-700"
                >
                  Purchase{numbers.length > 0 ? ' — $2.00/mo' : ' — Free'}
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

/* ═══════════════════════════════════════════════════════════════
   TAB 2 — Dialer
   ═══════════════════════════════════════════════════════════════ */

function DialerTab() {
  const [mode, setMode] = useState<'click' | 'auto'>('click')
  const [numbers, setNumbers] = useState<any[]>([])
  const [selectedNumber, setSelectedNumber] = useState('')
  const [toNumber, setToNumber] = useState('')
  const [callActive, setCallActive] = useState(false)
  const [callTimer, setCallTimer] = useState(0)
  const [disposition, setDisposition] = useState('')
  const [notes, setNotes] = useState('')
  const [callLogId, setCallLogId] = useState('')
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => {
    phoneApi.getNumbers().then((d) => {
      setNumbers(d.numbers)
      if (d.numbers.length > 0) setSelectedNumber(d.numbers[0].id as string)
    })
    return () => { if (timerRef.current) clearInterval(timerRef.current) }
  }, [])

  async function handleDial() {
    if (!toNumber || !selectedNumber) return
    try {
      const result = await phoneApi.dial({ to_number: toNumber, phone_number_id: selectedNumber })
      setCallActive(true)
      setCallLogId(result.call_log_id)
      setCallTimer(0)
      timerRef.current = setInterval(() => setCallTimer((t) => t + 1), 1000)
    } catch (e: any) {
      alert(e.message)
    }
  }

  function handleHangUp() {
    setCallActive(false)
    if (timerRef.current) clearInterval(timerRef.current)
  }

  function formatTimer(secs: number) {
    const m = Math.floor(secs / 60).toString().padStart(2, '0')
    const s = (secs % 60).toString().padStart(2, '0')
    return `${m}:${s}`
  }

  return (
    <div className="space-y-6">
      {/* Mode Toggle */}
      <div className="flex gap-2">
        <button
          onClick={() => setMode('click')}
          className={`px-4 py-2 text-sm rounded-lg ${mode === 'click' ? 'bg-primary-600 text-white' : 'bg-slate-100 text-slate-600'}`}
        >
          Click to Call
        </button>
        <button
          onClick={() => setMode('auto')}
          className={`px-4 py-2 text-sm rounded-lg ${mode === 'auto' ? 'bg-primary-600 text-white' : 'bg-slate-100 text-slate-600'}`}
        >
          Auto Dialer
        </button>
      </div>

      {mode === 'click' ? (
        <div className="max-w-lg space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">From Number</label>
            <select
              value={selectedNumber}
              onChange={(e) => setSelectedNumber(e.target.value)}
              className="w-full border rounded-lg px-3 py-2 text-sm"
            >
              {numbers.map((n: any) => (
                <option key={n.id} value={n.id}>{n.friendly_name} ({n.number})</option>
              ))}
            </select>
          </div>

          {!callActive ? (
            <>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Number to Call</label>
                <input
                  type="tel"
                  value={toNumber}
                  onChange={(e) => setToNumber(e.target.value)}
                  placeholder="+15551234567"
                  className="w-full border rounded-lg px-3 py-2 text-sm"
                />
              </div>
              <button
                onClick={handleDial}
                disabled={!toNumber || !selectedNumber}
                className="flex items-center gap-2 px-6 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 text-sm font-medium"
              >
                <PhoneCall className="w-5 h-5" /> Call
              </button>
            </>
          ) : (
            <div className="bg-green-50 border border-green-200 rounded-lg p-6">
              <div className="text-center">
                <p className="text-3xl font-mono font-bold text-green-700">{formatTimer(callTimer)}</p>
                <p className="text-sm text-green-600 mt-1">Connected to {toNumber}</p>
              </div>
              <div className="flex justify-center gap-3 mt-4">
                <button className="p-3 bg-slate-100 rounded-full hover:bg-slate-200">
                  <Mic className="w-5 h-5 text-slate-600" />
                </button>
                <button onClick={handleHangUp} className="p-3 bg-red-600 rounded-full hover:bg-red-700">
                  <PhoneOff className="w-5 h-5 text-white" />
                </button>
              </div>
            </div>
          )}

          {!callActive && callLogId && (
            <div className="bg-slate-50 border border-slate-200 rounded-lg p-4">
              <h3 className="text-sm font-semibold text-slate-700 mb-3">Call Disposition</h3>
              <select
                value={disposition}
                onChange={(e) => setDisposition(e.target.value)}
                className="w-full border rounded-lg px-3 py-2 text-sm mb-3"
              >
                <option value="">Select disposition...</option>
                {DISPOSITIONS.map((d) => (
                  <option key={d} value={d.toLowerCase().replace(/ /g, '_')}>{d}</option>
                ))}
              </select>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Notes..."
                rows={3}
                className="w-full border rounded-lg px-3 py-2 text-sm mb-3"
              />
              <button
                onClick={() => {
                  setCallLogId('')
                  setDisposition('')
                  setNotes('')
                  setToNumber('')
                }}
                className="px-4 py-2 bg-primary-600 text-white text-sm rounded-lg hover:bg-primary-700"
              >
                Save & Done
              </button>
            </div>
          )}
        </div>
      ) : (
        <div className="max-w-lg space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">From Number</label>
            <select
              value={selectedNumber}
              onChange={(e) => setSelectedNumber(e.target.value)}
              className="w-full border rounded-lg px-3 py-2 text-sm"
            >
              {numbers.map((n: any) => (
                <option key={n.id} value={n.id}>{n.friendly_name} ({n.number})</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Paste Numbers (one per line)</label>
            <textarea rows={5} className="w-full border rounded-lg px-3 py-2 text-sm" placeholder="+15551234567&#10;+15559876543" />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Delay between calls (s)</label>
              <input type="number" defaultValue={5} min={1} className="w-full border rounded-lg px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Auto-skip after rings</label>
              <input type="number" defaultValue={6} min={1} className="w-full border rounded-lg px-3 py-2 text-sm" />
            </div>
          </div>
          <button className="flex items-center gap-2 px-6 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 text-sm font-medium">
            <Play className="w-4 h-4" /> Start Dialing
          </button>
        </div>
      )}
    </div>
  )
}

/* ═══════════════════════════════════════════════════════════════
   TAB 3 — SMS
   ═══════════════════════════════════════════════════════════════ */

function SmsTab() {
  const [conversations, setConversations] = useState<any[]>([])
  const [selectedContact, setSelectedContact] = useState<string | null>(null)
  const [messages, setMessages] = useState<any[]>([])
  const [compose, setCompose] = useState('')
  const [numbers, setNumbers] = useState<any[]>([])
  const [selectedNumber, setSelectedNumber] = useState('')
  const [loading, setLoading] = useState(true)
  const [showCampaignForm, setShowCampaignForm] = useState(false)
  const [campaigns, setCampaigns] = useState<any[]>([])

  useEffect(() => {
    loadData()
  }, [])

  async function loadData() {
    try {
      const [convData, numData, campData] = await Promise.all([
        phoneApi.getSmsConversations(),
        phoneApi.getNumbers(),
        phoneApi.getSmsCampaigns(),
      ])
      setConversations(convData.conversations)
      setNumbers(numData.numbers)
      setCampaigns(campData.campaigns)
      if (numData.numbers.length > 0) setSelectedNumber(numData.numbers[0].id as string)
    } catch (e) {
      // Error loading SMS data - continue without data
    } finally {
      setLoading(false)
    }
  }

  async function selectConversation(contactId: string) {
    setSelectedContact(contactId)
    try {
      const data = await phoneApi.getSmsThread(contactId)
      setMessages(data.messages)
    } catch (e) {
      // Error loading conversation thread - continue without messages
    }
  }

  async function handleSend() {
    if (!compose.trim() || !selectedContact) return
    try {
      const conv = conversations.find((c) => c.contact_id === selectedContact)
      await phoneApi.sendSms({
        to_number: conv?.contact_number || '',
        body: compose,
        phone_number_id: selectedNumber,
        contact_id: selectedContact,
      })
      setCompose('')
      selectConversation(selectedContact)
    } catch (e: any) {
      alert(e.message)
    }
  }

  if (loading) {
    return <div className="animate-pulse h-96 bg-slate-100 rounded-lg" />
  }

  return (
    <div className="space-y-6">
      {/* Split Pane */}
      <div className="flex border border-slate-200 rounded-lg overflow-hidden h-[500px] md:h-[500px]">
        {/* Left — Conversations */}
        <div className={`${selectedContact ? 'hidden md:flex' : 'flex'} w-full md:w-80 border-r border-slate-200 flex-col`}>
          <div className="p-3 border-b border-slate-200">
            <input type="text" placeholder="Search conversations..." className="w-full border rounded-lg px-3 py-2 text-sm min-h-[44px]" />
          </div>
          <div className="flex-1 overflow-y-auto">
            {conversations.length === 0 ? (
              <div className="p-4 text-center text-sm text-slate-400">No conversations yet</div>
            ) : (
              conversations.map((conv: any) => (
                <button
                  key={conv.contact_id || conv.contact_number}
                  onClick={() => selectConversation(conv.contact_id || conv.contact_number)}
                  className={`w-full text-left px-4 py-3 border-b border-slate-100 hover:bg-slate-50 min-h-[52px] ${
                    selectedContact === (conv.contact_id || conv.contact_number) ? 'bg-primary-50' : ''
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 bg-slate-200 rounded-full flex items-center justify-center text-sm font-medium text-slate-600 shrink-0">
                      {(conv.contact_number || '?')[0]}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-slate-900 truncate">{conv.contact_number}</p>
                      <p className="text-xs text-slate-500 truncate">{conv.last_message}</p>
                    </div>
                    {conv.unread_count > 0 && (
                      <span className="w-5 h-5 bg-primary-600 text-white text-xs rounded-full flex items-center justify-center shrink-0">
                        {conv.unread_count}
                      </span>
                    )}
                  </div>
                </button>
              ))
            )}
          </div>
        </div>

        {/* Right — Thread */}
        <div className={`${selectedContact ? 'flex' : 'hidden md:flex'} flex-1 flex-col`}>
          {selectedContact ? (
            <>
              <div className="p-3 border-b border-slate-200 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <button onClick={() => setSelectedContact(null)} className="md:hidden p-1.5 rounded-lg hover:bg-slate-100 min-w-[36px] min-h-[36px] flex items-center justify-center">
                    <ArrowRight className="w-4 h-4 text-slate-500 rotate-180" />
                  </button>
                  <span className="font-medium text-sm text-slate-900">{selectedContact}</span>
                </div>
                <button className="text-xs text-primary-600 hover:text-primary-700 flex items-center gap-1">
                  <PhoneCall className="w-3.5 h-3.5" /> Call
                </button>
              </div>
              <div className="flex-1 overflow-y-auto p-4 space-y-3">
                {messages.map((m: any) => (
                  <div key={m.id} className={`flex ${m.direction === 'outbound' ? 'justify-end' : 'justify-start'}`}>
                    <div
                      className={`max-w-[70%] rounded-lg px-3 py-2 text-sm ${
                        m.direction === 'outbound' ? 'bg-primary-600 text-white' : 'bg-slate-100 text-slate-900'
                      }`}
                    >
                      <p>{m.body}</p>
                      <p className={`text-xs mt-1 ${m.direction === 'outbound' ? 'text-primary-200' : 'text-slate-400'}`}>
                        {m.sent_at ? new Date(m.sent_at).toLocaleTimeString() : ''}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
              <div className="p-3 border-t border-slate-200">
                <div className="flex items-center gap-2 mb-2">
                  <select
                    value={selectedNumber}
                    onChange={(e) => setSelectedNumber(e.target.value)}
                    className="text-xs border rounded px-2 py-1"
                  >
                    {numbers.map((n: any) => (
                      <option key={n.id} value={n.id}>{n.number}</option>
                    ))}
                  </select>
                  <span className="text-xs text-slate-400">{compose.length}/160</span>
                </div>
                <div className="flex gap-2">
                  <textarea
                    value={compose}
                    onChange={(e) => setCompose(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend() } }}
                    placeholder="Type a message..."
                    rows={1}
                    className="flex-1 border rounded-lg px-3 py-2 text-sm resize-none"
                  />
                  <button onClick={handleSend} disabled={!compose.trim()} className="px-3 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 disabled:opacity-50">
                    <Send className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </>
          ) : (
            <div className="flex-1 flex items-center justify-center text-sm text-slate-400">
              Select a conversation to view messages
            </div>
          )}
        </div>
      </div>

      {/* SMS Campaigns */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-slate-900">SMS Campaigns</h2>
          <button onClick={() => setShowCampaignForm(!showCampaignForm)} className="flex items-center gap-2 px-3 py-2 bg-primary-600 text-white text-sm rounded-lg hover:bg-primary-700">
            <Plus className="w-4 h-4" /> Create SMS Campaign
          </button>
        </div>

        {showCampaignForm && (
          <div className="bg-slate-50 border border-slate-200 rounded-lg p-5 mb-4 space-y-4">
            <input type="text" placeholder="Campaign Name" className="w-full border rounded-lg px-3 py-2 text-sm" />
            <select className="w-full border rounded-lg px-3 py-2 text-sm">
              {numbers.map((n: any) => (
                <option key={n.id} value={n.id}>{n.friendly_name} ({n.number})</option>
              ))}
            </select>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Message Template</label>
              <textarea rows={4} placeholder="Hi {{first_name}}, ..." className="w-full border rounded-lg px-3 py-2 text-sm" />
              <div className="flex gap-2 mt-1">
                {['{{first_name}}', '{{city}}', '{{property_address}}'].map((f) => (
                  <button key={f} className="text-xs text-primary-600 hover:underline">{f}</button>
                ))}
              </div>
            </div>
            <div className="flex gap-3">
              <button className="px-4 py-2 bg-primary-600 text-white text-sm rounded-lg hover:bg-primary-700">Save Draft</button>
              <button className="px-4 py-2 bg-green-600 text-white text-sm rounded-lg hover:bg-green-700">Send Now</button>
              <button onClick={() => setShowCampaignForm(false)} className="px-4 py-2 text-sm text-slate-500 hover:text-slate-700">Cancel</button>
            </div>
          </div>
        )}

        {campaigns.length === 0 ? (
          <div className="bg-slate-50 rounded-lg p-6 text-center text-sm text-slate-400">No SMS campaigns yet</div>
        ) : (
          <div className="grid gap-3 md:grid-cols-2">
            {campaigns.map((c: any) => (
              <div key={c.id} className="border border-slate-200 rounded-lg p-4">
                <div className="flex items-center justify-between">
                  <span className="font-medium text-sm text-slate-900">{c.name}</span>
                  <span className={`text-xs px-2 py-0.5 rounded-full ${c.status === 'sent' ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700'}`}>
                    {c.status}
                  </span>
                </div>
                <div className="flex gap-4 mt-2 text-xs text-slate-500">
                  <span>Sent: {c.total_sent}</span>
                  <span>Delivered: {c.total_delivered}</span>
                  <span>Replied: {c.total_replied}</span>
                </div>
                <p className="text-xs text-slate-500 mt-1">Cost: ${c.cost?.toFixed(2)}</p>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

/* ═══════════════════════════════════════════════════════════════
   TAB 4 — Voicemail Drops
   ═══════════════════════════════════════════════════════════════ */

function VoicemailTab() {
  const [drops, setDrops] = useState<any[]>([])
  const [voices, setVoices] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({ name: '', drop_type: 'recorded', script_template: '', elevenlabs_voice_id: '', audio_url: '' })
  const [recording, setRecording] = useState(false)
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])

  useEffect(() => {
    loadData()
  }, [])

  async function loadData() {
    try {
      const [dropData, voiceData] = await Promise.all([
        phoneApi.getVoicemailDrops(),
        phoneApi.getVoices().catch(() => ({ voices: [] })),
      ])
      setDrops(dropData.drops)
      setVoices(voiceData.voices)
    } catch (e) {
      // Error loading voicemail drops - continue without data
    } finally {
      setLoading(false)
    }
  }

  async function handleCreate() {
    try {
      await phoneApi.createVoicemailDrop({
        name: form.name,
        drop_type: form.drop_type,
        script_template: form.script_template || undefined,
        elevenlabs_voice_id: form.elevenlabs_voice_id || undefined,
        audio_url: form.audio_url || undefined,
      })
      setShowForm(false)
      setForm({ name: '', drop_type: 'recorded', script_template: '', elevenlabs_voice_id: '', audio_url: '' })
      loadData()
    } catch (e: any) {
      alert(e.message)
    }
  }

  async function handleDelete(id: string) {
    if (!confirm('Delete this voicemail drop?')) return
    try {
      await phoneApi.deleteVoicemailDrop(id)
      loadData()
    } catch (e: any) {
      alert(e.message)
    }
  }

  async function handleStartRecord() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const mr = new MediaRecorder(stream)
      chunksRef.current = []
      mr.ondataavailable = (e) => chunksRef.current.push(e.data)
      mr.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: 'audio/webm' })
        const url = URL.createObjectURL(blob)
        setForm((f) => ({ ...f, audio_url: url }))
        stream.getTracks().forEach((t) => t.stop())
      }
      mediaRecorderRef.current = mr
      mr.start()
      setRecording(true)
    } catch {
      alert('Microphone access denied')
    }
  }

  function handleStopRecord() {
    mediaRecorderRef.current?.stop()
    setRecording(false)
  }

  function dropTypeBadge(type: string) {
    switch (type) {
      case 'recorded': return <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full">Recorded</span>
      case 'uploaded': return <span className="text-xs bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full">Uploaded</span>
      case 'ai_personalized': return <span className="text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full flex items-center gap-1"><Sparkles className="w-3 h-3" />AI Personalized</span>
      default: return null
    }
  }

  if (loading) {
    return <div className="animate-pulse h-48 bg-slate-100 rounded-lg" />
  }

  return (
    <div className="space-y-6">
      {/* My Drops */}
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-slate-900">My Drops</h2>
        <button onClick={() => setShowForm(!showForm)} className="flex items-center gap-2 px-3 py-2 bg-primary-600 text-white text-sm rounded-lg hover:bg-primary-700">
          <Plus className="w-4 h-4" /> Create New Drop
        </button>
      </div>

      {drops.length === 0 && !showForm ? (
        <div className="bg-slate-50 rounded-lg p-8 text-center">
          <Voicemail className="w-10 h-10 text-slate-300 mx-auto mb-3" />
          <p className="text-slate-500 text-sm">No voicemail drops yet. Create one to get started.</p>
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {drops.map((d: any) => (
            <div key={d.id} className="border border-slate-200 rounded-lg p-4">
              <div className="flex items-start justify-between">
                <div>
                  <p className="font-medium text-sm text-slate-900">{d.name}</p>
                  <div className="mt-1">{dropTypeBadge(d.drop_type)}</div>
                </div>
                <button onClick={() => handleDelete(d.id)} className="text-slate-400 hover:text-red-500">
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
              {d.audio_url && (
                <button className="flex items-center gap-1.5 mt-3 text-xs text-primary-600 hover:text-primary-700">
                  <Play className="w-3.5 h-3.5" /> Preview
                </button>
              )}
              <button className="w-full mt-3 px-3 py-1.5 bg-green-50 text-green-700 text-xs font-medium rounded-lg hover:bg-green-100">
                Send Campaign
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Create Form */}
      {showForm && (
        <div className="bg-slate-50 border border-slate-200 rounded-lg p-5 space-y-4">
          <h3 className="text-sm font-semibold text-slate-700">Create New Drop</h3>
          <input
            type="text"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            placeholder="Drop Name"
            className="w-full border rounded-lg px-3 py-2 text-sm"
          />

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">Type</label>
            <div className="flex gap-3">
              {[
                { key: 'recorded', label: 'Recorded' },
                { key: 'uploaded', label: 'Uploaded' },
                { key: 'ai_personalized', label: 'AI Personalized' },
              ].map((t) => (
                <button
                  key={t.key}
                  onClick={() => setForm({ ...form, drop_type: t.key })}
                  className={`px-4 py-2 text-sm rounded-lg border ${form.drop_type === t.key ? 'border-primary-600 bg-primary-50 text-primary-700' : 'border-slate-200 text-slate-600'}`}
                >
                  {t.label}
                </button>
              ))}
            </div>
          </div>

          {form.drop_type === 'recorded' && (
            <div>
              {recording ? (
                <button onClick={handleStopRecord} className="flex items-center gap-2 px-4 py-2 bg-red-600 text-white text-sm rounded-lg">
                  <Square className="w-4 h-4" /> Stop Recording
                </button>
              ) : (
                <button onClick={handleStartRecord} className="flex items-center gap-2 px-4 py-2 bg-primary-600 text-white text-sm rounded-lg">
                  <Mic className="w-4 h-4" /> Record in Browser
                </button>
              )}
              {form.audio_url && <p className="text-xs text-green-600 mt-2">Recording saved</p>}
            </div>
          )}

          {form.drop_type === 'uploaded' && (
            <div>
              <input
                type="file"
                accept=".mp3,.wav,.m4a"
                onChange={(e) => {
                  const file = e.target.files?.[0]
                  if (file) setForm({ ...form, audio_url: URL.createObjectURL(file) })
                }}
                className="text-sm"
              />
            </div>
          )}

          {form.drop_type === 'ai_personalized' && (
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Script Template</label>
                <textarea
                  value={form.script_template}
                  onChange={(e) => setForm({ ...form, script_template: e.target.value })}
                  placeholder="Hi {{first_name}}, this is [your name] calling about the property at {{property_address}} in {{city}}..."
                  rows={4}
                  className="w-full border rounded-lg px-3 py-2 text-sm"
                />
                <div className="flex gap-2 mt-1">
                  {['{{first_name}}', '{{city}}', '{{property_address}}'].map((f) => (
                    <button
                      key={f}
                      onClick={() => setForm({ ...form, script_template: form.script_template + ' ' + f })}
                      className="text-xs text-primary-600 hover:underline"
                    >
                      {f}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Voice</label>
                <select
                  value={form.elevenlabs_voice_id}
                  onChange={(e) => setForm({ ...form, elevenlabs_voice_id: e.target.value })}
                  className="w-full border rounded-lg px-3 py-2 text-sm"
                >
                  <option value="">Select a voice...</option>
                  {voices.map((v: any) => (
                    <option key={v.voice_id} value={v.voice_id}>{v.name}</option>
                  ))}
                </select>
              </div>
              <p className="text-xs text-slate-500">
                AI Voicemail Drops &mdash; $0.25/drop (billed from credits, not included in any plan). Powered by ElevenLabs AI.
              </p>
            </div>
          )}

          <div className="flex gap-3">
            <button onClick={handleCreate} disabled={!form.name} className="px-4 py-2 bg-primary-600 text-white text-sm rounded-lg hover:bg-primary-700 disabled:opacity-50">
              Create Drop
            </button>
            <button onClick={() => setShowForm(false)} className="px-4 py-2 text-sm text-slate-500 hover:text-slate-700">
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

/* ═══════════════════════════════════════════════════════════════
   TAB 5 — Fax
   ═══════════════════════════════════════════════════════════════ */

function FaxTab() {
  const [faxes, setFaxes] = useState<any[]>([])
  const [numbers, setNumbers] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [toNumber, setToNumber] = useState('')
  const [fromNumberId, setFromNumberId] = useState('')
  const [mediaUrl, setMediaUrl] = useState('')

  useEffect(() => {
    loadData()
  }, [])

  async function loadData() {
    try {
      const [faxData, numData] = await Promise.all([
        phoneApi.getFaxHistory(),
        phoneApi.getNumbers(),
      ])
      setFaxes(faxData.faxes)
      setNumbers(numData.numbers)
      if (numData.numbers.length > 0) setFromNumberId(numData.numbers[0].id as string)
    } catch (e) {
      // Error loading fax data - continue without data
    } finally {
      setLoading(false)
    }
  }

  async function handleSendFax() {
    if (!toNumber || !fromNumberId || !mediaUrl) return
    try {
      await phoneApi.sendFax({
        to_number: toNumber,
        from_number_id: fromNumberId,
        media_url: mediaUrl,
      })
      setToNumber('')
      setMediaUrl('')
      loadData()
    } catch (e: any) {
      alert(e.message)
    }
  }

  if (loading) {
    return <div className="animate-pulse h-48 bg-slate-100 rounded-lg" />
  }

  return (
    <div className="space-y-6">
      {/* Send Fax Form */}
      <div className="bg-white border border-slate-200 rounded-lg p-5">
        <h2 className="text-lg font-semibold text-slate-900 mb-4">Send Fax</h2>
        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">To Fax Number</label>
            <input
              type="tel"
              value={toNumber}
              onChange={(e) => setToNumber(e.target.value)}
              placeholder="+15551234567"
              className="w-full border rounded-lg px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">From Number</label>
            <select
              value={fromNumberId}
              onChange={(e) => setFromNumberId(e.target.value)}
              className="w-full border rounded-lg px-3 py-2 text-sm"
            >
              {numbers.map((n: any) => (
                <option key={n.id} value={n.id}>{n.friendly_name} ({n.number})</option>
              ))}
            </select>
          </div>
        </div>
        <div className="mt-4">
          <label className="block text-sm font-medium text-slate-700 mb-1">PDF URL</label>
          <input
            type="url"
            value={mediaUrl}
            onChange={(e) => setMediaUrl(e.target.value)}
            placeholder="https://example.com/document.pdf"
            className="w-full border rounded-lg px-3 py-2 text-sm"
          />
          <p className="text-xs text-slate-400 mt-1">Estimated cost: $0.04/page</p>
        </div>
        <button
          onClick={handleSendFax}
          disabled={!toNumber || !fromNumberId || !mediaUrl}
          className="mt-4 flex items-center gap-2 px-4 py-2 bg-primary-600 text-white text-sm rounded-lg hover:bg-primary-700 disabled:opacity-50"
        >
          <Send className="w-4 h-4" /> Send Fax
        </button>
      </div>

      {/* Fax History */}
      <div>
        <h2 className="text-lg font-semibold text-slate-900 mb-4">Fax History</h2>
        {faxes.length === 0 ? (
          <div className="bg-slate-50 rounded-lg p-8 text-center text-sm text-slate-400">No faxes sent or received yet</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200">
                  <th className="text-left py-2.5 px-3 text-slate-500 font-medium">Direction</th>
                  <th className="text-left py-2.5 px-3 text-slate-500 font-medium">From</th>
                  <th className="text-left py-2.5 px-3 text-slate-500 font-medium">To</th>
                  <th className="text-left py-2.5 px-3 text-slate-500 font-medium">Pages</th>
                  <th className="text-left py-2.5 px-3 text-slate-500 font-medium">Cost</th>
                  <th className="text-left py-2.5 px-3 text-slate-500 font-medium">Status</th>
                  <th className="text-left py-2.5 px-3 text-slate-500 font-medium">Date</th>
                  <th className="text-left py-2.5 px-3 text-slate-500 font-medium"></th>
                </tr>
              </thead>
              <tbody>
                {faxes.map((f: any) => (
                  <tr key={f.id} className="border-b border-slate-100 hover:bg-slate-50">
                    <td className="py-2.5 px-3">
                      <span className={`text-xs px-2 py-0.5 rounded-full ${f.direction === 'outbound' ? 'bg-blue-100 text-blue-700' : 'bg-green-100 text-green-700'}`}>
                        {f.direction === 'outbound' ? 'Sent' : 'Received'}
                      </span>
                    </td>
                    <td className="py-2.5 px-3 text-slate-700">{f.from_number}</td>
                    <td className="py-2.5 px-3 text-slate-700">{f.to_number}</td>
                    <td className="py-2.5 px-3 text-slate-700">{f.pages}</td>
                    <td className="py-2.5 px-3 text-slate-700">${f.cost?.toFixed(2)}</td>
                    <td className="py-2.5 px-3">
                      <span className="text-xs bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full">{f.status}</span>
                    </td>
                    <td className="py-2.5 px-3 text-slate-500">{f.created_at ? new Date(f.created_at).toLocaleDateString() : ''}</td>
                    <td className="py-2.5 px-3">
                      {f.media_url && (
                        <a href={f.media_url} target="_blank" rel="noopener noreferrer" className="text-xs text-primary-600 hover:underline">
                          View PDF
                        </a>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}

/* ═══════════════════════════════════════════════════════════════
   TAB 6 — Credits & Usage
   ═══════════════════════════════════════════════════════════════ */

function CreditsTab() {
  const [credits, setCredits] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [showPricing, setShowPricing] = useState(false)

  useEffect(() => {
    phoneApi.getCredits().then((d) => { setCredits(d); setLoading(false) }).catch(() => setLoading(false))
  }, [])

  async function handlePurchase(bundle: string) {
    try {
      const data = await phoneApi.purchaseCredits(bundle)
      if (data.checkout_url) {
        window.location.href = data.checkout_url
      }
    } catch (e: any) {
      alert(e.message)
    }
  }

  function progressColor(used: number, limit: number) {
    const pct = limit > 0 ? used / limit : 0
    if (pct >= 0.9) return 'bg-red-500'
    if (pct >= 0.75) return 'bg-yellow-500'
    return 'bg-green-500'
  }

  if (loading) {
    return <div className="animate-pulse space-y-4">{[1, 2, 3].map((i) => <div key={i} className="h-32 bg-slate-100 rounded-lg" />)}</div>
  }

  return (
    <div className="space-y-6">
      {/* Usage This Month */}
      <div className="bg-white border border-slate-200 rounded-lg p-5">
        <h2 className="text-lg font-semibold text-slate-900 mb-4">Usage This Month</h2>
        {credits ? (
          <div className="space-y-4">
            <div>
              <div className="flex justify-between text-sm mb-1">
                <span className="text-slate-600">Minutes</span>
                <span className="text-slate-900 font-medium">{credits.minutes_used} of {credits.minutes_limit} used</span>
              </div>
              <div className="h-2.5 bg-slate-100 rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full ${progressColor(credits.minutes_used, credits.minutes_limit)}`}
                  style={{ width: `${Math.min(100, credits.minutes_limit > 0 ? (credits.minutes_used / credits.minutes_limit) * 100 : 0)}%` }}
                />
              </div>
            </div>
            <div>
              <div className="flex justify-between text-sm mb-1">
                <span className="text-slate-600">SMS</span>
                <span className="text-slate-900 font-medium">{credits.sms_used} of {credits.sms_limit} used</span>
              </div>
              <div className="h-2.5 bg-slate-100 rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full ${progressColor(credits.sms_used, credits.sms_limit)}`}
                  style={{ width: `${Math.min(100, credits.sms_limit > 0 ? (credits.sms_used / credits.sms_limit) * 100 : 0)}%` }}
                />
              </div>
            </div>
            <p className="text-xs text-slate-400">Resets on: {credits.resets_at ? new Date(credits.resets_at).toLocaleDateString() : 'N/A'}</p>
          </div>
        ) : (
          <p className="text-sm text-slate-400">Purchase a phone number to start tracking usage.</p>
        )}
      </div>

      {/* Credits Balance */}
      <div className="bg-white border border-slate-200 rounded-lg p-5">
        <h2 className="text-lg font-semibold text-slate-900 mb-2">Credits Balance</h2>
        <p className="text-3xl font-bold text-primary-700">${credits?.credits_dollars?.toFixed(2) ?? '0.00'}</p>
        <p className="text-sm text-slate-500 mt-1">Credits never expire and roll over every month</p>
      </div>

      {/* Purchase Credits */}
      <div>
        <h2 className="text-lg font-semibold text-slate-900 mb-4">Purchase Credits</h2>
        <div className="grid gap-4 md:grid-cols-3">
          {CREDIT_BUNDLES.map((b) => (
            <div key={b.key} className={`relative border rounded-lg p-5 ${b.popular ? 'border-primary-500 ring-1 ring-primary-500' : 'border-slate-200'}`}>
              {b.popular && (
                <span className="absolute -top-2.5 left-1/2 -translate-x-1/2 text-xs font-medium bg-primary-600 text-white px-3 py-0.5 rounded-full">
                  Most Popular
                </span>
              )}
              <h3 className="text-sm font-semibold text-slate-900 uppercase tracking-wide">{b.label}</h3>
              <p className="text-2xl font-bold text-slate-900 mt-2">{b.price}</p>
              <p className="text-sm text-slate-600 mt-1">Get {b.credits} in credits</p>
              <span className="inline-block text-xs font-semibold bg-green-100 text-green-700 px-2 py-0.5 rounded-full mt-2">
                {b.bonus} bonus
              </span>
              <button
                onClick={() => handlePurchase(b.key)}
                className="w-full mt-4 px-4 py-2 bg-primary-600 text-white text-sm rounded-lg hover:bg-primary-700"
              >
                Purchase
              </button>
            </div>
          ))}
        </div>
        <p className="text-xs text-slate-500 text-center mt-3">
          Credits never expire. Your balance rolls over every month, forever.
        </p>
      </div>

      {/* Pricing Reference */}
      <div className="bg-white border border-slate-200 rounded-lg">
        <button
          onClick={() => setShowPricing(!showPricing)}
          className="w-full flex items-center justify-between p-4 text-left"
        >
          <span className="text-sm font-semibold text-slate-900">Current Rates</span>
          <ChevronDown className={`w-4 h-4 text-slate-400 transition-transform ${showPricing ? 'rotate-180' : ''}`} />
        </button>
        {showPricing && (
          <div className="px-4 pb-4">
            <table className="w-full text-sm">
              <tbody>
                {PRICING_TABLE.map((p) => (
                  <tr key={p.item} className="border-t border-slate-100">
                    <td className="py-2 text-slate-600">{p.item}</td>
                    <td className="py-2 text-right font-medium text-slate-900">{p.rate}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
