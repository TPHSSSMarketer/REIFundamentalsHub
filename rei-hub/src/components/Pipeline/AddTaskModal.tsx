import { useState, useEffect, useMemo, useCallback } from 'react'
import {
  X,
  ChevronLeft,
  ChevronRight,
  Clock,
  CalendarDays,
  Loader2,
  AlertCircle,
} from 'lucide-react'
import { toast } from 'sonner'
import { createTask, createEvent, getEvents } from '@/services/calendarApi'
import { cn } from '@/utils/helpers'

// ── Types ───────────────────────────────────────────────────

interface AddTaskModalProps {
  isOpen: boolean
  onClose: () => void
  dealId?: string
  dealAddress?: string
  contactId?: string
}

interface CalEvent {
  id: string
  title: string
  start_datetime: string
  end_datetime: string
  all_day?: boolean
  event_type?: string
}

type FormType = 'task' | 'event'

// ── Helpers ─────────────────────────────────────────────────

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]

function isSameDay(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()
}

function toLocalDateStr(d: Date) {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

const EVENT_TYPE_COLORS: Record<string, string> = {
  appointment: 'bg-blue-400',
  closing: 'bg-green-400',
  follow_up: 'bg-purple-400',
  callback: 'bg-yellow-400',
  reminder: 'bg-orange-400',
  task: 'bg-slate-400',
}

// ── Component ───────────────────────────────────────────────

export default function AddTaskModal({
  isOpen,
  onClose,
  dealId,
  dealAddress,
  contactId,
}: AddTaskModalProps) {
  const today = new Date()
  const [calMonth, setCalMonth] = useState(today.getMonth())
  const [calYear, setCalYear] = useState(today.getFullYear())
  const [selectedDate, setSelectedDate] = useState(today)
  const [events, setEvents] = useState<CalEvent[]>([])
  const [eventsLoading, setEventsLoading] = useState(false)

  // Form state
  const [formType, setFormType] = useState<FormType>('task')
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [dueTime, setDueTime] = useState('09:00')
  const [endTime, setEndTime] = useState('10:00')
  const [priority, setPriority] = useState('medium')
  const [taskType, setTaskType] = useState('manual')
  const [eventType, setEventType] = useState('appointment')
  const [location, setLocation] = useState('')
  const [allDay, setAllDay] = useState(false)
  const [reminderMinutes, setReminderMinutes] = useState(30)
  const [submitting, setSubmitting] = useState(false)

  // ── Fetch events for the visible month ────────────────────

  const loadEvents = useCallback(async () => {
    setEventsLoading(true)
    try {
      const start = new Date(calYear, calMonth, 1)
      const end = new Date(calYear, calMonth + 1, 0)
      const data = await getEvents(toLocalDateStr(start), toLocalDateStr(end))
      setEvents(data?.events || [])
    } catch {
      // ignore
    } finally {
      setEventsLoading(false)
    }
  }, [calMonth, calYear])

  useEffect(() => {
    if (isOpen) loadEvents()
  }, [isOpen, loadEvents])

  // Reset form on open
  useEffect(() => {
    if (isOpen) {
      setTitle('')
      setDescription('')
      setDueTime('09:00')
      setEndTime('10:00')
      setPriority('medium')
      setTaskType('manual')
      setEventType('appointment')
      setLocation('')
      setAllDay(false)
      setReminderMinutes(30)
      setFormType('task')
      setSelectedDate(today)
      setCalMonth(today.getMonth())
      setCalYear(today.getFullYear())
    }
  }, [isOpen])

  // ── Calendar grid ─────────────────────────────────────────

  const calendarDays = useMemo(() => {
    const firstDay = new Date(calYear, calMonth, 1).getDay()
    const daysInMonth = new Date(calYear, calMonth + 1, 0).getDate()
    const daysInPrev = new Date(calYear, calMonth, 0).getDate()
    const grid: { day: number; month: number; year: number; isCurrentMonth: boolean }[] = []

    // Previous month
    for (let i = firstDay - 1; i >= 0; i--) {
      const d = daysInPrev - i
      const m = calMonth === 0 ? 11 : calMonth - 1
      const y = calMonth === 0 ? calYear - 1 : calYear
      grid.push({ day: d, month: m, year: y, isCurrentMonth: false })
    }
    // Current month
    for (let d = 1; d <= daysInMonth; d++) {
      grid.push({ day: d, month: calMonth, year: calYear, isCurrentMonth: true })
    }
    // Next month
    const remaining = 42 - grid.length
    for (let d = 1; d <= remaining; d++) {
      const m = calMonth === 11 ? 0 : calMonth + 1
      const y = calMonth === 11 ? calYear + 1 : calYear
      grid.push({ day: d, month: m, year: y, isCurrentMonth: false })
    }

    return grid
  }, [calMonth, calYear])

  function getEventsForDate(d: Date) {
    return events.filter((evt) => {
      const evtDate = new Date(evt.start_datetime)
      return isSameDay(evtDate, d)
    })
  }

  function eventsForSelected() {
    return getEventsForDate(selectedDate)
  }

  function prevMonth() {
    if (calMonth === 0) { setCalMonth(11); setCalYear(calYear - 1) }
    else setCalMonth(calMonth - 1)
  }
  function nextMonth() {
    if (calMonth === 11) { setCalMonth(0); setCalYear(calYear + 1) }
    else setCalMonth(calMonth + 1)
  }

  // ── Submit ────────────────────────────────────────────────

  async function handleSubmit() {
    if (!title.trim()) {
      toast.error('Please enter a title')
      return
    }
    setSubmitting(true)
    try {
      const dateStr = toLocalDateStr(selectedDate)

      if (formType === 'task') {
        await createTask({
          title: title.trim(),
          description: description.trim(),
          due_date: dateStr,
          due_time: dueTime,
          priority,
          task_type: taskType,
          deal_id: dealId,
          contact_id: contactId,
          reminder_minutes: reminderMinutes,
          is_recurring: false,
        })
        toast.success('Task created')
      } else {
        const startDt = allDay ? dateStr : `${dateStr}T${dueTime}:00`
        const endDt = allDay ? dateStr : `${dateStr}T${endTime}:00`
        await createEvent({
          title: title.trim(),
          description: description.trim(),
          event_type: eventType,
          start_datetime: startDt,
          end_datetime: endDt,
          all_day: allDay,
          location: location.trim(),
          deal_id: dealId,
          contact_id: contactId,
          reminder_minutes: reminderMinutes,
          is_recurring: false,
        })
        toast.success('Event created')
      }

      await loadEvents()
      // Reset form but stay open for potential follow-up
      setTitle('')
      setDescription('')
      setLocation('')
    } catch {
      toast.error('Failed to create — please try again')
    } finally {
      setSubmitting(false)
    }
  }

  // ── Render ────────────────────────────────────────────────

  if (!isOpen) return null

  const selectedEvents = eventsForSelected()

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />

      {/* Modal */}
      <div className="relative bg-white rounded-xl shadow-2xl w-full max-w-3xl max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200">
          <div>
            <h2 className="text-lg font-bold text-slate-800">Add to Calendar</h2>
            {dealAddress && (
              <p className="text-sm text-slate-500 mt-0.5">{dealAddress}</p>
            )}
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-lg hover:bg-slate-100 transition-colors"
          >
            <X className="w-5 h-5 text-slate-500" />
          </button>
        </div>

        {/* Body — Two columns */}
        <div className="flex-1 overflow-y-auto">
          <div className="grid grid-cols-1 md:grid-cols-2 divide-y md:divide-y-0 md:divide-x divide-slate-200">
            {/* LEFT — Mini Calendar */}
            <div className="p-4">
              {/* Month Nav */}
              <div className="flex items-center justify-between mb-3">
                <button onClick={prevMonth} className="p-1.5 rounded-lg hover:bg-slate-100">
                  <ChevronLeft className="w-4 h-4 text-slate-600" />
                </button>
                <span className="text-sm font-semibold text-slate-800">
                  {MONTHS[calMonth]} {calYear}
                </span>
                <button onClick={nextMonth} className="p-1.5 rounded-lg hover:bg-slate-100">
                  <ChevronRight className="w-4 h-4 text-slate-600" />
                </button>
              </div>

              {/* Day Headers */}
              <div className="grid grid-cols-7 mb-1">
                {DAYS.map((d) => (
                  <div key={d} className="text-center text-[10px] font-semibold text-slate-400 uppercase py-1">
                    {d}
                  </div>
                ))}
              </div>

              {/* Calendar Grid */}
              <div className="grid grid-cols-7 gap-px">
                {calendarDays.map((cell, i) => {
                  const cellDate = new Date(cell.year, cell.month, cell.day)
                  const isToday = isSameDay(cellDate, today)
                  const isSelected = isSameDay(cellDate, selectedDate)
                  const dayEvents = getEventsForDate(cellDate)
                  const hasEvents = dayEvents.length > 0

                  return (
                    <button
                      key={i}
                      onClick={() => setSelectedDate(cellDate)}
                      className={cn(
                        'relative h-9 text-xs font-medium rounded-lg transition-all',
                        cell.isCurrentMonth ? 'text-slate-700' : 'text-slate-300',
                        isSelected
                          ? 'bg-primary-500 text-white shadow-sm'
                          : isToday
                            ? 'bg-primary-50 text-primary-700 ring-1 ring-primary-300'
                            : 'hover:bg-slate-100'
                      )}
                    >
                      {cell.day}
                      {hasEvents && !isSelected && (
                        <span className="absolute bottom-0.5 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full bg-primary-400" />
                      )}
                    </button>
                  )
                })}
              </div>

              {/* Selected Day Events */}
              <div className="mt-4 border-t border-slate-100 pt-3">
                <p className="text-xs font-semibold text-slate-500 uppercase mb-2">
                  {selectedDate.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })}
                </p>
                {eventsLoading ? (
                  <div className="flex items-center justify-center py-4">
                    <Loader2 className="w-4 h-4 animate-spin text-primary-400" />
                  </div>
                ) : selectedEvents.length === 0 ? (
                  <p className="text-xs text-slate-400 text-center py-3">No events this day</p>
                ) : (
                  <div className="space-y-1.5 max-h-32 overflow-y-auto">
                    {selectedEvents.map((evt) => {
                      const time = evt.all_day ? 'All day' : new Date(evt.start_datetime).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
                      const dotColor = EVENT_TYPE_COLORS[evt.event_type || 'task'] || 'bg-slate-400'
                      return (
                        <div key={evt.id} className="flex items-center gap-2 px-2 py-1.5 rounded-lg bg-slate-50">
                          <span className={cn('w-2 h-2 rounded-full shrink-0', dotColor)} />
                          <span className="text-xs text-slate-700 truncate flex-1">{evt.title}</span>
                          <span className="text-[10px] text-slate-400 shrink-0">{time}</span>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            </div>

            {/* RIGHT — Form */}
            <div className="p-4 space-y-4">
              {/* Task vs Event Toggle */}
              <div className="flex bg-slate-100 rounded-lg p-0.5">
                <button
                  onClick={() => setFormType('task')}
                  className={cn(
                    'flex-1 py-2 text-xs font-semibold rounded-md transition-colors',
                    formType === 'task' ? 'bg-white text-primary-700 shadow-sm' : 'text-slate-500'
                  )}
                >
                  <CalendarDays className="w-3.5 h-3.5 inline mr-1" />
                  Task
                </button>
                <button
                  onClick={() => setFormType('event')}
                  className={cn(
                    'flex-1 py-2 text-xs font-semibold rounded-md transition-colors',
                    formType === 'event' ? 'bg-white text-primary-700 shadow-sm' : 'text-slate-500'
                  )}
                >
                  <Clock className="w-3.5 h-3.5 inline mr-1" />
                  Event
                </button>
              </div>

              {/* Title */}
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Title *</label>
                <input
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder={formType === 'task' ? 'e.g. Call seller about offer' : 'e.g. Property walkthrough'}
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-400"
                />
              </div>

              {/* Description */}
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Description</label>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  rows={2}
                  placeholder="Optional notes..."
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-400 resize-none"
                />
              </div>

              {formType === 'task' ? (
                <>
                  {/* Priority */}
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-medium text-slate-600 mb-1">Priority</label>
                      <select
                        value={priority}
                        onChange={(e) => setPriority(e.target.value)}
                        className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-400"
                      >
                        <option value="low">Low</option>
                        <option value="medium">Medium</option>
                        <option value="high">High</option>
                        <option value="urgent">Urgent</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-600 mb-1">Type</label>
                      <select
                        value={taskType}
                        onChange={(e) => setTaskType(e.target.value)}
                        className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-400"
                      >
                        <option value="manual">General</option>
                        <option value="call">Call</option>
                        <option value="follow_up">Follow Up</option>
                        <option value="inspection">Inspection</option>
                        <option value="document">Document</option>
                        <option value="review">Review</option>
                        <option value="closing">Closing</option>
                        <option value="appointment">Appointment</option>
                      </select>
                    </div>
                  </div>

                  {/* Time */}
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-medium text-slate-600 mb-1">Due Time</label>
                      <input
                        type="time"
                        value={dueTime}
                        onChange={(e) => setDueTime(e.target.value)}
                        className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-400"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-600 mb-1">Reminder</label>
                      <select
                        value={reminderMinutes}
                        onChange={(e) => setReminderMinutes(Number(e.target.value))}
                        className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-400"
                      >
                        <option value={0}>None</option>
                        <option value={15}>15 min before</option>
                        <option value={30}>30 min before</option>
                        <option value={60}>1 hour before</option>
                        <option value={1440}>1 day before</option>
                      </select>
                    </div>
                  </div>
                </>
              ) : (
                <>
                  {/* Event Type */}
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-medium text-slate-600 mb-1">Event Type</label>
                      <select
                        value={eventType}
                        onChange={(e) => setEventType(e.target.value)}
                        className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-400"
                      >
                        <option value="appointment">Appointment</option>
                        <option value="closing">Closing</option>
                        <option value="follow_up">Follow Up</option>
                        <option value="callback">Callback</option>
                        <option value="reminder">Reminder</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-600 mb-1">Reminder</label>
                      <select
                        value={reminderMinutes}
                        onChange={(e) => setReminderMinutes(Number(e.target.value))}
                        className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-400"
                      >
                        <option value={0}>None</option>
                        <option value={15}>15 min before</option>
                        <option value={30}>30 min before</option>
                        <option value={60}>1 hour before</option>
                        <option value={1440}>1 day before</option>
                      </select>
                    </div>
                  </div>

                  {/* All Day Toggle */}
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={allDay}
                      onChange={(e) => setAllDay(e.target.checked)}
                      className="w-4 h-4 rounded border-slate-300 text-primary-500 focus:ring-primary-400"
                    />
                    <span className="text-xs font-medium text-slate-600">All day event</span>
                  </label>

                  {/* Times */}
                  {!allDay && (
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs font-medium text-slate-600 mb-1">Start Time</label>
                        <input
                          type="time"
                          value={dueTime}
                          onChange={(e) => setDueTime(e.target.value)}
                          className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-400"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-slate-600 mb-1">End Time</label>
                        <input
                          type="time"
                          value={endTime}
                          onChange={(e) => setEndTime(e.target.value)}
                          className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-400"
                        />
                      </div>
                    </div>
                  )}

                  {/* Location */}
                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1">Location</label>
                    <input
                      type="text"
                      value={location}
                      onChange={(e) => setLocation(e.target.value)}
                      placeholder={dealAddress || 'e.g. 123 Main St'}
                      className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-400"
                    />
                  </div>
                </>
              )}

              {/* Info note */}
              <div className="flex items-start gap-2 p-2.5 bg-blue-50 rounded-lg">
                <AlertCircle className="w-3.5 h-3.5 text-blue-500 shrink-0 mt-0.5" />
                <p className="text-[11px] text-blue-600">
                  {formType === 'task'
                    ? 'Tasks sync to your connected calendars (Google, Outlook, iCal).'
                    : 'Events sync to your connected calendars automatically.'}
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 px-5 py-3 border-t border-slate-200 bg-slate-50">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-slate-600 hover:text-slate-800 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={submitting || !title.trim()}
            className={cn(
              'px-5 py-2 text-sm font-semibold rounded-lg transition-colors',
              submitting || !title.trim()
                ? 'bg-slate-200 text-slate-400 cursor-not-allowed'
                : 'bg-primary-500 text-white hover:bg-primary-600 shadow-sm'
            )}
          >
            {submitting ? (
              <Loader2 className="w-4 h-4 animate-spin inline mr-1.5" />
            ) : null}
            {formType === 'task' ? 'Create Task' : 'Create Event'}
          </button>
        </div>
      </div>
    </div>
  )
}
