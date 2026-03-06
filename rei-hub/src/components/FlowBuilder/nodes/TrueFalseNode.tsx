import { memo } from 'react'
import { Handle, Position, type NodeProps } from '@xyflow/react'
import { HelpCircle } from 'lucide-react'
import { cn } from '@/utils/helpers'

function TrueFalseNode({ data, selected }: NodeProps) {
  return (
    <div
      className={cn(
        'bg-white rounded-xl border-2 shadow-sm min-w-[180px] max-w-[240px] transition-shadow',
        selected ? 'border-yellow-500 shadow-yellow-100 shadow-md' : 'border-yellow-200'
      )}
    >
      <Handle type="target" position={Position.Top} className="!bg-yellow-400 !w-3 !h-3 !border-2 !border-white" />
      <div className="bg-yellow-50 px-3 py-1.5 rounded-t-[10px] flex items-center gap-2 border-b border-yellow-100">
        <HelpCircle className="w-3.5 h-3.5 text-yellow-600" />
        <span className="text-xs font-semibold text-yellow-700 uppercase tracking-wide">Condition</span>
      </div>
      <div className="px-3 py-2">
        <p className="text-sm text-slate-700 line-clamp-3">{(data as any).label || 'Evaluate condition'}</p>
      </div>
      <div className="flex justify-between px-3 pb-1.5">
        <span className="text-[10px] text-green-600 font-medium">True</span>
        <span className="text-[10px] text-red-500 font-medium">False</span>
      </div>
      <Handle
        type="source"
        position={Position.Bottom}
        id="true"
        className="!bg-green-400 !w-3 !h-3 !border-2 !border-white"
        style={{ left: '30%' }}
      />
      <Handle
        type="source"
        position={Position.Bottom}
        id="false"
        className="!bg-red-400 !w-3 !h-3 !border-2 !border-white"
        style={{ left: '70%' }}
      />
    </div>
  )
}

export default memo(TrueFalseNode)
