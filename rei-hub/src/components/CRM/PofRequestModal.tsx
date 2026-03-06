import { useState } from 'react'
import { X, Loader2, CheckCircle } from 'lucide-react'
import { requestPof } from '@/services/plaidApi'
import type { Contact } from '@/types'

interface PofRequestModalProps {
  contact: Contact
  onClose: () => void
  onSuccess: () => void
}

export default function PofRequestModal({ contact, onClose, onSuccess }: PofRequestModalProps) {
  const [buyerName, setBuyerName] = useState(contact.name || '')
  const [buyerEmail, setBuyerEmail] = useState(contact.email || '')
  const [propertyAddress, setPropertyAddress] = useState('')
  const [requiredAmount, setRequiredAmount] = useState('')
  const [notes, setNotes] = useState('')
  const [sending, setSending] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(false)

  const handleSubmit = async () => {
    if (!buyerName || !buyerEmail || !requiredAmount) {
      setError('Name, email, and required amount are required.')
      return
    }
    setSending(true)
    setError('')
    try {
      await requestPof({
        buyer_name: buyerName,
        buyer_email: buyerEmail,
        property_address: propertyAddress,
        required_amount: parseFloat(requiredAmount.replace(/[^0-9.]/g, '')),
        notes: notes || undefined,
      })
      setSuccess(true)
      setTimeout(onSuccess, 1500)
    } catch (err: any) {
      setError(err.message || 'Failed to send POF request.')
    } finally {
      setSending(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/30" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-xl w-full max-w-md mx-4 p-6">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-1.5 rounded-lg hover:bg-slate-100 transition-colors"
        >
          <X className="w-5 h-5 text-slate-500" />
        </button>

        {success ? (
          <div className="text-center py-8">
            <CheckCircle className="w-12 h-12 text-green-500 mx-auto mb-3" />
            <h3 className="text-lg font-bold text-slate-800">POF Request Sent!</h3>
            <p className="text-sm text-slate-500 mt-1">
              A verification link has been sent to {buyerEmail}.
            </p>
          </div>
        ) : (
          <>
            <h2 className="text-lg font-bold text-slate-800 mb-1">Request Proof of Funds</h2>
            <p className="text-sm text-slate-500 mb-5">
              Send a verification request to confirm available funds.
            </p>

            {error && (
              <div className="mb-4 p-3 bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg">
                {error}
              </div>
            )}

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Buyer Name</label>
                <input
                  type="text"
                  value={buyerName}
                  onChange={e => setBuyerName(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Buyer Email</label>
                <input
                  type="email"
                  value={buyerEmail}
                  onChange={e => setBuyerEmail(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Property Address</label>
                <input
                  type="text"
                  value={propertyAddress}
                  onChange={e => setPropertyAddress(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
                  placeholder="123 Main St, Austin TX"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Required Amount</label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-slate-400">$</span>
                  <input
                    type="text"
                    value={requiredAmount}
                    onChange={e => setRequiredAmount(e.target.value)}
                    className="w-full pl-7 pr-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
                    placeholder="250,000"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Notes (optional)</label>
                <textarea
                  value={notes}
                  onChange={e => setNotes(e.target.value)}
                  rows={2}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm resize-none focus:outline-none focus:ring-2 focus:ring-primary-500"
                  placeholder="Any additional context..."
                />
              </div>
            </div>

            <button
              onClick={handleSubmit}
              disabled={sending}
              className="mt-5 w-full py-2.5 bg-primary-600 text-white font-semibold rounded-lg hover:bg-primary-700 disabled:opacity-50 transition-colors"
            >
              {sending ? (
                <span className="flex items-center justify-center gap-2">
                  <Loader2 className="w-4 h-4 animate-spin" /> Sending...
                </span>
              ) : (
                'Send POF Request'
              )}
            </button>
          </>
        )}
      </div>
    </div>
  )
}
