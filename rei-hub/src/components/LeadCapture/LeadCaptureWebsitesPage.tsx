import { useState, useEffect, useRef } from 'react'
import {
  Globe, Layout, Eye, Download, Trash2, Plus, Edit, Users, Mail, Phone, MapPin,
  FileText, Palette, ExternalLink, ChevronDown, Save, Zap, X, Code, Copy, Check, Sparkles,
} from 'lucide-react'
import { toast } from 'sonner'
import * as api from '@/services/leadCaptureApi'
import { templates, getTemplateById, TemplateConfig, TemplateInfo } from './templates'
import AIWebsiteBuilder from './AIWebsiteBuilder'

// ── Configuration ─────────────────────────────────────────

const BASE_URL = import.meta.env.VITE_REI_SERVER_URL ?? 'http://localhost:8001'

// ── Types ─────────────────────────────────────────────────

type Tab = 'templates' | 'builder' | 'sites' | 'leads' | 'embed'

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
  custom_domain: string
  market?: string
  logo_url?: string
  slug?: string
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
    templateId: 'motivated_sellers',
    company_name: 'My Real Estate Company',
    headline: 'Sell Your House Fast for Cash',
    description: 'Get a fair cash offer for your home in 24 hours.',
    phone: '(555) 123-4567',
    email: 'info@example.com',
    primary_color: '#2563eb',
    form_fields: ['name', 'phone', 'email', 'address', 'message'],
    webhook_url: '',
    custom_domain: '',
    market: '',
    logo_url: '',
  })

  const [editingWebsiteId, setEditingWebsiteId] = useState<string | null>(null)
  const [selectedWebsiteForEmbed, setSelectedWebsiteForEmbed] = useState<string>('')
  const [embedInlineCode, setEmbedInlineCode] = useState<string>('')
  const [embedPopupCode, setEmbedPopupCode] = useState<string>('')
  const [copiedCode, setCopiedCode] = useState<'inline' | 'popup' | null>(null)
  const [domainStatus, setDomainStatus] = useState<Record<string, 'not_configured' | 'pending' | 'active'>>({})
  const [loadingEmbed, setLoadingEmbed] = useState(false)
  const [showAIBuilder, setShowAIBuilder] = useState(false)

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

    const templateConfig: TemplateConfig = {
      company_name: formState.company_name,
      headline: formState.headline,
      description: formState.description,
      phone: formState.phone,
      email: formState.email,
      primary_color: formState.primary_color,
      form_fields: formState.form_fields,
      market: formState.market,
      logo_url: formState.logo_url,
      slug: formState.slug,
    }

    let html = template.generateHTML(templateConfig)

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
    const template = getTemplateById(templateId)
    if (!template) return

    setFormState((prev) => ({
      ...prev,
      templateId,
      headline: template.defaultHeadline,
      description: template.defaultDescription,
      primary_color: template.defaultColor,
    }))

    setEditingWebsiteId(null)
    setActiveTab('builder')
    toast.success('Template loaded!')
  }

  function handleAIBuilderComplete(config: FormState, templateId: string) {
    setFormState(config)
    setEditingWebsiteId(null)
    setActiveTab('builder')
    toast.success('Website configured with AI!')
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

      const template = getTemplateById(formState.templateId)
      if (!template) {
        toast.error('Template not found')
        return
      }

      const templateConfig: TemplateConfig = {
        company_name: formState.company_name,
        headline: formState.headline,
        description: formState.description,
        phone: formState.phone,
        email: formState.email,
        primary_color: formState.primary_color,
        form_fields: formState.form_fields,
        market: formState.market,
        logo_url: formState.logo_url,
        slug: formState.slug,
      }

      const generateHtmlFn = () => template.generateHTML(templateConfig)

      if (!editingWebsiteId) {
        const website = await api.createWebsite(formState)
        await api.publishWebsite(website.id, generateHtmlFn)
      } else {
        await api.publishWebsite(editingWebsiteId, generateHtmlFn)
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
      templateId: 'motivated_sellers',
      company_name: 'My Real Estate Company',
      headline: 'Sell Your House Fast for Cash',
      description: 'Get a fair cash offer for your home in 24 hours.',
      phone: '(555) 123-4567',
      email: 'info@example.com',
      primary_color: '#2563eb',
      form_fields: ['name', 'phone', 'email', 'address', 'message'],
      webhook_url: '',
      custom_domain: '',
      market: '',
      logo_url: '',
    })
    setEditingWebsiteId(null)
  }

  async function loadEmbedCode(websiteId: string) {
    if (!websiteId) return
    try {
      setLoadingEmbed(true)
      const website = websites.find((w) => w.id === websiteId)
      if (!website) return

      const inlineCode = await api.generateEmbedCode(websiteId, website.config)
      const popupCode = await api.generateEmbedPopupCode(websiteId, website.config)

      setEmbedInlineCode(inlineCode)
      setEmbedPopupCode(popupCode)

      // Check domain status
      if (website.config.custom_domain) {
        const status = await api.checkDomainStatus(website.config.custom_domain)
        setDomainStatus((prev) => ({
          ...prev,
          [website.config.custom_domain || '']: status,
        }))
      }
    } catch (error) {
      toast.error('Failed to generate embed code')
    } finally {
      setLoadingEmbed(false)
    }
  }

  function copyToClipboard(text: string, type: 'inline' | 'popup') {
    navigator.clipboard.writeText(text).then(() => {
      setCopiedCode(type)
      toast.success('Embed code copied!')
      setTimeout(() => setCopiedCode(null), 2000)
    })
  }

  async function handleUpdateCustomDomain(websiteId: string, domain: string) {
    if (!domain) {
      toast.error('Please enter a domain')
      return
    }
    try {
      setLoading(true)
      await api.updateCustomDomain(websiteId, domain)
      toast.success('Custom domain updated!')
      await loadWebsites()

      if (selectedWebsiteForEmbed === websiteId) {
        await loadEmbedCode(websiteId)
      }
    } catch (error) {
      toast.error('Failed to update domain')
    } finally {
      setLoading(false)
    }
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
        <button
          onClick={() => setActiveTab('embed')}
          className={`px-4 py-2 font-medium transition-colors border-b-2 ${
            activeTab === 'embed'
              ? 'border-primary-600 text-primary-600'
              : 'border-transparent text-slate-600 hover:text-slate-900'
          }`}
        >
          <Code className="w-4 h-4 inline mr-2" />
          Embed
        </button>
      </div>

      {/* ── Templates Tab ── */}
      {activeTab === 'templates' && (
        <div className="space-y-6">
          {/* AI Builder Button */}
          <button
            onClick={() => setShowAIBuilder(true)}
            className="w-full px-6 py-4 bg-gradient-to-r from-purple-500 to-blue-500 text-white rounded-lg hover:from-purple-600 hover:to-blue-600 transition-all font-semibold flex items-center justify-center gap-2 shadow-lg hover:shadow-xl"
          >
            <Sparkles className="w-5 h-5" />
            Build with AI
          </button>

          {/* Templates Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {templates.map((template) => (
            <div
              key={template.id}
              className="bg-white rounded-lg border border-slate-200 overflow-hidden hover:shadow-lg transition-shadow flex flex-col"
            >
              <div
                className="h-32 bg-gradient-to-br flex items-center justify-center"
                style={{ background: `linear-gradient(135deg, ${template.defaultColor} 0%, ${template.defaultColor}cc 100%)` }}
              >
                <Globe className="w-12 h-12 text-white/50" />
              </div>
              <div className="p-4 flex flex-col flex-grow">
                <h3 className="text-base font-bold text-slate-900">{template.name}</h3>
                <p className="text-slate-500 text-xs mt-1 flex-grow">{template.description}</p>
                <div className="mt-3 mb-3">
                  <span className="inline-block px-2 py-1 text-xs font-medium bg-slate-100 text-slate-700 rounded">
                    {template.targetLead}
                  </span>
                </div>
                <button
                  onClick={() => loadTemplateIntoBuilder(template.id)}
                  className="w-full px-3 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors font-medium text-sm flex items-center justify-center gap-2"
                >
                  <Plus className="w-4 h-4" />
                  Use This Template
                </button>
              </div>
            </div>
          ))}
          </div>
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

              {/* Market / City */}
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">
                  <MapPin className="w-4 h-4 inline mr-2" />
                  Market / City
                </label>
                <input
                  type="text"
                  placeholder="e.g., San Antonio, TX"
                  value={formState.market || ''}
                  onChange={(e) =>
                    setFormState((prev) => ({
                      ...prev,
                      market: e.target.value,
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

              {/* Custom Domain */}
              <div className="border-t border-slate-200 pt-4 mt-4">
                <label className="block text-sm font-medium text-slate-700 mb-2 flex items-center gap-2">
                  <ExternalLink className="w-4 h-4" />
                  Custom Domain (Optional)
                </label>
                <input
                  type="text"
                  placeholder="leads.mycompany.com"
                  value={formState.custom_domain}
                  onChange={(e) =>
                    setFormState((prev) => ({
                      ...prev,
                      custom_domain: e.target.value,
                    }))
                  }
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:outline-none"
                />
                <p className="text-xs text-slate-500 mt-2">
                  Point your domain's CNAME record to <code className="bg-slate-100 px-1 rounded">pages.reifundamentalshub.com</code>, then enter it here
                </p>
                {editingWebsiteId && (
                  <div className="mt-3">
                    {domainStatus[formState.custom_domain] === 'active' && (
                      <span className="text-xs font-semibold text-green-700 bg-green-50 px-2 py-1 rounded">
                        ✓ Active
                      </span>
                    )}
                    {domainStatus[formState.custom_domain] === 'pending' && (
                      <span className="text-xs font-semibold text-yellow-700 bg-yellow-50 px-2 py-1 rounded">
                        ⏳ Pending DNS
                      </span>
                    )}
                    {!domainStatus[formState.custom_domain] && (
                      <span className="text-xs font-semibold text-slate-600 bg-slate-100 px-2 py-1 rounded">
                        ○ Not configured
                      </span>
                    )}
                  </div>
                )}
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
                      <th className="px-6 py-3 text-left font-semibold text-slate-900">Domain</th>
                      <th className="px-6 py-3 text-left font-semibold text-slate-900">Status</th>
                      <th className="px-6 py-3 text-left font-semibold text-slate-900">Leads</th>
                      <th className="px-6 py-3 text-left font-semibold text-slate-900">Created</th>
                      <th className="px-6 py-3 text-left font-semibold text-slate-900">Link</th>
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
                        <td className="px-6 py-3 text-slate-600 text-sm">
                          {website.config.custom_domain ? (
                            <span className="font-medium">{website.config.custom_domain}</span>
                          ) : (
                            <span className="text-slate-500">Default</span>
                          )}
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
                        <td className="px-6 py-3 text-slate-600 text-sm">
                          {website.slug ? (
                            <a
                              href={`${BASE_URL}/sites/${website.slug}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-blue-600 hover:text-blue-700 flex items-center gap-1"
                              title="View Live"
                            >
                              <ExternalLink className="w-4 h-4" />
                              View Live
                            </a>
                          ) : (
                            <span className="text-slate-500 text-xs">Demo Only</span>
                          )}
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

      {/* ── Embed Tab ── */}
      {activeTab === 'embed' && (
        <div className="space-y-6">
          {/* Website Selector */}
          <div className="bg-white rounded-lg border border-slate-200 p-6">
            <label className="block text-sm font-medium text-slate-700 mb-2">Select Website to Embed</label>
            <select
              value={selectedWebsiteForEmbed}
              onChange={(e) => {
                const websiteId = e.target.value
                setSelectedWebsiteForEmbed(websiteId)
                if (websiteId) {
                  loadEmbedCode(websiteId)
                }
              }}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:outline-none"
            >
              <option value="">Choose a published website...</option>
              {websites
                .filter((w) => w.status === 'published')
                .map((w) => (
                  <option key={w.id} value={w.id}>
                    {w.name}
                  </option>
                ))}
            </select>
          </div>

          {selectedWebsiteForEmbed && (
            <>
              {/* Inline Form Section */}
              <div className="bg-white rounded-lg border border-slate-200 p-6 space-y-4">
                <h3 className="text-lg font-semibold text-slate-900 flex items-center gap-2">
                  <Code className="w-5 h-5" />
                  Inline Form
                </h3>
                <p className="text-sm text-slate-600">
                  Paste this code into your website's HTML where you want the form to appear
                </p>

                {/* Preview */}
                <div className="border border-slate-200 rounded-lg p-4 bg-slate-50">
                  <p className="text-xs font-medium text-slate-500 mb-3">Preview</p>
                  <div
                    className="bg-white rounded border border-slate-200 p-4"
                    style={{ maxWidth: '400px' }}
                    dangerouslySetInnerHTML={{
                      __html: `
                        <div style="max-width: 400px; margin: 0 auto; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">
                          <div style="background: white; padding: 24px; border-radius: 8px; box-shadow: 0 1px 3px rgba(0,0,0,0.1);">
                            <h3 style="margin: 0 0 16px 0; font-size: 18px; font-weight: 600; color: #111827;">Get in Touch</h3>
                            <form style="display: flex; flex-direction: column; gap: 12px;">
                              <div>
                                <label style="display: block; font-size: 14px; font-weight: 500; color: #374151; margin-bottom: 6px;">Full Name *</label>
                                <input type="text" style="width: 100%; padding: 8px 12px; border: 1px solid #d1d5db; border-radius: 6px; font-size: 14px; font-family: inherit; box-sizing: border-box;" disabled>
                              </div>
                              <button type="submit" style="padding: 10px; background-color: ${websites.find((w) => w.id === selectedWebsiteForEmbed)?.config.primary_color || '#2563eb'}; color: white; border: none; border-radius: 6px; font-size: 14px; font-weight: 600; cursor: pointer; margin-top: 8px;">Submit</button>
                            </form>
                          </div>
                        </div>
                      `,
                    }}
                  />
                </div>

                {/* Code Block */}
                {embedInlineCode && (
                  <>
                    <div className="bg-slate-900 rounded-lg p-4 overflow-x-auto">
                      <pre className="text-xs text-slate-100 font-mono">{embedInlineCode}</pre>
                    </div>

                    {/* Copy Button */}
                    <button
                      onClick={() => copyToClipboard(embedInlineCode, 'inline')}
                      className="w-full px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors font-medium flex items-center justify-center gap-2"
                    >
                      {copiedCode === 'inline' ? (
                        <>
                          <Check className="w-4 h-4" />
                          Copied!
                        </>
                      ) : (
                        <>
                          <Copy className="w-4 h-4" />
                          Copy Code
                        </>
                      )}
                    </button>
                  </>
                )}
              </div>

              {/* Popup Form Section */}
              <div className="bg-white rounded-lg border border-slate-200 p-6 space-y-4">
                <h3 className="text-lg font-semibold text-slate-900 flex items-center gap-2">
                  <Code className="w-5 h-5" />
                  Popup Form
                </h3>
                <p className="text-sm text-slate-600">
                  This creates a floating button that opens a form modal when clicked
                </p>

                {/* Preview */}
                <div className="border border-slate-200 rounded-lg p-4 bg-slate-50">
                  <p className="text-xs font-medium text-slate-500 mb-3">Preview</p>
                  <button
                    style={{
                      backgroundColor: websites.find((w) => w.id === selectedWebsiteForEmbed)?.config.primary_color || '#2563eb',
                      color: 'white',
                      border: 'none',
                      padding: '12px 24px',
                      borderRadius: '6px',
                      fontSize: '14px',
                      fontWeight: '600',
                      cursor: 'pointer',
                      fontFamily: 'inherit',
                    }}
                    onMouseOver={(e) => (e.currentTarget.style.opacity = '0.9')}
                    onMouseOut={(e) => (e.currentTarget.style.opacity = '1')}
                    disabled
                  >
                    Contact Us
                  </button>
                </div>

                {/* Code Block */}
                {embedPopupCode && (
                  <>
                    <div className="bg-slate-900 rounded-lg p-4 overflow-x-auto">
                      <pre className="text-xs text-slate-100 font-mono">{embedPopupCode}</pre>
                    </div>

                    {/* Copy Button */}
                    <button
                      onClick={() => copyToClipboard(embedPopupCode, 'popup')}
                      className="w-full px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors font-medium flex items-center justify-center gap-2"
                    >
                      {copiedCode === 'popup' ? (
                        <>
                          <Check className="w-4 h-4" />
                          Copied!
                        </>
                      ) : (
                        <>
                          <Copy className="w-4 h-4" />
                          Copy Code
                        </>
                      )}
                    </button>
                  </>
                )}
              </div>

              {/* Custom Domain Info */}
              {(() => {
                const selectedWebsite = websites.find((w) => w.id === selectedWebsiteForEmbed)
                return selectedWebsite ? (
                  <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                    <h4 className="font-semibold text-blue-900 text-sm mb-2">Domain Information</h4>
                    <p className="text-sm text-blue-800">
                      {selectedWebsite.config.custom_domain ? (
                        <>
                          Your form is accessible at: <code className="bg-blue-100 px-2 py-1 rounded font-mono text-xs">https://{selectedWebsite.config.custom_domain}</code>
                        </>
                      ) : (
                        <>
                          No custom domain configured. Edit this website in the Builder to add one.
                        </>
                      )}
                    </p>
                  </div>
                ) : null
              })()}
            </>
          )}

          {!selectedWebsiteForEmbed && (
            <div className="text-center py-12 bg-slate-50 rounded-lg border border-slate-200">
              <Code className="w-12 h-12 text-slate-300 mx-auto mb-3" />
              <p className="text-slate-500">Select a published website to generate embed code</p>
            </div>
          )}
        </div>
      )}

      {/* AI Website Builder Modal */}
      <AIWebsiteBuilder
        isOpen={showAIBuilder}
        onClose={() => setShowAIBuilder(false)}
        onComplete={handleAIBuilderComplete}
      />
    </div>
  )
}
