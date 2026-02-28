import { memo } from 'react'
import { Handle, Position, type NodeProps } from '@xyflow/react'
import { Webhook } from 'lucide-react'
import { cn } from '@/utils/helpers'

function WebhookNode({ data, selected }: NodeProps) {
  return (
    <div
      className={cn(
        'bg-white rounded-xl border-2 shadow-sm min-w-[180px] max-w-[240px] transition-shadow',
        selected ? 'border-red-500 shadow-red-100 shadow-md' : 'border-red-200'
      )}
    >
      <Handle type="target" position={Position.Top} className="!bg-red-400 !w-3 !h-3 !border-2 !border-white" />
      <div className="bg-red-50 px-3 py-1.5 rounded-t-[10px] flex items-center gap-2 border-b border-red-100">
        <Webhook className="w-3.5 h-3.5 text-red-600" />
        <span className="text-xs font-semibold text-red-700 uppercase tracking-wide">Webhook</span>
      </div>
      <div className="px-3 py-2">
        <p className="text-sm text-slate-700 line-clamp-3">{(data as any).label || 'Trigger webhook'}</p>
      </div>
      <Handle type="source" position={Position.Bottom} className="!bg-red-400 !w-3 !h-3 !border-2 !border-white" />
    </div>
  )
}

export default memo(WebhookNode)
