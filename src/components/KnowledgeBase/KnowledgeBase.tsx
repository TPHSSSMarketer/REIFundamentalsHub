import { useState } from 'react'
import {
  BookOpen,
  Plus,
  Trash2,
  Globe,
  FileText,
  MessageCircleQuestion,
  PenLine,
  Search,
  Tag,
  Loader2,
  ExternalLink,
} from 'lucide-react'
import { toast } from 'sonner'
import type { KnowledgeEntry } from '@/services/ai-chat'

// Default REI knowledge entries
const DEFAULT_ENTRIES: KnowledgeEntry[] = [
  {
    id: 'kb-1',
    title: 'Wholesale Real Estate',
    content: 'Wholesaling involves finding distressed properties under market value, getting them under contract, and assigning the contract to another investor for an assignment fee (typically $5K-$15K). You never purchase the property. Key: find motivated sellers, negotiate low, build a buyers list.',
    source: 'manual',
    tags: ['wholesale', 'strategy', 'beginner'],
    createdAt: new Date(),
  },
  {
    id: 'kb-2',
    title: '70% Rule (MAO Calculator)',
    content: 'The 70% Rule helps investors determine the Maximum Allowable Offer (MAO): MAO = (ARV x 70%) - Repair Costs. Example: $200K ARV with $30K repairs = $110K MAO. Some investors use 65% for tighter margins or 75% in competitive markets.',
    source: 'manual',
    tags: ['mao', 'analysis', 'formula', '70%'],
    createdAt: new Date(),
  },
  {
    id: 'kb-3',
    title: 'Fix & Flip Strategy',
    content: 'Fix and flip involves buying properties below market value, renovating them, and selling at a higher price. Key metrics: ARV (After Repair Value), repair costs, holding costs (4-6 months typical), closing costs (buyer + seller side), and profit margin. Aim for 15%+ ROI minimum.',
    source: 'manual',
    tags: ['flip', 'strategy', 'renovation'],
    createdAt: new Date(),
  },
  {
    id: 'kb-4',
    title: 'Buy & Hold / Rental Strategy',
    content: 'Buy and hold involves purchasing properties to rent for ongoing cash flow. Key metrics: cash-on-cash return (aim 8%+), monthly cash flow after PITI + expenses (aim $200+/door), expense ratio (budget 40-50% of rent for taxes, insurance, maintenance, vacancy, management).',
    source: 'manual',
    tags: ['rental', 'cash flow', 'strategy'],
    createdAt: new Date(),
  },
  {
    id: 'kb-5',
    title: 'Motivated Seller Signs',
    content: 'Key indicators of motivated sellers: pre-foreclosure notices, divorce proceedings, out-of-state/absentee owners, inherited properties, code violations, tax liens, vacant properties, high days on market (60+), price reductions, and tired landlords with problem tenants.',
    source: 'manual',
    tags: ['leads', 'motivation', 'sellers'],
    createdAt: new Date(),
  },
  {
    id: 'kb-6',
    title: 'Repair Cost Estimates',
    content: 'Common repair costs per square foot: Light cosmetic rehab ($15-25/sqft) includes paint, carpet, fixtures. Medium rehab ($25-40/sqft) adds kitchen/bath updates, flooring, some mechanical. Heavy rehab ($40-75/sqft) includes structural, full kitchen/bath, HVAC, roof, foundation. Always add 10% contingency.',
    source: 'manual',
    tags: ['repairs', 'costs', 'estimating'],
    createdAt: new Date(),
  },
]

export default function KnowledgeBase() {
  const [entries, setEntries] = useState<KnowledgeEntry[]>(DEFAULT_ENTRIES)
  const [search, setSearch] = useState('')
  const [showAddForm, setShowAddForm] = useState(false)
  const [addSource, setAddSource] = useState<KnowledgeEntry['source']>('manual')
  const [isLoading, setIsLoading] = useState(false)

  // Form state
  const [formTitle, setFormTitle] = useState('')
  const [formContent, setFormContent] = useState('')
  const [formUrl, setFormUrl] = useState('')
  const [formTags, setFormTags] = useState('')

  const filteredEntries = entries.filter((e) => {
    if (!search) return true
    const lower = search.toLowerCase()
    return (
      e.title.toLowerCase().includes(lower) ||
      e.content.toLowerCase().includes(lower) ||
      e.tags.some((t) => t.toLowerCase().includes(lower))
    )
  })

  const handleAddEntry = () => {
    if (!formTitle.trim() || !formContent.trim()) {
      toast.error('Title and content are required')
      return
    }

    const entry: KnowledgeEntry = {
      id: `kb-${Date.now()}`,
      title: formTitle.trim(),
      content: formContent.trim(),
      source: addSource,
      url: formUrl || undefined,
      tags: formTags.split(',').map((t) => t.trim()).filter(Boolean),
      createdAt: new Date(),
    }

    setEntries((prev) => [entry, ...prev])
    resetForm()
    toast.success('Knowledge entry added! The AI will now use this information.')
  }

  const handleScrapeUrl = async () => {
    if (!formUrl.trim()) {
      toast.error('Enter a URL to scrape')
      return
    }

    setIsLoading(true)
    // In production, this would call a backend to scrape the URL
    // For now, create a placeholder entry
    setTimeout(() => {
      const entry: KnowledgeEntry = {
        id: `kb-${Date.now()}`,
        title: `Content from: ${new URL(formUrl).hostname}`,
        content: `Web content scraped from ${formUrl}. In production, this would contain the actual page content extracted via a backend service. The AI will reference this when answering related questions.`,
        source: 'url',
        url: formUrl,
        tags: ['web', 'scraped'],
        createdAt: new Date(),
      }
      setEntries((prev) => [entry, ...prev])
      setIsLoading(false)
      resetForm()
      toast.success('URL content added to knowledge base!')
    }, 1500)
  }

  const deleteEntry = (id: string) => {
    setEntries((prev) => prev.filter((e) => e.id !== id))
    toast.success('Entry removed')
  }

  const resetForm = () => {
    setFormTitle('')
    setFormContent('')
    setFormUrl('')
    setFormTags('')
    setShowAddForm(false)
  }

  const sourceIcon = (source: KnowledgeEntry['source']) => {
    switch (source) {
      case 'document': return <FileText className="w-4 h-4" />
      case 'url': return <Globe className="w-4 h-4" />
      case 'faq': return <MessageCircleQuestion className="w-4 h-4" />
      default: return <PenLine className="w-4 h-4" />
    }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
            <BookOpen className="w-7 h-7 text-primary-600" />
            Knowledge Base
          </h1>
          <p className="text-slate-600">
            Train your AI assistant with custom knowledge about your business, market, and processes
          </p>
        </div>
        <button
          onClick={() => setShowAddForm(!showAddForm)}
          className="flex items-center gap-2 px-4 py-2.5 bg-primary-800 text-white rounded-lg hover:bg-primary-700 transition-colors"
        >
          <Plus className="w-4 h-4" />
          Add Knowledge
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
        <div className="bg-white rounded-xl border border-slate-200 p-4 text-center">
          <p className="text-2xl font-bold text-slate-800">{entries.length}</p>
          <p className="text-sm text-slate-500">Total Entries</p>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 p-4 text-center">
          <p className="text-2xl font-bold text-slate-800">{entries.filter((e) => e.source === 'manual').length}</p>
          <p className="text-sm text-slate-500">Manual</p>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 p-4 text-center">
          <p className="text-2xl font-bold text-slate-800">{entries.filter((e) => e.source === 'url').length}</p>
          <p className="text-sm text-slate-500">From URLs</p>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 p-4 text-center">
          <p className="text-2xl font-bold text-slate-800">{entries.filter((e) => e.source === 'faq').length}</p>
          <p className="text-sm text-slate-500">FAQs</p>
        </div>
      </div>

      {/* Add Form */}
      {showAddForm && (
        <div className="bg-white rounded-xl border border-slate-200 p-6">
          <h3 className="text-lg font-semibold text-slate-800 mb-4">Add Knowledge Entry</h3>

          {/* Source selector */}
          <div className="flex gap-2 mb-4">
            {[
              { id: 'manual' as const, label: 'Manual Entry', icon: PenLine },
              { id: 'url' as const, label: 'From URL', icon: Globe },
              { id: 'faq' as const, label: 'FAQ', icon: MessageCircleQuestion },
            ].map((s) => (
              <button
                key={s.id}
                onClick={() => setAddSource(s.id)}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg border text-sm transition-colors ${
                  addSource === s.id
                    ? 'bg-primary-50 border-primary-300 text-primary-700'
                    : 'border-slate-200 text-slate-600 hover:bg-slate-50'
                }`}
              >
                <s.icon className="w-4 h-4" />
                {s.label}
              </button>
            ))}
          </div>

          {addSource === 'url' ? (
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">URL to Scrape</label>
                <div className="flex gap-2">
                  <input
                    type="url"
                    value={formUrl}
                    onChange={(e) => setFormUrl(e.target.value)}
                    placeholder="https://example.com/article"
                    className="flex-1 px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                  />
                  <button
                    onClick={handleScrapeUrl}
                    disabled={isLoading}
                    className="flex items-center gap-2 px-4 py-2 bg-primary-800 text-white rounded-lg hover:bg-primary-700 disabled:opacity-50"
                  >
                    {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <ExternalLink className="w-4 h-4" />}
                    {isLoading ? 'Scraping...' : 'Scrape'}
                  </button>
                </div>
                <p className="text-xs text-slate-400 mt-1">
                  The AI will extract and learn from the page content
                </p>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  {addSource === 'faq' ? 'Question' : 'Title'} *
                </label>
                <input
                  type="text"
                  value={formTitle}
                  onChange={(e) => setFormTitle(e.target.value)}
                  placeholder={addSource === 'faq' ? 'What is your process for making offers?' : 'Entry title...'}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  {addSource === 'faq' ? 'Answer' : 'Content'} *
                </label>
                <textarea
                  rows={4}
                  value={formContent}
                  onChange={(e) => setFormContent(e.target.value)}
                  placeholder={addSource === 'faq' ? 'We typically make offers within 24 hours...' : 'Knowledge content the AI should know...'}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 resize-none"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Tags <span className="text-xs text-slate-400 font-normal">(comma-separated)</span>
                </label>
                <input
                  type="text"
                  value={formTags}
                  onChange={(e) => setFormTags(e.target.value)}
                  placeholder="wholesale, offers, pricing"
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                />
              </div>
              <div className="flex gap-3">
                <button
                  onClick={resetForm}
                  className="px-4 py-2 border border-slate-300 text-slate-700 rounded-lg hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  onClick={handleAddEntry}
                  className="px-6 py-2 bg-primary-800 text-white rounded-lg hover:bg-primary-700"
                >
                  Add Entry
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search knowledge base..."
          className="w-full pl-10 pr-4 py-2.5 bg-white border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary-500"
        />
      </div>

      {/* Entries List */}
      <div className="space-y-3">
        {filteredEntries.map((entry) => (
          <div
            key={entry.id}
            className="bg-white rounded-xl border border-slate-200 p-4 hover:border-slate-300 transition-colors"
          >
            <div className="flex items-start justify-between gap-4">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-slate-400">{sourceIcon(entry.source)}</span>
                  <h3 className="font-semibold text-slate-800 truncate">{entry.title}</h3>
                </div>
                <p className="text-sm text-slate-600 line-clamp-2">{entry.content}</p>
                {entry.tags.length > 0 && (
                  <div className="flex items-center gap-1.5 mt-2 flex-wrap">
                    <Tag className="w-3 h-3 text-slate-400" />
                    {entry.tags.map((tag) => (
                      <span
                        key={tag}
                        className="px-2 py-0.5 text-xs bg-slate-100 text-slate-500 rounded-full"
                      >
                        {tag}
                      </span>
                    ))}
                  </div>
                )}
                {entry.url && (
                  <p className="text-xs text-primary-500 mt-1 truncate">{entry.url}</p>
                )}
              </div>
              <button
                onClick={() => deleteEntry(entry.id)}
                className="p-1.5 text-slate-400 hover:text-red-500 transition-colors shrink-0"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          </div>
        ))}

        {filteredEntries.length === 0 && (
          <div className="text-center py-12 text-slate-400">
            <BookOpen className="w-12 h-12 mx-auto mb-3 opacity-50" />
            <p className="font-medium">No entries found</p>
            <p className="text-sm mt-1">Add knowledge entries to train your AI assistant</p>
          </div>
        )}
      </div>
    </div>
  )
}
