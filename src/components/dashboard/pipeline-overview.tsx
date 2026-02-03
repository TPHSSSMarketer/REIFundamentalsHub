'use client'

import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { ArrowRight } from 'lucide-react'
import { formatCurrency } from '@/lib/utils'

interface PipelineStage {
  id: string
  name: string
  count: number
  value: number
  color: string
}

interface PipelineOverviewProps {
  stages: PipelineStage[]
}

export function PipelineOverview({ stages }: PipelineOverviewProps) {
  const totalValue = stages.reduce((acc, stage) => acc + stage.value, 0)
  const totalDeals = stages.reduce((acc, stage) => acc + stage.count, 0)

  return (
    <div className="rounded-xl border bg-card">
      <div className="flex items-center justify-between p-6 border-b">
        <div>
          <h3 className="font-semibold">Deal Pipeline</h3>
          <p className="text-sm text-muted-foreground">
            {totalDeals} deals worth {formatCurrency(totalValue)}
          </p>
        </div>
        <Link href="/dashboard/pipeline">
          <Button variant="ghost" size="sm">
            View Pipeline
            <ArrowRight className="ml-1 h-4 w-4" />
          </Button>
        </Link>
      </div>
      <div className="p-6">
        {/* Progress bar */}
        <div className="flex h-3 rounded-full overflow-hidden bg-muted mb-4">
          {stages.map((stage) => {
            const percentage = totalDeals > 0 ? (stage.count / totalDeals) * 100 : 0
            return (
              <div
                key={stage.id}
                className="h-full transition-all"
                style={{
                  width: `${percentage}%`,
                  backgroundColor: stage.color,
                }}
                title={`${stage.name}: ${stage.count} deals`}
              />
            )
          })}
        </div>

        {/* Stage breakdown */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {stages.map((stage) => (
            <div key={stage.id} className="text-center">
              <div className="flex items-center justify-center gap-2 mb-1">
                <div
                  className="w-3 h-3 rounded-full"
                  style={{ backgroundColor: stage.color }}
                />
                <span className="text-sm font-medium">{stage.name}</span>
              </div>
              <p className="text-2xl font-bold">{stage.count}</p>
              <p className="text-xs text-muted-foreground">
                {formatCurrency(stage.value)}
              </p>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
