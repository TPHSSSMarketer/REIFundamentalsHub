import { useState, useEffect, useCallback, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  ChevronLeft,
  ChevronRight,
  Plus,
  Check,
  X,
  MoreHorizontal,
  Copy,
  RefreshCw,
  Loader2,
  Trash2,
  Link as LinkIcon,
} from 'lucide-react'
import * as calApi from '@/services/calendarApi'
import { cn } from '@/utils/helpers'

// ── Types ─────────────────────────────────────────────────────

type ViewMode = 'month' | 'week' | 'tasks'

interface TaskItem {
  id: string
  title: string
  description?: string
  status: string
  priority: string
  due_date?: string
  due_time?: string
  contact_id?: string
  deal_id?: string
  task_type: string
  is_recurring: boolean
  reminder_minutes?: number
}

interface EventItem {
  id: string
  title: string
  description?: string
  event_type: string
  start_datetime?: string
  end_datetime?: string
  all_day?: boolean
  location?: string
  contact_id?: string
  deal_id?: string
  task_id?: string
}

interface UserProfile {
  google_calendar_sync?: boolean
  outlook_calendar_sync?: boolean
  caldav_sync?: boolean
  ical_feed_token?: string
}

// ── Constants ─────────────────────────────────────────────────

const EVENT_COLORS: Record<string, string> = {
  appointment: 'bg-blue-500',
  closing: 'bg-green-500',
  callback: 'bg-yellow-500',
  follow_up: 'bg-purple-500',
  task: 'bg-slate-400',
  reminder: 'bg-orange-500',
}

const PRIORITY_DOTS: Record<string, string> = {
  urgent: 'bg-red-500',
  high: 'bg-orange-500',
  medium: 'bg-yellow-500',
  low: 'bg-slate-400',
}

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const MONTHS = [
  'January','February','March','April','May','June',
  'July','August','September','October','November','December',
]

// ── Main Component ────────────────────────────────────────────

export default function CalendarPage() {
  const navigate = useNavigate()

  const [view, setView] = useState<ViewMode>('month')
  const [currentDate, setCurrentDate] = useState(new Date())
  const [events, setEvents] = useState<EventItem[]>([])
  const [tasks, setTasks] = useState<Record<string, TaskItem[]>>({})
  const [loading, setLoading] = useState(true)
  const [selectedDay, setSelectedDay] = useState<Date | null>(null)
  const [profile, setProfile] = useState<UserProfile>({})

  // Modals
  const [showTaskModal, setShowTaskModal] = useState(false)
  const [showEventModal, setShowEventModal] = useState(false)
  const [showSyncPanel, setShowSyncPanel] = useState(false)
  const [showCaldavModal, setShowCaldavModal] = useState(false)
  const [syncing, setSyncing] = useState<string | null>(null)
  const [copiedFeed, setCopiedFeed] = useState(false)

  // Task form
  const [taskForm, setTaskForm] = useState({
    title: '', description: '', priority: 'medium',
    due_date: '', due_time: '', contact_id: '', deal_id: '',
    task_type: 'manual', is_recurring: false, recurrence_rule: '',
    reminder_minutes: 30,
  })

  // Event form
  const [eventForm, setEventForm] = useState({
    title: '', description: '', event_type: 'appointment',
    start_datetime: '', end_datetime: '', all_day: false,
    location: '', contact_id: '', deal_id: '',
    reminder_minutes: 30, is_recurring: false, recurrence_rule: '',
  })

  // CalDAV form
  const [caldavForm, setCaldavForm] = useState({
    username: '', password: '', calendar_url: 'https://caldav.icloud.com',
  })

  // ── Data loading ────────────────────────────────────────────

  const loadEvents = useCallback(async () => {
    const start = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1)
    const end = new Date(currentDate.getFullYear(), currentDate.getMonth() + 2, 0)
    try {
      const data = await calApi.getEvents(start.toISOString(), end.toISOString())
      setEvents(data.events || [])
    } catch { /* ignore */ }
  }, [currentDate])

  const loadTasks = useCallback(async () => {
    try {
      const data = await calApi.getTasks(undefined)
      setTasks(data)
    } catch { /* ignore */ }
  }, [])

  const loadProfile = useCallback(async () => {
    try {
      const res = await fetch(
        `${import.meta.env.VITE_REI_SERVER_URL ?? 'http://localhost:8001'}/api/auth/me`,
        { credentials: 'include' }
      )
      if (res.ok) {
        const data = await res.json()
        setProfile(data)
      }
    } catch { /* ignore */ }
  }, [])

  useEffect(() => {
    setLoading(true)
    Promise.all([loadEvents(), loadTasks(), loadProfile()]).finally(() => setLoading(false))
  }, [loadEvents, loadTasks, loadProfile])

  // ── Handlers ────────────────────────────────────────────────

  const handleCreateTask = async () => {
    try {
      await calApi.createTask(taskForm)
      setShowTaskModal(false)
      setTaskForm({
        title: '', description: '', priority: 'medium',
        due_date: '', due_time: '', contact_id: '', deal_id: '',
        task_type: 'manual', is_recurring: false, recurrence_rule: '',
        reminder_minutes: 30,
      })
      await Promise.all([loadTasks(), loadEvents()])
    } catch { /* ignore */ }
  }

  const handleCreateEvent = async () => {
    try {
      await calApi.createEvent(eventForm)
      setShowEventModal(false)
      setEventForm({
        title: '', description: '', event_type: 'appointment',
        start_datetime: '', end_datetime: '', all_day: false,
        location: '', contact_id: '', deal_id: '',
        reminder_minutes: 30, is_recurring: false, recurrence_rule: '',
      })
      await loadEvents()
    } catch { /* ignore */ }
  }

  const handleCompleteTask = async (id: string) => {
    try {
      await calApi.completeTask(id)
      await loadTasks()
    } catch { /* ignore */ }
  }

  const handleDeleteTask = async (id: string) => {
    try {
      await calApi.deleteTask(id)
      await Promise.all([loadTasks(), loadEvents()])
    } catch { /* ignore */ }
  }

  const handleSync = async (provider: string) => {
    setSyncing(provider)
    try {
      if (provider === 'google') await calApi.syncGoogle()
      else if (provider === 'outlook') await calApi.syncOutlook()
      else if (provider === 'caldav') await calApi.syncCaldav()
      await loadEvents()
    } catch { /* ignore */ }
    setSyncing(null)
  }

  const handleGoogleConnect = async () => {
    try {
      const data = await calApi.getGoogleAuthUrl()
      window.open(data.auth_url, '_blank')
    } catch { /* ignore */ }
  }

  const handleOutlookConnect = async () => {
    try {
      const data = await calApi.getOutlookAuthUrl()
      window.open(data.auth_url, '_blank')
    } catch { /* ignore */ }
  }

  const handleCaldavConnect = async () => {
    try {
      await calApi.connectCaldav(caldavForm)
      setShowCaldavModal(false)
      await loadProfile()
    } catch { /* ignore */ }
  }

  const handleDisconnect = async (provider: string) => {
    try {
      if (provider === 'google') await calApi.disconnectGoogle()
      else if (provider === 'outlook') await calApi.disconnectOutlook()
      else if (provider === 'caldav') await calApi.disconnectCaldav()
      await loadProfile()
    } catch { /* ignore */ }
  }

  const copyFeedUrl = () => {
    if (profile.ical_feed_token) {
      navigator.clipboard.writeText(calApi.getIcalFeedUrl(profile.ical_feed_token))
      setCopiedFeed(true)
      setTimeout(() => setCopiedFeed(false), 2000)
    }
  }

  // ── Calendar grid helpers ───────────────────────────────────

  const monthGrid = useMemo(() => {
    const year = currentDate.getFullYear()
    const month = currentDate.getMonth()
    const firstDay = new Date(year, month, 1).getDay()
    const daysInMonth = new Date(year, month + 1, 0).getDate()
    const prevMonthDays = new Date(year, month, 0).getDate()

    const cells: Array<{ date: Date; isCurrentMonth: boolean }> = []

    // Previous month padding
    for (let i = firstDay - 1; i >= 0; i--) {
      cells.push({
        date: new Date(year, month - 1, prevMonthDays - i),
        isCurrentMonth: false,
      })
    }

    // Current month
    for (let d = 1; d <= daysInMonth; d++) {
      cells.push({ date: new Date(year, month, d), isCurrentMonth: true })
    }

    // Next month padding
    const remaining = 42 - cells.length
    for (let d = 1; d <= remaining; d++) {
      cells.push({ date: new Date(year, month + 1, d), isCurrentMonth: false })
    }

    return cells
  }, [currentDate])

  const weekDates = useMemo(() => {
    const d = new Date(currentDate)
    const day = d.getDay()
    const start = new Date(d)
    start.setDate(d.getDate() - day)
    return Array.from({ length: 7 }, (_, i) => {
      const date = new Date(start)
      date.setDate(start.getDate() + i)
      return date
    })
  }, [currentDate])

  function getEventsForDate(date: Date) {
    const dateStr = date.toISOString().split('T')[0]
    return events.filter((e) => {
      if (!e.start_datetime) return false
      return e.start_datetime.split('T')[0] === dateStr
    })
  }

  function isToday(date: Date) {
    const now = new Date()
    return (
      date.getDate() === now.getDate() &&
      date.getMonth() === now.getMonth() &&
      date.getFullYear() === now.getFullYear()
    )
  }

  const navigate_month = (delta: number) => {
    setCurrentDate(
      new Date(currentDate.getFullYear(), currentDate.getMonth() + delta, 1)
    )
  }

  const navigate_week = (delta: number) => {
    const d = new Date(currentDate)
    d.setDate(d.getDate() + delta * 7)
    setCurrentDate(d)
  }

  const goToday = () => setCurrentDate(new Date())

  const allTasks = [
    ...(tasks.overdue || []),
    ...(tasks.today || []),
    ...(tasks.this_week || []),
    ...(tasks.upcoming || []),
    ...(tasks.no_date || []),
  ]

  // ── Render ──────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <Loader2 className="w-8 h-8 animate-spin text-primary-500" />
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl md:text-2xl font-bold text-slate-800">Calendar</h1>
        <div className="flex items-center gap-1.5 md:gap-2">
          <button
            onClick={() => setShowSyncPanel(!showSyncPanel)}
            className="px-2.5 md:px-3 py-1.5 text-xs font-medium bg-slate-100 text-slate-700 rounded-lg hover:bg-slate-200 min-h-[36px]"
          >
            <LinkIcon className="w-3.5 h-3.5 inline mr-1" />
            <span className="hidden sm:inline">Sync</span>
          </button>
          <button
            onClick={() => setShowTaskModal(true)}
            className="px-2.5 md:px-3 py-1.5 text-xs font-medium bg-primary-600 text-white rounded-lg hover:bg-primary-700 min-h-[36px]"
          >
            <Plus className="w-3.5 h-3.5 inline mr-1" />
            Task
          </button>
          <button
            onClick={() => setShowEventModal(true)}
            className="px-2.5 md:px-3 py-1.5 text-xs font-medium bg-green-600 text-white rounded-lg hover:bg-green-700 min-h-[36px]"
          >
            <Plus className="w-3.5 h-3.5 inline mr-1" />
            Event
          </button>
        </div>
      </div>

      {/* ── Sync Panel ───────────────────────────────────────── */}
      {showSyncPanel && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {/* Google */}
          <div className="bg-white rounded-xl border border-slate-200 p-4">
            <div className="flex items-center gap-2 mb-3">
              <div className="w-8 h-8 bg-red-50 rounded-lg flex items-center justify-center text-lg">G</div>
              <div>
                <p className="text-sm font-semibold text-slate-800">Google Calendar</p>
                {profile.google_calendar_sync && (
                  <span className="text-[10px] px-1.5 py-0.5 bg-green-100 text-green-700 rounded-full font-medium">Connected</span>
                )}
              </div>
            </div>
            {profile.google_calendar_sync ? (
              <div className="flex gap-2">
                <button onClick={() => handleSync('google')} disabled={syncing === 'google'}
                  className="flex-1 px-2 py-1.5 text-xs bg-blue-50 text-blue-700 rounded-lg hover:bg-blue-100 disabled:opacity-50">
                  {syncing === 'google' ? <Loader2 className="w-3 h-3 animate-spin inline" /> : <RefreshCw className="w-3 h-3 inline" />} Sync
                </button>
                <button onClick={() => handleDisconnect('google')}
                  className="px-2 py-1.5 text-xs bg-red-50 text-red-700 rounded-lg hover:bg-red-100">Disconnect</button>
              </div>
            ) : (
              <button onClick={handleGoogleConnect}
                className="w-full px-3 py-1.5 text-xs bg-red-50 text-red-700 rounded-lg hover:bg-red-100 font-medium">
                Connect Google Calendar
              </button>
            )}
          </div>

          {/* Outlook */}
          <div className="bg-white rounded-xl border border-slate-200 p-4">
            <div className="flex items-center gap-2 mb-3">
              <div className="w-8 h-8 bg-blue-50 rounded-lg flex items-center justify-center text-lg">O</div>
              <div>
                <p className="text-sm font-semibold text-slate-800">Microsoft Outlook</p>
                {profile.outlook_calendar_sync && (
                  <span className="text-[10px] px-1.5 py-0.5 bg-green-100 text-green-700 rounded-full font-medium">Connected</span>
                )}
              </div>
            </div>
            {profile.outlook_calendar_sync ? (
              <div className="flex gap-2">
                <button onClick={() => handleSync('outlook')} disabled={syncing === 'outlook'}
                  className="flex-1 px-2 py-1.5 text-xs bg-blue-50 text-blue-700 rounded-lg hover:bg-blue-100 disabled:opacity-50">
                  {syncing === 'outlook' ? <Loader2 className="w-3 h-3 animate-spin inline" /> : <RefreshCw className="w-3 h-3 inline" />} Sync
                </button>
                <button onClick={() => handleDisconnect('outlook')}
                  className="px-2 py-1.5 text-xs bg-red-50 text-red-700 rounded-lg hover:bg-red-100">Disconnect</button>
              </div>
            ) : (
              <button onClick={handleOutlookConnect}
                className="w-full px-3 py-1.5 text-xs bg-blue-50 text-blue-700 rounded-lg hover:bg-blue-100 font-medium">
                Connect Outlook
              </button>
            )}
          </div>

          {/* Apple iCal */}
          <div className="bg-white rounded-xl border border-slate-200 p-4">
            <div className="flex items-center gap-2 mb-3">
              <div className="w-8 h-8 bg-slate-100 rounded-lg flex items-center justify-center text-lg">A</div>
              <div>
                <p className="text-sm font-semibold text-slate-800">Apple iCal</p>
                {profile.caldav_sync && (
                  <span className="text-[10px] px-1.5 py-0.5 bg-green-100 text-green-700 rounded-full font-medium">Connected</span>
                )}
              </div>
            </div>
            {profile.caldav_sync ? (
              <div className="flex gap-2">
                <button onClick={() => handleSync('caldav')} disabled={syncing === 'caldav'}
                  className="flex-1 px-2 py-1.5 text-xs bg-slate-50 text-slate-700 rounded-lg hover:bg-slate-100 disabled:opacity-50">
                  {syncing === 'caldav' ? <Loader2 className="w-3 h-3 animate-spin inline" /> : <RefreshCw className="w-3 h-3 inline" />} Sync
                </button>
                <button onClick={() => handleDisconnect('caldav')}
                  className="px-2 py-1.5 text-xs bg-red-50 text-red-700 rounded-lg hover:bg-red-100">Disconnect</button>
              </div>
            ) : (
              <button onClick={() => setShowCaldavModal(true)}
                className="w-full px-3 py-1.5 text-xs bg-slate-50 text-slate-700 rounded-lg hover:bg-slate-100 font-medium">
                Connect Apple Calendar
              </button>
            )}
          </div>

          {/* Universal iCal Feed */}
          <div className="bg-white rounded-xl border border-slate-200 p-4">
            <div className="flex items-center gap-2 mb-3">
              <div className="w-8 h-8 bg-purple-50 rounded-lg flex items-center justify-center text-lg">iCal</div>
              <p className="text-sm font-semibold text-slate-800">iCal Feed</p>
            </div>
            {profile.ical_feed_token && (
              <div className="space-y-2">
                <div className="flex items-center gap-1">
                  <input
                    readOnly
                    value={calApi.getIcalFeedUrl(profile.ical_feed_token)}
                    className="flex-1 text-[10px] bg-slate-50 border border-slate-200 rounded px-2 py-1 text-slate-600 truncate"
                  />
                  <button onClick={copyFeedUrl}
                    className="p-1 bg-slate-100 rounded hover:bg-slate-200">
                    {copiedFeed ? <Check className="w-3.5 h-3.5 text-green-600" /> : <Copy className="w-3.5 h-3.5 text-slate-600" />}
                  </button>
                </div>
                <p className="text-[10px] text-slate-500">Subscribe once, always stays current</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── View Toggles + Navigation ────────────────────────── */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2">
        <div className="flex bg-slate-100 rounded-lg p-0.5">
          {(['month', 'week', 'tasks'] as ViewMode[]).map((v) => (
            <button
              key={v}
              onClick={() => setView(v)}
              className={cn(
                'px-3 md:px-4 py-1.5 text-sm font-medium rounded-md transition-colors min-h-[36px]',
                view === v ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'
              )}
            >
              {v === 'month' ? 'Month' : v === 'week' ? 'Week' : 'Tasks'}
            </button>
          ))}
        </div>

        {view !== 'tasks' && (
          <div className="flex items-center gap-2 md:gap-3">
            <button onClick={() => view === 'month' ? navigate_month(-1) : navigate_week(-1)}
              className="p-1.5 rounded-lg hover:bg-slate-100 min-w-[36px] min-h-[36px] flex items-center justify-center">
              <ChevronLeft className="w-4 h-4" />
            </button>
            <button onClick={goToday}
              className="px-3 py-1 text-sm font-medium bg-slate-100 rounded-lg hover:bg-slate-200 min-h-[36px]">
              Today
            </button>
            <button onClick={() => view === 'month' ? navigate_month(1) : navigate_week(1)}
              className="p-1.5 rounded-lg hover:bg-slate-100 min-w-[36px] min-h-[36px] flex items-center justify-center">
              <ChevronRight className="w-4 h-4" />
            </button>
            <h2 className="text-sm md:text-lg font-semibold text-slate-800">
              <span className="md:hidden">{MONTHS[currentDate.getMonth()].slice(0, 3)} {currentDate.getFullYear()}</span>
              <span className="hidden md:inline">{MONTHS[currentDate.getMonth()]} {currentDate.getFullYear()}</span>
            </h2>
          </div>
        )}
      </div>

      {/* ── Month View ───────────────────────────────────────── */}
      {view === 'month' && (
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          <div className="grid grid-cols-7 border-b border-slate-200">
            {DAYS.map((d) => (
              <div key={d} className="px-1 md:px-2 py-1.5 md:py-2 text-center text-[10px] md:text-xs font-semibold text-slate-500 uppercase">
                <span className="md:hidden">{d.charAt(0)}</span>
                <span className="hidden md:inline">{d}</span>
              </div>
            ))}
          </div>
          <div className="grid grid-cols-7">
            {monthGrid.map((cell, i) => {
              const dayEvents = getEventsForDate(cell.date)
              const isSelected = selectedDay?.toDateString() === cell.date.toDateString()
              return (
                <div
                  key={i}
                  onClick={() => setSelectedDay(cell.date)}
                  className={cn(
                    'min-h-[48px] md:min-h-[80px] border-b border-r border-slate-100 p-0.5 md:p-1 cursor-pointer hover:bg-slate-50 transition-colors',
                    !cell.isCurrentMonth && 'bg-slate-50/50',
                    isSelected && 'ring-2 ring-primary-500 ring-inset',
                  )}
                >
                  <span className={cn(
                    'inline-flex items-center justify-center w-5 h-5 md:w-6 md:h-6 text-[10px] md:text-xs font-medium rounded-full',
                    isToday(cell.date) ? 'bg-primary-600 text-white' : cell.isCurrentMonth ? 'text-slate-700' : 'text-slate-400',
                  )}>
                    {cell.date.getDate()}
                  </span>
                  {/* Mobile: dots only */}
                  {dayEvents.length > 0 && (
                    <div className="flex gap-0.5 mt-0.5 px-0.5 md:hidden flex-wrap">
                      {dayEvents.slice(0, 3).map((ev) => (
                        <div key={ev.id} className={cn('w-1.5 h-1.5 rounded-full', EVENT_COLORS[ev.event_type] || 'bg-blue-500')} />
                      ))}
                      {dayEvents.length > 3 && <div className="w-1.5 h-1.5 rounded-full bg-slate-300" />}
                    </div>
                  )}
                  {/* Desktop: full event labels */}
                  <div className="mt-0.5 space-y-0.5 hidden md:block">
                    {dayEvents.slice(0, 3).map((ev) => (
                      <div
                        key={ev.id}
                        onClick={(e) => {
                          if (ev.deal_id || ev.contact_id) {
                            e.stopPropagation()
                            if (ev.deal_id) navigate(`/pipeline/${ev.deal_id}`)
                            else if (ev.contact_id) navigate(`/contacts/${ev.contact_id}`)
                          }
                        }}
                        className={cn(
                          'text-[10px] px-1 py-0.5 rounded text-white truncate',
                          EVENT_COLORS[ev.event_type] || 'bg-blue-500',
                          (ev.deal_id || ev.contact_id) && 'hover:opacity-80 cursor-pointer',
                        )}
                      >
                        {ev.title}
                      </div>
                    ))}
                    {dayEvents.length > 3 && (
                      <p className="text-[10px] text-slate-500 pl-1">+{dayEvents.length - 3} more</p>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* ── Day detail panel ──────────────────────────────────── */}
      {view === 'month' && selectedDay && (
        <div className="bg-white rounded-xl border border-slate-200 p-4 md:p-5">
          <div className="flex items-center justify-between mb-3 gap-2">
            <h3 className="text-sm md:text-base font-semibold text-slate-800 truncate">
              {selectedDay.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
            </h3>
            <div className="flex gap-1.5 shrink-0">
              <button onClick={() => { setTaskForm({ ...taskForm, due_date: selectedDay.toISOString().split('T')[0] }); setShowTaskModal(true) }}
                className="px-2 py-1 text-xs bg-primary-50 text-primary-700 rounded-lg hover:bg-primary-100 min-h-[32px]">
                + Task
              </button>
              <button onClick={() => { setEventForm({ ...eventForm, start_datetime: selectedDay.toISOString().slice(0, 16), end_datetime: new Date(selectedDay.getTime() + 3600000).toISOString().slice(0, 16) }); setShowEventModal(true) }}
                className="px-2 py-1 text-xs bg-green-50 text-green-700 rounded-lg hover:bg-green-100 min-h-[32px]">
                + Event
              </button>
            </div>
          </div>
          {getEventsForDate(selectedDay).length === 0 ? (
            <p className="text-sm text-slate-400">No events on this day</p>
          ) : (
            <div className="space-y-2">
              {getEventsForDate(selectedDay).map((ev) => (
                <button
                  key={ev.id}
                  onClick={() => {
                    if (ev.deal_id) navigate(`/pipeline/${ev.deal_id}`)
                    else if (ev.contact_id) navigate(`/contacts/${ev.contact_id}`)
                  }}
                  className={cn(
                    'flex items-center gap-3 p-2 bg-slate-50 rounded-lg w-full text-left',
                    (ev.deal_id || ev.contact_id) && 'hover:bg-slate-100 cursor-pointer group',
                  )}
                >
                  <div className={cn('w-2 h-2 rounded-full shrink-0', EVENT_COLORS[ev.event_type] || 'bg-blue-500')} />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-slate-800 truncate group-hover:text-primary-700">{ev.title}</p>
                    <div className="flex items-center gap-2 mt-0.5">
                      {ev.start_datetime && (
                        <span className="text-xs text-slate-500">
                          {new Date(ev.start_datetime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          {ev.location && ` \u00b7 ${ev.location}`}
                        </span>
                      )}
                      {ev.deal_id && (
                        <span className="text-[10px] text-primary-600">Deal</span>
                      )}
                      {ev.contact_id && !ev.deal_id && (
                        <span className="text-[10px] text-primary-600">Contact</span>
                      )}
                    </div>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── Week View ────────────────────────────────────────── */}
      {view === 'week' && (
        <div className="bg-white rounded-xl border border-slate-200 overflow-x-auto">
          <div className="min-w-[500px]">
          <div className="grid grid-cols-7 border-b border-slate-200">
            {weekDates.map((d, i) => (
              <div key={i} className={cn('p-1.5 md:p-2 text-center border-r border-slate-100 last:border-r-0', isToday(d) && 'bg-primary-50')}>
                <p className="text-[10px] md:text-xs text-slate-500">{DAYS[d.getDay()]}</p>
                <p className={cn('text-base md:text-lg font-semibold', isToday(d) ? 'text-primary-600' : 'text-slate-800')}>
                  {d.getDate()}
                </p>
              </div>
            ))}
          </div>
          {/* Time slots 7am-8pm */}
          {Array.from({ length: 14 }, (_, i) => i + 7).map((hour) => (
            <div key={hour} className="grid grid-cols-7 border-b border-slate-50">
              {weekDates.map((d, di) => {
                const slotEvents = getEventsForDate(d).filter((e) => {
                  if (!e.start_datetime) return false
                  return new Date(e.start_datetime).getHours() === hour
                })
                return (
                  <div key={di} className="min-h-[40px] border-r border-slate-50 last:border-r-0 p-0.5 relative">
                    {di === 0 && (
                      <span className="absolute -left-0 top-0 text-[10px] text-slate-400">{hour > 12 ? hour - 12 : hour}{hour >= 12 ? 'p' : 'a'}</span>
                    )}
                    {slotEvents.map((ev) => (
                      <div key={ev.id}
                        onClick={() => {
                          if (ev.deal_id) navigate(`/pipeline/${ev.deal_id}`)
                          else if (ev.contact_id) navigate(`/contacts/${ev.contact_id}`)
                        }}
                        className={cn('text-[10px] px-1 py-0.5 rounded text-white truncate mb-0.5', EVENT_COLORS[ev.event_type] || 'bg-blue-500',
                          (ev.deal_id || ev.contact_id) && 'hover:opacity-80 cursor-pointer',
                        )}>
                        {ev.title}
                      </div>
                    ))}
                  </div>
                )
              })}
            </div>
          ))}
          </div>
        </div>
      )}

      {/* ── Tasks View ───────────────────────────────────────── */}
      {view === 'tasks' && (
        <div className="space-y-4">
          {/* Filter bar */}
          <div className="flex items-center justify-between">
            <p className="text-sm text-slate-600">{allTasks.length} tasks</p>
            <button onClick={() => setShowTaskModal(true)}
              className="px-3 py-1.5 text-xs font-medium bg-primary-600 text-white rounded-lg hover:bg-primary-700">
              <Plus className="w-3.5 h-3.5 inline mr-1" />Add Task
            </button>
          </div>

          {/* Overdue */}
          {(tasks.overdue || []).length > 0 && (
            <TaskSection title="OVERDUE" color="text-red-600 bg-red-50" tasks={tasks.overdue || []}
              onComplete={handleCompleteTask} onDelete={handleDeleteTask} navigate={navigate} />
          )}

          {/* Today */}
          {(tasks.today || []).length > 0 && (
            <TaskSection title="TODAY" color="text-blue-600 bg-blue-50" tasks={tasks.today || []}
              onComplete={handleCompleteTask} onDelete={handleDeleteTask} navigate={navigate} />
          )}

          {/* This Week */}
          {(tasks.this_week || []).length > 0 && (
            <TaskSection title="THIS WEEK" color="text-yellow-600 bg-yellow-50" tasks={tasks.this_week || []}
              onComplete={handleCompleteTask} onDelete={handleDeleteTask} navigate={navigate} />
          )}

          {/* Upcoming */}
          {(tasks.upcoming || []).length > 0 && (
            <TaskSection title="UPCOMING" color="text-slate-600 bg-slate-50" tasks={tasks.upcoming || []}
              onComplete={handleCompleteTask} onDelete={handleDeleteTask} navigate={navigate} />
          )}

          {/* No date */}
          {(tasks.no_date || []).length > 0 && (
            <TaskSection title="NO DATE" color="text-slate-500 bg-slate-50" tasks={tasks.no_date || []}
              onComplete={handleCompleteTask} onDelete={handleDeleteTask} navigate={navigate} />
          )}

          {allTasks.length === 0 && (
            <div className="text-center py-12">
              <p className="text-lg text-slate-400 mb-2">No tasks yet</p>
              <button onClick={() => setShowTaskModal(true)}
                className="px-4 py-2 bg-primary-600 text-white text-sm rounded-lg hover:bg-primary-700">
                Create Your First Task
              </button>
            </div>
          )}
        </div>
      )}

      {/* ── Task Creation Modal ──────────────────────────────── */}
      {showTaskModal && (
        <Modal onClose={() => setShowTaskModal(false)} title="New Task">
          <div className="space-y-3">
            <input placeholder="Title" value={taskForm.title}
              onChange={(e) => setTaskForm({ ...taskForm, title: e.target.value })}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-primary-500 focus:outline-none" />
            <textarea placeholder="Description" value={taskForm.description}
              onChange={(e) => setTaskForm({ ...taskForm, description: e.target.value })} rows={2}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm resize-none focus:ring-2 focus:ring-primary-500 focus:outline-none" />
            <div className="flex gap-2">
              <label className="text-xs text-slate-600">Priority</label>
              <div className="flex gap-1">
                {['low', 'medium', 'high', 'urgent'].map((p) => (
                  <button key={p} onClick={() => setTaskForm({ ...taskForm, priority: p })}
                    className={cn('px-2 py-1 text-xs rounded-full capitalize', taskForm.priority === p ? 'bg-primary-600 text-white' : 'bg-slate-100 text-slate-600')}>
                    {p}
                  </button>
                ))}
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-xs text-slate-600 block mb-1">Due Date</label>
                <input type="date" value={taskForm.due_date}
                  onChange={(e) => setTaskForm({ ...taskForm, due_date: e.target.value })}
                  className="w-full px-2 py-1.5 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-primary-500 focus:outline-none" />
              </div>
              <div>
                <label className="text-xs text-slate-600 block mb-1">Due Time</label>
                <input type="time" value={taskForm.due_time}
                  onChange={(e) => setTaskForm({ ...taskForm, due_time: e.target.value })}
                  className="w-full px-2 py-1.5 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-primary-500 focus:outline-none" />
              </div>
            </div>
            <div>
              <label className="text-xs text-slate-600 block mb-1">Reminder</label>
              <select value={taskForm.reminder_minutes}
                onChange={(e) => setTaskForm({ ...taskForm, reminder_minutes: Number(e.target.value) })}
                className="w-full px-2 py-1.5 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-primary-500 focus:outline-none">
                <option value={0}>No reminder</option>
                <option value={15}>15 minutes</option>
                <option value={30}>30 minutes</option>
                <option value={60}>1 hour</option>
                <option value={1440}>1 day</option>
              </select>
            </div>
            <label className="flex items-center gap-2 text-sm text-slate-700">
              <input type="checkbox" checked={taskForm.is_recurring}
                onChange={(e) => setTaskForm({ ...taskForm, is_recurring: e.target.checked })}
                className="rounded border-slate-300" />
              Recurring
            </label>
            {taskForm.is_recurring && (
              <select value={taskForm.recurrence_rule}
                onChange={(e) => setTaskForm({ ...taskForm, recurrence_rule: e.target.value })}
                className="w-full px-2 py-1.5 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-primary-500 focus:outline-none">
                <option value="">Select frequency</option>
                <option value="daily">Daily</option>
                <option value="weekly">Weekly</option>
                <option value="monthly">Monthly</option>
              </select>
            )}
            <div className="flex justify-end gap-2 pt-2">
              <button onClick={() => setShowTaskModal(false)}
                className="px-4 py-2 text-sm text-slate-600 bg-slate-100 rounded-lg hover:bg-slate-200">Cancel</button>
              <button onClick={handleCreateTask} disabled={!taskForm.title}
                className="px-4 py-2 text-sm text-white bg-primary-600 rounded-lg hover:bg-primary-700 disabled:opacity-50">
                Create Task
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* ── Event Creation Modal ─────────────────────────────── */}
      {showEventModal && (
        <Modal onClose={() => setShowEventModal(false)} title="New Event">
          <div className="space-y-3">
            <input placeholder="Title" value={eventForm.title}
              onChange={(e) => setEventForm({ ...eventForm, title: e.target.value })}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-primary-500 focus:outline-none" />
            <div>
              <label className="text-xs text-slate-600 block mb-1">Event Type</label>
              <select value={eventForm.event_type}
                onChange={(e) => setEventForm({ ...eventForm, event_type: e.target.value })}
                className="w-full px-2 py-1.5 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-primary-500 focus:outline-none">
                <option value="appointment">Appointment</option>
                <option value="closing">Closing</option>
                <option value="follow_up">Follow Up</option>
                <option value="callback">Callback</option>
                <option value="reminder">Reminder</option>
              </select>
            </div>
            <label className="flex items-center gap-2 text-sm text-slate-700">
              <input type="checkbox" checked={eventForm.all_day}
                onChange={(e) => setEventForm({ ...eventForm, all_day: e.target.checked })}
                className="rounded border-slate-300" />
              All Day
            </label>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-xs text-slate-600 block mb-1">Start</label>
                <input type="datetime-local" value={eventForm.start_datetime}
                  onChange={(e) => setEventForm({ ...eventForm, start_datetime: e.target.value })}
                  className="w-full px-2 py-1.5 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-primary-500 focus:outline-none" />
              </div>
              <div>
                <label className="text-xs text-slate-600 block mb-1">End</label>
                <input type="datetime-local" value={eventForm.end_datetime}
                  onChange={(e) => setEventForm({ ...eventForm, end_datetime: e.target.value })}
                  className="w-full px-2 py-1.5 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-primary-500 focus:outline-none" />
              </div>
            </div>
            <input placeholder="Location" value={eventForm.location}
              onChange={(e) => setEventForm({ ...eventForm, location: e.target.value })}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-primary-500 focus:outline-none" />
            <textarea placeholder="Description" value={eventForm.description}
              onChange={(e) => setEventForm({ ...eventForm, description: e.target.value })} rows={2}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm resize-none focus:ring-2 focus:ring-primary-500 focus:outline-none" />
            <div>
              <label className="text-xs text-slate-600 block mb-1">Reminder</label>
              <select value={eventForm.reminder_minutes}
                onChange={(e) => setEventForm({ ...eventForm, reminder_minutes: Number(e.target.value) })}
                className="w-full px-2 py-1.5 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-primary-500 focus:outline-none">
                <option value={0}>No reminder</option>
                <option value={15}>15 minutes</option>
                <option value={30}>30 minutes</option>
                <option value={60}>1 hour</option>
                <option value={1440}>1 day</option>
              </select>
            </div>
            <label className="flex items-center gap-2 text-sm text-slate-700">
              <input type="checkbox" checked={eventForm.is_recurring}
                onChange={(e) => setEventForm({ ...eventForm, is_recurring: e.target.checked })}
                className="rounded border-slate-300" />
              Recurring
            </label>
            <div className="flex justify-end gap-2 pt-2">
              <button onClick={() => setShowEventModal(false)}
                className="px-4 py-2 text-sm text-slate-600 bg-slate-100 rounded-lg hover:bg-slate-200">Cancel</button>
              <button onClick={handleCreateEvent}
                disabled={!eventForm.title || !eventForm.start_datetime || !eventForm.end_datetime}
                className="px-4 py-2 text-sm text-white bg-green-600 rounded-lg hover:bg-green-700 disabled:opacity-50">
                Create Event
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* ── CalDAV Setup Modal ───────────────────────────────── */}
      {showCaldavModal && (
        <Modal onClose={() => setShowCaldavModal(false)} title="Connect Apple Calendar">
          <div className="space-y-4">
            <div className="bg-amber-50 rounded-lg p-3 text-xs text-amber-800">
              <p className="font-semibold mb-1">You'll need an app-specific password</p>
              <p>Step 1: Go to appleid.apple.com &rarr; Sign-In and Security &rarr; App-Specific Passwords</p>
              <p>Step 2: Generate a new password for "REI Hub"</p>
            </div>
            <div>
              <label className="text-xs text-slate-600 block mb-1">Apple ID Email</label>
              <input type="email" value={caldavForm.username}
                onChange={(e) => setCaldavForm({ ...caldavForm, username: e.target.value })}
                placeholder="your@icloud.com"
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-primary-500 focus:outline-none" />
            </div>
            <div>
              <label className="text-xs text-slate-600 block mb-1">App-Specific Password</label>
              <input type="password" value={caldavForm.password}
                onChange={(e) => setCaldavForm({ ...caldavForm, password: e.target.value })}
                placeholder="xxxx-xxxx-xxxx-xxxx"
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-primary-500 focus:outline-none" />
            </div>
            <div>
              <label className="text-xs text-slate-600 block mb-1">Calendar URL</label>
              <input value={caldavForm.calendar_url}
                onChange={(e) => setCaldavForm({ ...caldavForm, calendar_url: e.target.value })}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-primary-500 focus:outline-none" />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button onClick={() => setShowCaldavModal(false)}
                className="px-4 py-2 text-sm text-slate-600 bg-slate-100 rounded-lg hover:bg-slate-200">Cancel</button>
              <button onClick={handleCaldavConnect}
                disabled={!caldavForm.username || !caldavForm.password}
                className="px-4 py-2 text-sm text-white bg-primary-600 rounded-lg hover:bg-primary-700 disabled:opacity-50">
                Connect
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  )
}

// ── Sub Components ───────────────────────────────────────────

function TaskSection({
  title, color, tasks, onComplete, onDelete, navigate,
}: {
  title: string
  color: string
  tasks: TaskItem[]
  onComplete: (id: string) => void
  onDelete: (id: string) => void
  navigate: (path: string) => void
}) {
  return (
    <div>
      <div className={cn('px-3 py-1.5 rounded-t-lg text-xs font-bold uppercase tracking-wide', color)}>
        {title} ({tasks.length})
      </div>
      <div className="bg-white rounded-b-xl border border-t-0 border-slate-200 divide-y divide-slate-100">
        {tasks.map((t) => (
          <div key={t.id} className="flex items-center gap-2 md:gap-3 px-3 md:px-4 py-3">
            <button onClick={() => onComplete(t.id)}
              className="w-6 h-6 md:w-5 md:h-5 rounded-full border-2 border-slate-300 hover:border-green-500 hover:bg-green-50 flex items-center justify-center shrink-0 transition-colors">
              {t.status === 'completed' && <Check className="w-3 h-3 text-green-600" />}
            </button>
            <div className={cn('w-2 h-2 rounded-full shrink-0', PRIORITY_DOTS[t.priority] || 'bg-slate-400')} />
            <div className="flex-1 min-w-0">
              <button
                onClick={() => {
                  if (t.deal_id) navigate(`/pipeline/${t.deal_id}`)
                  else if (t.contact_id) navigate(`/contacts/${t.contact_id}`)
                }}
                className={cn(
                  'text-sm font-medium text-slate-800 truncate block text-left w-full',
                  (t.deal_id || t.contact_id) && 'hover:text-primary-700 hover:underline cursor-pointer',
                )}
              >
                {t.title}
              </button>
              <div className="flex items-center gap-2 mt-0.5">
                {t.due_date && (
                  <span className="text-[10px] text-slate-500">
                    {new Date(t.due_date).toLocaleDateString()}
                  </span>
                )}
                {t.contact_id && (
                  <button onClick={() => navigate(`/contacts/${t.contact_id}`)}
                    className="text-[10px] text-primary-600 hover:underline">Contact</button>
                )}
                {t.deal_id && (
                  <button onClick={() => navigate(`/pipeline/${t.deal_id}`)}
                    className="text-[10px] text-primary-600 hover:underline">Deal</button>
                )}
              </div>
            </div>
            <button onClick={() => onDelete(t.id)}
              className="p-1.5 text-slate-400 hover:text-red-500 transition-colors shrink-0 min-w-[32px] min-h-[32px] flex items-center justify-center">
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>
        ))}
      </div>
    </div>
  )
}

function Modal({
  onClose, title, children,
}: {
  onClose: () => void
  title: string
  children: React.ReactNode
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40"
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <div className="bg-white rounded-t-xl sm:rounded-xl shadow-xl w-full sm:max-w-lg sm:mx-4 max-h-[90vh] sm:max-h-[85vh] overflow-y-auto">
        <div className="flex items-center justify-between px-4 md:px-5 py-3 md:py-4 border-b border-slate-200 sticky top-0 bg-white z-10">
          <h2 className="text-base md:text-lg font-semibold text-slate-800">{title}</h2>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-slate-100 min-w-[36px] min-h-[36px] flex items-center justify-center">
            <X className="w-5 h-5 text-slate-500" />
          </button>
        </div>
        <div className="p-4 md:p-5">{children}</div>
      </div>
    </div>
  )
}
