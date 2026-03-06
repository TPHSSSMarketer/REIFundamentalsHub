import { useState } from 'react'
import { Phone, Mail, DollarSign, Calendar, Trash2, Calculator, AlertTriangle, MapPin } from 'lucide-react'
import Modal from '../Common/Modal'
import DealAnalysisPanel from './DealAnalysisPanel'
import DealAnalyzerModal from './DealAnalyzerModal'
import { formatCurrency, formatDate } from '@/utils/helpers'
import { useDeleteDeal } from '@/hooks/useApi'
import { useStore } from '@/hooks/useStore'
import type { Deal } from '@/types'

const STAGE_LABELS: Record<string, string> = {
  lead: 'New Lead',
  analysis: 'Analysis',
  offer: 'Offer Made',
  under_contract: 'Under Contract',
  due_diligence: 'Due Diligence',
  closing: 'Closing',
  closed_won: 'Closed Won',
  closed_lost: 'Closed Lost',
}

interface DealDetailModalProps {
  deal: Deal | null
  onClose: () => void
}

export default function DealDetailModal({ deal, onClose }: DealDetailModalProps) {
  const deleteDeal = useDeleteDeal()
  const { setSMSModalOpen, setSMSTargetContact } = useStore()
  const [showAnalyzer, setShowAnalyzer] = useState(false)

  if (!deal) return null

  const handleDelete = async () => {
    if (!confirm('Are you sure you want to delete this deal?')) return
    await deleteDeal.mutateAsync(deal.id)
    onClose()
  }

  const handleSendSMS = () => {
    setSMSModalOpen(true)
    onClose()
  }

  const location = [deal.address, deal.city, deal.state, deal.zip].filter(Boolean).join(', ')

  return (
    <Modal isOpen={!!deal} onClose={onClose} title={deal.address || deal.title} size="md">
      <div className="space-y-6">
        {/* Urgent Badge */}
        {deal.isUrgent && (
          <div className="flex items-center gap-2 p-3 bg-red-50 rounded-lg text-red-700 text-sm font-medium">
            <AlertTriangle className="w-4 h-4" />
            Urgent Deal
          </div>
        )}

        {/* Location */}
        <div className="flex items-center gap-2 text-slate-600">
          <MapPin className="w-4 h-4 text-slate-400" />
          <span className="text-sm">{location}</span>
        </div>

        {/* Financial Summary */}
        <div className="grid grid-cols-2 gap-3">
          {deal.listPrice != null && (
            <div className="p-3 bg-slate-50 rounded-lg">
              <p className="text-xs text-slate-500">List Price</p>
              <p className="text-sm font-semibold text-slate-800">{formatCurrency(deal.listPrice)}</p>
            </div>
          )}
          {deal.purchasePrice != null && (
            <div className="p-3 bg-success-50 rounded-lg">
              <p className="text-xs text-success-600">Purchase Price</p>
              <p className="text-sm font-semibold text-success-700">{formatCurrency(deal.purchasePrice)}</p>
            </div>
          )}
          {deal.arv != null && (
            <div className="p-3 bg-primary-50 rounded-lg">
              <p className="text-xs text-primary-600">ARV</p>
              <p className="text-sm font-semibold text-primary-700">{formatCurrency(deal.arv)}</p>
            </div>
          )}
          {deal.rehabEstimate != null && (
            <div className="p-3 bg-warning-50 rounded-lg">
              <p className="text-xs text-warning-600">Rehab Estimate</p>
              <p className="text-sm font-semibold text-warning-700">{formatCurrency(deal.rehabEstimate)}</p>
            </div>
          )}
          {deal.allInCost != null && (
            <div className="p-3 bg-slate-50 rounded-lg">
              <p className="text-xs text-slate-500">All-In Cost</p>
              <p className="text-sm font-semibold text-slate-800">{formatCurrency(deal.allInCost)}</p>
            </div>
          )}
          {deal.monthlyRent != null && (
            <div className="p-3 bg-slate-50 rounded-lg">
              <p className="text-xs text-slate-500">Monthly Rent</p>
              <p className="text-sm font-semibold text-slate-800">{formatCurrency(deal.monthlyRent)}</p>
            </div>
          )}
        </div>

        {/* Details */}
        <div className="space-y-3">
          <div className="flex items-center justify-between py-2 border-b border-slate-100">
            <span className="text-slate-500">Stage</span>
            <span className="px-2 py-1 text-xs font-medium rounded-full bg-primary-100 text-primary-700">
              {STAGE_LABELS[deal.stage] || deal.stage}
            </span>
          </div>

          <div className="flex items-center justify-between py-2 border-b border-slate-100">
            <span className="text-slate-500">Contact</span>
            <span className="font-medium text-slate-800">
              {deal.contactName || 'No contact'}
            </span>
          </div>

          {deal.source && (
            <div className="flex items-center justify-between py-2 border-b border-slate-100">
              <span className="text-slate-500">Source</span>
              <span className="font-medium text-slate-800">{deal.source}</span>
            </div>
          )}

          {deal.offerExpiresAt && (
            <div className="flex items-center justify-between py-2 border-b border-slate-100">
              <span className="text-slate-500">Offer Expires</span>
              <span className="font-medium text-slate-800">{formatDate(deal.offerExpiresAt)}</span>
            </div>
          )}

          {deal.inspectionDeadline && (
            <div className="flex items-center justify-between py-2 border-b border-slate-100">
              <span className="text-slate-500">Inspection Deadline</span>
              <span className="font-medium text-slate-800">{formatDate(deal.inspectionDeadline)}</span>
            </div>
          )}

          {deal.closingDate && (
            <div className="flex items-center justify-between py-2 border-b border-slate-100">
              <span className="text-slate-500">Closing Date</span>
              <span className="font-medium text-slate-800">{formatDate(deal.closingDate)}</span>
            </div>
          )}

          <div className="flex items-center justify-between py-2 border-b border-slate-100">
            <span className="text-slate-500">Created</span>
            <span className="font-medium text-slate-800">
              {formatDate(deal.createdAt)}
            </span>
          </div>
        </div>

        {/* Notes */}
        {deal.notes && (
          <div>
            <p className="text-sm font-medium text-slate-500 mb-1">Notes</p>
            <p className="text-sm text-slate-700 bg-slate-50 rounded-lg p-3">{deal.notes}</p>
          </div>
        )}

        {/* Actions */}
        <div className="flex flex-col gap-2">
          <button
            onClick={() => setShowAnalyzer(true)}
            className="w-full flex items-center justify-center gap-2 px-4 py-2.5 border border-primary-300 text-primary-600 rounded-lg hover:bg-primary-50 transition-colors"
          >
            <Calculator className="w-4 h-4" />
            Analyze Deal
          </button>

          <div className="flex gap-2">
            <button
              onClick={handleSendSMS}
              className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-warning-500 text-white rounded-lg hover:bg-warning-600 transition-colors"
            >
              <Phone className="w-4 h-4" />
              Send SMS
            </button>
            <button
              onClick={() => {}}
              className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-primary-500 text-white rounded-lg hover:bg-primary-600 transition-colors"
            >
              <Mail className="w-4 h-4" />
              Send Email
            </button>
          </div>

          <button
            onClick={handleDelete}
            disabled={deleteDeal.isPending}
            className="flex items-center justify-center gap-2 px-4 py-2 text-danger-600 hover:bg-danger-50 rounded-lg transition-colors"
          >
            <Trash2 className="w-4 h-4" />
            Delete Deal
          </button>
        </div>

        {/* AI Deal Analysis */}
        <DealAnalysisPanel
          address={deal.address}
          askingPrice={deal.listPrice}
        />

        {/* Deal Analyzer Calculator */}
        <DealAnalyzerModal
          isOpen={showAnalyzer}
          onClose={() => setShowAnalyzer(false)}
          dealId={deal.id}
          dealTitle={deal.title}
          defaultAskingPrice={deal.listPrice ?? undefined}
        />
      </div>
    </Modal>
  )
}
