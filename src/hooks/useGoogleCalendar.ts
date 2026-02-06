import { useState, useEffect, useCallback } from 'react'
import {
  googleCalendarService,
  type GoogleCalendarEvent,
  type CreateEventParams,
} from '@/services/google-calendar'

export function useGoogleCalendar() {
  const [isAuthorized, setIsAuthorized] = useState(googleCalendarService.authorized)
  const [isLoading, setIsLoading] = useState(false)
  const [events, setEvents] = useState<GoogleCalendarEvent[]>([])
  const [error, setError] = useState<string | null>(null)

  const isConfigured = googleCalendarService.isConfigured

  useEffect(() => {
    if (isConfigured) {
      googleCalendarService.initialize()
    }

    const unsubscribe = googleCalendarService.onAuthChange((authed) => {
      setIsAuthorized(authed)
    })

    return unsubscribe
  }, [isConfigured])

  const authorize = useCallback(async () => {
    setError(null)
    try {
      await googleCalendarService.authorize()
    } catch (err: any) {
      setError(err.message)
    }
  }, [])

  const disconnect = useCallback(() => {
    googleCalendarService.disconnect()
    setEvents([])
  }, [])

  const fetchEvents = useCallback(
    async (timeMin?: string, timeMax?: string) => {
      if (!isAuthorized) return []
      setIsLoading(true)
      setError(null)
      try {
        const items = await googleCalendarService.listEvents(timeMin, timeMax)
        setEvents(items)
        return items
      } catch (err: any) {
        setError(err.message)
        return []
      } finally {
        setIsLoading(false)
      }
    },
    [isAuthorized]
  )

  const createEvent = useCallback(
    async (params: CreateEventParams) => {
      if (!isAuthorized) throw new Error('Not authorized')
      setError(null)
      try {
        const event = await googleCalendarService.createEvent(params)
        setEvents((prev) => [...prev, event].sort(
          (a, b) => a.start.dateTime.localeCompare(b.start.dateTime)
        ))
        return event
      } catch (err: any) {
        setError(err.message)
        throw err
      }
    },
    [isAuthorized]
  )

  const deleteEvent = useCallback(
    async (eventId: string) => {
      if (!isAuthorized) throw new Error('Not authorized')
      setError(null)
      try {
        await googleCalendarService.deleteEvent(eventId)
        setEvents((prev) => prev.filter((e) => e.id !== eventId))
      } catch (err: any) {
        setError(err.message)
        throw err
      }
    },
    [isAuthorized]
  )

  const getFreeBusy = useCallback(
    async (timeMin: string, timeMax: string) => {
      if (!isAuthorized) return []
      try {
        return await googleCalendarService.getFreeBusy(timeMin, timeMax)
      } catch (err: any) {
        setError(err.message)
        return []
      }
    },
    [isAuthorized]
  )

  return {
    isConfigured,
    isAuthorized,
    isLoading,
    events,
    error,
    authorize,
    disconnect,
    fetchEvents,
    createEvent,
    deleteEvent,
    getFreeBusy,
  }
}
