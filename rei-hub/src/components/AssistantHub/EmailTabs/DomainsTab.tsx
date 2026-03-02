import { useState, useEffect, useCallback } from 'react'
import { Globe, Plus, Trash2, Check, Copy } from 'lucide-react'
import * as api from '@/services/emailMarketingApi'

// ── Types ─────────────────────────────────────────────────────

interface Domain {
  id: string; domain: string; from_name: string; from_email: string
  status: string; provider: string; dns_records: Record<string, Record<string, string>> | null
  verified_at: string | null; created_at: string
}

// ── Badge helper ──────────────────────────────────────────────

function StatusBadge({ status }: { status: string }) {
  const colors: Record<string, string> = {
    verified: 'bg-green-100 text-green-700',
    pending: 'bg-yellow-100 text-yellow-700',
    failed: 'bg-red-100 text-red-700',
    subscribed: 'bg-green-100 text-green-700',
    unsubscribed: 'bg-gray-100 text-gray-500',
    bounced: 'bg-red-100 text-red-700',
    complained: 'bg-red-100 text-red-700',
    draft: 'bg-gray-100 text-gray-600',
    scheduled: 'bg-blue-100 text-blue-700',
    sending: 'bg-yellow-100 text-yellow-700',
    sent: 'bg-green-100 text-green-700',
    paused: 'bg-orange-100 text-orange-700',
  }
  return (
    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${colors[status] ?? 'bg-gray-100 text-gray-600'}`}>
      {status}
    </span>
  )
}

// ═══════════════════════════════════════════════════════════════
// Component
// ═══════════════════════════════════════════════════════════════

interface DomainsTabProps {
  onProviderChange?: (provider: string) => void
}

export default function DomainsTab({ onProviderChange }: DomainsTabProps) {
  const [domains, setDomains] = useState<Domain[]>([])
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({ domain: '', from_name: '', from_email: '' })
  const [loading, setLoading] = useState(false)
  const [copied, setCopied] = useState('')

  const load = useCallback(async () => {
    try {
      const data = await api.getDomains()
      setDomains(data.domains as Domain[])
      onProviderChange?.(data.current_provider)
    } catch { /* ignore */ }
  }, [onProviderChange])

  useEffect(() => { load() }, [load])

  const handleAdd = async () => {
    setLoading(true)
    try {
      await api.addDomain(form)
      setForm({ domain: '', from_name: '', from_email: '' })
      setShowForm(false)
      await load()
    } catch (e: any) {
      alert(e.message)
    } finally { setLoading(false) }
  }

  const handleVerify = async (id: string) => {
    try {
      const res = await api.verifyDomain(id)
      alert(res.message)
      await load()
    } catch (e: any) { alert(e.message) }
  }

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this domain?')) return
    await api.deleteDomain(id)
    await load()
  }

  const copyText = (text: string, key: string) => {
    navigator.clipboard.writeText(text)
    setCopied(key)
    setTimeout(() => setCopied(''), 2000)
  }

  return (
    <div className="space-y-6">
      {domains.length === 0 && !showForm && (
        <div className="bg-white rounded-xl border border-slate-200 p-8 text-center">
          <Globe className="w-12 h-12 text-slate-300 mx-auto mb-4" />
          <h3 className="text-lg font-semibold text-slate-700 mb-2">Send emails from your own domain</h3>
          <p className="text-sm text-slate-500 mb-4">Set up a custom sending domain in 3 steps: enter domain, add DNS records, verify.</p>
          <button onClick={() => setShowForm(true)} className="px-4 py-2 bg-primary-600 text-white rounded-lg text-sm font-medium hover:bg-primary-700">
            <Plus className="w-4 h-4 inline mr-1" /> Add Domain
          </button>
        </div>
      )}

      {(showForm || domains.length > 0) && (
        <div className="flex justify-end">
          {!showForm && (
            <button onClick={() => setShowForm(true)} className="px-4 py-2 bg-primary-600 text-white rounded-lg text-sm font-medium hover:bg-primary-700">
              <Plus className="w-4 h-4 inline mr-1" /> Add Domain
            </button>
          )}
        </div>
      )}

      {showForm && (
        <div className="bg-white rounded-xl border border-slate-200 p-6">
          <h3 className="font-semibold text-slate-700 mb-4">Add Sending Domain</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
            <input placeholder="yourdomain.com" value={form.domain} onChange={(e) => setForm({ ...form, domain: e.target.value })} className="px-3 py-2 border border-slate-300 rounded-lg text-sm" />
            <input placeholder="From Name" value={form.from_name} onChange={(e) => setForm({ ...form, from_name: e.target.value })} className="px-3 py-2 border border-slate-300 rounded-lg text-sm" />
            <input placeholder="noreply@yourdomain.com" value={form.from_email} onChange={(e) => setForm({ ...form, from_email: e.target.value })} className="px-3 py-2 border border-slate-300 rounded-lg text-sm" />
          </div>
          <div className="flex gap-2">
            <button onClick={handleAdd} disabled={loading || !form.domain} className="px-4 py-2 bg-primary-600 text-white rounded-lg text-sm font-medium hover:bg-primary-700 disabled:opacity-50">
              {loading ? 'Adding...' : 'Add Domain'}
            </button>
            <button onClick={() => setShowForm(false)} className="px-4 py-2 text-slate-600 border border-slate-300 rounded-lg text-sm hover:bg-slate-50">Cancel</button>
          </div>
        </div>
      )}

      {domains.map((d) => (
        <div key={d.id} className="bg-white rounded-xl border border-slate-200 p-6">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="font-semibold text-slate-800">{d.domain}</h3>
              <p className="text-sm text-slate-500">{d.from_name} &lt;{d.from_email}&gt;</p>
            </div>
            <div className="flex items-center gap-3">
              <StatusBadge status={d.status} />
              <button onClick={() => handleDelete(d.id)} className="text-red-400 hover:text-red-600"><Trash2 className="w-4 h-4" /></button>
            </div>
          </div>

          {d.dns_records && d.status !== 'verified' && (
            <div className="mt-4">
              <h4 className="text-sm font-medium text-slate-600 mb-2">Add these DNS records to your domain registrar</h4>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead><tr className="text-left text-slate-500 border-b">
                    <th className="py-2 pr-4">Type</th><th className="py-2 pr-4">Host</th><th className="py-2 pr-4">Value</th><th className="py-2 w-10"></th>
                  </tr></thead>
                  <tbody>
                    {(['spf', 'dkim', 'dmarc'] as const).map((key) => {
                      const rec = d.dns_records?.[key]
                      if (!rec) return null
                      return (
                        <tr key={key} className="border-b border-slate-100">
                          <td className="py-2 pr-4 font-mono text-xs">{rec.type}</td>
                          <td className="py-2 pr-4 font-mono text-xs break-all">{rec.host}</td>
                          <td className="py-2 pr-4 font-mono text-xs break-all max-w-xs">{rec.value}</td>
                          <td className="py-2">
                            <button onClick={() => copyText(rec.value, `${d.id}-${key}`)} className="text-slate-400 hover:text-slate-600">
                              {copied === `${d.id}-${key}` ? <Check className="w-4 h-4 text-green-500" /> : <Copy className="w-4 h-4" />}
                            </button>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
              <div className="mt-4 flex items-center gap-3">
                <button onClick={() => handleVerify(d.id)} className="px-4 py-2 bg-green-600 text-white rounded-lg text-sm font-medium hover:bg-green-700">
                  <Check className="w-4 h-4 inline mr-1" /> Verify Now
                </button>
                <span className="text-xs text-slate-400">DNS propagation can take up to 48 hours</span>
              </div>
            </div>
          )}

          {d.status === 'verified' && d.verified_at && (
            <p className="text-sm text-green-600 mt-2">Verified on {new Date(d.verified_at).toLocaleDateString()}</p>
          )}
        </div>
      ))}
    </div>
  )
}
