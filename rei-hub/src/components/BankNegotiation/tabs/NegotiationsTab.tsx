import { useState, useEffect, type FormEvent } from 'react'
import {
  getNegotiations, createNegotiation, getRecipients, getCorrespondence,
  sendToAll, refreshRecipient, updateRecipient, refreshAllTracking,
} from '../../../services/bankNegotiationApi'

interface Props { token: string; isSuperAdmin: boolean }

const US_STATES = [
  'AL','AK','AZ','AR','CA','CO','CT','DE','FL','GA','HI','ID','IL','IN','IA',
  'KS','KY','LA','ME','MD','MA','MI','MN','MS','MO','MT','NE','NV','NH','NJ',
  'NM','NY','NC','ND','OH','OK','OR','PA','RI','SC','SD','TN','TX','UT','VT',
  'VA','WA','WV','WI','WY',
]

const STATUS_BADGE: Record<string, string> = {
  active: 'bg-blue-100 text-blue-800',
  pending_response: 'bg-yellow-100 text-yellow-800',
  approved: 'bg-green-100 text-green-800',
  denied: 'bg-red-100 text-red-800',
  completed: 'bg-gray-100 text-gray-600',
}

const LETTER_TYPES: Record<number, string> = { 1: 'Initial', 2: 'Follow-up', 3: 'Final Demand' }
const CONFIDENCE_DOT: Record<string, string> = { high: 'bg-green-500', medium: 'bg-yellow-500', low: 'bg-red-500' }

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export default function NegotiationsTab({ token, isSuperAdmin: _isSuperAdmin }: Props) {
  const [negotiations, setNegotiations] = useState<any[]>([])
  const [selectedNeg, setSelectedNeg] = useState<any>(null)
  const [showDetailPanel, setShowDetailPanel] = useState(false)
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [loading, setLoading] = useState(true)
  const [toast, setToast] = useState('')
  const [recipients, setRecipients] = useState<any[]>([])
  const [correspondence, setCorrespondence] = useState<any[]>([])
  const [editingRecipient, setEditingRecipient] = useState<string | null>(null)
  const [editForm, setEditForm] = useState<Record<string, string>>({})
  const [sendLetterNum, setSendLetterNum] = useState(1)
  const [sendMethods, setSendMethods] = useState({ certifiedMail: true, fax: false })
  const [trackingNums, setTrackingNums] = useState<Record<string, string>>({})
  const [sigCardNums, setSigCardNums] = useState<Record<string, string>>({})
  const [faxPdfUrl, setFaxPdfUrl] = useState('')
  const [sendResults, setSendResults] = useState<any>(null)
  const [sending, setSending] = useState(false)
  const [form, setForm] = useState({
    bank_name: '', property_address: '', city: '', state: '', zip: '',
    loan_number: '', current_balance: '', negotiation_type: 'Short Sale',
    our_offer: '', target_outcome: '', land_trust_id: '', notes: '',
  })
  const [creating, setCreating] = useState(false)

  useEffect(() => { fetchNegotiations() }, [token])

  async function fetchNegotiations() {
    setLoading(true)
    try {
      const data = await getNegotiations(token)
      setNegotiations(Array.isArray(data) ? data : data.negotiations || [])
    } catch { setNegotiations([]) }
    setLoading(false)
  }

  async function openDetail(neg: any) {
    setSelectedNeg(neg); setShowDetailPanel(true); setSendResults(null)
    setSendLetterNum(1); setSendMethods({ certifiedMail: true, fax: false })
    setTrackingNums({}); setSigCardNums({}); setFaxPdfUrl(''); setEditingRecipient(null)
    try { const r = await getRecipients(neg.id, token); setRecipients(Array.isArray(r) ? r : r.recipients || []) } catch { setRecipients([]) }
    try { const c = await getCorrespondence(neg.id, token); setCorrespondence(Array.isArray(c) ? c : c.correspondence || []) } catch { setCorrespondence([]) }
  }

  async function handleCreate(e: FormEvent) {
    e.preventDefault(); setCreating(true)
    try {
      await createNegotiation({ ...form, current_balance: form.current_balance ? parseFloat(form.current_balance) : undefined, our_offer: form.our_offer ? parseFloat(form.our_offer) : undefined, land_trust_id: form.land_trust_id || undefined }, token)
      showToastMsg('Created. AI researching bank contacts now.')
      setShowCreateModal(false)
      setForm({ bank_name: '', property_address: '', city: '', state: '', zip: '', loan_number: '', current_balance: '', negotiation_type: 'Short Sale', our_offer: '', target_outcome: '', land_trust_id: '', notes: '' })
      fetchNegotiations()
    } catch { showToastMsg('Failed to create negotiation') }
    setCreating(false)
  }

  async function handleSendToAll() {
    if (!selectedNeg) return; setSending(true); setSendResults(null)
    try {
      const payload: Record<string, any> = { letter_number: sendLetterNum, letter_type: LETTER_TYPES[sendLetterNum], methods: { certified_mail: sendMethods.certifiedMail ? { tracking_numbers: trackingNums, signature_cards: sigCardNums } : undefined, fax: sendMethods.fax ? { pdf_url: faxPdfUrl } : undefined } }
      const res = await sendToAll(selectedNeg.id, payload, token); setSendResults(res); showToastMsg('Documents sent successfully')
      const c = await getCorrespondence(selectedNeg.id, token); setCorrespondence(Array.isArray(c) ? c : c.correspondence || [])
    } catch { showToastMsg('Failed to send documents') }
    setSending(false)
  }

  async function handleRefreshRecipient(recId: string) {
    if (!selectedNeg) return
    try { await refreshRecipient(selectedNeg.id, recId, token); const r = await getRecipients(selectedNeg.id, token); setRecipients(Array.isArray(r) ? r : r.recipients || []); showToastMsg('Re-research started') } catch { showToastMsg('Failed to refresh recipient') }
  }

  async function handleSaveRecipient(recId: string, markVerified = false) {
    if (!selectedNeg) return
    try {
      await updateRecipient(selectedNeg.id, recId, markVerified ? { ...editForm, manually_verified: true } : editForm, token)
      const r = await getRecipients(selectedNeg.id, token); setRecipients(Array.isArray(r) ? r : r.recipients || []); setEditingRecipient(null)
      showToastMsg(markVerified ? 'Recipient verified' : 'Recipient updated')
    } catch { showToastMsg('Failed to update recipient') }
  }

  async function handleRefreshAllTracking() {
    try {
      await refreshAllTracking(token)
      if (selectedNeg) { const c = await getCorrespondence(selectedNeg.id, token); setCorrespondence(Array.isArray(c) ? c : c.correspondence || []) }
      showToastMsg('Tracking refreshed')
    } catch { showToastMsg('Failed to refresh tracking') }
  }

  function showToastMsg(msg: string) { setToast(msg); setTimeout(() => setToast(''), 4000) }

  const stats = { total: negotiations.length, active: negotiations.filter((n: any) => n.status === 'active').length, approved: negotiations.filter((n: any) => n.status === 'approved').length, pending: negotiations.filter((n: any) => n.status === 'pending_response').length }

  function letterStatus(num: number) {
    const letters = correspondence.filter((c: any) => c.letter_number === num)
    const sent = letters.length > 0
    return { sent, sentDate: sent ? letters[0]?.sent_date : null, allDelivered: sent && letters.every((c: any) => c.status === 'delivered' || c.status === 'signed'), scheduled: selectedNeg?.[`letter_${num}_scheduled`] || null }
  }

  const sortedCorrespondence = [...correspondence].sort((a, b) => new Date(b.sent_date).getTime() - new Date(a.sent_date).getTime())

  return (
    <div className="space-y-4">
      {toast && <div className="fixed top-4 right-4 z-50 bg-[#1B3A6B] text-white px-4 py-2 rounded-lg shadow-lg text-sm">{toast}</div>}

      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold text-slate-800">Negotiations</h2>
        <button onClick={() => setShowCreateModal(true)} className="px-4 py-2 bg-[#1B3A6B] text-white text-sm font-medium rounded-lg hover:opacity-90">+ New Negotiation</button>
      </div>

      {/* Stats Row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[{ label: 'Total', value: stats.total, color: 'text-slate-800' }, { label: 'Active', value: stats.active, color: 'text-[#1B3A6B]' }, { label: 'Approved', value: stats.approved, color: 'text-green-600' }, { label: 'Pending Response', value: stats.pending, color: 'text-yellow-600' }].map(s => (
          <div key={s.label} className="bg-white rounded-xl shadow p-4">
            <p className="text-xs text-slate-500">{s.label}</p>
            <p className={`text-2xl font-bold ${s.color}`}>{s.value}</p>
          </div>
        ))}
      </div>

      {/* Negotiations Table */}
      {loading ? <div className="bg-white rounded-xl shadow p-8 text-center text-slate-400">Loading...</div> : negotiations.length === 0 ? <div className="bg-white rounded-xl shadow p-8 text-center text-slate-400">No negotiations yet. Create your first one above.</div> : (
        <div className="bg-white rounded-xl shadow overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 border-b"><tr>
              {['Bank', 'Property', 'Type', 'Status', 'Recipients Ready', 'Last Contact', 'Actions'].map(h => <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase">{h}</th>)}
            </tr></thead>
            <tbody>{negotiations.map((n: any) => (
              <tr key={n.id} className="border-b last:border-0 hover:bg-slate-50">
                <td className="px-4 py-3 text-slate-800">{n.bank_name}</td>
                <td className="px-4 py-3 text-slate-600">{n.property_address}</td>
                <td className="px-4 py-3 text-slate-600">{n.negotiation_type}</td>
                <td className="px-4 py-3"><span className={`px-2 py-0.5 text-xs font-semibold rounded-full ${STATUS_BADGE[n.status] || 'bg-gray-100 text-gray-600'}`}>{(n.status || '').replace(/_/g, ' ')}</span></td>
                <td className="px-4 py-3 text-slate-600">{n.recipients_ready ?? '—'}</td>
                <td className="px-4 py-3 text-slate-600">{n.last_contact ? new Date(n.last_contact).toLocaleDateString() : '—'}</td>
                <td className="px-4 py-3"><button onClick={() => openDetail(n)} className="px-3 py-1 text-xs bg-[#1B3A6B] text-white rounded hover:opacity-90">View</button></td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      )}

      {/* Detail Panel */}
      {showDetailPanel && selectedNeg && (<>
        <div className="fixed inset-0 z-40 bg-black/20" onClick={() => setShowDetailPanel(false)} />
        <div className="fixed top-0 right-0 z-50 h-full w-full md:w-[700px] bg-white shadow-xl overflow-y-auto">
          <div className="sticky top-0 bg-white border-b px-5 py-4 flex items-center justify-between z-10">
            <div className="flex items-center gap-3 min-w-0">
              <button onClick={() => setShowDetailPanel(false)} className="text-slate-400 hover:text-slate-600 text-xl shrink-0">&times;</button>
              <div className="min-w-0">
                <p className="font-bold text-slate-800 truncate">{selectedNeg.bank_name}</p>
                <p className="text-xs text-slate-500 truncate">{selectedNeg.property_address}</p>
              </div>
            </div>
            <span className={`px-2 py-0.5 text-xs font-semibold rounded-full shrink-0 ${STATUS_BADGE[selectedNeg.status] || 'bg-gray-100 text-gray-600'}`}>{(selectedNeg.status || '').replace(/_/g, ' ')}</span>
          </div>

          <div className="p-5 space-y-6">
            {/* Letter Series Status */}
            <div>
              <h4 className="text-sm font-semibold text-slate-700 mb-2">Letter Series Status</h4>
              <div className="grid grid-cols-3 gap-3">{[1, 2, 3].map(num => { const ls = letterStatus(num); return (
                <div key={num} className="bg-white border border-slate-200 rounded-lg p-3 space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-[#1B3A6B]">Letter {num} of 3</span>
                    {ls.allDelivered && <span className="text-xs text-green-600 font-medium">&#10003; All delivered</span>}
                  </div>
                  <p className="text-xs text-slate-600">{ls.sent ? `Sent: ${new Date(ls.sentDate).toLocaleDateString()}` : 'Not sent'}</p>
                  {num > 1 && ls.scheduled && <p className="text-xs text-slate-500">Scheduled: {new Date(ls.scheduled).toLocaleDateString()}</p>}
                </div>
              ) })}</div>
            </div>

            {/* Recipients */}
            <div>
              <h4 className="text-sm font-semibold text-slate-700 mb-2">{recipients.length} Recipients</h4>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">{recipients.map((rec: any) => (
                <div key={rec.id} className="border border-slate-200 rounded-lg p-3 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="px-2 py-0.5 text-xs font-semibold rounded bg-[#1B3A6B] text-white">{rec.recipient_type}</span>
                    <div className="flex items-center gap-1">
                      {rec.ai_confidence && <span className="flex items-center gap-1 text-xs text-slate-500"><span className={`w-2 h-2 rounded-full inline-block ${CONFIDENCE_DOT[rec.ai_confidence] || 'bg-gray-400'}`} />{rec.ai_confidence}</span>}
                      {rec.manually_verified && <span className="text-xs text-green-600 font-medium">&#10003; Verified</span>}
                    </div>
                  </div>
                  {!rec.researched && !rec.name ? (
                    <div className="flex items-center gap-2 py-2">
                      <div className="w-4 h-4 border-2 border-[#1B3A6B] border-t-transparent rounded-full animate-spin" />
                      <span className="text-xs text-slate-500">AI researching...</span>
                    </div>
                  ) : editingRecipient === rec.id ? (
                    <div className="space-y-2">
                      {['name', 'title', 'address', 'phone', 'fax', 'email'].map(f => <input key={f} placeholder={f.charAt(0).toUpperCase() + f.slice(1)} value={editForm[f] || ''} onChange={e => setEditForm({ ...editForm, [f]: e.target.value })} className="w-full border border-slate-300 rounded px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-[#1B3A6B]" />)}
                      <div className="flex gap-2">
                        <button onClick={() => handleSaveRecipient(rec.id)} className="px-2 py-1 text-xs bg-[#1B3A6B] text-white rounded hover:opacity-90">Save</button>
                        <button onClick={() => handleSaveRecipient(rec.id, true)} className="px-2 py-1 text-xs bg-green-600 text-white rounded hover:opacity-90">Mark Verified</button>
                        <button onClick={() => setEditingRecipient(null)} className="px-2 py-1 text-xs text-slate-500 hover:text-slate-700">Cancel</button>
                      </div>
                    </div>
                  ) : (<>
                    {rec.name && <p className="text-sm font-medium text-slate-800">{rec.name}{rec.title ? ` — ${rec.title}` : ''}</p>}
                    <div className="text-xs text-slate-600 space-y-0.5">
                      {rec.address && <p>&#128236; {rec.address}</p>}
                      {rec.phone && <p>&#128222; {rec.phone}</p>}
                      {rec.fax && <p>&#128224; {rec.fax}</p>}
                      {rec.email && <p>&#9993;&#65039; {rec.email}</p>}
                    </div>
                    <div className="flex gap-2 pt-1">
                      <button onClick={() => { setEditingRecipient(rec.id); setEditForm({ name: rec.name || '', title: rec.title || '', address: rec.address || '', phone: rec.phone || '', fax: rec.fax || '', email: rec.email || '' }) }} className="px-2 py-1 text-xs border border-[#1B3A6B] text-[#1B3A6B] rounded hover:bg-slate-50">Edit</button>
                      <button onClick={() => handleRefreshRecipient(rec.id)} className="px-2 py-1 text-xs border border-slate-300 text-slate-600 rounded hover:bg-slate-50">Re-research</button>
                    </div>
                  </>)}
                </div>
              ))}</div>
              <div className="mt-3 bg-yellow-50 border border-yellow-200 rounded-lg p-3">
                <p className="text-xs text-yellow-800 font-semibold">&#9888; Always verify contact info before sending legal documents.</p>
              </div>
            </div>

            {/* Send Documents */}
            <div className="bg-slate-50 border border-slate-200 rounded-lg p-4 space-y-3">
              <h4 className="text-sm font-semibold text-slate-700">Send to All {recipients.length} Recipients</h4>
              <div>
                <p className="text-xs text-slate-500 mb-1">Letter Number</p>
                <div className="flex gap-3">{[1, 2, 3].map(num => <label key={num} className="flex items-center gap-1 text-xs cursor-pointer"><input type="radio" name="letterNum" checked={sendLetterNum === num} onChange={() => setSendLetterNum(num)} className="accent-[#1B3A6B]" />Letter {num}</label>)}</div>
                <p className="text-xs text-slate-400 mt-1">Type: {LETTER_TYPES[sendLetterNum]}</p>
              </div>
              <div className="space-y-2">
                <label className="flex items-center gap-2 text-xs cursor-pointer"><input type="checkbox" checked={sendMethods.certifiedMail} onChange={e => setSendMethods({ ...sendMethods, certifiedMail: e.target.checked })} className="accent-[#1B3A6B]" />Certified Mail</label>
                {sendMethods.certifiedMail && <div className="pl-5 space-y-2">{recipients.map((rec: any) => (
                  <div key={rec.id} className="space-y-1">
                    <label className="text-xs text-slate-500">{rec.recipient_type}</label>
                    <div className="flex gap-2">
                      <input placeholder="Tracking # 9400..." value={trackingNums[rec.id] || ''} onChange={e => setTrackingNums({ ...trackingNums, [rec.id]: e.target.value })} className="flex-1 border border-slate-300 rounded px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-[#1B3A6B]" />
                      <input placeholder="Sig card # 9400..." value={sigCardNums[rec.id] || ''} onChange={e => setSigCardNums({ ...sigCardNums, [rec.id]: e.target.value })} className="flex-1 border border-slate-300 rounded px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-[#1B3A6B]" />
                    </div>
                  </div>
                ))}</div>}
                <label className="flex items-center gap-2 text-xs cursor-pointer"><input type="checkbox" checked={sendMethods.fax} onChange={e => setSendMethods({ ...sendMethods, fax: e.target.checked })} className="accent-[#1B3A6B]" />Fax</label>
                {sendMethods.fax && <div className="pl-5"><input placeholder="Publicly accessible PDF URL" value={faxPdfUrl} onChange={e => setFaxPdfUrl(e.target.value)} className="w-full border border-slate-300 rounded px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-[#1B3A6B]" /></div>}
              </div>
              <button onClick={handleSendToAll} disabled={sending} className="w-full px-4 py-2 bg-[#1B3A6B] text-white text-sm font-medium rounded-lg hover:opacity-90 disabled:opacity-50">{sending ? 'Sending...' : `Send to All ${recipients.length} Recipients`}</button>
              {sendResults?.results && <div className="space-y-1">{sendResults.results.map((r: any, i: number) => <div key={i} className="flex items-center gap-2 text-xs"><span className={r.success ? 'text-green-600' : 'text-[#CC2229]'}>{r.success ? '✓' : '✗'}</span><span className="text-slate-600">{r.recipient} — {r.method}</span></div>)}</div>}
            </div>

            {/* Correspondence Log */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <h4 className="text-sm font-semibold text-slate-700">Correspondence Log</h4>
                <button onClick={handleRefreshAllTracking} className="px-3 py-1 text-xs border border-[#1B3A6B] text-[#1B3A6B] rounded hover:bg-slate-50">Refresh All Tracking</button>
              </div>
              {sortedCorrespondence.length === 0 ? <p className="text-xs text-slate-400 py-4 text-center">No correspondence yet.</p> : (
                <div className="space-y-3">{sortedCorrespondence.map((c: any) => (
                  <div key={c.id} className="border border-slate-200 rounded-lg p-3 space-y-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="px-2 py-0.5 text-xs font-semibold rounded bg-[#1B3A6B] text-white">Letter {c.letter_number}</span>
                      <span className="text-xs text-slate-500">{new Date(c.sent_date).toLocaleDateString()}</span>
                      <span className="text-xs text-slate-600">{c.recipient_name}</span>
                      <span className="text-xs text-slate-500">{c.method?.replace(/_/g, ' ')}</span>
                    </div>
                    {c.method === 'certified_mail' && <div className="text-xs text-slate-600 space-y-0.5 pl-2">
                      {c.tracking_number && <p>Tracking: <a href={`https://tools.usps.com/go/TrackConfirmAction?tLabels=${c.tracking_number}`} target="_blank" rel="noopener noreferrer" className="text-[#1B3A6B] underline">{c.tracking_number}</a></p>}
                      {c.signature_card && <p>Sig card: {c.signature_card}</p>}
                      <span className={`inline-block px-1.5 py-0.5 rounded ${c.status === 'delivered' || c.status === 'signed' ? 'bg-green-100 text-green-800' : 'bg-yellow-100 text-yellow-800'}`}>{c.status}</span>
                      {c.delivered_date && <p className="text-green-600">&#10003; Delivered {new Date(c.delivered_date).toLocaleDateString()}</p>}
                      {c.signed_by && <p className="text-green-600">Signed by: {c.signed_by}</p>}
                    </div>}
                    {c.method === 'fax' && <div className="text-xs text-slate-600 pl-2">
                      <span className={`inline-block px-1.5 py-0.5 rounded ${c.status === 'delivered' ? 'bg-green-100 text-green-800' : 'bg-yellow-100 text-yellow-800'}`}>{c.status}</span>
                      {c.pages && <span className="ml-2">Pages: {c.pages}</span>}
                    </div>}
                  </div>
                ))}</div>
              )}
            </div>
          </div>
        </div>
      </>)}

      {/* Create Negotiation Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-lg mx-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between px-6 py-4 border-b">
              <h3 className="text-lg font-bold text-slate-800">New Negotiation</h3>
              <button onClick={() => setShowCreateModal(false)} className="text-slate-400 hover:text-slate-600 text-xl">&times;</button>
            </div>
            <form onSubmit={handleCreate} className="p-6 space-y-4">
              {[{ key: 'bank_name' as const, label: 'Bank/Servicer Name *', req: true }, { key: 'property_address' as const, label: 'Property Address *', req: true }, { key: 'city' as const, label: 'City', req: false }].map(f => (
                <div key={f.key}><label className="block text-sm font-medium text-slate-700 mb-1">{f.label}</label><input required={f.req} value={form[f.key]} onChange={e => setForm({ ...form, [f.key]: e.target.value })} className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1B3A6B]" /></div>
              ))}
              <div className="grid grid-cols-2 gap-3">
                <div><label className="block text-sm font-medium text-slate-700 mb-1">State</label><select value={form.state} onChange={e => setForm({ ...form, state: e.target.value })} className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1B3A6B]"><option value="">Select state</option>{US_STATES.map(s => <option key={s} value={s}>{s}</option>)}</select></div>
                <div><label className="block text-sm font-medium text-slate-700 mb-1">ZIP</label><input value={form.zip} onChange={e => setForm({ ...form, zip: e.target.value })} className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1B3A6B]" /></div>
              </div>
              <div><label className="block text-sm font-medium text-slate-700 mb-1">Loan Number</label><input value={form.loan_number} onChange={e => setForm({ ...form, loan_number: e.target.value })} className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1B3A6B]" /></div>
              <div><label className="block text-sm font-medium text-slate-700 mb-1">Current Balance ($)</label><input type="number" value={form.current_balance} onChange={e => setForm({ ...form, current_balance: e.target.value })} className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1B3A6B]" /></div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Negotiation Type</label>
                <div className="flex flex-wrap gap-3">{['Short Sale', 'Loan Modification', 'Deed in Lieu', 'Payoff', 'Other'].map(t => <label key={t} className="flex items-center gap-1 text-sm cursor-pointer"><input type="radio" name="negType" checked={form.negotiation_type === t} onChange={() => setForm({ ...form, negotiation_type: t })} className="accent-[#1B3A6B]" />{t}</label>)}</div>
              </div>
              <div><label className="block text-sm font-medium text-slate-700 mb-1">Our Offer ($)</label><input type="number" value={form.our_offer} onChange={e => setForm({ ...form, our_offer: e.target.value })} className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1B3A6B]" /></div>
              <div><label className="block text-sm font-medium text-slate-700 mb-1">Target Outcome</label><textarea value={form.target_outcome} onChange={e => setForm({ ...form, target_outcome: e.target.value })} rows={2} className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1B3A6B]" /></div>
              <div><label className="block text-sm font-medium text-slate-700 mb-1">Link to Land Trust (optional)</label><input value={form.land_trust_id} onChange={e => setForm({ ...form, land_trust_id: e.target.value })} className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1B3A6B]" /></div>
              <div><label className="block text-sm font-medium text-slate-700 mb-1">Notes</label><textarea value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} rows={2} className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1B3A6B]" /></div>
              <div className="flex justify-end gap-3 pt-2">
                <button type="button" onClick={() => setShowCreateModal(false)} className="px-4 py-2 text-sm text-slate-600 hover:text-slate-800">Cancel</button>
                <button type="submit" disabled={creating} className="px-4 py-2 bg-[#1B3A6B] text-white text-sm font-medium rounded-lg hover:opacity-90 disabled:opacity-50">{creating ? 'Creating...' : 'Create Negotiation'}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
