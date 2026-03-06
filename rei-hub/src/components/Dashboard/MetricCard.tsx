import { LucideIcon } from 'lucide-react'
import { cn } from '@/utils/helpers'

interface MetricCardProps {
  title: string
  value: number | string
  icon: LucideIcon
  color: 'primary' | 'success' | 'warning' | 'danger'
  loading?: boolean
}

const colorClasses = {
  primary: {
    bg: 'bg-primary-50',
    icon: 'text-primary-500',
    value: 'text-primary-600',
  },
  success: {
    bg: 'bg-success-50',
    icon: 'text-success-500',
    value: 'text-success-600',
  },
  warning: {
    bg: 'bg-warning-50',
    icon: 'text-warning-500',
    value: 'text-warning-600',
  },
  danger: {
    bg: 'bg-danger-50',
    icon: 'text-danger-500',
    value: 'text-danger-600',
  },
}

export default function MetricCard({
  title,
  value,
  icon: Icon,
  color,
  loading = false,
}: MetricCardProps) {
  const colors = colorClasses[color]

  return (
    <div className="bg-white rounded-xl border border-slate-200 p-5">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-sm font-medium text-slate-500">{title}</p>
          {loading ? (
            <div className="h-8 w-16 bg-slate-200 rounded animate-pulse mt-1" />
          ) : (
            <p className={cn('text-2xl font-bold mt-1', colors.value)}>
              {value}
            </p>
          )}
        </div>
        <div className={cn('p-3 rounded-lg', colors.bg)}>
          <Icon className={cn('w-5 h-5', colors.icon)} />
        </div>
      </div>
    </div>
  )
}
