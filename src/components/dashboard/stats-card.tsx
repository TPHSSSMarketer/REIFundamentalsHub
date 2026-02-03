import { cn } from '@/lib/utils'
import { LucideIcon } from 'lucide-react'

interface StatsCardProps {
  title: string
  value: string | number
  change?: {
    value: number
    label: string
  }
  icon: LucideIcon
  iconColor?: string
}

export function StatsCard({
  title,
  value,
  change,
  icon: Icon,
  iconColor = 'text-primary',
}: StatsCardProps) {
  const isPositive = change && change.value >= 0

  return (
    <div className="rounded-xl border bg-card p-6">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium text-muted-foreground">{title}</p>
        <div className={cn('rounded-lg bg-primary/10 p-2', iconColor)}>
          <Icon className="h-5 w-5" />
        </div>
      </div>
      <div className="mt-4">
        <p className="text-3xl font-bold">{value}</p>
        {change && (
          <p
            className={cn(
              'mt-1 text-sm',
              isPositive ? 'text-green-600' : 'text-red-600'
            )}
          >
            <span>{isPositive ? '+' : ''}{change.value}%</span>
            <span className="text-muted-foreground ml-1">{change.label}</span>
          </p>
        )}
      </div>
    </div>
  )
}
