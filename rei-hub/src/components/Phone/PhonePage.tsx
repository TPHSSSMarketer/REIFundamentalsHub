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
  Clock,
  PhoneIncoming,
  PhoneOutgoing,
  Megaphone,
  Users,
} from 'lucide-react'
import * as phoneApi from '@/services/phoneApi'
import { toast } from 'sonner'

type TabKey = 'numbers' | 'dialer' | 'sms' | 'fax' | 'credits'

const TABS: { key: TabKey; label: string; icon: typeof Phone }[] = [
  { key: 'dialer', label: 'Dialer', icon: PhoneCall },
  { key: 'sms', label: 'SMS', icon: MessageSquare },
  { key: 'fax', label: 'Fax', icon: FileText },
  { key: 'credits', label: 'Credits & Usage', icon: CreditCard },
  { key: 'numbers', label: 'Numbers', icon: Phone },
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
  { key: 'starter', label: 'Starter Pack', price: '$25.00', credits: '$25.00', bonus: '' },
  { key: 'growth', label: 'Growth Pack', price: '$50.00', credits: '$55.00', bonus: '10%', popular: true },
  { key: 'power', label: 'Power Pack', price: '$100.00', credits: '$115.00', bonus: '15%' },
]

const PRICING_TABLE = [
  { item: 'Outbound calls', rate: '$0.03/min' },
  { item: 'Inbound calls', rate: '$0.025/min' },
  { item: 'Outbound SMS', rate: '$0.02/msg' },
  { item: 'Inbound SMS', rate: 'Free' },
  { item: 'Fax sent', rate: '$0.04/page' },
  { item: 'Fax received', rate: '$0.04/page' },
  { item: 'Additional numbers', rate: '$2.00/mo' },
  { item: 'AI voice calls', rate: '$0.20/min' },
  { item: 'AI voicemail drop', rate: '$0.25/drop' },
]

export default function PhonePage() {
  const [activeTab, setActiveTab] = useState<TabKey>('dialer')

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
          Manage numbers, calls, SMS, fax, and credits
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
              <span className="sm:hidden">{tab.key === 'numbers' ? 'Nums' : tab.key === 'dialer' ? 'Dial' : tab.key === 'credits' ? 'Credits' : tab.label}</span>
            </button>
          ))}
        </nav>
      </div>

      {/* Tab Content */}
      <div>
        {activeTab === 'numbers' && <NumbersTab />}
        {activeTab === 'dialer' && <DialerTab />}
        {activeTab === 'sms' && <SmsTab />}
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
  const [muted, setMuted] = useState(false)
  const [disposition, setDisposition] = useState('')
  const [notes, setNotes] = useState('')
  const [callLogId, setCallLogId] = useState('')
  const [callHistory, setCallHistory] = useState<any[]>([])
  const [historyLoading, setHistoryLoading] = useState(true)
  const [savingDisposition, setSavingDisposition] = useState(false)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => {
    phoneApi.getNumbers().then((d) => {
      setNumbers(d.numbers)
      if (d.numbers.length > 0) setSelectedNumber(d.numbers[0].id as string)
    })
    loadCallHistory()
    return () => { if (timerRef.current) clearInterval(timerRef.current) }
  }, [])

  async function loadCallHistory() {
    try {
      const data = await phoneApi.getCalls()
      setCallHistory(data.calls || [])
    } catch {
      // continue without history
    } finally {
      setHistoryLoading(false)
    }
  }

  async function handleDial() {
    if (!toNumber || !selectedNumber) return
    try {
      const result = await phoneApi.dial({ to_number: toNumber, phone_number_id: selectedNumber })
      setCallActive(true)
      setCallLogId(result.call_log_id)
      setCallTimer(0)
      setMuted(false)
      timerRef.current = setInterval(() => setCallTimer((t) => t + 1), 1000)
    } catch (e: any) {
      toast.error(e.message || 'Failed to place call')
    }
  }

  function handleHangUp() {
    setCallActive(false)
    setMuted(false)
    if (timerRef.current) clearInterval(timerRef.current)
  }

  async function handleSaveDisposition() {
    if (!callLogId) return
    setSavingDisposition(true)
    try {
      await phoneApi.updateCall(callLogId, {
        disposition: disposition || undefined,
        notes: notes || undefined,
      })
      toast.success('Call disposition saved')
      setCallLogId('')
      setDisposition('')
      setNotes('')
      setToNumber('')
      loadCallHistory()
    } catch {
      toast.error('Failed to save disposition')
    } finally {
      setSavingDisposition(false)
    }
  }

  function formatTimer(secs: number) {
    const m = Math.floor(secs / 60).toString().padStart(2, '0')
    const s = (secs % 60).toString().padStart(2, '0')
    return `${m}:${s}`
  }

  function formatPhone(num: string) {
    if (!num) return ''
    const digits = num.replace(/\D/g, '')
    if (digits.length === 11 && digits[0] === '1') {
      return `(${digits.slice(1, 4)}) ${digits.slice(4, 7)}-${digits.slice(7)}`
    }
    return num
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
                <button
                  onClick={() => setMuted(!muted)}
                  className={`p-3 rounded-full ${muted ? 'bg-red-100 ring-2 ring-red-400' : 'bg-slate-100 hover:bg-slate-200'}`}
                  title={muted ? 'Unmute' : 'Mute'}
                >
                  <Mic className={`w-5 h-5 ${muted ? 'text-red-600' : 'text-slate-600'}`} />
                </button>
                <button onClick={handleHangUp} className="p-3 bg-red-600 rounded-full hover:bg-red-700">
                  <PhoneOff className="w-5 h-5 text-white" />
                </button>
              </div>
              {muted && <p className="text-xs text-red-500 text-center mt-2">Microphone muted</p>}
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
                onClick={handleSaveDisposition}
                disabled={savingDisposition}
                className="px-4 py-2 bg-primary-600 text-white text-sm rounded-lg hover:bg-primary-700 disabled:opacity-50"
              >
                {savingDisposition ? 'Saving...' : 'Save & Done'}
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

      {/* Call History */}
      <div>
        <h2 className="text-lg font-semibold text-slate-900 mb-4">Call History</h2>
        {historyLoading ? (
          <div className="animate-pulse h-32 bg-slate-100 rounded-lg" />
        ) : callHistory.length === 0 ? (
          <div className="bg-slate-50 rounded-lg p-8 text-center">
            <Clock className="w-10 h-10 text-slate-300 mx-auto mb-3" />
            <p className="text-sm text-slate-400">No call history yet. Make your first call above.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200">
                  <th className="text-left py-2.5 px-3 text-slate-500 font-medium">Direction</th>
                  <th className="text-left py-2.5 px-3 text-slate-500 font-medium">Number</th>
                  <th className="text-left py-2.5 px-3 text-slate-500 font-medium">Duration</th>
                  <th className="text-left py-2.5 px-3 text-slate-500 font-medium">Disposition</th>
                  <th className="text-left py-2.5 px-3 text-slate-500 font-medium">Date</th>
                </tr>
              </thead>
              <tbody>
                {callHistory.map((c: any) => (
                  <tr key={c.id} className="border-b border-slate-100 hover:bg-slate-50">
                    <td className="py-2.5 px-3">
                      {c.direction === 'outbound' ? (
                        <span className="flex items-center gap-1 text-xs text-blue-700"><PhoneOutgoing className="w-3.5 h-3.5" /> Out</span>
                      ) : (
                        <span className="flex items-center gap-1 text-xs text-green-700"><PhoneIncoming className="w-3.5 h-3.5" /> In</span>
                      )}
                    </td>
                    <td className="py-2.5 px-3 text-slate-700">{formatPhone(c.to_number || c.from_number || '')}</td>
                    <td className="py-2.5 px-3 text-slate-700">{c.duration ? formatTimer(c.duration) : '—'}</td>
                    <td className="py-2.5 px-3">
                      {c.disposition ? (
                        <span className="text-xs bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full capitalize">{c.disposition.replace(/_/g, ' ')}</span>
                      ) : (
                        <span className="text-xs text-slate-400">—</span>
                      )}
                    </td>
                    <td className="py-2.5 px-3 text-slate-500">{c.started_at ? new Date(c.started_at).toLocaleString() : ''}</td>
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

  useEffect(() => {
    loadData()
  }, [])

  async function loadData() {
    try {
      const [convData, numData] = await Promise.all([
        phoneApi.getSmsConversations(),
        phoneApi.getNumbers(),
      ])
      setConversations(convData.conversations)
      setNumbers(numData.numbers)
      if (numData.numbers.length > 0) {
        setSelectedNumber(numData.numbers[0].id as string)
      }
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
      toast.success('Message sent')
      selectConversation(selectedContact)
    } catch (e: any) {
      toast.error(e.message || 'Failed to send message')
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

    </div>
  )
}

/* ═══════════════════════════════════════════════════════════════
   TAB 4 — Fax
   ═══════════════════════════════════════════════════════════════ */

function FaxTab() {
  const [faxes, setFaxes] = useState<any[]>([])
  const [numbers, setNumbers] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [toNumber, setToNumber] = useState('')
  const [fromNumberId, setFromNumberId] = useState('')
  // Document source mode: 'deal' | 'upload'
  const [docSource, setDocSource] = useState<'deal' | 'upload'>('deal')

  // Deal document picker
  const [deals, setDeals] = useState<any[]>([])
  const [selectedDealId, setSelectedDealId] = useState('')
  const [dealDocs, setDealDocs] = useState<any[]>([])
  const [selectedDocId, setSelectedDocId] = useState('')
  const [loadingDeals, setLoadingDeals] = useState(false)
  const [loadingDocs, setLoadingDocs] = useState(false)

  // File upload
  const [uploadFile, setUploadFile] = useState<File | null>(null)
  const [uploading, setUploading] = useState(false)

  const BASE_URL = import.meta.env.VITE_REI_SERVER_URL ?? 'http://localhost:8001'

  useEffect(() => {
    loadData()
    loadDeals()
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

  async function loadDeals() {
    setLoadingDeals(true)
    try {
      const { getDeals } = await import('@/services/crmApi')
      const allDeals = await getDeals('local-user')
      setDeals(Array.isArray(allDeals) ? allDeals.filter((d: any) => d.address) : [])
    } catch {
      toast.error('Failed to load deals')
    } finally {
      setLoadingDeals(false)
    }
  }

  async function loadDealDocs(dealId: string) {
    setLoadingDocs(true)
    try {
      const { getAuthHeader } = await import('@/services/auth')
      const res = await fetch(`${BASE_URL}/api/crm/deals/${dealId}/files?file_type=document`, {
        headers: getAuthHeader(),
        credentials: 'include',
      })
      if (res.ok) {
        const docs = await res.json()
        setDealDocs(docs)
      }
    } catch {
      setDealDocs([])
    } finally {
      setLoadingDocs(false)
    }
  }

  function handleDealChange(dealId: string) {
    setSelectedDealId(dealId)
    setSelectedDocId('')
    setDealDocs([])
    if (dealId) loadDealDocs(dealId)
  }

  async function handleSendFax() {
    if (!toNumber || !fromNumberId) return

    // Determine what we're sending
    let sendData: any = {
      to_number: toNumber,
      from_number_id: fromNumberId,
    }

    if (docSource === 'deal') {
      if (!selectedDealId || !selectedDocId) { toast.error('Select a deal and document'); return }
      sendData.deal_id = selectedDealId
      sendData.deal_file_id = selectedDocId
    } else if (docSource === 'upload') {
      if (!uploadFile) { toast.error('Select a file to upload'); return }
      // Upload file first, then send fax with returned URL
      setUploading(true)
      try {
        const { getAuthHeader } = await import('@/services/auth')
        const formData = new FormData()
        formData.append('file', uploadFile)
        const uploadRes = await fetch(`${BASE_URL}/api/phone/fax/upload`, {
          method: 'POST',
          headers: getAuthHeader(),
          body: formData,
          credentials: 'include',
        })
        if (!uploadRes.ok) throw new Error('Upload failed')
        const { media_url } = await uploadRes.json()
        sendData.media_url = media_url
      } catch {
        toast.error('Failed to upload document')
        setUploading(false)
        return
      } finally {
        setUploading(false)
      }
    }

    try {
      await phoneApi.sendFax(sendData)
      toast.success('Fax sent successfully')
      setToNumber('')
      setSelectedDealId('')
      setSelectedDocId('')
      setUploadFile(null)
      setDealDocs([])
      loadData()
    } catch (e: any) {
      toast.error(e.message || 'Failed to send fax')
    }
  }

  const canSend = toNumber && fromNumberId && (
    (docSource === 'deal' && selectedDealId && selectedDocId) ||
    (docSource === 'upload' && uploadFile)
  )

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

        {/* Document Source Selector */}
        <div className="mt-4">
          <label className="block text-sm font-medium text-slate-700 mb-2">Document Source</label>
          <div className="flex gap-2 mb-3">
            <button
              onClick={() => setDocSource('deal')}
              className={`px-3 py-1.5 text-xs font-medium rounded-full transition-colors ${docSource === 'deal' ? 'bg-primary-100 text-primary-700 ring-1 ring-primary-300' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
            >
              Deal Documents
            </button>
            <button
              onClick={() => setDocSource('upload')}
              className={`px-3 py-1.5 text-xs font-medium rounded-full transition-colors ${docSource === 'upload' ? 'bg-primary-100 text-primary-700 ring-1 ring-primary-300' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
            >
              Upload File
            </button>
          </div>

          {/* Deal document picker */}
          {docSource === 'deal' && (
            <div className="space-y-3">
              <select
                value={selectedDealId}
                onChange={(e) => handleDealChange(e.target.value)}
                className="w-full border rounded-lg px-3 py-2 text-sm"
                disabled={loadingDeals}
              >
                <option value="">{loadingDeals ? 'Loading deals...' : 'Select a deal...'}</option>
                {deals.map((d: any) => (
                  <option key={d.id} value={d.id}>
                    {d.contactName || d.address} — {d.address}
                  </option>
                ))}
              </select>
              {selectedDealId && (
                <select
                  value={selectedDocId}
                  onChange={(e) => setSelectedDocId(e.target.value)}
                  className="w-full border rounded-lg px-3 py-2 text-sm"
                  disabled={loadingDocs}
                >
                  <option value="">{loadingDocs ? 'Loading documents...' : 'Select a document...'}</option>
                  {dealDocs.map((doc: any) => (
                    <option key={doc.id} value={doc.id}>
                      {doc.fileName} ({doc.category})
                    </option>
                  ))}
                </select>
              )}
              {selectedDealId && !loadingDocs && dealDocs.length === 0 && (
                <p className="text-xs text-slate-400">No documents found for this deal</p>
              )}
            </div>
          )}

          {/* File upload */}
          {docSource === 'upload' && (
            <div>
              <input
                type="file"
                accept=".pdf,.doc,.docx"
                onChange={(e) => setUploadFile(e.target.files?.[0] || null)}
                className="w-full border rounded-lg px-3 py-2 text-sm file:mr-3 file:py-1 file:px-3 file:rounded-full file:border-0 file:text-xs file:font-medium file:bg-primary-50 file:text-primary-700 hover:file:bg-primary-100"
              />
              {uploadFile && (
                <p className="text-xs text-slate-500 mt-1">{uploadFile.name} ({(uploadFile.size / 1024).toFixed(0)} KB)</p>
              )}
            </div>
          )}

          <p className="text-xs text-slate-400 mt-1">Estimated cost: $0.04/page</p>
        </div>
        <button
          onClick={handleSendFax}
          disabled={!canSend || uploading}
          className="mt-4 flex items-center gap-2 px-4 py-2 bg-primary-600 text-white text-sm rounded-lg hover:bg-primary-700 disabled:opacity-50"
        >
          <Send className="w-4 h-4" /> {uploading ? 'Uploading...' : 'Send Fax'}
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

  const [purchasing, setPurchasing] = useState('')

  async function handlePurchase(bundle: string) {
    setPurchasing(bundle)
    try {
      const data = await phoneApi.purchaseCredits(bundle)
      if (data.checkout_url && data.checkout_url !== '#demo-checkout') {
        window.open(data.checkout_url, '_blank')
      } else {
        toast.success('Credit purchase — Stripe checkout coming soon!')
      }
    } catch (e: any) {
      toast.error(e.message || 'Failed to purchase credits')
    } finally {
      setPurchasing('')
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
              {b.bonus && (
                <span className="inline-block text-xs font-semibold bg-green-100 text-green-700 px-2 py-0.5 rounded-full mt-2">
                  {b.bonus} bonus
                </span>
              )}
              <button
                onClick={() => handlePurchase(b.key)}
                disabled={!!purchasing}
                className="w-full mt-4 px-4 py-2 bg-primary-600 text-white text-sm rounded-lg hover:bg-primary-700 disabled:opacity-50"
              >
                {purchasing === b.key ? 'Processing...' : 'Purchase'}
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

      {/* Spacer so the floating Phone Ready button doesn't overlap the rates table */}
      <div className="h-16" />
    </div>
  )
}
