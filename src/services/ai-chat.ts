/**
 * AI Chat Service — Phase 2A
 * Connects to OpenAI-compatible API (works with OpenAI, Claude via proxy, or local LLMs)
 * Handles conversation management, knowledge base context, lead qualification, and appointment booking
 */

export interface ChatMessage {
  id: string
  role: 'user' | 'assistant' | 'system'
  content: string
  channel: 'web' | 'sms' | 'facebook' | 'instagram'
  timestamp: Date
  metadata?: {
    qualificationData?: Partial<LeadQualification>
    appointmentData?: Partial<AppointmentRequest>
    action?: 'qualify' | 'book_appointment' | 'search_knowledge' | 'escalate'
    confidence?: number
  }
}

export interface LeadQualification {
  name: string
  email: string
  phone: string
  propertyAddress: string
  propertyType: 'single_family' | 'multi_family' | 'commercial' | 'land' | 'other' | ''
  motivation: 'foreclosure' | 'divorce' | 'relocation' | 'inherited' | 'tired_landlord' | 'other' | ''
  timeline: 'asap' | '1_3_months' | '3_6_months' | '6_plus_months' | ''
  priceRange: string
  preApproved: boolean | null
  notes: string
  score: number // 0-100
  status: 'new' | 'qualifying' | 'qualified' | 'not_qualified'
}

export interface AppointmentRequest {
  contactName: string
  contactPhone: string
  date: string
  startTime: string
  endTime: string
  type: 'phone_call' | 'property_visit' | 'meeting' | 'closing'
  notes: string
  confirmed: boolean
}

export interface KnowledgeEntry {
  id: string
  title: string
  content: string
  source: 'document' | 'url' | 'manual' | 'faq'
  url?: string
  tags: string[]
  createdAt: Date
}

export interface ConversationObjective {
  id: string
  name: string
  description: string
  prompts: string[]
  requiredFields: string[]
  completionCheck: (qual: Partial<LeadQualification>) => boolean
}

// Qualification objectives — modular goals the AI works through (inspired by CloseBot's approach)
export const QUALIFICATION_OBJECTIVES: ConversationObjective[] = [
  {
    id: 'greeting',
    name: 'Greeting & Rapport',
    description: 'Greet the lead warmly and establish rapport',
    prompts: [
      'Greet the user warmly. Ask how you can help them today.',
      'If they mention a property, show interest and ask for more details.',
    ],
    requiredFields: [],
    completionCheck: () => true, // Always passes after first exchange
  },
  {
    id: 'identify',
    name: 'Identify Lead',
    description: 'Collect name and contact information',
    prompts: [
      'Naturally ask for their name if not provided.',
      'Ask for the best phone number or email to reach them.',
    ],
    requiredFields: ['name'],
    completionCheck: (q) => !!(q.name),
  },
  {
    id: 'property_interest',
    name: 'Property Interest',
    description: 'Understand what property they are interested in',
    prompts: [
      'Ask about the property address or area they are interested in.',
      'Ask what type of property (single family, multi-family, etc.).',
    ],
    requiredFields: ['propertyAddress', 'propertyType'],
    completionCheck: (q) => !!(q.propertyAddress && q.propertyType),
  },
  {
    id: 'motivation',
    name: 'Motivation & Timeline',
    description: 'Understand their motivation and timeline',
    prompts: [
      'Ask about their situation — why are they looking to sell/buy?',
      'Ask about their timeline — when do they need to make a decision?',
    ],
    requiredFields: ['motivation', 'timeline'],
    completionCheck: (q) => !!(q.motivation && q.timeline),
  },
  {
    id: 'book_appointment',
    name: 'Book Appointment',
    description: 'Offer to schedule a call or property visit',
    prompts: [
      'Based on the conversation, offer to schedule a phone call or property visit.',
      'Suggest specific time ranges (mornings, afternoons this week).',
      'Confirm the appointment details before booking.',
    ],
    requiredFields: [],
    completionCheck: () => false, // Manually completed when appointment is booked
  },
]

// System prompt that shapes the AI personality and behavior
function buildSystemPrompt(
  knowledgeBase: KnowledgeEntry[],
  qualification: Partial<LeadQualification>,
  currentObjective: ConversationObjective,
  appointmentSlots: string[],
): string {
  const kbContext = knowledgeBase.length > 0
    ? `\n\nKNOWLEDGE BASE (use this to answer questions):\n${knowledgeBase.map((k) => `[${k.title}]: ${k.content}`).join('\n\n')}`
    : ''

  const qualContext = Object.entries(qualification)
    .filter(([, v]) => v !== '' && v !== null && v !== undefined)
    .map(([k, v]) => `- ${k}: ${v}`)
    .join('\n')

  const slotsContext = appointmentSlots.length > 0
    ? `\n\nAVAILABLE APPOINTMENT SLOTS:\n${appointmentSlots.join('\n')}`
    : ''

  return `You are the REI Fundamentals AI Assistant — a friendly, knowledgeable real estate investing assistant.

PERSONALITY:
- Warm, professional, and conversational (not robotic)
- Knowledgeable about real estate investing (wholesale, fix & flip, buy & hold)
- Helpful with property analysis, deal evaluation, scheduling, and market questions
- Respond naturally like a real person texting — keep responses concise (2-4 sentences max)
- Use occasional casual language but stay professional
- Never reveal that you are an AI unless directly asked

CURRENT OBJECTIVE: ${currentObjective.name}
${currentObjective.description}
Instructions: ${currentObjective.prompts.join(' ')}

INFORMATION COLLECTED SO FAR:
${qualContext || 'None yet'}
${kbContext}
${slotsContext}

IMPORTANT RULES:
1. Work toward the current objective naturally — don't be pushy or scripted
2. If the user asks a question, answer it first, then gently steer back to the objective
3. If the user seems uninterested, respect that — don't force qualification
4. When all qualification info is collected, offer to schedule a call or visit
5. For appointment booking, suggest specific available times and confirm details
6. If you don't know something, say so honestly and offer to connect them with a specialist
7. NEVER make up property values, market data, or financial advice
8. Always format any appointment confirmations clearly with date, time, and type

When the user provides qualification information, extract it and include in your response.
If the user wants to book an appointment, help them choose a time and confirm.`
}

/**
 * AI Chat Engine — manages conversation flow, qualification, and responses
 */
export class AIChatEngine {
  private apiKey: string
  private apiUrl: string
  private model: string
  private knowledgeBase: KnowledgeEntry[]
  private qualification: Partial<LeadQualification>
  private currentObjectiveIndex: number
  private conversationHistory: ChatMessage[]
  private appointmentSlots: string[]
  private onQualificationUpdate?: (qual: Partial<LeadQualification>) => void
  private onAppointmentRequest?: (appt: Partial<AppointmentRequest>) => void

  constructor(config: {
    apiKey?: string
    apiUrl?: string
    model?: string
    knowledgeBase?: KnowledgeEntry[]
    appointmentSlots?: string[]
    onQualificationUpdate?: (qual: Partial<LeadQualification>) => void
    onAppointmentRequest?: (appt: Partial<AppointmentRequest>) => void
  }) {
    this.apiKey = config.apiKey || import.meta.env.VITE_AI_API_KEY || ''
    this.apiUrl = config.apiUrl || import.meta.env.VITE_AI_API_URL || 'https://api.openai.com/v1'
    this.model = config.model || import.meta.env.VITE_AI_MODEL || 'gpt-4o-mini'
    this.knowledgeBase = config.knowledgeBase || []
    this.qualification = { status: 'new', score: 0 }
    this.currentObjectiveIndex = 0
    this.conversationHistory = []
    this.appointmentSlots = config.appointmentSlots || []
    this.onQualificationUpdate = config.onQualificationUpdate
    this.onAppointmentRequest = config.onAppointmentRequest
  }

  get isConfigured(): boolean {
    return !!this.apiKey
  }

  get currentQualification(): Partial<LeadQualification> {
    return { ...this.qualification }
  }

  get currentObjective(): ConversationObjective {
    return QUALIFICATION_OBJECTIVES[this.currentObjectiveIndex] || QUALIFICATION_OBJECTIVES[0]
  }

  updateKnowledgeBase(entries: KnowledgeEntry[]) {
    this.knowledgeBase = entries
  }

  updateAppointmentSlots(slots: string[]) {
    this.appointmentSlots = slots
  }

  /**
   * Extract qualification data from user message using keyword matching
   * In production, the AI model extracts this more accurately
   */
  private extractQualificationData(message: string): Partial<LeadQualification> {
    const extracted: Partial<LeadQualification> = {}
    const lower = message.toLowerCase()

    // Name detection (simple heuristic)
    const nameMatch = message.match(/(?:my name is|i'm|i am|this is)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)/i)
    if (nameMatch) extracted.name = nameMatch[1]

    // Phone detection
    const phoneMatch = message.match(/\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}/)
    if (phoneMatch) extracted.phone = phoneMatch[0]

    // Email detection
    const emailMatch = message.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/)
    if (emailMatch) extracted.email = emailMatch[0]

    // Address detection (basic — looks for street numbers)
    const addrMatch = message.match(/\d+\s+[A-Z][a-z]+(?:\s+[A-Z][a-z]+)*\s+(?:St|Ave|Blvd|Dr|Ln|Way|Ct|Rd|Street|Avenue|Boulevard|Drive|Lane|Court|Road)/i)
    if (addrMatch) extracted.propertyAddress = addrMatch[0]

    // Property type
    if (lower.includes('single family') || lower.includes('house') || lower.includes('sfh')) extracted.propertyType = 'single_family'
    else if (lower.includes('multi') || lower.includes('duplex') || lower.includes('triplex') || lower.includes('apartment')) extracted.propertyType = 'multi_family'
    else if (lower.includes('commercial') || lower.includes('office') || lower.includes('retail')) extracted.propertyType = 'commercial'
    else if (lower.includes('land') || lower.includes('lot') || lower.includes('vacant lot')) extracted.propertyType = 'land'

    // Motivation
    if (lower.includes('foreclos')) extracted.motivation = 'foreclosure'
    else if (lower.includes('divorc')) extracted.motivation = 'divorce'
    else if (lower.includes('relocat') || lower.includes('moving')) extracted.motivation = 'relocation'
    else if (lower.includes('inherit')) extracted.motivation = 'inherited'
    else if (lower.includes('tired') || lower.includes('landlord') || lower.includes('tenant')) extracted.motivation = 'tired_landlord'

    // Timeline
    if (lower.includes('asap') || lower.includes('right away') || lower.includes('immediately') || lower.includes('urgent')) extracted.timeline = 'asap'
    else if (lower.includes('1') && lower.includes('month') || lower.includes('few weeks')) extracted.timeline = '1_3_months'
    else if (lower.includes('3') && lower.includes('month') || lower.includes('few months')) extracted.timeline = '3_6_months'
    else if (lower.includes('6') && lower.includes('month') || lower.includes('year') || lower.includes('no rush')) extracted.timeline = '6_plus_months'

    return extracted
  }

  /**
   * Calculate lead score based on collected data
   */
  private calculateLeadScore(qual: Partial<LeadQualification>): number {
    let score = 0
    if (qual.name) score += 10
    if (qual.phone || qual.email) score += 15
    if (qual.propertyAddress) score += 20
    if (qual.propertyType) score += 10
    if (qual.motivation) {
      score += 15
      if (qual.motivation === 'foreclosure' || qual.motivation === 'divorce') score += 10 // Higher urgency
    }
    if (qual.timeline) {
      score += 10
      if (qual.timeline === 'asap') score += 10
      else if (qual.timeline === '1_3_months') score += 5
    }
    return Math.min(score, 100)
  }

  /**
   * Advance to next objective if current one is complete
   */
  private advanceObjective() {
    const current = QUALIFICATION_OBJECTIVES[this.currentObjectiveIndex]
    if (current && current.completionCheck(this.qualification)) {
      if (this.currentObjectiveIndex < QUALIFICATION_OBJECTIVES.length - 1) {
        this.currentObjectiveIndex++
      }
    }
  }

  /**
   * Search knowledge base for relevant entries
   */
  private searchKnowledge(query: string): KnowledgeEntry[] {
    const lower = query.toLowerCase()
    const words = lower.split(/\s+/).filter((w) => w.length > 3)

    return this.knowledgeBase
      .map((entry) => {
        const entryText = `${entry.title} ${entry.content} ${entry.tags.join(' ')}`.toLowerCase()
        const matchCount = words.filter((w) => entryText.includes(w)).length
        return { entry, score: matchCount }
      })
      .filter((r) => r.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 3)
      .map((r) => r.entry)
  }

  /**
   * Detect if user wants to book an appointment
   */
  private detectAppointmentIntent(message: string): boolean {
    const lower = message.toLowerCase()
    const keywords = ['schedule', 'appointment', 'book', 'meet', 'visit', 'call me', 'set up a time', 'available', 'when can']
    return keywords.some((k) => lower.includes(k))
  }

  /**
   * Parse appointment details from user message
   */
  private parseAppointmentDetails(message: string): Partial<AppointmentRequest> {
    const appt: Partial<AppointmentRequest> = {}
    const lower = message.toLowerCase()

    // Date parsing
    const today = new Date()
    if (lower.includes('today')) {
      appt.date = today.toISOString().split('T')[0]
    } else if (lower.includes('tomorrow')) {
      const tomorrow = new Date(today)
      tomorrow.setDate(tomorrow.getDate() + 1)
      appt.date = tomorrow.toISOString().split('T')[0]
    } else if (lower.includes('monday') || lower.includes('tuesday') || lower.includes('wednesday') ||
               lower.includes('thursday') || lower.includes('friday')) {
      const dayNames = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday']
      const targetDay = dayNames.findIndex((d) => lower.includes(d))
      if (targetDay >= 0) {
        const diff = (targetDay - today.getDay() + 7) % 7 || 7
        const target = new Date(today)
        target.setDate(target.getDate() + diff)
        appt.date = target.toISOString().split('T')[0]
      }
    }

    // Time parsing
    const timeMatch = message.match(/(\d{1,2})(?::(\d{2}))?\s*(am|pm|AM|PM)/i)
    if (timeMatch) {
      let hour = parseInt(timeMatch[1])
      const minute = timeMatch[2] || '00'
      const ampm = timeMatch[3].toLowerCase()
      if (ampm === 'pm' && hour < 12) hour += 12
      if (ampm === 'am' && hour === 12) hour = 0
      appt.startTime = `${hour.toString().padStart(2, '0')}:${minute}`
      // Default 30 min appointment
      const endHour = minute === '30' ? hour + 1 : hour
      const endMin = minute === '30' ? '00' : '30'
      appt.endTime = `${endHour.toString().padStart(2, '0')}:${endMin}`
    }

    // Type detection
    if (lower.includes('visit') || lower.includes('walkthrough') || lower.includes('see the property')) {
      appt.type = 'property_visit'
    } else if (lower.includes('call')) {
      appt.type = 'phone_call'
    } else if (lower.includes('meeting') || lower.includes('meet')) {
      appt.type = 'meeting'
    }

    return appt
  }

  /**
   * Send message and get AI response
   */
  async sendMessage(
    userMessage: string,
    channel: ChatMessage['channel'] = 'web'
  ): Promise<{ response: string; metadata: ChatMessage['metadata'] }> {
    // Extract qualification data
    const extracted = this.extractQualificationData(userMessage)
    if (Object.keys(extracted).length > 0) {
      this.qualification = { ...this.qualification, ...extracted, status: 'qualifying' }
      this.qualification.score = this.calculateLeadScore(this.qualification)
      this.onQualificationUpdate?.(this.qualification)
    }

    // Advance objective
    this.advanceObjective()

    // Search knowledge base
    const relevantKnowledge = this.searchKnowledge(userMessage)

    // Detect appointment intent
    const wantsAppointment = this.detectAppointmentIntent(userMessage)
    let appointmentData: Partial<AppointmentRequest> | undefined
    if (wantsAppointment) {
      appointmentData = this.parseAppointmentDetails(userMessage)
      // Jump to booking objective
      const bookIdx = QUALIFICATION_OBJECTIVES.findIndex((o) => o.id === 'book_appointment')
      if (bookIdx >= 0) this.currentObjectiveIndex = bookIdx
    }

    // Build system prompt with current context
    const systemPrompt = buildSystemPrompt(
      relevantKnowledge.length > 0 ? relevantKnowledge : this.knowledgeBase.slice(0, 5),
      this.qualification,
      this.currentObjective,
      this.appointmentSlots,
    )

    // Add user message to history
    const userMsg: ChatMessage = {
      id: Date.now().toString(),
      role: 'user',
      content: userMessage,
      channel,
      timestamp: new Date(),
    }
    this.conversationHistory.push(userMsg)

    // Build action metadata
    const metadata: ChatMessage['metadata'] = {
      qualificationData: Object.keys(extracted).length > 0 ? extracted : undefined,
      appointmentData: wantsAppointment ? appointmentData : undefined,
      action: wantsAppointment ? 'book_appointment' : Object.keys(extracted).length > 0 ? 'qualify' : undefined,
      confidence: this.qualification.score,
    }

    // Try real AI API
    if (this.isConfigured) {
      try {
        const response = await this.callAIApi(systemPrompt, userMessage)
        const assistantMsg: ChatMessage = {
          id: (Date.now() + 1).toString(),
          role: 'assistant',
          content: response,
          channel,
          timestamp: new Date(),
          metadata,
        }
        this.conversationHistory.push(assistantMsg)

        if (wantsAppointment && appointmentData) {
          this.onAppointmentRequest?.(appointmentData)
        }

        return { response, metadata }
      } catch (error) {
        console.error('AI API call failed, falling back to local:', error)
      }
    }

    // Fallback: intelligent local response engine
    const response = this.generateLocalResponse(userMessage, wantsAppointment, appointmentData)
    const assistantMsg: ChatMessage = {
      id: (Date.now() + 1).toString(),
      role: 'assistant',
      content: response,
      channel,
      timestamp: new Date(),
      metadata,
    }
    this.conversationHistory.push(assistantMsg)

    if (wantsAppointment && appointmentData) {
      this.onAppointmentRequest?.(appointmentData)
    }

    return { response, metadata }
  }

  /**
   * Call OpenAI-compatible API
   */
  private async callAIApi(systemPrompt: string, userMessage: string): Promise<string> {
    const messages = [
      { role: 'system', content: systemPrompt },
      // Include last 10 messages for context
      ...this.conversationHistory.slice(-10).map((m) => ({
        role: m.role === 'assistant' ? 'assistant' : 'user',
        content: m.content,
      })),
      { role: 'user', content: userMessage },
    ]

    const response = await fetch(`${this.apiUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        model: this.model,
        messages,
        max_tokens: 300,
        temperature: 0.7,
      }),
    })

    if (!response.ok) {
      throw new Error(`AI API error: ${response.status}`)
    }

    const data = await response.json()
    return data.choices?.[0]?.message?.content || 'I apologize, I had trouble processing that. Could you rephrase?'
  }

  /**
   * Smart local response engine (no API key required)
   * Uses objective-based prompting + context awareness
   */
  private generateLocalResponse(
    message: string,
    wantsAppointment: boolean,
    appointmentData?: Partial<AppointmentRequest>,
  ): string {
    const lower = message.toLowerCase()
    const objective = this.currentObjective
    const qual = this.qualification

    // Appointment booking flow
    if (wantsAppointment || objective.id === 'book_appointment') {
      if (appointmentData?.date && appointmentData?.startTime) {
        const dateStr = new Date(appointmentData.date + 'T00:00:00').toLocaleDateString('en-US', {
          weekday: 'long', month: 'long', day: 'numeric',
        })
        const timeStr = this.formatTime(appointmentData.startTime)
        const typeLabel = appointmentData.type === 'property_visit' ? 'property visit' : appointmentData.type === 'phone_call' ? 'phone call' : 'meeting'
        return `I've got you down for a ${typeLabel} on ${dateStr} at ${timeStr}. ${qual.name ? `${qual.name}, ` : ''}I'll send you a confirmation. Is there anything specific you'd like to discuss during our ${typeLabel}?`
      }

      if (this.appointmentSlots.length > 0) {
        return `I'd love to set something up! Here are some available times:\n\n${this.appointmentSlots.slice(0, 4).join('\n')}\n\nWhich of these works best for you? Or let me know a day and time that's more convenient.`
      }

      return "I'd love to schedule a time to chat! What day works best for you this week? I'm generally available mornings and afternoons. Would you prefer a phone call or an in-person meeting?"
    }

    // Greeting
    if (objective.id === 'greeting' || lower.match(/^(hi|hello|hey|good morning|good afternoon)/)) {
      this.currentObjectiveIndex = 1 // Advance past greeting
      return "Hey there! Welcome to REI Fundamentals. I'm here to help with anything real estate investing related — whether you're looking at a property, want to analyze a deal, or need to schedule something. What can I help you with today?"
    }

    // Knowledge base questions
    if (lower.includes('how') || lower.includes('what') || lower.includes('tell me about') || lower.includes('explain')) {
      const relevant = this.searchKnowledge(message)
      if (relevant.length > 0) {
        return relevant[0].content + "\n\nWould you like to know more about this, or is there something else I can help with?"
      }

      // Real estate knowledge fallbacks
      if (lower.includes('wholesale')) {
        return "Wholesaling is finding properties under market value, getting them under contract, then assigning that contract to another investor for a fee — typically $5K-$15K per deal. You never actually buy the property. Would you like me to help you analyze a potential wholesale deal?"
      }
      if (lower.includes('arv') || lower.includes('after repair')) {
        return "ARV (After Repair Value) is what a property will be worth after renovations. We calculate it using comparable sales in the area. Our Deal Analyzer can help you figure out ARV and MAO (Maximum Allowable Offer). Want me to walk you through it?"
      }
      if (lower.includes('70%') || lower.includes('mao') || lower.includes('maximum allowable')) {
        return "The 70% Rule is a quick formula: MAO = (ARV x 70%) - Repair Costs. So if a property has a $200K ARV and needs $30K in repairs, your MAO would be $110K. Our Deal Analyzer lets you customize this or set your own MAO. Want to try it?"
      }
      if (lower.includes('flip') || lower.includes('fix and flip')) {
        return "Fix & flip involves buying a property below market value, renovating it, and selling for a profit. Key metrics are ARV, repair costs, holding costs (typically 4-6 months), and closing costs. Our Deal Analyzer can run these numbers for you. Interested?"
      }
    }

    // Identify phase
    if (objective.id === 'identify') {
      if (qual.name) {
        return `Great to meet you, ${qual.name}! Are you currently looking at any specific properties, or are you exploring what's available in a particular area?`
      }
      return "By the way, I didn't catch your name — what should I call you? And are you looking to buy, sell, or both?"
    }

    // Property interest phase
    if (objective.id === 'property_interest') {
      if (qual.propertyAddress && !qual.propertyType) {
        return `${qual.propertyAddress} — got it! What type of property is that? Single family home, multi-family, land?`
      }
      if (!qual.propertyAddress) {
        return "Are you looking at a specific property, or are you searching in a particular area? If you have an address, I can help you analyze the deal."
      }
      if (qual.propertyAddress && qual.propertyType) {
        return `A ${qual.propertyType.replace('_', ' ')} at ${qual.propertyAddress} — nice! What's the asking price, and do you know anything about the property's condition? That'll help me run some numbers for you.`
      }
    }

    // Motivation phase
    if (objective.id === 'motivation') {
      if (qual.motivation && !qual.timeline) {
        return "Got it, that helps me understand the situation better. What kind of timeline are you working with? Are you looking to move quickly, or do you have some time?"
      }
      if (!qual.motivation) {
        return "Can I ask what's driving your interest right now? Understanding your situation helps me give you the best advice — whether it's a quick cash offer, a creative financing deal, or something else entirely."
      }
    }

    // Default contextual response
    if (qual.score >= 50 && objective.id !== 'book_appointment') {
      this.currentObjectiveIndex = QUALIFICATION_OBJECTIVES.length - 1 // Jump to booking
      return `Based on what you've told me, I think I can really help here. Would you like to schedule a call or property visit so we can go over the details? I have availability this week.`
    }

    return "That's a great question! I'm here to help with anything real estate investing related — property analysis, deal evaluation, repair estimates, market research, or scheduling. What would be most helpful for you right now?"
  }

  private formatTime(time: string): string {
    const [h, m] = time.split(':').map(Number)
    const hour = h > 12 ? h - 12 : h === 0 ? 12 : h
    const ampm = h >= 12 ? 'PM' : 'AM'
    return `${hour}:${m.toString().padStart(2, '0')} ${ampm}`
  }

  /**
   * Get conversation summary for CRM
   */
  getSummary(): {
    messageCount: number
    qualification: Partial<LeadQualification>
    objectiveReached: string
    appointmentBooked: boolean
  } {
    return {
      messageCount: this.conversationHistory.filter((m) => m.role === 'user').length,
      qualification: this.qualification,
      objectiveReached: this.currentObjective.name,
      appointmentBooked: this.conversationHistory.some((m) => m.metadata?.action === 'book_appointment'),
    }
  }

  /**
   * Reset conversation
   */
  reset() {
    this.conversationHistory = []
    this.qualification = { status: 'new', score: 0 }
    this.currentObjectiveIndex = 0
  }
}
