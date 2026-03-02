import { memo } from 'react'
import { Handle, Position, type NodeProps } from '@xyflow/react'
import { Square } from 'lucide-react'
import { cn } from '@/utils/helpers'

function StopNode({ data, selected }: NodeProps) {
  return (
    <div
      className={cn(
        'bg-white rounded-xl border-2 shadow-sm min-w-[180px] max-w-[240px] transition-shadow',
        selected ? 'border-gray-500 shadow-gray-100 shadow-md' : 'border-gray-200'
      )}
    >
      <Handle type="target" position={Position.Top} className="!bg-gray-400 !w-3 !h-3 !border-2 !border-white" />
      <div className="bg-gray-50 px-3 py-1.5 rounded-t-[10px] flex items-center gap-2 border-b border-gray-100">
        <Square className="w-3.5 h-3.5 text-gray-600" />
        <span className="text-xs font-semibold text-gray-700 uppercase tracking-wide">Stop</span>
      </div>
      <div className="px-3 py-2">
        <p className="text-sm text-slate-700 line-clamp-3">{(data as any).label || 'End conversation'}</p>
      </div>
    </div>
  )
}

export default memo(StopNode)
