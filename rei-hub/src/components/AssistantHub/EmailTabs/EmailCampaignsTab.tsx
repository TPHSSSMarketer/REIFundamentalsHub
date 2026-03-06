import { useState, useEffect, useCallback } from 'react'
import { Send, Plus, Trash2, Code, Eye, BarChart3, Clock, X } from 'lucide-react'
import DOMPurify from 'dompurify'
import * as api from '@/services/emailMarketingApi'

// ── Types ─────────────────────────────────────────────────────

interface Domain {
  id: string; domain: string; from_name: string; from_email: string
  status: string; provider: string; dns_records: Record<string, Record<string, string>> | null
  verified_at: string | null; created_at: string
}

interface EmailListItem {
  id: string; name: string; description: string | null
  subscriber_count: number; created_at: string
}

interface Campaign {
  id: string; name: string; subject: string; status: string
  from_domain_id: string; list_id: string; provider_used: string | null
  scheduled_at: string | null; sent_at: string | null
  total_sent: number; total_delivered: number; total_opened: number
  total_clicked: number; total_bounced: number; total_unsubscribed: number
  created_at: string
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
// Component
// ═══════════════════════════════════════════════════════════════

export default function EmailCampaignsTab() {
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
            <div className="border border-slate-300 rounded-lg p-4 min-h-[200px] prose prose-sm max-w-none" dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(form.html_content) }} />
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
