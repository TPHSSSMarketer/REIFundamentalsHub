import { useMemo } from 'react'
import {
  Target,
  DollarSign,
  CheckCircle,
  Clock,
  TrendingUp,
  Users,
  BarChart3,
  PieChart,
  ArrowUpRight,
  ArrowDownRight,
  Calendar,
  Home,
  Percent,
  Activity,
  Zap,
  Award,
} from 'lucide-react'
import MetricCard from './MetricCard'
import ActivityFeed from './ActivityFeed'
import TodayWidget from '@/components/Calendar/TodayWidget'
import { useDeals, useTasks, useContacts } from '@/hooks/useApi'
import { formatCurrency } from '@/utils/helpers'
import type { Activity as ActivityType } from '@/types'

const STAGE_LABELS: Record<string, string> = {
  lead: 'New Lead',
  analysis: 'Analysis',
  offer: 'Offer Made',
  under_contract: 'Under Contract',
  due_diligence: 'Due Diligence',
  closing: 'Closing',
  closed_won: 'Closed Won',
  closed_lost: 'Closed Lost',
}

const STAGE_COLORS: Record<string, string> = {
  lead: 'bg-blue-500',
  analysis: 'bg-indigo-500',
  offer: 'bg-purple-500',
  under_contract: 'bg-yellow-500',
  due_diligence: 'bg-orange-500',
  closing: 'bg-pink-500',
  closed_won: 'bg-green-500',
  closed_lost: 'bg-red-400',
}

// ── Helper: days between two ISO date strings ──
function daysBetween(a: string, b: string): number {
  return Math.abs(
    Math.round((new Date(b).getTime() - new Date(a).getTime()) / 86400000)
  )
}

export default function Dashboard() {
  const { data: deals, isLoading: dealsLoading } = useDeals()
  const { data: tasksData } = useTasks()
  const { data: contacts } = useContacts()

  const tasks = tasksData?.tasks || []

  // ── Basic counts ──
  const totalOpportunities = deals?.length || 0
  const activeDeals =
    deals?.filter(
      (d) => d.stage !== 'closed_won' && d.stage !== 'closed_lost'
    ).length || 0
  const closedWon = deals?.filter((d) => d.stage === 'closed_won') || []
  const closedLost = deals?.filter((d) => d.stage === 'closed_lost') || []
  const pendingTasks = tasks.filter((t: any) => !t.completed).length

  // ── Active pipeline value (excludes closed deals) ──
  const activePipelineValue =
    deals
      ?.filter((d) => d.stage !== 'closed_won' && d.stage !== 'closed_lost')
      .reduce((sum, d) => sum + (d.purchasePrice || 0), 0) || 0

  // ═══════════════════════════════════════════
  // KPI: Deal Performance
  // ═══════════════════════════════════════════
  const dealPerformance = useMemo(() => {
    if (!deals) return null

    const totalClosed = closedWon.length + closedLost.length
    const conversionRate =
      totalClosed > 0 ? (closedWon.length / totalClosed) * 100 : 0

    // Average days to close (created → closing/updated for closed_won)
    const daysToClose = closedWon.map((d) =>
      daysBetween(d.createdAt, d.closingDate || d.updatedAt)
    )
    const avgDaysToClose =
      daysToClose.length > 0
        ? Math.round(
            daysToClose.reduce((a, b) => a + b, 0) / daysToClose.length
          )
        : 0

    // Offer acceptance rate: closed_won / (closed_won + closed_lost)
    const offerAcceptRate = conversionRate

    // Deal source breakdown
    const sourceCounts: Record<string, number> = {}
    deals.forEach((d) => {
      const src = d.source || 'Unknown'
      sourceCounts[src] = (sourceCounts[src] || 0) + 1
    })
    const sourceBreakdown = Object.entries(sourceCounts)
      .sort((a, b) => b[1] - a[1])
      .map(([source, count]) => ({ source, count }))

    // ROI per closed deal
    const roiPerDeal = closedWon.map((d) => {
      const invested = d.allInCost || d.purchasePrice || 0
      const value = d.arv || invested
      const roi = invested > 0 ? ((value - invested) / invested) * 100 : 0
      return { address: d.address, roi: Math.round(roi * 10) / 10 }
    })

    // Average ROI
    const avgRoi =
      roiPerDeal.length > 0
        ? Math.round(
            (roiPerDeal.reduce((s, r) => s + r.roi, 0) / roiPerDeal.length) *
              10
          ) / 10
        : 0

    return {
      conversionRate: Math.round(conversionRate * 10) / 10,
      avgDaysToClose,
      offerAcceptRate: Math.round(offerAcceptRate * 10) / 10,
      sourceBreakdown,
      roiPerDeal,
      avgRoi,
    }
  }, [deals, closedWon, closedLost])

  // ═══════════════════════════════════════════
  // KPI: Financial Metrics
  // ═══════════════════════════════════════════
  const financialMetrics = useMemo(() => {
    if (!deals) return null

    // Total invested capital (all-in cost of closed_won)
    const totalInvested = closedWon.reduce(
      (s, d) => s + (d.allInCost || d.purchasePrice || 0),
      0
    )

    // Total estimated equity (ARV − allInCost for closed_won)
    const totalEquity = closedWon.reduce((s, d) => {
      const cost = d.allInCost || d.purchasePrice || 0
      const arv = d.arv || cost
      return s + (arv - cost)
    }, 0)

    // Monthly rental income (closed_won deals)
    const monthlyRentIncome = closedWon.reduce(
      (s, d) => s + (d.monthlyRent || 0),
      0
    )

    // Annualized income
    const annualRentIncome = monthlyRentIncome * 12

    // Cash-on-cash return (avg of closed_won with cashOnCash set)
    const cochDeals = closedWon.filter((d) => d.cashOnCash)
    const avgCashOnCash =
      cochDeals.length > 0
        ? Math.round(
            (cochDeals.reduce((s, d) => s + (d.cashOnCash || 0), 0) /
              cochDeals.length) *
              10
          ) / 10
        : 0

    // Average cap rate
    const capDeals = closedWon.filter((d) => d.capRate)
    const avgCapRate =
      capDeals.length > 0
        ? Math.round(
            (capDeals.reduce((s, d) => s + (d.capRate || 0), 0) /
              capDeals.length) *
              10
          ) / 10
        : 0

    // Average deal size (closed_won purchase price)
    const avgDealSize =
      closedWon.length > 0
        ? Math.round(
            closedWon.reduce((s, d) => s + (d.purchasePrice || 0), 0) /
              closedWon.length
          )
        : 0

    // Profit margin per deal (avg equity / avg cost)
    const avgCost =
      closedWon.length > 0 ? totalInvested / closedWon.length : 0
    const avgEquity =
      closedWon.length > 0 ? totalEquity / closedWon.length : 0
    const profitMargin =
      avgCost > 0 ? Math.round((avgEquity / avgCost) * 1000) / 10 : 0

    return {
      totalInvested,
      totalEquity,
      monthlyRentIncome,
      annualRentIncome,
      avgCashOnCash,
      avgCapRate,
      avgDealSize,
      profitMargin,
    }
  }, [deals, closedWon])

  // ═══════════════════════════════════════════
  // KPI: Activity & Productivity
  // ═══════════════════════════════════════════
  const activityMetrics = useMemo(() => {
    const now = new Date()
    const weekAgo = new Date(now.getTime() - 7 * 86400000)
    const monthAgo = new Date(now.getTime() - 30 * 86400000)

    // Contacts added this week / month
    const contactsThisWeek =
      contacts?.filter((c) => new Date(c.dateAdded) >= weekAgo).length || 0
    const contactsThisMonth =
      contacts?.filter((c) => new Date(c.dateAdded) >= monthAgo).length || 0

    // Tasks completed
    const completedTasks = tasks.filter((t: any) => t.completed).length
    const totalTasks = tasks.length
    const taskCompletionRate =
      totalTasks > 0
        ? Math.round((completedTasks / totalTasks) * 1000) / 10
        : 0

    // Tasks due today
    const today = new Date().toISOString().slice(0, 10)
    const tasksDueToday = tasks.filter(
      (t: any) => !t.completed && t.due_date === today
    ).length

    // Overdue tasks
    const overdueTasks = tasks.filter((t: any) => {
      if (t.completed) return false
      return t.due_date && t.due_date < today
    }).length

    // Deals created this week / month
    const dealsThisWeek =
      deals?.filter((d) => new Date(d.createdAt) >= weekAgo).length || 0
    const dealsThisMonth =
      deals?.filter((d) => new Date(d.createdAt) >= monthAgo).length || 0

    // Offers made (deals that reached 'offer' stage or beyond)
    const offerStages = [
      'offer',
      'under_contract',
      'due_diligence',
      'closing',
      'closed_won',
      'closed_lost',
    ]
    const totalOffersMade =
      deals?.filter((d) => offerStages.includes(d.stage)).length || 0

    return {
      contactsThisWeek,
      contactsThisMonth,
      completedTasks,
      totalTasks,
      taskCompletionRate,
      tasksDueToday,
      overdueTasks,
      dealsThisWeek,
      dealsThisMonth,
      totalOffersMade,
    }
  }, [contacts, tasks, deals])

  // ── Stage breakdown for pipeline chart ──
  const stageBreakdown = useMemo(() => {
    if (!deals) return []
    const counts: Record<string, number> = {}
    deals.forEach((d) => {
      counts[d.stage] = (counts[d.stage] || 0) + 1
    })
    return Object.entries(STAGE_LABELS)
      .filter(([stage]) => counts[stage] && stage !== 'closed_lost')
      .map(([stage, label]) => ({
        stage,
        label,
        count: counts[stage] || 0,
        color: STAGE_COLORS[stage] || 'bg-slate-400',
      }))
  }, [deals])

  // ── Activity feed ──
  const activities = useMemo(() => {
    const items: ActivityType[] = []
    if (deals) {
      deals.slice(0, 5).forEach((deal) => {
        items.push({
          id: `deal-${deal.id}`,
          type:
            deal.stage === 'closed_won' ? 'deal_updated' : 'deal_created',
          title:
            deal.stage === 'closed_won'
              ? 'Deal closed won'
              : `Deal in ${STAGE_LABELS[deal.stage] || deal.stage}`,
          description: `${deal.address || deal.title} — ${formatCurrency(deal.purchasePrice || 0)}`,
          timestamp: deal.updatedAt || deal.createdAt,
          entityType: 'deal',
        })
      })
    }
    if (contacts) {
      contacts.slice(0, 5).forEach((contact) => {
        items.push({
          id: `contact-${contact.id}`,
          type: 'contact_added',
          title: 'Contact in CRM',
          description: `${contact.name}${contact.tags?.length ? ' — ' + contact.tags.slice(0, 2).join(', ') : ''}`,
          timestamp: contact.dateAdded,
          entityType: 'contact',
        })
      })
    }
    if (tasks.length > 0) {
      tasks
        .filter((t: any) => t.completed)
        .slice(0, 3)
        .forEach((t: any) => {
          items.push({
            id: `task-${t.id}`,
            type: 'task_completed',
            title: 'Task completed',
            description: t.title,
            timestamp: t.created_at || new Date().toISOString(),
            entityType: 'task',
          })
        })
    }
    return items
      .sort(
        (a, b) =>
          new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
      )
      .slice(0, 10)
  }, [deals, contacts, tasks])

  // ── Helper component: KPI stat row ──
  const KpiRow = ({
    icon: Icon,
    iconColor,
    label,
    value,
  }: {
    icon: any
    iconColor: string
    label: string
    value: string | number
  }) => (
    <div className="flex items-center justify-between py-2">
      <div className="flex items-center gap-2">
        <Icon className={`w-4 h-4 ${iconColor}`} />
        <span className="text-sm text-slate-600">{label}</span>
      </div>
      <span className="text-sm font-semibold text-slate-800">{value}</span>
    </div>
  )

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div>
        <h1 className="text-xl md:text-2xl font-bold text-slate-800">
          Dashboard
        </h1>
        <p className="text-sm md:text-base text-slate-600">
          Welcome back! Here's your overview.
        </p>
      </div>

      {/* Top Metrics Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <MetricCard
          title="Total Opportunities"
          value={totalOpportunities}
          icon={Target}
          color="primary"
          loading={dealsLoading}
        />
        <MetricCard
          title="Active Deals"
          value={activeDeals}
          icon={DollarSign}
          color="success"
          loading={dealsLoading}
        />
        <MetricCard
          title="Closed Won"
          value={closedWon.length}
          icon={CheckCircle}
          color="warning"
          loading={dealsLoading}
        />
        <MetricCard
          title="Pending Tasks"
          value={pendingTasks}
          icon={Clock}
          color="danger"
        />
      </div>

      {/* Today Widget */}
      <TodayWidget />

      {/* Pipeline Value Banner */}
      <div className="bg-gradient-to-r from-primary-500 to-primary-600 rounded-xl p-4 md:p-6 text-white">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <p className="text-primary-100 text-sm font-medium">
              Active Pipeline Value
            </p>
            <p className="text-2xl md:text-3xl font-bold mt-1">
              {formatCurrency(activePipelineValue)}
            </p>
            <p className="text-primary-200 text-sm mt-2">
              Across {activeDeals} active deal
              {activeDeals !== 1 ? 's' : ''}
            </p>
          </div>
          {stageBreakdown.length > 0 && (
            <div className="flex gap-4 flex-wrap">
              {stageBreakdown.map((s) => (
                <div key={s.stage} className="text-center">
                  <p className="text-2xl font-bold">{s.count}</p>
                  <p className="text-primary-200 text-xs">{s.label}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Pipeline Stage Breakdown (visual bar) */}
      {stageBreakdown.length > 0 && totalOpportunities > 0 && (
        <div className="bg-white rounded-xl border border-slate-200 p-5">
          <h2 className="text-base font-semibold text-slate-800 mb-3">
            Pipeline Breakdown
          </h2>
          <div className="flex h-4 rounded-full overflow-hidden mb-3">
            {stageBreakdown.map((s) => (
              <div
                key={s.stage}
                className={`${s.color} transition-all`}
                style={{
                  width: `${(s.count / totalOpportunities) * 100}%`,
                }}
                title={`${s.label}: ${s.count}`}
              />
            ))}
          </div>
          <div className="flex flex-wrap gap-x-4 gap-y-1">
            {stageBreakdown.map((s) => (
              <div
                key={s.stage}
                className="flex items-center gap-1.5 text-xs text-slate-600"
              >
                <span className={`w-2.5 h-2.5 rounded-full ${s.color}`} />
                {s.label} ({s.count})
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ═══════════════════════════════════════════ */}
      {/* KPI SECTION: Three-Column Grid             */}
      {/* ═══════════════════════════════════════════ */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* ── Deal Performance ── */}
        <div className="bg-white rounded-xl border border-slate-200 p-6">
          <div className="flex items-center gap-2 mb-4">
            <div className="p-2 rounded-lg bg-blue-50">
              <BarChart3 className="w-5 h-5 text-blue-600" />
            </div>
            <h2 className="text-base font-semibold text-slate-800">
              Deal Performance
            </h2>
          </div>
          <div className="divide-y divide-slate-100">
            <KpiRow
              icon={TrendingUp}
              iconColor="text-green-500"
              label="Conversion Rate"
              value={`${dealPerformance?.conversionRate ?? 0}%`}
            />
            <KpiRow
              icon={Clock}
              iconColor="text-blue-500"
              label="Avg Days to Close"
              value={`${dealPerformance?.avgDaysToClose ?? 0} days`}
            />
            <KpiRow
              icon={CheckCircle}
              iconColor="text-emerald-500"
              label="Offer Accept Rate"
              value={`${dealPerformance?.offerAcceptRate ?? 0}%`}
            />
            <KpiRow
              icon={ArrowUpRight}
              iconColor="text-indigo-500"
              label="Avg ROI (Closed)"
              value={`${dealPerformance?.avgRoi ?? 0}%`}
            />
            <KpiRow
              icon={Target}
              iconColor="text-purple-500"
              label="Total Offers Made"
              value={activityMetrics?.totalOffersMade ?? 0}
            />
          </div>

          {/* Deal Source Breakdown mini-chart */}
          {dealPerformance && dealPerformance.sourceBreakdown.length > 0 && (
            <div className="mt-4 pt-4 border-t border-slate-100">
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">
                Deals by Source
              </p>
              <div className="space-y-2">
                {dealPerformance.sourceBreakdown.map((s) => {
                  const pct =
                    totalOpportunities > 0
                      ? (s.count / totalOpportunities) * 100
                      : 0
                  return (
                    <div key={s.source}>
                      <div className="flex justify-between text-xs text-slate-600 mb-0.5">
                        <span>{s.source}</span>
                        <span className="font-medium">
                          {s.count} ({Math.round(pct)}%)
                        </span>
                      </div>
                      <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-blue-500 rounded-full transition-all"
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}
        </div>

        {/* ── Financial Metrics ── */}
        <div className="bg-white rounded-xl border border-slate-200 p-6">
          <div className="flex items-center gap-2 mb-4">
            <div className="p-2 rounded-lg bg-green-50">
              <DollarSign className="w-5 h-5 text-green-600" />
            </div>
            <h2 className="text-base font-semibold text-slate-800">
              Financial Metrics
            </h2>
          </div>
          <div className="divide-y divide-slate-100">
            <KpiRow
              icon={DollarSign}
              iconColor="text-green-500"
              label="Total Invested"
              value={formatCurrency(financialMetrics?.totalInvested ?? 0)}
            />
            <KpiRow
              icon={ArrowUpRight}
              iconColor="text-emerald-500"
              label="Total Est. Equity"
              value={formatCurrency(financialMetrics?.totalEquity ?? 0)}
            />
            <KpiRow
              icon={Home}
              iconColor="text-blue-500"
              label="Monthly Rent Income"
              value={formatCurrency(
                financialMetrics?.monthlyRentIncome ?? 0
              )}
            />
            <KpiRow
              icon={Calendar}
              iconColor="text-indigo-500"
              label="Annual Rent Income"
              value={formatCurrency(
                financialMetrics?.annualRentIncome ?? 0
              )}
            />
            <KpiRow
              icon={Percent}
              iconColor="text-orange-500"
              label="Avg Cash-on-Cash"
              value={`${financialMetrics?.avgCashOnCash ?? 0}%`}
            />
            <KpiRow
              icon={PieChart}
              iconColor="text-purple-500"
              label="Avg Cap Rate"
              value={`${financialMetrics?.avgCapRate ?? 0}%`}
            />
            <KpiRow
              icon={TrendingUp}
              iconColor="text-green-600"
              label="Profit Margin"
              value={`${financialMetrics?.profitMargin ?? 0}%`}
            />
            <KpiRow
              icon={DollarSign}
              iconColor="text-slate-500"
              label="Avg Deal Size"
              value={formatCurrency(financialMetrics?.avgDealSize ?? 0)}
            />
          </div>
        </div>

        {/* ── Activity & Productivity ── */}
        <div className="bg-white rounded-xl border border-slate-200 p-6">
          <div className="flex items-center gap-2 mb-4">
            <div className="p-2 rounded-lg bg-purple-50">
              <Activity className="w-5 h-5 text-purple-600" />
            </div>
            <h2 className="text-base font-semibold text-slate-800">
              Activity & Productivity
            </h2>
          </div>
          <div className="divide-y divide-slate-100">
            <KpiRow
              icon={Zap}
              iconColor="text-yellow-500"
              label="Deals This Week"
              value={activityMetrics?.dealsThisWeek ?? 0}
            />
            <KpiRow
              icon={Target}
              iconColor="text-blue-500"
              label="Deals This Month"
              value={activityMetrics?.dealsThisMonth ?? 0}
            />
            <KpiRow
              icon={Users}
              iconColor="text-purple-500"
              label="Contacts This Week"
              value={activityMetrics?.contactsThisWeek ?? 0}
            />
            <KpiRow
              icon={Users}
              iconColor="text-indigo-500"
              label="Contacts This Month"
              value={activityMetrics?.contactsThisMonth ?? 0}
            />
            <KpiRow
              icon={CheckCircle}
              iconColor="text-green-500"
              label="Tasks Completed"
              value={`${activityMetrics?.completedTasks ?? 0} / ${activityMetrics?.totalTasks ?? 0}`}
            />
            <KpiRow
              icon={Award}
              iconColor="text-emerald-500"
              label="Completion Rate"
              value={`${activityMetrics?.taskCompletionRate ?? 0}%`}
            />
            <KpiRow
              icon={Clock}
              iconColor="text-orange-500"
              label="Tasks Due Today"
              value={activityMetrics?.tasksDueToday ?? 0}
            />
            <KpiRow
              icon={ArrowDownRight}
              iconColor="text-red-500"
              label="Overdue Tasks"
              value={activityMetrics?.overdueTasks ?? 0}
            />
          </div>

          {/* Task completion progress bar */}
          <div className="mt-4 pt-4 border-t border-slate-100">
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">
              Task Completion
            </p>
            <div className="flex items-center gap-3">
              <div className="flex-1 h-2 bg-slate-100 rounded-full overflow-hidden">
                <div
                  className="h-full bg-green-500 rounded-full transition-all"
                  style={{
                    width: `${activityMetrics?.taskCompletionRate ?? 0}%`,
                  }}
                />
              </div>
              <span className="text-xs font-medium text-slate-600">
                {activityMetrics?.taskCompletionRate ?? 0}%
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* ── ROI Per Closed Deal ── */}
      {dealPerformance &&
        dealPerformance.roiPerDeal.length > 0 && (
          <div className="bg-white rounded-xl border border-slate-200 p-5">
            <h2 className="text-base font-semibold text-slate-800 mb-3">
              ROI Per Closed Deal
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              {dealPerformance.roiPerDeal.map((d) => (
                <div
                  key={d.address}
                  className="flex items-center justify-between p-3 bg-slate-50 rounded-lg"
                >
                  <span className="text-sm text-slate-700 truncate mr-2">
                    {d.address}
                  </span>
                  <span
                    className={`text-sm font-bold whitespace-nowrap ${d.roi >= 0 ? 'text-green-600' : 'text-red-600'}`}
                  >
                    {d.roi >= 0 ? '+' : ''}
                    {d.roi}%
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

      {/* Activity Feed + Quick Stats */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <ActivityFeed activities={activities} />

        {/* Quick Stats */}
        <div className="bg-white rounded-xl border border-slate-200 p-6">
          <h2 className="text-lg font-semibold text-slate-800 mb-4">
            Quick Stats
          </h2>
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <TrendingUp className="w-4 h-4 text-green-500" />
                <span className="text-slate-600">Conversion Rate</span>
              </div>
              <span className="font-semibold text-slate-800">
                {dealPerformance?.conversionRate ?? 0}%
              </span>
            </div>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <DollarSign className="w-4 h-4 text-blue-500" />
                <span className="text-slate-600">Avg Deal Value</span>
              </div>
              <span className="font-semibold text-slate-800">
                {formatCurrency(financialMetrics?.avgDealSize ?? 0)}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Users className="w-4 h-4 text-purple-500" />
                <span className="text-slate-600">Total Contacts</span>
              </div>
              <span className="font-semibold text-slate-800">
                {contacts?.length || 0}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Clock className="w-4 h-4 text-orange-500" />
                <span className="text-slate-600">Tasks Due Today</span>
              </div>
              <span className="font-semibold text-slate-800">
                {activityMetrics?.tasksDueToday ?? 0}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <CheckCircle className="w-4 h-4 text-green-500" />
                <span className="text-slate-600">Tasks Completed</span>
              </div>
              <span className="font-semibold text-slate-800">
                {activityMetrics?.completedTasks ?? 0}
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
