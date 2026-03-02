import { useNavigate } from 'react-router-dom'
import { X, Phone, Mail, Copy, MessageSquare, Send, BarChart2, Star, Building2, Hash } from 'lucide-react'
import { toast } from 'sonner'
import { formatPhone, cn } from '@/utils/helpers'
import type { Contact } from '@/types'

interface ContactDetailModalProps {
  contact: Contact | null
  onClose: () => void
}

const ROLE_LABELS: Record<string, string> = {
  agent: 'Agent',
  broker: 'Broker',
  lender: 'Lender',
  contractor: 'Contractor',
  wholesaler: 'Wholesaler',
  property_manager: 'Property Manager',
  attorney: 'Attorney',
  cpa: 'CPA',
  seller: 'Seller',
  buyer: 'Buyer',
  partner: 'Partner',
}

const CHANNEL_LABELS: Record<string, string> = {
  email: 'Email',
  phone: 'Phone',
  sms: 'SMS',
  telegram: 'Telegram',
  whatsapp: 'WhatsApp',
}

function getTagColor(tag: string) {
  const lower = tag.toLowerCase()
  if (lower === 'urgent' || lower === 'pre-foreclosure') {
    return 'bg-red-100 text-red-700'
  }
  if (lower === 'motivated') {
    return 'bg-yellow-100 text-yellow-700'
  }
  return 'bg-blue-100 text-blue-700'
}

export default function ContactDetailModal({ contact, onClose }: ContactDetailModalProps) {
  const navigate = useNavigate()

  if (!contact) return null

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text)
    toast.success(`${label} copied!`)
  }

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/30" onClick={onClose} />

      {/* Panel */}
      <div className="relative w-[380px] h-full bg-white shadow-xl overflow-y-auto">
        {/* Close button */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-1.5 rounded-lg hover:bg-slate-100 transition-colors"
        >
          <X className="w-5 h-5 text-slate-500" />
        </button>

        <div className="p-6 space-y-6">
          {/* Header */}
          <div>
            <h2 className="text-xl font-bold text-slate-800 pr-8">{contact.name}</h2>
            <div className="flex items-center gap-2 mt-1">
              <span className="px-2 py-0.5 text-xs font-medium rounded bg-primary-100 text-primary-700">
                {ROLE_LABELS[contact.role] || contact.role}
              </span>
              {contact.company && (
                <span className="text-sm text-slate-500">{contact.company}</span>
              )}
            </div>
            {contact.tags && contact.tags.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mt-3">
                {contact.tags.map((tag) => (
                  <span
                    key={tag}
                    className={`px-2 py-0.5 text-xs font-medium rounded ${getTagColor(tag)}`}
                  >
                    {tag}
                  </span>
                ))}
              </div>
            )}
          </div>

          {/* Rating */}
          {contact.rating != null && contact.rating > 0 && (
            <div className="flex items-center gap-1">
              {Array.from({ length: 5 }).map((_, i) => (
                <Star
                  key={i}
                  className={cn(
                    'w-4 h-4',
                    i < (contact.rating || 0)
                      ? 'fill-yellow-400 text-yellow-400'
                      : 'text-slate-200'
                  )}
                />
              ))}
            </div>
          )}

          {/* Contact Info */}
          <div>
            <h3 className="text-sm font-semibold text-slate-500 uppercase tracking-wide mb-3">
              Contact Info
            </h3>
            <div className="space-y-3">
              {contact.phone && (
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-slate-700">
                    <Phone className="w-4 h-4 text-slate-400" />
                    <span className="text-sm">{formatPhone(contact.phone)}</span>
                  </div>
                  <button
                    onClick={() => copyToClipboard(contact.phone!, 'Phone')}
                    className="p-1.5 rounded-lg hover:bg-slate-100 transition-colors"
                  >
                    <Copy className="w-4 h-4 text-slate-400" />
                  </button>
                </div>
              )}

              {contact.email && (
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-slate-700 min-w-0">
                    <Mail className="w-4 h-4 text-slate-400 shrink-0" />
                    <span className="text-sm truncate">{contact.email}</span>
                  </div>
                  <button
                    onClick={() => copyToClipboard(contact.email!, 'Email')}
                    className="p-1.5 rounded-lg hover:bg-slate-100 transition-colors shrink-0"
                  >
                    <Copy className="w-4 h-4 text-slate-400" />
                  </button>
                </div>
              )}

              {contact.preferredChannel && (
                <div className="flex items-center gap-2 text-slate-700">
                  <MessageSquare className="w-4 h-4 text-slate-400" />
                  <span className="text-sm">
                    Preferred: {CHANNEL_LABELS[contact.preferredChannel] || contact.preferredChannel}
                  </span>
                </div>
              )}

              {contact.dateAdded && (
                <div className="flex items-center gap-2 text-slate-700">
                  <span className="text-xs text-slate-400 uppercase font-medium">Added</span>
                  <span className="text-sm">
                    {new Date(contact.dateAdded).toLocaleDateString()}
                  </span>
                </div>
              )}
            </div>
          </div>

          {/* Details */}
          <div>
            <h3 className="text-sm font-semibold text-slate-500 uppercase tracking-wide mb-3">
              Details
            </h3>
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm text-slate-500">Interactions</span>
                <span className="text-sm font-medium text-slate-800">{contact.interactionCount}</span>
              </div>

              {contact.source && (
                <div className="flex items-center justify-between">
                  <span className="text-sm text-slate-500">Source</span>
                  <span className="text-sm font-medium text-slate-800">{contact.source}</span>
                </div>
              )}

              {contact.markets && contact.markets.length > 0 && (
                <div>
                  <span className="text-sm text-slate-500">Markets</span>
                  <div className="flex flex-wrap gap-1 mt-1">
                    {contact.markets.map((market) => (
                      <span key={market} className="px-2 py-0.5 text-xs bg-slate-100 text-slate-600 rounded">
                        {market}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {contact.lastContactedAt && (
                <div className="flex items-center justify-between">
                  <span className="text-sm text-slate-500">Last Contacted</span>
                  <span className="text-sm font-medium text-slate-800">
                    {new Date(contact.lastContactedAt).toLocaleDateString()}
                  </span>
                </div>
              )}
            </div>
          </div>

          {/* Notes */}
          {contact.notes && (
            <div>
              <h3 className="text-sm font-semibold text-slate-500 uppercase tracking-wide mb-2">
                Notes
              </h3>
              <p className="text-sm text-slate-700 bg-slate-50 rounded-lg p-3">{contact.notes}</p>
            </div>
          )}

          {/* Quick Actions */}
          <div>
            <h3 className="text-sm font-semibold text-slate-500 uppercase tracking-wide mb-3">
              Quick Actions
            </h3>
            <div className="space-y-2">
              <button
                onClick={() => { onClose(); navigate('/assistanthub') }}
                className="w-full flex items-center gap-3 px-4 py-2.5 text-sm font-medium text-slate-700 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors"
              >
                <MessageSquare className="w-4 h-4 text-slate-500" />
                Send SMS
              </button>
              <button
                onClick={() => { onClose(); navigate('/assistanthub') }}
                className="w-full flex items-center gap-3 px-4 py-2.5 text-sm font-medium text-slate-700 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors"
              >
                <Send className="w-4 h-4 text-slate-500" />
                Send Email
              </button>
              <button
                onClick={() => { onClose(); navigate('/pipeline') }}
                className="w-full flex items-center gap-3 px-4 py-2.5 text-sm font-medium text-slate-700 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors"
              >
                <BarChart2 className="w-4 h-4 text-slate-500" />
                Analyze Deal
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
