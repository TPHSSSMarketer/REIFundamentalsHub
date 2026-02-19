import { useMemo } from 'react'
import { Target, DollarSign, CheckCircle, Clock } from 'lucide-react'
import MetricCard from './MetricCard'
import ActivityFeed from './ActivityFeed'
import { useDeals, useTasks, useContacts } from '@/hooks/useApi'
import { formatCurrency } from '@/utils/helpers'
import type { Activity } from '@/types'

export default function Dashboard() {
  const { data: deals, isLoading: dealsLoading } = useDeals()
  const { data: tasks } = useTasks()
  const { data: contactsData } = useContacts({ limit: 20 })

  // Calculate metrics from deals
  const totalOpportunities = deals?.length || 0
  const activeDeals = deals?.filter((d) => d.status === 'open').length || 0
  const closedDeals = deals?.filter((d) => d.status === 'won').length || 0
  const pendingTasks = tasks?.filter((t: any) => !t.completed).length || 0
  const pipelineValue = deals?.reduce((sum, d) => sum + (d.value || 0), 0) || 0

  const activities = useMemo(() => {
    const items: Activity[] = []
    // Add most recent deals as activity items
    if (deals) {
      deals.slice(0, 5).forEach((deal) => {
        items.push({
          id: `deal-${deal.id}`,
          type: deal.status === 'won' ? 'deal_updated' : 'deal_created',
          title: deal.status === 'won' ? 'Deal closed won' : 'Deal in pipeline',
          description: `${deal.title || 'Unnamed deal'} — ${formatCurrency(deal.value || 0)}`,
          timestamp: deal.updatedAt || deal.createdAt || new Date().toISOString(),
          entityType: 'deal',
        })
      })
    }
    // Add most recent contacts as activity items
    if (contactsData?.contacts) {
      contactsData.contacts.slice(0, 5).forEach((contact) => {
        items.push({
          id: `contact-${contact.id}`,
          type: 'contact_added',
          title: 'Contact in CRM',
          description: `${contact.name}${contact.tags?.length ? ' — ' + contact.tags.slice(0, 2).join(', ') : ''}`,
          timestamp: contact.dateAdded || new Date().toISOString(),
          entityType: 'contact',
        })
      })
    }
    // Sort by timestamp descending, cap at 10
    return items
      .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
      .slice(0, 10)
  }, [deals, contactsData])

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div>
        <h1 className="text-2xl font-bold text-slate-800">Dashboard</h1>
        <p className="text-slate-600">Welcome back! Here's your overview.</p>
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
          title="Closed This Month"
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

      {/* Pipeline Value */}
      <div className="bg-gradient-to-r from-primary-500 to-primary-600 rounded-xl p-6 text-white">
        <p className="text-primary-100 text-sm font-medium">Total Pipeline Value</p>
        <p className="text-3xl font-bold mt-1">{formatCurrency(pipelineValue)}</p>
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
              <span className="text-slate-600">Tasks Due Today</span>
              <span className="font-semibold text-slate-800">
                {pendingTasks}
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
