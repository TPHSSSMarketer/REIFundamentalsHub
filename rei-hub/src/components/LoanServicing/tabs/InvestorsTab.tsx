import { useState, useEffect } from 'react'
import { getInvestors, createInvestor, updateInvestor, deactivateInvestor } from '../../../services/loanServicingApi'

interface Props { token: string; isSuperAdmin: boolean }

const PAYMENT_METHODS = ['check', 'ach', 'wire'] as const
const METHOD_LABEL: Record<string, string> = { check: 'Check', ach: 'ACH', wire: 'Wire' }

const INITIAL_FORM = {
  name: '', entity_name: '', email: '', phone: '',
  distribution_percentage: '4', payment_method: 'check' as string,
  bank_name: '', routing_number: '', account_number: '', notes: '',
}

export default function InvestorsTab({ token, isSuperAdmin }: Props) {
  if (!isSuperAdmin) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="text-center">
          <p className="text-4xl mb-3">&#x1F512;</p>
          <p className="text-sm text-slate-600">This section is restricted to administrators only.</p>
        </div>
      </div>
    )
  }

  const [investors, setInvestors] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [toast, setToast] = useState('')
  const [showModal, setShowModal] = useState(false)
  const [editingInvestor, setEditingInvestor] = useState<any>(null)
  const [form, setForm] = useState({ ...INITIAL_FORM })
  const [saving, setSaving] = useState(false)

  useEffect(() => { fetchInvestors() }, [token])

  async function fetchInvestors() {
    setLoading(true)
    try {
      const data = await getInvestors(token)
      setInvestors(Array.isArray(data) ? data : data.investors || [])
    } catch { setInvestors([]) }
    setLoading(false)
  }

  function showToastMsg(msg: string) { setToast(msg); setTimeout(() => setToast(''), 4000) }

  function openAdd() {
    setEditingInvestor(null)
    setForm({ ...INITIAL_FORM })
    setShowModal(true)
  }

  function openEdit(inv: any) {
    setEditingInvestor(inv)
    setForm({
      name: inv.name || '', entity_name: inv.entity_name || '', email: inv.email || '',
      phone: inv.phone || '', distribution_percentage: String(inv.distribution_percentage ?? 4),
      payment_method: inv.payment_method || 'check', bank_name: inv.bank_name || '',
      routing_number: inv.routing_number || '', account_number: inv.account_number || '',
      notes: inv.notes || '',
    })
    setShowModal(true)
  }

  async function handleSave() {
    if (!form.name) return
    setSaving(true)
    try {
      const payload = { ...form, distribution_percentage: parseFloat(form.distribution_percentage) || 0 }
      if (editingInvestor) {
        await updateInvestor(editingInvestor.id, payload, token)
        showToastMsg('Investor updated')
      } else {
        await createInvestor(payload, token)
        showToastMsg('Investor created')
      }
      setShowModal(false)
      fetchInvestors()
    } catch { showToastMsg('Failed to save investor') }
    setSaving(false)
  }

  async function handleDeactivate(inv: any) {
    if (!confirm(`Deactivate ${inv.name}?`)) return
    try {
      await deactivateInvestor(inv.id, token)
      showToastMsg('Investor deactivated')
      fetchInvestors()
    } catch { showToastMsg('Failed to deactivate investor') }
  }

  const activeInvestors = investors.filter((i: any) => i.status === 'active' || !i.status)
  const totalPct = activeInvestors.reduce((s: number, i: any) => s + (i.distribution_percentage || 0), 0)
  const entityPct = Math.max(0, 100 - totalPct)

  // Running total for modal
  const currentEditPct = editingInvestor ? (editingInvestor.distribution_percentage || 0) : 0
  const newTotalPct = totalPct - currentEditPct + (parseFloat(form.distribution_percentage) || 0)

  return (
    <div className="space-y-6">
      {toast && <div className="fixed top-4 right-4 z-50 bg-[#1B3A6B] text-white px-4 py-2 rounded-lg shadow-lg text-sm">{toast}</div>}

      <div className="flex items-center justify-between">
        <h3 className="text-sm font-bold text-slate-800">Investor Allocation: {totalPct}%</h3>
        <button onClick={openAdd} className="px-4 py-2 bg-[#1B3A6B] text-white text-sm font-medium rounded-lg hover:opacity-90">+ Add Investor</button>
      </div>

      {/* Allocation Bar */}
      <div className="space-y-1">
        <div className="flex h-4 rounded-full overflow-hidden">
          <div style={{ width: `${totalPct}%` }} className="bg-[#CC2229] transition-all" />
          <div style={{ width: `${entityPct}%` }} className="bg-[#1B3A6B] transition-all" />
        </div>
        <p className="text-xs text-slate-500">TriPoint Home Solutions receives: {entityPct}%</p>
      </div>

      {/* Investor Cards */}
      {loading ? (
        <div className="bg-white rounded-xl shadow p-8 text-center text-slate-400">Loading...</div>
      ) : investors.length === 0 ? (
        <div className="bg-white rounded-xl shadow p-8 text-center text-slate-400">No investors yet. Add your first investor above.</div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {investors.map((inv: any) => {
            const isActive = inv.status === 'active' || !inv.status
            return (
              <div key={inv.id} className="bg-white rounded-xl shadow p-4 space-y-2">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-sm font-bold text-slate-800">{inv.name}</p>
                    {inv.entity_name && <p className="text-xs text-slate-500">{inv.entity_name}</p>}
                  </div>
                  <span className={`px-2 py-0.5 text-xs font-semibold rounded-full ${isActive ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-600'}`}>
                    {isActive ? 'Active' : 'Inactive'}
                  </span>
                </div>
                <p className="text-sm text-slate-600">Distribution: <span className="font-medium text-slate-800">{inv.distribution_percentage}%</span></p>
                <p className="text-sm text-slate-600">Payment: <span className="font-medium text-slate-800">{METHOD_LABEL[inv.payment_method] || inv.payment_method}</span></p>
                <div className="flex gap-2 pt-1">
                  <button onClick={() => openEdit(inv)} className="px-3 py-1 text-xs bg-[#1B3A6B] text-white rounded hover:opacity-90">Edit</button>
                  {isActive && (
                    <button onClick={() => handleDeactivate(inv)} className="px-3 py-1 text-xs text-[#CC2229] hover:underline">Deactivate</button>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Investor Modal */}
      {showModal && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-lg mx-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between px-6 py-4 border-b">
              <h3 className="text-lg font-bold text-slate-800">{editingInvestor ? 'Edit Investor' : 'Add Investor'}</h3>
              <button onClick={() => setShowModal(false)} className="text-slate-400 hover:text-slate-600 text-xl">&times;</button>
            </div>
            <div className="p-6 space-y-3">
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Full Name *</label>
                <input required value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1B3A6B]" />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Entity/LLC Name</label>
                <input value={form.entity_name} onChange={e => setForm({ ...form, entity_name: e.target.value })} className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1B3A6B]" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Email</label>
                  <input type="email" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1B3A6B]" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Phone</label>
                  <input value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1B3A6B]" />
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Distribution %</label>
                <input type="number" step="0.5" min="0" max="100" value={form.distribution_percentage} onChange={e => setForm({ ...form, distribution_percentage: e.target.value })} className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1B3A6B]" />
                <p className="text-xs text-slate-500 mt-1">Total allocation will be: {newTotalPct.toFixed(1)}%</p>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Payment Method</label>
                <div className="flex gap-2">
                  {PAYMENT_METHODS.map(m => (
                    <button key={m} type="button" onClick={() => setForm({ ...form, payment_method: m })} className={`flex-1 py-2 text-xs font-medium rounded-lg border transition ${form.payment_method === m ? 'border-[#1B3A6B] bg-[#1B3A6B]/5 text-[#1B3A6B]' : 'border-slate-200 text-slate-600 hover:border-slate-300'}`}>{METHOD_LABEL[m]}</button>
                  ))}
                </div>
              </div>
              {(form.payment_method === 'ach' || form.payment_method === 'wire') && (
                <div className="space-y-3 bg-slate-50 rounded-lg p-3">
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">Bank Name</label>
                    <input value={form.bank_name} onChange={e => setForm({ ...form, bank_name: e.target.value })} className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1B3A6B]" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">Routing Number</label>
                    <input type="password" value={form.routing_number} onChange={e => setForm({ ...form, routing_number: e.target.value })} className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1B3A6B]" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">Account Number</label>
                    <input type="password" value={form.account_number} onChange={e => setForm({ ...form, account_number: e.target.value })} className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1B3A6B]" />
                  </div>
                </div>
              )}
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Notes</label>
                <textarea value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} rows={2} className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1B3A6B]" />
              </div>
              <div className="flex justify-end gap-3 pt-2">
                <button type="button" onClick={() => setShowModal(false)} className="px-4 py-2 text-sm text-slate-600 hover:text-slate-800">Cancel</button>
                <button onClick={handleSave} disabled={saving || !form.name} className="px-4 py-2 bg-[#1B3A6B] text-white text-sm font-medium rounded-lg hover:opacity-90 disabled:opacity-50">
                  {saving ? 'Saving...' : 'Save'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
