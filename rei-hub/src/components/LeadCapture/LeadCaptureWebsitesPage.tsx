import { useState, useEffect, useRef } from 'react'
import {
  Globe, Layout, Eye, Download, Trash2, Plus, Edit, Users, Mail, Phone, MapPin,
  FileText, Palette, ExternalLink, ChevronDown, Save, Zap, X,
} from 'lucide-react'
import { toast } from 'sonner'
import * as api from '@/services/leadCaptureApi'
import { templates, getTemplateById } from '@/components/LeadCapture/templates'

// ── Types ─────────────────────────────────────────────────

type Tab = 'templates' | 'builder' | 'sites' | 'leads'

interface FormState {
  templateId: string
  company_name: string
  headline: string
  description: string
  phone: string
  email: string
  primary_color: string
  form_fields: string[]
  webhook_url: string
}

// ── Component ─────────────────────────────────────────────

export default function LeadCaptureWebsitesPage() {
  const [activeTab, setActiveTab] = useState<Tab>('templates')
  const [websites, setWebsites] = useState<api.PublishedWebsite[]>([])
  const [leads, setLeads] = useState<api.CapturedLead[]>([])
  const [loading, setLoading] = useState(false)
  const [selectedWebsiteForLeads, setSelectedWebsiteForLeads] = useState<string>('all')
  const iframeRef = useRef<HTMLIFrameElement>(null)

  const [formState, setFormState] = useState<FormState>({
    templateId: 'motivated-seller',
    company_name: 'My Real Estate Company',
    headline: 'Sell Your House Fast for Cash',
    description: 'Get a fair cash offer for your home in 24 hours.',
    phone: '(555) 123-4567',
    email: 'info@example.com',
    primary_color: '#2563eb',
    form_fields: ['name', 'phone', 'email', 'address', 'message'],
    webhook_url: '',
  })

  const [editingWebsiteId, setEditingWebsiteId] = useState<string | null>(null)

  // Load initial data
  useEffect(() => {
    loadWebsites()
    loadLeads()
  }, [])

  // Update preview when form changes
  useEffect(() => {
    if (activeTab === 'builder') {
      updatePreview()
    }
  }, [formState, activeTab])

  async function loadWebsites() {
    try {
      setLoading(true)
      const data = await api.getWebsites()
      setWebsites(data)
    } catch (error) {
      toast.error('Failed to load websites')
    } finally {
      setLoading(false)
    }
  }

  async function loadLeads() {
    try {
      const data = await api.getLeads()
      setLeads(data)
    } catch (error) {
      toast.error('Failed to load leads')
    }
  }

  function updatePreview() {
    if (!iframeRef.current) return

    const template = getTemplateById(formState.templateId)
    if (!template) return

    let html = template.generateHtml(formState)

    // Replace placeholders
    html = html
      .replace(/{{HEADLINE}}/g, formState.headline)
      .replace(/{{DESCRIPTION}}/g, formState.description)
      .replace(/{{COMPANY_NAME}}/g, formState.company_name)
      .replace(/{{PHONE}}/g, formState.phone)
      .replace(/{{EMAIL}}/g, formState.email)
      .replace(/{{PRIMARY_COLOR}}/g, formState.primary_color)
      .replace(/{{WEBHOOK_URL}}/g, 'https://example.com/webhooks/leads')

    iframeRef.current.srcdoc = html
  }

  function loadTemplateIntoBuilder(templateId: string) {
    const template = templates.find((t) => t.id === templateId)
    if (!template) return

    setFormState((prev) => ({
      ...prev,
      templateId,
      headline: template.name === 'We Buy Houses' ? 'Sell Your House Fast for Cash' :
                template.name === 'Find Off-Market Deals' ? 'Find Exclusive Off-Market Deals' :
                template.name === 'Property Evaluation' ? "What's My Property Worth?" :
                'Get Exclusive Wholesale Deal Alerts',
      description: template.description,
      primary_color: template.previewColor,
    }))

    setEditingWebsiteId(null)
    setActiveTab('builder')
    toast.success('Template loaded!')
  }

  async function handleSaveAsDraft() {
    try {
      setLoading(true)

      if (editingWebsiteId) {
        await api.updateWebsite(editingWebsiteId, formState)
        toast.success('Website updated!')
      } else {
        await api.createWebsite(formState)
        toast.success('Website saved as draft!')
      }

      setEditingWebsiteId(null)
      await loadWebsites()
    } catch (error) {
      toast.error('Failed to save website')
    } finally {
      setLoading(false)
    }
  }

  async function handlePublish() {
    try {
      setLoading(true)

      if (!editingWebsiteId) {
        const website = await api.createWebsite(formState)
        const template = getTemplateById(formState.templateId)
        if (template) {
          await api.publishWebsite(website.id, template.generateHtml)
        }
      } else {
        const template = getTemplateById(formState.templateId)
        if (template) {
          await api.publishWebsite(editingWebsiteId, template.generateHtml)
        }
      }

      toast.success('Website published!')
      setEditingWebsiteId(null)
      await loadWebsites()
    } catch (error) {
      toast.error('Failed to publish website')
    } finally {
      setLoading(false)
    }
  }

  async function handleDeleteWebsite(id: string) {
    if (!confirm('Are you sure you want to delete this website and all its leads?')) return

    try {
      await api.deleteWebsite(id)
      toast.success('Website deleted!')
      await loadWebsites()
      await loadLeads()
    } catch (error) {
      toast.error('Failed to delete website')
    }
  }

  async function handleDownloadHTML(id: string) {
    try {
      const html = await api.downloadWebsiteHTML(id)
      const blob = new Blob([html], { type: 'text/html' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `website-${id}.html`
      a.click()
      URL.revokeObjectURL(url)
      toast.success('HTML downloaded!')
    } catch (error) {
      toast.error('Failed to download HTML')
    }
  }

  async function handleDeleteLead(id: string) {
    if (!confirm('Are you sure you want to delete this lead?')) return

    try {
      await api.deleteLead(id)
      toast.success('Lead deleted!')
      await loadLeads()
      await loadWebsites()
    } catch (error) {
      toast.error('Failed to delete lead')
    }
  }

  async function handleExportCSV() {
    try {
      const websiteId = selectedWebsiteForLeads === 'all' ? undefined : selectedWebsiteForLeads
      const csv = await api.exportLeadsToCSV(websiteId)

      if (!csv) {
        toast.error('No leads to export')
        return
      }

      const blob = new Blob([csv], { type: 'text/csv' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `leads-export-${Date.now()}.csv`
      a.click()
      URL.revokeObjectURL(url)
      toast.success('Leads exported!')
    } catch (error) {
      toast.error('Failed to export leads')
    }
  }

  function handleEditWebsite(website: api.PublishedWebsite) {
    setFormState(website.config)
    setEditingWebsiteId(website.id)
    setActiveTab('builder')
  }

  function handleResetForm() {
    setFormState({
      templateId: 'motivated-seller',
      company_name: 'My Real Estate Company',
      headline: 'Sell Your House Fast for Cash',
      description: 'Get a fair cash offer for your home in 24 hours.',
      phone: '(555) 123-4567',
      email: 'info@example.com',
      primary_color: '#2563eb',
      form_fields: ['name', 'phone', 'email', 'address', 'message'],
      webhook_url: '',
    })
    setEditingWebsiteId(null)
  }

  const filteredLeads =
    selectedWebsiteForLeads === 'all' ? leads : leads.filter((l) => l.websiteId === selectedWebsiteForLeads)

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold text-slate-900 flex items-center gap-3">
          <Globe className="w-8 h-8 text-primary-600" />
          Lead Capture Websites
        </h1>
        <p className="text-slate-500 mt-1">Create landing pages to capture leads and grow your buyer/seller network</p>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 border-b border-slate-200">
        <button
          onClick={() => setActiveTab('templates')}
          className={`px-4 py-2 font-medium transition-colors border-b-2 ${
            activeTab === 'templates'
              ? 'border-primary-600 text-primary-600'
              : 'border-transparent text-slate-600 hover:text-slate-900'
          }`}
        >
          <Layout className="w-4 h-4 inline mr-2" />
          Templates
        </button>
        <button
          onClick={() => setActiveTab('builder')}
          className={`px-4 py-2 font-medium transition-colors border-b-2 ${
            activeTab === 'builder'
              ? 'border-primary-600 text-primary-600'
              : 'border-transparent text-slate-600 hover:text-slate-900'
          }`}
        >
          <Zap className="w-4 h-4 inline mr-2" />
          Builder
        </button>
        <button
          onClick={() => setActiveTab('sites')}
          className={`px-4 py-2 font-medium transition-colors border-b-2 ${
            activeTab === 'sites'
              ? 'border-primary-600 text-primary-600'
              : 'border-transparent text-slate-600 hover:text-slate-900'
          }`}
        >
          <Eye className="w-4 h-4 inline mr-2" />
          Published Sites
        </button>
        <button
          onClick={() => setActiveTab('leads')}
          className={`px-4 py-2 font-medium transition-colors border-b-2 ${
            activeTab === 'leads'
              ? 'border-primary-600 text-primary-600'
              : 'border-transparent text-slate-600 hover:text-slate-900'
          }`}
        >
          <Users className="w-4 h-4 inline mr-2" />
          Leads ({leads.length})
        </button>
      </div>

      {/* ── Templates Tab ── */}
      {activeTab === 'templates' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {templates.map((template) => (
            <div
              key={template.id}
              className="bg-white rounded-lg border border-slate-200 overflow-hidden hover:shadow-lg transition-shadow"
            >
              <div
                className="h-40 bg-gradient-to-br flex items-center justify-center"
                style={{ background: `linear-gradient(135deg, ${template.previewColor} 0%, ${template.previewColor}cc 100%)` }}
              >
                <Globe className="w-16 h-16 text-white/50" />
              </div>
              <div className="p-6">
                <h3 className="text-lg font-bold text-slate-900">{template.name}</h3>
                <p className="text-slate-500 text-sm mt-2">{template.description}</p>
                <button
                  onClick={() => loadTemplateIntoBuilder(template.id)}
                  className="mt-4 w-full px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors font-medium flex items-center justify-center gap-2"
                >
                  <Plus className="w-4 h-4" />
                  Use This Template
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── Builder Tab ── */}
      {activeTab === 'builder' && (
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
          {/* Left side: Form */}
          <div className="space-y-6">
            <div className="bg-white rounded-lg border border-slate-200 p-6 space-y-4">
              {/* Template Selector */}
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">Template</label>
                <select
                  value={formState.templateId}
                  onChange={(e) =>
                    setFormState((prev) => ({
                      ...prev,
                      templateId: e.target.value,
                    }))
                  }
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:outline-none"
                >
                  {templates.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
                </select>
              </div>

              {/* Company Name */}
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">Company Name</label>
                <input
                  type="text"
                  value={formState.company_name}
                  onChange={(e) =>
                    setFormState((prev) => ({
                      ...prev,
                      company_name: e.target.value,
                    }))
                  }
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:outline-none"
                />
              </div>

              {/* Headline */}
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">Headline</label>
                <input
                  type="text"
                  value={formState.headline}
                  onChange={(e) =>
                    setFormState((prev) => ({
                      ...prev,
                      headline: e.target.value,
                    }))
                  }
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:outline-none"
                />
              </div>

              {/* Description */}
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">Description</label>
                <textarea
                  value={formState.description}
                  onChange={(e) =>
                    setFormState((prev) => ({
                      ...prev,
                      description: e.target.value,
                    }))
                  }
                  rows={3}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:outline-none"
                />
              </div>

              {/* Phone */}
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">
                  <Phone className="w-4 h-4 inline mr-2" />
                  Phone Number
                </label>
                <input
                  type="tel"
                  value={formState.phone}
                  onChange={(e) =>
                    setFormState((prev) => ({
                      ...prev,
                      phone: e.target.value,
                    }))
                  }
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:outline-none"
                />
              </div>

              {/* Email */}
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">
                  <Mail className="w-4 h-4 inline mr-2" />
                  Email Address
                </label>
                <input
                  type="email"
                  value={formState.email}
                  onChange={(e) =>
                    setFormState((prev) => ({
                      ...prev,
                      email: e.target.value,
                    }))
                  }
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:outline-none"
                />
              </div>

              {/* Primary Color */}
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">
                  <Palette className="w-4 h-4 inline mr-2" />
                  Primary Color
                </label>
                <div className="flex gap-2">
                  <input
                    type="color"
                    value={formState.primary_color}
                    onChange={(e) =>
                      setFormState((prev) => ({
                        ...prev,
                        primary_color: e.target.value,
                      }))
                    }
                    className="w-16 h-10 border border-slate-300 rounded-lg cursor-pointer"
                  />
                  <input
                    type="text"
                    value={formState.primary_color}
                    onChange={(e) =>
                      setFormState((prev) => ({
                        ...prev,
                        primary_color: e.target.value,
                      }))
                    }
                    className="flex-1 px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:outline-none"
                  />
                </div>
              </div>

              {/* Form Fields */}
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">Form Fields</label>
                <div className="space-y-2">
                  {['name', 'phone', 'email', 'address', 'message'].map((field) => (
                    <label key={field} className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={formState.form_fields.includes(field)}
                        onChange={(e) => {
                          setFormState((prev) => ({
                            ...prev,
                            form_fields: e.target.checked
                              ? [...prev.form_fields, field]
                              : prev.form_fields.filter((f) => f !== field),
                          }))
                        }}
                        className="w-4 h-4 text-primary-600 rounded"
                      />
                      <span className="text-sm text-slate-700 capitalize">
                        {field === 'address' ? 'Property Address' : field}
                      </span>
                    </label>
                  ))}
                </div>
              </div>

              {/* Webhook URL */}
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">Webhook URL (Optional)</label>
                <input
                  type="url"
                  placeholder="https://example.com/webhooks/leads"
                  value={formState.webhook_url}
                  onChange={(e) =>
                    setFormState((prev) => ({
                      ...prev,
                      webhook_url: e.target.value,
                    }))
                  }
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:outline-none"
                />
              </div>

              {/* Buttons */}
              <div className="flex gap-2 pt-4">
                <button
                  onClick={handleSaveAsDraft}
                  disabled={loading}
                  className="flex-1 px-4 py-2 bg-slate-200 text-slate-900 rounded-lg hover:bg-slate-300 transition-colors font-medium disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  <Save className="w-4 h-4" />
                  Save as Draft
                </button>
                <button
                  onClick={handlePublish}
                  disabled={loading}
                  className="flex-1 px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors font-medium disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  <Zap className="w-4 h-4" />
                  Publish
                </button>
                <button
                  onClick={handleResetForm}
                  disabled={loading}
                  className="px-4 py-2 bg-slate-100 text-slate-600 rounded-lg hover:bg-slate-200 transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>

          {/* Right side: Preview */}
          <div className="space-y-2">
            <div className="text-sm font-medium text-slate-700">Live Preview</div>
            <iframe
              ref={iframeRef}
              className="w-full h-[700px] border border-slate-200 rounded-lg bg-white"
              title="Live Preview"
            />
          </div>
        </div>
      )}

      {/* ── Published Sites Tab ── */}
      {activeTab === 'sites' && (
        <div>
          {websites.length === 0 ? (
            <div className="text-center py-12 bg-slate-50 rounded-lg border border-slate-200">
              <Globe className="w-12 h-12 text-slate-300 mx-auto mb-3" />
              <p className="text-slate-500">No websites created yet. Start by using a template!</p>
            </div>
          ) : (
            <div className="bg-white rounded-lg border border-slate-200 overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50 border-b border-slate-200">
                    <tr>
                      <th className="px-6 py-3 text-left font-semibold text-slate-900">Name</th>
                      <th className="px-6 py-3 text-left font-semibold text-slate-900">Template</th>
                      <th className="px-6 py-3 text-left font-semibold text-slate-900">Status</th>
                      <th className="px-6 py-3 text-left font-semibold text-slate-900">Leads</th>
                      <th className="px-6 py-3 text-left font-semibold text-slate-900">Created</th>
                      <th className="px-6 py-3 text-right font-semibold text-slate-900">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {websites.map((website, idx) => (
                      <tr key={website.id} className={idx % 2 === 0 ? 'bg-white' : 'bg-slate-50'}>
                        <td className="px-6 py-3 text-slate-900 font-medium">{website.name}</td>
                        <td className="px-6 py-3 text-slate-600">
                          {templates.find((t) => t.id === website.templateId)?.name || website.templateId}
                        </td>
                        <td className="px-6 py-3">
                          <span
                            className={`px-2 py-1 rounded text-xs font-semibold ${
                              website.status === 'published'
                                ? 'bg-green-100 text-green-700'
                                : 'bg-yellow-100 text-yellow-700'
                            }`}
                          >
                            {website.status}
                          </span>
                        </td>
                        <td className="px-6 py-3 text-slate-900 font-medium">{website.leadCount}</td>
                        <td className="px-6 py-3 text-slate-600 text-xs">
                          {new Date(website.createdAt).toLocaleDateString()}
                        </td>
                        <td className="px-6 py-3 text-right space-x-2">
                          <button
                            onClick={() => handleEditWebsite(website)}
                            className="inline-flex items-center gap-1 px-3 py-1 text-blue-600 hover:bg-blue-50 rounded transition-colors"
                            title="Edit"
                          >
                            <Edit className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => handleDownloadHTML(website.id)}
                            className="inline-flex items-center gap-1 px-3 py-1 text-slate-600 hover:bg-slate-100 rounded transition-colors"
                            title="Download HTML"
                          >
                            <Download className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => handleDeleteWebsite(website.id)}
                            className="inline-flex items-center gap-1 px-3 py-1 text-red-600 hover:bg-red-50 rounded transition-colors"
                            title="Delete"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Leads Tab ── */}
      {activeTab === 'leads' && (
        <div className="space-y-4">
          {/* Filters and Actions */}
          <div className="flex flex-col md:flex-row gap-4 items-start md:items-center justify-between">
            <div className="flex-1">
              <label className="text-sm font-medium text-slate-700 block mb-2">Filter by Website</label>
              <select
                value={selectedWebsiteForLeads}
                onChange={(e) => setSelectedWebsiteForLeads(e.target.value)}
                className="px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:outline-none"
              >
                <option value="all">All Websites</option>
                {websites.map((w) => (
                  <option key={w.id} value={w.id}>
                    {w.name}
                  </option>
                ))}
              </select>
            </div>
            <button
              onClick={handleExportCSV}
              disabled={filteredLeads.length === 0}
              className="px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors font-medium disabled:opacity-50 flex items-center gap-2"
            >
              <Download className="w-4 h-4" />
              Export to CSV
            </button>
          </div>

          {/* Leads Table */}
          {filteredLeads.length === 0 ? (
            <div className="text-center py-12 bg-slate-50 rounded-lg border border-slate-200">
              <Users className="w-12 h-12 text-slate-300 mx-auto mb-3" />
              <p className="text-slate-500">No leads captured yet</p>
            </div>
          ) : (
            <div className="bg-white rounded-lg border border-slate-200 overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50 border-b border-slate-200">
                    <tr>
                      <th className="px-6 py-3 text-left font-semibold text-slate-900">Name</th>
                      <th className="px-6 py-3 text-left font-semibold text-slate-900">Email</th>
                      <th className="px-6 py-3 text-left font-semibold text-slate-900">Phone</th>
                      <th className="px-6 py-3 text-left font-semibold text-slate-900">Address</th>
                      <th className="px-6 py-3 text-left font-semibold text-slate-900">Source</th>
                      <th className="px-6 py-3 text-left font-semibold text-slate-900">Date</th>
                      <th className="px-6 py-3 text-right font-semibold text-slate-900">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredLeads.map((lead, idx) => (
                      <tr key={lead.id} className={idx % 2 === 0 ? 'bg-white' : 'bg-slate-50'}>
                        <td className="px-6 py-3 text-slate-900 font-medium">{lead.name || '—'}</td>
                        <td className="px-6 py-3 text-slate-600 text-sm">{lead.email || '—'}</td>
                        <td className="px-6 py-3 text-slate-600 text-sm">{lead.phone || '—'}</td>
                        <td className="px-6 py-3 text-slate-600 text-sm max-w-xs truncate">{lead.address || '—'}</td>
                        <td className="px-6 py-3 text-slate-600 text-xs font-medium">{lead.websiteName}</td>
                        <td className="px-6 py-3 text-slate-600 text-xs">
                          {new Date(lead.capturedAt).toLocaleDateString()}
                        </td>
                        <td className="px-6 py-3 text-right">
                          <button
                            onClick={() => handleDeleteLead(lead.id)}
                            className="inline-flex items-center gap-1 px-3 py-1 text-red-600 hover:bg-red-50 rounded transition-colors"
                            title="Delete"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
