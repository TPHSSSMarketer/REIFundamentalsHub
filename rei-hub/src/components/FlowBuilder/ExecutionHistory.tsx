import { useState } from 'react'
import { History, ChevronDown, ChevronRight, MessageCircle } from 'lucide-react'
import { cn } from '@/utils/helpers'
import { useExecutions } from '@/hooks/useFlowBuilder'

export default function ExecutionHistory() {
  const { data: executions, isLoading } = useExecutions()
  const [expandedId, setExpandedId] = useState<number | null>(null)

  if (isLoading) {
    return (
      <div className="space-y-3">
        {[1, 2, 3].map((i) => (
          <div key={i} className="bg-white rounded-xl border border-slate-200 p-4 animate-pulse">
            <div className="h-4 bg-slate-200 rounded w-1/3 mb-2" />
            <div className="h-3 bg-slate-100 rounded w-1/2" />
          </div>
        ))}
      </div>
    )
  }

  if (!executions?.length) {
    return (
      <div className="text-center py-16 bg-white rounded-xl border border-slate-200">
        <History className="w-12 h-12 text-slate-300 mx-auto mb-3" />
        <h3 className="text-lg font-semibold text-slate-700 mb-1">No executions yet</h3>
        <p className="text-slate-500 text-sm">
          Conversation history will appear here once your flows start receiving chats.
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-2">
      <p className="text-sm text-slate-500 mb-3">
        {executions.length} conversation{executions.length !== 1 ? 's' : ''}
      </p>
      {executions.map((exec: any) => (
        <div
          key={exec.id}
          className="bg-white rounded-xl border border-slate-200 overflow-hidden"
        >
          <button
            onClick={() => setExpandedId(expandedId === exec.id ? null : exec.id)}
            className="w-full flex items-center justify-between p-4 text-left hover:bg-slate-50 transition-colors"
          >
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-primary-100 flex items-center justify-center">
                <MessageCircle className="w-4 h-4 text-primary-600" />
              </div>
              <div>
                <p className="text-sm font-medium text-slate-900">
                  {exec.flow_name || `Flow #${exec.flow_id}`}
                </p>
                <p className="text-xs text-slate-400">
                  {new Date(exec.started_at || exec.created_at).toLocaleString()} · Status:{' '}
                  <span
                    className={cn(
                      'font-medium',
                      exec.status === 'completed' ? 'text-green-600' : exec.status === 'active' ? 'text-blue-600' : 'text-slate-500'
                    )}
                  >
                    {exec.status}
                  </span>
                </p>
              </div>
            </div>
            {expandedId === exec.id ? (
              <ChevronDown className="w-4 h-4 text-slate-400" />
            ) : (
              <ChevronRight className="w-4 h-4 text-slate-400" />
            )}
          </button>

          {expandedId === exec.id && (
            <div className="border-t border-slate-100 p-4 bg-slate-50">
              {exec.transcript && exec.transcript.length > 0 ? (
                <div className="space-y-2 max-h-80 overflow-y-auto">
                  {exec.transcript.map((msg: any, i: number) => (
                    <div
                      key={i}
                      className={cn(
                        'px-3 py-2 rounded-lg text-sm max-w-[85%]',
                        msg.role === 'assistant' || msg.role === 'bot'
                          ? 'bg-white border border-slate-200 text-slate-700'
                          : 'bg-primary-600 text-white ml-auto'
                      )}
                    >
                      {msg.content}
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-slate-400 text-center py-4">No transcript available</p>
              )}
              {exec.current_node_label && (
                <p className="text-xs text-slate-400 mt-3">
                  Last node: {exec.current_node_label}
                </p>
              )}
            </div>
          )}
        </div>
      ))}
    </div>
  )
}
