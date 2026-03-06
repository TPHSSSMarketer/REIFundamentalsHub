import { useState, useEffect } from 'react'
import { Loader2, Send, Eye, EyeOff, Cpu } from 'lucide-react'
import {
  getAiConfig,
  updateAiConfig,
  testAiProvider,
  type AiUserConfig,
} from '@/services/aiApi'
import { toast } from 'sonner'

const PROVIDER_DISPLAY: Record<string, { name: string; icon: string }> = {
  anthropic: { name: 'Anthropic Claude', icon: 'A' },
  nvidia_kimi: { name: 'NVIDIA Kimi 2.5', icon: 'N' },
  nvidia_minimax: { name: 'NVIDIA MiniMax 2.1', icon: 'N' },
  nvidia_aiq: { name: 'NVIDIA AI-Q', icon: 'N' },
}

export default function AiProviderUserSettings() {
  const [config, setConfig] = useState<AiUserConfig | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  // User override selections
  const [selectedProvider, setSelectedProvider] = useState('')
  const [selectedModel, setSelectedModel] = useState('')

  // User keys
  const [useOwnKeys, setUseOwnKeys] = useState(false)
  const [anthropicKey, setAnthropicKey] = useState('')
  const [nvidiaKey, setNvidiaKey] = useState('')
  const [showAnthropicKey, setShowAnthropicKey] = useState(false)
  const [showNvidiaKey, setShowNvidiaKey] = useState(false)

  // Test
  const [testResult, setTestResult] = useState<{
    response: string
    provider: string
    model: string
    tokens_used: number
    latency_ms: number
  } | null>(null)
  const [testing, setTesting] = useState(false)

  useEffect(() => {
    async function load() {
      try {
        const cfg = await getAiConfig()
        setConfig(cfg)
        setSelectedProvider(cfg.active_provider)
        setSelectedModel(cfg.active_model)
        setUseOwnKeys(cfg.has_own_keys)
      } catch {
        // Component might not be shown if not available
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [])

  const handleSaveProvider = async () => {
    setSaving(true)
    try {
      await updateAiConfig({
        ai_provider_override: selectedProvider,
        ai_model_override: selectedModel,
      })
      toast.success('AI provider updated')
      const cfg = await getAiConfig()
      setConfig(cfg)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to save')
    } finally {
      setSaving(false)
    }
  }

  const handleSaveKeys = async () => {
    setSaving(true)
    try {
      const data: Record<string, string> = {}
      if (anthropicKey) data.ai_own_anthropic_key = anthropicKey
      if (nvidiaKey) data.ai_own_nvidia_key = nvidiaKey
      await updateAiConfig(data)
      setAnthropicKey('')
      setNvidiaKey('')
      toast.success('API keys saved and encrypted')
      const cfg = await getAiConfig()
      setConfig(cfg)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to save keys')
    } finally {
      setSaving(false)
    }
  }

  const handleTest = async () => {
    setTesting(true)
    setTestResult(null)
    try {
      const result = await testAiProvider('What is a subject-to deal in real estate investing? Answer in 2 sentences.')
      setTestResult(result)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Test failed')
    } finally {
      setTesting(false)
    }
  }

  if (loading) {
    return (
      <div className="bg-white rounded-xl border border-slate-200 p-4 md:p-6">
        <div className="flex items-center justify-center h-24">
          <Loader2 className="w-5 h-5 animate-spin text-primary-500" />
        </div>
      </div>
    )
  }

  if (!config) return null

  // Only show if admin allows override
  if (!config.can_override) return null

  const currentProviderDisplay = PROVIDER_DISPLAY[config.active_provider] || {
    name: config.active_provider,
    icon: '?',
  }

  return (
    <div className="bg-white rounded-xl border border-slate-200 p-4 md:p-6">
      <div className="flex items-center gap-2 mb-1">
        <Cpu className="w-5 h-5 text-primary-500" />
        <h2 className="text-lg font-semibold text-slate-800">AI Provider</h2>
      </div>
      <p className="text-sm text-slate-600 mb-4">Choose your preferred AI provider for research and analysis.</p>

      {/* Current provider badge */}
      <div className="flex items-center gap-2 mb-4">
        <span className="text-xs text-slate-500">Current:</span>
        <span className="text-xs font-medium px-2 py-1 bg-blue-100 text-blue-700 rounded-full">
          {currentProviderDisplay.name} / {config.active_model}
        </span>
      </div>

      {/* Provider selector */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4">
        {config.available_providers.map((p) => {
          const display = PROVIDER_DISPLAY[p.id] || { name: p.display_name, icon: '?' }
          const isSelected = selectedProvider === p.id
          return (
            <button
              key={p.id}
              onClick={() => {
                setSelectedProvider(p.id)
                setSelectedModel(p.default_model)
              }}
              className={`flex items-center gap-3 p-3 rounded-xl border-2 text-left transition-all ${
                isSelected ? 'border-blue-500 bg-blue-50' : 'border-slate-200 hover:border-slate-300'
              }`}
            >
              <div
                className={`w-8 h-8 rounded-lg flex items-center justify-center font-bold text-sm ${
                  p.id === 'anthropic'
                    ? 'bg-amber-100 text-amber-700'
                    : 'bg-green-100 text-green-700'
                }`}
              >
                {display.icon}
              </div>
              <div>
                <div className="text-sm font-medium text-slate-800">{display.name}</div>
                <div className="text-xs text-slate-500 font-mono">{p.default_model}</div>
              </div>
            </button>
          )
        })}
      </div>

      {/* Model selector for providers with multiple models */}
      {config.available_providers
        .filter((p) => p.id === selectedProvider && p.models.length > 1)
        .map((p) => (
          <div key={p.id} className="mb-4">
            <label className="block text-sm font-medium text-slate-700 mb-1">Model</label>
            <select
              value={selectedModel}
              onChange={(e) => setSelectedModel(e.target.value)}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
            >
              {p.models.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
          </div>
        ))}

      <button
        onClick={handleSaveProvider}
        disabled={saving}
        className="mb-6 px-4 py-2 bg-primary-500 text-white text-sm font-medium rounded-lg hover:bg-primary-600 disabled:opacity-50"
      >
        {saving ? 'Saving...' : 'Save Provider'}
      </button>

      {/* Own API Keys section */}
      {config.can_bring_own_key && (
        <div className="border-t border-slate-200 pt-4 mb-4">
          <label className="flex items-center gap-2 mb-3 cursor-pointer">
            <input
              type="checkbox"
              checked={useOwnKeys}
              onChange={(e) => setUseOwnKeys(e.target.checked)}
              className="w-4 h-4 text-blue-600 rounded border-slate-300 focus:ring-blue-500"
            />
            <span className="text-sm font-medium text-slate-700">Link my own API keys</span>
          </label>
          <p className="text-xs text-slate-500 ml-6 -mt-2 mb-3">
            Your plan credits are used first. Your own keys kick in automatically when credits are exhausted, so you're never blocked from AI features.
          </p>

          {useOwnKeys && (
            <div className="space-y-3 ml-6">
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">
                  Anthropic API Key
                  {config.own_anthropic_configured && (
                    <span className="ml-2 text-green-600">Configured</span>
                  )}
                </label>
                <div className="relative">
                  <input
                    type={showAnthropicKey ? 'text' : 'password'}
                    value={anthropicKey}
                    onChange={(e) => setAnthropicKey(e.target.value)}
                    placeholder="sk-ant-..."
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
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">
                  NVIDIA API Key
                  {config.own_nvidia_configured && (
                    <span className="ml-2 text-green-600">Configured</span>
                  )}
                </label>
                <div className="relative">
                  <input
                    type={showNvidiaKey ? 'text' : 'password'}
                    value={nvidiaKey}
                    onChange={(e) => setNvidiaKey(e.target.value)}
                    placeholder="nvapi-..."
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
              </div>

              <p className="text-xs text-slate-400">Your keys are encrypted and never shared. They are only used when your plan credits and purchased credits are fully used up.</p>

              <button
                onClick={handleSaveKeys}
                disabled={saving || (!anthropicKey && !nvidiaKey)}
                className="px-4 py-1.5 bg-slate-800 text-white text-xs font-medium rounded-lg hover:bg-slate-900 disabled:opacity-50"
              >
                Save Keys
              </button>
            </div>
          )}
        </div>
      )}

      {/* Test section */}
      <div className="border-t border-slate-200 pt-4">
        <button
          onClick={handleTest}
          disabled={testing}
          className="flex items-center gap-2 px-4 py-2 bg-slate-100 text-slate-700 text-sm font-medium rounded-lg hover:bg-slate-200 disabled:opacity-50"
        >
          {testing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
          Test My Settings
        </button>

        {testResult && (
          <div className="mt-3 p-3 bg-slate-50 rounded-lg border border-slate-200">
            <div className="flex flex-wrap gap-2 mb-2">
              <span className="text-[10px] px-1.5 py-0.5 bg-blue-100 text-blue-700 rounded">
                {testResult.provider}
              </span>
              <span className="text-[10px] px-1.5 py-0.5 bg-green-100 text-green-700 rounded">
                {testResult.model}
              </span>
              <span className="text-[10px] px-1.5 py-0.5 bg-purple-100 text-purple-700 rounded">
                {testResult.tokens_used} tokens
              </span>
              <span className="text-[10px] px-1.5 py-0.5 bg-amber-100 text-amber-700 rounded">
                {testResult.latency_ms}ms
              </span>
            </div>
            <p className="text-sm text-slate-700 whitespace-pre-wrap">{testResult.response}</p>
          </div>
        )}
      </div>
    </div>
  )
}
