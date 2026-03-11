import { useState, useEffect } from 'react'
import {
  Activity,
  Database,
  CheckCircle2,
  XCircle,
  AlertCircle,
  Loader2,
  RefreshCw,
  Send,
  Zap,
  Server,
  Shield,
  HardDrive,
} from 'lucide-react'
import {
  getSystemHealth,
  testProvider,
  rebuildKnowledgeEmbeddings,
  rebuildContentEmbeddings,
  testTelegram,
  type SystemHealth,
} from '@/services/adminApi'

/* ── Status indicator helpers ──────────────────────────────── */

function StatusDot({ status }: { status: 'ok' | 'warn' | 'error' | 'loading' }) {
  if (status === 'loading') return <Loader2 className="w-3 h-3 animate-spin text-slate-400" />
  const color = status === 'ok' ? 'bg-green-500' : status === 'warn' ? 'bg-yellow-500' : 'bg-red-500'
  return <span className={`w-2.5 h-2.5 rounded-full ${color} inline-block`} />
}

function CountCard({ label, value, icon: Icon }: { label: string; value: number | string; icon: typeof Database }) {
  return (
    <div className="bg-white rounded-lg border border-slate-200 p-4 flex items-center gap-3">
      <div className="p-2 rounded-lg bg-slate-100">
        <Icon className="w-5 h-5 text-slate-600" />
      </div>
      <div>
        <p className="text-2xl font-bold text-slate-900">{value === -1 ? '—' : value}</p>
        <p className="text-xs text-slate-500">{label}</p>
      </div>
    </div>
  )
}

/* ── Provider display name mapping ─────────────────────────── */

const PROVIDER_DISPLAY: Record<string, string> = {
  stripe: 'Stripe',
  paypal: 'PayPal',
  square: 'Square',
  plaid: 'Plaid',
  twilio: 'Twilio',
  elevenlabs: 'ElevenLabs',
  sendgrid: 'SendGrid',
  resend: 'Resend',
  anthropic: 'Anthropic',
  openai: 'OpenAI',
  nvidia: 'NVIDIA',
  slack: 'Slack',
  telegram: 'Telegram',
  whatsapp: 'WhatsApp',
  qdrant: 'Qdrant',
  google_calendar: 'Google Calendar',
  outlook: 'Outlook',
  usps: 'USPS',
  wordpress: 'WordPress',
}

/* ── Main Component ────────────────────────────────────────── */

export default function AdminToolsTab() {
  const [health, setHealth] = useState<SystemHealth | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Action states
  const [testingProvider, setTestingProvider] = useState<string | null>(null)
  const [providerResults, setProviderResults] = useState<Record<string, { status: string; message: string }>>({})
  const [rebuildingKnowledge, setRebuildingKnowledge] = useState(false)
  const [rebuildingContent, setRebuildingContent] = useState(false)
  const [testingTelegram, setTestingTelegram] = useState(false)
  const [actionResults, setActionResults] = useState<Record<string, { status: string; message: string }>>({})

  useEffect(() => {
    loadHealth()
  }, [])

  const loadHealth = async () => {
    setIsLoading(true)
    setError(null)
    try {
      const data = await getSystemHealth()
      setHealth(data)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load system health')
    } finally {
      setIsLoading(false)
    }
  }

  const handleTestProvider = async (providerName: string) => {
    setTestingProvider(providerName)
    try {
      const result = await testProvider(providerName)
      setProviderResults(prev => ({ ...prev, [providerName]: result }))
    } catch (err) {
      setProviderResults(prev => ({
        ...prev,
        [providerName]: { status: 'error', message: err instanceof Error ? err.message : 'Test failed' },
      }))
    } finally {
      setTestingProvider(null)
    }
  }

  const handleRebuildKnowledge = async () => {
    setRebuildingKnowledge(true)
    try {
      const result = await rebuildKnowledgeEmbeddings()
      setActionResults(prev => ({
        ...prev,
        knowledge: { status: 'ok', message: `Rebuilt ${result.entries_rebuilt} entries` },
      }))
    } catch (err) {
      setActionResults(prev => ({
        ...prev,
        knowledge: { status: 'error', message: err instanceof Error ? err.message : 'Rebuild failed' },
      }))
    } finally {
      setRebuildingKnowledge(false)
    }
  }

  const handleRebuildContent = async () => {
    setRebuildingContent(true)
    try {
      const result = await rebuildContentEmbeddings()
      setActionResults(prev => ({
        ...prev,
        content: { status: 'ok', message: `Rebuilt ${result.entries_rebuilt} entries across ${result.users_processed || 1} subscriber${(result.users_processed || 1) > 1 ? 's' : ''}` },
      }))
    } catch (err) {
      setActionResults(prev => ({
        ...prev,
        content: { status: 'error', message: err instanceof Error ? err.message : 'Rebuild failed' },
      }))
    } finally {
      setRebuildingContent(false)
    }
  }

  const handleTestTelegram = async () => {
    setTestingTelegram(true)
    try {
      const result = await testTelegram()
      setActionResults(prev => ({ ...prev, telegram: result }))
    } catch (err) {
      setActionResults(prev => ({
        ...prev,
        telegram: { status: 'error', message: err instanceof Error ? err.message : 'Test failed' },
      }))
    } finally {
      setTestingTelegram(false)
    }
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="w-8 h-8 text-primary-600 animate-spin" />
          <p className="text-sm text-slate-600">Loading system health...</p>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-xl p-6 text-center">
        <XCircle className="w-8 h-8 text-red-500 mx-auto mb-2" />
        <p className="text-red-700">{error}</p>
        <button onClick={loadHealth} className="mt-3 text-sm text-red-600 underline">
          Retry
        </button>
      </div>
    )
  }

  if (!health) return null

  const counts = health.database_counts
  const configuredProviders = health.providers.filter(p => p.configured)
  const unconfiguredProviders = health.providers.filter(p => !p.configured)

  return (
    <div className="space-y-6">

      {/* ── Header with Refresh ──────────────────────────── */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Activity className="w-5 h-5 text-primary-600" />
          <h2 className="text-lg font-bold text-slate-900">System Health</h2>
        </div>
        <button
          onClick={loadHealth}
          className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-slate-600 border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          Refresh
        </button>
      </div>

      {/* ── Database Counts ──────────────────────────────── */}
      <div>
        <h3 className="text-sm font-semibold text-slate-700 mb-3 flex items-center gap-2">
          <Database className="w-4 h-4" />
          Database Overview
        </h3>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
          <CountCard label="Users" value={counts.users} icon={Shield} />
          <CountCard label="Deals" value={counts.deals} icon={HardDrive} />
          <CountCard label="Contacts" value={counts.contacts} icon={Shield} />
          <CountCard label="Negotiation Cases" value={counts.negotiation_cases} icon={Server} />
          <CountCard label="Help Tickets" value={counts.help_tickets} icon={AlertCircle} />
          <CountCard label="Knowledge (System)" value={counts.knowledge_platform} icon={Database} />
          <CountCard label="Knowledge (User)" value={counts.knowledge_user} icon={Database} />
          <CountCard label="Knowledge (Total)" value={counts.knowledge_entries} icon={Database} />
          <CountCard label="Content Entries" value={counts.content_entries} icon={HardDrive} />
        </div>
      </div>

      {/* ── Qdrant Vector DB ─────────────────────────────── */}
      <div className="bg-white rounded-xl border border-slate-200 p-5">
        <h3 className="text-sm font-semibold text-slate-700 mb-3 flex items-center gap-2">
          <Zap className="w-4 h-4" />
          Qdrant Vector Database
        </h3>
        <div className="flex items-center gap-3 mb-3">
          <StatusDot status={health.qdrant.status === 'connected' ? 'ok' : health.qdrant.status === 'not_configured' ? 'warn' : 'error'} />
          <span className="text-sm text-slate-700">{health.qdrant.message}</span>
        </div>

        {health.qdrant.collections && health.qdrant.collections.length > 0 && (
          <div className="mb-4">
            <p className="text-xs font-medium text-slate-500 mb-1.5">Collections:</p>
            <div className="flex flex-wrap gap-2">
              {health.qdrant.collections.map(name => (
                <span key={name} className="px-2 py-1 text-xs bg-slate-100 text-slate-700 rounded-md font-mono">
                  {name}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Rebuild buttons */}
        <div className="flex flex-wrap gap-3 pt-2 border-t border-slate-100">
          <button
            onClick={handleRebuildKnowledge}
            disabled={rebuildingKnowledge}
            className="flex items-center gap-2 px-3 py-2 text-sm bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors disabled:opacity-50"
          >
            {rebuildingKnowledge ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
            Rebuild Knowledge Embeddings
          </button>
          <button
            onClick={handleRebuildContent}
            disabled={rebuildingContent}
            className="flex items-center gap-2 px-3 py-2 text-sm bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors disabled:opacity-50"
          >
            {rebuildingContent ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
            Rebuild Content Embeddings
          </button>
        </div>

        {/* Rebuild result messages */}
        {actionResults.knowledge && (
          <div className={`mt-2 flex items-center gap-2 text-sm ${actionResults.knowledge.status === 'ok' ? 'text-green-700' : 'text-red-700'}`}>
            {actionResults.knowledge.status === 'ok' ? <CheckCircle2 className="w-4 h-4" /> : <XCircle className="w-4 h-4" />}
            {actionResults.knowledge.message}
          </div>
        )}
        {actionResults.content && (
          <div className={`mt-2 flex items-center gap-2 text-sm ${actionResults.content.status === 'ok' ? 'text-green-700' : 'text-red-700'}`}>
            {actionResults.content.status === 'ok' ? <CheckCircle2 className="w-4 h-4" /> : <XCircle className="w-4 h-4" />}
            {actionResults.content.message}
          </div>
        )}
      </div>

      {/* ── Telegram Test ────────────────────────────────── */}
      <div className="bg-white rounded-xl border border-slate-200 p-5">
        <h3 className="text-sm font-semibold text-slate-700 mb-3 flex items-center gap-2">
          <Send className="w-4 h-4" />
          Telegram Notification Test
        </h3>
        <p className="text-xs text-slate-500 mb-3">
          Send a test message to your Telegram to verify the bot connection is working.
        </p>
        <button
          onClick={handleTestTelegram}
          disabled={testingTelegram}
          className="flex items-center gap-2 px-3 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50"
        >
          {testingTelegram ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
          Send Test Message
        </button>
        {actionResults.telegram && (
          <div className={`mt-2 flex items-center gap-2 text-sm ${actionResults.telegram.status === 'connected' ? 'text-green-700' : 'text-red-700'}`}>
            {actionResults.telegram.status === 'connected' ? <CheckCircle2 className="w-4 h-4" /> : <XCircle className="w-4 h-4" />}
            {actionResults.telegram.message}
          </div>
        )}
      </div>

      {/* ── Provider Connection Status ────────────────────── */}
      <div className="bg-white rounded-xl border border-slate-200 p-5">
        <h3 className="text-sm font-semibold text-slate-700 mb-3 flex items-center gap-2">
          <Server className="w-4 h-4" />
          Provider Connections ({configuredProviders.length} configured)
        </h3>

        {/* Configured providers */}
        <div className="space-y-2 mb-4">
          {configuredProviders.map(p => {
            const result = providerResults[p.name]
            const isTesting = testingProvider === p.name
            return (
              <div key={p.name} className="flex items-center justify-between py-2 px-3 bg-slate-50 rounded-lg">
                <div className="flex items-center gap-3">
                  <StatusDot status={result ? (result.status === 'connected' ? 'ok' : 'error') : 'ok'} />
                  <span className="text-sm font-medium text-slate-700">
                    {PROVIDER_DISPLAY[p.name] || p.name}
                  </span>
                  {p.last_updated && (
                    <span className="text-xs text-slate-400">
                      Updated {new Date(p.last_updated).toLocaleDateString()}
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  {result && (
                    <span className={`text-xs ${result.status === 'connected' ? 'text-green-600' : 'text-red-600'}`}>
                      {result.message}
                    </span>
                  )}
                  <button
                    onClick={() => handleTestProvider(p.name)}
                    disabled={isTesting}
                    className="flex items-center gap-1 px-2 py-1 text-xs text-slate-600 border border-slate-300 rounded hover:bg-white transition-colors disabled:opacity-50"
                  >
                    {isTesting ? <Loader2 className="w-3 h-3 animate-spin" /> : <Zap className="w-3 h-3" />}
                    Test
                  </button>
                </div>
              </div>
            )
          })}
        </div>

        {/* Not configured providers */}
        {unconfiguredProviders.length > 0 && (
          <div>
            <p className="text-xs font-medium text-slate-400 mb-2">
              Not Configured ({unconfiguredProviders.length})
            </p>
            <div className="flex flex-wrap gap-2">
              {unconfiguredProviders.map(p => (
                <span key={p.name} className="px-2 py-1 text-xs bg-slate-100 text-slate-500 rounded-md">
                  {PROVIDER_DISPLAY[p.name] || p.name}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
