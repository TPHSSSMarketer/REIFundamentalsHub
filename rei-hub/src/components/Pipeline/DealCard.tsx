import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { GripVertical, DollarSign, User, MapPin, AlertTriangle, TrendingUp } from 'lucide-react'
import { formatCurrency, cn } from '@/utils/helpers'
import type { Deal } from '@/types'

interface DealCardProps {
  deal: Deal
  isDragging?: boolean
  onClick?: () => void
}

export default function DealCard({ deal, isDragging, onClick }: DealCardProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging: isSortableDragging,
  } = useSortable({ id: deal.id })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  }

  const location = [deal.city, deal.state].filter(Boolean).join(', ')

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        'bg-white rounded-lg border border-slate-200 p-3 cursor-pointer hover:shadow-md transition-shadow',
        (isDragging || isSortableDragging) && 'opacity-50 shadow-lg',
        isDragging && 'rotate-2',
        deal.isUrgent && 'border-l-4 border-l-red-500'
      )}
      onClick={onClick}
    >
      <div className="flex items-start gap-2">
        {/* Drag Handle */}
        <button
          {...attributes}
          {...listeners}
          className="mt-0.5 p-1 rounded hover:bg-slate-100 cursor-grab active:cursor-grabbing"
          onClick={(e) => e.stopPropagation()}
        >
          <GripVertical className="w-4 h-4 text-slate-400" />
        </button>

        <div className="flex-1 min-w-0">
          {/* Address */}
          <div className="flex items-center gap-1">
            {deal.isUrgent && (
              <AlertTriangle className="w-3.5 h-3.5 text-red-500 shrink-0" />
            )}
            <p className="font-medium text-slate-800 truncate">{deal.address}</p>
          </div>

          {/* City/State */}
          {location && (
            <div className="flex items-center gap-1 mt-0.5 text-xs text-slate-500">
              <MapPin className="w-3 h-3" />
              <span className="truncate">{location}</span>
            </div>
          )}

          {/* Contact */}
          {deal.contactName && (
            <div className="flex items-center gap-1 mt-1 text-sm text-slate-500">
              <User className="w-3 h-3" />
              <span className="truncate">{deal.contactName}</span>
            </div>
          )}

          {/* Price Row */}
          <div className="flex items-center gap-3 mt-2">
            {deal.purchasePrice != null && (
              <div className="flex items-center gap-1">
                <DollarSign className="w-3.5 h-3.5 text-success-500" />
                <span className="text-sm font-semibold text-success-600">
                  {formatCurrency(deal.purchasePrice)}
                </span>
              </div>
            )}
            {deal.arv != null && (
              <div className="flex items-center gap-1">
                <TrendingUp className="w-3.5 h-3.5 text-primary-500" />
                <span className="text-xs text-primary-600">
                  ARV {formatCurrency(deal.arv)}
                </span>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
