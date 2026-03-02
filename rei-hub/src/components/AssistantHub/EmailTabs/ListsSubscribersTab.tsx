import { useState, useEffect, useCallback, useRef } from 'react'
import { List, Plus, Trash2, Upload } from 'lucide-react'
import * as api from '@/services/emailMarketingApi'

// ── Types ─────────────────────────────────────────────────────

interface EmailListItem {
  id: string; name: string; description: string | null
  subscriber_count: number; created_at: string
}

interface Subscriber {
  id: string; email: string; first_name: string | null
  last_name: string | null; phone: string | null; status: string; subscribed_at: string
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

export default function ListsSubscribersTab() {
  const [lists, setLists] = useState<EmailListItem[]>([])
  const [selectedList, setSelectedList] = useState<string | null>(null)
  const [subscribers, setSubscribers] = useState<Subscriber[]>([])
  const [subTotal, setSubTotal] = useState(0)
  const [subPage, setSubPage] = useState(1)
  const [showCreate, setShowCreate] = useState(false)
  const [listForm, setListForm] = useState({ name: '', description: '' })
  const [subForm, setSubForm] = useState({ email: '', first_name: '', last_name: '' })
  const fileRef = useRef<HTMLInputElement>(null)

  const loadLists = useCallback(async () => {
    try {
      const data = await api.getLists()
      setLists(data.lists)
    } catch { /* ignore */ }
  }, [])

  useEffect(() => { loadLists() }, [loadLists])

  const loadSubs = useCallback(async (listId: string, page = 1) => {
    try {
      const data = await api.getSubscribers(listId, page)
      setSubscribers(data.subscribers as Subscriber[])
      setSubTotal(data.total)
      setSubPage(page)
    } catch { /* ignore */ }
  }, [])

  useEffect(() => { if (selectedList) loadSubs(selectedList) }, [selectedList, loadSubs])

  const handleCreateList = async () => {
    try {
      await api.createList(listForm)
      setListForm({ name: '', description: '' })
      setShowCreate(false)
      await loadLists()
    } catch (e: any) { alert(e.message) }
  }

  const handleDeleteList = async (id: string) => {
    if (!confirm('Delete this list and all subscribers?')) return
    await api.deleteList(id)
    if (selectedList === id) { setSelectedList(null); setSubscribers([]) }
    await loadLists()
  }

  const handleAddSub = async () => {
    if (!selectedList || !subForm.email) return
    try {
      await api.addSubscriber(selectedList, subForm)
      setSubForm({ email: '', first_name: '', last_name: '' })
      await loadSubs(selectedList)
      await loadLists()
    } catch (e: any) { alert(e.message) }
  }

  const handleDeleteSub = async (subId: string) => {
    if (!selectedList) return
    await api.deleteSubscriber(selectedList, subId)
    await loadSubs(selectedList)
    await loadLists()
  }

  const handleCSVImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!selectedList || !e.target.files?.[0]) return
    const text = await e.target.files[0].text()
    const lines = text.trim().split('\n')
    if (lines.length < 2) { alert('CSV must have a header row'); return }
    const headers = lines[0].split(',').map(h => h.trim().toLowerCase())
    const rows = lines.slice(1).map(line => {
      const vals = line.split(',').map(v => v.trim())
      const obj: Record<string, string> = {}
      headers.forEach((h, i) => { obj[h] = vals[i] ?? '' })
      return obj
    })
    try {
      const res = await api.importSubscribers(selectedList, rows)
      alert(`Import complete: ${res.added} added, ${res.skipped} skipped, ${res.errors} errors`)
      await loadSubs(selectedList)
      await loadLists()
    } catch (e: any) { alert(e.message) }
    if (fileRef.current) fileRef.current.value = ''
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      {/* Lists panel */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold text-slate-700">Your Lists</h3>
          <button onClick={() => setShowCreate(true)} className="text-primary-600 hover:text-primary-700 text-sm font-medium">
            <Plus className="w-4 h-4 inline" /> New
          </button>
        </div>

        {showCreate && (
          <div className="bg-white rounded-lg border border-slate-200 p-4 space-y-3">
            <input placeholder="List name" value={listForm.name} onChange={(e) => setListForm({ ...listForm, name: e.target.value })} className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm" />
            <input placeholder="Description (optional)" value={listForm.description} onChange={(e) => setListForm({ ...listForm, description: e.target.value })} className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm" />
            <div className="flex gap-2">
              <button onClick={handleCreateList} disabled={!listForm.name} className="px-3 py-1.5 bg-primary-600 text-white rounded-lg text-sm disabled:opacity-50">Create</button>
              <button onClick={() => setShowCreate(false)} className="px-3 py-1.5 text-slate-500 text-sm">Cancel</button>
            </div>
          </div>
        )}

        {lists.map((l) => (
          <div
            key={l.id}
            onClick={() => setSelectedList(l.id)}
            className={`bg-white rounded-lg border p-4 cursor-pointer transition-colors ${
              selectedList === l.id ? 'border-primary-300 bg-primary-50' : 'border-slate-200 hover:border-slate-300'
            }`}
          >
            <div className="flex items-center justify-between">
              <div>
                <h4 className="font-medium text-slate-800">{l.name}</h4>
                {l.description && <p className="text-xs text-slate-500 mt-0.5">{l.description}</p>}
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs text-slate-400">{l.subscriber_count} subs</span>
                <button onClick={(e) => { e.stopPropagation(); handleDeleteList(l.id) }} className="text-red-400 hover:text-red-600">
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Subscribers panel */}
      <div className="lg:col-span-2">
        {!selectedList ? (
          <div className="bg-white rounded-xl border border-slate-200 p-12 text-center text-slate-400">
            <List className="w-10 h-10 mx-auto mb-3 opacity-40" />
            Select a list to view subscribers
          </div>
        ) : (
          <div className="bg-white rounded-xl border border-slate-200">
            <div className="p-4 border-b border-slate-200 flex items-center justify-between">
              <h3 className="font-semibold text-slate-700">Subscribers ({subTotal})</h3>
              <div className="flex gap-2">
                <input type="file" ref={fileRef} accept=".csv" onChange={handleCSVImport} className="hidden" />
                <button onClick={() => fileRef.current?.click()} className="px-3 py-1.5 text-sm border border-slate-300 rounded-lg text-slate-600 hover:bg-slate-50">
                  <Upload className="w-3.5 h-3.5 inline mr-1" /> Import CSV
                </button>
              </div>
            </div>

            {/* Add subscriber inline */}
            <div className="px-4 py-3 bg-slate-50 border-b border-slate-200 flex flex-wrap md:flex-nowrap gap-2 items-center">
              <input placeholder="email@example.com" value={subForm.email} onChange={(e) => setSubForm({ ...subForm, email: e.target.value })} className="px-3 py-1.5 border border-slate-300 rounded text-sm flex-1 min-w-[150px] min-h-[40px]" />
              <input placeholder="First" value={subForm.first_name} onChange={(e) => setSubForm({ ...subForm, first_name: e.target.value })} className="px-3 py-1.5 border border-slate-300 rounded text-sm w-full md:w-24 min-h-[40px]" />
              <input placeholder="Last" value={subForm.last_name} onChange={(e) => setSubForm({ ...subForm, last_name: e.target.value })} className="px-3 py-1.5 border border-slate-300 rounded text-sm w-full md:w-24 min-h-[40px]" />
              <button onClick={handleAddSub} disabled={!subForm.email} className="px-3 py-1.5 bg-primary-600 text-white rounded text-sm disabled:opacity-50 min-h-[40px] w-full md:w-auto">Add</button>
            </div>

            {/* Table */}
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead><tr className="text-left text-slate-500 border-b">
                  <th className="px-4 py-2">Email</th><th className="py-2">Name</th>
                  <th className="py-2">Status</th><th className="py-2">Date</th><th className="py-2 w-10"></th>
                </tr></thead>
                <tbody>
                  {subscribers.map((s) => (
                    <tr key={s.id} className="border-b border-slate-50 hover:bg-slate-50">
                      <td className="px-4 py-2">{s.email}</td>
                      <td className="py-2">{[s.first_name, s.last_name].filter(Boolean).join(' ') || '-'}</td>
                      <td className="py-2"><StatusBadge status={s.status} /></td>
                      <td className="py-2 text-slate-400 text-xs">{new Date(s.subscribed_at).toLocaleDateString()}</td>
                      <td className="py-2">
                        <button onClick={() => handleDeleteSub(s.id)} className="text-red-400 hover:text-red-600"><Trash2 className="w-3.5 h-3.5" /></button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            {subTotal > 50 && (
              <div className="p-4 border-t border-slate-200 flex justify-center gap-2">
                <button disabled={subPage <= 1} onClick={() => loadSubs(selectedList, subPage - 1)} className="px-3 py-1 text-sm border rounded disabled:opacity-50">Prev</button>
                <span className="px-3 py-1 text-sm text-slate-500">Page {subPage}</span>
                <button disabled={subPage * 50 >= subTotal} onClick={() => loadSubs(selectedList, subPage + 1)} className="px-3 py-1 text-sm border rounded disabled:opacity-50">Next</button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
