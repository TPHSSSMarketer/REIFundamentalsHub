import { useState, useEffect, useCallback } from 'react'
import { Loader2, RefreshCw, Send, KeyRound } from 'lucide-react'
import {
  getAdminAiConfig,
  updateAdminAiConfig,
  getAiUsage,
  getAllUsersAiSettings,
  testAiProvider,
  type AiAdminConfig,
  type AiUsage,
  type AiUserSetting,
} from '@/services/aiApi'
import { toast } from 'sonner'

// ── Provider metadata ──────────────────────────────────────────────────

const PROVIDERS = [
  {
    id: 'anthropic',
    name: 'Anthropic Claude',
    icon: 'A',
    iconBg: 'bg-amber-100',
    iconColor: 'text-amber-700',
    models: ['claude-opus-4-6', 'claude-sonnet-4-6', 'claude-haiku-4-5-20251001'],
    keyField: 'anthropic' as const,
    role: 'Voice (Sonnet) · Chat & SMS (Haiku)',
    description: 'General AI, voice agents, web chat, SMS drafts',
  },
  {
    id: 'nvidia_kimi',
    name: 'NVIDIA Kimi 2.5',
    icon: 'N',
    iconBg: 'bg-green-100',
    iconColor: 'text-green-700',
    models: ['moonshotai/kimi-k2.5'],
    keyField: 'nvidia' as const,
    role: 'Research & Legal',
    description: 'State law research, bank negotiation, deep research',
  },
  {
    id: 'nvidia_minimax',
    name: 'NVIDIA MiniMax 2.5',
    icon: 'N',
    iconBg: 'bg-green-100',
    iconColor: 'text-green-700',
    models: ['minimaxai/minimax-m2.5'],
    keyField: 'nvidia' as const,
    role: 'Fast Summaries',
    description: 'Quick text generation and content summaries',
  },
  {
    id: 'nvidia_nemotron',
    name: 'NVIDIA Nemotron',
    icon: 'N',
    iconBg: 'bg-purple-100',
    iconColor: 'text-purple-700',
    models: ['nvidia/llama-3.3-nemotron-super-49b-v1'],
    keyField: 'nvidia' as const,
    role: 'AI Underwriting',
    description: 'Deep deal analysis with ATTOM property data',
  },
]

// ── Main Component ─────────────────────────────────────────────────────

export default function AiProviderSettings() {
  const [config, setConfig] = useState<AiAdminConfig | null>(null)
  const [usage, setUsage] = useState<AiUsage | null>(null)
  const [users, setUsers] = useState<AiUserSetting[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  // Test section
  const [testMessage, setTestMessage] = useState(
    'Summarize the key points of a contract for deed in plain English'
  )
  const [testResult, setTestResult] = useState<{
    response: string
    provider: string
    model: string
    tokens_used: number
    latency_ms: number
  } | null>(null)
  const [testing, setTesting] = useState(false)

  const loadAll = useCallback(async () => {
    try {
      const [cfg, usg, usrs] = await Promise.all([
        getAdminAiConfig(),
        getAiUsage(),
        getAllUsersAiSettings(),
      ])
      setConfig(cfg)
      setUsage(usg)
      setUsers(usrs)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to load AI config')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadAll()
  }, [loadAll])

  const handleToggle = async (field: 'allow_user_override' | 'user_can_bring_own_key') => {
    if (!config) return
    setSaving(true)
    try {
      const updated = await updateAdminAiConfig({
        [field]: !config[field],
      })
      setConfig(updated)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to update')
    } finally {
      setSaving(false)
    }
  }

  const handleTest = async () => {
    if (!testMessage.trim()) return
    setTesting(true)
    setTestResult(null)
    try {
      const result = await testAiProvider(testMessage)
      setTestResult(result)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Test failed')
    } finally {
      setTesting(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="w-6 h-6 animate-spin text-primary-500" />
      </div>
    )
  }

  if (!config) {
    return (
      <div className="p-4 rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm">
        Failed to load AI provider configuration.
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h2 className="text-xl font-bold text-slate-800">AI Provider Settings</h2>
        <p className="text-sm text-slate-600 mt-1">
          All AI models are always active. Each is automatically used for its designated task.
        </p>
      </div>

      {/* API Keys info banner */}
      <div className="flex items-start gap-3 p-4 bg-blue-50 border border-blue-200 rounded-xl">
        <KeyRound className="w-5 h-5 text-blue-600 mt-0.5 shrink-0" />
        <div>
          <p className="text-sm font-medium text-blue-800">
            API keys are managed in Admin &gt; Credentials
          </p>
          <p className="text-xs text-blue-600 mt-1">
            Navigate to <span className="font-semibold">Admin &gt; Credentials</span> to add or update your Anthropic and NVIDIA API keys. All providers below will use the keys configured there.
          </p>
        </div>
      </div>

      {/* Provider Cards — all models are always active, each serves a specific role */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {PROVIDERS.map((provider) => (
          <div
            key={provider.id}
            className="bg-white rounded-xl border-2 border-slate-200 p-5 transition-all"
          >
            <div className="flex items-start justify-between mb-3">
              <div className="flex items-center gap-3">
                <div
                  className={`w-10 h-10 rounded-lg flex items-center justify-center font-bold ${provider.iconBg} ${provider.iconColor}`}
                >
                  {provider.icon}
                </div>
                <div>
                  <span className="font-semibold text-slate-900">{provider.name}</span>
                  <p className="text-xs text-slate-500">{provider.description}</p>
                </div>
              </div>
              <span className="text-[10px] font-semibold px-2 py-1 bg-blue-50 text-blue-700 rounded-full whitespace-nowrap">
                {provider.role}
              </span>
            </div>

            {/* Model list */}
            {provider.models.length > 1 ? (
              <div className="mb-3">
                <label className="block text-xs font-medium text-slate-600 mb-1">Models</label>
                <div className="flex flex-wrap gap-1">
                  {provider.models.map((m) => (
                    <span key={m} className="text-[11px] px-2 py-0.5 bg-slate-100 text-slate-600 rounded font-mono">
                      {m}
                    </span>
                  ))}
                </div>
              </div>
            ) : (
              <p className="text-xs text-slate-500 mb-3 font-mono">
                Model: {provider.models[0]}
              </p>
            )}

            {/* Key source note */}
            {provider.keyField === 'nvidia' && provider.id !== 'nvidia_kimi' && (
              <p className="text-xs text-slate-500 mb-3">Uses shared NVIDIA API key</p>
            )}
          </div>
        ))}
      </div>

      {/* User Permissions */}
      <div className="bg-white rounded-xl border border-slate-200 p-5">
        <h3 className="text-sm font-semibold text-slate-800 mb-4">User Permissions</h3>
        <div className="space-y-3">
          <label className="flex items-center justify-between cursor-pointer">
            <div>
              <span className="text-sm font-medium text-slate-700">
                Allow users to select their own AI provider
              </span>
              <p className="text-xs text-slate-500">
                When disabled, all users use the global provider above
              </p>
            </div>
            <button
              onClick={() => handleToggle('allow_user_override')}
              className={`relative inline-flex h-6 w-11 shrink-0 rounded-full transition-colors ${
                config.allow_user_override ? 'bg-blue-600' : 'bg-slate-200'
              }`}
            >
              <span
                className={`inline-block h-5 w-5 rounded-full bg-white shadow transform transition-transform mt-0.5 ${
                  config.allow_user_override ? 'translate-x-5 ml-0.5' : 'translate-x-0.5'
                }`}
              />
            </button>
          </label>

          <label className="flex items-center justify-between cursor-pointer">
            <div>
              <span className="text-sm font-medium text-slate-700">
                Allow users to bring their own API keys
              </span>
              <p className="text-xs text-slate-500">
                Users can enter personal API keys for their account
              </p>
            </div>
            <button
              onClick={() => handleToggle('user_can_bring_own_key')}
              className={`relative inline-flex h-6 w-11 shrink-0 rounded-full transition-colors ${
                config.user_can_bring_own_key ? 'bg-blue-600' : 'bg-slate-200'
              }`}
            >
              <span
                className={`inline-block h-5 w-5 rounded-full bg-white shadow transform transition-transform mt-0.5 ${
                  config.user_can_bring_own_key ? 'translate-x-5 ml-0.5' : 'translate-x-0.5'
                }`}
              />
            </button>
          </label>
        </div>
      </div>

      {/* Test Providers — individual test buttons for each AI integration */}
      <div className="bg-white rounded-xl border border-slate-200 p-5">
        <h3 className="text-sm font-semibold text-slate-800 mb-3">Test AI Providers</h3>
        <textarea
          value={testMessage}
          onChange={(e) => setTestMessage(e.target.value)}
          rows={3}
          className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 resize-none"
          placeholder="Enter a test message..."
        />
        <div className="mt-2 flex flex-wrap gap-2">
          {([
            { label: 'Anthropic Sonnet', task: 'general', color: 'bg-amber-100 text-amber-700 hover:bg-amber-200' },
            { label: 'Anthropic Haiku', task: 'chat', color: 'bg-amber-50 text-amber-600 hover:bg-amber-100' },
            { label: 'NVIDIA Kimi', task: 'research', color: 'bg-green-100 text-green-700 hover:bg-green-200' },
            { label: 'NVIDIA MiniMax', task: 'summary', color: 'bg-green-50 text-green-600 hover:bg-green-100' },
            { label: 'NVIDIA Nemotron', task: 'underwriting', color: 'bg-purple-100 text-purple-700 hover:bg-purple-200' },
          ] as const).map((t) => (
            <button
              key={t.task}
              onClick={() => {
                setTesting(true)
                setTestResult(null)
                testAiProvider(testMessage, t.task)
                  .then((r) => setTestResult(r))
                  .catch((e) => toast.error(e instanceof Error ? e.message : 'Test failed'))
                  .finally(() => setTesting(false))
              }}
              disabled={testing || !testMessage.trim()}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg disabled:opacity-50 transition-colors ${t.color}`}
            >
              {testing ? <Loader2 className="w-3 h-3 animate-spin" /> : <Send className="w-3 h-3" />}
              Test {t.label}
            </button>
          ))}
        </div>

        {testResult && (
          <div className="mt-4 p-4 bg-slate-50 rounded-lg border border-slate-200">
            <div className="flex flex-wrap gap-3 mb-3">
              <span className="text-xs px-2 py-1 bg-blue-100 text-blue-700 rounded-full">
                Provider: {testResult.provider}
              </span>
              <span className="text-xs px-2 py-1 bg-green-100 text-green-700 rounded-full">
                Model: {testResult.model}
              </span>
              <span className="text-xs px-2 py-1 bg-purple-100 text-purple-700 rounded-full">
                Tokens: {testResult.tokens_used}
              </span>
              <span className="text-xs px-2 py-1 bg-amber-100 text-amber-700 rounded-full">
                Latency: {testResult.latency_ms}ms
              </span>
            </div>
            <p className="text-sm text-slate-700 whitespace-pre-wrap">{testResult.response}</p>
          </div>
        )}
      </div>

      {/* Usage Stats */}
      <div className="bg-white rounded-xl border border-slate-200 p-5">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-semibold text-slate-800">Usage Statistics</h3>
          <button
            onClick={() => {
              setLoading(true)
              loadAll()
            }}
            className="flex items-center gap-1 text-xs text-slate-500 hover:text-slate-700"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            Refresh
          </button>
        </div>

        {usage && (
          <>
            <div className="grid grid-cols-2 gap-4 mb-4">
              <div className="bg-slate-50 rounded-lg p-3">
                <p className="text-xs text-slate-500">Total Requests</p>
                <p className="text-xl font-bold text-slate-800">
                  {usage.total_requests.toLocaleString()}
                </p>
              </div>
              <div className="bg-slate-50 rounded-lg p-3">
                <p className="text-xs text-slate-500">Total Tokens</p>
                <p className="text-xl font-bold text-slate-800">
                  {usage.total_tokens.toLocaleString()}
                </p>
              </div>
            </div>

            {users.length > 0 && (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-200 bg-slate-50">
                      <th className="text-left px-3 py-2 font-medium text-slate-500">Email</th>
                      <th className="text-left px-3 py-2 font-medium text-slate-500">Provider</th>
                      <th className="text-left px-3 py-2 font-medium text-slate-500">Override</th>
                    </tr>
                  </thead>
                  <tbody>
                    {users.map((u) => (
                      <tr key={u.user_id} className="border-b border-slate-100">
                        <td className="px-3 py-2 text-slate-700">{u.email}</td>
                        <td className="px-3 py-2 text-slate-600">{u.effective_provider}</td>
                        <td className="px-3 py-2">
                          {u.ai_override_enabled ? (
                            <span className="text-xs px-2 py-0.5 bg-blue-100 text-blue-700 rounded-full">
                              Yes
                            </span>
                          ) : (
                            <span className="text-xs text-slate-400">No</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
