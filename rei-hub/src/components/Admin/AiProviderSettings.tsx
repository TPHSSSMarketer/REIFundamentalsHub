import { useState, useEffect, useCallback } from 'react'
import { Loader2, RefreshCw, Send, Eye, EyeOff } from 'lucide-react'
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
    description: 'Best general-purpose AI',
  },
  {
    id: 'nvidia_kimi',
    name: 'NVIDIA Kimi 2.5',
    icon: 'N',
    iconBg: 'bg-green-100',
    iconColor: 'text-green-700',
    models: ['moonshotai/kimi-k2.5-instruct'],
    keyField: 'nvidia' as const,
    description: 'Fast multilingual model',
  },
  {
    id: 'nvidia_minimax',
    name: 'NVIDIA MiniMax 2.1',
    icon: 'N',
    iconBg: 'bg-green-100',
    iconColor: 'text-green-700',
    models: ['minimax/minimax-text-01'],
    keyField: 'nvidia' as const,
    description: 'Efficient text generation',
  },
  {
    id: 'nvidia_aiq',
    name: 'NVIDIA AI-Q',
    icon: 'N',
    iconBg: 'bg-green-100',
    iconColor: 'text-green-700',
    models: ['nvidia/llama-3.3-nemotron-super-49b-v1'],
    keyField: 'nvidia' as const,
    badge: 'Research',
    description: 'Best for legal & research queries',
    note: 'Automatically used for state law and bank research',
  },
]

// ── Main Component ─────────────────────────────────────────────────────

export default function AiProviderSettings() {
  const [config, setConfig] = useState<AiAdminConfig | null>(null)
  const [usage, setUsage] = useState<AiUsage | null>(null)
  const [users, setUsers] = useState<AiUserSetting[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  // Key inputs (not stored in config — only sent on save)
  const [anthropicKey, setAnthropicKey] = useState('')
  const [nvidiaKey, setNvidiaKey] = useState('')
  const [showAnthropicKey, setShowAnthropicKey] = useState(false)
  const [showNvidiaKey, setShowNvidiaKey] = useState(false)

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

  const handleSetActive = async (providerId: string) => {
    if (!config) return
    const provider = PROVIDERS.find((p) => p.id === providerId)
    if (!provider) return
    setSaving(true)
    try {
      const updated = await updateAdminAiConfig({
        active_provider: providerId,
        active_model: provider.models[0],
      })
      setConfig(updated)
      toast.success(`Active provider set to ${provider.name}`)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to update')
    } finally {
      setSaving(false)
    }
  }

  const handleSaveModel = async (providerId: string, model: string) => {
    setSaving(true)
    try {
      const updated = await updateAdminAiConfig({
        active_provider: providerId,
        active_model: model,
      })
      setConfig(updated)
      toast.success('Model updated')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to update')
    } finally {
      setSaving(false)
    }
  }

  const handleSaveKey = async (keyType: 'anthropic' | 'nvidia') => {
    const key = keyType === 'anthropic' ? anthropicKey : nvidiaKey
    if (!key.trim()) return
    setSaving(true)
    try {
      const payload =
        keyType === 'anthropic'
          ? { anthropic_api_key: key }
          : { nvidia_api_key: key }
      const updated = await updateAdminAiConfig(payload)
      setConfig(updated)
      if (keyType === 'anthropic') setAnthropicKey('')
      else setNvidiaKey('')
      toast.success(`${keyType === 'anthropic' ? 'Anthropic' : 'NVIDIA'} API key saved`)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to save key')
    } finally {
      setSaving(false)
    }
  }

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
          Configure which AI provider is used across all accounts.
        </p>
      </div>

      {/* Provider Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {PROVIDERS.map((provider) => {
          const isActive = config.active_provider === provider.id
          const isConfigured =
            provider.keyField === 'anthropic'
              ? config.anthropic_configured
              : config.nvidia_configured

          return (
            <div
              key={provider.id}
              className={`bg-white rounded-xl border-2 p-5 transition-all ${
                isActive ? 'border-blue-500 shadow-sm' : 'border-slate-200'
              }`}
            >
              <div className="flex items-start justify-between mb-3">
                <div className="flex items-center gap-3">
                  <div
                    className={`w-10 h-10 rounded-lg flex items-center justify-center font-bold ${provider.iconBg} ${provider.iconColor}`}
                  >
                    {provider.icon}
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-slate-900">{provider.name}</span>
                      {provider.badge && (
                        <span className="text-[10px] px-1.5 py-0.5 bg-purple-100 text-purple-700 rounded-full font-medium">
                          {provider.badge}
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-slate-500">{provider.description}</p>
                  </div>
                </div>
                {isActive && (
                  <span className="text-xs font-medium px-2 py-1 bg-blue-100 text-blue-700 rounded-full">
                    Active
                  </span>
                )}
              </div>

              {/* Model selector (only for active or anthropic which has multiple) */}
              {provider.models.length > 1 && isActive && (
                <div className="mb-3">
                  <label className="block text-xs font-medium text-slate-600 mb-1">Model</label>
                  <select
                    value={config.active_model}
                    onChange={(e) => handleSaveModel(provider.id, e.target.value)}
                    className="w-full rounded-lg border border-slate-300 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
                  >
                    {provider.models.map((m) => (
                      <option key={m} value={m}>
                        {m}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {provider.models.length === 1 && (
                <p className="text-xs text-slate-500 mb-3 font-mono">
                  Model: {provider.models[0]}
                </p>
              )}

              {/* API Key input */}
              {provider.keyField === 'anthropic' && (
                <div className="mb-3">
                  <label className="block text-xs font-medium text-slate-600 mb-1">API Key</label>
                  <div className="flex gap-2">
                    <div className="relative flex-1">
                      <input
                        type={showAnthropicKey ? 'text' : 'password'}
                        value={anthropicKey}
                        onChange={(e) => setAnthropicKey(e.target.value)}
                        placeholder={config.anthropic_configured ? config.anthropic_api_key : 'sk-ant-...'}
                        className="w-full rounded-lg border border-slate-300 px-3 py-1.5 text-sm pr-8 focus:outline-none focus:ring-2 focus:ring-primary-500"
                      />
                      <button
                        type="button"
                        onClick={() => setShowAnthropicKey(!showAnthropicKey)}
                        className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                      >
                        {showAnthropicKey ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                      </button>
                    </div>
                    <button
                      onClick={() => handleSaveKey('anthropic')}
                      disabled={saving || !anthropicKey.trim()}
                      className="px-3 py-1.5 bg-slate-800 text-white text-xs font-medium rounded-lg hover:bg-slate-900 disabled:opacity-50"
                    >
                      Save
                    </button>
                  </div>
                </div>
              )}

              {provider.keyField === 'nvidia' && provider.id === 'nvidia_kimi' && (
                <div className="mb-3">
                  <label className="block text-xs font-medium text-slate-600 mb-1">
                    NVIDIA API Key <span className="text-slate-400">(shared across all NVIDIA models)</span>
                  </label>
                  <div className="flex gap-2">
                    <div className="relative flex-1">
                      <input
                        type={showNvidiaKey ? 'text' : 'password'}
                        value={nvidiaKey}
                        onChange={(e) => setNvidiaKey(e.target.value)}
                        placeholder={config.nvidia_configured ? config.nvidia_api_key : 'nvapi-...'}
                        className="w-full rounded-lg border border-slate-300 px-3 py-1.5 text-sm pr-8 focus:outline-none focus:ring-2 focus:ring-primary-500"
                      />
                      <button
                        type="button"
                        onClick={() => setShowNvidiaKey(!showNvidiaKey)}
                        className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                      >
                        {showNvidiaKey ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                      </button>
                    </div>
                    <button
                      onClick={() => handleSaveKey('nvidia')}
                      disabled={saving || !nvidiaKey.trim()}
                      className="px-3 py-1.5 bg-slate-800 text-white text-xs font-medium rounded-lg hover:bg-slate-900 disabled:opacity-50"
                    >
                      Save
                    </button>
                  </div>
                </div>
              )}

              {provider.keyField === 'nvidia' && provider.id !== 'nvidia_kimi' && (
                <p className="text-xs text-slate-500 mb-3">Uses same NVIDIA API key</p>
              )}

              {/* Status badge */}
              <div className="flex items-center justify-between">
                <span
                  className={`text-xs font-medium px-2 py-1 rounded-full ${
                    isConfigured
                      ? 'bg-green-100 text-green-700'
                      : 'bg-slate-100 text-slate-500'
                  }`}
                >
                  {isConfigured ? 'Configured' : 'Not Set'}
                </span>

                {!isActive && (
                  <button
                    onClick={() => handleSetActive(provider.id)}
                    disabled={saving}
                    className="text-xs font-medium px-3 py-1.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
                  >
                    Set as Active
                  </button>
                )}
              </div>

              {provider.note && (
                <p className="text-[11px] text-slate-400 mt-2 italic">{provider.note}</p>
              )}
            </div>
          )
        })}
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

      {/* Test Provider */}
      <div className="bg-white rounded-xl border border-slate-200 p-5">
        <h3 className="text-sm font-semibold text-slate-800 mb-3">Test Provider</h3>
        <textarea
          value={testMessage}
          onChange={(e) => setTestMessage(e.target.value)}
          rows={3}
          className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 resize-none"
          placeholder="Enter a test message..."
        />
        <button
          onClick={handleTest}
          disabled={testing || !testMessage.trim()}
          className="mt-2 flex items-center gap-2 px-4 py-2 bg-primary-600 text-white text-sm font-medium rounded-lg hover:bg-primary-700 disabled:opacity-50"
        >
          {testing ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <Send className="w-4 h-4" />
          )}
          Test Current Provider
        </button>

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
