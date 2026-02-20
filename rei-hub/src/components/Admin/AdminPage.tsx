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

const TABS = ['Overview', 'Subscribers', 'Tools'] as const
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

  // Fetch stats
  useEffect(() => {
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
  }, [])

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

  function handleSaved(msg: string) {
    setEditing(null)
    setToast(msg)
    fetchSubscribers()
    // Refresh stats too
    getStats().then(setStats).catch(() => {})
  }

  const totalPages = Math.max(1, Math.ceil(total / perPage))

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
