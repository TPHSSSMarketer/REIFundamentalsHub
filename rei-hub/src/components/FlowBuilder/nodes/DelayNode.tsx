import { memo } from 'react'
import { Handle, Position, type NodeProps } from '@xyflow/react'
import { Clock } from 'lucide-react'
import { cn } from '@/utils/helpers'

function DelayNode({ data, selected }: NodeProps) {
  return (
    <div
      className={cn(
        'bg-white rounded-xl border-2 shadow-sm min-w-[180px] max-w-[240px] transition-shadow',
        selected ? 'border-slate-500 shadow-slate-100 shadow-md' : 'border-slate-300'
      )}
    >
      <Handle type="target" position={Position.Top} className="!bg-slate-400 !w-3 !h-3 !border-2 !border-white" />
      <div className="bg-slate-50 px-3 py-1.5 rounded-t-[10px] flex items-center gap-2 border-b border-slate-200">
        <Clock className="w-3.5 h-3.5 text-slate-600" />
        <span className="text-xs font-semibold text-slate-700 uppercase tracking-wide">Delay</span>
      </div>
      <div className="px-3 py-2">
        <p className="text-sm text-slate-700 line-clamp-3">{(data as any).label || 'Wait and continue'}</p>
      </div>
      <Handle type="source" position={Position.Bottom} className="!bg-slate-400 !w-3 !h-3 !border-2 !border-white" />
    </div>
  )
}

export default memo(DelayNode)
