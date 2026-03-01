import { useState, useEffect } from 'react'
import { getNegotiations, getTrackingSummary, refreshAllTracking } from '../../../services/bankNegotiationApi'

const USPS_URL = 'https://tools.usps.com/go/TrackConfirmAction?tLabels='

function overallStatus(tracking: any): { label: string; style: string } {
  if (!tracking || !tracking.recipients?.length) return { label: 'Not Sent', style: 'bg-gray-100 text-gray-600' }
  const statuses = tracking.recipients.flatMap((r: any) => [r.cert_mail?.status, r.signature?.status, r.fax?.status].filter(Boolean))
  if (statuses.length === 0) return { label: 'Not Sent', style: 'bg-gray-100 text-gray-600' }
  if (statuses.some((s: string) => s === 'failed')) return { label: '\u26A0 Action Needed', style: 'bg-red-100 text-[#CC2229]' }
  if (statuses.every((s: string) => s === 'delivered' || s === 'signed')) return { label: '\u2713 All Delivered', style: 'bg-green-100 text-green-800' }
  return { label: 'In Transit', style: 'bg-yellow-100 text-yellow-800' }
}

export default function TrackingTab() {
  const [negotiations, setNegotiations] = useState<any[]>([])
  const [trackingMap, setTrackingMap] = useState<Record<string, any>>({})
  const [lastRefreshed, setLastRefreshed] = useState<Date | null>(null)
  const [refreshing, setRefreshing] = useState(false)
  const [loading, setLoading] = useState(true)
  const [toast, setToast] = useState('')

  useEffect(() => { fetchAll() }, [])

  async function fetchAll() {
    setLoading(true)
    try {
      const negs = await getNegotiations() as any
      const negList: any[] = Array.isArray(negs) ? negs : negs.negotiations || []
      setNegotiations(negList)
      const map: Record<string, any> = {}
      for (const n of negList) {
        try { map[n.id] = await getTrackingSummary(n.id) } catch { /* skip */ }
      }
      setTrackingMap(map)
    } catch { setNegotiations([]) }
    setLoading(false)
  }

  async function handleRefreshAll() {
    setRefreshing(true)
    try {
      await refreshAllTracking()
      setLastRefreshed(new Date())
      await fetchAll()
      setToast('Tracking refreshed'); setTimeout(() => setToast(''), 4000)
    } catch { setToast('Failed to refresh tracking'); setTimeout(() => setToast(''), 4000) }
    setRefreshing(false)
  }

  const allStatuses = negotiations.map(n => overallStatus(trackingMap[n.id]))
  const stats = {
    active: allStatuses.filter(s => s.label !== 'Not Sent').length,
    delivered: allStatuses.filter(s => s.label.includes('Delivered')).length,
    inTransit: allStatuses.filter(s => s.label === 'In Transit').length,
    action: allStatuses.filter(s => s.label.includes('Action')).length,
  }

  if (loading) return <div className="bg-white rounded-xl shadow p-8 text-center text-slate-400">Loading...</div>

  return (
    <div className="space-y-4">
      {toast && <div className="fixed top-4 right-4 z-50 bg-[#1B3A6B] text-white px-4 py-2 rounded-lg shadow-lg text-sm">{toast}</div>}

      {/* Header Row */}
      <div className="bg-white rounded-xl shadow p-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-4">
          {[{ label: 'Tracking Active', value: stats.active, color: 'text-[#1B3A6B]' }, { label: 'All Delivered', value: stats.delivered, color: 'text-green-600' }, { label: 'In Transit', value: stats.inTransit, color: 'text-yellow-600' }, { label: 'Action Needed', value: stats.action, color: 'text-[#CC2229]' }].map(s => (
            <div key={s.label} className="text-center">
              <p className={`text-xl font-bold ${s.color}`}>{s.value}</p>
              <p className="text-xs text-slate-500">{s.label}</p>
            </div>
          ))}
        </div>
        <div className="text-right">
          <button onClick={handleRefreshAll} disabled={refreshing} className="px-4 py-2 bg-[#1B3A6B] text-white text-sm font-medium rounded-lg hover:opacity-90 disabled:opacity-50">{refreshing ? 'Refreshing...' : 'Refresh All'}</button>
          {lastRefreshed && <p className="text-[10px] text-slate-400 mt-1">Last refreshed: {lastRefreshed.toLocaleString()}</p>}
        </div>
      </div>

      {/* Per-Negotiation Cards */}
      {negotiations.length === 0 ? <div className="bg-white rounded-xl shadow p-8 text-center text-slate-400">No negotiations to track.</div> : negotiations.map(neg => {
        const tracking = trackingMap[neg.id]
        const status = overallStatus(tracking)
        const recipients = tracking?.recipients || []
        return (
          <div key={neg.id} className="bg-white rounded-xl shadow overflow-hidden">
            <div className="px-4 py-3 border-b flex items-center justify-between">
              <div>
                <p className="font-semibold text-slate-800">{neg.bank_name}</p>
                <p className="text-xs text-slate-500">{neg.property_address}</p>
              </div>
              <span className={`px-2 py-0.5 text-xs font-semibold rounded-full ${status.style}`}>{status.label}</span>
            </div>

            {recipients.length > 0 && (
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead className="bg-slate-50 border-b"><tr>
                    {['Recipient', 'Cert Mail', 'Signature', 'Fax'].map(h => <th key={h} className="text-left px-4 py-2 font-semibold text-slate-500 uppercase">{h}</th>)}
                  </tr></thead>
                  <tbody>{recipients.map((rec: any, i: number) => (
                    <tr key={i} className="border-b last:border-0">
                      <td className="px-4 py-2 text-slate-800 font-medium">{rec.recipient_type || rec.name}</td>
                      <td className="px-4 py-2">
                        {rec.cert_mail?.tracking_number ? (<>
                          <a href={`${USPS_URL}${rec.cert_mail.tracking_number}`} target="_blank" rel="noopener noreferrer" className="text-[#1B3A6B] underline block">{rec.cert_mail.tracking_number}</a>
                          <span className={`inline-block px-1.5 py-0.5 rounded mt-0.5 ${rec.cert_mail.status === 'delivered' || rec.cert_mail.status === 'signed' ? 'bg-green-100 text-green-800' : 'bg-yellow-100 text-yellow-800'}`}>{rec.cert_mail.status}</span>
                          {rec.cert_mail.delivered_date && <p className="text-green-600">{'\u2713'} {new Date(rec.cert_mail.delivered_date).toLocaleDateString()}</p>}
                          {rec.cert_mail.signed_by && <p className="text-green-600">Signed: {rec.cert_mail.signed_by}</p>}
                        </>) : <span className="text-slate-300">—</span>}
                      </td>
                      <td className="px-4 py-2">
                        {rec.signature?.tracking_number ? (<>
                          <a href={`${USPS_URL}${rec.signature.tracking_number}`} target="_blank" rel="noopener noreferrer" className="text-[#1B3A6B] underline block">{rec.signature.tracking_number}</a>
                          <span className={`inline-block px-1.5 py-0.5 rounded mt-0.5 ${rec.signature.status === 'delivered' || rec.signature.status === 'signed' ? 'bg-green-100 text-green-800' : 'bg-yellow-100 text-yellow-800'}`}>{rec.signature.status}</span>
                        </>) : <span className="text-slate-300">—</span>}
                      </td>
                      <td className="px-4 py-2">
                        {rec.fax?.status ? (<>
                          <span className={`inline-block px-1.5 py-0.5 rounded ${rec.fax.status === 'delivered' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-[#CC2229]'}`}>{rec.fax.status === 'delivered' ? '\u2713 Delivered' : '\u2717 Failed'}</span>
                          {rec.fax.status === 'delivered' && rec.fax.pages && <p className="text-slate-500 mt-0.5">{rec.fax.pages} pages</p>}
                        </>) : <span className="text-slate-300">—</span>}
                      </td>
                    </tr>
                  ))}</tbody>
                </table>
              </div>
            )}

            {/* Letter Series Row */}
            {tracking?.letters && (
              <div className="px-4 py-2 bg-slate-50 border-t flex flex-wrap gap-4 text-xs text-slate-600">
                {[1, 2, 3].map(num => {
                  const letter = tracking.letters?.[num]
                  return <span key={num}><strong>Letter {num}:</strong> {letter?.sent_date ? new Date(letter.sent_date).toLocaleDateString() : letter?.scheduled ? `Scheduled ${new Date(letter.scheduled).toLocaleDateString()}` : '—'}</span>
                })}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
