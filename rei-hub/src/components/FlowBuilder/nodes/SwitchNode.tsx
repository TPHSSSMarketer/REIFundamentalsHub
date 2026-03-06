import { memo } from 'react'
import { Handle, Position, type NodeProps } from '@xyflow/react'
import { GitBranch } from 'lucide-react'
import { cn } from '@/utils/helpers'

function SwitchNode({ data, selected }: NodeProps) {
  const conditionsCount = Math.max(((data as any).conditions || []).length, 2)

  return (
    <div
      className={cn(
        'bg-white rounded-xl border-2 shadow-sm min-w-[180px] max-w-[240px] transition-shadow',
        selected ? 'border-orange-500 shadow-orange-100 shadow-md' : 'border-orange-200'
      )}
    >
      <Handle type="target" position={Position.Top} className="!bg-orange-400 !w-3 !h-3 !border-2 !border-white" />
      <div className="bg-orange-50 px-3 py-1.5 rounded-t-[10px] flex items-center gap-2 border-b border-orange-100">
        <GitBranch className="w-3.5 h-3.5 text-orange-600" />
        <span className="text-xs font-semibold text-orange-700 uppercase tracking-wide">Switch</span>
      </div>
      <div className="px-3 py-2">
        <p className="text-sm text-slate-700">{(data as any).label || 'Route by condition'}</p>
        <p className="text-xs text-slate-400 mt-0.5">{conditionsCount} conditions</p>
      </div>
      <div className="relative h-6 flex items-end justify-between px-3 pb-1.5">
        {Array.from({ length: conditionsCount }).map((_, i) => (
          <Handle
            key={`out-${i}`}
            type="source"
            position={Position.Bottom}
            id={`out-${i}`}
            className="!bg-orange-400 !w-3 !h-3 !border-2 !border-white"
            style={{ left: `${((i + 1) * 100) / (conditionsCount + 1)}%` }}
          />
        ))}
      </div>
    </div>
  )
}

export default memo(SwitchNode)
