import { useState, useEffect } from 'react'
import { X, Loader2, CheckCircle } from 'lucide-react'
import { getDomains, type Domain, sendContactEmail } from '@/services/emailMarketingApi'
import type { Contact } from '@/types'

interface EmailComposeModalProps {
  contact: Contact
  onClose: () => void
  onSuccess: () => void
}

export default function EmailComposeModal({ contact, onClose, onSuccess }: EmailComposeModalProps) {
  const [domains, setDomains] = useState<Domain[]>([])
  const [selectedDomain, setSelectedDomain] = useState('')
  const [subject, setSubject] = useState('')
  const [body, setBody] = useState('')
  const [sending, setSending] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(false)
  const [loadingDomains, setLoadingDomains] = useState(true)

  useEffect(() => {
    getDomains()
      .then(res => {
        const verified = (res.domains || []).filter(
          (d: any) => d.status === 'verified'
        )
        setDomains(verified)
        if (verified.length > 0) setSelectedDomain(verified[0].id as string)
      })
      .catch(() => {})
      .finally(() => setLoadingDomains(false))
  }, [])

  const handleSend = async () => {
    if (!subject.trim() || !body.trim()) {
      setError('Subject and message are required.')
      return
    }
    if (!contact.email) {
      setError('Contact has no email address.')
      return
    }
    setSending(true)
    setError('')
    try {
      await sendContactEmail(contact.id, subject, body)
      setSuccess(true)
      setTimeout(onSuccess, 1500)
    } catch (err: any) {
      setError(err.message || 'Failed to send email.')
    } finally {
      setSending(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/30" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-xl w-full max-w-lg mx-4 p-6">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-1.5 rounded-lg hover:bg-slate-100 transition-colors"
        >
          <X className="w-5 h-5 text-slate-500" />
        </button>

        {success ? (
          <div className="text-center py-8">
            <CheckCircle className="w-12 h-12 text-green-500 mx-auto mb-3" />
            <h3 className="text-lg font-bold text-slate-800">Email Sent!</h3>
            <p className="text-sm text-slate-500 mt-1">
              Your email has been sent to {contact.email}.
            </p>
          </div>
        ) : (
          <>
            <h2 className="text-lg font-bold text-slate-800 mb-1">Send Email</h2>
            <p className="text-sm text-slate-500 mb-5">
              Compose a one-off email to {contact.name}.
            </p>

            {error && (
              <div className="mb-4 p-3 bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg">
                {error}
              </div>
            )}

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">To</label>
                <input
                  type="email"
                  value={contact.email || 'No email address'}
                  readOnly
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm bg-slate-50 text-slate-600"
                />
              </div>

              {!loadingDomains && domains.length > 0 && (
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">From Domain</label>
                  <select
                    value={selectedDomain}
                    onChange={e => setSelectedDomain(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
                  >
                    {domains.map((d: any) => (
                      <option key={d.id} value={d.id}>
                        {d.from_email || d.domain}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Subject</label>
                <input
                  type="text"
                  value={subject}
                  onChange={e => setSubject(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
                  placeholder="Regarding your property at..."
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Message</label>
                <textarea
                  value={body}
                  onChange={e => setBody(e.target.value)}
                  rows={6}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm resize-none focus:outline-none focus:ring-2 focus:ring-primary-500"
                  placeholder="Hi there, ..."
                />
              </div>
            </div>

            <button
              onClick={handleSend}
              disabled={sending || !contact.email}
              className="mt-5 w-full py-2.5 bg-primary-600 text-white font-semibold rounded-lg hover:bg-primary-700 disabled:opacity-50 transition-colors"
            >
              {sending ? (
                <span className="flex items-center justify-center gap-2">
                  <Loader2 className="w-4 h-4 animate-spin" /> Sending...
                </span>
              ) : (
                'Send Email'
              )}
            </button>
          </>
        )}
      </div>
    </div>
  )
}
