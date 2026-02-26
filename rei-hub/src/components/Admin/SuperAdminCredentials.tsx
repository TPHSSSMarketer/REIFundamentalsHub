import { useState, useEffect, useCallback } from 'react'
import {
  Eye,
  EyeOff,
  Loader2,
  Check,
  X,
  RefreshCw,
  ChevronDown,
  ChevronRight,
  Shield,
  Zap,
  AlertCircle,
} from 'lucide-react'
import {
  getCredentialStatuses,
  updateCredential,
  deleteCredential,
  testCredential,
  type CredentialStatus,
  type TestResult,
} from '@/services/superadminApi'
import { toast } from 'sonner'

// ── Category display order and colors ───────────────────────────────────

const CATEGORY_ORDER = [
  'Payment',
  'Banking',
  'Email',
  'Communication',
  'Calendar',
  'Shipping',
  'AI',
]

const CATEGORY_COLORS: Record<string, string> = {
  Payment: 'border-blue-200 bg-blue-50',
  Banking: 'border-emerald-200 bg-emerald-50',
  Email: 'border-purple-200 bg-purple-50',
  Communication: 'border-orange-200 bg-orange-50',
  Calendar: 'border-pink-200 bg-pink-50',
  Shipping: 'border-amber-200 bg-amber-50',
  AI: 'border-green-200 bg-green-50',
}

const CATEGORY_HEADER_COLORS: Record<string, string> = {
  Payment: 'text-blue-800',
  Banking: 'text-emerald-800',
  Email: 'text-purple-800',
  Communication: 'text-orange-800',
  Calendar: 'text-pink-800',
  Shipping: 'text-amber-800',
  AI: 'text-green-800',
}

// ── Main component ──────────────────────────────────────────────────────

export default function SuperAdminCredentials() {
  const [credentials, setCredentials] = useState<CredentialStatus[]>([])
  const [loading, setLoading] = useState(true)
  const [expandedProviders, setExpandedProviders] = useState<Set<string>>(
    new Set()
  )
  // Per-provider form state: {providerName: {fieldName: value}}
  const [formValues, setFormValues] = useState<
    Record<string, Record<string, string>>
  >({})
  // Which fields have show/hide toggled
  const [visibleFields, setVisibleFields] = useState<Set<string>>(new Set())
  // Saving / testing state per provider
  const [savingProvider, setSavingProvider] = useState<string | null>(null)
  const [testingProvider, setTestingProvider] = useState<string | null>(null)
  const [testResults, setTestResults] = useState<
    Record<string, TestResult>
  >({})

  // ── Load credentials ──────────────────────────────────────────────

  const loadCredentials = useCallback(async () => {
    try {
      const statuses = await getCredentialStatuses()
      setCredentials(statuses)
    } catch (err) {
      toast.error('Failed to load credential statuses')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadCredentials()
  }, [loadCredentials])

  // ── Toggle provider expanded ──────────────────────────────────────

  const toggleExpanded = (providerName: string) => {
    setExpandedProviders((prev) => {
      const next = new Set(prev)
      if (next.has(providerName)) {
        next.delete(providerName)
      } else {
        next.add(providerName)
      }
      return next
    })
  }

  // ── Toggle field visibility ───────────────────────────────────────

  const toggleFieldVisibility = (fieldKey: string) => {
    setVisibleFields((prev) => {
      const next = new Set(prev)
      if (next.has(fieldKey)) {
        next.delete(fieldKey)
      } else {
        next.add(fieldKey)
      }
      return next
    })
  }

  // ── Update form value ─────────────────────────────────────────────

  const setFieldValue = (
    providerName: string,
    fieldName: string,
    value: string
  ) => {
    setFormValues((prev) => ({
      ...prev,
      [providerName]: {
        ...(prev[providerName] || {}),
        [fieldName]: value,
      },
    }))
  }

  // ── Save credentials ──────────────────────────────────────────────

  const handleSave = async (providerName: string) => {
    const values = formValues[providerName]
    if (!values || Object.keys(values).length === 0) {
      toast.error('Please enter at least one credential value')
      return
    }

    // Filter out empty values
    const nonEmpty: Record<string, string> = {}
    for (const [k, v] of Object.entries(values)) {
      if (v.trim()) nonEmpty[k] = v.trim()
    }
    if (Object.keys(nonEmpty).length === 0) {
      toast.error('Please enter at least one credential value')
      return
    }

    setSavingProvider(providerName)
    try {
      const result = await updateCredential(providerName, nonEmpty)
      toast.success(result.message)
      // Clear form and reload
      setFormValues((prev) => {
        const next = { ...prev }
        delete next[providerName]
        return next
      })
      await loadCredentials()
    } catch (err) {
      toast.error('Failed to save credentials')
    } finally {
      setSavingProvider(null)
    }
  }

  // ── Delete credentials ────────────────────────────────────────────

  const handleDelete = async (providerName: string, displayName: string) => {
    if (
      !confirm(
        `Are you sure you want to remove all credentials for ${displayName}?`
      )
    )
      return

    try {
      await deleteCredential(providerName)
      toast.success(`Credentials for ${displayName} removed`)
      await loadCredentials()
      setTestResults((prev) => {
        const next = { ...prev }
        delete next[providerName]
        return next
      })
    } catch (err) {
      toast.error('Failed to delete credentials')
    }
  }

  // ── Test connection ───────────────────────────────────────────────

  const handleTest = async (providerName: string) => {
    setTestingProvider(providerName)
    try {
      const result = await testCredential(providerName)
      setTestResults((prev) => ({ ...prev, [providerName]: result }))
      if (result.status === 'connected') {
        toast.success(result.message)
      } else {
        toast.error(result.message)
      }
    } catch (err) {
      toast.error('Connection test failed')
    } finally {
      setTestingProvider(null)
    }
  }

  // ── Group providers by category ───────────────────────────────────

  const grouped = CATEGORY_ORDER.map((cat) => ({
    category: cat,
    providers: credentials.filter((c) => c.category === cat),
  })).filter((g) => g.providers.length > 0)

  // ── Summary stats ─────────────────────────────────────────────────

  const totalProviders = credentials.length
  const configuredCount = credentials.filter((c) => c.configured).length

  // ── Render ────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-6 h-6 animate-spin text-primary-500" />
        <span className="ml-2 text-slate-500">Loading credentials...</span>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-slate-800 flex items-center gap-2">
            <Shield className="w-5 h-5 text-primary-500" />
            Integration Credentials
          </h2>
          <p className="text-sm text-slate-500 mt-1">
            Configure API keys and secrets for all third-party integrations.
            Credentials are stored securely and never displayed after saving.
          </p>
        </div>
        <button
          onClick={loadCredentials}
          className="px-3 py-1.5 text-sm text-slate-600 border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors flex items-center gap-1.5"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          Refresh
        </button>
      </div>

      {/* Summary bar */}
      <div className="bg-white rounded-xl border border-slate-200 p-4 flex items-center gap-6">
        <div className="flex items-center gap-2">
          <div className="w-10 h-10 rounded-full bg-primary-100 flex items-center justify-center">
            <Zap className="w-5 h-5 text-primary-600" />
          </div>
          <div>
            <p className="text-2xl font-bold text-slate-800">
              {configuredCount}
              <span className="text-sm font-normal text-slate-400">
                {' '}
                / {totalProviders}
              </span>
            </p>
            <p className="text-xs text-slate-500">Providers Configured</p>
          </div>
        </div>
        <div className="flex-1">
          <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
            <div
              className="h-full bg-primary-500 rounded-full transition-all duration-500"
              style={{
                width: `${
                  totalProviders > 0
                    ? (configuredCount / totalProviders) * 100
                    : 0
                }%`,
              }}
            />
          </div>
        </div>
      </div>

      {/* Provider groups */}
      {grouped.map(({ category, providers }) => (
        <div key={category} className="space-y-3">
          <h3
            className={`text-sm font-semibold uppercase tracking-wider ${
              CATEGORY_HEADER_COLORS[category] || 'text-slate-600'
            }`}
          >
            {category}
          </h3>

          <div className="space-y-2">
            {providers.map((provider) => {
              const isExpanded = expandedProviders.has(
                provider.provider_name
              )
              const isSaving =
                savingProvider === provider.provider_name
              const isTesting =
                testingProvider === provider.provider_name
              const testResult = testResults[provider.provider_name]
              const providerForm =
                formValues[provider.provider_name] || {}

              return (
                <div
                  key={provider.provider_name}
                  className={`rounded-xl border transition-all ${
                    provider.configured
                      ? 'border-green-200 bg-white'
                      : 'border-slate-200 bg-white'
                  }`}
                >
                  {/* Provider header — clickable to expand */}
                  <button
                    type="button"
                    onClick={() =>
                      toggleExpanded(provider.provider_name)
                    }
                    className="w-full px-4 py-3 flex items-center gap-3 text-left hover:bg-slate-50 rounded-xl transition-colors"
                  >
                    <span className="text-xl">{provider.icon}</span>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-slate-800">
                        {provider.display_name}
                      </p>
                      {provider.last_updated && (
                        <p className="text-xs text-slate-400">
                          Last updated:{' '}
                          {new Date(
                            provider.last_updated
                          ).toLocaleDateString()}
                        </p>
                      )}
                    </div>
                    {/* Status badge */}
                    {provider.configured ? (
                      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 text-xs font-medium rounded-full bg-green-100 text-green-700">
                        <Check className="w-3 h-3" />
                        Connected
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 text-xs font-medium rounded-full bg-slate-100 text-slate-500">
                        Not Configured
                      </span>
                    )}
                    {isExpanded ? (
                      <ChevronDown className="w-4 h-4 text-slate-400" />
                    ) : (
                      <ChevronRight className="w-4 h-4 text-slate-400" />
                    )}
                  </button>

                  {/* Expanded form */}
                  {isExpanded && (
                    <div className="px-4 pb-4 border-t border-slate-100 pt-3 space-y-3">
                      {/* Field status indicators */}
                      {provider.configured && (
                        <div className="flex flex-wrap gap-2 mb-2">
                          {provider.fields.map((field) => (
                            <span
                              key={field.name}
                              className={`text-xs px-2 py-0.5 rounded-full ${
                                provider.configured_fields[
                                  field.name
                                ]
                                  ? 'bg-green-50 text-green-600'
                                  : 'bg-slate-50 text-slate-400'
                              }`}
                            >
                              {field.label}:{' '}
                              {provider.configured_fields[
                                field.name
                              ]
                                ? '✓ Set'
                                : 'Not Set'}
                            </span>
                          ))}
                        </div>
                      )}

                      {/* Input fields */}
                      {provider.fields.map((field) => {
                        const fieldKey = `${provider.provider_name}.${field.name}`
                        const isVisible =
                          visibleFields.has(fieldKey)
                        const isSecret = field.type === 'secret'

                        return (
                          <div key={field.name}>
                            <label className="block text-sm font-medium text-slate-700 mb-1">
                              {field.label}
                            </label>
                            <div className="relative">
                              <input
                                type={
                                  isSecret && !isVisible
                                    ? 'password'
                                    : 'text'
                                }
                                value={
                                  providerForm[field.name] || ''
                                }
                                onChange={(e) =>
                                  setFieldValue(
                                    provider.provider_name,
                                    field.name,
                                    e.target.value
                                  )
                                }
                                placeholder={
                                  provider.configured_fields[
                                    field.name
                                  ]
                                    ? '••••••• (already set — enter new value to update)'
                                    : `Enter ${field.label.toLowerCase()}...`
                                }
                                className="w-full px-3 py-2 pr-10 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                              />
                              {isSecret && (
                                <button
                                  type="button"
                                  onClick={() =>
                                    toggleFieldVisibility(
                                      fieldKey
                                    )
                                  }
                                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                                >
                                  {isVisible ? (
                                    <EyeOff className="w-4 h-4" />
                                  ) : (
                                    <Eye className="w-4 h-4" />
                                  )}
                                </button>
                              )}
                            </div>
                          </div>
                        )
                      })}

                      {/* Test result */}
                      {testResult && (
                        <div
                          className={`p-3 rounded-lg text-sm flex items-start gap-2 ${
                            testResult.status === 'connected'
                              ? 'bg-green-50 text-green-700'
                              : 'bg-red-50 text-red-700'
                          }`}
                        >
                          {testResult.status === 'connected' ? (
                            <Check className="w-4 h-4 mt-0.5 flex-shrink-0" />
                          ) : (
                            <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
                          )}
                          {testResult.message}
                        </div>
                      )}

                      {/* Action buttons */}
                      <div className="flex gap-2 pt-2">
                        <button
                          onClick={() =>
                            handleSave(provider.provider_name)
                          }
                          disabled={isSaving}
                          className="px-4 py-2 bg-primary-500 text-white text-sm font-medium rounded-lg hover:bg-primary-600 transition-colors disabled:opacity-50 flex items-center gap-1.5"
                        >
                          {isSaving ? (
                            <>
                              <Loader2 className="w-3.5 h-3.5 animate-spin" />
                              Saving...
                            </>
                          ) : (
                            <>
                              <Check className="w-3.5 h-3.5" />
                              Save
                            </>
                          )}
                        </button>

                        {provider.configured && (
                          <>
                            <button
                              onClick={() =>
                                handleTest(
                                  provider.provider_name
                                )
                              }
                              disabled={isTesting}
                              className="px-4 py-2 border border-slate-300 text-slate-700 text-sm font-medium rounded-lg hover:bg-slate-50 transition-colors disabled:opacity-50 flex items-center gap-1.5"
                            >
                              {isTesting ? (
                                <>
                                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                  Testing...
                                </>
                              ) : (
                                <>
                                  <Zap className="w-3.5 h-3.5" />
                                  Test Connection
                                </>
                              )}
                            </button>

                            <button
                              onClick={() =>
                                handleDelete(
                                  provider.provider_name,
                                  provider.display_name
                                )
                              }
                              className="px-4 py-2 border border-red-200 text-red-600 text-sm font-medium rounded-lg hover:bg-red-50 transition-colors flex items-center gap-1.5"
                            >
                              <X className="w-3.5 h-3.5" />
                              Remove
                            </button>
                          </>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      ))}
    </div>
  )
}
