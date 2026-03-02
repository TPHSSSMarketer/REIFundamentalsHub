import { useDroppable } from '@dnd-kit/core'
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable'
import DealCard from './DealCard'
import { formatCurrency, cn } from '@/utils/helpers'
import type { Deal, PipelineStage } from '@/types'

interface PipelineColumnProps {
  stage: PipelineStage
  deals: Deal[]
  color: string
  loading?: boolean
  onDealClick: (deal: Deal) => void
  pipelineId: string
}

export default function PipelineColumn({
  stage,
  deals,
  color,
  loading,
  onDealClick,
  pipelineId,
}: PipelineColumnProps) {
  const { setNodeRef, isOver } = useDroppable({
    id: stage.id,
  })

  const totalValue = deals.reduce((sum, d) => sum + (d.purchasePrice || 0), 0)

  return (
    <div
      ref={setNodeRef}
      className={cn(
        'flex-shrink-0 w-72 bg-slate-100 rounded-lg p-3 transition-colors',
        isOver && 'bg-primary-50 ring-2 ring-primary-300'
      )}
    >
      {/* Column Header */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <div
            className="w-3 h-3 rounded-full"
            style={{ backgroundColor: color }}
          />
          <h3 className="font-semibold text-slate-800">{stage.name}</h3>
          <span className="px-2 py-0.5 text-xs font-medium bg-slate-200 text-slate-600 rounded-full">
            {deals.length}
          </span>
        </div>
      </div>

      {/* Column Value */}
      <p className="text-sm text-slate-500 mb-3">
        {formatCurrency(totalValue)}
      </p>

      {/* Deals */}
      <SortableContext
        items={deals.map((d) => d.id)}
        strategy={verticalListSortingStrategy}
      >
        <div className="space-y-2 min-h-[200px]">
          {loading ? (
            <>
              <div className="h-24 bg-slate-200 rounded-lg animate-pulse" />
              <div className="h-24 bg-slate-200 rounded-lg animate-pulse" />
            </>
          ) : deals.length === 0 ? (
            <div className="flex items-center justify-center h-24 border-2 border-dashed border-slate-300 rounded-lg">
              <p className="text-sm text-slate-400">No deals</p>
            </div>
          ) : (
            deals.map((deal) => (
              <DealCard
                key={deal.id}
                deal={deal}
                onClick={() => onDealClick(deal)}
                pipelineId={pipelineId}
              />
            ))
          )}
        </div>
      </SortableContext>
    </div>
  )
}
