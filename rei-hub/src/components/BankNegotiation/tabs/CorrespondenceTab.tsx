import { useState, useEffect } from 'react'
import { getNegotiations, getCorrespondence, updateTracking } from '../../../services/bankNegotiationApi'

interface Props { }

const METHOD_ICON: Record<string, string> = { certified_mail: '\u{1F4EC}', fax: '\u{1F4E0}', email: '\u2709\uFE0F' }
const METHOD_LABEL: Record<string, string> = { certified_mail: 'Certified Mail', fax: 'Fax', email: 'Email' }
const STATUS_STYLE: Record<string, string> = {
  sent: 'bg-blue-100 text-blue-800',
  in_transit: 'bg-yellow-100 text-yellow-800',
  delivered: 'bg-green-100 text-green-800',
  failed: 'bg-red-100 text-red-800',
  attempted: 'bg-orange-100 text-orange-800',
}
const STATUS_SUFFIX: Record<string, string> = { delivered: ' \u2713', failed: ' \u2717' }

export default function CorrespondenceTab({}: Props) {
  const [correspondence, setCorrespondence] = useState<any[]>([])
  const [negotiations, setNegotiations] = useState<any[]>([])
  const [filters, setFilters] = useState({ negotiation_id: '', method: '', status: '', start_date: '', end_date: '' })
  const [loading, setLoading] = useState(true)
  const [toast, setToast] = useState('')

  useEffect(() => { fetchAll() }, [])

  async function fetchAll() {
    setLoading(true)
    try {
      const negs = await getNegotiations()
      const negList: any[] = Array.isArray(negs) ? negs : negs.negotiations || []
      setNegotiations(negList)
      const allCorr: any[] = []
      for (const n of negList) {
        try {
          const c = await getCorrespondence(n.id)
          const items = (Array.isArray(c) ? c : c.correspondence || []).map((item: any) => ({ ...item, bank_name: n.bank_name, property_address: n.property_address, negotiation_id: n.id }))
          allCorr.push(...items)
        } catch { /* skip */ }
      }
      setCorrespondence(allCorr)
    } catch { setCorrespondence([]) }
    setLoading(false)
  }

  async function handleUpdateTracking(negId: string, corrId: string) {
    try {
      await updateTracking(negId, corrId)
      setToast('Tracking updated'); setTimeout(() => setToast(''), 4000)
      fetchAll()
    } catch { setToast('Failed to update tracking'); setTimeout(() => setToast(''), 4000) }
  }

  const filtered = correspondence.filter(c => {
    if (filters.negotiation_id && c.negotiation_id !== filters.negotiation_id) return false
    if (filters.method && c.method !== filters.method) return false
    if (filters.status && c.status !== filters.status) return false
    if (filters.start_date && c.sent_date < filters.start_date) return false
    if (filters.end_date && c.sent_date > filters.end_date) return false
    return true
  })

  const stats = {
    total: filtered.length,
    delivered: filtered.filter(c => c.status === 'delivered').length,
    inTransit: filtered.filter(c => c.status === 'in_transit' || c.status === 'sent').length,
    failed: filtered.filter(c => c.status === 'failed').length,
  }

  return (
    <div className="space-y-4">
      {toast && <div className="fixed top-4 right-4 z-50 bg-[#1B3A6B] text-white px-4 py-2 rounded-lg shadow-lg text-sm">{toast}</div>}

      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[{ label: 'Total Sent', value: stats.total, color: 'text-slate-800' }, { label: 'Delivered', value: stats.delivered, color: 'text-green-600' }, { label: 'In Transit', value: stats.inTransit, color: 'text-yellow-600' }, { label: 'Failed', value: stats.failed, color: 'text-[#CC2229]' }].map(s => (
          <div key={s.label} className="bg-white rounded-xl shadow p-4">
            <p className="text-xs text-slate-500">{s.label}</p>
            <p className={`text-2xl font-bold ${s.color}`}>{s.value}</p>
          </div>
        ))}
      </div>

      {/* Filter Bar */}
      <div className="bg-white rounded-xl shadow p-4 flex flex-wrap gap-3 items-end">
        <div>
          <label className="block text-xs text-slate-500 mb-1">Negotiation</label>
          <select value={filters.negotiation_id} onChange={e => setFilters({ ...filters, negotiation_id: e.target.value })} className="border border-slate-300 rounded px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-[#1B3A6B]">
            <option value="">All</option>
            {negotiations.map(n => <option key={n.id} value={n.id}>{n.bank_name} — {n.property_address}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-xs text-slate-500 mb-1">Method</label>
          <select value={filters.method} onChange={e => setFilters({ ...filters, method: e.target.value })} className="border border-slate-300 rounded px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-[#1B3A6B]">
            <option value="">All</option>
            <option value="certified_mail">Certified Mail</option>
            <option value="fax">Fax</option>
            <option value="email">Email</option>
          </select>
        </div>
        <div>
          <label className="block text-xs text-slate-500 mb-1">Status</label>
          <select value={filters.status} onChange={e => setFilters({ ...filters, status: e.target.value })} className="border border-slate-300 rounded px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-[#1B3A6B]">
            <option value="">All</option>
            {['sent', 'in_transit', 'delivered', 'failed', 'attempted'].map(s => <option key={s} value={s}>{s.replace(/_/g, ' ')}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-xs text-slate-500 mb-1">Start Date</label>
          <input type="date" value={filters.start_date} onChange={e => setFilters({ ...filters, start_date: e.target.value })} className="border border-slate-300 rounded px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-[#1B3A6B]" />
        </div>
        <div>
          <label className="block text-xs text-slate-500 mb-1">End Date</label>
          <input type="date" value={filters.end_date} onChange={e => setFilters({ ...filters, end_date: e.target.value })} className="border border-slate-300 rounded px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-[#1B3A6B]" />
        </div>
      </div>

      {/* Correspondence Table */}
      {loading ? <div className="bg-white rounded-xl shadow p-8 text-center text-slate-400">Loading...</div> : filtered.length === 0 ? <div className="bg-white rounded-xl shadow p-8 text-center text-slate-400">No correspondence found.</div> : (
        <div className="bg-white rounded-xl shadow overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 border-b"><tr>
              {['Date', 'Bank', 'Property', 'Recipient', 'Method', 'Letter #', 'Status', 'Tracking', 'Actions'].map(h => <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase">{h}</th>)}
            </tr></thead>
            <tbody>{filtered.sort((a, b) => new Date(b.sent_date).getTime() - new Date(a.sent_date).getTime()).map((c: any) => (
              <tr key={c.id} className="border-b last:border-0 hover:bg-slate-50">
                <td className="px-4 py-3 text-slate-600 whitespace-nowrap">{new Date(c.sent_date).toLocaleDateString()}</td>
                <td className="px-4 py-3 text-slate-800">{c.bank_name}</td>
                <td className="px-4 py-3 text-slate-600">{c.property_address}</td>
                <td className="px-4 py-3 text-slate-600">{c.recipient_name}</td>
                <td className="px-4 py-3 text-slate-600 whitespace-nowrap">{METHOD_ICON[c.method] || ''} {METHOD_LABEL[c.method] || c.method}</td>
                <td className="px-4 py-3"><span className="px-2 py-0.5 text-xs font-semibold rounded bg-[#1B3A6B] text-white">Letter {c.letter_number}</span></td>
                <td className="px-4 py-3"><span className={`px-2 py-0.5 text-xs font-semibold rounded-full ${STATUS_STYLE[c.status] || 'bg-gray-100 text-gray-600'}`}>{(c.status || '').replace(/_/g, ' ')}{STATUS_SUFFIX[c.status] || ''}</span></td>
                <td className="px-4 py-3 text-xs text-slate-600">
                  {c.method === 'certified_mail' && c.tracking_number && <a href={`https://tools.usps.com/go/TrackConfirmAction?tLabels=${c.tracking_number}`} target="_blank" rel="noopener noreferrer" className="text-[#1B3A6B] underline">{c.tracking_number}</a>}
                  {c.method === 'fax' && c.fax_sid && <span className="text-slate-500">{c.fax_sid}</span>}
                </td>
                <td className="px-4 py-3">
                  <button onClick={() => handleUpdateTracking(c.negotiation_id, c.id)} className="px-2 py-1 text-xs bg-[#1B3A6B] text-white rounded hover:opacity-90">Refresh</button>
                  {c.last_checked && <p className="text-[10px] text-slate-400 mt-1">Last checked: {new Date(c.last_checked).toLocaleString()}</p>}
                </td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      )}
    </div>
  )
}
