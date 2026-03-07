import { useState, useEffect, useRef, type FormEvent } from 'react'
import {
  getNegotiationsByProperty, createNegotiation, getRecipients, getCorrespondence,
  sendToAll, refreshRecipient, updateRecipient, refreshAllTracking, getDocuments, createDocument,
  getNotes, createNote, deleteNote, deleteNegotiation,
} from '../../../services/bankNegotiationApi'

interface Props {
  isSuperAdmin: boolean
  preSelectedProperty?: string | null
  autoAddLender?: boolean
}

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

const LOAN_TYPE_BADGE: Record<string, string> = {
  '1st': 'bg-[#1B3A6B] text-white',
  '2nd': 'bg-blue-500 text-white',
  'HELOC': 'bg-teal-600 text-white',
  'HOA': 'bg-orange-500 text-white',
  'Tax': 'bg-[#CC2229] text-white',
  'Other': 'bg-gray-500 text-white',
}

// Display-friendly labels for snake_case values from the backend
const NEGOTIATION_TYPE_LABEL: Record<string, string> = {
  short_sale: 'Short Sale', loan_modification: 'Loan Modification',
  deed_in_lieu: 'Deed in Lieu', payoff: 'Payoff', other: 'Other',
}
const RECIPIENT_TYPE_LABEL: Record<string, string> = {
  ceo: 'CEO', general_counsel: 'General Counsel',
  registered_agent: 'Registered Agent', respa_address: 'RESPA Address',
  loss_mitigation: 'Loss Mitigation', collections: 'Collections',
}
function formatLabel(raw: string, labelMap?: Record<string, string>): string {
  if (labelMap && labelMap[raw]) return labelMap[raw]
  return raw.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
}

const LETTER_TYPES: Record<number, string> = { 1: 'Initial', 2: 'Follow-up', 3: 'Final Demand' }
const CONFIDENCE_DOT: Record<string, string> = { high: 'bg-green-500', medium: 'bg-yellow-500', low: 'bg-red-500' }
const DOCUMENT_TYPE_BADGE: Record<string, string> = {
  hardship_letter: 'bg-purple-100 text-purple-800',
  qwr: 'bg-indigo-100 text-indigo-800',
  dispute_letter: 'bg-pink-100 text-pink-800',
  authorization: 'bg-cyan-100 text-cyan-800',
  bank_statement: 'bg-amber-100 text-amber-800',
  other: 'bg-gray-100 text-gray-800',
}

function formatFollowUp(dateStr: string | null | undefined) {
  if (!dateStr) return { text: '\u2014', color: 'text-slate-400' }
  const d = new Date(dateStr)
  const now = new Date()
  now.setHours(0, 0, 0, 0)
  const diff = d.getTime() - now.getTime()
  const days = Math.ceil(diff / 86400000)
  if (days < 0) return { text: 'Overdue', color: 'text-[#CC2229] font-semibold' }
  if (days <= 1) return { text: d.toLocaleDateString(), color: 'text-orange-600 font-semibold' }
  return { text: d.toLocaleDateString(), color: 'text-slate-500' }
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export default function NegotiationsTab({ isSuperAdmin: _isSuperAdmin, preSelectedProperty, autoAddLender }: Props) {
  const [properties, setProperties] = useState<any[]>([])
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({})
  const [selectedNeg, setSelectedNeg] = useState<any>(null)
  const [showDetailPanel, setShowDetailPanel] = useState(false)
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [prefillAddress, setPrefillAddress] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [toast, setToast] = useState('')
  const [recipients, setRecipients] = useState<any[]>([])
  const [correspondence, setCorrespondence] = useState<any[]>([])
  const [documents, setDocuments] = useState<any[]>([])
  const [editingRecipient, setEditingRecipient] = useState<string | null>(null)
  const [editForm, setEditForm] = useState<Record<string, string>>({})
  const [sendLetterNum, setSendLetterNum] = useState(1)
  const [sendMethods, setSendMethods] = useState({ certifiedMail: true, fax: false, email: false })
  const [emailSubject, setEmailSubject] = useState('')
  const [emailBody, setEmailBody] = useState('')
  const [trackingNums, setTrackingNums] = useState<Record<string, string>>({})
  const [sigCardNums, setSigCardNums] = useState<Record<string, string>>({})
  const [faxPdfUrl, setFaxPdfUrl] = useState('')
  const [showUploadForm, setShowUploadForm] = useState(false)
  const [newDocName, setNewDocName] = useState('')
  const [newDocType, setNewDocType] = useState('hardship_letter')
  const [newDocNotes, setNewDocNotes] = useState('')
  const [sendResults, setSendResults] = useState<any>(null)
  const [sending, setSending] = useState(false)
  const [form, setForm] = useState({
    bank_name: '', property_address: '', city: '', state: '', zip: '',
    loan_number: '', current_balance: '', negotiation_type: 'Short Sale',
    our_offer: '', target_outcome: '', land_trust_id: '', notes: '',
  })
  const [creating, setCreating] = useState(false)
  const [notes, setNotes] = useState<any[]>([])
  const [newNote, setNewNote] = useState('')
  const propertyRefs = useRef<Record<string, HTMLDivElement | null>>({})
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)
  const initializedRef = useRef(false)

  useEffect(() => { fetchProperties() }, [])

  // Handle preSelectedProperty and autoAddLender after data loads
  useEffect(() => {
    if (initializedRef.current || loading || properties.length === 0) return
    if (preSelectedProperty) {
      initializedRef.current = true
      // Expand the target property and scroll to it
      setCollapsed(prev => ({ ...prev, [preSelectedProperty]: false }))
      setTimeout(() => {
        const el = propertyRefs.current[preSelectedProperty]
        if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' })
      }, 100)
      if (autoAddLender) {
        setPrefillAddress(preSelectedProperty)
        setForm(prev => ({ ...prev, property_address: preSelectedProperty }))
        setShowCreateModal(true)
      }
    }
  }, [loading, properties, preSelectedProperty, autoAddLender])

  async function fetchProperties() {
    setLoading(true)
    try {
      const data = await getNegotiationsByProperty() as any
      const list = Array.isArray(data) ? data : data.properties || []
      setProperties(list)
    } catch { setProperties([]) }
    setLoading(false)
  }

  async function openDetail(neg: any) {
    setSelectedNeg(neg); setShowDetailPanel(true); setSendResults(null)
    setSendLetterNum(1); setSendMethods({ certifiedMail: true, fax: false, email: false })
    setEmailSubject(''); setEmailBody('')
    setTrackingNums({}); setSigCardNums({}); setFaxPdfUrl(''); setEditingRecipient(null)
    setShowUploadForm(false); setNewDocName(''); setNewDocType('hardship_letter'); setNewDocNotes('')
    try { const r = await getRecipients(neg.id) as any; setRecipients(Array.isArray(r) ? r : r.recipients || []) } catch { setRecipients([]) }
    try { const c = await getCorrespondence(neg.id) as any; setCorrespondence(Array.isArray(c) ? c : c.correspondence || []) } catch { setCorrespondence([]) }
    try { const d = await getDocuments(neg.id) as any; setDocuments(Array.isArray(d) ? d : d.documents || []) } catch { setDocuments([]) }
    try { const n = await getNotes(neg.id) as any; setNotes(Array.isArray(n) ? n : []) } catch { setNotes([]) }
  }

  async function handleCreate(e: FormEvent) {
    e.preventDefault(); setCreating(true)
    const typeMap: Record<string, string> = { 'Short Sale': 'short_sale', 'Loan Modification': 'loan_modification', 'Deed in Lieu': 'deed_in_lieu', 'Payoff': 'payoff', 'Other': 'other' }
    try {
      await createNegotiation({ bank_name: form.bank_name, property_address: form.property_address, property_city: form.city, property_state: form.state, property_zip: form.zip, loan_number: form.loan_number || undefined, loan_balance: form.current_balance ? parseFloat(form.current_balance) : undefined, negotiation_type: typeMap[form.negotiation_type] || form.negotiation_type.toLowerCase().replace(/ /g, '_'), our_offer: form.our_offer ? parseFloat(form.our_offer) : undefined, target_outcome: form.target_outcome || undefined, land_trust_id: form.land_trust_id || undefined, notes: form.notes || undefined })
      showToastMsg('Created. AI researching bank contacts now.')
      setShowCreateModal(false)
      setPrefillAddress(null)
      setForm({ bank_name: '', property_address: '', city: '', state: '', zip: '', loan_number: '', current_balance: '', negotiation_type: 'Short Sale', our_offer: '', target_outcome: '', land_trust_id: '', notes: '' })
      fetchProperties()
    } catch { showToastMsg('Failed to create negotiation') }
    setCreating(false)
  }

  async function handleSendToAll() {
    if (!selectedNeg) return; setSending(true); setSendResults(null)
    try {
      const methods: string[] = []
      if (sendMethods.certifiedMail) methods.push('certified_mail')
      if (sendMethods.fax) methods.push('fax')
      if (sendMethods.email) methods.push('email')
      const firstDoc = documents.length > 0 ? documents[0].id : undefined
      const payload: Record<string, any> = { letter_number: sendLetterNum, letter_type: LETTER_TYPES[sendLetterNum], send_methods: methods, document_id: firstDoc || undefined, usps_tracking_numbers: sendMethods.certifiedMail ? trackingNums : undefined, usps_signature_tracking_numbers: sendMethods.certifiedMail ? sigCardNums : undefined, fax_media_url: sendMethods.fax ? faxPdfUrl : undefined }
      const res = await sendToAll(selectedNeg.id, payload) as any; setSendResults(res); showToastMsg('Documents sent successfully')
      const c = await getCorrespondence(selectedNeg.id) as any; setCorrespondence(Array.isArray(c) ? c : c.correspondence || [])
    } catch { showToastMsg('Failed to send documents') }
    setSending(false)
  }

  async function handleRefreshRecipient(recId: string) {
    if (!selectedNeg) return
    try { await refreshRecipient(selectedNeg.id, recId); const r = await getRecipients(selectedNeg.id) as any; setRecipients(Array.isArray(r) ? r : r.recipients || []); showToastMsg('Re-research started') } catch { showToastMsg('Failed to refresh recipient') }
  }

  async function handleSaveRecipient(recId: string, markVerified = false) {
    if (!selectedNeg) return
    try {
      await updateRecipient(selectedNeg.id, recId, markVerified ? { ...editForm, manually_verified: true } : editForm)
      const r = await getRecipients(selectedNeg.id) as any; setRecipients(Array.isArray(r) ? r : r.recipients || []); setEditingRecipient(null)
      showToastMsg(markVerified ? 'Recipient verified' : 'Recipient updated')
    } catch { showToastMsg('Failed to update recipient') }
  }

  async function handleRefreshAllTracking() {
    try {
      await refreshAllTracking()
      if (selectedNeg) { const c = await getCorrespondence(selectedNeg.id) as any; setCorrespondence(Array.isArray(c) ? c : c.correspondence || []) }
      showToastMsg('Tracking refreshed')
    } catch { showToastMsg('Failed to refresh tracking') }
  }

  async function loadDocuments() {
    if (!selectedNeg) return
    try { const d = await getDocuments(selectedNeg.id) as any; setDocuments(Array.isArray(d) ? d : d.documents || []) } catch { showToastMsg('Failed to load documents') }
  }

  async function handleCreateDocument() {
    if (!selectedNeg || !newDocName || !newDocType) { showToastMsg('Please fill in all fields'); return }
    try {
      const payload: Record<string, any> = { document_name: newDocName, document_type: newDocType }
      if (newDocNotes) payload.notes = newDocNotes
      await createDocument(selectedNeg.id, payload)
      showToastMsg('Document added successfully')
      setNewDocName(''); setNewDocType('hardship_letter'); setNewDocNotes(''); setShowUploadForm(false)
      await loadDocuments()
    } catch { showToastMsg('Failed to create document') }
  }

  async function handleAddNote() {
    if (!selectedNeg || !newNote.trim()) return
    try {
      await createNote(selectedNeg.id, newNote.trim())
      setNewNote('')
      const n = await getNotes(selectedNeg.id) as any
      setNotes(Array.isArray(n) ? n : [])
    } catch { showToastMsg('Failed to add note') }
  }

  async function handleDeleteNote(noteId: string) {
    if (!selectedNeg) return
    try {
      await deleteNote(selectedNeg.id, noteId)
      setNotes(prev => prev.filter((n: any) => n.id !== noteId))
    } catch { showToastMsg('Failed to delete note') }
  }

  async function handleDeleteNegotiation(negId: string) {
    try {
      await deleteNegotiation(negId)
      showToastMsg('Negotiation deleted')
      setShowDetailPanel(false)
      setSelectedNeg(null)
      setConfirmDeleteId(null)
      fetchProperties()
    } catch { showToastMsg('Failed to delete negotiation') }
  }

  function showToastMsg(msg: string) { setToast(msg); setTimeout(() => setToast(''), 4000) }

  function toggleCollapse(addr: string) {
    setCollapsed(prev => ({ ...prev, [addr]: !prev[addr] }))
  }

  function openAddLender(propertyAddress: string) {
    const prop = properties.find((p: any) => p.property_address === propertyAddress)
    setPrefillAddress(propertyAddress)
    setForm(prev => ({
      ...prev,
      bank_name: '', loan_number: '', current_balance: '', negotiation_type: 'Short Sale',
      our_offer: '', target_outcome: '', land_trust_id: '', notes: '',
      property_address: propertyAddress,
      city: prop?.property_city || prev.city,
      state: prop?.property_state || prev.state,
      zip: prop?.property_zip || prev.zip,
    }))
    setShowCreateModal(true)
  }

  function getPropertySummary(prop: any) {
    const lenders = prop.lenders || prop.negotiations || []
    const total = lenders.length
    const active = lenders.filter((n: any) => n.status === 'active' || n.status === 'pending_response').length
    const approved = lenders.filter((n: any) => n.status === 'approved').length
    const denied = lenders.filter((n: any) => n.status === 'denied').length
    let summaryColor = 'bg-blue-100 text-blue-800'
    if (total > 0 && approved === total) summaryColor = 'bg-green-100 text-green-800'
    else if (denied > 0) summaryColor = 'bg-red-100 text-[#CC2229]'
    return { total, active, approved, denied, summaryColor }
  }

  // Aggregate stats across all properties
  const allNegs = properties.flatMap((p: any) => p.lenders || p.negotiations || [])
  const stats = {
    total: allNegs.length,
    active: allNegs.filter((n: any) => n.status === 'active').length,
    approved: allNegs.filter((n: any) => n.status === 'approved').length,
    pending: allNegs.filter((n: any) => n.status === 'pending_response').length,
  }

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
        <button onClick={() => { setPrefillAddress(null); setForm(prev => ({ ...prev, property_address: '' })); setShowCreateModal(true) }} className="px-4 py-2 bg-[#1B3A6B] text-white text-sm font-medium rounded-lg hover:opacity-90">+ Add New Property</button>
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

      {/* Property Cards */}
      {loading ? <div className="bg-white rounded-xl shadow p-8 text-center text-slate-400">Loading...</div> : properties.length === 0 ? <div className="bg-white rounded-xl shadow p-8 text-center text-slate-400">No negotiations yet. Add your first property above.</div> : (
        <div className="space-y-4">
          {properties.map((prop: any) => {
            const addr = prop.property_address || ''
            const summary = getPropertySummary(prop)
            const isCollapsed = collapsed[addr] === true
            const lenders = prop.lenders || prop.negotiations || []
            return (
              <div key={addr} ref={el => { propertyRefs.current[addr] = el }} className="bg-white rounded-xl shadow overflow-hidden">
                {/* Property Card Header */}
                <div
                  className="bg-[#1B3A6B] px-5 py-4 cursor-pointer select-none flex items-center justify-between"
                  onClick={() => toggleCollapse(addr)}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <span className="text-white text-lg shrink-0">{isCollapsed ? '\u25B6' : '\u25BC'}</span>
                    <div className="min-w-0">
                      <p className="text-white font-semibold truncate">{'\uD83D\uDCCD'} {addr}</p>
                      <p className="text-blue-200 text-sm truncate">
                        {[prop.property_city, prop.property_state, prop.property_zip].filter(Boolean).join(', ') || '\u00A0'}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    <div className="text-right">
                      <span className={`inline-block px-2.5 py-1 text-xs font-semibold rounded-full ${summary.summaryColor}`}>
                        {summary.total} Lender{summary.total !== 1 ? 's' : ''}
                      </span>
                      <div className="flex gap-1.5 mt-1 justify-end">
                        {summary.active > 0 && <span className="px-1.5 py-0.5 text-[10px] font-medium rounded bg-blue-100 text-blue-800">{summary.active} Active</span>}
                        {summary.approved > 0 && <span className="px-1.5 py-0.5 text-[10px] font-medium rounded bg-green-100 text-green-800">{summary.approved} Approved</span>}
                        {summary.denied > 0 && <span className="px-1.5 py-0.5 text-[10px] font-medium rounded bg-red-100 text-[#CC2229]">{summary.denied} Denied</span>}
                      </div>
                    </div>
                    <button
                      onClick={e => { e.stopPropagation(); openAddLender(addr) }}
                      className="px-3 py-1.5 text-xs font-medium bg-white/20 text-white rounded hover:bg-white/30 whitespace-nowrap"
                    >
                      + Add Lender
                    </button>
                  </div>
                </div>

                {/* Property Card Body — Lender Rows */}
                {!isCollapsed && (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead className="bg-slate-50 border-b"><tr>
                        {['Bank/Servicer', 'Loan Type', 'Balance', 'Status', 'Last Letter', 'Next Follow-Up', 'Actions'].map(h => (
                          <th key={h} className="text-left px-4 py-2.5 text-xs font-semibold text-slate-500 uppercase">{h}</th>
                        ))}
                      </tr></thead>
                      <tbody>{lenders.map((n: any) => {
                        const loanTypeRaw = n.loan_type || n.negotiation_type || 'Other'
                        const loanType = formatLabel(loanTypeRaw, NEGOTIATION_TYPE_LABEL)
                        const loanBadge = LOAN_TYPE_BADGE[loanType] || LOAN_TYPE_BADGE[loanTypeRaw] || LOAN_TYPE_BADGE['Other']
                        const lastLetter = n.last_letter_number
                          ? `Letter ${n.last_letter_number} \u2014 ${n.last_letter_date ? new Date(n.last_letter_date).toLocaleDateString() : ''}`
                          : '\u2014'
                        const followUp = formatFollowUp(n.next_followup)
                        return (
                          <tr key={n.id} className="border-b last:border-0 hover:bg-slate-50">
                            <td className="px-4 py-3 text-slate-800 font-medium">{n.bank_name}</td>
                            <td className="px-4 py-3"><span className={`px-2 py-0.5 text-xs font-semibold rounded ${loanBadge}`}>{loanType}</span></td>
                            <td className="px-4 py-3 text-slate-600">{n.current_balance != null ? `$${Number(n.current_balance).toLocaleString()}` : '\u2014'}</td>
                            <td className="px-4 py-3"><span className={`px-2 py-0.5 text-xs font-semibold rounded-full ${STATUS_BADGE[n.status] || 'bg-gray-100 text-gray-600'}`}>{(n.status || '').replace(/_/g, ' ')}</span></td>
                            <td className="px-4 py-3 text-slate-600 text-xs">{lastLetter}</td>
                            <td className="px-4 py-3"><span className={`text-xs ${followUp.color}`}>{followUp.text}</span></td>
                            <td className="px-4 py-3"><button onClick={() => openDetail(n)} className="px-3 py-1 text-xs bg-[#1B3A6B] text-white rounded hover:opacity-90">View</button></td>
                          </tr>
                        )
                      })}</tbody>
                    </table>
                    {lenders.length === 0 && (
                      <p className="text-sm text-slate-400 text-center py-6">No lenders yet for this property.</p>
                    )}
                  </div>
                )}
              </div>
            )
          })}
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
            <div className="flex items-center gap-2 shrink-0">
              <span className={`px-2 py-0.5 text-xs font-semibold rounded-full ${STATUS_BADGE[selectedNeg.status] || 'bg-gray-100 text-gray-600'}`}>{(selectedNeg.status || '').replace(/_/g, ' ')}</span>
              {confirmDeleteId === selectedNeg.id ? (
                <div className="flex items-center gap-1">
                  <span className="text-xs text-[#CC2229]">Delete?</span>
                  <button onClick={() => handleDeleteNegotiation(selectedNeg.id)} className="px-2 py-0.5 text-xs bg-[#CC2229] text-white rounded hover:opacity-90">Yes</button>
                  <button onClick={() => setConfirmDeleteId(null)} className="px-2 py-0.5 text-xs text-slate-500 hover:text-slate-700">No</button>
                </div>
              ) : (
                <button onClick={() => setConfirmDeleteId(selectedNeg.id)} className="px-2 py-1 text-xs text-[#CC2229] border border-[#CC2229] rounded hover:bg-red-50" title="Delete this negotiation">Delete</button>
              )}
            </div>
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
              {recipients.length === 0 && (
                <div className="flex items-center gap-2 py-3 px-4 bg-blue-50 rounded-lg border border-blue-200 mb-3">
                  <div className="w-4 h-4 border-2 border-[#1B3A6B] border-t-transparent rounded-full animate-spin" />
                  <span className="text-sm text-slate-600">AI is researching bank contacts. This may take a minute — try refreshing.</span>
                  <button onClick={() => openDetail(selectedNeg)} className="ml-auto px-2 py-1 text-xs bg-[#1B3A6B] text-white rounded hover:opacity-90">Refresh</button>
                </div>
              )}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">{recipients.map((rec: any) => (
                <div key={rec.id} className="border border-slate-200 rounded-lg p-3 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="px-2 py-0.5 text-xs font-semibold rounded bg-[#1B3A6B] text-white">{formatLabel(rec.recipient_type, RECIPIENT_TYPE_LABEL)}</span>
                    <div className="flex items-center gap-1">
                      {rec.ai_confidence && <span className="flex items-center gap-1 text-xs text-slate-500"><span className={`w-2 h-2 rounded-full inline-block ${CONFIDENCE_DOT[rec.ai_confidence] || 'bg-gray-400'}`} />{rec.ai_confidence}</span>}
                      {rec.manually_verified && <span className="text-xs text-green-600 font-medium">&#10003; Verified</span>}
                    </div>
                  </div>
                  {!rec.ai_researched && !rec.name ? (
                    <div className="flex items-center gap-2 py-2">
                      <div className="w-4 h-4 border-2 border-[#1B3A6B] border-t-transparent rounded-full animate-spin" />
                      <span className="text-xs text-slate-500">AI researching...</span>
                    </div>
                  ) : editingRecipient === rec.id ? (
                    <div className="space-y-2">
                      {['name', 'title'].map(f => <input key={f} placeholder={f.charAt(0).toUpperCase() + f.slice(1)} value={editForm[f] || ''} onChange={e => setEditForm({ ...editForm, [f]: e.target.value })} className="w-full border border-slate-300 rounded px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-[#1B3A6B]" />)}
                      <input placeholder="Street Address" value={editForm.mailing_address || ''} onChange={e => setEditForm({ ...editForm, mailing_address: e.target.value })} className="w-full border border-slate-300 rounded px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-[#1B3A6B]" />
                      <div className="grid grid-cols-3 gap-1">
                        <input placeholder="City" value={editForm.mailing_city || ''} onChange={e => setEditForm({ ...editForm, mailing_city: e.target.value })} className="border border-slate-300 rounded px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-[#1B3A6B]" />
                        <input placeholder="State" value={editForm.mailing_state || ''} onChange={e => setEditForm({ ...editForm, mailing_state: e.target.value })} className="border border-slate-300 rounded px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-[#1B3A6B]" />
                        <input placeholder="ZIP" value={editForm.mailing_zip || ''} onChange={e => setEditForm({ ...editForm, mailing_zip: e.target.value })} className="border border-slate-300 rounded px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-[#1B3A6B]" />
                      </div>
                      {['phone', 'fax', 'email'].map(f => <input key={f} placeholder={f.charAt(0).toUpperCase() + f.slice(1)} value={editForm[f] || ''} onChange={e => setEditForm({ ...editForm, [f]: e.target.value })} className="w-full border border-slate-300 rounded px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-[#1B3A6B]" />)}
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
                      <button onClick={() => { setEditingRecipient(rec.id); setEditForm({ name: rec.name || '', title: rec.title || '', mailing_address: rec.mailing_address || '', mailing_city: rec.mailing_city || '', mailing_state: rec.mailing_state || '', mailing_zip: rec.mailing_zip || '', phone: rec.phone || '', fax: rec.fax || '', email: rec.email || '' }) }} className="px-2 py-1 text-xs border border-[#1B3A6B] text-[#1B3A6B] rounded hover:bg-slate-50">Edit</button>
                      <button onClick={() => handleRefreshRecipient(rec.id)} className="px-2 py-1 text-xs border border-slate-300 text-slate-600 rounded hover:bg-slate-50">Re-research</button>
                    </div>
                  </>)}
                </div>
              ))}</div>
              <div className="mt-3 bg-yellow-50 border border-yellow-200 rounded-lg p-3">
                <p className="text-xs text-yellow-800 font-semibold">&#9888; Always verify contact info before sending legal documents.</p>
              </div>
            </div>

            {/* Documents */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <h4 className="text-sm font-semibold text-slate-700">Documents</h4>
                <button onClick={() => setShowUploadForm(!showUploadForm)} className="px-3 py-1 text-xs border border-[#1B3A6B] text-[#1B3A6B] rounded hover:bg-slate-50">+ Upload Document</button>
              </div>
              {showUploadForm && (
                <div className="bg-slate-50 border border-slate-200 rounded-lg p-3 mb-3 space-y-2">
                  <input placeholder="Document name" value={newDocName} onChange={e => setNewDocName(e.target.value)} className="w-full border border-slate-300 rounded px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-[#1B3A6B]" />
                  <select value={newDocType} onChange={e => setNewDocType(e.target.value)} className="w-full border border-slate-300 rounded px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-[#1B3A6B]">
                    <option value="hardship_letter">Hardship Letter</option>
                    <option value="qwr">QWR (Qualified Written Request)</option>
                    <option value="dispute_letter">Dispute Letter</option>
                    <option value="authorization">Authorization</option>
                    <option value="bank_statement">Bank Statement</option>
                    <option value="other">Other</option>
                  </select>
                  <textarea placeholder="Notes (optional)" value={newDocNotes} onChange={e => setNewDocNotes(e.target.value)} rows={2} className="w-full border border-slate-300 rounded px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-[#1B3A6B]" />
                  <div className="flex gap-2">
                    <button onClick={handleCreateDocument} className="px-2 py-1 text-xs bg-[#1B3A6B] text-white rounded hover:opacity-90">Save Document</button>
                    <button onClick={() => setShowUploadForm(false)} className="px-2 py-1 text-xs text-slate-500 hover:text-slate-700">Cancel</button>
                  </div>
                </div>
              )}
              {documents.length === 0 ? (
                <p className="text-xs text-slate-400 py-4 text-center">No documents yet.</p>
              ) : (
                <div className="space-y-2">
                  {documents.map((doc: any) => (
                    <div key={doc.id} className="border border-slate-200 rounded-lg p-3 space-y-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className={`px-2 py-0.5 text-xs font-semibold rounded ${DOCUMENT_TYPE_BADGE[doc.document_type] || DOCUMENT_TYPE_BADGE.other}`}>
                          {doc.document_type?.replace(/_/g, ' ').replace(/\b\w/g, (l: string) => l.toUpperCase())}
                        </span>
                        <span className="text-xs font-medium text-slate-800">{doc.document_name}</span>
                      </div>
                      <div className="text-xs text-slate-600 space-y-0.5">
                        {doc.sent_date && <p>Sent: {new Date(doc.sent_date).toLocaleDateString()}</p>}
                        {doc.notes && <p className="text-slate-500 italic">{doc.notes}</p>}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Notes */}
            <div>
              <h4 className="text-sm font-semibold text-slate-700 mb-2">Notes</h4>
              <div className="flex gap-2 mb-3">
                <input
                  placeholder="Add a note..."
                  value={newNote}
                  onChange={e => setNewNote(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter' && newNote.trim()) handleAddNote() }}
                  className="flex-1 border border-slate-300 rounded px-3 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-[#1B3A6B]"
                />
                <button
                  onClick={handleAddNote}
                  disabled={!newNote.trim()}
                  className="px-3 py-1.5 text-xs bg-[#1B3A6B] text-white rounded hover:opacity-90 disabled:opacity-50"
                >Add</button>
              </div>
              {notes.length === 0 ? (
                <p className="text-xs text-slate-400 py-2 text-center">No notes yet.</p>
              ) : (
                <div className="space-y-2 max-h-48 overflow-y-auto">
                  {notes.map((note: any) => (
                    <div key={note.id} className="border border-slate-200 rounded-lg p-3 group">
                      <div className="flex items-start justify-between gap-2">
                        <p className="text-xs text-slate-700 flex-1">{note.content}</p>
                        <button
                          onClick={() => handleDeleteNote(note.id)}
                          className="text-xs text-slate-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity shrink-0"
                          title="Delete note"
                        >&times;</button>
                      </div>
                      <p className="text-[10px] text-slate-400 mt-1">{note.created_at ? new Date(note.created_at).toLocaleString() : ''}</p>
                    </div>
                  ))}
                </div>
              )}
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
                    <label className="text-xs text-slate-500">{formatLabel(rec.recipient_type, RECIPIENT_TYPE_LABEL)}</label>
                    <div className="flex gap-2">
                      <input placeholder="Tracking # 9400..." value={trackingNums[rec.recipient_type] || ''} onChange={e => setTrackingNums({ ...trackingNums, [rec.recipient_type]: e.target.value })} className="flex-1 border border-slate-300 rounded px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-[#1B3A6B]" />
                      <input placeholder="Sig card # 9400..." value={sigCardNums[rec.recipient_type] || ''} onChange={e => setSigCardNums({ ...sigCardNums, [rec.recipient_type]: e.target.value })} className="flex-1 border border-slate-300 rounded px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-[#1B3A6B]" />
                    </div>
                  </div>
                ))}</div>}
                <label className="flex items-center gap-2 text-xs cursor-pointer"><input type="checkbox" checked={sendMethods.fax} onChange={e => setSendMethods({ ...sendMethods, fax: e.target.checked })} className="accent-[#1B3A6B]" />Fax</label>
                {sendMethods.fax && <div className="pl-5"><input placeholder="Publicly accessible PDF URL" value={faxPdfUrl} onChange={e => setFaxPdfUrl(e.target.value)} className="w-full border border-slate-300 rounded px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-[#1B3A6B]" /></div>}
                <label className="flex items-center gap-2 text-xs cursor-pointer"><input type="checkbox" checked={sendMethods.email} onChange={e => setSendMethods({ ...sendMethods, email: e.target.checked })} className="accent-[#1B3A6B]" />Email</label>
                {sendMethods.email && <div className="pl-5 space-y-2"><input placeholder="Email subject" value={emailSubject} onChange={e => setEmailSubject(e.target.value)} className="w-full border border-slate-300 rounded px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-[#1B3A6B]" /><textarea placeholder="Email body" value={emailBody} onChange={e => setEmailBody(e.target.value)} rows={3} className="w-full border border-slate-300 rounded px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-[#1B3A6B]" /></div>}
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
                      <span className="text-xs text-slate-500">{(c.send_method || c.method)?.replace(/_/g, ' ')}</span>
                    </div>
                    {(c.send_method || c.method) === 'certified_mail' && <div className="text-xs text-slate-600 space-y-0.5 pl-2">
                      {(c.usps_tracking_number || c.tracking_number) && <p>Tracking: <a href={`https://tools.usps.com/go/TrackConfirmAction?tLabels=${c.usps_tracking_number || c.tracking_number}`} target="_blank" rel="noopener noreferrer" className="text-[#1B3A6B] underline">{c.usps_tracking_number || c.tracking_number}</a></p>}
                      {(c.usps_signature_tracking_number || c.signature_card) && <p>Sig card: {c.usps_signature_tracking_number || c.signature_card}</p>}
                      <span className={`inline-block px-1.5 py-0.5 rounded ${c.status === 'delivered' || c.status === 'signed' ? 'bg-green-100 text-green-800' : 'bg-yellow-100 text-yellow-800'}`}>{c.status}</span>
                      {(c.usps_delivered_date || c.delivered_date) && <p className="text-green-600">&#10003; Delivered {new Date(c.usps_delivered_date || c.delivered_date).toLocaleDateString()}</p>}
                      {(c.usps_signed_by || c.signed_by) && <p className="text-green-600">Signed by: {c.usps_signed_by || c.signed_by}</p>}
                    </div>}
                    {(c.send_method || c.method) === 'fax' && <div className="text-xs text-slate-600 pl-2">
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
              <h3 className="text-lg font-bold text-slate-800">{prefillAddress ? 'Add Lender / Servicer' : 'Add New Property'}</h3>
              <button onClick={() => setShowCreateModal(false)} className="text-slate-400 hover:text-slate-600 text-xl">&times;</button>
            </div>
            <form onSubmit={handleCreate} className="p-6 space-y-4">
              {prefillAddress ? (
                <div className="bg-slate-50 rounded-lg p-3 border border-slate-200">
                  <p className="text-xs text-slate-500 mb-1">Property</p>
                  <p className="text-sm font-semibold text-slate-800">{form.property_address}</p>
                  <p className="text-xs text-slate-500">{[form.city, form.state, form.zip].filter(Boolean).join(', ')}</p>
                </div>
              ) : (
                <>
                  <div><label className="block text-sm font-medium text-slate-700 mb-1">Property Address *</label><input required value={form.property_address} onChange={e => setForm({ ...form, property_address: e.target.value })} className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1B3A6B]" /></div>
                  <div><label className="block text-sm font-medium text-slate-700 mb-1">City</label><input value={form.city} onChange={e => setForm({ ...form, city: e.target.value })} className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1B3A6B]" /></div>
                  <div className="grid grid-cols-2 gap-3">
                    <div><label className="block text-sm font-medium text-slate-700 mb-1">State</label><select value={form.state} onChange={e => setForm({ ...form, state: e.target.value })} className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1B3A6B]"><option value="">Select state</option>{US_STATES.map(s => <option key={s} value={s}>{s}</option>)}</select></div>
                    <div><label className="block text-sm font-medium text-slate-700 mb-1">ZIP</label><input value={form.zip} onChange={e => setForm({ ...form, zip: e.target.value })} className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1B3A6B]" /></div>
                  </div>
                </>
              )}
              <div><label className="block text-sm font-medium text-slate-700 mb-1">Bank/Servicer Name *</label><input required value={form.bank_name} onChange={e => setForm({ ...form, bank_name: e.target.value })} className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1B3A6B]" /></div>
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
                <button type="submit" disabled={creating} className="px-4 py-2 bg-[#1B3A6B] text-white text-sm font-medium rounded-lg hover:opacity-90 disabled:opacity-50">{creating ? 'Creating...' : prefillAddress ? 'Add Lender' : 'Add Property'}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
