import { useState, useMemo, useEffect } from 'react'
import {
  CalendarCheck,
  ChevronLeft,
  ChevronRight,
  Clock,
  Plus,
  X,
  User,
  MapPin,
  Phone,
  Trash2,
  RefreshCw,
  Link2,
  Unlink,
  Loader2,
} from 'lucide-react'
import { toast } from 'sonner'
import { useContacts } from '@/hooks/useApi'
import { useGoogleCalendar } from '@/hooks/useGoogleCalendar'
import type { GoogleCalendarEvent } from '@/services/google-calendar'

interface TimeSlot {
  id: string
  day: number // 0-6 (Sun-Sat)
  startTime: string // "09:00"
  endTime: string // "09:30"
}

interface Appointment {
  id: string
  contactName: string
  contactPhone: string
  date: string // ISO date string
  startTime: string
  endTime: string
  type: 'phone_call' | 'property_visit' | 'meeting' | 'closing'
  notes: string
}

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
const SHORT_DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

const APPOINTMENT_TYPES = [
  { value: 'phone_call', label: 'Phone Call', color: 'bg-primary-100 text-primary-700 border-primary-200' },
  { value: 'property_visit', label: 'Property Visit', color: 'bg-emerald-100 text-emerald-700 border-emerald-200' },
  { value: 'meeting', label: 'Meeting', color: 'bg-purple-100 text-purple-700 border-purple-200' },
  { value: 'closing', label: 'Closing', color: 'bg-accent-100 text-accent-700 border-accent-200' },
]

const TIME_OPTIONS = Array.from({ length: 28 }, (_, i) => {
  const hour = Math.floor(i / 2) + 7 // Start at 7 AM
  const minute = i % 2 === 0 ? '00' : '30'
  const h = hour > 12 ? hour - 12 : hour
  const ampm = hour >= 12 ? 'PM' : 'AM'
  return { value: `${hour.toString().padStart(2, '0')}:${minute}`, label: `${h}:${minute} ${ampm}` }
})

// Default availability: Mon-Fri 9AM-5PM
const defaultAvailability: TimeSlot[] = [1, 2, 3, 4, 5].map((day) => ({
  id: `default-${day}`,
  day,
  startTime: '09:00',
  endTime: '17:00',
}))

// Sample appointments
const sampleAppointments: Appointment[] = [
  {
    id: '1',
    contactName: 'John Smith',
    contactPhone: '(555) 123-4567',
    date: new Date().toISOString().split('T')[0],
    startTime: '10:00',
    endTime: '10:30',
    type: 'phone_call',
    notes: 'Follow up on 123 Main St property',
  },
  {
    id: '2',
    contactName: 'Sarah Johnson',
    contactPhone: '(555) 987-6543',
    date: new Date().toISOString().split('T')[0],
    startTime: '14:00',
    endTime: '15:00',
    type: 'property_visit',
    notes: 'Walkthrough at 456 Oak Ave',
  },
  {
    id: '3',
    contactName: 'Mike Williams',
    contactPhone: '(555) 555-0199',
    date: new Date(Date.now() + 86400000).toISOString().split('T')[0],
    startTime: '11:00',
    endTime: '11:30',
    type: 'meeting',
    notes: 'Discuss creative financing options',
  },
  {
    id: '4',
    contactName: 'Lisa Chen',
    contactPhone: '(555) 444-8822',
    date: new Date(Date.now() + 2 * 86400000).toISOString().split('T')[0],
    startTime: '09:00',
    endTime: '10:00',
    type: 'closing',
    notes: 'Title company closing - 789 Elm St',
  },
]

function getWeekDates(date: Date): Date[] {
  const start = new Date(date)
  start.setDate(start.getDate() - start.getDay())
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(start)
    d.setDate(d.getDate() + i)
    return d
  })
}

function formatDate(date: Date): string {
  return date.toISOString().split('T')[0]
}

function formatTimeLabel(time: string): string {
  const [h, m] = time.split(':').map(Number)
  const hour = h > 12 ? h - 12 : h
  const ampm = h >= 12 ? 'PM' : 'AM'
  return `${hour}:${m.toString().padStart(2, '0')} ${ampm}`
}

export default function Scheduler() {
  const [currentDate, setCurrentDate] = useState(new Date())
  const [availability, setAvailability] = useState<TimeSlot[]>(defaultAvailability)
  const [appointments, setAppointments] = useState<Appointment[]>(sampleAppointments)
  const [showNewAppointment, setShowNewAppointment] = useState(false)
  const [activeView, setActiveView] = useState<'week' | 'availability'>('week')
  const [syncingToGoogle, setSyncingToGoogle] = useState(false)

  // Google Calendar integration
  const gcal = useGoogleCalendar()
  const [googleEvents, setGoogleEvents] = useState<GoogleCalendarEvent[]>([])

  // New appointment form state
  const [newAppt, setNewAppt] = useState({
    contactName: '',
    contactPhone: '',
    date: formatDate(new Date()),
    startTime: '09:00',
    endTime: '09:30',
    type: 'phone_call' as Appointment['type'],
    notes: '',
    syncToGoogle: false,
  })

  const weekDates = useMemo(() => getWeekDates(currentDate), [currentDate])

  // Fetch Google Calendar events when authorized and week changes
  useEffect(() => {
    if (gcal.isAuthorized && weekDates.length > 0) {
      const timeMin = new Date(weekDates[0]).toISOString()
      const endDate = new Date(weekDates[6])
      endDate.setDate(endDate.getDate() + 1)
      const timeMax = endDate.toISOString()
      gcal.fetchEvents(timeMin, timeMax).then((events) => {
        if (events) setGoogleEvents(events)
      })
    }
  }, [gcal.isAuthorized, weekDates[0]?.toISOString()])

  const navigateWeek = (direction: number) => {
    const newDate = new Date(currentDate)
    newDate.setDate(newDate.getDate() + direction * 7)
    setCurrentDate(newDate)
  }

  const goToToday = () => setCurrentDate(new Date())

  const getAppointmentsForDate = (date: string) =>
    appointments
      .filter((a) => a.date === date)
      .sort((a, b) => a.startTime.localeCompare(b.startTime))

  const handleCreateAppointment = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newAppt.contactName.trim()) {
      toast.error('Contact name is required')
      return
    }

    const appointment: Appointment = {
      id: Date.now().toString(),
      ...newAppt,
    }

    setAppointments((prev) => [...prev, appointment])

    // Sync to Google Calendar if requested
    if (newAppt.syncToGoogle && gcal.isAuthorized) {
      setSyncingToGoogle(true)
      try {
        const typeLabel = APPOINTMENT_TYPES.find((t) => t.value === newAppt.type)?.label || ''
        await gcal.createEvent({
          summary: `${typeLabel}: ${newAppt.contactName}`,
          description: newAppt.notes,
          startDateTime: `${newAppt.date}T${newAppt.startTime}:00`,
          endDateTime: `${newAppt.date}T${newAppt.endTime}:00`,
        })
        toast.success('Appointment scheduled and synced to Google Calendar!')
      } catch {
        toast.error('Scheduled locally but failed to sync to Google Calendar')
      } finally {
        setSyncingToGoogle(false)
      }
    } else {
      toast.success('Appointment scheduled!')
    }

    setShowNewAppointment(false)
    setNewAppt({
      contactName: '',
      contactPhone: '',
      date: formatDate(new Date()),
      startTime: '09:00',
      endTime: '09:30',
      type: 'phone_call',
      notes: '',
      syncToGoogle: false,
    })
  }

  const deleteAppointment = (id: string) => {
    setAppointments((prev) => prev.filter((a) => a.id !== id))
    toast.success('Appointment removed')
  }

  const toggleDayAvailability = (day: number) => {
    const exists = availability.find((a) => a.day === day)
    if (exists) {
      setAvailability((prev) => prev.filter((a) => a.day !== day))
    } else {
      setAvailability((prev) => [
        ...prev,
        { id: `avail-${day}`, day, startTime: '09:00', endTime: '17:00' },
      ])
    }
  }

  const updateAvailabilityTime = (day: number, field: 'startTime' | 'endTime', value: string) => {
    setAvailability((prev) =>
      prev.map((a) => (a.day === day ? { ...a, [field]: value } : a))
    )
  }

  const upcomingAppointments = appointments
    .filter((a) => a.date >= formatDate(new Date()))
    .sort((a, b) => a.date.localeCompare(b.date) || a.startTime.localeCompare(b.startTime))
    .slice(0, 5)

  const todayStr = formatDate(new Date())

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Smart Scheduler</h1>
          <p className="text-slate-600">
            Manage your availability and let leads book directly into your calendar
          </p>
        </div>
        <button
          onClick={() => setShowNewAppointment(true)}
          className="flex items-center gap-2 px-4 py-2.5 bg-primary-800 text-white rounded-lg hover:bg-primary-700 transition-colors"
        >
          <Plus className="w-4 h-4" />
          New Appointment
        </button>
      </div>

      {/* View Toggle + Navigation */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <button
            onClick={() => setActiveView('week')}
            className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors ${
              activeView === 'week'
                ? 'bg-primary-800 text-white'
                : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'
            }`}
          >
            Week View
          </button>
          <button
            onClick={() => setActiveView('availability')}
            className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors ${
              activeView === 'availability'
                ? 'bg-primary-800 text-white'
                : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'
            }`}
          >
            Set Availability
          </button>
        </div>

        {activeView === 'week' && (
          <div className="flex items-center gap-3">
            <button
              onClick={goToToday}
              className="px-3 py-1.5 text-sm bg-white border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors text-slate-600"
            >
              Today
            </button>
            <button
              onClick={() => navigateWeek(-1)}
              className="p-1.5 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors"
            >
              <ChevronLeft className="w-4 h-4 text-slate-600" />
            </button>
            <span className="text-sm font-medium text-slate-800 min-w-[200px] text-center">
              {weekDates[0].toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} –{' '}
              {weekDates[6].toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
            </span>
            <button
              onClick={() => navigateWeek(1)}
              className="p-1.5 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors"
            >
              <ChevronRight className="w-4 h-4 text-slate-600" />
            </button>
          </div>
        )}
      </div>

      {/* Google Calendar Integration Banner */}
      {gcal.isConfigured && (
        <div className={`p-3 rounded-lg border flex items-center justify-between ${
          gcal.isAuthorized
            ? 'bg-success-50 border-success-200'
            : 'bg-slate-50 border-slate-200'
        }`}>
          <div className="flex items-center gap-3">
            <div className={`p-2 rounded-lg ${gcal.isAuthorized ? 'bg-success-100' : 'bg-slate-100'}`}>
              <CalendarCheck className={`w-5 h-5 ${gcal.isAuthorized ? 'text-success-600' : 'text-slate-500'}`} />
            </div>
            <div>
              <p className={`text-sm font-medium ${gcal.isAuthorized ? 'text-success-800' : 'text-slate-700'}`}>
                {gcal.isAuthorized ? 'Google Calendar Connected' : 'Google Calendar'}
              </p>
              <p className={`text-xs ${gcal.isAuthorized ? 'text-success-600' : 'text-slate-500'}`}>
                {gcal.isAuthorized
                  ? 'Events are syncing with your Google Calendar'
                  : 'Connect to sync appointments with Google Calendar'}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {gcal.isAuthorized ? (
              <>
                <button
                  onClick={() => {
                    const timeMin = new Date(weekDates[0]).toISOString()
                    const endDate = new Date(weekDates[6])
                    endDate.setDate(endDate.getDate() + 1)
                    gcal.fetchEvents(timeMin, endDate.toISOString()).then((events) => {
                      if (events) setGoogleEvents(events)
                      toast.success(`Synced ${events?.length || 0} events from Google Calendar`)
                    })
                  }}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-white border border-success-200 text-success-700 rounded-lg hover:bg-success-50 transition-colors"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${gcal.isLoading ? 'animate-spin' : ''}`} />
                  Sync
                </button>
                <button
                  onClick={() => {
                    gcal.disconnect()
                    setGoogleEvents([])
                    toast.success('Google Calendar disconnected')
                  }}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-white border border-slate-200 text-slate-600 rounded-lg hover:bg-slate-50 transition-colors"
                >
                  <Unlink className="w-3.5 h-3.5" />
                  Disconnect
                </button>
              </>
            ) : (
              <button
                onClick={() => gcal.authorize()}
                className="flex items-center gap-1.5 px-4 py-1.5 text-sm bg-primary-800 text-white rounded-lg hover:bg-primary-700 transition-colors"
              >
                <Link2 className="w-3.5 h-3.5" />
                Connect Google Calendar
              </button>
            )}
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        {/* Main Content */}
        <div className="lg:col-span-3">
          {/* Week View */}
          {activeView === 'week' && (
            <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
              <div className="grid grid-cols-7 border-b border-slate-200">
                {weekDates.map((date, i) => {
                  const dateStr = formatDate(date)
                  const isToday = dateStr === todayStr
                  const dayAppts = getAppointmentsForDate(dateStr)
                  return (
                    <div
                      key={i}
                      className={`border-r border-slate-100 last:border-r-0 ${
                        isToday ? 'bg-primary-50' : ''
                      }`}
                    >
                      <div className={`p-3 text-center border-b border-slate-100 ${isToday ? 'bg-primary-100' : 'bg-slate-50'}`}>
                        <p className="text-xs text-slate-500">{SHORT_DAYS[i]}</p>
                        <p className={`text-lg font-bold ${isToday ? 'text-primary-700' : 'text-slate-800'}`}>
                          {date.getDate()}
                        </p>
                      </div>
                      <div className="p-2 min-h-[200px] space-y-1.5">
                        {dayAppts.map((appt) => {
                          const typeInfo = APPOINTMENT_TYPES.find((t) => t.value === appt.type)
                          return (
                            <button
                              key={appt.id}
                              onClick={() => {
                                toast.info(
                                  `${appt.contactName} — ${appt.notes || appt.type}`,
                                  { duration: 3000 }
                                )
                              }}
                              className={`w-full text-left p-1.5 rounded-md border text-xs ${typeInfo?.color || 'bg-slate-100 text-slate-700 border-slate-200'}`}
                            >
                              <p className="font-medium truncate">{appt.contactName}</p>
                              <p className="opacity-75">
                                {formatTimeLabel(appt.startTime)}
                              </p>
                            </button>
                          )
                        })}
                        {/* Google Calendar events for this day */}
                        {googleEvents
                          .filter((ge) => ge.start?.dateTime?.startsWith(dateStr))
                          .map((ge) => {
                            const startTime = new Date(ge.start.dateTime).toLocaleTimeString('en-US', {
                              hour: 'numeric',
                              minute: '2-digit',
                              hour12: true,
                            })
                            return (
                              <button
                                key={ge.id}
                                onClick={() => toast.info(`Google: ${ge.summary}`, { duration: 3000 })}
                                className="w-full text-left p-1.5 rounded-md border text-xs bg-blue-50 text-blue-700 border-blue-200"
                              >
                                <p className="font-medium truncate">{ge.summary}</p>
                                <p className="opacity-75">{startTime}</p>
                              </button>
                            )
                          })}
                        {dayAppts.length === 0 && googleEvents.filter((ge) => ge.start?.dateTime?.startsWith(dateStr)).length === 0 && (
                          <p className="text-xs text-slate-300 text-center pt-4">No appts</p>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* Availability View */}
          {activeView === 'availability' && (
            <div className="bg-white rounded-xl border border-slate-200 p-6">
              <h2 className="text-lg font-semibold text-slate-800 mb-1">Your Availability</h2>
              <p className="text-sm text-slate-500 mb-6">
                Set the hours you're available for appointments each day. Leads will only be able to book during these times.
              </p>
              <div className="space-y-3">
                {DAYS.map((day, i) => {
                  const slot = availability.find((a) => a.day === i)
                  const isActive = !!slot
                  return (
                    <div
                      key={day}
                      className={`flex items-center gap-4 p-3 rounded-lg border ${
                        isActive ? 'border-primary-200 bg-primary-50' : 'border-slate-200 bg-slate-50'
                      }`}
                    >
                      <button
                        onClick={() => toggleDayAvailability(i)}
                        className={`w-10 h-6 rounded-full transition-colors relative ${
                          isActive ? 'bg-primary-600' : 'bg-slate-300'
                        }`}
                      >
                        <span
                          className={`absolute top-0.5 w-5 h-5 bg-white rounded-full transition-transform shadow ${
                            isActive ? 'left-[18px]' : 'left-0.5'
                          }`}
                        />
                      </button>
                      <span className={`w-24 font-medium text-sm ${isActive ? 'text-slate-800' : 'text-slate-400'}`}>
                        {day}
                      </span>
                      {isActive ? (
                        <div className="flex items-center gap-2">
                          <select
                            value={slot.startTime}
                            onChange={(e) => updateAvailabilityTime(i, 'startTime', e.target.value)}
                            className="px-2 py-1 text-sm border border-slate-300 rounded-lg bg-white"
                          >
                            {TIME_OPTIONS.map((t) => (
                              <option key={t.value} value={t.value}>{t.label}</option>
                            ))}
                          </select>
                          <span className="text-slate-400">to</span>
                          <select
                            value={slot.endTime}
                            onChange={(e) => updateAvailabilityTime(i, 'endTime', e.target.value)}
                            className="px-2 py-1 text-sm border border-slate-300 rounded-lg bg-white"
                          >
                            {TIME_OPTIONS.map((t) => (
                              <option key={t.value} value={t.value}>{t.label}</option>
                            ))}
                          </select>
                        </div>
                      ) : (
                        <span className="text-sm text-slate-400">Unavailable</span>
                      )}
                    </div>
                  )
                })}
              </div>
              <button
                onClick={() => toast.success('Availability saved!')}
                className="mt-6 px-6 py-2.5 bg-primary-800 text-white rounded-lg hover:bg-primary-700 transition-colors"
              >
                Save Availability
              </button>
            </div>
          )}
        </div>

        {/* Sidebar - Upcoming Appointments */}
        <div className="space-y-4">
          <div className="bg-white rounded-xl border border-slate-200 p-4">
            <h2 className="text-lg font-semibold text-slate-800 mb-4 flex items-center gap-2">
              <CalendarCheck className="w-5 h-5 text-primary-600" />
              Upcoming
            </h2>
            {upcomingAppointments.length === 0 ? (
              <p className="text-sm text-slate-500 text-center py-4">No upcoming appointments</p>
            ) : (
              <div className="space-y-3">
                {upcomingAppointments.map((appt) => {
                  const typeInfo = APPOINTMENT_TYPES.find((t) => t.value === appt.type)
                  const apptDate = new Date(appt.date + 'T00:00:00')
                  const isToday = appt.date === todayStr
                  return (
                    <div key={appt.id} className="p-3 rounded-lg border border-slate-200 hover:border-slate-300 transition-colors">
                      <div className="flex items-start justify-between mb-1">
                        <span className={`text-xs px-2 py-0.5 rounded-full border ${typeInfo?.color}`}>
                          {typeInfo?.label}
                        </span>
                        <button
                          onClick={() => deleteAppointment(appt.id)}
                          className="p-1 text-slate-400 hover:text-danger-500 transition-colors"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                      <p className="font-medium text-slate-800 text-sm mt-1.5">{appt.contactName}</p>
                      <div className="flex items-center gap-1 text-xs text-slate-500 mt-1">
                        <Clock className="w-3 h-3" />
                        <span>
                          {isToday ? 'Today' : apptDate.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })},{' '}
                          {formatTimeLabel(appt.startTime)} – {formatTimeLabel(appt.endTime)}
                        </span>
                      </div>
                      {appt.notes && (
                        <p className="text-xs text-slate-400 mt-1 truncate">{appt.notes}</p>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </div>

          {/* Stats */}
          <div className="bg-white rounded-xl border border-slate-200 p-4">
            <h3 className="text-sm font-semibold text-slate-700 mb-3">This Week</h3>
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-slate-500">Appointments</span>
                <span className="font-semibold text-slate-800">
                  {appointments.filter((a) =>
                    weekDates.some((d) => formatDate(d) === a.date)
                  ).length}
                </span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-slate-500">Available Days</span>
                <span className="font-semibold text-slate-800">{availability.length}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-slate-500">Property Visits</span>
                <span className="font-semibold text-slate-800">
                  {appointments.filter(
                    (a) => a.type === 'property_visit' && weekDates.some((d) => formatDate(d) === a.date)
                  ).length}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* New Appointment Modal */}
      {showNewAppointment && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full mx-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between p-4 border-b border-slate-200">
              <h2 className="text-lg font-semibold text-slate-800">Schedule Appointment</h2>
              <button
                onClick={() => setShowNewAppointment(false)}
                className="p-1 hover:bg-slate-100 rounded-lg transition-colors"
              >
                <X className="w-5 h-5 text-slate-500" />
              </button>
            </div>

            <form onSubmit={handleCreateAppointment} className="p-4 space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Contact Name *
                </label>
                <div className="relative">
                  <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                  <input
                    type="text"
                    required
                    value={newAppt.contactName}
                    onChange={(e) => setNewAppt((prev) => ({ ...prev, contactName: e.target.value }))}
                    className="w-full pl-9 pr-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                    placeholder="Enter contact name"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Phone Number
                </label>
                <div className="relative">
                  <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                  <input
                    type="tel"
                    value={newAppt.contactPhone}
                    onChange={(e) => setNewAppt((prev) => ({ ...prev, contactPhone: e.target.value }))}
                    className="w-full pl-9 pr-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                    placeholder="(555) 123-4567"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Appointment Type
                </label>
                <div className="grid grid-cols-2 gap-2">
                  {APPOINTMENT_TYPES.map((type) => (
                    <button
                      key={type.value}
                      type="button"
                      onClick={() => setNewAppt((prev) => ({ ...prev, type: type.value as Appointment['type'] }))}
                      className={`px-3 py-2 text-sm rounded-lg border transition-colors ${
                        newAppt.type === type.value
                          ? type.color + ' ring-2 ring-primary-300'
                          : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                      }`}
                    >
                      {type.label}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Date *
                </label>
                <input
                  type="date"
                  required
                  value={newAppt.date}
                  onChange={(e) => setNewAppt((prev) => ({ ...prev, date: e.target.value }))}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Start Time</label>
                  <select
                    value={newAppt.startTime}
                    onChange={(e) => setNewAppt((prev) => ({ ...prev, startTime: e.target.value }))}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                  >
                    {TIME_OPTIONS.map((t) => (
                      <option key={t.value} value={t.value}>{t.label}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">End Time</label>
                  <select
                    value={newAppt.endTime}
                    onChange={(e) => setNewAppt((prev) => ({ ...prev, endTime: e.target.value }))}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                  >
                    {TIME_OPTIONS.map((t) => (
                      <option key={t.value} value={t.value}>{t.label}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Notes
                </label>
                <textarea
                  rows={3}
                  value={newAppt.notes}
                  onChange={(e) => setNewAppt((prev) => ({ ...prev, notes: e.target.value }))}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 resize-none"
                  placeholder="Property address, discussion topics, etc."
                />
              </div>

              {/* Google Calendar sync option */}
              {gcal.isAuthorized && (
                <label className="flex items-center gap-2 p-3 bg-blue-50 border border-blue-200 rounded-lg cursor-pointer">
                  <input
                    type="checkbox"
                    checked={newAppt.syncToGoogle}
                    onChange={(e) => setNewAppt((prev) => ({ ...prev, syncToGoogle: e.target.checked }))}
                    className="w-4 h-4 text-primary-600 rounded border-slate-300 focus:ring-primary-500"
                  />
                  <div>
                    <p className="text-sm font-medium text-blue-800">Sync to Google Calendar</p>
                    <p className="text-xs text-blue-600">Create this event in your Google Calendar too</p>
                  </div>
                </label>
              )}

              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowNewAppointment(false)}
                  className="flex-1 px-4 py-2.5 border border-slate-300 text-slate-700 rounded-lg hover:bg-slate-50 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={syncingToGoogle}
                  className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-primary-800 text-white rounded-lg hover:bg-primary-700 transition-colors disabled:opacity-50"
                >
                  {syncingToGoogle ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Syncing...
                    </>
                  ) : (
                    'Schedule'
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
