import { memo } from 'react'
import { Handle, Position, type NodeProps } from '@xyflow/react'
import { MessagesSquare } from 'lucide-react'
import { cn } from '@/utils/helpers'

function ConversationNode({ data, selected }: NodeProps) {
  return (
    <div
      className={cn(
        'bg-white rounded-xl border-2 shadow-sm min-w-[180px] max-w-[240px] transition-shadow',
        selected ? 'border-indigo-500 shadow-indigo-100 shadow-md' : 'border-indigo-200'
      )}
    >
      <Handle type="target" position={Position.Top} className="!bg-indigo-400 !w-3 !h-3 !border-2 !border-white" />
      <div className="bg-indigo-50 px-3 py-1.5 rounded-t-[10px] flex items-center gap-2 border-b border-indigo-100">
        <MessagesSquare className="w-3.5 h-3.5 text-indigo-600" />
        <span className="text-xs font-semibold text-indigo-700 uppercase tracking-wide">Conversation</span>
      </div>
      <div className="px-3 py-2">
        <p className="text-sm text-slate-700 line-clamp-3">{(data as any).label || 'Start conversation'}</p>
      </div>
      <Handle type="source" position={Position.Bottom} className="!bg-indigo-400 !w-3 !h-3 !border-2 !border-white" />
    </div>
  )
}

export default memo(ConversationNode)
