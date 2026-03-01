import { useState, useEffect } from 'react'
import { getDistributions, generateDistribution, finalizeDistribution } from '../../../services/loanServicingApi'
import { getCurrentUser } from '@/services/auth'

interface Props { token: string; isSuperAdmin: boolean }

const STATUS_BADGE: Record<string, string> = {
  draft: 'bg-yellow-100 text-yellow-800',
  finalized: 'bg-green-100 text-green-800',
}

function buildQuarters(): string[] {
  const quarters: string[] = []
  const now = new Date()
  let y = now.getFullYear()
  let q = Math.ceil((now.getMonth() + 1) / 3)
  for (let i = 0; i < 8; i++) {
    quarters.push(`Q${q} ${y}`)
    q--
    if (q === 0) { q = 4; y-- }
  }
  return quarters
}

export default function DistributionsTab({ token, isSuperAdmin }: Props) {
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

  const [statements, setStatements] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [toast, setToast] = useState('')
  const [generating, setGenerating] = useState(false)
  const [preview, setPreview] = useState<any>(null)
  const [selectedQuarter, setSelectedQuarter] = useState(buildQuarters()[0])
  const [useCustomDates, setUseCustomDates] = useState(false)
  const [customDates, setCustomDates] = useState({ start: '', end: '' })
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [companyName, setCompanyName] = useState<string>('')

  const quarters = buildQuarters()

  useEffect(() => {
    getCurrentUser()
      .then((user) => {
        const u = user as Record<string, any> | null
        setCompanyName(u?.company_name || u?.loan_company_name || 'Your Company')
      })
      .catch(() => setCompanyName('Your Company'))
  }, [])

  useEffect(() => { fetchStatements() }, [token])

  async function fetchStatements() {
    setLoading(true)
    try {
      const data = await getDistributions()
      setStatements(Array.isArray(data) ? data : data.statements || data.distributions || [])
    } catch { setStatements([]) }
    setLoading(false)
  }

  function showToastMsg(msg: string) { setToast(msg); setTimeout(() => setToast(''), 4000) }

  async function handlePreview() {
    setGenerating(true)
    try {
      const payload: Record<string, any> = { quarter: selectedQuarter, preview: true }
      if (useCustomDates) { payload.start_date = customDates.start; payload.end_date = customDates.end }
      const data = await generateDistribution(payload)
      setPreview(data)
    } catch { showToastMsg('Failed to generate preview') }
    setGenerating(false)
  }

  async function handleSave() {
    setGenerating(true)
    try {
      const payload: Record<string, any> = { quarter: selectedQuarter }
      if (useCustomDates) { payload.start_date = customDates.start; payload.end_date = customDates.end }
      await generateDistribution(payload)
      showToastMsg('Statement saved')
      setPreview(null)
      fetchStatements()
    } catch { showToastMsg('Failed to save statement') }
    setGenerating(false)
  }

  async function handleFinalize(id: string) {
    try {
      await finalizeDistribution(id)
      showToastMsg('Statement finalized')
      fetchStatements()
    } catch { showToastMsg('Failed to finalize') }
  }

  function handlePrint() { window.print() }

  const expandedStatement = statements.find((s: any) => s.id === expandedId)

  return (
    <div className="space-y-6">
      {toast && <div className="fixed top-4 right-4 z-50 bg-[#1B3A6B] text-white px-4 py-2 rounded-lg shadow-lg text-sm">{toast}</div>}

      {/* Generate Section */}
      <div className="bg-white rounded-xl shadow p-5 space-y-4">
        <h3 className="text-sm font-bold text-slate-800">Generate Distribution Statement</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">Quarter</label>
            <select value={selectedQuarter} onChange={e => setSelectedQuarter(e.target.value)} disabled={useCustomDates} className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1B3A6B] disabled:opacity-50">
              {quarters.map(q => <option key={q} value={q}>{q}</option>)}
            </select>
          </div>
          <div className="flex items-end gap-3">
            <label className="flex items-center gap-2 cursor-pointer pb-2">
              <input type="checkbox" checked={useCustomDates} onChange={e => setUseCustomDates(e.target.checked)} className="rounded border-slate-300" />
              <span className="text-sm text-slate-700">Custom date range</span>
            </label>
          </div>
        </div>
        {useCustomDates && (
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Start Date</label>
              <input type="date" value={customDates.start} onChange={e => setCustomDates({ ...customDates, start: e.target.value })} className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1B3A6B]" />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">End Date</label>
              <input type="date" value={customDates.end} onChange={e => setCustomDates({ ...customDates, end: e.target.value })} className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1B3A6B]" />
            </div>
          </div>
        )}
        <button onClick={handlePreview} disabled={generating} className="px-4 py-2 bg-[#1B3A6B] text-white text-sm font-medium rounded-lg hover:opacity-90 disabled:opacity-50">
          {generating ? 'Generating...' : 'Preview Distribution'}
        </button>

        {/* Preview Table */}
        {preview && (
          <div className="border border-slate-200 rounded-lg p-4 space-y-4">
            <h4 className="text-sm font-semibold text-slate-700">Preview: {selectedQuarter}</h4>
            {/* Per Property */}
            {preview.properties?.length > 0 && (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50 border-b">
                    <tr>
                      {['Address', 'Collected', 'Late Fees', 'Investor Amt', 'Entity Amt'].map(h => (
                        <th key={h} className="text-left px-3 py-2 text-xs font-semibold text-slate-500 uppercase">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {preview.properties.map((p: any, i: number) => (
                      <tr key={i} className="border-b last:border-0">
                        <td className="px-3 py-2 text-slate-800">{p.address}</td>
                        <td className="px-3 py-2 text-slate-600">${parseFloat(p.collected || 0).toLocaleString()}</td>
                        <td className="px-3 py-2 text-slate-600">${parseFloat(p.late_fees || 0).toLocaleString()}</td>
                        <td className="px-3 py-2 text-slate-600">${parseFloat(p.investor_amount || 0).toLocaleString()}</td>
                        <td className="px-3 py-2 text-slate-600">${parseFloat(p.entity_amount || 0).toLocaleString()}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            {/* Per Investor */}
            {preview.investors?.length > 0 && (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50 border-b">
                    <tr>
                      {['Name', 'Entity', '%', 'Amount'].map(h => (
                        <th key={h} className="text-left px-3 py-2 text-xs font-semibold text-slate-500 uppercase">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {preview.investors.map((inv: any, i: number) => (
                      <tr key={i} className="border-b last:border-0">
                        <td className="px-3 py-2 text-slate-800 font-medium">{inv.name}</td>
                        <td className="px-3 py-2 text-slate-600">{inv.entity_name}</td>
                        <td className="px-3 py-2 text-slate-600">{inv.percentage}%</td>
                        <td className="px-3 py-2 text-slate-800 font-medium">${parseFloat(inv.amount || 0).toLocaleString()}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            {/* Totals */}
            <div className="bg-slate-50 rounded-lg p-3 grid grid-cols-3 gap-4 text-sm">
              <div><span className="text-slate-500">Grand Total: </span><span className="font-bold text-slate-800">${parseFloat(preview.grand_total || 0).toLocaleString()}</span></div>
              <div><span className="text-slate-500">Investors: </span><span className="font-bold text-slate-800">${parseFloat(preview.investor_total || 0).toLocaleString()}</span></div>
              <div><span className="text-slate-500">Entity: </span><span className="font-bold text-slate-800">${parseFloat(preview.entity_total || 0).toLocaleString()}</span></div>
            </div>
            <div className="flex gap-3">
              <button onClick={handleSave} disabled={generating} className="px-4 py-2 bg-green-600 text-white text-sm font-medium rounded-lg hover:bg-green-700 disabled:opacity-50">Save Statement</button>
              <button onClick={() => setPreview(null)} className="px-4 py-2 text-sm text-slate-600 hover:text-slate-800">Cancel</button>
            </div>
          </div>
        )}
      </div>

      {/* Statements History */}
      <div className="space-y-3">
        <h3 className="text-sm font-bold text-slate-800">Statement History</h3>
        {loading ? (
          <div className="bg-white rounded-xl shadow p-8 text-center text-slate-400">Loading...</div>
        ) : statements.length === 0 ? (
          <div className="bg-white rounded-xl shadow p-8 text-center text-slate-400">No distribution statements yet.</div>
        ) : (
          <div className="bg-white rounded-xl shadow overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 border-b">
                <tr>
                  {['Quarter', 'Collected', 'Investors', 'Entity', 'Status', 'Actions'].map(h => (
                    <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {statements.map((s: any) => (
                  <tr key={s.id} className="border-b last:border-0 hover:bg-slate-50">
                    <td className="px-4 py-3 text-slate-800 font-medium">{s.quarter}</td>
                    <td className="px-4 py-3 text-slate-600">${parseFloat(s.total_collected || s.grand_total || 0).toLocaleString()}</td>
                    <td className="px-4 py-3 text-slate-600">${parseFloat(s.investor_total || 0).toLocaleString()}</td>
                    <td className="px-4 py-3 text-slate-600">${parseFloat(s.entity_total || 0).toLocaleString()}</td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-0.5 text-xs font-semibold rounded-full ${STATUS_BADGE[s.status] || 'bg-gray-100 text-gray-600'}`}>{s.status}</span>
                    </td>
                    <td className="px-4 py-3 flex gap-2">
                      <button onClick={() => setExpandedId(expandedId === s.id ? null : s.id)} className="px-3 py-1 text-xs bg-[#1B3A6B] text-white rounded hover:opacity-90">
                        {expandedId === s.id ? 'Hide' : 'View'}
                      </button>
                      {s.status === 'draft' && (
                        <button onClick={() => handleFinalize(s.id)} className="px-3 py-1 text-xs border border-green-600 text-green-600 rounded hover:bg-green-50">Finalize</button>
                      )}
                      <button onClick={handlePrint} className="px-3 py-1 text-xs border border-slate-300 text-slate-600 rounded hover:bg-slate-50">Print</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Statement Detail View */}
      {expandedStatement && (
        <div className="bg-white rounded-xl shadow p-6 space-y-4 print:shadow-none print:p-0" id="print-statement">
          <style>{`@media print { body > *:not(#print-statement) { display: none !important; } }`}</style>
          <div className="text-center space-y-1">
            <p className="text-lg font-bold text-slate-800 uppercase tracking-wide">{companyName}</p>
            <p className="text-sm text-slate-600">Quarterly Distribution Statement</p>
            <p className="text-sm text-slate-500">Period: {expandedStatement.quarter}</p>
            <p className="text-xs text-slate-400">Generated: {expandedStatement.created_at || expandedStatement.generated_date || '-'}</p>
          </div>
          <hr className="border-slate-200" />

          {/* Property rows */}
          {expandedStatement.properties?.length > 0 && (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 border-b">
                  <tr>
                    {['Property', 'Collected', 'Late Fees', 'Investor', 'Entity'].map(h => (
                      <th key={h} className="text-left px-3 py-2 text-xs font-semibold text-slate-500 uppercase">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {expandedStatement.properties.map((p: any, i: number) => (
                    <tr key={i} className="border-b last:border-0">
                      <td className="px-3 py-2 text-slate-800">{p.address}</td>
                      <td className="px-3 py-2">${parseFloat(p.collected || 0).toLocaleString()}</td>
                      <td className="px-3 py-2">${parseFloat(p.late_fees || 0).toLocaleString()}</td>
                      <td className="px-3 py-2">${parseFloat(p.investor_amount || 0).toLocaleString()}</td>
                      <td className="px-3 py-2">${parseFloat(p.entity_amount || 0).toLocaleString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Grand total */}
          <div className="bg-slate-50 rounded-lg p-3 grid grid-cols-3 gap-4 text-sm font-medium">
            <div>Grand Total: ${parseFloat(expandedStatement.grand_total || expandedStatement.total_collected || 0).toLocaleString()}</div>
            <div>Investors: ${parseFloat(expandedStatement.investor_total || 0).toLocaleString()}</div>
            <div>Entity: ${parseFloat(expandedStatement.entity_total || 0).toLocaleString()}</div>
          </div>

          {/* Per-investor rows */}
          {expandedStatement.investors?.length > 0 && (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 border-b">
                  <tr>
                    {['Investor', 'Entity', '%', 'Amount'].map(h => (
                      <th key={h} className="text-left px-3 py-2 text-xs font-semibold text-slate-500 uppercase">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {expandedStatement.investors.map((inv: any, i: number) => (
                    <tr key={i} className="border-b last:border-0">
                      <td className="px-3 py-2 text-slate-800 font-medium">{inv.name}</td>
                      <td className="px-3 py-2 text-slate-600">{inv.entity_name}</td>
                      <td className="px-3 py-2 text-slate-600">{inv.percentage}%</td>
                      <td className="px-3 py-2 text-slate-800 font-medium">${parseFloat(inv.amount || 0).toLocaleString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Entity remainder */}
          <div className="bg-[#1B3A6B]/5 border border-[#1B3A6B]/20 rounded-lg p-3 text-sm">
            <span className="text-slate-600">Entity Remainder ({companyName}): </span>
            <span className="font-bold text-[#1B3A6B]">${parseFloat(expandedStatement.entity_total || 0).toLocaleString()}</span>
          </div>

          <p className="text-xs text-slate-400 text-center italic">Confidential — For internal use only</p>
          <div className="flex justify-center print:hidden">
            <button onClick={handlePrint} className="px-4 py-2 bg-[#1B3A6B] text-white text-sm font-medium rounded-lg hover:opacity-90">Print Statement</button>
          </div>
        </div>
      )}
    </div>
  )
}
