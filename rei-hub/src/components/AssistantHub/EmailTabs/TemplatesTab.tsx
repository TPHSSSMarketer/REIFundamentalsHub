import { useState, useEffect, useCallback } from 'react'
import { Plus, Trash2 } from 'lucide-react'
import * as api from '@/services/emailMarketingApi'

// ── Types ─────────────────────────────────────────────────────

interface Template {
  id: string; name: string; subject: string; preview_text: string | null
  html_content: string; plain_text: string | null; category: string
  is_default: boolean; created_at: string; updated_at: string
}

// ═══════════════════════════════════════════════════════════════
// Component
// ═══════════════════════════════════════════════════════════════

export default function TemplatesTab() {
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
