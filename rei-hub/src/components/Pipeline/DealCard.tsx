import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import {
  GripVertical,
  DollarSign,
  User,
  MapPin,
  AlertTriangle,
  TrendingUp,
  Building2,
  Target,
  ShieldCheck,
  Briefcase,
  Home,
} from 'lucide-react'
import { formatCurrency, cn } from '@/utils/helpers'
import type { Deal } from '@/types'

interface DealCardProps {
  deal: Deal
  isDragging?: boolean
  onClick?: () => void
  pipelineId?: string
}

export default function DealCard({ deal, isDragging, onClick, pipelineId }: DealCardProps) {
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

  const isInvestorBuyer = pipelineId === 'pipeline-investor-buyers'
  const isRetailBuyer = pipelineId === 'pipeline-retail-buyers'

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
          {isInvestorBuyer ? (
            <InvestorBuyerLayout deal={deal} />
          ) : isRetailBuyer ? (
            <RetailBuyerLayout deal={deal} />
          ) : (
            <DefaultDealLayout deal={deal} />
          )}
        </div>
      </div>
    </div>
  )
}

/* ── Investor Buyer Card ─────────────────────────────────────────────── */
function InvestorBuyerLayout({ deal }: { deal: Deal }) {
  // Buyer name from contactName or buyerName
  const buyerName = deal.contactName || deal.buyerName || deal.title || 'Unknown Buyer'

  // Parse property types from the deal if available
  const propertyTypes = deal.propertyType
    ? deal.propertyType.split(',').map((t) => t.trim()).filter(Boolean)
    : []

  // Markets from the deal
  const markets = [deal.city, deal.state].filter(Boolean)

  // Budget display — use offerPrice or purchasePrice as proxy for buyer budget
  const budget = deal.offerPrice || deal.purchasePrice

  return (
    <>
      {/* Buyer Name — primary info */}
      <div className="flex items-center gap-1">
        {deal.isUrgent && (
          <AlertTriangle className="w-3.5 h-3.5 text-red-500 shrink-0" />
        )}
        <User className="w-3.5 h-3.5 text-primary-500 shrink-0" />
        <p className="font-semibold text-slate-800 truncate">{buyerName}</p>
      </div>

      {/* Company / Buying Entity */}
      {(deal.buyerType || deal.exitStrategy) && (
        <div className="flex items-center gap-1 mt-0.5 text-xs text-slate-500">
          <Building2 className="w-3 h-3 shrink-0" />
          <span className="truncate">
            {deal.buyerType && <span className="capitalize">{deal.buyerType}</span>}
            {deal.buyerType && deal.exitStrategy && ' · '}
            {deal.exitStrategy && <span>{deal.exitStrategy}</span>}
          </span>
        </div>
      )}

      {/* Budget */}
      {budget != null && (
        <div className="flex items-center gap-1 mt-1">
          <DollarSign className="w-3.5 h-3.5 text-success-500" />
          <span className="text-sm font-semibold text-success-600">
            Budget: {formatCurrency(budget)}
          </span>
        </div>
      )}

      {/* Property Types as chips */}
      {propertyTypes.length > 0 && (
        <div className="flex flex-wrap gap-1 mt-1.5">
          {propertyTypes.slice(0, 3).map((pt) => (
            <span
              key={pt}
              className="px-1.5 py-0.5 text-[10px] font-medium bg-primary-50 text-primary-700 rounded"
            >
              {pt}
            </span>
          ))}
          {propertyTypes.length > 3 && (
            <span className="px-1.5 py-0.5 text-[10px] font-medium bg-slate-100 text-slate-500 rounded">
              +{propertyTypes.length - 3}
            </span>
          )}
        </div>
      )}

      {/* Markets */}
      {markets.length > 0 && (
        <div className="flex items-center gap-1 mt-1 text-xs text-slate-500">
          <Target className="w-3 h-3 shrink-0" />
          <span className="truncate">{markets.join(', ')}</span>
        </div>
      )}
    </>
  )
}

/* ── Retail Buyer Card ───────────────────────────────────────────────── */
function RetailBuyerLayout({ deal }: { deal: Deal }) {
  const buyerName = deal.contactName || deal.buyerName || deal.title || 'Unknown Buyer'
  const location = [deal.city, deal.state].filter(Boolean).join(', ')

  return (
    <>
      {/* Buyer Name */}
      <div className="flex items-center gap-1">
        {deal.isUrgent && (
          <AlertTriangle className="w-3.5 h-3.5 text-red-500 shrink-0" />
        )}
        <User className="w-3.5 h-3.5 text-primary-500 shrink-0" />
        <p className="font-semibold text-slate-800 truncate">{buyerName}</p>
      </div>

      {/* Property Address */}
      {deal.address && (
        <div className="flex items-center gap-1 mt-0.5 text-xs text-slate-500">
          <Home className="w-3 h-3 shrink-0" />
          <span className="truncate">{deal.address}</span>
        </div>
      )}

      {/* Location */}
      {location && (
        <div className="flex items-center gap-1 mt-0.5 text-xs text-slate-500">
          <MapPin className="w-3 h-3 shrink-0" />
          <span className="truncate">{location}</span>
        </div>
      )}

      {/* Pre-approval / Subject-To Interest */}
      {deal.subjectToInterest && (
        <div className="flex items-center gap-1 mt-1">
          <ShieldCheck className="w-3.5 h-3.5 text-blue-500 shrink-0" />
          <span className="text-xs font-medium text-blue-600">
            Sub-To: {deal.subjectToInterest}
          </span>
        </div>
      )}

      {/* Source of Funds */}
      {deal.sourceOfFunds && (
        <div className="flex items-center gap-1 mt-0.5 text-xs text-slate-500">
          <Briefcase className="w-3 h-3 shrink-0" />
          <span className="truncate">{deal.sourceOfFunds}</span>
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
        {deal.buyerDownPayment != null && (
          <div className="flex items-center gap-1">
            <span className="text-xs text-slate-500">
              Down: {formatCurrency(deal.buyerDownPayment)}
            </span>
          </div>
        )}
      </div>
    </>
  )
}

/* ── Default Deal Card (Deals + Tax Deals) ───────────────────────────── */
function DefaultDealLayout({ deal }: { deal: Deal }) {
  const location = [deal.city, deal.state].filter(Boolean).join(', ')

  return (
    <>
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
    </>
  )
}
