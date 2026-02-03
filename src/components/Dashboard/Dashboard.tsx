import { Target, DollarSign, CheckCircle, Clock } from 'lucide-react'
import MetricCard from './MetricCard'
import ActivityFeed from './ActivityFeed'
import { useDeals, useTasks } from '@/hooks/useGHL'
import { formatCurrency } from '@/utils/helpers'
import type { Activity } from '@/types'

export default function Dashboard() {
  const { data: deals, isLoading: dealsLoading } = useDeals()
  const { data: tasks } = useTasks()

  // Calculate metrics from deals
  const totalOpportunities = deals?.length || 0
  const activeDeals = deals?.filter((d) => d.status === 'open').length || 0
  const closedDeals = deals?.filter((d) => d.status === 'won').length || 0
  const pendingTasks = tasks?.filter((t: any) => !t.completed).length || 0
  const pipelineValue = deals?.reduce((sum, d) => sum + (d.value || 0), 0) || 0

  // Mock activity data (would come from API in production)
  const activities: Activity[] = [
    {
      id: '1',
      type: 'deal_created',
      title: 'New deal created',
      description: 'Main St Property - $185,000',
      timestamp: new Date(Date.now() - 3600000).toISOString(),
      entityType: 'deal',
    },
    {
      id: '2',
      type: 'contact_added',
      title: 'Contact added',
      description: 'John Smith - Motivated Seller',
      timestamp: new Date(Date.now() - 7200000).toISOString(),
      entityType: 'contact',
    },
    {
      id: '3',
      type: 'deal_updated',
      title: 'Deal moved to Qualified',
      description: 'Oak Ave Property',
      timestamp: new Date(Date.now() - 14400000).toISOString(),
      entityType: 'deal',
    },
    {
      id: '4',
      type: 'message_sent',
      title: 'SMS sent',
      description: 'Follow-up to Sarah Johnson',
      timestamp: new Date(Date.now() - 28800000).toISOString(),
    },
    {
      id: '5',
      type: 'task_completed',
      title: 'Task completed',
      description: 'Call back Mike Williams',
      timestamp: new Date(Date.now() - 43200000).toISOString(),
      entityType: 'task',
    },
  ]

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
