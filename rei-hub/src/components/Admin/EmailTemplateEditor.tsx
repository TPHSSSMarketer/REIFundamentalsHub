/**
 * EmailTemplateEditor — Admin UI for customizing transactional email templates.
 *
 * Grouped by category (Onboarding, Billing, AI Credits, Leads).
 * Each template expands into an editor with subject, body, variable chips,
 * live preview, send-test, and reset-to-default.
 */

import { useState, useEffect, useRef, useCallback } from 'react'
import {
  Mail,
  ChevronDown,
  ChevronRight,
  Save,
  RotateCcw,
  Send,
  Eye,
  Loader2,
  Code,
} from 'lucide-react'
import {
  getEmailTemplates,
  getEmailTemplate,
  saveEmailTemplate,
  resetEmailTemplate,
  previewEmailTemplate,
  testEmailTemplate,
  type EmailTemplateStatus,
  type EmailTemplateDetail,
} from '@/services/emailTemplateApi'
import { toast } from 'sonner'

// ── Category ordering & colors ──────────────────────────────────────

const CATEGORY_ORDER = ['Onboarding', 'Billing', 'AI Credits', 'Leads', 'Negotiations']

const CATEGORY_COLORS: Record<string, string> = {
  Onboarding: 'bg-blue-100 text-blue-700',
  Billing: 'bg-green-100 text-green-700',
  'AI Credits': 'bg-purple-100 text-purple-700',
  Leads: 'bg-amber-100 text-amber-700',
  Negotiations: 'bg-rose-100 text-rose-700',
}

// ── Main Component ──────────────────────────────────────────────────

export default function EmailTemplateEditor() {
  const [templates, setTemplates] = useState<EmailTemplateStatus[]>([])
  const [loading, setLoading] = useState(true)
  const [expandedSlug, setExpandedSlug] = useState<string | null>(null)

  const loadTemplates = useCallback(async () => {
    try {
      const data = await getEmailTemplates()
      setTemplates(data)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to load templates')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadTemplates()
  }, [loadTemplates])

  if (loading) {
    return (
      <div className="flex items-center justify-center h-32">
        <Loader2 className="w-5 h-5 animate-spin text-primary-500" />
      </div>
    )
  }

  // Group templates by category
  const grouped: Record<string, EmailTemplateStatus[]> = {}
  for (const t of templates) {
    if (!grouped[t.category]) grouped[t.category] = []
    grouped[t.category].push(t)
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2 mb-1">
        <Mail className="w-5 h-5 text-primary-500" />
        <h2 className="text-lg font-semibold text-slate-800">Email Templates</h2>
      </div>
      <p className="text-sm text-slate-600 -mt-4">
        Customize the subject line and body of transactional emails. Changes apply immediately to all new emails sent.
      </p>

      {CATEGORY_ORDER.map((category) => {
        const items = grouped[category]
        if (!items || items.length === 0) return null
        return (
          <div key={category}>
            <div className="flex items-center gap-2 mb-3">
              <span
                className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
                  CATEGORY_COLORS[category] || 'bg-slate-100 text-slate-600'
                }`}
              >
                {category}
              </span>
              <div className="flex-1 h-px bg-slate-200" />
            </div>

            <div className="space-y-2">
              {items.map((t) => (
                <TemplateCard
                  key={t.template_type}
                  template={t}
                  isExpanded={expandedSlug === t.template_type}
                  onToggle={() =>
                    setExpandedSlug(
                      expandedSlug === t.template_type ? null : t.template_type
                    )
                  }
                  onSaved={loadTemplates}
                />
              ))}
            </div>
          </div>
        )
      })}
    </div>
  )
}

// ── Template Card (expandable) ──────────────────────────────────────

function TemplateCard({
  template,
  isExpanded,
  onToggle,
  onSaved,
}: {
  template: EmailTemplateStatus
  isExpanded: boolean
  onToggle: () => void
  onSaved: () => void
}) {
  return (
    <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
      {/* Header — always visible */}
      <button
        onClick={onToggle}
        className="w-full flex items-center gap-3 p-4 text-left hover:bg-slate-50 transition-colors"
      >
        {isExpanded ? (
          <ChevronDown className="w-4 h-4 text-slate-400 shrink-0" />
        ) : (
          <ChevronRight className="w-4 h-4 text-slate-400 shrink-0" />
        )}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-slate-800">
              {template.display_name}
            </span>
            {template.is_custom ? (
              <span className="text-[10px] font-semibold px-1.5 py-0.5 bg-blue-100 text-blue-700 rounded">
                Custom
              </span>
            ) : (
              <span className="text-[10px] font-semibold px-1.5 py-0.5 bg-slate-100 text-slate-500 rounded">
                Default
              </span>
            )}
          </div>
          <p className="text-xs text-slate-500 mt-0.5 truncate">
            {template.description}
          </p>
        </div>
      </button>

      {/* Editor — only when expanded */}
      {isExpanded && (
        <TemplateEditorPanel
          templateType={template.template_type}
          onSaved={onSaved}
        />
      )}
    </div>
  )
}

// ── Editor Panel (loaded on expand) ─────────────────────────────────

function TemplateEditorPanel({
  templateType,
  onSaved,
}: {
  templateType: string
  onSaved: () => void
}) {
  const [detail, setDetail] = useState<EmailTemplateDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [subject, setSubject] = useState('')
  const [bodyHtml, setBodyHtml] = useState('')
  const [saving, setSaving] = useState(false)
  const [resetting, setResetting] = useState(false)
  const [testing, setTesting] = useState(false)
  const [previewHtml, setPreviewHtml] = useState<string | null>(null)
  const [showPreview, setShowPreview] = useState(false)
  const bodyRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    async function load() {
      try {
        const d = await getEmailTemplate(templateType)
        setDetail(d)
        setSubject(d.subject)
        setBodyHtml(d.body_html)
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Failed to load template')
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [templateType])

  const handleSave = async () => {
    setSaving(true)
    try {
      await saveEmailTemplate(templateType, {
        subject: subject.trim(),
        body_html: bodyHtml.trim(),
      })
      toast.success('Template saved')
      onSaved()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Save failed')
    } finally {
      setSaving(false)
    }
  }

  const handleReset = async () => {
    if (!confirm('Reset this template to the default? Your custom version will be deleted.'))
      return
    setResetting(true)
    try {
      await resetEmailTemplate(templateType)
      // Reload to get defaults
      const d = await getEmailTemplate(templateType)
      setDetail(d)
      setSubject(d.subject)
      setBodyHtml(d.body_html)
      setPreviewHtml(null)
      toast.success('Template reset to default')
      onSaved()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Reset failed')
    } finally {
      setResetting(false)
    }
  }

  const handlePreview = async () => {
    try {
      const result = await previewEmailTemplate(templateType, {
        subject,
        body_html: bodyHtml,
      })
      setPreviewHtml(result.html)
      setShowPreview(true)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Preview failed')
    }
  }

  const handleTest = async () => {
    setTesting(true)
    try {
      const result = await testEmailTemplate(templateType)
      toast.success(`Test email sent to ${result.sent_to}`)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Test send failed')
    } finally {
      setTesting(false)
    }
  }

  const insertVariable = (varName: string) => {
    const textarea = bodyRef.current
    if (!textarea) return
    const start = textarea.selectionStart
    const end = textarea.selectionEnd
    const insert = `{{${varName}}}`
    const newValue = bodyHtml.substring(0, start) + insert + bodyHtml.substring(end)
    setBodyHtml(newValue)
    // Restore focus and cursor position
    setTimeout(() => {
      textarea.focus()
      textarea.selectionStart = textarea.selectionEnd = start + insert.length
    }, 0)
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center p-6 border-t border-slate-200">
        <Loader2 className="w-4 h-4 animate-spin text-slate-400" />
      </div>
    )
  }

  if (!detail) return null

  const hasChanges =
    subject !== detail.subject || bodyHtml !== detail.body_html

  return (
    <div className="border-t border-slate-200 p-4 space-y-4">
      {/* Subject */}
      <div>
        <label className="block text-xs font-medium text-slate-600 mb-1">
          Subject Line
        </label>
        <input
          type="text"
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
          className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
          placeholder="Email subject..."
        />
      </div>

      {/* Variables helper */}
      <div>
        <label className="block text-xs font-medium text-slate-600 mb-1.5">
          <Code className="w-3 h-3 inline mr-1" />
          Available Variables
          <span className="font-normal text-slate-400 ml-1">(click to insert into body)</span>
        </label>
        <div className="flex flex-wrap gap-1.5">
          {detail.variables.map((v) => (
            <button
              key={v}
              onClick={() => insertVariable(v)}
              className="text-xs font-mono px-2 py-1 bg-slate-100 text-slate-700 rounded-md hover:bg-blue-100 hover:text-blue-700 transition-colors border border-slate-200"
              title={`Insert {{${v}}}`}
            >
              {`{{${v}}}`}
            </button>
          ))}
        </div>
      </div>

      {/* Body HTML */}
      <div>
        <label className="block text-xs font-medium text-slate-600 mb-1">
          Email Body (HTML)
        </label>
        <textarea
          ref={bodyRef}
          value={bodyHtml}
          onChange={(e) => setBodyHtml(e.target.value)}
          rows={10}
          className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-primary-500 resize-y"
          placeholder="<p>Hi {{name}},</p>..."
        />
      </div>

      {/* CTA info (read-only) */}
      {detail.cta_text && (
        <div className="text-xs text-slate-500 bg-slate-50 rounded-lg p-2">
          <strong>Button:</strong> &quot;{detail.cta_text}&quot; &rarr;{' '}
          <span className="font-mono text-slate-600">{detail.cta_url_template}</span>
        </div>
      )}

      {/* Action buttons */}
      <div className="flex flex-wrap gap-2 pt-2">
        <button
          onClick={handleSave}
          disabled={saving || !hasChanges}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-primary-500 text-white text-xs font-medium rounded-lg hover:bg-primary-600 disabled:opacity-50"
        >
          {saving ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
          ) : (
            <Save className="w-3.5 h-3.5" />
          )}
          Save
        </button>

        <button
          onClick={handlePreview}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 text-slate-700 text-xs font-medium rounded-lg hover:bg-slate-200"
        >
          <Eye className="w-3.5 h-3.5" />
          Preview
        </button>

        <button
          onClick={handleTest}
          disabled={testing}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 text-slate-700 text-xs font-medium rounded-lg hover:bg-slate-200 disabled:opacity-50"
        >
          {testing ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
          ) : (
            <Send className="w-3.5 h-3.5" />
          )}
          Send Test
        </button>

        {detail.is_custom && (
          <button
            onClick={handleReset}
            disabled={resetting}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-red-50 text-red-600 text-xs font-medium rounded-lg hover:bg-red-100 disabled:opacity-50 ml-auto"
          >
            {resetting ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <RotateCcw className="w-3.5 h-3.5" />
            )}
            Reset to Default
          </button>
        )}
      </div>

      {/* Live Preview iframe */}
      {showPreview && previewHtml && (
        <div className="border border-slate-200 rounded-lg overflow-hidden">
          <div className="flex items-center justify-between px-3 py-2 bg-slate-50 border-b border-slate-200">
            <span className="text-xs font-medium text-slate-600">Email Preview</span>
            <button
              onClick={() => setShowPreview(false)}
              className="text-xs text-slate-400 hover:text-slate-600"
            >
              Close
            </button>
          </div>
          <iframe
            srcDoc={previewHtml}
            title="Email preview"
            className="w-full border-0"
            style={{ height: '400px' }}
            sandbox="allow-same-origin"
          />
        </div>
      )}
    </div>
  )
}
