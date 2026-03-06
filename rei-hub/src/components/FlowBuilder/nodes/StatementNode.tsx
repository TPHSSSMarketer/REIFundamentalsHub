import { memo } from 'react'
import { Handle, Position, type NodeProps } from '@xyflow/react'
import { MessageSquare } from 'lucide-react'
import { cn } from '@/utils/helpers'

function StatementNode({ data, selected }: NodeProps) {
  return (
    <div
      className={cn(
        'bg-white rounded-xl border-2 shadow-sm min-w-[180px] max-w-[240px] transition-shadow',
        selected ? 'border-green-500 shadow-green-100 shadow-md' : 'border-green-200'
      )}
    >
      <Handle type="target" position={Position.Top} className="!bg-green-400 !w-3 !h-3 !border-2 !border-white" />
      <div className="bg-green-50 px-3 py-1.5 rounded-t-[10px] flex items-center gap-2 border-b border-green-100">
        <MessageSquare className="w-3.5 h-3.5 text-green-600" />
        <span className="text-xs font-semibold text-green-700 uppercase tracking-wide">Statement</span>
      </div>
      <div className="px-3 py-2">
        <p className="text-sm text-slate-700 line-clamp-3">{(data as any).label || 'Make statement'}</p>
      </div>
      <Handle type="source" position={Position.Bottom} className="!bg-green-400 !w-3 !h-3 !border-2 !border-white" />
    </div>
  )
}

export default memo(StatementNode)
