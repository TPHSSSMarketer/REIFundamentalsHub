import { useMemo } from 'react'
import { Target, DollarSign, CheckCircle, Clock, TrendingUp, Users, Mail, Phone } from 'lucide-react'
import MetricCard from './MetricCard'
import ActivityFeed from './ActivityFeed'
import TodayWidget from '@/components/Calendar/TodayWidget'
import { useDeals, useTasks, useContacts } from '@/hooks/useApi'
import { formatCurrency } from '@/utils/helpers'
import type { Activity } from '@/types'

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

export default function Dashboard() {
  const { data: deals, isLoading: dealsLoading } = useDeals()
  const { data: tasksData } = useTasks()
  const { data: contacts } = useContacts()

  const tasks = tasksData?.tasks || []

  // Calculate metrics from deals
  const totalOpportunities = deals?.length || 0
  const activeDeals = deals?.filter((d) => d.stage !== 'closed_won' && d.stage !== 'closed_lost').length || 0
  const closedDeals = deals?.filter((d) => d.stage === 'closed_won').length || 0
  const pendingTasks = tasks.filter((t: any) => !t.completed).length
  const pipelineValue = deals?.reduce((sum, d) => sum + (d.purchasePrice || 0), 0) || 0

  // Stage breakdown for the pipeline chart
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

  const activities = useMemo(() => {
    const items: Activity[] = []
    // Add most recent deals as activity items
    if (deals) {
      deals.slice(0, 5).forEach((deal) => {
        items.push({
          id: `deal-${deal.id}`,
          type: deal.stage === 'closed_won' ? 'deal_updated' : 'deal_created',
          title: deal.stage === 'closed_won' ? 'Deal closed won' : `Deal in ${STAGE_LABELS[deal.stage] || deal.stage}`,
          description: `${deal.address || deal.title} — ${formatCurrency(deal.purchasePrice || 0)}`,
          timestamp: deal.updatedAt || deal.createdAt,
          entityType: 'deal',
        })
      })
    }
    // Add most recent contacts as activity items
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
    // Add completed tasks
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
    // Sort by timestamp descending, cap at 10
    return items
      .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
      .slice(0, 10)
  }, [deals, contacts, tasks])

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div>
        <h1 className="text-xl md:text-2xl font-bold text-slate-800">Dashboard</h1>
        <p className="text-sm md:text-base text-slate-600">Welcome back! Here's your overview.</p>
      </div>

      {/* Metrics Grid */}
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
          value={closedDeals}
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
            <p className="text-primary-100 text-sm font-medium">Total Pipeline Value</p>
            <p className="text-2xl md:text-3xl font-bold mt-1">{formatCurrency(pipelineValue)}</p>
            <p className="text-primary-200 text-sm mt-2">
              Across {activeDeals} active deal{activeDeals !== 1 ? 's' : ''}
            </p>
          </div>
          {/* Mini stage breakdown */}
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
          <h2 className="text-base font-semibold text-slate-800 mb-3">Pipeline Breakdown</h2>
          {/* Stacked bar */}
          <div className="flex h-4 rounded-full overflow-hidden mb-3">
            {stageBreakdown.map((s) => (
              <div
                key={s.stage}
                className={`${s.color} transition-all`}
                style={{ width: `${(s.count / totalOpportunities) * 100}%` }}
                title={`${s.label}: ${s.count}`}
              />
            ))}
          </div>
          {/* Legend */}
          <div className="flex flex-wrap gap-x-4 gap-y-1">
            {stageBreakdown.map((s) => (
              <div key={s.stage} className="flex items-center gap-1.5 text-xs text-slate-600">
                <span className={`w-2.5 h-2.5 rounded-full ${s.color}`} />
                {s.label} ({s.count})
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
                {totalOpportunities > 0
                  ? ((closedDeals / totalOpportunities) * 100).toFixed(1)
                  : 0}
                %
              </span>
            </div>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <DollarSign className="w-4 h-4 text-blue-500" />
                <span className="text-slate-600">Avg Deal Value</span>
              </div>
              <span className="font-semibold text-slate-800">
                {formatCurrency(
                  activeDeals > 0 ? pipelineValue / activeDeals : 0
                )}
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
                {tasks.filter((t: any) => {
                  if (t.completed) return false
                  const today = new Date().toISOString().slice(0, 10)
                  return t.due_date === today
                }).length}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <CheckCircle className="w-4 h-4 text-green-500" />
                <span className="text-slate-600">Tasks Completed</span>
              </div>
              <span className="font-semibold text-slate-800">
                {tasks.filter((t: any) => t.completed).length}
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
