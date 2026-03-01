import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { Check, Loader2 } from 'lucide-react'
import { useDemoMode } from '@/hooks/useDemoMode'
import * as calApi from '@/services/calendarApi'
import { cn } from '@/utils/helpers'

interface TodaySummary {
  tasks_due_today: any[]
  tasks_overdue: any[]
  events_today: any[]
  upcoming_closings: any[]
  expiring_pof: any[]
  callbacks_scheduled: any[]
}

function getDemoTodaySummary(): TodaySummary {
  const now = new Date()

  // Create a closing date 3 days from now
  const closingDate = new Date(now.getTime() + 3 * 86400000)

  return {
    tasks_due_today: [
      { id: 'dt-1', title: 'Call seller for 123 Main St', status: 'pending', due_time: '10:00 AM' },
      { id: 'dt-2', title: 'Schedule property inspection', status: 'pending', due_time: '2:00 PM' },
      { id: 'dt-3', title: 'Send updated offer letter', status: 'pending', due_time: '4:00 PM' },
    ],
    tasks_overdue: [
      { id: 'do-1', title: 'Follow up with lender on pre-approval' },
    ],
    events_today: [
      {
        id: 'ev-1',
        title: 'Property showing — 456 Oak Ave',
        event_type: 'showing',
        start_datetime: new Date(now.getFullYear(), now.getMonth(), now.getDate(), 11, 0).toISOString(),
      },
      {
        id: 'ev-2',
        title: 'Callback — Sarah Johnson',
        event_type: 'callback',
        start_datetime: new Date(now.getFullYear(), now.getMonth(), now.getDate(), 15, 30).toISOString(),
      },
    ],
    upcoming_closings: [
      {
        id: 'cl-1',
        title: '789 Pine Rd closing',
        start_datetime: closingDate.toISOString(),
      },
    ],
    expiring_pof: [],
    callbacks_scheduled: [],
  }
}

export default function TodayWidget() {
  const navigate = useNavigate()
  const { isDemoMode } = useDemoMode()
  const [data, setData] = useState<TodaySummary | null>(null)
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    try {
      if (isDemoMode) {
        setData(getDemoTodaySummary())
      } else {
        const summary = await calApi.getTodaySummary()
        setData(summary)
      }
    } catch {
      // In case of error, still show demo data if in demo mode
      if (isDemoMode) {
        setData(getDemoTodaySummary())
      }
    } finally {
      setLoading(false)
    }
  }, [isDemoMode])

  useEffect(() => {
    load()
    const interval = setInterval(load, 5 * 60 * 1000) // refresh every 5 minutes
    return () => clearInterval(interval)
  }, [load])

  const handleComplete = async (id: string) => {
    if (isDemoMode) {
      // In demo mode, just mark the task completed visually
      setData((prev) => {
        if (!prev) return prev
        return {
          ...prev,
          tasks_due_today: prev.tasks_due_today.map((t) =>
            t.id === id ? { ...t, status: 'completed' } : t
          ),
        }
      })
      return
    }
    try {
      await calApi.completeTask(id)
      await load()
    } catch {
      // ignore
    }
  }

  const today = new Date()
  const formatted = today.toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  })

  if (loading) {
    return (
      <div className="bg-white rounded-xl border border-slate-200 p-5">
        <div className="flex items-center justify-center h-24">
          <Loader2 className="w-5 h-5 animate-spin text-primary-500" />
        </div>
      </div>
    )
  }

  if (!data) return null

  const overdueCount = data.tasks_overdue.length
  const todayTaskCount = data.tasks_due_today.length
  const todayEventCount = data.events_today.length
  const closingCount = data.upcoming_closings.length
  const pofCount = data.expiring_pof.length

  return (
    <div className="bg-white rounded-xl border border-slate-200 p-5">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-base font-semibold text-slate-800">
          Today &mdash; {formatted}
        </h2>
        <button
          onClick={() => navigate('/calendar')}
          className="text-xs text-primary-600 hover:underline font-medium"
        >
          View Full Calendar &rarr;
        </button>
      </div>

      {/* Overdue tasks */}
      {overdueCount > 0 && (
        <div className="mb-3">
          <div className="flex items-center gap-2 mb-1.5">
            <span className="px-2 py-0.5 text-[10px] font-bold uppercase bg-red-100 text-red-700 rounded-full">
              {overdueCount} overdue
            </span>
          </div>
          <div className="space-y-1">
            {data.tasks_overdue.slice(0, 2).map((t: any) => (
              <div key={t.id} className="flex items-center gap-2 text-sm text-red-700">
                <span className="w-1.5 h-1.5 bg-red-500 rounded-full shrink-0" />
                <span className="truncate">{t.title}</span>
              </div>
            ))}
            {overdueCount > 2 && (
              <p className="text-[10px] text-red-500 pl-3.5">+{overdueCount - 2} more</p>
            )}
          </div>
        </div>
      )}

      {/* Today's tasks */}
      {todayTaskCount > 0 && (
        <div className="mb-3">
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5">
            Tasks ({todayTaskCount})
          </p>
          <div className="space-y-1">
            {data.tasks_due_today.slice(0, 5).map((t: any) => (
              <div key={t.id} className="flex items-center gap-2">
                <button
                  onClick={() => handleComplete(t.id)}
                  className="w-4 h-4 rounded-full border border-slate-300 hover:border-green-500 hover:bg-green-50 flex items-center justify-center shrink-0"
                >
                  {t.status === 'completed' && <Check className="w-2.5 h-2.5 text-green-600" />}
                </button>
                <span className="text-sm text-slate-700 truncate">{t.title}</span>
                {t.due_time && (
                  <span className="text-[10px] text-slate-400 ml-auto shrink-0">{t.due_time}</span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Today's events */}
      {todayEventCount > 0 && (
        <div className="mb-3">
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5">
            Events ({todayEventCount})
          </p>
          <div className="space-y-1">
            {data.events_today.slice(0, 3).map((e: any) => (
              <div key={e.id} className="flex items-center gap-2 text-sm text-slate-700">
                <span className={cn(
                  'w-1.5 h-1.5 rounded-full shrink-0',
                  e.event_type === 'closing' ? 'bg-green-500' :
                  e.event_type === 'callback' ? 'bg-yellow-500' : 'bg-blue-500'
                )} />
                <span className="truncate">{e.title}</span>
                {e.start_datetime && (
                  <span className="text-[10px] text-slate-400 ml-auto shrink-0">
                    {new Date(e.start_datetime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Upcoming closings */}
      {closingCount > 0 && (
        <div className="mb-3">
          <p className="text-xs font-semibold text-green-600 uppercase tracking-wide mb-1">
            Upcoming Closings (7 days)
          </p>
          {data.upcoming_closings.map((c: any) => (
            <div key={c.id} className="text-sm text-slate-700">
              {c.title} &mdash; {c.start_datetime ? new Date(c.start_datetime).toLocaleDateString() : ''}
            </div>
          ))}
        </div>
      )}

      {/* Expiring POF */}
      {pofCount > 0 && (
        <div className="mb-3">
          <p className="text-xs font-semibold text-orange-600 uppercase tracking-wide mb-1">
            Expiring POF (24hrs)
          </p>
          {data.expiring_pof.map((p: any) => (
            <div key={p.id} className="text-sm text-orange-700">{p.title}</div>
          ))}
        </div>
      )}

      {/* Empty state */}
      {overdueCount === 0 && todayTaskCount === 0 && todayEventCount === 0 && (
        <p className="text-sm text-slate-400 text-center py-4">Nothing scheduled for today</p>
      )}
    </div>
  )
}
