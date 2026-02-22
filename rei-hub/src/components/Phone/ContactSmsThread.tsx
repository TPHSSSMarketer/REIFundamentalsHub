import { useState, useEffect } from 'react'
import { Send } from 'lucide-react'
import * as phoneApi from '@/services/phoneApi'

interface ContactSmsThreadProps {
  contactId: string
  contactPhone: string
  contactName: string
}

export default function ContactSmsThread({ contactId, contactPhone, contactName }: ContactSmsThreadProps) {
  const [messages, setMessages] = useState<any[]>([])
  const [compose, setCompose] = useState('')
  const [loading, setLoading] = useState(true)
  const [sending, setSending] = useState(false)
  const [numbers, setNumbers] = useState<any[]>([])
  const [selectedNumber, setSelectedNumber] = useState('')

  useEffect(() => {
    loadData()
  }, [contactId])

  async function loadData() {
    setLoading(true)
    try {
      const [threadData, numData] = await Promise.all([
        phoneApi.getSmsThread(contactId),
        phoneApi.getNumbers(),
      ])
      setMessages(threadData.messages.slice(-20))
      setNumbers(numData.numbers)
      if (numData.numbers.length > 0 && !selectedNumber) {
        setSelectedNumber(numData.numbers[0].id as string)
      }
    } catch (e) {
      console.error(e)
    } finally {
      setLoading(false)
    }
  }

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
      loadData()
    } catch (e: any) {
      alert(e.message)
    } finally {
      setSending(false)
    }
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
    <div className="flex flex-col" style={{ maxHeight: '400px' }}>
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
            className="flex-1 border rounded px-2 py-1.5 text-xs resize-none"
          />
          <button
            onClick={handleSend}
            disabled={!compose.trim() || sending}
            className="px-2 py-1.5 bg-primary-600 text-white rounded hover:bg-primary-700 disabled:opacity-50"
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
