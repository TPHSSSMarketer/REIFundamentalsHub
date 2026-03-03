'use client'

import { useEffect, useRef, useState } from 'react'
import { Bot, Send, X, Maximize2 } from 'lucide-react'
import { cn } from '@/utils/helpers'
import { toast } from 'sonner'
import { createSession, listSessions, getSessionMessages, sendMessage } from '@/services/adminAssistantApi'
import type { AdminSession, AdminMessage } from '@/types'

export default function FloatingAssistantBubble() {
  const [expanded, setExpanded] = useState(false)
  const [messages, setMessages] = useState<AdminMessage[]>([])
  const [currentSession, setCurrentSession] = useState<AdminSession | null>(null)
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [pendingCount, setPendingCount] = useState(0)
  const [initializing, setInitializing] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)

  // Don't render on the assistant page itself
  useEffect(() => {
    if (window.location.pathname === '/assistant') {
      return
    }
  }, [])

  // Auto-scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  // Initialize session when expanding
  useEffect(() => {
    if (!expanded || currentSession) return

    const initSession = async () => {
      try {
        setInitializing(true)
        const sessions = await listSessions()

        if (sessions.length > 0) {
          const activeSessions = sessions.filter((s) => s.is_active)
          const session = activeSessions[0] || sessions[0]
          setCurrentSession(session)

          const sessionMessages = await getSessionMessages(session.id)
          // Show only last 10 messages
          setMessages(sessionMessages.slice(-10))
        } else {
          const newSession = await createSession('Quick Chat')
          setCurrentSession(newSession)
          setMessages([])
        }
      } catch (error) {
        toast.error('Failed to load chat session')
        console.error(error)
      } finally {
        setInitializing(false)
      }
    }

    initSession()
  }, [expanded, currentSession])

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!input.trim() || !currentSession || loading) return

    try {
      setLoading(true)
      const userContent = input
      setInput('')

      // Add user message optimistically
      const userMessage: AdminMessage = {
        id: `tmp-${Date.now()}`,
        session_id: currentSession.id,
        role: 'user',
        content: userContent,
        created_at: new Date().toISOString(),
      }
      setMessages((prev) => [...prev, userMessage])

      // Send message and get response
      const response = await sendMessage(currentSession.id, userContent)

      // Add assistant response
      const assistantMessage: AdminMessage = {
        id: `tmp-${Date.now() + 1}`,
        session_id: currentSession.id,
        role: 'assistant',
        content: response.response,
        created_at: new Date().toISOString(),
      }
      setMessages((prev) => [...prev, assistantMessage])

      // Update pending actions count
      if (response.pending_actions) {
        setPendingCount(response.pending_actions.length)
      }
    } catch (error) {
      toast.error('Failed to send message')
      console.error(error)
    } finally {
      setLoading(false)
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSendMessage(e as any)
    }
  }

  // Hide on assistant page
  if (window.location.pathname === '/assistant') {
    return null
  }

  if (!expanded) {
    return (
      <button
        onClick={() => setExpanded(true)}
        className={cn(
          'fixed bottom-24 right-6 z-50',
          'w-14 h-14 rounded-full',
          'bg-primary-600 hover:bg-primary-700 text-white',
          'shadow-lg transition-all duration-200',
          'flex items-center justify-center',
          'relative'
        )}
        aria-label="Open AI Assistant"
      >
        <Bot className="w-6 h-6" />
        {pendingCount > 0 && (
          <div className="absolute -top-1 -right-1 bg-red-500 text-white text-xs font-bold rounded-full w-5 h-5 flex items-center justify-center">
            {pendingCount}
          </div>
        )}
      </button>
    )
  }

  return (
    <div
      className={cn(
        'fixed bottom-24 right-6 z-50',
        'w-96 max-h-[32rem]',
        'rounded-2xl shadow-2xl',
        'bg-white border border-slate-200',
        'flex flex-col overflow-hidden'
      )}
    >
      {/* Header */}
      <div className="bg-primary-600 text-white px-4 py-3 rounded-t-2xl flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Bot className="w-5 h-5" />
          <h2 className="font-semibold">AI Assistant</h2>
        </div>
        <div className="flex items-center gap-2">
          <a
            href="/assistant"
            className="p-1.5 hover:bg-primary-700 rounded transition-colors"
            title="Open full view"
            onClick={(e) => {
              e.preventDefault()
              window.location.href = '/assistant'
            }}
          >
            <Maximize2 className="w-4 h-4" />
          </a>
          <button
            onClick={() => setExpanded(false)}
            className="p-1.5 hover:bg-primary-700 rounded transition-colors"
            aria-label="Minimize"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto max-h-80 p-4 space-y-3">
        {initializing ? (
          <div className="flex items-center justify-center h-full text-slate-500">
            <p className="text-sm">Loading chat...</p>
          </div>
        ) : messages.length === 0 ? (
          <div className="flex items-center justify-center h-full">
            <p className="text-sm text-slate-600 text-center">
              Hi! I'm your AI assistant. How can I help you manage your real estate business today?
            </p>
          </div>
        ) : (
          messages.map((msg) => (
            <div
              key={msg.id}
              className={cn(
                'rounded-lg p-2.5 text-sm',
                msg.role === 'user'
                  ? 'bg-primary-50 text-slate-900 ml-12'
                  : 'bg-slate-50 text-slate-900 mr-12'
              )}
            >
              <p className="break-words">{msg.content}</p>
            </div>
          ))
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input Area */}
      <form
        onSubmit={handleSendMessage}
        className="border-t border-slate-200 p-3 flex gap-2 bg-white rounded-b-2xl"
      >
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          disabled={loading}
          placeholder="Type a message..."
          className={cn(
            'flex-1 text-sm border border-slate-200 rounded-lg px-3 py-2',
            'focus:outline-none focus:ring-2 focus:ring-primary-600 focus:border-transparent',
            'placeholder-slate-400',
            loading && 'opacity-50 cursor-not-allowed'
          )}
        />
        <button
          type="submit"
          disabled={loading || !input.trim()}
          className={cn(
            'bg-primary-600 hover:bg-primary-700 text-white rounded-lg p-2',
            'transition-colors duration-200',
            'disabled:opacity-50 disabled:cursor-not-allowed',
            'flex items-center justify-center'
          )}
          aria-label="Send message"
        >
          <Send className="w-4 h-4" />
        </button>
      </form>
    </div>
  )
}
