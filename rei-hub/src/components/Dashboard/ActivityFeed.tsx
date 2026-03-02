import {
  Plus,
  UserPlus,
  ArrowRight,
  MessageSquare,
  CheckCircle,
} from 'lucide-react'
import { formatRelativeTime } from '@/utils/helpers'
import type { Activity } from '@/types'

interface ActivityFeedProps {
  activities: Activity[]
}

const activityIcons = {
  deal_created: { icon: Plus, color: 'bg-primary-100 text-primary-600' },
  deal_updated: { icon: ArrowRight, color: 'bg-warning-100 text-warning-600' },
  contact_added: { icon: UserPlus, color: 'bg-success-100 text-success-600' },
  message_sent: { icon: MessageSquare, color: 'bg-purple-100 text-purple-600' },
  task_completed: { icon: CheckCircle, color: 'bg-slate-100 text-slate-600' },
}

export default function ActivityFeed({ activities }: ActivityFeedProps) {
  return (
    <div className="bg-white rounded-xl border border-slate-200 p-6">
      <h2 className="text-lg font-semibold text-slate-800 mb-4">
        Recent Activity
      </h2>

      {activities.length === 0 ? (
        <p className="text-slate-500 text-center py-8">No recent activity</p>
      ) : (
        <div className="space-y-4">
          {activities.map((activity) => {
            const { icon: Icon, color } = activityIcons[activity.type]
            return (
              <div
                key={activity.id}
                className="flex items-start gap-3 p-3 rounded-lg hover:bg-slate-50 transition-colors"
              >
                <div className={`p-2 rounded-lg shrink-0 ${color}`}>
                  <Icon className="w-4 h-4" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-slate-800">{activity.title}</p>
                  <p className="text-sm text-slate-500 truncate">
                    {activity.description}
                  </p>
                </div>
                <span className="text-xs text-slate-400 whitespace-nowrap">
                  {formatRelativeTime(activity.timestamp)}
                </span>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
