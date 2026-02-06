/**
 * Google Calendar Integration Service
 *
 * Handles OAuth 2.0 flow and Google Calendar API operations.
 * Requires the following env vars:
 *   VITE_GOOGLE_CLIENT_ID - OAuth 2.0 Client ID from Google Cloud Console
 *   VITE_GOOGLE_API_KEY   - API Key (optional, for public calendar reads)
 *
 * Setup steps:
 * 1. Go to https://console.cloud.google.com
 * 2. Create a project (or select existing)
 * 3. Enable "Google Calendar API" under APIs & Services
 * 4. Create OAuth 2.0 credentials (Web application type)
 * 5. Add authorized redirect URI: http://localhost:3001 (dev) or your production URL
 * 6. Add authorized JavaScript origins: http://localhost:3001
 * 7. Copy Client ID to VITE_GOOGLE_CLIENT_ID in your .env
 */

const SCOPES = 'https://www.googleapis.com/auth/calendar'
const DISCOVERY_DOC = 'https://www.googleapis.com/discovery/v1/apis/calendar/v3/rest'

export interface GoogleCalendarEvent {
  id: string
  summary: string
  description?: string
  location?: string
  start: {
    dateTime: string
    timeZone?: string
  }
  end: {
    dateTime: string
    timeZone?: string
  }
  attendees?: Array<{
    email: string
    displayName?: string
    responseStatus?: string
  }>
  status?: string
  htmlLink?: string
}

export interface CreateEventParams {
  summary: string
  description?: string
  location?: string
  startDateTime: string // ISO 8601
  endDateTime: string   // ISO 8601
  attendeeEmail?: string
  timeZone?: string
}

type AuthCallback = (isAuthed: boolean) => void

class GoogleCalendarService {
  private tokenClient: any = null
  private gapiLoaded = false
  private gisLoaded = false
  private isAuthorized = false
  private authCallbacks: AuthCallback[] = []
  private initPromise: Promise<void> | null = null

  get clientId(): string {
    return import.meta.env.VITE_GOOGLE_CLIENT_ID || ''
  }

  get apiKey(): string {
    return import.meta.env.VITE_GOOGLE_API_KEY || ''
  }

  get isConfigured(): boolean {
    return !!this.clientId
  }

  get authorized(): boolean {
    return this.isAuthorized
  }

  /**
   * Subscribe to auth state changes
   */
  onAuthChange(callback: AuthCallback): () => void {
    this.authCallbacks.push(callback)
    return () => {
      this.authCallbacks = this.authCallbacks.filter((cb) => cb !== callback)
    }
  }

  private notifyAuthChange() {
    this.authCallbacks.forEach((cb) => cb(this.isAuthorized))
  }

  /**
   * Load the Google API client and Google Identity Services libraries
   */
  async initialize(): Promise<void> {
    if (!this.isConfigured) return
    if (this.initPromise) return this.initPromise

    this.initPromise = new Promise<void>((resolve) => {
      let loaded = 0
      const checkReady = () => {
        loaded++
        if (loaded === 2) {
          this.initGapiClient().then(resolve)
        }
      }

      // Load GAPI
      if (!(window as any).gapi) {
        const gapiScript = document.createElement('script')
        gapiScript.src = 'https://apis.google.com/js/api.js'
        gapiScript.async = true
        gapiScript.defer = true
        gapiScript.onload = () => {
          this.gapiLoaded = true
          checkReady()
        }
        document.head.appendChild(gapiScript)
      } else {
        this.gapiLoaded = true
        checkReady()
      }

      // Load GIS (Google Identity Services)
      if (!(window as any).google?.accounts) {
        const gisScript = document.createElement('script')
        gisScript.src = 'https://accounts.google.com/gsi/client'
        gisScript.async = true
        gisScript.defer = true
        gisScript.onload = () => {
          this.gisLoaded = true
          checkReady()
        }
        document.head.appendChild(gisScript)
      } else {
        this.gisLoaded = true
        checkReady()
      }
    })

    return this.initPromise
  }

  private async initGapiClient(): Promise<void> {
    const gapi = (window as any).gapi
    await new Promise<void>((resolve) => {
      gapi.load('client', resolve)
    })

    await gapi.client.init({
      apiKey: this.apiKey,
      discoveryDocs: [DISCOVERY_DOC],
    })

    // Initialize the token client
    const google = (window as any).google
    this.tokenClient = google.accounts.oauth2.initTokenClient({
      client_id: this.clientId,
      scope: SCOPES,
      callback: (response: any) => {
        if (response.error) {
          console.error('Google OAuth error:', response.error)
          this.isAuthorized = false
        } else {
          this.isAuthorized = true
          // Store token expiry
          const expiresAt = Date.now() + response.expires_in * 1000
          localStorage.setItem('gcal_token_expires', expiresAt.toString())
        }
        this.notifyAuthChange()
      },
    })

    // Check if we have a stored valid session
    const storedExpiry = localStorage.getItem('gcal_token_expires')
    if (storedExpiry && Date.now() < parseInt(storedExpiry)) {
      // Token might still be valid — gapi will handle refresh
      const token = gapi.client.getToken()
      if (token) {
        this.isAuthorized = true
        this.notifyAuthChange()
      }
    }
  }

  /**
   * Start the OAuth consent flow
   */
  async authorize(): Promise<void> {
    if (!this.isConfigured) {
      throw new Error('Google Calendar is not configured. Set VITE_GOOGLE_CLIENT_ID in your .env file.')
    }

    await this.initialize()

    if (!this.tokenClient) {
      throw new Error('Google Identity Services not loaded')
    }

    const gapi = (window as any).gapi
    const token = gapi.client.getToken()

    if (token === null) {
      // First time — show consent screen
      this.tokenClient.requestAccessToken({ prompt: 'consent' })
    } else {
      // Already have token — request without prompt
      this.tokenClient.requestAccessToken({ prompt: '' })
    }
  }

  /**
   * Disconnect / sign out
   */
  disconnect(): void {
    const gapi = (window as any).gapi
    const google = (window as any).google
    const token = gapi?.client?.getToken()

    if (token) {
      google.accounts.oauth2.revoke(token.access_token)
      gapi.client.setToken(null)
    }

    localStorage.removeItem('gcal_token_expires')
    this.isAuthorized = false
    this.notifyAuthChange()
  }

  /**
   * List events from the user's primary calendar
   */
  async listEvents(
    timeMin?: string,
    timeMax?: string,
    maxResults = 50
  ): Promise<GoogleCalendarEvent[]> {
    if (!this.isAuthorized) throw new Error('Not authorized')

    const gapi = (window as any).gapi
    const params: any = {
      calendarId: 'primary',
      showDeleted: false,
      singleEvents: true,
      maxResults,
      orderBy: 'startTime',
    }

    if (timeMin) params.timeMin = timeMin
    if (timeMax) params.timeMax = timeMax

    const response = await gapi.client.calendar.events.list(params)
    return response.result.items || []
  }

  /**
   * Get a single event
   */
  async getEvent(eventId: string): Promise<GoogleCalendarEvent> {
    if (!this.isAuthorized) throw new Error('Not authorized')

    const gapi = (window as any).gapi
    const response = await gapi.client.calendar.events.get({
      calendarId: 'primary',
      eventId,
    })
    return response.result
  }

  /**
   * Create a new calendar event
   */
  async createEvent(params: CreateEventParams): Promise<GoogleCalendarEvent> {
    if (!this.isAuthorized) throw new Error('Not authorized')

    const gapi = (window as any).gapi
    const timeZone = params.timeZone || Intl.DateTimeFormat().resolvedOptions().timeZone

    const event: any = {
      summary: params.summary,
      description: params.description || '',
      location: params.location || '',
      start: {
        dateTime: params.startDateTime,
        timeZone,
      },
      end: {
        dateTime: params.endDateTime,
        timeZone,
      },
    }

    if (params.attendeeEmail) {
      event.attendees = [{ email: params.attendeeEmail }]
    }

    const response = await gapi.client.calendar.events.insert({
      calendarId: 'primary',
      resource: event,
      sendUpdates: params.attendeeEmail ? 'all' : 'none',
    })

    return response.result
  }

  /**
   * Update an existing event
   */
  async updateEvent(
    eventId: string,
    params: Partial<CreateEventParams>
  ): Promise<GoogleCalendarEvent> {
    if (!this.isAuthorized) throw new Error('Not authorized')

    const gapi = (window as any).gapi
    const timeZone = params.timeZone || Intl.DateTimeFormat().resolvedOptions().timeZone

    const update: any = {}
    if (params.summary) update.summary = params.summary
    if (params.description !== undefined) update.description = params.description
    if (params.location !== undefined) update.location = params.location
    if (params.startDateTime) {
      update.start = { dateTime: params.startDateTime, timeZone }
    }
    if (params.endDateTime) {
      update.end = { dateTime: params.endDateTime, timeZone }
    }

    const response = await gapi.client.calendar.events.patch({
      calendarId: 'primary',
      eventId,
      resource: update,
    })

    return response.result
  }

  /**
   * Delete an event
   */
  async deleteEvent(eventId: string): Promise<void> {
    if (!this.isAuthorized) throw new Error('Not authorized')

    const gapi = (window as any).gapi
    await gapi.client.calendar.events.delete({
      calendarId: 'primary',
      eventId,
    })
  }

  /**
   * Get free/busy information for a time range
   */
  async getFreeBusy(
    timeMin: string,
    timeMax: string
  ): Promise<Array<{ start: string; end: string }>> {
    if (!this.isAuthorized) throw new Error('Not authorized')

    const gapi = (window as any).gapi
    const response = await gapi.client.calendar.freebusy.query({
      resource: {
        timeMin,
        timeMax,
        items: [{ id: 'primary' }],
      },
    })

    return response.result.calendars?.primary?.busy || []
  }

  /**
   * Generate a shareable booking link URL
   * In production, this would create a booking page on your domain
   */
  generateBookingLink(userId: string): string {
    const baseUrl = window.location.origin
    return `${baseUrl}/book/${userId}`
  }
}

export const googleCalendarService = new GoogleCalendarService()
