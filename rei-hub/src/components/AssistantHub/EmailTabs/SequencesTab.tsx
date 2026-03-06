import { useState, useEffect, useCallback } from 'react'
import { Plus, ChevronDown, GitBranch, Play, Pause } from 'lucide-react'
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

interface Sequence {
  id: string; name: string; list_id: string; from_domain_id: string
  is_active: boolean; step_count: number; enrollment_count: number; created_at: string
}

// ═══════════════════════════════════════════════════════════════
// Component
// ═══════════════════════════════════════════════════════════════

export default function SequencesTab() {
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
