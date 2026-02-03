import { Phone, Mail, DollarSign, Calendar, Trash2 } from 'lucide-react'
import Modal from '../Common/Modal'
import { formatCurrency, formatDate } from '@/utils/helpers'
import { useDeleteDeal } from '@/hooks/useGHL'
import { useStore } from '@/hooks/useStore'
import type { Deal } from '@/types'

interface DealDetailModalProps {
  deal: Deal | null
  onClose: () => void
}

export default function DealDetailModal({ deal, onClose }: DealDetailModalProps) {
  const deleteDeal = useDeleteDeal()
  const { setSMSModalOpen, setSMSTargetContact } = useStore()

  if (!deal) return null

  const handleDelete = async () => {
    if (!confirm('Are you sure you want to delete this deal?')) return
    await deleteDeal.mutateAsync(deal.id)
    onClose()
  }

  const handleSendSMS = () => {
    // Would need to fetch contact details in production
    setSMSModalOpen(true)
    onClose()
  }

  return (
    <Modal isOpen={!!deal} onClose={onClose} title={deal.title} size="md">
      <div className="space-y-6">
        {/* Value */}
        <div className="flex items-center justify-center gap-2 p-4 bg-success-50 rounded-lg">
          <DollarSign className="w-6 h-6 text-success-600" />
          <span className="text-2xl font-bold text-success-600">
            {formatCurrency(deal.value || 0)}
          </span>
        </div>

        {/* Details */}
        <div className="space-y-3">
          <div className="flex items-center justify-between py-2 border-b border-slate-100">
            <span className="text-slate-500">Contact</span>
            <span className="font-medium text-slate-800">
              {deal.contactName || 'No contact'}
            </span>
          </div>

          <div className="flex items-center justify-between py-2 border-b border-slate-100">
            <span className="text-slate-500">Status</span>
            <span
              className={`px-2 py-1 text-xs font-medium rounded-full ${
                deal.status === 'open'
                  ? 'bg-primary-100 text-primary-700'
                  : deal.status === 'won'
                  ? 'bg-success-100 text-success-700'
                  : 'bg-slate-100 text-slate-700'
              }`}
            >
              {deal.status}
            </span>
          </div>

          {deal.createdAt && (
            <div className="flex items-center justify-between py-2 border-b border-slate-100">
              <span className="text-slate-500">Created</span>
              <span className="font-medium text-slate-800">
                {formatDate(deal.createdAt)}
              </span>
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="flex flex-col gap-2">
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
      </div>
    </Modal>
  )
}
