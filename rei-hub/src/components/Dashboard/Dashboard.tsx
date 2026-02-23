import { useMemo } from 'react'
import { Target, DollarSign, CheckCircle, Clock } from 'lucide-react'
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

export default function Dashboard() {
  const { data: deals, isLoading: dealsLoading } = useDeals()
  const { data: tasks } = useTasks()
  const { data: contacts } = useContacts()

  // Calculate metrics from deals
  const totalOpportunities = deals?.length || 0
  const activeDeals = deals?.filter((d) => d.stage !== 'closed_won' && d.stage !== 'closed_lost').length || 0
  const closedDeals = deals?.filter((d) => d.stage === 'closed_won').length || 0
  const pendingTasks = tasks?.tasks?.filter((t: any) => !t.completed).length || 0
  const pipelineValue = deals?.reduce((sum, d) => sum + (d.purchasePrice || 0), 0) || 0

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
    // Sort by timestamp descending, cap at 10
    return items
      .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
      .slice(0, 10)
  }, [deals, contacts])

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

      {/* Pipeline Value */}
      <div className="bg-gradient-to-r from-primary-500 to-primary-600 rounded-xl p-4 md:p-6 text-white">
        <p className="text-primary-100 text-sm font-medium">Total Pipeline Value</p>
        <p className="text-2xl md:text-3xl font-bold mt-1">{formatCurrency(pipelineValue)}</p>
        <p className="text-primary-200 text-sm mt-2">
          Across {activeDeals} active deals
        </p>
      </div>

      {/* Activity Feed */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <ActivityFeed activities={activities} />

        {/* Quick Stats */}
        <div className="bg-white rounded-xl border border-slate-200 p-6">
          <h2 className="text-lg font-semibold text-slate-800 mb-4">
            Quick Stats
          </h2>
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-slate-600">Conversion Rate</span>
              <span className="font-semibold text-slate-800">
                {totalOpportunities > 0
                  ? ((closedDeals / totalOpportunities) * 100).toFixed(1)
                  : 0}
                %
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-slate-600">Avg Deal Value</span>
              <span className="font-semibold text-slate-800">
                {formatCurrency(
                  activeDeals > 0 ? pipelineValue / activeDeals : 0
                )}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-slate-600">Total Contacts</span>
              <span className="font-semibold text-slate-800">
                {contacts?.length || 0}
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
