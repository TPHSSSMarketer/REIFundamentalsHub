import { useState, useEffect, Fragment, type FormEvent } from 'react'
import {
  getCfds,
  createCfd,
  createDefault,
  getAmortization,
  getProperties,
  recordPayment,
} from '../../../services/loanServicingApi'

interface Props {
  token: string
  isSuperAdmin: boolean
}

const STATUS_BADGE: Record<string, string> = {
  active: 'bg-green-100 text-green-800',
  default: 'bg-red-100 text-red-800',
  paid_off: 'bg-gray-100 text-gray-600',
}

const PAYMENT_METHODS = [
  { value: 'stripe', label: 'Stripe', desc: 'Online card payments' },
  { value: 'ach', label: 'ACH', desc: 'Bank transfer' },
  { value: 'check', label: 'Check', desc: 'Paper check' },
  { value: 'wire', label: 'Wire', desc: 'Wire transfer' },
]

const STEP_LABELS = ['Property', 'Buyer', 'Loan Terms', 'Balloon', 'Underlying Mortgage', 'Payment Method', 'Review']

const ROW_BG: Record<string, string> = {
  paid: 'bg-green-50', late: 'bg-yellow-50', missed: 'bg-red-50',
}

function calcMonthlyPayment(principal: number, annualRate: number, termMonths: number): number {
  if (!principal || !annualRate || !termMonths) return 0
  const r = annualRate / 100 / 12
  if (r === 0) return principal / termMonths
  return (principal * r * Math.pow(1 + r, termMonths)) / (Math.pow(1 + r, termMonths) - 1)
}

type CfdFormKey = 'trust_id' | 'buyer_name' | 'buyer_email' | 'buyer_phone' | 'buyer_address'
  | 'purchase_price' | 'down_payment' | 'interest_rate' | 'term_months' | 'first_payment_date'
  | 'late_fee_amount' | 'late_fee_after_days' | 'balloon_month' | 'balloon_amount'
  | 'servicer' | 'underlying_balance' | 'underlying_payment' | 'underlying_account' | 'payment_method'

const INITIAL_CFD_FORM = {
  trust_id: '', buyer_name: '', buyer_email: '', buyer_phone: '', buyer_address: '',
  purchase_price: '', down_payment: '0', interest_rate: '', term_months: '',
  first_payment_date: '', late_fee_amount: '50', late_fee_after_days: '15',
  has_balloon: false, balloon_month: '', balloon_amount: '',
  has_underlying: false, servicer: '', underlying_balance: '', underlying_payment: '', underlying_account: '',
  payment_method: 'stripe',
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export default function ContractsTab({ token, isSuperAdmin: _isSuperAdmin }: Props) {
  const [cfds, setCfds] = useState<any[]>([])
  const [expandedRow, setExpandedRow] = useState<string | null>(null)
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [showAmortModal, setShowAmortModal] = useState(false)
  const [selectedCfd, setSelectedCfd] = useState<any>(null)
  const [amortSchedule, setAmortSchedule] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [toast, setToast] = useState('')

  // Quick payment
  const [paymentCfd, setPaymentCfd] = useState<any>(null)
  const [paymentAmount, setPaymentAmount] = useState('')
  const [paymentDate, setPaymentDate] = useState(new Date().toISOString().split('T')[0])
  const [recordingPayment, setRecordingPayment] = useState(false)

  // Create modal state
  const [step, setStep] = useState(1)
  const [properties, setProperties] = useState<any[]>([])
  const [creating, setCreating] = useState(false)
  const [confirmDefault, setConfirmDefault] = useState<string | null>(null)
  const [cfdForm, setCfdForm] = useState({ ...INITIAL_CFD_FORM })

  useEffect(() => { fetchCfds() }, [token])

  async function fetchCfds() {
    setLoading(true)
    try {
      const data = await getCfds()
      setCfds(Array.isArray(data) ? data : data.cfds || [])
    } catch { setCfds([]) }
    setLoading(false)
  }

  async function openAmort(cfd: any) {
    setSelectedCfd(cfd)
    setShowAmortModal(true)
    try {
      const data = await getAmortization(cfd.id || cfd.cfd_id)
      setAmortSchedule(Array.isArray(data) ? data : data.schedule || [])
    } catch { setAmortSchedule([]) }
  }

  async function handleCreateDefault(cfdId: string) {
    try {
      await createDefault({ cfd_id: cfdId })
      showToastMsg('Default created')
      setConfirmDefault(null)
      fetchCfds()
    } catch { showToastMsg('Failed to create default') }
  }

  async function handleRecordPayment(e: FormEvent) {
    e.preventDefault()
    if (!paymentCfd) return
    setRecordingPayment(true)
    try {
      await recordPayment({ cfd_id: paymentCfd.id || paymentCfd.cfd_id, amount: parseFloat(paymentAmount), payment_date: paymentDate })
      showToastMsg('Payment recorded')
      setPaymentCfd(null)
      setPaymentAmount('')
      fetchCfds()
    } catch { showToastMsg('Failed to record payment') }
    setRecordingPayment(false)
  }

  async function handleCreateCfd() {
    setCreating(true)
    const la = parseFloat(cfdForm.purchase_price || '0') - parseFloat(cfdForm.down_payment || '0')
    const monthly = calcMonthlyPayment(la, parseFloat(cfdForm.interest_rate || '0'), parseInt(cfdForm.term_months || '0'))
    const payload: Record<string, any> = {
      trust_id: cfdForm.trust_id, buyer_name: cfdForm.buyer_name, buyer_email: cfdForm.buyer_email,
      buyer_phone: cfdForm.buyer_phone, buyer_address: cfdForm.buyer_address,
      purchase_price: parseFloat(cfdForm.purchase_price), down_payment: parseFloat(cfdForm.down_payment || '0'),
      loan_amount: la, interest_rate: parseFloat(cfdForm.interest_rate),
      term_months: parseInt(cfdForm.term_months), monthly_payment: Math.round(monthly * 100) / 100,
      first_payment_date: cfdForm.first_payment_date,
      late_fee_amount: parseFloat(cfdForm.late_fee_amount || '50'),
      late_fee_after_days: parseInt(cfdForm.late_fee_after_days || '15'),
      payment_method: cfdForm.payment_method,
    }
    if (cfdForm.has_balloon) {
      payload.balloon_month = parseInt(cfdForm.balloon_month)
      payload.balloon_amount = parseFloat(cfdForm.balloon_amount)
    }
    if (cfdForm.has_underlying) {
      payload.underlying_servicer = cfdForm.servicer
      payload.underlying_balance = parseFloat(cfdForm.underlying_balance)
      payload.underlying_payment = parseFloat(cfdForm.underlying_payment)
      payload.underlying_account = cfdForm.underlying_account
    }
    try {
      await createCfd(payload)
      showToastMsg('Contract created successfully')
      setShowCreateModal(false)
      resetForm()
      fetchCfds()
    } catch { showToastMsg('Failed to create contract') }
    setCreating(false)
  }

  function resetForm() {
    setStep(1)
    setCfdForm({ ...INITIAL_CFD_FORM })
  }

  async function openCreateModal() {
    setShowCreateModal(true)
    resetForm()
    try {
      const data = await getProperties()
      setProperties(Array.isArray(data) ? data : data.properties || [])
    } catch { setProperties([]) }
  }

  function showToastMsg(msg: string) {
    setToast(msg)
    setTimeout(() => setToast(''), 4000)
  }

  function updateField(key: CfdFormKey, value: string) {
    setCfdForm((prev) => ({ ...prev, [key]: value }))
  }

  const loanAmount = parseFloat(cfdForm.purchase_price || '0') - parseFloat(cfdForm.down_payment || '0')
  const monthlyPayment = calcMonthlyPayment(loanAmount, parseFloat(cfdForm.interest_rate || '0'), parseInt(cfdForm.term_months || '0'))
  const selectedProp = properties.find((p: any) => (p.trust_id || p.id) === cfdForm.trust_id)
  const genAccountNum = `CFD-${selectedProp?.state || 'XX'}-${new Date().getFullYear()}-${String(cfds.length + 1).padStart(5, '0')}`

  return (
    <div className="space-y-4">
      {toast && (
        <div className="fixed top-4 right-4 z-50 bg-[#1B3A6B] text-white px-4 py-2 rounded-lg shadow-lg text-sm">{toast}</div>
      )}

      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold text-slate-800">Contracts</h2>
        <button onClick={openCreateModal} className="px-4 py-2 bg-[#1B3A6B] text-white text-sm font-medium rounded-lg hover:opacity-90">
          + New Contract
        </button>
      </div>

      {loading ? (
        <div className="bg-white rounded-xl shadow p-8 text-center text-slate-400">Loading...</div>
      ) : cfds.length === 0 ? (
        <div className="bg-white rounded-xl shadow p-8 text-center text-slate-400">No contracts yet. Create your first contract above.</div>
      ) : (
        <div className="bg-white rounded-xl shadow overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 border-b">
              <tr>
                {['Account #', 'Buyer', 'Property', 'Balance', 'Monthly', 'Next Due', 'Days', 'Status'].map((h) => (
                  <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {cfds.map((c: any) => {
                const id = c.id || c.cfd_id
                const isExpanded = expandedRow === id
                const daysLate = c.days_late ?? (c.days_until_due != null ? -c.days_until_due : null)
                const daysUntilDue = c.days_until_due ?? (c.days_late != null ? -c.days_late : null)
                const isLate = daysLate != null && daysLate > 0
                return (
                  <Fragment key={id}>
                    <tr className="border-b last:border-0 hover:bg-slate-50 cursor-pointer" onClick={() => setExpandedRow(isExpanded ? null : id)}>
                      <td className="px-4 py-3 text-slate-800 font-medium whitespace-nowrap">{c.account_number}</td>
                      <td className="px-4 py-3 text-slate-600">{c.buyer_name}</td>
                      <td className="px-4 py-3 text-slate-600 truncate max-w-[180px]">{c.property_address}</td>
                      <td className="px-4 py-3 text-slate-800">${c.current_balance?.toLocaleString()}</td>
                      <td className="px-4 py-3 text-slate-600">${c.monthly_payment?.toLocaleString()}</td>
                      <td className="px-4 py-3 text-slate-600 whitespace-nowrap">{c.next_due_date}</td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        {isLate ? (
                          <span className="text-[#CC2229] font-medium">{daysLate} days LATE</span>
                        ) : daysUntilDue != null ? (
                          <span className="text-green-600 font-medium">{daysUntilDue} days</span>
                        ) : (
                          <span className="text-slate-400">-</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <span className={`px-2 py-0.5 text-xs font-semibold rounded-full ${STATUS_BADGE[c.status] || 'bg-gray-100 text-gray-600'}`}>{c.status}</span>
                      </td>
                    </tr>
                    {isExpanded && (
                      <tr>
                        <td colSpan={8} className="bg-slate-50 px-6 py-4">
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div className="space-y-1 text-sm">
                              <p className="font-semibold text-slate-700 mb-2">Loan Details</p>
                              <p className="text-slate-600">Purchase Price: ${c.purchase_price?.toLocaleString()}</p>
                              <p className="text-slate-600">Down Payment: ${c.down_payment?.toLocaleString()}</p>
                              <p className="text-slate-600">Loan Amount: ${c.loan_amount?.toLocaleString()}</p>
                              <p className="text-slate-600">Interest Rate: {c.interest_rate}%</p>
                              <p className="text-slate-600">Term: {c.term_months} months</p>
                              <p className="text-slate-600">Start Date: {c.first_payment_date || c.start_date}</p>
                              <p className="text-slate-600">Maturity: {c.maturity_date}</p>
                            </div>
                            <div className="flex flex-col gap-2">
                              <p className="font-semibold text-slate-700 mb-1">Actions</p>
                              <button onClick={(ev) => { ev.stopPropagation(); setPaymentCfd(c); setPaymentAmount(String(c.monthly_payment || '')) }} className="px-4 py-2 text-sm font-medium bg-green-600 text-white rounded-lg hover:bg-green-700 text-left">
                                Record Payment
                              </button>
                              <button onClick={(ev) => { ev.stopPropagation(); openAmort(c) }} className="px-4 py-2 text-sm font-medium bg-[#1B3A6B] text-white rounded-lg hover:opacity-90 text-left">
                                View Amortization
                              </button>
                              {isLate && (
                                confirmDefault === id ? (
                                  <button onClick={(ev) => { ev.stopPropagation(); handleCreateDefault(id) }} className="px-4 py-2 text-sm font-medium bg-red-800 text-white rounded-lg hover:bg-red-900 text-left">
                                    Confirm Create Default
                                  </button>
                                ) : (
                                  <button onClick={(ev) => { ev.stopPropagation(); setConfirmDefault(id) }} className="px-4 py-2 text-sm font-medium bg-[#CC2229] text-white rounded-lg hover:opacity-90 text-left">
                                    Create Default
                                  </button>
                                )
                              )}
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Record Payment Modal */}
      {paymentCfd && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-sm mx-4">
            <div className="flex items-center justify-between px-5 py-3 border-b">
              <h3 className="text-sm font-bold text-slate-800">Record Payment — {paymentCfd.account_number}</h3>
              <button onClick={() => setPaymentCfd(null)} className="text-slate-400 hover:text-slate-600 text-xl">&times;</button>
            </div>
            <form onSubmit={handleRecordPayment} className="p-5 space-y-3">
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Amount ($)</label>
                <input type="number" step="0.01" required value={paymentAmount} onChange={(e) => setPaymentAmount(e.target.value)} className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1B3A6B]" />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Date</label>
                <input type="date" required value={paymentDate} onChange={(e) => setPaymentDate(e.target.value)} className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1B3A6B]" />
              </div>
              <div className="flex justify-end gap-2 pt-1">
                <button type="button" onClick={() => setPaymentCfd(null)} className="px-3 py-1.5 text-sm text-slate-600">Cancel</button>
                <button type="submit" disabled={recordingPayment} className="px-4 py-1.5 bg-green-600 text-white text-sm font-medium rounded-lg hover:bg-green-700 disabled:opacity-50">
                  {recordingPayment ? 'Recording...' : 'Record'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Create CFD Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-lg mx-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between px-6 py-4 border-b">
              <h3 className="text-lg font-bold text-slate-800">New Contract</h3>
              <button onClick={() => { setShowCreateModal(false); resetForm() }} className="text-slate-400 hover:text-slate-600 text-xl">&times;</button>
            </div>

            {/* Progress bar */}
            <div className="px-6 pt-4">
              <div className="flex items-center gap-1 mb-1">
                {STEP_LABELS.map((l, i) => (
                  <div key={l} className={`h-1.5 flex-1 rounded-full ${i + 1 <= step ? 'bg-[#1B3A6B]' : 'bg-slate-200'}`} />
                ))}
              </div>
              <p className="text-xs text-slate-500">Step {step} of 7 — {STEP_LABELS[step - 1]}</p>
            </div>

            <div className="p-6 space-y-4">
              {/* Step 1: Property */}
              {step === 1 && (
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Select Property</label>
                  <select value={cfdForm.trust_id} onChange={(e) => updateField('trust_id', e.target.value)} className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1B3A6B]">
                    <option value="">Choose a land trust</option>
                    {properties.map((p: any) => (
                      <option key={p.trust_id || p.id} value={p.trust_id || p.id}>{p.property_address} — {p.trust_name}</option>
                    ))}
                  </select>
                </div>
              )}

              {/* Step 2: Buyer */}
              {step === 2 && (
                <div className="space-y-3">
                  {([
                    { key: 'buyer_name' as CfdFormKey, label: 'Full Name *', req: true },
                    { key: 'buyer_email' as CfdFormKey, label: 'Email', req: false },
                    { key: 'buyer_phone' as CfdFormKey, label: 'Phone', req: false },
                    { key: 'buyer_address' as CfdFormKey, label: 'Mailing Address', req: false },
                  ]).map((f) => (
                    <div key={f.key}>
                      <label className="block text-xs font-medium text-slate-700 mb-1">{f.label}</label>
                      <input required={f.req} value={cfdForm[f.key]} onChange={(e) => updateField(f.key, e.target.value)} className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1B3A6B]" />
                    </div>
                  ))}
                </div>
              )}

              {/* Step 3: Loan Terms */}
              {step === 3 && (
                <div className="space-y-3">
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">Purchase Price ($) *</label>
                    <input type="number" step="0.01" required value={cfdForm.purchase_price} onChange={(e) => updateField('purchase_price', e.target.value)} className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1B3A6B]" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">Down Payment ($)</label>
                    <input type="number" step="0.01" value={cfdForm.down_payment} onChange={(e) => updateField('down_payment', e.target.value)} className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1B3A6B]" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">Loan Amount</label>
                    <input readOnly value={loanAmount > 0 ? `$${loanAmount.toLocaleString()}` : ''} className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm bg-slate-50 text-slate-600" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">Interest Rate (%) *</label>
                    <input type="number" step="0.01" required value={cfdForm.interest_rate} onChange={(e) => updateField('interest_rate', e.target.value)} className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1B3A6B]" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">Term (months) *</label>
                    <input type="number" required value={cfdForm.term_months} onChange={(e) => updateField('term_months', e.target.value)} className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1B3A6B]" />
                  </div>
                  {monthlyPayment > 0 && (
                    <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
                      <p className="text-sm text-blue-800 font-medium">Calculated: ${monthlyPayment.toFixed(2)}/mo</p>
                    </div>
                  )}
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">First Payment Date *</label>
                    <input type="date" required value={cfdForm.first_payment_date} onChange={(e) => updateField('first_payment_date', e.target.value)} className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1B3A6B]" />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-medium text-slate-700 mb-1">Late Fee ($)</label>
                      <input type="number" step="0.01" value={cfdForm.late_fee_amount} onChange={(e) => updateField('late_fee_amount', e.target.value)} className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1B3A6B]" />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-700 mb-1">Late After (days)</label>
                      <input type="number" value={cfdForm.late_fee_after_days} onChange={(e) => updateField('late_fee_after_days', e.target.value)} className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1B3A6B]" />
                    </div>
                  </div>
                </div>
              )}

              {/* Step 4: Balloon */}
              {step === 4 && (
                <div className="space-y-3">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input type="checkbox" checked={cfdForm.has_balloon} onChange={(e) => setCfdForm({ ...cfdForm, has_balloon: e.target.checked })} className="rounded border-slate-300" />
                    <span className="text-sm font-medium text-slate-700">Has Balloon Payment?</span>
                  </label>
                  {cfdForm.has_balloon && (
                    <>
                      <div>
                        <label className="block text-xs font-medium text-slate-700 mb-1">Balloon Month #</label>
                        <input type="number" value={cfdForm.balloon_month} onChange={(e) => updateField('balloon_month', e.target.value)} className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1B3A6B]" />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-slate-700 mb-1">Balloon Amount ($)</label>
                        <input type="number" step="0.01" value={cfdForm.balloon_amount} onChange={(e) => updateField('balloon_amount', e.target.value)} className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1B3A6B]" />
                      </div>
                    </>
                  )}
                </div>
              )}

              {/* Step 5: Underlying Mortgage */}
              {step === 5 && (
                <div className="space-y-3">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input type="checkbox" checked={cfdForm.has_underlying} onChange={(e) => setCfdForm({ ...cfdForm, has_underlying: e.target.checked })} className="rounded border-slate-300" />
                    <span className="text-sm font-medium text-slate-700">Has Underlying Mortgage?</span>
                  </label>
                  {cfdForm.has_underlying && (
                    <>
                      {([
                        { key: 'servicer' as CfdFormKey, label: 'Servicer', type: 'text' },
                        { key: 'underlying_balance' as CfdFormKey, label: 'Balance ($)', type: 'number' },
                        { key: 'underlying_payment' as CfdFormKey, label: 'Monthly Payment ($)', type: 'number' },
                        { key: 'underlying_account' as CfdFormKey, label: 'Account #', type: 'text' },
                      ]).map((f) => (
                        <div key={f.key}>
                          <label className="block text-xs font-medium text-slate-700 mb-1">{f.label}</label>
                          <input type={f.type} step={f.type === 'number' ? '0.01' : undefined} value={cfdForm[f.key]} onChange={(e) => updateField(f.key, e.target.value)} className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1B3A6B]" />
                        </div>
                      ))}
                    </>
                  )}
                </div>
              )}

              {/* Step 6: Payment Method */}
              {step === 6 && (
                <div className="grid grid-cols-2 gap-3">
                  {PAYMENT_METHODS.map((m) => (
                    <button key={m.value} type="button" onClick={() => updateField('payment_method', m.value)}
                      className={`border rounded-xl p-4 text-left transition ${cfdForm.payment_method === m.value ? 'border-[#1B3A6B] bg-blue-50 ring-2 ring-[#1B3A6B]' : 'border-slate-200 hover:border-slate-300'}`}>
                      <p className="text-sm font-semibold text-slate-800">{m.label}</p>
                      <p className="text-xs text-slate-500 mt-1">{m.desc}</p>
                    </button>
                  ))}
                </div>
              )}

              {/* Step 7: Review */}
              {step === 7 && (
                <div className="space-y-3">
                  <div className="bg-[#1B3A6B]/5 border border-[#1B3A6B]/20 rounded-lg p-3">
                    <p className="text-xs text-slate-500">Account Number</p>
                    <p className="text-sm font-bold text-[#1B3A6B]">{genAccountNum}</p>
                  </div>
                  <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
                    {([
                      ['Property', selectedProp?.property_address || '-'],
                      ['Buyer', cfdForm.buyer_name],
                      ['Purchase Price', `$${parseFloat(cfdForm.purchase_price || '0').toLocaleString()}`],
                      ['Down Payment', `$${parseFloat(cfdForm.down_payment || '0').toLocaleString()}`],
                      ['Loan Amount', `$${loanAmount.toLocaleString()}`],
                      ['Interest Rate', `${cfdForm.interest_rate}%`],
                      ['Term', `${cfdForm.term_months} months`],
                      ['Monthly Payment', `$${monthlyPayment.toFixed(2)}`],
                      ['First Payment', cfdForm.first_payment_date],
                      ['Payment Method', cfdForm.payment_method.toUpperCase()],
                    ] as [string, string][]).map(([k, v]) => (
                      <div key={k} className="py-1">
                        <span className="text-slate-500">{k}: </span>
                        <span className="text-slate-800 font-medium">{v}</span>
                      </div>
                    ))}
                    {cfdForm.has_balloon && <div className="py-1 col-span-2"><span className="text-slate-500">Balloon: </span><span className="text-slate-800 font-medium">${parseFloat(cfdForm.balloon_amount || '0').toLocaleString()} at month {cfdForm.balloon_month}</span></div>}
                    {cfdForm.has_underlying && <div className="py-1 col-span-2"><span className="text-slate-500">Underlying: </span><span className="text-slate-800 font-medium">{cfdForm.servicer} — ${parseFloat(cfdForm.underlying_balance || '0').toLocaleString()}</span></div>}
                  </div>
                </div>
              )}

              {/* Navigation */}
              <div className="flex justify-between pt-2">
                {step > 1 ? (
                  <button type="button" onClick={() => setStep(step - 1)} className="px-4 py-2 text-sm text-slate-600 hover:text-slate-800">Back</button>
                ) : <span />}
                {step < 7 ? (
                  <button type="button" onClick={() => setStep(step + 1)} disabled={step === 1 && !cfdForm.trust_id} className="px-4 py-2 bg-[#1B3A6B] text-white text-sm font-medium rounded-lg hover:opacity-90 disabled:opacity-50">
                    Next
                  </button>
                ) : (
                  <button type="button" onClick={handleCreateCfd} disabled={creating} className="px-4 py-2 bg-[#1B3A6B] text-white text-sm font-medium rounded-lg hover:opacity-90 disabled:opacity-50">
                    {creating ? 'Creating...' : 'Create Contract'}
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Amortization Modal */}
      {showAmortModal && selectedCfd && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-3xl mx-4 max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between px-6 py-4 border-b shrink-0">
              <div>
                <h3 className="text-lg font-bold text-slate-800">Amortization Schedule</h3>
                <p className="text-xs text-slate-500">{selectedCfd.account_number} — {selectedCfd.buyer_name}</p>
              </div>
              <button onClick={() => { setShowAmortModal(false); setAmortSchedule([]) }} className="text-slate-400 hover:text-slate-600 text-xl">&times;</button>
            </div>
            <div className="overflow-auto flex-1">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 border-b sticky top-0">
                  <tr>
                    {['#', 'Due Date', 'Payment', 'Principal', 'Interest', 'Balance'].map((h) => (
                      <th key={h} className="text-left px-4 py-2 text-xs font-semibold text-slate-500 uppercase whitespace-nowrap">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {amortSchedule.map((row: any, i: number) => (
                    <tr key={i} className={`border-b last:border-0 ${ROW_BG[row.status] || ''}`}>
                      <td className="px-4 py-2 text-slate-600">{row.number ?? i + 1}</td>
                      <td className="px-4 py-2 text-slate-600 whitespace-nowrap">{row.due_date}</td>
                      <td className="px-4 py-2 text-slate-800">${row.payment?.toLocaleString()}</td>
                      <td className="px-4 py-2 text-slate-600">${row.principal?.toLocaleString()}</td>
                      <td className="px-4 py-2 text-slate-600">${row.interest?.toLocaleString()}</td>
                      <td className="px-4 py-2 text-slate-800">${row.balance?.toLocaleString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {amortSchedule.length > 0 && (
              <div className="border-t px-6 py-3 flex gap-6 text-sm shrink-0">
                <div>
                  <span className="text-slate-500">Total Interest: </span>
                  <span className="font-medium text-slate-800">${amortSchedule.reduce((s: number, r: any) => s + (r.interest || 0), 0).toLocaleString()}</span>
                </div>
                <div>
                  <span className="text-slate-500">Total Payments: </span>
                  <span className="font-medium text-slate-800">${amortSchedule.reduce((s: number, r: any) => s + (r.payment || 0), 0).toLocaleString()}</span>
                </div>
                <div>
                  <span className="text-slate-500">Payoff: </span>
                  <span className="font-medium text-slate-800">{amortSchedule[amortSchedule.length - 1]?.due_date}</span>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
