import { useState, useEffect } from 'react'
import { getPayments, getCfds, recordPayment } from '../../../services/loanServicingApi'

interface Props { token: string }

const METHODS = ['stripe', 'ach', 'check', 'wire'] as const
const METHOD_LABEL: Record<string, string> = { stripe: 'Stripe', ach: 'ACH', check: 'Check', wire: 'Wire' }
const STATUS_BADGE: Record<string, string> = {
  completed: 'bg-green-100 text-green-800',
  pending: 'bg-yellow-100 text-yellow-800',
  failed: 'bg-red-100 text-red-800',
}

export default function PaymentsTab({ token }: Props) {
  const [payments, setPayments] = useState<any[]>([])
  const [cfds, setCfds] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [toast, setToast] = useState('')

  const [form, setForm] = useState({
    cfd_id: '', amount: '', payment_date: new Date().toISOString().split('T')[0],
    payment_method: 'stripe' as string, reference_number: '', notes: '',
  })
  const [calc, setCalc] = useState({ principal: 0, interest: 0, late_fee: 0, new_balance: 0 })

  // Filters
  const [filterCfd, setFilterCfd] = useState('')
  const [filterDateFrom, setFilterDateFrom] = useState('')
  const [filterDateTo, setFilterDateTo] = useState('')
  const [filterMethod, setFilterMethod] = useState('')
  const [filterStatus, setFilterStatus] = useState('')

  useEffect(() => { fetchData() }, [token])

  async function fetchData() {
    setLoading(true)
    try {
      const [pData, cData] = await Promise.all([getPayments(token), getCfds(token)])
      setPayments(Array.isArray(pData) ? pData : pData.payments || [])
      setCfds(Array.isArray(cData) ? cData : cData.cfds || [])
    } catch { setPayments([]); setCfds([]) }
    setLoading(false)
  }

  function showToast(msg: string) { setToast(msg); setTimeout(() => setToast(''), 4000) }

  // Live calculation when amount + cfd selected
  useEffect(() => {
    const cfd = cfds.find((c: any) => (c.id || c.cfd_id) === form.cfd_id)
    const amt = parseFloat(form.amount) || 0
    if (!cfd || !amt) { setCalc({ principal: 0, interest: 0, late_fee: 0, new_balance: 0 }); return }
    const balance = cfd.current_balance || 0
    const rate = (cfd.interest_rate || 0) / 100 / 12
    const interest = Math.round(balance * rate * 100) / 100
    const lateFee = cfd.days_late > 0 ? (cfd.late_fee_amount || 0) : 0
    const principal = Math.max(0, Math.round((amt - interest - lateFee) * 100) / 100)
    const newBalance = Math.max(0, Math.round((balance - principal) * 100) / 100)
    setCalc({ principal, interest, late_fee: lateFee, new_balance: newBalance })
  }, [form.cfd_id, form.amount, cfds])

  async function handleRecord() {
    if (!form.cfd_id || !form.amount) return
    setSubmitting(true)
    try {
      await recordPayment({ ...form, amount: parseFloat(form.amount) }, token)
      showToast('Payment recorded successfully')
      setForm({ cfd_id: '', amount: '', payment_date: new Date().toISOString().split('T')[0], payment_method: 'stripe', reference_number: '', notes: '' })
      fetchData()
    } catch { showToast('Failed to record payment') }
    setSubmitting(false)
  }

  function exportCsv() {
    const rows = [['Date', 'Account #', 'Buyer', 'Amount', 'Principal', 'Interest', 'Late Fee', 'Method', 'Status']]
    filtered.forEach((p: any) => rows.push([p.payment_date, p.account_number || '', p.buyer_name || '', p.amount, p.principal || '', p.interest || '', p.late_fee || '', p.payment_method || '', p.status || '']))
    const csv = rows.map(r => r.join(',')).join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'payments.csv'; a.click()
  }

  const filtered = payments.filter((p: any) => {
    if (filterCfd && (p.cfd_id !== filterCfd)) return false
    if (filterDateFrom && p.payment_date < filterDateFrom) return false
    if (filterDateTo && p.payment_date > filterDateTo) return false
    if (filterMethod && p.payment_method !== filterMethod) return false
    if (filterStatus && p.status !== filterStatus) return false
    return true
  })

  const selectedCfd = cfds.find((c: any) => (c.id || c.cfd_id) === form.cfd_id)

  return (
    <div className="space-y-6">
      {toast && <div className="fixed top-4 right-4 z-50 bg-[#1B3A6B] text-white px-4 py-2 rounded-lg shadow-lg text-sm">{toast}</div>}

      {/* Record Payment Form */}
      <div className="bg-slate-100 rounded-xl p-5 space-y-4">
        <h3 className="text-sm font-bold text-slate-800">Record Payment</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="md:col-span-2 space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">CFD</label>
                <select value={form.cfd_id} onChange={e => setForm({ ...form, cfd_id: e.target.value })} className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1B3A6B]">
                  <option value="">Select contract...</option>
                  {cfds.map((c: any) => <option key={c.id || c.cfd_id} value={c.id || c.cfd_id}>{c.account_number} — {c.buyer_name}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Amount ($)</label>
                <input type="number" step="0.01" value={form.amount} onChange={e => setForm({ ...form, amount: e.target.value })} placeholder={selectedCfd ? String(selectedCfd.monthly_payment || '') : ''} className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1B3A6B]" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Payment Date</label>
                <input type="date" value={form.payment_date} onChange={e => setForm({ ...form, payment_date: e.target.value })} className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1B3A6B]" />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Method</label>
                <div className="flex gap-1 bg-white rounded-lg p-1 border border-slate-300">
                  {METHODS.map(m => (
                    <button key={m} type="button" onClick={() => setForm({ ...form, payment_method: m })} className={`flex-1 py-1.5 text-xs font-medium rounded-md transition ${form.payment_method === m ? 'bg-[#1B3A6B] text-white' : 'text-slate-600 hover:bg-slate-50'}`}>{METHOD_LABEL[m]}</button>
                  ))}
                </div>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              {(form.payment_method === 'check' || form.payment_method === 'wire') && (
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Reference Number</label>
                  <input value={form.reference_number} onChange={e => setForm({ ...form, reference_number: e.target.value })} className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1B3A6B]" />
                </div>
              )}
              <div className={form.payment_method === 'check' || form.payment_method === 'wire' ? '' : 'col-span-2'}>
                <label className="block text-xs font-medium text-slate-700 mb-1">Notes</label>
                <input value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1B3A6B]" />
              </div>
            </div>
          </div>

          {/* Live Calculation Panel */}
          <div className="bg-white rounded-lg border border-slate-200 p-4 space-y-2 text-sm">
            <p className="text-xs font-semibold text-slate-500 uppercase">Payment Breakdown</p>
            <div className="flex justify-between"><span className="text-slate-600">Principal</span><span className="text-slate-800 font-medium">${calc.principal.toFixed(2)}</span></div>
            <div className="flex justify-between"><span className="text-slate-600">Interest</span><span className="text-slate-800 font-medium">${calc.interest.toFixed(2)}</span></div>
            <div className="flex justify-between"><span className="text-slate-600">Late Fee</span><span className={`font-medium ${calc.late_fee > 0 ? 'text-[#CC2229]' : 'text-slate-800'}`}>${calc.late_fee.toFixed(2)}</span></div>
            <hr className="border-slate-200" />
            <div className="flex justify-between"><span className="text-slate-700 font-semibold">New Balance</span><span className="text-slate-900 font-bold">${calc.new_balance.toFixed(2)}</span></div>
          </div>
        </div>
        <button onClick={handleRecord} disabled={submitting || !form.cfd_id || !form.amount} className="w-full py-2.5 bg-[#1B3A6B] text-white text-sm font-medium rounded-lg hover:opacity-90 disabled:opacity-50">
          {submitting ? 'Recording...' : 'Record Payment'}
        </button>
      </div>

      {/* Payment History */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-bold text-slate-800">Payment History</h3>
          <button onClick={exportCsv} className="px-3 py-1.5 text-xs border border-[#1B3A6B] text-[#1B3A6B] rounded-lg hover:bg-slate-50">Export CSV</button>
        </div>

        {/* Filters */}
        <div className="flex flex-wrap gap-2">
          <select value={filterCfd} onChange={e => setFilterCfd(e.target.value)} className="border border-slate-300 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-[#1B3A6B]">
            <option value="">All Contracts</option>
            {cfds.map((c: any) => <option key={c.id || c.cfd_id} value={c.id || c.cfd_id}>{c.account_number}</option>)}
          </select>
          <input type="date" value={filterDateFrom} onChange={e => setFilterDateFrom(e.target.value)} placeholder="From" className="border border-slate-300 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-[#1B3A6B]" />
          <input type="date" value={filterDateTo} onChange={e => setFilterDateTo(e.target.value)} placeholder="To" className="border border-slate-300 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-[#1B3A6B]" />
          <select value={filterMethod} onChange={e => setFilterMethod(e.target.value)} className="border border-slate-300 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-[#1B3A6B]">
            <option value="">All Methods</option>
            {METHODS.map(m => <option key={m} value={m}>{METHOD_LABEL[m]}</option>)}
          </select>
          <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)} className="border border-slate-300 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-[#1B3A6B]">
            <option value="">All Statuses</option>
            <option value="completed">Completed</option>
            <option value="pending">Pending</option>
            <option value="failed">Failed</option>
          </select>
        </div>

        {loading ? (
          <div className="bg-white rounded-xl shadow p-8 text-center text-slate-400">Loading...</div>
        ) : filtered.length === 0 ? (
          <div className="bg-white rounded-xl shadow p-8 text-center text-slate-400">No payments found.</div>
        ) : (
          <div className="bg-white rounded-xl shadow overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 border-b">
                <tr>
                  {['Date', 'Account #', 'Buyer', 'Amount', 'Principal', 'Interest', 'Late Fee', 'Method', 'Status'].map(h => (
                    <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map((p: any, i: number) => (
                  <tr key={p.id || i} className="border-b last:border-0 hover:bg-slate-50">
                    <td className="px-4 py-3 text-slate-600 whitespace-nowrap">{p.payment_date}</td>
                    <td className="px-4 py-3 text-slate-800 font-medium">{p.account_number}</td>
                    <td className="px-4 py-3 text-slate-600">{p.buyer_name}</td>
                    <td className="px-4 py-3 text-slate-800">${parseFloat(p.amount || 0).toLocaleString()}</td>
                    <td className="px-4 py-3 text-slate-600">${parseFloat(p.principal || 0).toLocaleString()}</td>
                    <td className="px-4 py-3 text-slate-600">${parseFloat(p.interest || 0).toLocaleString()}</td>
                    <td className="px-4 py-3 text-slate-600">${parseFloat(p.late_fee || 0).toLocaleString()}</td>
                    <td className="px-4 py-3 text-slate-600">{METHOD_LABEL[p.payment_method] || p.payment_method}</td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-0.5 text-xs font-semibold rounded-full ${STATUS_BADGE[p.status] || 'bg-gray-100 text-gray-600'}`}>{p.status}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
