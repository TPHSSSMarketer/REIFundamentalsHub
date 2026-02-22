import { useState, useEffect, useCallback, useRef } from 'react'
import {
  Globe, List, Send, GitBranch, FileText, Plus, Trash2, Check,
  Copy, ChevronDown, Upload, Eye, Code, X, BarChart3, Clock, Play, Pause,
} from 'lucide-react'
import * as api from '@/services/emailMarketingApi'

// ── Types ─────────────────────────────────────────────────────

type Tab = 'domains' | 'lists' | 'campaigns' | 'sequences' | 'templates'

interface Domain {
  id: string; domain: string; from_name: string; from_email: string
  status: string; provider: string; dns_records: Record<string, Record<string, string>> | null
  verified_at: string | null; created_at: string
}
interface EmailListItem {
  id: string; name: string; description: string | null
  subscriber_count: number; created_at: string
}
interface Subscriber {
  id: string; email: string; first_name: string | null
  last_name: string | null; phone: string | null; status: string; subscribed_at: string
}
interface Template {
  id: string; name: string; subject: string; preview_text: string | null
  html_content: string; plain_text: string | null; category: string
  is_default: boolean; created_at: string; updated_at: string
}
interface Campaign {
  id: string; name: string; subject: string; status: string
  from_domain_id: string; list_id: string; provider_used: string | null
  scheduled_at: string | null; sent_at: string | null
  total_sent: number; total_delivered: number; total_opened: number
  total_clicked: number; total_bounced: number; total_unsubscribed: number
  created_at: string
}
interface Sequence {
  id: string; name: string; list_id: string; from_domain_id: string
  is_active: boolean; step_count: number; enrollment_count: number; created_at: string
}
interface Usage {
  plan: string; limit: number; used: number; remaining: number
  resets_at: string | null; overage_rate: string; current_provider: string
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
// Main Page
// ═══════════════════════════════════════════════════════════════

export default function EmailMarketingPage() {
  const [tab, setTab] = useState<Tab>('domains')
  const [provider, setProvider] = useState('')

  const tabs: { key: Tab; label: string; icon: React.ReactNode }[] = [
    { key: 'domains', label: 'Domains', icon: <Globe className="w-4 h-4" /> },
    { key: 'lists', label: 'Lists & Subscribers', icon: <List className="w-4 h-4" /> },
    { key: 'campaigns', label: 'Campaigns', icon: <Send className="w-4 h-4" /> },
    { key: 'sequences', label: 'Sequences', icon: <GitBranch className="w-4 h-4" /> },
    { key: 'templates', label: 'Templates', icon: <FileText className="w-4 h-4" /> },
  ]

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-slate-800">Email Marketing</h1>
        {provider && (
          <span className={`px-3 py-1 rounded-full text-xs font-semibold ${provider === 'resend' ? 'bg-blue-100 text-blue-700' : 'bg-green-100 text-green-700'}`}>
            Sending via {provider.charAt(0).toUpperCase() + provider.slice(1)}
          </span>
        )}
      </div>

      {/* Tab bar */}
      <div className="flex gap-1 border-b border-slate-200 mb-6">
        {tabs.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
              tab === t.key
                ? 'border-primary-600 text-primary-600'
                : 'border-transparent text-slate-500 hover:text-slate-700'
            }`}
          >
            {t.icon}
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'domains' && <DomainsTab onProvider={setProvider} />}
      {tab === 'lists' && <ListsTab />}
      {tab === 'campaigns' && <CampaignsTab />}
      {tab === 'sequences' && <SequencesTab />}
      {tab === 'templates' && <TemplatesTab />}
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════
// TAB 1: Domains
// ═══════════════════════════════════════════════════════════════

function DomainsTab({ onProvider }: { onProvider: (p: string) => void }) {
  const [domains, setDomains] = useState<Domain[]>([])
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({ domain: '', from_name: '', from_email: '' })
  const [loading, setLoading] = useState(false)
  const [copied, setCopied] = useState('')

  const load = useCallback(async () => {
    try {
      const data = await api.getDomains()
      setDomains(data.domains as Domain[])
      onProvider(data.current_provider)
    } catch { /* ignore */ }
  }, [onProvider])

  useEffect(() => { load() }, [load])

  const handleAdd = async () => {
    setLoading(true)
    try {
      await api.addDomain(form)
      setForm({ domain: '', from_name: '', from_email: '' })
      setShowForm(false)
      await load()
    } catch (e: any) {
      alert(e.message)
    } finally { setLoading(false) }
  }

  const handleVerify = async (id: string) => {
    try {
      const res = await api.verifyDomain(id)
      alert(res.message)
      await load()
    } catch (e: any) { alert(e.message) }
  }

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this domain?')) return
    await api.deleteDomain(id)
    await load()
  }

  const copyText = (text: string, key: string) => {
    navigator.clipboard.writeText(text)
    setCopied(key)
    setTimeout(() => setCopied(''), 2000)
  }

  return (
    <div className="space-y-6">
      {domains.length === 0 && !showForm && (
        <div className="bg-white rounded-xl border border-slate-200 p-8 text-center">
          <Globe className="w-12 h-12 text-slate-300 mx-auto mb-4" />
          <h3 className="text-lg font-semibold text-slate-700 mb-2">Send emails from your own domain</h3>
          <p className="text-sm text-slate-500 mb-4">Set up a custom sending domain in 3 steps: enter domain, add DNS records, verify.</p>
          <button onClick={() => setShowForm(true)} className="px-4 py-2 bg-primary-600 text-white rounded-lg text-sm font-medium hover:bg-primary-700">
            <Plus className="w-4 h-4 inline mr-1" /> Add Domain
          </button>
        </div>
      )}

      {(showForm || domains.length > 0) && (
        <div className="flex justify-end">
          {!showForm && (
            <button onClick={() => setShowForm(true)} className="px-4 py-2 bg-primary-600 text-white rounded-lg text-sm font-medium hover:bg-primary-700">
              <Plus className="w-4 h-4 inline mr-1" /> Add Domain
            </button>
          )}
        </div>
      )}

      {showForm && (
        <div className="bg-white rounded-xl border border-slate-200 p-6">
          <h3 className="font-semibold text-slate-700 mb-4">Add Sending Domain</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
            <input placeholder="yourdomain.com" value={form.domain} onChange={(e) => setForm({ ...form, domain: e.target.value })} className="px-3 py-2 border border-slate-300 rounded-lg text-sm" />
            <input placeholder="From Name" value={form.from_name} onChange={(e) => setForm({ ...form, from_name: e.target.value })} className="px-3 py-2 border border-slate-300 rounded-lg text-sm" />
            <input placeholder="noreply@yourdomain.com" value={form.from_email} onChange={(e) => setForm({ ...form, from_email: e.target.value })} className="px-3 py-2 border border-slate-300 rounded-lg text-sm" />
          </div>
          <div className="flex gap-2">
            <button onClick={handleAdd} disabled={loading || !form.domain} className="px-4 py-2 bg-primary-600 text-white rounded-lg text-sm font-medium hover:bg-primary-700 disabled:opacity-50">
              {loading ? 'Adding...' : 'Add Domain'}
            </button>
            <button onClick={() => setShowForm(false)} className="px-4 py-2 text-slate-600 border border-slate-300 rounded-lg text-sm hover:bg-slate-50">Cancel</button>
          </div>
        </div>
      )}

      {domains.map((d) => (
        <div key={d.id} className="bg-white rounded-xl border border-slate-200 p-6">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="font-semibold text-slate-800">{d.domain}</h3>
              <p className="text-sm text-slate-500">{d.from_name} &lt;{d.from_email}&gt;</p>
            </div>
            <div className="flex items-center gap-3">
              <StatusBadge status={d.status} />
              <button onClick={() => handleDelete(d.id)} className="text-red-400 hover:text-red-600"><Trash2 className="w-4 h-4" /></button>
            </div>
          </div>

          {d.dns_records && d.status !== 'verified' && (
            <div className="mt-4">
              <h4 className="text-sm font-medium text-slate-600 mb-2">Add these DNS records to your domain registrar</h4>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead><tr className="text-left text-slate-500 border-b">
                    <th className="py-2 pr-4">Type</th><th className="py-2 pr-4">Host</th><th className="py-2 pr-4">Value</th><th className="py-2 w-10"></th>
                  </tr></thead>
                  <tbody>
                    {(['spf', 'dkim', 'dmarc'] as const).map((key) => {
                      const rec = d.dns_records?.[key]
                      if (!rec) return null
                      return (
                        <tr key={key} className="border-b border-slate-100">
                          <td className="py-2 pr-4 font-mono text-xs">{rec.type}</td>
                          <td className="py-2 pr-4 font-mono text-xs break-all">{rec.host}</td>
                          <td className="py-2 pr-4 font-mono text-xs break-all max-w-xs">{rec.value}</td>
                          <td className="py-2">
                            <button onClick={() => copyText(rec.value, `${d.id}-${key}`)} className="text-slate-400 hover:text-slate-600">
                              {copied === `${d.id}-${key}` ? <Check className="w-4 h-4 text-green-500" /> : <Copy className="w-4 h-4" />}
                            </button>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
              <div className="mt-4 flex items-center gap-3">
                <button onClick={() => handleVerify(d.id)} className="px-4 py-2 bg-green-600 text-white rounded-lg text-sm font-medium hover:bg-green-700">
                  <Check className="w-4 h-4 inline mr-1" /> Verify Now
                </button>
                <span className="text-xs text-slate-400">DNS propagation can take up to 48 hours</span>
              </div>
            </div>
          )}

          {d.status === 'verified' && d.verified_at && (
            <p className="text-sm text-green-600 mt-2">Verified on {new Date(d.verified_at).toLocaleDateString()}</p>
          )}
        </div>
      ))}
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════
// TAB 2: Lists & Subscribers
// ═══════════════════════════════════════════════════════════════

function ListsTab() {
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
            <div className="px-4 py-3 bg-slate-50 border-b border-slate-200 flex gap-2 items-center">
              <input placeholder="email@example.com" value={subForm.email} onChange={(e) => setSubForm({ ...subForm, email: e.target.value })} className="px-3 py-1.5 border border-slate-300 rounded text-sm flex-1" />
              <input placeholder="First" value={subForm.first_name} onChange={(e) => setSubForm({ ...subForm, first_name: e.target.value })} className="px-3 py-1.5 border border-slate-300 rounded text-sm w-24" />
              <input placeholder="Last" value={subForm.last_name} onChange={(e) => setSubForm({ ...subForm, last_name: e.target.value })} className="px-3 py-1.5 border border-slate-300 rounded text-sm w-24" />
              <button onClick={handleAddSub} disabled={!subForm.email} className="px-3 py-1.5 bg-primary-600 text-white rounded text-sm disabled:opacity-50">Add</button>
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

// ═══════════════════════════════════════════════════════════════
// TAB 3: Campaigns
// ═══════════════════════════════════════════════════════════════

function CampaignsTab() {
  const [campaigns, setCampaigns] = useState<Campaign[]>([])
  const [domains, setDomains] = useState<Domain[]>([])
  const [lists, setLists] = useState<EmailListItem[]>([])
  const [usage, setUsage] = useState<Usage | null>(null)
  const [showCreate, setShowCreate] = useState(false)
  const [showStats, setShowStats] = useState<string | null>(null)
  const [stats, setStats] = useState<Record<string, unknown> | null>(null)
  const [previewMode, setPreviewMode] = useState(false)
  const [scheduleMode, setScheduleMode] = useState(false)
  const [scheduleDate, setScheduleDate] = useState('')
  const [form, setForm] = useState({
    name: '', subject: '', preview_text: '', html_content: '', plain_text: '',
    from_domain_id: '', list_id: '',
  })

  const load = useCallback(async () => {
    const [c, d, l, u] = await Promise.all([
      api.getCampaigns(), api.getDomains(), api.getLists(), api.getUsage(),
    ])
    setCampaigns(c.campaigns as Campaign[])
    setDomains((d.domains as Domain[]).filter(dd => dd.status === 'verified'))
    setLists(l.lists)
    setUsage(u)
  }, [])

  useEffect(() => { load() }, [load])

  const handleCreate = async () => {
    try {
      await api.createCampaign(form)
      setShowCreate(false)
      setForm({ name: '', subject: '', preview_text: '', html_content: '', plain_text: '', from_domain_id: '', list_id: '' })
      await load()
    } catch (e: any) { alert(e.message) }
  }

  const handleSend = async (id: string) => {
    if (!confirm('Send this campaign now?')) return
    try {
      const res = await api.sendCampaign(id)
      alert(`Queued ${res.queued} emails for delivery`)
      await load()
    } catch (e: any) { alert(typeof e.message === 'string' ? e.message : JSON.stringify(e.message)) }
  }

  const handleSchedule = async (id: string) => {
    if (!scheduleDate) return
    try {
      await api.scheduleCampaign(id, scheduleDate)
      setScheduleMode(false)
      setScheduleDate('')
      await load()
    } catch (e: any) { alert(e.message) }
  }

  const handleStats = async (id: string) => {
    try {
      const data = await api.getCampaignStats(id)
      setStats(data)
      setShowStats(id)
    } catch (e: any) { alert(e.message) }
  }

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this campaign?')) return
    await api.deleteCampaign(id)
    await load()
  }

  const insertMerge = (field: string) => {
    setForm(prev => ({ ...prev, html_content: prev.html_content + `{{${field}}}` }))
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold text-slate-700">Campaigns</h3>
        <button onClick={() => setShowCreate(!showCreate)} className="px-4 py-2 bg-primary-600 text-white rounded-lg text-sm font-medium hover:bg-primary-700">
          <Plus className="w-4 h-4 inline mr-1" /> Create Campaign
        </button>
      </div>

      {/* Usage indicator */}
      {usage && (
        <div className="bg-white rounded-lg border border-slate-200 p-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm text-slate-600">{usage.used.toLocaleString()} of {usage.limit.toLocaleString()} emails used this month</span>
            {usage.used / usage.limit > 0.8 && <a href="/billing" className="text-xs text-primary-600 hover:underline">Upgrade for more</a>}
          </div>
          <div className="w-full bg-slate-100 rounded-full h-2">
            <div className="bg-primary-600 h-2 rounded-full transition-all" style={{ width: `${Math.min(100, (usage.used / usage.limit) * 100)}%` }} />
          </div>
        </div>
      )}

      {/* Create form */}
      {showCreate && (
        <div className="bg-white rounded-xl border border-slate-200 p-6 space-y-4">
          <h3 className="font-semibold text-slate-700">New Campaign</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <input placeholder="Campaign Name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="px-3 py-2 border border-slate-300 rounded-lg text-sm" />
            <input placeholder="Subject Line" value={form.subject} onChange={(e) => setForm({ ...form, subject: e.target.value })} className="px-3 py-2 border border-slate-300 rounded-lg text-sm" />
            <input placeholder="Preview Text (optional)" value={form.preview_text} onChange={(e) => setForm({ ...form, preview_text: e.target.value })} className="px-3 py-2 border border-slate-300 rounded-lg text-sm" />
            <select value={form.from_domain_id} onChange={(e) => setForm({ ...form, from_domain_id: e.target.value })} className="px-3 py-2 border border-slate-300 rounded-lg text-sm">
              <option value="">From Domain</option>
              {domains.map(d => <option key={d.id} value={d.id}>{d.from_name} &lt;{d.from_email}&gt;</option>)}
            </select>
            <select value={form.list_id} onChange={(e) => setForm({ ...form, list_id: e.target.value })} className="px-3 py-2 border border-slate-300 rounded-lg text-sm">
              <option value="">Send To List</option>
              {lists.map(l => <option key={l.id} value={l.id}>{l.name} ({l.subscriber_count})</option>)}
            </select>
          </div>

          {/* Merge fields */}
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs text-slate-500">Insert Merge Field:</span>
            {['first_name', 'last_name', 'email', 'city', 'property_address'].map(f => (
              <button key={f} onClick={() => insertMerge(f)} className="px-2 py-0.5 bg-slate-100 text-slate-600 rounded text-xs hover:bg-slate-200">
                {`{{${f}}}`}
              </button>
            ))}
          </div>

          {/* Editor */}
          <div className="flex items-center gap-2 mb-2">
            <button onClick={() => setPreviewMode(false)} className={`px-3 py-1 rounded text-xs font-medium ${!previewMode ? 'bg-slate-200' : 'bg-white border border-slate-200'}`}>
              <Code className="w-3 h-3 inline mr-1" /> HTML
            </button>
            <button onClick={() => setPreviewMode(true)} className={`px-3 py-1 rounded text-xs font-medium ${previewMode ? 'bg-slate-200' : 'bg-white border border-slate-200'}`}>
              <Eye className="w-3 h-3 inline mr-1" /> Preview
            </button>
          </div>
          {!previewMode ? (
            <textarea rows={10} placeholder="HTML content..." value={form.html_content} onChange={(e) => setForm({ ...form, html_content: e.target.value })} className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm font-mono" />
          ) : (
            <div className="border border-slate-300 rounded-lg p-4 min-h-[200px] prose prose-sm max-w-none" dangerouslySetInnerHTML={{ __html: form.html_content }} />
          )}

          <textarea rows={3} placeholder="Plain text version (optional)" value={form.plain_text} onChange={(e) => setForm({ ...form, plain_text: e.target.value })} className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm" />

          <p className="text-xs text-slate-400">CAN-SPAM footer with unsubscribe link and company address is automatically appended.</p>

          <div className="flex gap-2">
            <button onClick={handleCreate} disabled={!form.name || !form.subject || !form.html_content || !form.from_domain_id || !form.list_id} className="px-4 py-2 bg-primary-600 text-white rounded-lg text-sm font-medium disabled:opacity-50">Save Draft</button>
            <button onClick={() => setShowCreate(false)} className="px-4 py-2 text-slate-500 border border-slate-300 rounded-lg text-sm">Cancel</button>
          </div>
        </div>
      )}

      {/* Campaign cards */}
      {campaigns.map((c) => (
        <div key={c.id} className="bg-white rounded-xl border border-slate-200 p-6">
          <div className="flex items-center justify-between mb-3">
            <div>
              <h4 className="font-semibold text-slate-800">{c.name}</h4>
              <p className="text-sm text-slate-500">{c.subject}</p>
            </div>
            <StatusBadge status={c.status} />
          </div>

          {c.status === 'sent' && c.total_sent > 0 && (
            <div className="grid grid-cols-3 gap-4 mb-4 text-center">
              <div><span className="text-lg font-bold text-slate-800">{c.total_sent}</span><p className="text-xs text-slate-400">Sent</p></div>
              <div><span className="text-lg font-bold text-green-600">{c.total_sent > 0 ? ((c.total_opened / c.total_sent) * 100).toFixed(1) : 0}%</span><p className="text-xs text-slate-400">Open Rate</p></div>
              <div><span className="text-lg font-bold text-blue-600">{c.total_sent > 0 ? ((c.total_clicked / c.total_sent) * 100).toFixed(1) : 0}%</span><p className="text-xs text-slate-400">Click Rate</p></div>
            </div>
          )}

          <div className="flex gap-2 flex-wrap">
            {c.status === 'draft' && (
              <>
                <button onClick={() => handleSend(c.id)} className="px-3 py-1.5 bg-green-600 text-white rounded text-sm hover:bg-green-700">
                  <Send className="w-3.5 h-3.5 inline mr-1" /> Send Now
                </button>
                <button onClick={() => { setScheduleMode(true); setShowStats(c.id) }} className="px-3 py-1.5 border border-slate-300 text-slate-600 rounded text-sm hover:bg-slate-50">
                  <Clock className="w-3.5 h-3.5 inline mr-1" /> Schedule
                </button>
              </>
            )}
            {c.status === 'sent' && (
              <button onClick={() => handleStats(c.id)} className="px-3 py-1.5 border border-slate-300 text-slate-600 rounded text-sm hover:bg-slate-50">
                <BarChart3 className="w-3.5 h-3.5 inline mr-1" /> Stats
              </button>
            )}
            <button onClick={() => handleDelete(c.id)} className="px-3 py-1.5 text-red-500 border border-red-200 rounded text-sm hover:bg-red-50">
              <Trash2 className="w-3.5 h-3.5 inline mr-1" /> Delete
            </button>
          </div>

          {/* Inline schedule */}
          {scheduleMode && showStats === c.id && (
            <div className="mt-4 flex items-center gap-2">
              <input type="datetime-local" value={scheduleDate} onChange={(e) => setScheduleDate(e.target.value)} className="px-3 py-1.5 border border-slate-300 rounded text-sm" />
              <button onClick={() => handleSchedule(c.id)} className="px-3 py-1.5 bg-blue-600 text-white rounded text-sm">Confirm</button>
              <button onClick={() => { setScheduleMode(false); setShowStats(null) }} className="text-sm text-slate-500">Cancel</button>
            </div>
          )}
        </div>
      ))}

      {/* Stats modal */}
      {showStats && stats && !scheduleMode && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50" onClick={() => { setShowStats(null); setStats(null) }}>
          <div className="bg-white rounded-xl p-6 w-full max-w-md" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold text-slate-800">Campaign Stats</h3>
              <button onClick={() => { setShowStats(null); setStats(null) }}><X className="w-5 h-5 text-slate-400" /></button>
            </div>
            <div className="grid grid-cols-2 gap-4 text-center">
              <div className="p-3 bg-slate-50 rounded-lg">
                <p className="text-2xl font-bold text-slate-800">{(stats.total_sent as number) ?? 0}</p>
                <p className="text-xs text-slate-500">Sent</p>
              </div>
              <div className="p-3 bg-green-50 rounded-lg">
                <p className="text-2xl font-bold text-green-600">{(stats.total_delivered as number) ?? 0}</p>
                <p className="text-xs text-slate-500">Delivered</p>
              </div>
              <div className="p-3 bg-blue-50 rounded-lg">
                <p className="text-2xl font-bold text-blue-600">{stats.open_rate as number ?? 0}%</p>
                <p className="text-xs text-slate-500">Open Rate</p>
              </div>
              <div className="p-3 bg-purple-50 rounded-lg">
                <p className="text-2xl font-bold text-purple-600">{stats.click_rate as number ?? 0}%</p>
                <p className="text-xs text-slate-500">Click Rate</p>
              </div>
              <div className="p-3 bg-red-50 rounded-lg">
                <p className="text-2xl font-bold text-red-600">{(stats.total_bounced as number) ?? 0}</p>
                <p className="text-xs text-slate-500">Bounced</p>
              </div>
              <div className="p-3 bg-orange-50 rounded-lg">
                <p className="text-2xl font-bold text-orange-600">{stats.unsubscribe_rate as number ?? 0}%</p>
                <p className="text-xs text-slate-500">Unsubscribe Rate</p>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════
// TAB 4: Sequences
// ═══════════════════════════════════════════════════════════════

function SequencesTab() {
  const [sequences, setSequences] = useState<Sequence[]>([])
  const [domains, setDomains] = useState<Domain[]>([])
  const [lists, setLists] = useState<EmailListItem[]>([])
  const [showCreate, setShowCreate] = useState(false)
  const [expanded, setExpanded] = useState<string | null>(null)
  const [form, setForm] = useState({ name: '', list_id: '', from_domain_id: '' })
  const [stepForm, setStepForm] = useState({ delay_days: 0, subject: '', html_content: '', plain_text: '' })

  const load = useCallback(async () => {
    const [s, d, l] = await Promise.all([api.getSequences(), api.getDomains(), api.getLists()])
    setSequences(s.sequences as Sequence[])
    setDomains((d.domains as Domain[]).filter(dd => dd.status === 'verified'))
    setLists(l.lists)
  }, [])

  useEffect(() => { load() }, [load])

  const handleCreate = async () => {
    try {
      await api.createSequence(form)
      setShowCreate(false)
      setForm({ name: '', list_id: '', from_domain_id: '' })
      await load()
    } catch (e: any) { alert(e.message) }
  }

  const handleToggle = async (id: string) => {
    await api.activateSequence(id)
    await load()
  }

  const handleAddStep = async (seqId: string) => {
    const seq = sequences.find(s => s.id === seqId)
    try {
      await api.addSequenceStep(seqId, {
        step_number: (seq?.step_count ?? 0) + 1,
        delay_days: stepForm.delay_days,
        subject: stepForm.subject,
        html_content: stepForm.html_content,
        plain_text: stepForm.plain_text,
      })
      setStepForm({ delay_days: 0, subject: '', html_content: '', plain_text: '' })
      await load()
    } catch (e: any) { alert(e.message) }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold text-slate-700">Email Sequences</h3>
        <button onClick={() => setShowCreate(!showCreate)} className="px-4 py-2 bg-primary-600 text-white rounded-lg text-sm font-medium hover:bg-primary-700">
          <Plus className="w-4 h-4 inline mr-1" /> Create Sequence
        </button>
      </div>

      {showCreate && (
        <div className="bg-white rounded-xl border border-slate-200 p-6 space-y-4">
          <input placeholder="Sequence Name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm" />
          <div className="grid grid-cols-2 gap-4">
            <select value={form.list_id} onChange={(e) => setForm({ ...form, list_id: e.target.value })} className="px-3 py-2 border border-slate-300 rounded-lg text-sm">
              <option value="">Select List</option>
              {lists.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
            </select>
            <select value={form.from_domain_id} onChange={(e) => setForm({ ...form, from_domain_id: e.target.value })} className="px-3 py-2 border border-slate-300 rounded-lg text-sm">
              <option value="">From Domain</option>
              {domains.map(d => <option key={d.id} value={d.id}>{d.from_name}</option>)}
            </select>
          </div>
          <div className="flex gap-2">
            <button onClick={handleCreate} disabled={!form.name || !form.list_id || !form.from_domain_id} className="px-4 py-2 bg-primary-600 text-white rounded-lg text-sm disabled:opacity-50">Create</button>
            <button onClick={() => setShowCreate(false)} className="px-4 py-2 text-slate-500 text-sm">Cancel</button>
          </div>
        </div>
      )}

      {sequences.map((seq) => (
        <div key={seq.id} className="bg-white rounded-xl border border-slate-200 p-6">
          <div className="flex items-center justify-between mb-3">
            <div className="cursor-pointer" onClick={() => setExpanded(expanded === seq.id ? null : seq.id)}>
              <h4 className="font-semibold text-slate-800">{seq.name}</h4>
              <p className="text-xs text-slate-500">{seq.step_count} steps &middot; {seq.enrollment_count} enrolled</p>
            </div>
            <div className="flex items-center gap-3">
              <button onClick={() => handleToggle(seq.id)} className={`flex items-center gap-1 px-3 py-1 rounded-full text-xs font-medium ${seq.is_active ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-500'}`}>
                {seq.is_active ? <><Pause className="w-3 h-3" /> Active</> : <><Play className="w-3 h-3" /> Inactive</>}
              </button>
              <ChevronDown className={`w-4 h-4 text-slate-400 transition-transform cursor-pointer ${expanded === seq.id ? 'rotate-180' : ''}`} onClick={() => setExpanded(expanded === seq.id ? null : seq.id)} />
            </div>
          </div>

          {expanded === seq.id && (
            <div className="mt-4 space-y-4 border-t border-slate-200 pt-4">
              {/* Timeline placeholder — steps already tracked by step_count */}
              <div className="flex items-center gap-2 text-sm text-slate-500">
                <GitBranch className="w-4 h-4" />
                <span>Day 0 &rarr; Day 3 &rarr; Day 7 ...</span>
              </div>

              {/* Add step form */}
              <div className="bg-slate-50 rounded-lg p-4 space-y-3">
                <h5 className="text-sm font-medium text-slate-600">Add Step</h5>
                <div className="grid grid-cols-2 gap-3">
                  <input type="number" placeholder="Delay (days)" value={stepForm.delay_days} onChange={(e) => setStepForm({ ...stepForm, delay_days: parseInt(e.target.value) || 0 })} className="px-3 py-2 border border-slate-300 rounded text-sm" />
                  <input placeholder="Subject" value={stepForm.subject} onChange={(e) => setStepForm({ ...stepForm, subject: e.target.value })} className="px-3 py-2 border border-slate-300 rounded text-sm" />
                </div>
                <textarea rows={4} placeholder="HTML content" value={stepForm.html_content} onChange={(e) => setStepForm({ ...stepForm, html_content: e.target.value })} className="w-full px-3 py-2 border border-slate-300 rounded text-sm font-mono" />
                <button onClick={() => handleAddStep(seq.id)} disabled={!stepForm.subject || !stepForm.html_content} className="px-3 py-1.5 bg-primary-600 text-white rounded text-sm disabled:opacity-50">Add Step</button>
              </div>
            </div>
          )}
        </div>
      ))}
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════
// TAB 5: Templates
// ═══════════════════════════════════════════════════════════════

function TemplatesTab() {
  const [templates, setTemplates] = useState<Template[]>([])
  const [showCreate, setShowCreate] = useState(false)
  const [form, setForm] = useState({ name: '', subject: '', preview_text: '', html_content: '', plain_text: '', category: 'custom' })

  const load = useCallback(async () => {
    try {
      const data = await api.getTemplates()
      setTemplates(data.templates as Template[])
    } catch { /* ignore */ }
  }, [])

  useEffect(() => { load() }, [load])

  const handleCreate = async () => {
    try {
      await api.createTemplate(form)
      setShowCreate(false)
      setForm({ name: '', subject: '', preview_text: '', html_content: '', plain_text: '', category: 'custom' })
      await load()
    } catch (e: any) { alert(e.message) }
  }

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this template?')) return
    await api.deleteTemplate(id)
    await load()
  }

  const categories = [...new Set(templates.map(t => t.category))]

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold text-slate-700">Email Templates</h3>
        <button onClick={() => setShowCreate(!showCreate)} className="px-4 py-2 bg-primary-600 text-white rounded-lg text-sm font-medium hover:bg-primary-700">
          <Plus className="w-4 h-4 inline mr-1" /> Create Template
        </button>
      </div>

      {showCreate && (
        <div className="bg-white rounded-xl border border-slate-200 p-6 space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <input placeholder="Template Name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="px-3 py-2 border border-slate-300 rounded-lg text-sm" />
            <input placeholder="Subject Line" value={form.subject} onChange={(e) => setForm({ ...form, subject: e.target.value })} className="px-3 py-2 border border-slate-300 rounded-lg text-sm" />
            <input placeholder="Preview Text (optional)" value={form.preview_text} onChange={(e) => setForm({ ...form, preview_text: e.target.value })} className="px-3 py-2 border border-slate-300 rounded-lg text-sm" />
            <select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} className="px-3 py-2 border border-slate-300 rounded-lg text-sm">
              <option value="custom">Custom</option>
              <option value="motivated_seller">Motivated Seller</option>
              <option value="follow_up">Follow Up</option>
              <option value="cash_buyer">Cash Buyer</option>
            </select>
          </div>
          <textarea rows={8} placeholder="HTML content" value={form.html_content} onChange={(e) => setForm({ ...form, html_content: e.target.value })} className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm font-mono" />
          <textarea rows={3} placeholder="Plain text (optional)" value={form.plain_text} onChange={(e) => setForm({ ...form, plain_text: e.target.value })} className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm" />
          <div className="flex gap-2">
            <button onClick={handleCreate} disabled={!form.name || !form.subject || !form.html_content} className="px-4 py-2 bg-primary-600 text-white rounded-lg text-sm disabled:opacity-50">Save Template</button>
            <button onClick={() => setShowCreate(false)} className="px-4 py-2 text-slate-500 text-sm">Cancel</button>
          </div>
        </div>
      )}

      {categories.map((cat) => (
        <div key={cat}>
          <h4 className="text-sm font-medium text-slate-500 uppercase tracking-wide mb-3">{cat.replace(/_/g, ' ')}</h4>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {templates.filter(t => t.category === cat).map((t) => (
              <div key={t.id} className="bg-white rounded-lg border border-slate-200 p-4">
                <div className="flex items-center justify-between mb-2">
                  <h5 className="font-medium text-slate-800 text-sm">{t.name}</h5>
                  {t.is_default && <span className="text-[10px] bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded">Default</span>}
                </div>
                <p className="text-xs text-slate-500 mb-3 truncate">{t.subject}</p>
                <div className="flex gap-2">
                  <button className="text-xs text-primary-600 hover:underline">Use in Campaign</button>
                  <button onClick={() => handleDelete(t.id)} className="text-xs text-red-400 hover:text-red-600">
                    <Trash2 className="w-3 h-3 inline" /> Delete
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}
