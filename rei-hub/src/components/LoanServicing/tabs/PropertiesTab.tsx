import { useState, useEffect, type FormEvent } from 'react'
import {
  getProperties,
  createProperty,
  getStateLaws,
  getDefaults,
} from '../../../services/loanServicingApi'
import DefaultTracker from '../DefaultTracker'

interface Props {
  isSuperAdmin: boolean
  onNavigateContracts?: () => void
}

const US_STATES = [
  'AL','AK','AZ','AR','CA','CO','CT','DE','FL','GA','HI','ID','IL','IN','IA',
  'KS','KY','LA','ME','MD','MA','MI','MN','MS','MO','MT','NE','NV','NH','NJ',
  'NM','NY','NC','ND','OH','OK','OR','PA','RI','SC','SD','TN','TX','UT','VT',
  'VA','WA','WV','WI','WY',
]

const STATUS_BADGE: Record<string, string> = {
  current: 'bg-green-100 text-green-800',
  potential: 'bg-yellow-100 text-yellow-800',
  default: 'bg-red-100 text-red-800',
  paid_off: 'bg-gray-100 text-gray-600',
}

const LAW_TOPICS = [
  'Contract for Deed',
  'Owner Finance',
  'Subject To',
  'Rent to Own',
  'Eviction Timeline',
  'Foreclosure',
  'Payment Collection',
]

export default function PropertiesTab({ isSuperAdmin: _isSuperAdmin, onNavigateContracts }: Props) {
  const [properties, setProperties] = useState<any[]>([])
  const [selectedProperty, setSelectedProperty] = useState<any>(null)
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [showDetailPanel, setShowDetailPanel] = useState(false)
  const [loading, setLoading] = useState(true)
  const [toast, setToast] = useState('')

  // Detail panel state
  const [stateLaws, setStateLaws] = useState<any>(null)
  const [lawsLoading, setLawsLoading] = useState(false)
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({ 'Eviction Timeline': true })
  const [defaultData, setDefaultData] = useState<any>(null)
  const [activeCfd, setActiveCfd] = useState<any>(null)

  // Create form
  const [form, setForm] = useState({
    trust_name: '', trust_number: '', trustee_name: '', beneficiary: '',
    property_address: '', city: '', state: '', zip: '',
  })
  const [creating, setCreating] = useState(false)

  useEffect(() => { fetchProperties() }, [])

  async function fetchProperties() {
    setLoading(true)
    try {
      const data = await getProperties() as any
      setProperties(Array.isArray(data) ? data : data.properties || [])
    } catch { setProperties([]) }
    setLoading(false)
  }

  async function openDetail(prop: any) {
    setSelectedProperty(prop)
    setShowDetailPanel(true)
    setLawsLoading(true)
    setStateLaws(null)
    setDefaultData(null)
    setActiveCfd(prop.active_cfd || null)
    try {
      const laws = await getStateLaws(prop.trust_id || prop.id)
      setStateLaws(laws)
    } catch { setStateLaws(null) }
    setLawsLoading(false)
    try {
      const defs = await getDefaults({ trust_id: prop.trust_id || prop.id }) as any
      const active = (Array.isArray(defs) ? defs : defs.defaults || []).find((d: any) => d.status === 'active')
      setDefaultData(active || null)
    } catch { setDefaultData(null) }
  }

  async function handleCreate(e: FormEvent) {
    e.preventDefault()
    setCreating(true)
    try {
      await createProperty(form)
      showToast('Property created. State law research running...')
      setShowCreateModal(false)
      setForm({ trust_name: '', trust_number: '', trustee_name: '', beneficiary: '', property_address: '', city: '', state: '', zip: '' })
      fetchProperties()
    } catch { showToast('Failed to create property') }
    setCreating(false)
  }

  function showToast(msg: string) {
    setToast(msg)
    setTimeout(() => setToast(''), 4000)
  }

  const stats = {
    total: properties.length,
    activeCfds: properties.filter((p: any) => p.status === 'current').length,
    inDefault: properties.filter((p: any) => p.status === 'default').length,
    potential: properties.filter((p: any) => p.status === 'potential').length,
  }

  return (
    <div className="space-y-4">
      {/* Toast */}
      {toast && (
        <div className="fixed top-4 right-4 z-50 bg-[#1B3A6B] text-white px-4 py-2 rounded-lg shadow-lg text-sm">
          {toast}
        </div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold text-slate-800">Properties</h2>
        <button onClick={() => setShowCreateModal(true)} className="px-4 py-2 bg-[#1B3A6B] text-white text-sm font-medium rounded-lg hover:opacity-90">
          + Add Property
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: 'Total Properties', value: stats.total, color: 'text-slate-800' },
          { label: 'Active CFDs', value: stats.activeCfds, color: 'text-[#1B3A6B]' },
          { label: 'In Default', value: stats.inDefault, color: 'text-[#CC2229]' },
          { label: 'Potential', value: stats.potential, color: 'text-yellow-600' },
        ].map((s) => (
          <div key={s.label} className="bg-white rounded-xl shadow p-4">
            <p className="text-xs text-slate-500">{s.label}</p>
            <p className={`text-2xl font-bold ${s.color}`}>{s.value}</p>
          </div>
        ))}
      </div>

      {/* Table (desktop) */}
      {loading ? (
        <div className="bg-white rounded-xl shadow p-8 text-center text-slate-400">Loading...</div>
      ) : properties.length === 0 ? (
        <div className="bg-white rounded-xl shadow p-8 text-center text-slate-400">No properties yet. Add your first property above.</div>
      ) : (
        <>
          <div className="hidden md:block bg-white rounded-xl shadow overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 border-b">
                <tr>
                  {['Address', 'State', 'Trust Name', 'Status', 'Actions'].map((h) => (
                    <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {properties.map((p: any) => (
                  <tr key={p.id || p.trust_id} className="border-b last:border-0 hover:bg-slate-50">
                    <td className="px-4 py-3 text-slate-800">{p.property_address}</td>
                    <td className="px-4 py-3 text-slate-600">{p.state}</td>
                    <td className="px-4 py-3 text-slate-600">{p.trust_name}</td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-0.5 text-xs font-semibold rounded-full ${STATUS_BADGE[p.status] || 'bg-gray-100 text-gray-600'}`}>
                        {p.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 flex gap-2">
                      <button onClick={() => openDetail(p)} className="px-3 py-1 text-xs bg-[#1B3A6B] text-white rounded hover:opacity-90">View</button>
                      <button onClick={() => onNavigateContracts?.()} className="px-3 py-1 text-xs border border-[#1B3A6B] text-[#1B3A6B] rounded hover:bg-slate-50">Add CFD</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Cards (mobile) */}
          <div className="md:hidden space-y-3">
            {properties.map((p: any) => (
              <div key={p.id || p.trust_id} className="bg-white rounded-xl shadow p-4 space-y-2">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-semibold text-slate-800">{p.property_address}</p>
                  <span className={`px-2 py-0.5 text-xs font-semibold rounded-full ${STATUS_BADGE[p.status] || 'bg-gray-100 text-gray-600'}`}>{p.status}</span>
                </div>
                <p className="text-xs text-slate-500">{p.trust_name} &middot; {p.state}</p>
                <div className="flex gap-2">
                  <button onClick={() => openDetail(p)} className="px-3 py-1 text-xs bg-[#1B3A6B] text-white rounded hover:opacity-90">View</button>
                  <button onClick={() => onNavigateContracts?.()} className="px-3 py-1 text-xs border border-[#1B3A6B] text-[#1B3A6B] rounded hover:bg-slate-50">Add CFD</button>
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {/* Create Property Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-lg mx-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between px-6 py-4 border-b">
              <h3 className="text-lg font-bold text-slate-800">Add New Property</h3>
              <button onClick={() => setShowCreateModal(false)} className="text-slate-400 hover:text-slate-600 text-xl">&times;</button>
            </div>
            <form onSubmit={handleCreate} className="p-6 space-y-4">
              {[
                { key: 'trust_name' as const, label: 'Trust Name *', req: true },
                { key: 'trust_number' as const, label: 'Trust Number', req: false },
                { key: 'trustee_name' as const, label: 'Trustee Name', req: false },
                { key: 'beneficiary' as const, label: 'Beneficiary', req: false },
                { key: 'property_address' as const, label: 'Property Address *', req: true },
                { key: 'city' as const, label: 'City', req: false },
              ].map((f) => (
                <div key={f.key}>
                  <label className="block text-sm font-medium text-slate-700 mb-1">{f.label}</label>
                  <input
                    required={f.req}
                    value={form[f.key]}
                    onChange={(e) => setForm({ ...form, [f.key]: e.target.value })}
                    className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1B3A6B]"
                  />
                </div>
              ))}
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">State</label>
                <select
                  value={form.state}
                  onChange={(e) => setForm({ ...form, state: e.target.value })}
                  className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1B3A6B]"
                >
                  <option value="">Select state</option>
                  {US_STATES.map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">ZIP</label>
                <input
                  value={form.zip}
                  onChange={(e) => setForm({ ...form, zip: e.target.value })}
                  className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1B3A6B]"
                />
              </div>
              <div className="flex justify-end gap-3 pt-2">
                <button type="button" onClick={() => setShowCreateModal(false)} className="px-4 py-2 text-sm text-slate-600 hover:text-slate-800">Cancel</button>
                <button type="submit" disabled={creating} className="px-4 py-2 bg-[#1B3A6B] text-white text-sm font-medium rounded-lg hover:opacity-90 disabled:opacity-50">
                  {creating ? 'Creating...' : 'Create Property'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Property Detail Panel */}
      {showDetailPanel && selectedProperty && (
        <>
          <div className="fixed inset-0 z-40 bg-black/30 md:bg-black/20" onClick={() => setShowDetailPanel(false)} />
          <div className="fixed top-0 right-0 z-50 h-full w-full md:w-[600px] bg-white shadow-xl overflow-y-auto">
            {/* Header */}
            <div className="sticky top-0 bg-white border-b px-5 py-4 flex items-center justify-between z-10">
              <div className="flex items-center gap-3 min-w-0">
                <button onClick={() => setShowDetailPanel(false)} className="text-slate-400 hover:text-slate-600 text-xl shrink-0">&times;</button>
                <div className="min-w-0">
                  <p className="font-bold text-slate-800 truncate">{selectedProperty.property_address}</p>
                  <span className={`px-2 py-0.5 text-xs font-semibold rounded-full ${STATUS_BADGE[selectedProperty.status] || 'bg-gray-100 text-gray-600'}`}>
                    {selectedProperty.status}
                  </span>
                </div>
              </div>
              <button className="px-3 py-1 text-xs border border-[#1B3A6B] text-[#1B3A6B] rounded hover:bg-slate-50">Edit</button>
            </div>

            <div className="p-5 space-y-6">
              {/* State Law Research */}
              <div>
                <div className="bg-slate-100 px-4 py-2 rounded-t-lg flex items-center justify-between">
                  <span className="text-sm font-semibold text-slate-700">State Law Research</span>
                  {stateLaws?.provider && (
                    <span className="text-xs text-slate-500">{stateLaws.provider} &middot; {stateLaws.date || 'Recent'}</span>
                  )}
                </div>
                <div className="border border-t-0 border-slate-200 rounded-b-lg p-4 space-y-3">
                  <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3">
                    <p className="text-xs text-yellow-800 font-semibold">
                      &#9888; AI-generated. Consult an attorney before legal action.
                    </p>
                  </div>

                  {lawsLoading ? (
                    <div className="flex items-center gap-2 py-4">
                      <div className="w-4 h-4 border-2 border-[#1B3A6B] border-t-transparent rounded-full animate-spin" />
                      <span className="text-sm text-slate-500">Loading research...</span>
                    </div>
                  ) : !stateLaws?.sections && !stateLaws?.topics ? (
                    <p className="text-sm text-slate-500 py-2">Research in progress... Check back shortly.</p>
                  ) : (
                    LAW_TOPICS.map((topic) => {
                      const section = (stateLaws.sections || stateLaws.topics || []).find((s: any) => s.title === topic || s.topic === topic)
                      const isEviction = topic === 'Eviction Timeline'
                      const expanded = expandedSections[topic] || false
                      return (
                        <div key={topic} className={`border rounded-lg overflow-hidden ${isEviction ? 'border-l-4 border-l-[#CC2229]' : 'border-slate-200'}`}>
                          <button
                            onClick={() => setExpandedSections((prev: Record<string, boolean>) => ({ ...prev, [topic]: !prev[topic] }))}
                            className="w-full flex items-center justify-between px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
                          >
                            <span>{topic}</span>
                            <span className="text-slate-400">{expanded ? '\u25B2' : '\u25BC'}</span>
                          </button>
                          {expanded && section && (
                            <div className="px-3 pb-3 text-xs text-slate-600 space-y-1">
                              <p>{section.summary || section.content}</p>
                              {section.citations && <p className="text-slate-400 italic">{section.citations}</p>}
                            </div>
                          )}
                        </div>
                      )
                    })
                  )}
                </div>
              </div>

              {/* Active CFD */}
              <div>
                <h4 className="text-sm font-semibold text-slate-700 mb-2">Active CFD</h4>
                {activeCfd ? (
                  <div className="bg-white border border-slate-200 rounded-lg p-4 space-y-1 text-sm">
                    <p className="text-slate-800 font-medium">Account #{activeCfd.account_number}</p>
                    <p className="text-slate-600">Buyer: {activeCfd.buyer_name}</p>
                    <p className="text-slate-600">Balance: ${activeCfd.current_balance?.toLocaleString()}</p>
                    <p className="text-slate-600">Monthly: ${activeCfd.monthly_payment?.toLocaleString()}</p>
                    <p className="text-slate-600">Next Due: {activeCfd.next_due_date}</p>
                    {activeCfd.days_until_due != null && (
                      <p className={activeCfd.days_until_due >= 0 ? 'text-green-600 font-medium' : 'text-[#CC2229] font-medium'}>
                        {activeCfd.days_until_due >= 0 ? `${activeCfd.days_until_due} days until due` : `${Math.abs(activeCfd.days_until_due)} days late`}
                      </p>
                    )}
                  </div>
                ) : (
                  <div className="bg-slate-50 border border-slate-200 rounded-lg p-4 text-center">
                    <p className="text-sm text-slate-500">No active contract</p>
                    <button onClick={() => onNavigateContracts?.()} className="mt-2 px-3 py-1 text-xs bg-[#1B3A6B] text-white rounded hover:opacity-90">
                      Create First CFD
                    </button>
                  </div>
                )}
              </div>

              {/* Default Tracker */}
              <DefaultTracker
                defaultData={defaultData}
                landTrustState={selectedProperty.state || ''}
                onMarkSent={() => {}}
                onMarkCured={() => {}}
                onProceedEviction={() => {}}
              />
            </div>
          </div>
        </>
      )}
    </div>
  )
}
