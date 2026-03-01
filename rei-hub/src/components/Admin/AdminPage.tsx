import { useState, useEffect, useCallback } from 'react'
import {
  Users,
  UserCheck,
  Clock,
  AlertTriangle,
  XCircle,
  DollarSign,
  X,
} from 'lucide-react'
import {
  getStats,
  getSubscribers,
  adjustPlan,
  cancelSubscriber,
  type AdminStats,
  type Subscriber,
} from '@/services/adminApi'
import AiProviderSettings from './AiProviderSettings'
import SuperAdminCredentials from './SuperAdminCredentials'
import StripeConnectSetup from '../LoanServicing/StripeConnectSetup'
import { enableLoanServicing, getTenantConfig, updateTenantConfig } from '@/services/loanServicingApi'
import { enableBankNegotiation } from '@/services/bankNegotiationApi'
import { getAuthHeader, getCurrentUser } from '@/services/auth'
import { useDemoMode } from '@/hooks/useDemoMode'

/* ── Helpers ─────────────────────────────────────────────────── */

function formatMrr(cents: number): string {
  return `$${(cents / 100).toLocaleString()}/mo`
}

function formatDate(iso: string | null): string {
  if (!iso) return '\u2014'
  return new Date(iso).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  })
}

const STATUS_COLORS: Record<string, string> = {
  active: 'bg-green-100 text-green-700',
  trialing: 'bg-yellow-100 text-yellow-700',
  past_due: 'bg-red-100 text-red-700',
  canceled: 'bg-red-100 text-red-700',
}

const PLAN_BAR_COLORS: Record<string, string> = {
  starter: 'bg-blue-500',
  pro: 'bg-primary-500',
  team: 'bg-green-500',
}

const TABS = ['Overview', 'Subscribers', 'AI Providers', 'Credentials', 'Loan Servicing', 'Bank Negotiation', 'Audit Log', 'Tools'] as const
type Tab = (typeof TABS)[number]

/* ── Sub-components ──────────────────────────────────────────── */

function StatusBadge({ status }: { status: string | null }) {
  if (!status) return <span className="text-xs text-slate-400">&mdash;</span>
  const cls = STATUS_COLORS[status] ?? 'bg-slate-100 text-slate-600'
  return (
    <span className={`inline-block text-xs font-medium px-2.5 py-0.5 rounded-full ${cls}`}>
      {status}
    </span>
  )
}

function StatTile({
  label,
  value,
  icon: Icon,
  color,
}: {
  label: string
  value: string | number
  icon: typeof Users
  color: string
}) {
  return (
    <div className="bg-white rounded-xl border border-slate-200 p-5">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-sm font-medium text-slate-500">{label}</p>
          <p className={`text-2xl font-bold mt-1 ${color}`}>{value}</p>
        </div>
        <div className="p-3 rounded-lg bg-slate-50">
          <Icon className="w-5 h-5 text-slate-400" />
        </div>
      </div>
    </div>
  )
}

function Toast({ message, onClose }: { message: string; onClose: () => void }) {
  useEffect(() => {
    const t = setTimeout(onClose, 4000)
    return () => clearTimeout(t)
  }, [onClose])

  return (
    <div className="fixed bottom-6 right-6 z-50 bg-slate-900 text-white text-sm px-4 py-3 rounded-lg shadow-lg flex items-center gap-3">
      {message}
      <button onClick={onClose} className="text-slate-300 hover:text-white">&times;</button>
    </div>
  )
}

/* ── Edit Modal ──────────────────────────────────────────────── */

function EditModal({
  subscriber,
  onClose,
  onSaved,
}: {
  subscriber: Subscriber
  onClose: () => void
  onSaved: (msg: string) => void
}) {
  const [plan, setPlan] = useState(subscriber.plan ?? 'starter')
  const [interval, setInterval] = useState(subscriber.billing_interval ?? 'monthly')
  const [status, setStatus] = useState(subscriber.subscription_status ?? 'active')
  const [helmAddon, setHelmAddon] = useState(subscriber.helm_addon_active)
  const [saving, setSaving] = useState(false)

  async function handleSave() {
    setSaving(true)
    try {
      await adjustPlan(String(subscriber.user_id), {
        plan,
        billing_interval: interval,
        subscription_status: status,
        helm_addon_active: helmAddon,
      })
      onSaved('Subscriber updated')
    } catch (err) {
      onSaved(err instanceof Error ? err.message : 'Failed to update')
    } finally {
      setSaving(false)
    }
  }

  async function handleCancel() {
    if (!window.confirm(`Cancel subscription for ${subscriber.email}?`)) return
    setSaving(true)
    try {
      await cancelSubscriber(String(subscriber.user_id))
      onSaved('Subscription canceled')
    } catch (err) {
      onSaved(err instanceof Error ? err.message : 'Failed to cancel')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md mx-4 p-6">
        <div className="flex items-center justify-between mb-6">
          <h3 className="text-lg font-bold text-slate-900">Edit Subscriber</h3>
          <button onClick={onClose} className="p-1 rounded hover:bg-slate-100">
            <X className="w-5 h-5 text-slate-400" />
          </button>
        </div>

        <p className="text-sm text-slate-500 mb-4">{subscriber.email}</p>

        <div className="space-y-4">
          {/* Plan */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Plan</label>
            <select
              value={plan}
              onChange={(e) => setPlan(e.target.value)}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
            >
              <option value="starter">Starter</option>
              <option value="pro">Pro</option>
              <option value="team">Team</option>
            </select>
          </div>

          {/* Billing Interval */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Billing Interval</label>
            <select
              value={interval}
              onChange={(e) => setInterval(e.target.value)}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
            >
              <option value="monthly">Monthly</option>
              <option value="annual">Annual</option>
            </select>
          </div>

          {/* Status */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Status</label>
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value)}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
            >
              <option value="active">Active</option>
              <option value="trialing">Trialing</option>
              <option value="past_due">Past Due</option>
              <option value="canceled">Canceled</option>
            </select>
          </div>

          {/* Helm Addon */}
          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="helm-addon"
              checked={helmAddon}
              onChange={(e) => setHelmAddon(e.target.checked)}
              className="h-4 w-4 rounded border-slate-300 text-primary-600 focus:ring-primary-500"
            />
            <label htmlFor="helm-addon" className="text-sm text-slate-700">
              Helm Addon Active
            </label>
          </div>
        </div>

        <div className="mt-6 flex items-center justify-between">
          <button
            onClick={handleCancel}
            disabled={saving}
            className="text-sm font-medium text-red-600 hover:text-red-700 disabled:opacity-50"
          >
            Cancel Subscription
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="px-4 py-2 bg-primary-600 text-white text-sm font-medium rounded-lg hover:bg-primary-700 disabled:opacity-50 flex items-center gap-2"
          >
            {saving && (
              <span className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
            )}
            Save Changes
          </button>
        </div>
      </div>
    </div>
  )
}

/* ── Main Component ──────────────────────────────────────────── */

export default function AdminPage() {
  const { isDemoMode } = useDemoMode()
  const [user, setUser] = useState<any>(null)
  const [authLoading, setAuthLoading] = useState(true)
  const [tab, setTab] = useState<Tab>('Overview')
  const [stats, setStats] = useState<AdminStats | null>(null)
  const [subscribers, setSubscribers] = useState<Subscriber[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [perPage] = useState(20)
  const [statusFilter, setStatusFilter] = useState('')
  const [planFilter, setPlanFilter] = useState('')
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [editing, setEditing] = useState<Subscriber | null>(null)
  const [toast, setToast] = useState<string | null>(null)
  const [loanUsers, setLoanUsers] = useState<Subscriber[]>([])
  const [loanUsersLoading, setLoanUsersLoading] = useState(false)
  const [bankNegUsers, setBankNegUsers] = useState<Subscriber[]>([])
  const [bankNegUsersLoading, setBankNegUsersLoading] = useState(false)

  // Tenant config state
  const [configUserId, setConfigUserId] = useState<number | null>(null)
  const [tenantConfig, setTenantConfig] = useState<Record<string, any>>({})
  const [tenantConfigLoading, setTenantConfigLoading] = useState(false)
  const [tenantConfigSaving, setTenantConfigSaving] = useState(false)

  // Audit log state
  const [auditLogs, setAuditLogs] = useState<any[]>([])
  const [auditLoading, setAuditLoading] = useState(false)
  const [auditActionFilter, setAuditActionFilter] = useState('')
  const [auditSuccessFilter, setAuditSuccessFilter] = useState<'' | 'true' | 'false'>('')
  const [auditStartDate, setAuditStartDate] = useState('')
  const [auditEndDate, setAuditEndDate] = useState('')
  const [auditExpanded, setAuditExpanded] = useState<string | null>(null)

  // ── Superadmin access gate ──────────────────────────────────
  useEffect(() => {
    getCurrentUser()
      .then((u) => setUser(u))
      .catch(() => setUser(null))
      .finally(() => setAuthLoading(false))
  }, [])

  // Fetch stats (skip in demo mode — no backend)
  useEffect(() => {
    if (isDemoMode) {
      setIsLoading(false)
      setStats({
        total_subscribers: 6,
        active: 4,
        trialing: 2,
        past_due: 0,
        canceled: 0,
        mrr_cents: 29700,
        by_plan: { starter: 2, pro: 3, team: 1 },
        helm_addon_count: 1,
      } as AdminStats)
      return
    }
    let cancelled = false
    setIsLoading(true)
    getStats()
      .then((data) => {
        if (!cancelled) setStats(data)
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to load stats')
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false)
      })
    return () => { cancelled = true }
  }, [isDemoMode])

  // Fetch subscribers when tab, filters, or page change
  const fetchSubscribers = useCallback(async () => {
    try {
      const res = await getSubscribers({
        status: statusFilter || undefined,
        plan: planFilter || undefined,
        page,
        per_page: perPage,
      })
      setSubscribers(res.subscribers)
      setTotal(res.total)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load subscribers')
    }
  }, [statusFilter, planFilter, page, perPage])

  useEffect(() => {
    if (tab === 'Subscribers') {
      fetchSubscribers()
    }
  }, [tab, fetchSubscribers])

  const fetchLoanUsers = useCallback(async () => {
    setLoanUsersLoading(true)
    try {
      const res = await getSubscribers({ per_page: 100 })
      setLoanUsers(res.subscribers)
    } catch {
      setLoanUsers([])
    }
    setLoanUsersLoading(false)
  }, [])

  useEffect(() => {
    if (tab === 'Loan Servicing') {
      fetchLoanUsers()
    }
  }, [tab, fetchLoanUsers])

  const fetchBankNegUsers = useCallback(async () => {
    setBankNegUsersLoading(true)
    try {
      const res = await getSubscribers({ per_page: 100 })
      setBankNegUsers(res.subscribers)
    } catch {
      setBankNegUsers([])
    }
    setBankNegUsersLoading(false)
  }, [])

  useEffect(() => {
    if (tab === 'Bank Negotiation') {
      fetchBankNegUsers()
    }
  }, [tab, fetchBankNegUsers])

  async function handleEnableBankNegotiation(userId: number) {
    try {
      await enableBankNegotiation(String(userId))
      setToast('Bank negotiation enabled')
      fetchBankNegUsers()
    } catch {
      setToast('Failed to enable bank negotiation')
    }
  }

  async function handleEnableLoanServicing(userId: number) {
    try {
      await enableLoanServicing(String(userId))
      setToast('Loan servicing enabled')
      fetchLoanUsers()
    } catch {
      setToast('Failed to enable loan servicing')
    }
  }

  async function handleLoadTenantConfig(userId: number) {
    if (configUserId === userId) {
      setConfigUserId(null)
      return
    }
    setConfigUserId(userId)
    setTenantConfigLoading(true)
    try {
      const cfg = await getTenantConfig(String(userId)) as Record<string, any>
      setTenantConfig(cfg)
    } catch {
      setTenantConfig({})
    }
    setTenantConfigLoading(false)
  }

  async function handleSaveTenantConfig() {
    if (!configUserId) return
    setTenantConfigSaving(true)
    try {
      await updateTenantConfig(String(configUserId), {
        company_name: tenantConfig.company_name || '',
        logo_url: tenantConfig.logo_url || '',
        portal_primary_color: tenantConfig.portal_primary_color || '#1B3A6B',
        servicing_fee_pct: tenantConfig.servicing_fee_pct ?? 0,
      })
      setToast(`Configuration saved for ${tenantConfig.company_name || 'user'}`)
    } catch {
      setToast('Failed to save tenant config')
    }
    setTenantConfigSaving(false)
  }

  function handleSaved(msg: string) {
    setEditing(null)
    setToast(msg)
    fetchSubscribers()
    // Refresh stats too
    getStats().then(setStats).catch(() => {})
  }

  const fetchAuditLogs = useCallback(async () => {
    setAuditLoading(true)
    try {
      const params = new URLSearchParams()
      if (auditActionFilter) params.set('action', auditActionFilter)
      if (auditSuccessFilter) params.set('success', auditSuccessFilter)
      if (auditStartDate) params.set('start_date', auditStartDate)
      if (auditEndDate) params.set('end_date', auditEndDate)
      params.set('limit', '100')
      const qs = params.toString()
      const BASE_URL = import.meta.env.VITE_REI_SERVER_URL ?? 'http://localhost:8001'
      const res = await fetch(`${BASE_URL}/api/audit/logs${qs ? `?${qs}` : ''}`, {
        headers: { ...getAuthHeader() },
      })
      if (!res.ok) throw new Error('Failed to load audit logs')
      const data = await res.json()
      setAuditLogs(data)
    } catch {
      setAuditLogs([])
    }
    setAuditLoading(false)
  }, [auditActionFilter, auditSuccessFilter, auditStartDate, auditEndDate])

  useEffect(() => {
    if (tab === 'Audit Log') fetchAuditLogs()
  }, [tab, fetchAuditLogs])

  async function handleExportAuditCsv() {
    try {
      const BASE_URL = import.meta.env.VITE_REI_SERVER_URL ?? 'http://localhost:8001'
      const res = await fetch(`${BASE_URL}/api/audit/logs/export`, {
        headers: { ...getAuthHeader() },
      })
      if (!res.ok) throw new Error('Export failed')
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = 'audit_logs.csv'
      a.click()
      URL.revokeObjectURL(url)
    } catch {
      setToast('Failed to export audit logs')
    }
  }

  const totalPages = Math.max(1, Math.ceil(total / perPage))

  /* ── Superadmin access gate (early return) ────────────────── */

  if (authLoading && !isDemoMode) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <p className="text-gray-500">Loading…</p>
      </div>
    )
  }

  if (!user?.is_superadmin && !isDemoMode) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center p-8">
          <div className="text-6xl mb-4">🔒</div>
          <h1 className="text-2xl font-bold text-gray-800 mb-2">Access Restricted</h1>
          <p className="text-gray-600">This area is restricted to administrators only.</p>
        </div>
      </div>
    )
  }

  /* ── Loading / Error ─────────────────────────────────────── */

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="w-10 h-10 border-4 border-primary-500 border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  if (error) {
    return (
      <div className="p-6 max-w-4xl mx-auto">
        <div className="rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3">
          {error}
        </div>
      </div>
    )
  }

  /* ── Plan Breakdown Bar ──────────────────────────────────── */

  const planBar = stats?.by_plan ?? {}
  const planTotal = Object.values(planBar).reduce((s, n) => s + n, 0) || 1

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-slate-800">Admin Dashboard</h1>
        <p className="text-slate-600">Manage subscribers and view platform metrics.</p>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-slate-200">
        {TABS.map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
              tab === t
                ? 'border-primary-500 text-primary-600'
                : 'border-transparent text-slate-500 hover:text-slate-700'
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      {/* ── Overview Tab ──────────────────────────────────────── */}
      {tab === 'Overview' && stats && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            <StatTile label="Total Subscribers" value={stats.total_subscribers} icon={Users} color="text-primary-600" />
            <StatTile label="Active" value={stats.active} icon={UserCheck} color="text-green-600" />
            <StatTile label="Trialing" value={stats.trialing} icon={Clock} color="text-yellow-600" />
            <StatTile label="Past Due" value={stats.past_due} icon={AlertTriangle} color="text-red-600" />
            <StatTile label="Canceled" value={stats.canceled} icon={XCircle} color="text-slate-600" />
            <StatTile label="MRR" value={formatMrr(stats.mrr_cents)} icon={DollarSign} color="text-green-600" />
          </div>

          {/* Plan breakdown bar */}
          <div className="bg-white rounded-xl border border-slate-200 p-5">
            <p className="text-sm font-medium text-slate-500 mb-3">Subscribers by Plan</p>
            <div className="h-4 rounded-full overflow-hidden flex bg-slate-100">
              {Object.entries(planBar).map(([plan, count]) => (
                <div
                  key={plan}
                  className={`${PLAN_BAR_COLORS[plan] ?? 'bg-slate-400'} transition-all`}
                  style={{ width: `${(count / planTotal) * 100}%` }}
                  title={`${plan}: ${count}`}
                />
              ))}
            </div>
            <div className="flex gap-4 mt-2">
              {Object.entries(planBar).map(([plan, count]) => (
                <span key={plan} className="text-xs text-slate-500 capitalize">
                  {plan}: {count}
                </span>
              ))}
            </div>
          </div>

          {/* Helm addon count */}
          <div className="bg-white rounded-xl border border-slate-200 p-5">
            <p className="text-sm font-medium text-slate-500">Helm Hub Add-on</p>
            <p className="text-2xl font-bold text-primary-600 mt-1">
              {stats.helm_addon_count} <span className="text-sm font-normal text-slate-400">subscribers</span>
            </p>
          </div>
        </div>
      )}

      {/* ── Subscribers Tab ───────────────────────────────────── */}
      {tab === 'Subscribers' && (
        <div className="space-y-4">
          {/* Filters */}
          <div className="flex flex-wrap gap-3">
            <select
              value={statusFilter}
              onChange={(e) => { setStatusFilter(e.target.value); setPage(1) }}
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
            >
              <option value="">All Statuses</option>
              <option value="active">Active</option>
              <option value="trialing">Trialing</option>
              <option value="past_due">Past Due</option>
              <option value="canceled">Canceled</option>
            </select>
            <select
              value={planFilter}
              onChange={(e) => { setPlanFilter(e.target.value); setPage(1) }}
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
            >
              <option value="">All Plans</option>
              <option value="starter">Starter</option>
              <option value="pro">Pro</option>
              <option value="team">Team</option>
            </select>
          </div>

          {/* Table */}
          <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50">
                    <th className="text-left px-4 py-3 font-medium text-slate-500">Email</th>
                    <th className="text-left px-4 py-3 font-medium text-slate-500">Plan</th>
                    <th className="text-left px-4 py-3 font-medium text-slate-500">Status</th>
                    <th className="text-left px-4 py-3 font-medium text-slate-500">Interval</th>
                    <th className="text-left px-4 py-3 font-medium text-slate-500">Trial Ends</th>
                    <th className="text-left px-4 py-3 font-medium text-slate-500">Helm</th>
                    <th className="text-left px-4 py-3 font-medium text-slate-500">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {subscribers.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="px-4 py-8 text-center text-slate-400">
                        No subscribers found
                      </td>
                    </tr>
                  ) : (
                    subscribers.map((sub) => (
                      <tr key={sub.user_id} className="border-b border-slate-100 hover:bg-slate-50">
                        <td className="px-4 py-3 text-slate-800">{sub.email}</td>
                        <td className="px-4 py-3 capitalize text-slate-600">{sub.plan ?? '\u2014'}</td>
                        <td className="px-4 py-3"><StatusBadge status={sub.subscription_status} /></td>
                        <td className="px-4 py-3 capitalize text-slate-600">{sub.billing_interval ?? '\u2014'}</td>
                        <td className="px-4 py-3 text-slate-600">{formatDate(sub.trial_ends_at)}</td>
                        <td className="px-4 py-3">
                          {sub.helm_addon_active ? (
                            <span className="text-xs font-medium text-green-700">Yes</span>
                          ) : (
                            <span className="text-xs text-slate-400">No</span>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <button
                            onClick={() => setEditing(sub)}
                            className="text-sm font-medium text-primary-600 hover:text-primary-700"
                          >
                            Edit
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Pagination */}
          <div className="flex items-center justify-between">
            <p className="text-sm text-slate-500">
              Showing {subscribers.length} of {total}
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page <= 1}
                className="px-3 py-1.5 text-sm rounded-lg border border-slate-300 hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Prev
              </button>
              <span className="px-3 py-1.5 text-sm text-slate-600">
                {page} / {totalPages}
              </span>
              <button
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page >= totalPages}
                className="px-3 py-1.5 text-sm rounded-lg border border-slate-300 hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Next
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── AI Providers Tab ──────────────────────────────────── */}
      {tab === 'AI Providers' && <AiProviderSettings />}

      {/* ── Credentials Tab ──────────────────────────────────── */}
      {tab === 'Credentials' && <SuperAdminCredentials />}

      {/* ── Loan Servicing Tab ──────────────────────────────── */}
      {tab === 'Loan Servicing' && (
        <div className="space-y-6">
          <div>
            <h2 className="text-lg font-bold text-slate-800 mb-4">Loan Servicing Access</h2>
            <StripeConnectSetup />
          </div>

          <div className="space-y-4">
            <h3 className="text-sm font-bold text-slate-800">User Access</h3>
            <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-200 bg-slate-50">
                      <th className="text-left px-4 py-3 font-medium text-slate-500">Email</th>
                      <th className="text-left px-4 py-3 font-medium text-slate-500">Loan Servicing</th>
                      <th className="text-left px-4 py-3 font-medium text-slate-500">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {loanUsersLoading ? (
                      <tr>
                        <td colSpan={3} className="px-4 py-8 text-center text-slate-400">Loading...</td>
                      </tr>
                    ) : loanUsers.length === 0 ? (
                      <tr>
                        <td colSpan={3} className="px-4 py-8 text-center text-slate-400">No users found</td>
                      </tr>
                    ) : (
                      loanUsers.map((u) => {
                        const enabled = !!(u as any).loan_servicing_enabled
                        return (
                          <><tr key={u.user_id} className="border-b border-slate-100 hover:bg-slate-50">
                            <td className="px-4 py-3 text-slate-800">{u.email}</td>
                            <td className="px-4 py-3">
                              {enabled ? (
                                <span className="inline-block text-xs font-medium px-2.5 py-0.5 rounded-full bg-green-100 text-green-700">Enabled</span>
                              ) : (
                                <span className="inline-block text-xs font-medium px-2.5 py-0.5 rounded-full bg-slate-100 text-slate-600">Disabled</span>
                              )}
                            </td>
                            <td className="px-4 py-3 flex gap-2">
                              {!enabled && (
                                <button
                                  onClick={() => handleEnableLoanServicing(u.user_id)}
                                  className="px-3 py-1.5 text-xs font-medium bg-[#1B3A6B] text-white rounded-lg hover:opacity-90"
                                >
                                  Enable
                                </button>
                              )}
                              {enabled && (
                                <button
                                  onClick={() => handleLoadTenantConfig(u.user_id)}
                                  className="px-3 py-1.5 text-xs font-medium border border-[#1B3A6B] text-[#1B3A6B] rounded-lg hover:bg-slate-50"
                                >
                                  {configUserId === u.user_id ? 'Close' : 'Configure'}
                                </button>
                              )}
                            </td>
                          </tr>
                          {configUserId === u.user_id && (
                            <tr key={`config-${u.user_id}`}>
                              <td colSpan={3} className="px-4 py-4 bg-slate-50">
                                {tenantConfigLoading ? (
                                  <p className="text-sm text-slate-400">Loading config...</p>
                                ) : (
                                  <div className="space-y-5 max-w-lg">
                                    {/* Company Settings */}
                                    <div>
                                      <h4 className="text-sm font-bold text-slate-800 mb-3">Company Settings</h4>
                                      <div className="space-y-3">
                                        <div>
                                          <label className="block text-xs font-medium text-slate-700 mb-1">Company Name</label>
                                          <input
                                            type="text"
                                            value={tenantConfig.company_name || ''}
                                            onChange={(e) => setTenantConfig({ ...tenantConfig, company_name: e.target.value })}
                                            className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1B3A6B]"
                                          />
                                        </div>
                                        <div>
                                          <label className="block text-xs font-medium text-slate-700 mb-1">Logo URL</label>
                                          <input
                                            type="text"
                                            value={tenantConfig.logo_url || ''}
                                            onChange={(e) => setTenantConfig({ ...tenantConfig, logo_url: e.target.value })}
                                            className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1B3A6B]"
                                            placeholder="https://..."
                                          />
                                        </div>
                                        <div>
                                          <label className="block text-xs font-medium text-slate-700 mb-1">Portal Primary Color</label>
                                          <div className="flex items-center gap-2">
                                            <input
                                              type="text"
                                              value={tenantConfig.portal_primary_color || '#1B3A6B'}
                                              onChange={(e) => setTenantConfig({ ...tenantConfig, portal_primary_color: e.target.value })}
                                              className="w-32 border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1B3A6B]"
                                            />
                                            <div
                                              className="w-8 h-8 rounded border border-slate-300"
                                              style={{ backgroundColor: tenantConfig.portal_primary_color || '#1B3A6B' }}
                                            />
                                          </div>
                                        </div>
                                      </div>
                                    </div>

                                    {/* Platform Fee */}
                                    <div>
                                      <h4 className="text-sm font-bold text-slate-800 mb-3">Platform Fee</h4>
                                      <div>
                                        <label className="block text-xs font-medium text-slate-700 mb-1">REI Hub Fee %</label>
                                        <input
                                          type="number"
                                          min={0}
                                          max={10}
                                          step={0.1}
                                          value={tenantConfig.servicing_fee_pct ?? 0}
                                          onChange={(e) => setTenantConfig({ ...tenantConfig, servicing_fee_pct: parseFloat(e.target.value) || 0 })}
                                          className="w-32 border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1B3A6B]"
                                        />
                                        <p className="text-xs text-slate-500 mt-1">
                                          This % is automatically deducted from each payment collected by this business and sent to REI Hub
                                        </p>
                                        {(tenantConfig.servicing_fee_pct ?? 0) > 5 && (
                                          <p className="text-xs text-yellow-700 bg-yellow-50 border border-yellow-200 rounded px-2 py-1 mt-2">
                                            Warning: High fee rate — confirm with business owner before saving
                                          </p>
                                        )}
                                      </div>
                                    </div>

                                    {/* Stripe Connect Status */}
                                    <div>
                                      <h4 className="text-sm font-bold text-slate-800 mb-3">Stripe Connect Status</h4>
                                      {tenantConfig.stripe_account_id ? (
                                        <div className="space-y-1">
                                          <div className="flex items-center gap-2 text-sm">
                                            <span className="text-green-600">✓</span>
                                            <span className="text-slate-700">Connected</span>
                                          </div>
                                          <p className="text-xs text-slate-500">Account: {tenantConfig.stripe_account_id}</p>
                                        </div>
                                      ) : (
                                        <p className="text-sm text-slate-500">Not Connected</p>
                                      )}
                                      <p className="text-xs text-slate-400 mt-1">Business sets up their own Stripe — not editable by admin</p>
                                    </div>

                                    {/* Distribution Default */}
                                    <div>
                                      <h4 className="text-sm font-bold text-slate-800 mb-3">Distribution Default</h4>
                                      <div className="flex items-center gap-2">
                                        <span className="text-sm text-slate-700">Default Investor %: {tenantConfig.default_investor_pct ?? '—'}</span>
                                        <span className="text-xs text-slate-400">Set by user</span>
                                      </div>
                                    </div>

                                    <button
                                      onClick={handleSaveTenantConfig}
                                      disabled={tenantConfigSaving}
                                      className="px-4 py-2 bg-[#1B3A6B] text-white text-sm font-medium rounded-lg hover:opacity-90 disabled:opacity-50"
                                    >
                                      {tenantConfigSaving ? 'Saving...' : 'Save Configuration'}
                                    </button>
                                  </div>
                                )}
                              </td>
                            </tr>
                          )}
                        </>
                        )
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Bank Negotiation Tab ──────────────────────────────── */}
      {tab === 'Bank Negotiation' && (
        <div className="space-y-4">
          <h2 className="text-lg font-bold text-slate-800">Bank Negotiation Access</h2>
          <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50">
                    <th className="text-left px-4 py-3 font-medium text-slate-500">Email</th>
                    <th className="text-left px-4 py-3 font-medium text-slate-500">Status</th>
                    <th className="text-left px-4 py-3 font-medium text-slate-500">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {bankNegUsersLoading ? (
                    <tr>
                      <td colSpan={3} className="px-4 py-8 text-center text-slate-400">Loading...</td>
                    </tr>
                  ) : bankNegUsers.length === 0 ? (
                    <tr>
                      <td colSpan={3} className="px-4 py-8 text-center text-slate-400">No users found</td>
                    </tr>
                  ) : (
                    bankNegUsers.map((u) => {
                      const enabled = !!(u as any).bank_negotiation_enabled
                      return (
                        <tr key={u.user_id} className="border-b border-slate-100 hover:bg-slate-50">
                          <td className="px-4 py-3 text-slate-800">{u.email}</td>
                          <td className="px-4 py-3">
                            {enabled ? (
                              <span className="inline-block text-xs font-medium px-2.5 py-0.5 rounded-full bg-green-100 text-green-700">Enabled</span>
                            ) : (
                              <span className="inline-block text-xs font-medium px-2.5 py-0.5 rounded-full bg-slate-100 text-slate-600">Disabled</span>
                            )}
                          </td>
                          <td className="px-4 py-3">
                            {!enabled && (
                              <button
                                onClick={() => handleEnableBankNegotiation(u.user_id)}
                                className="px-3 py-1.5 text-xs font-medium bg-[#1B3A6B] text-white rounded-lg hover:opacity-90"
                              >
                                Enable
                              </button>
                            )}
                          </td>
                        </tr>
                      )
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ── Audit Log Tab ─────────────────────────────────────── */}
      {tab === 'Audit Log' && (
        <div className="space-y-4">
          {/* Filters */}
          <div className="flex flex-wrap gap-3 items-end">
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1">Action</label>
              <input
                type="text"
                value={auditActionFilter}
                onChange={(e) => setAuditActionFilter(e.target.value)}
                placeholder="e.g. login"
                className="rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 w-40"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1">Result</label>
              <select
                value={auditSuccessFilter}
                onChange={(e) => setAuditSuccessFilter(e.target.value as '' | 'true' | 'false')}
                className="rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
              >
                <option value="">All</option>
                <option value="true">Success</option>
                <option value="false">Failed</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1">Start Date</label>
              <input
                type="date"
                value={auditStartDate}
                onChange={(e) => setAuditStartDate(e.target.value)}
                className="rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1">End Date</label>
              <input
                type="date"
                value={auditEndDate}
                onChange={(e) => setAuditEndDate(e.target.value)}
                className="rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
              />
            </div>
            <button
              onClick={fetchAuditLogs}
              className="px-4 py-2 text-sm font-medium bg-primary-600 text-white rounded-lg hover:bg-primary-700"
            >
              Search
            </button>
            <button
              onClick={handleExportAuditCsv}
              className="px-4 py-2 text-sm font-medium border border-slate-300 rounded-lg hover:bg-slate-50"
            >
              Export CSV
            </button>
          </div>

          {/* Table */}
          <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50">
                    <th className="text-left px-4 py-3 font-medium text-slate-500">Timestamp</th>
                    <th className="text-left px-4 py-3 font-medium text-slate-500">User</th>
                    <th className="text-left px-4 py-3 font-medium text-slate-500">Action</th>
                    <th className="text-left px-4 py-3 font-medium text-slate-500">Resource</th>
                    <th className="text-left px-4 py-3 font-medium text-slate-500">IP Address</th>
                    <th className="text-left px-4 py-3 font-medium text-slate-500">Result</th>
                  </tr>
                </thead>
                <tbody>
                  {auditLoading ? (
                    <tr>
                      <td colSpan={6} className="px-4 py-8 text-center text-slate-400">Loading...</td>
                    </tr>
                  ) : auditLogs.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="px-4 py-8 text-center text-slate-400">No audit logs found</td>
                    </tr>
                  ) : (
                    auditLogs.map((log: any) => (
                      <>
                        <tr
                          key={log.id}
                          onClick={() => setAuditExpanded(auditExpanded === log.id ? null : log.id)}
                          className="border-b border-slate-100 hover:bg-slate-50 cursor-pointer"
                        >
                          <td className="px-4 py-3 text-slate-600 whitespace-nowrap">
                            {log.created_at ? new Date(log.created_at).toLocaleString() : '\u2014'}
                          </td>
                          <td className="px-4 py-3 text-slate-800">{log.user_email || '\u2014'}</td>
                          <td className="px-4 py-3 text-slate-600">{log.action}</td>
                          <td className="px-4 py-3 text-slate-600">
                            {log.resource_type ? `${log.resource_type}${log.resource_id ? ` #${log.resource_id}` : ''}` : '\u2014'}
                          </td>
                          <td className="px-4 py-3 text-slate-600">{log.ip_address || '\u2014'}</td>
                          <td className="px-4 py-3">
                            {log.success ? (
                              <span className="inline-block text-xs font-medium px-2 py-0.5 rounded-full bg-green-100 text-green-700">Success</span>
                            ) : (
                              <span className="inline-block text-xs font-medium px-2 py-0.5 rounded-full bg-red-100 text-red-700">Failed</span>
                            )}
                          </td>
                        </tr>
                        {auditExpanded === log.id && (
                          <tr key={`${log.id}-detail`}>
                            <td colSpan={6} className="px-4 py-3 bg-slate-50">
                              <pre className="text-xs text-slate-600 whitespace-pre-wrap max-w-full overflow-auto">
                                {log.details ? JSON.stringify(JSON.parse(log.details), null, 2) : 'No details'}
                                {log.error_message ? `\n\nError: ${log.error_message}` : ''}
                              </pre>
                            </td>
                          </tr>
                        )}
                      </>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ── Tools Tab ─────────────────────────────────────────── */}
      {tab === 'Tools' && (
        <div className="bg-white rounded-xl border border-slate-200 p-6 text-center">
          <p className="text-slate-500 text-sm">Admin tools coming soon</p>
        </div>
      )}

      {/* Edit Modal */}
      {editing && (
        <EditModal subscriber={editing} onClose={() => setEditing(null)} onSaved={handleSaved} />
      )}

      {/* Toast */}
      {toast && <Toast message={toast} onClose={() => setToast(null)} />}
    </div>
  )
}
