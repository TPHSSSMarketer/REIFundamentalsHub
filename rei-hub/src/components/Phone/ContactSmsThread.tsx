import { useState, useEffect, useRef, useCallback } from 'react'
import { Send, RefreshCw, ChevronDown } from 'lucide-react'
import * as phoneApi from '@/services/phoneApi'

interface ContactSmsThreadProps {
  contactId: string
  contactPhone: string
  contactName: string
}

const POLL_INTERVAL_MS = 10_000 // check for new messages every 10 seconds

export default function ContactSmsThread({ contactId, contactPhone, contactName }: ContactSmsThreadProps) {
  const [messages, setMessages] = useState<any[]>([])
  const [compose, setCompose] = useState('')
  const [loading, setLoading] = useState(true)
  const [sending, setSending] = useState(false)
  const [numbers, setNumbers] = useState<any[]>([])
  const [selectedNumber, setSelectedNumber] = useState('')
  const [showNumberPicker, setShowNumberPicker] = useState(false)
  const [autoRefresh, setAutoRefresh] = useState(true)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const pickerRef = useRef<HTMLDivElement>(null)

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (pickerRef.current && !pickerRef.current.contains(e.target as Node)) {
        setShowNumberPicker(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const loadMessages = useCallback(async (showSpinner = false) => {
    if (showSpinner) setLoading(true)
    try {
      const threadData = await phoneApi.getSmsThread(contactId)
      setMessages(threadData.messages.slice(-50))
    } catch {
      // silently fail on poll
    } finally {
      if (showSpinner) setLoading(false)
    }
  }, [contactId])

  // Initial data load
  useEffect(() => {
    async function init() {
      setLoading(true)
      try {
        const [threadData, numData] = await Promise.all([
          phoneApi.getSmsThread(contactId),
          phoneApi.getNumbers(),
        ])
        setMessages(threadData.messages.slice(-50))
        setNumbers(numData.numbers)
        if (numData.numbers.length > 0 && !selectedNumber) {
          setSelectedNumber(numData.numbers[0].id as string)
        }
      } catch {
        // Error loading SMS thread
      } finally {
        setLoading(false)
      }
    }
    init()
  }, [contactId])

  // Auto-refresh polling
  useEffect(() => {
    if (!autoRefresh) return
    const interval = setInterval(() => {
      loadMessages(false) // silent refresh, no spinner
    }, POLL_INTERVAL_MS)
    return () => clearInterval(interval)
  }, [autoRefresh, loadMessages])

  // Scroll to bottom when new messages arrive
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages.length])

  async function handleSend() {
    if (!compose.trim() || !selectedNumber || sending) return
    setSending(true)
    try {
      await phoneApi.sendSms({
        to_number: contactPhone,
        body: compose,
        phone_number_id: selectedNumber,
        contact_id: contactId,
      })
      setCompose('')
      await loadMessages(false) // refresh immediately after sending
    } catch (e: any) {
      alert(e.message)
    } finally {
      setSending(false)
    }
  }

  const selectedNum = numbers.find((n) => n.id === selectedNumber)
  const formatNum = (num: any) => {
    const phone = num.phone_number || num.friendlyName || num.phoneNumber || num.id
    const label = num.friendly_name || num.label || ''
    return label ? `${label} (${phone})` : phone
  }

  if (loading) {
    return (
      <div className="space-y-3 p-3">
        {[1, 2, 3].map((i) => (
          <div key={i} className={`flex ${i % 2 === 0 ? 'justify-end' : 'justify-start'}`}>
            <div className="h-8 w-40 bg-slate-100 rounded-lg animate-pulse" />
          </div>
        ))}
      </div>
    )
  }

  return (
    <div className="flex flex-col" style={{ maxHeight: '450px' }}>
      {/* Header bar — number picker + auto-refresh toggle */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-slate-200 bg-slate-50 rounded-t-lg">
        {/* Number picker */}
        <div className="relative" ref={pickerRef}>
          <button
            onClick={() => setShowNumberPicker(!showNumberPicker)}
            className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium bg-white border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors"
          >
            <span className="text-slate-500">From:</span>
            <span className="text-slate-800 max-w-[160px] truncate">
              {selectedNum ? formatNum(selectedNum) : 'Select number'}
            </span>
            <ChevronDown className="w-3 h-3 text-slate-400" />
          </button>
          {showNumberPicker && numbers.length > 0 && (
            <div className="absolute top-full left-0 mt-1 bg-white border border-slate-200 rounded-lg shadow-lg z-20 py-1 min-w-[220px] max-h-48 overflow-y-auto">
              {numbers.map((num) => (
                <button
                  key={num.id}
                  onClick={() => {
                    setSelectedNumber(num.id as string)
                    setShowNumberPicker(false)
                  }}
                  className={`block w-full text-left px-3 py-2 text-xs hover:bg-slate-50 transition-colors ${
                    selectedNumber === num.id ? 'bg-primary-50 text-primary-700 font-semibold' : 'text-slate-700'
                  }`}
                >
                  {formatNum(num)}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Auto-refresh toggle */}
        <div className="flex items-center gap-2">
          <button
            onClick={() => loadMessages(false)}
            className="p-1.5 text-slate-400 hover:text-primary-600 hover:bg-primary-50 rounded transition-colors"
            title="Refresh now"
          >
            <RefreshCw className="w-3.5 h-3.5" />
          </button>
          <label className="flex items-center gap-1.5 cursor-pointer">
            <div
              onClick={() => setAutoRefresh(!autoRefresh)}
              className={`relative w-7 h-4 rounded-full transition-colors ${
                autoRefresh ? 'bg-green-500' : 'bg-slate-300'
              }`}
            >
              <div
                className={`absolute top-0.5 w-3 h-3 rounded-full bg-white shadow transition-transform ${
                  autoRefresh ? 'translate-x-3.5' : 'translate-x-0.5'
                }`}
              />
            </div>
            <span className="text-[10px] text-slate-500">Live</span>
          </label>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-3 space-y-2">
        {messages.length === 0 ? (
          <p className="text-xs text-slate-400 text-center py-4">No messages with {contactName}</p>
        ) : (
          messages.map((m: any) => (
            <div key={m.id} className={`flex ${m.direction === 'outbound' ? 'justify-end' : 'justify-start'}`}>
              <div
                className={`max-w-[75%] rounded-lg px-3 py-1.5 text-sm ${
                  m.direction === 'outbound' ? 'bg-primary-600 text-white' : 'bg-slate-100 text-slate-900'
                }`}
              >
                <p className="text-xs">{m.body}</p>
                <p className={`text-[10px] mt-0.5 ${m.direction === 'outbound' ? 'text-primary-200' : 'text-slate-400'}`}>
                  {m.sent_at ? new Date(m.sent_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''}
                </p>
              </div>
            </div>
          ))
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Compose */}
      <div className="border-t border-slate-200 p-2">
        <div className="flex gap-2">
          <textarea
            value={compose}
            onChange={(e) => setCompose(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                handleSend()
              }
            }}
            placeholder={`Message ${contactName}...`}
            rows={1}
            className="flex-1 border rounded px-2 py-1.5 text-xs resize-none focus:outline-none focus:ring-2 focus:ring-primary-500"
          />
          <button
            onClick={handleSend}
            disabled={!compose.trim() || sending || !selectedNumber}
            className="px-2 py-1.5 bg-primary-600 text-white rounded hover:bg-primary-700 disabled:opacity-50 transition-colors"
          >
            <Send className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Link to full conversation */}
      <div className="px-3 pb-2">
        <a href="/phone?tab=sms" className="text-xs text-primary-600 hover:text-primary-700 hover:underline">
          View Full Conversation &rarr;
        </a>
      </div>
    </div>
  )
}
