import { useState, useEffect, useRef, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Search,
  LayoutDashboard,
  Kanban,
  Users,
  MapPin,
  Building2,
  Headphones,
  PenTool,
  CreditCard,
  Settings,
  FileText,
  Phone,
  Calendar,
  Landmark,
  Scale,
  BarChart3,
  Globe,
  LifeBuoy,
  Shield,
  Bot,
  BookOpen,
  Mail,
  MessageSquare,
  Mic,
  History,
  Send,
  GitBranch,
  ShieldCheck,
  Link2,
  Sliders,
  Calculator,
  ArrowRight,
  Command,
} from 'lucide-react'

// ── Searchable items catalog ─────────────────────────────────────────

interface SearchItem {
  label: string
  description: string
  path: string
  icon: React.ComponentType<{ className?: string }>
  keywords: string[]       // Extra terms that trigger a match
  category: 'page' | 'feature' | 'setting' | 'action'
}

const SEARCH_ITEMS: SearchItem[] = [
  // ── Main Pages ───────────────────────────────────────────
  { label: 'Dashboard', description: 'Overview of your deals, contacts, and activity', path: '/dashboard', icon: LayoutDashboard, keywords: ['home', 'overview', 'main'], category: 'page' },
  { label: 'Pipeline', description: 'Manage your deal pipeline and opportunities', path: '/pipeline', icon: Kanban, keywords: ['deals', 'opportunities', 'kanban', 'board'], category: 'page' },
  { label: 'Contacts', description: 'CRM contacts, leads, sellers, and buyers', path: '/contacts', icon: Users, keywords: ['crm', 'leads', 'sellers', 'buyers', 'people', 'prospects'], category: 'page' },
  { label: 'Markets', description: 'Market analysis and research', path: '/markets', icon: MapPin, keywords: ['market analysis', 'research', 'zip code', 'area'], category: 'page' },
  { label: 'Portfolio', description: 'Your real estate portfolio and properties', path: '/portfolio', icon: Building2, keywords: ['properties', 'holdings', 'investments', 'assets'], category: 'page' },
  { label: 'Documents', description: 'Document management and storage', path: '/documents', icon: FileText, keywords: ['files', 'contracts', 'agreements', 'upload'], category: 'page' },
  { label: 'LeadHub', description: 'Lead capture and management center', path: '/leadhub', icon: Globe, keywords: ['lead capture', 'landing pages', 'forms', 'leads'], category: 'page' },
  { label: 'Phone', description: 'Phone system, calls, and SMS', path: '/phone', icon: Phone, keywords: ['calls', 'dialer', 'sms', 'text', 'voicemail', 'softphone'], category: 'page' },
  { label: 'Calendar', description: 'Calendar and scheduling', path: '/calendar', icon: Calendar, keywords: ['schedule', 'appointments', 'events', 'meetings'], category: 'page' },
  { label: 'Assistant', description: 'AI Admin Assistant chat', path: '/assistant', icon: Bot, keywords: ['ai chat', 'admin assistant', 'chatbot', 'help'], category: 'page' },
  { label: 'ContentHub', description: 'Content creation and publishing', path: '/contenthub', icon: PenTool, keywords: ['content', 'blog', 'articles', 'social media', 'publishing', 'wordpress'], category: 'page' },
  { label: 'Analytics', description: 'Reports and analytics dashboard', path: '/analytics', icon: BarChart3, keywords: ['reports', 'stats', 'metrics', 'data', 'performance'], category: 'page' },
  { label: 'Proof of Funds', description: 'Generate proof of funds letters', path: '/proof-of-funds', icon: ShieldCheck, keywords: ['pof', 'verification', 'funds', 'letter'], category: 'page' },
  { label: 'Billing', description: 'Subscription, plan, and payment management', path: '/billing', icon: CreditCard, keywords: ['subscription', 'plan', 'payment', 'invoice', 'credits'], category: 'page' },
  { label: 'Help & Support', description: 'Help tickets and support', path: '/help', icon: LifeBuoy, keywords: ['support', 'tickets', 'help desk', 'issues'], category: 'page' },
  { label: 'Loan Servicing', description: 'Loan management and servicing', path: '/loan-servicing', icon: Landmark, keywords: ['loans', 'mortgage', 'servicing', 'payments'], category: 'page' },
  { label: 'Negotiations', description: 'Bank negotiation dashboard', path: '/negotiations', icon: Scale, keywords: ['bank', 'negotiate', 'short sale'], category: 'page' },
  { label: 'Admin', description: 'SuperAdmin panel and system management', path: '/admin', icon: Shield, keywords: ['superadmin', 'admin panel', 'system', 'management'], category: 'page' },

  // ── AI Studio Sub-Pages ──────────────────────────────────
  { label: 'AI Studio', description: 'AI tools, voice AI, email marketing, and knowledge base', path: '/assistanthub', icon: Headphones, keywords: ['assistant hub', 'ai studio', 'voice ai'], category: 'page' },
  { label: 'Knowledge Base', description: 'Manage AI training content and scripts', path: '/assistanthub', icon: BookOpen, keywords: ['knowledge', 'training', 'scripts', 'rag', 'bulk import', 'embeddings', 'qdrant'], category: 'feature' },
  { label: 'CallCommander AI', description: 'AI-powered phone call management', path: '/assistanthub', icon: Headphones, keywords: ['voice ai', 'call commander', 'ai calls', 'phone ai'], category: 'feature' },
  { label: 'AI Agents', description: 'Configure AI agent personalities and voices', path: '/assistanthub', icon: Bot, keywords: ['grace', 'marcus', 'sofia', 'agent', 'personality', 'voice'], category: 'feature' },
  { label: 'Voicemail Drops', description: 'AI-generated voicemail drops', path: '/assistanthub', icon: Phone, keywords: ['voicemail', 'drop', 'ringless'], category: 'feature' },
  { label: 'Voice Campaigns', description: 'Outbound AI call campaigns', path: '/assistanthub', icon: Mic, keywords: ['campaign', 'outbound', 'calls'], category: 'feature' },
  { label: 'Conversations', description: 'AI call transcripts and history', path: '/assistanthub', icon: History, keywords: ['transcripts', 'call history', 'conversation log'], category: 'feature' },
  { label: 'Email Marketing', description: 'Email campaigns, lists, templates, and sequences', path: '/assistanthub', icon: Mail, keywords: ['email', 'newsletter', 'campaign', 'drip', 'autoresponder', 'marketing'], category: 'feature' },
  { label: 'SMS Marketing', description: 'SMS campaigns and text messaging', path: '/assistanthub', icon: MessageSquare, keywords: ['sms', 'text campaign', 'text marketing'], category: 'feature' },
  { label: 'Web Chat', description: 'Website chat widget configuration', path: '/assistanthub', icon: Globe, keywords: ['chat widget', 'live chat', 'webchat'], category: 'feature' },
  { label: 'Flow Builder', description: 'Build conversation flows and automations', path: '/assistanthub', icon: GitBranch, keywords: ['flows', 'automation', 'workflow', 'conversation flow'], category: 'feature' },

  // ── Settings Sub-Pages ───────────────────────────────────
  { label: 'Settings', description: 'Account settings and preferences', path: '/settings', icon: Settings, keywords: ['account', 'profile', 'preferences', 'configuration'], category: 'page' },
  { label: 'Profile Settings', description: 'Company name, address, and branding', path: '/settings?tab=profile', icon: Building2, keywords: ['company', 'name', 'address', 'logo', 'branding', 'profile'], category: 'setting' },
  { label: 'Deal Analyzer Settings', description: 'Default strategies, expenses, and analysis preferences', path: '/settings?tab=analyzer', icon: Calculator, keywords: ['deal analyzer', 'analysis', 'strategy', 'arv', 'rehab'], category: 'setting' },
  { label: 'Integrations', description: 'Google Calendar, Drive, Dropbox, and social media connections', path: '/settings?tab=integrations', icon: Link2, keywords: ['google', 'calendar', 'drive', 'dropbox', 'facebook', 'linkedin', 'twitter', 'integration', 'connect'], category: 'setting' },
  { label: 'Team Management', description: 'Invite team members and manage roles', path: '/settings?tab=team', icon: Users, keywords: ['team', 'members', 'invite', 'roles', 'seats'], category: 'setting' },
  { label: 'Preferences', description: 'Notifications, voice, Telegram, theme, and display options', path: '/settings?tab=preferences', icon: Sliders, keywords: ['notifications', 'telegram', 'voice', 'theme', 'dark mode', 'light mode', 'email notifications', 'push notifications'], category: 'setting' },

  // ── Admin Features ───────────────────────────────────────
  { label: 'API Credentials', description: 'Manage API keys for Stripe, Twilio, OpenAI, Qdrant, and more', path: '/admin', icon: Shield, keywords: ['credentials', 'api keys', 'stripe', 'twilio', 'openai', 'qdrant', 'elevenlabs', 'anthropic', 'nvidia', 'sendgrid', 'resend'], category: 'setting' },

  // ── Quick Actions ────────────────────────────────────────
  { label: 'New Opportunity', description: 'Create a new deal in the pipeline', path: '/pipeline', icon: Kanban, keywords: ['new deal', 'add deal', 'create deal', 'add opportunity'], category: 'action' },
  { label: 'Add Contact', description: 'Add a new contact to the CRM', path: '/contacts', icon: Users, keywords: ['new contact', 'add lead', 'create contact', 'new lead'], category: 'action' },
]

const CATEGORY_LABELS: Record<string, string> = {
  page: 'Pages',
  feature: 'Features',
  setting: 'Settings',
  action: 'Quick Actions',
}

const CATEGORY_ORDER = ['action', 'page', 'feature', 'setting']

// ── Component ────────────────────────────────────────────────────────

interface CommandPaletteProps {
  isOpen: boolean
  onClose: () => void
}

export default function CommandPalette({ isOpen, onClose }: CommandPaletteProps) {
  const [query, setQuery] = useState('')
  const [selectedIndex, setSelectedIndex] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)
  const navigate = useNavigate()

  // Filter items based on query
  const filteredItems = useMemo(() => {
    if (!query.trim()) return SEARCH_ITEMS

    const lower = query.toLowerCase()
    const terms = lower.split(/\s+/)

    return SEARCH_ITEMS.filter(item => {
      const searchable = [
        item.label.toLowerCase(),
        item.description.toLowerCase(),
        ...item.keywords.map(k => k.toLowerCase()),
      ].join(' ')

      return terms.every(term => searchable.includes(term))
    })
  }, [query])

  // Group filtered items by category
  const groupedItems = useMemo(() => {
    const groups: Record<string, SearchItem[]> = {}
    for (const item of filteredItems) {
      if (!groups[item.category]) groups[item.category] = []
      groups[item.category].push(item)
    }
    // Return in order
    return CATEGORY_ORDER
      .filter(cat => groups[cat]?.length)
      .map(cat => ({ category: cat, items: groups[cat] }))
  }, [filteredItems])

  // Flat list for keyboard navigation
  const flatItems = useMemo(
    () => groupedItems.flatMap(g => g.items),
    [groupedItems]
  )

  // Reset on open/query change
  useEffect(() => {
    setSelectedIndex(0)
  }, [query, isOpen])

  // Focus input when opened
  useEffect(() => {
    if (isOpen) {
      setQuery('')
      setTimeout(() => inputRef.current?.focus(), 50)
    }
  }, [isOpen])

  // Keyboard navigation
  useEffect(() => {
    if (!isOpen) return

    const handleKeyDown = (e: KeyboardEvent) => {
      switch (e.key) {
        case 'ArrowDown':
          e.preventDefault()
          setSelectedIndex(prev => Math.min(prev + 1, flatItems.length - 1))
          break
        case 'ArrowUp':
          e.preventDefault()
          setSelectedIndex(prev => Math.max(prev - 1, 0))
          break
        case 'Enter':
          e.preventDefault()
          if (flatItems[selectedIndex]) {
            navigateTo(flatItems[selectedIndex])
          }
          break
        case 'Escape':
          e.preventDefault()
          onClose()
          break
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isOpen, selectedIndex, flatItems])

  // Scroll selected item into view
  useEffect(() => {
    if (!listRef.current) return
    const selected = listRef.current.querySelector('[data-selected="true"]')
    selected?.scrollIntoView({ block: 'nearest' })
  }, [selectedIndex])

  const navigateTo = (item: SearchItem) => {
    navigate(item.path)
    onClose()
  }

  if (!isOpen) return null

  let itemCounter = 0

  return (
    <div className="fixed inset-0 z-[100] flex items-start justify-center pt-[15vh]">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Palette */}
      <div className="relative w-full max-w-xl bg-white rounded-xl shadow-2xl border border-slate-200 overflow-hidden">
        {/* Search Input */}
        <div className="flex items-center gap-3 px-4 py-3 border-b border-slate-200">
          <Search className="w-5 h-5 text-slate-400 flex-shrink-0" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search pages, features, and settings..."
            className="flex-1 text-base text-slate-800 placeholder-slate-400 outline-none bg-transparent"
          />
          <kbd className="hidden sm:inline-flex items-center gap-1 px-2 py-0.5 text-xs font-mono text-slate-400 bg-slate-100 rounded border border-slate-200">
            ESC
          </kbd>
        </div>

        {/* Results */}
        <div ref={listRef} className="max-h-[50vh] overflow-y-auto">
          {flatItems.length === 0 ? (
            <div className="px-4 py-8 text-center text-slate-500">
              <p className="text-sm">No results for "{query}"</p>
              <p className="text-xs mt-1">Try searching for "knowledge base", "phone", or "billing"</p>
            </div>
          ) : (
            groupedItems.map(({ category, items }) => (
              <div key={category}>
                <div className="px-4 pt-3 pb-1">
                  <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
                    {CATEGORY_LABELS[category]}
                  </p>
                </div>
                {items.map(item => {
                  const currentIndex = itemCounter++
                  const isSelected = currentIndex === selectedIndex

                  return (
                    <button
                      key={`${item.label}-${item.path}`}
                      data-selected={isSelected}
                      onClick={() => navigateTo(item)}
                      onMouseEnter={() => setSelectedIndex(currentIndex)}
                      className={`w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors ${
                        isSelected
                          ? 'bg-primary-50 text-primary-700'
                          : 'text-slate-700 hover:bg-slate-50'
                      }`}
                    >
                      <item.icon className={`w-5 h-5 flex-shrink-0 ${
                        isSelected ? 'text-primary-500' : 'text-slate-400'
                      }`} />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{item.label}</p>
                        <p className={`text-xs truncate ${
                          isSelected ? 'text-primary-500' : 'text-slate-400'
                        }`}>
                          {item.description}
                        </p>
                      </div>
                      {isSelected && (
                        <ArrowRight className="w-4 h-4 text-primary-400 flex-shrink-0" />
                      )}
                    </button>
                  )
                })}
              </div>
            ))
          )}
        </div>

        {/* Footer hint */}
        <div className="px-4 py-2 border-t border-slate-100 bg-slate-50 flex items-center gap-4 text-xs text-slate-400">
          <span className="flex items-center gap-1">
            <kbd className="px-1.5 py-0.5 bg-white border border-slate-200 rounded text-[10px] font-mono">↑↓</kbd>
            navigate
          </span>
          <span className="flex items-center gap-1">
            <kbd className="px-1.5 py-0.5 bg-white border border-slate-200 rounded text-[10px] font-mono">↵</kbd>
            open
          </span>
          <span className="flex items-center gap-1">
            <kbd className="px-1.5 py-0.5 bg-white border border-slate-200 rounded text-[10px] font-mono">esc</kbd>
            close
          </span>
        </div>
      </div>
    </div>
  )
}
