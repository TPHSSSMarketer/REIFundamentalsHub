import axios, { AxiosInstance } from 'axios'
import type { Lead, Deal, Campaign, ApiResponse, PaginatedResponse } from '@/types'

/**
 * GoHighLevel API Service
 * Handles all communication with the GHL API
 */
class GHLApiService {
  private client: AxiosInstance
  private locationId: string

  constructor() {
    this.locationId = process.env.GHL_LOCATION_ID || ''

    this.client = axios.create({
      baseURL: process.env.GHL_API_BASE_URL || 'https://services.leadconnectorhq.com',
      headers: {
        'Authorization': `Bearer ${process.env.GHL_API_KEY}`,
        'Content-Type': 'application/json',
        'Version': '2021-07-28',
      },
    })

    // Response interceptor for error handling
    this.client.interceptors.response.use(
      (response) => response,
      (error) => {
        console.error('GHL API Error:', error.response?.data || error.message)
        throw error
      }
    )
  }

  // ============ CONTACTS/LEADS ============

  async getContacts(params?: {
    limit?: number
    offset?: number
    query?: string
  }): Promise<PaginatedResponse<Lead>> {
    const response = await this.client.get('/contacts/', {
      params: {
        locationId: this.locationId,
        limit: params?.limit || 20,
        skip: params?.offset || 0,
        query: params?.query,
      },
    })

    const contacts = response.data.contacts || []

    return {
      data: contacts.map(this.mapGHLContactToLead),
      total: response.data.total || contacts.length,
      page: Math.floor((params?.offset || 0) / (params?.limit || 20)) + 1,
      pageSize: params?.limit || 20,
      totalPages: Math.ceil((response.data.total || contacts.length) / (params?.limit || 20)),
    }
  }

  async getContact(contactId: string): Promise<Lead> {
    const response = await this.client.get(`/contacts/${contactId}`)
    return this.mapGHLContactToLead(response.data.contact)
  }

  async createContact(lead: Partial<Lead>): Promise<Lead> {
    const response = await this.client.post('/contacts/', {
      locationId: this.locationId,
      firstName: lead.firstName,
      lastName: lead.lastName,
      email: lead.email,
      phone: lead.phone,
      address1: lead.address,
      city: lead.city,
      state: lead.state,
      postalCode: lead.zipCode,
      tags: lead.tags,
      source: lead.source,
      customFields: [
        { key: 'property_type', value: lead.propertyType },
        { key: 'motivation', value: lead.motivation },
        { key: 'estimated_value', value: lead.estimatedValue },
      ],
    })

    return this.mapGHLContactToLead(response.data.contact)
  }

  async updateContact(contactId: string, lead: Partial<Lead>): Promise<Lead> {
    const response = await this.client.put(`/contacts/${contactId}`, {
      firstName: lead.firstName,
      lastName: lead.lastName,
      email: lead.email,
      phone: lead.phone,
      address1: lead.address,
      city: lead.city,
      state: lead.state,
      postalCode: lead.zipCode,
      tags: lead.tags,
    })

    return this.mapGHLContactToLead(response.data.contact)
  }

  async deleteContact(contactId: string): Promise<void> {
    await this.client.delete(`/contacts/${contactId}`)
  }

  async addTagsToContact(contactId: string, tags: string[]): Promise<void> {
    await this.client.post(`/contacts/${contactId}/tags`, { tags })
  }

  async removeTagsFromContact(contactId: string, tags: string[]): Promise<void> {
    await this.client.delete(`/contacts/${contactId}/tags`, { data: { tags } })
  }

  // ============ OPPORTUNITIES/DEALS ============

  async getOpportunities(pipelineId?: string): Promise<Deal[]> {
    const response = await this.client.get('/opportunities/search', {
      params: {
        locationId: this.locationId,
        pipelineId,
      },
    })

    return (response.data.opportunities || []).map(this.mapGHLOpportunityToDeal)
  }

  async getOpportunity(opportunityId: string): Promise<Deal> {
    const response = await this.client.get(`/opportunities/${opportunityId}`)
    return this.mapGHLOpportunityToDeal(response.data.opportunity)
  }

  async createOpportunity(deal: Partial<Deal>): Promise<Deal> {
    const response = await this.client.post('/opportunities/', {
      locationId: this.locationId,
      pipelineId: deal.pipelineId,
      pipelineStageId: deal.stageId,
      contactId: deal.leadId,
      name: deal.title,
      monetaryValue: deal.value,
    })

    return this.mapGHLOpportunityToDeal(response.data.opportunity)
  }

  async updateOpportunity(opportunityId: string, deal: Partial<Deal>): Promise<Deal> {
    const response = await this.client.put(`/opportunities/${opportunityId}`, {
      pipelineStageId: deal.stageId,
      name: deal.title,
      monetaryValue: deal.value,
    })

    return this.mapGHLOpportunityToDeal(response.data.opportunity)
  }

  async updateOpportunityStage(opportunityId: string, stageId: string): Promise<Deal> {
    const response = await this.client.put(`/opportunities/${opportunityId}/status`, {
      pipelineStageId: stageId,
    })

    return this.mapGHLOpportunityToDeal(response.data.opportunity)
  }

  // ============ PIPELINES ============

  async getPipelines(): Promise<any[]> {
    const response = await this.client.get('/opportunities/pipelines', {
      params: { locationId: this.locationId },
    })

    return response.data.pipelines || []
  }

  // ============ CAMPAIGNS ============

  async getCampaigns(): Promise<Campaign[]> {
    const response = await this.client.get('/campaigns/', {
      params: { locationId: this.locationId },
    })

    return (response.data.campaigns || []).map(this.mapGHLCampaignToCampaign)
  }

  // ============ CONVERSATIONS/MESSAGING ============

  async getConversations(contactId?: string): Promise<any[]> {
    const response = await this.client.get('/conversations/search', {
      params: {
        locationId: this.locationId,
        contactId,
      },
    })

    return response.data.conversations || []
  }

  async sendSMS(contactId: string, message: string): Promise<void> {
    await this.client.post('/conversations/messages', {
      type: 'SMS',
      contactId,
      message,
    })
  }

  async sendEmail(contactId: string, subject: string, body: string): Promise<void> {
    await this.client.post('/conversations/messages', {
      type: 'Email',
      contactId,
      subject,
      message: body,
    })
  }

  // ============ CALENDARS/APPOINTMENTS ============

  async getCalendars(): Promise<any[]> {
    const response = await this.client.get('/calendars/', {
      params: { locationId: this.locationId },
    })

    return response.data.calendars || []
  }

  async getAppointments(calendarId: string, startDate: string, endDate: string): Promise<any[]> {
    const response = await this.client.get(`/calendars/${calendarId}/appointments`, {
      params: {
        startDate,
        endDate,
      },
    })

    return response.data.appointments || []
  }

  async createAppointment(calendarId: string, appointment: {
    contactId: string
    startTime: string
    endTime: string
    title: string
    notes?: string
  }): Promise<any> {
    const response = await this.client.post('/calendars/events/appointments', {
      calendarId,
      locationId: this.locationId,
      contactId: appointment.contactId,
      startTime: appointment.startTime,
      endTime: appointment.endTime,
      title: appointment.title,
      appointmentStatus: 'confirmed',
    })

    return response.data
  }

  // ============ WORKFLOWS ============

  async getWorkflows(): Promise<any[]> {
    const response = await this.client.get('/workflows/', {
      params: { locationId: this.locationId },
    })

    return response.data.workflows || []
  }

  async addContactToWorkflow(workflowId: string, contactId: string): Promise<void> {
    await this.client.post(`/contacts/${contactId}/workflow/${workflowId}`)
  }

  // ============ MAPPING FUNCTIONS ============

  private mapGHLContactToLead(contact: any): Lead {
    return {
      id: contact.id,
      firstName: contact.firstName || '',
      lastName: contact.lastName || '',
      email: contact.email || '',
      phone: contact.phone || '',
      address: contact.address1 || '',
      city: contact.city || '',
      state: contact.state || '',
      zipCode: contact.postalCode || '',
      propertyType: contact.customFields?.find((f: any) => f.key === 'property_type')?.value,
      source: contact.source || 'other',
      status: this.mapContactStatusToLeadStatus(contact.contactStatus),
      tags: contact.tags || [],
      notes: contact.notes || '',
      assignedTo: contact.assignedTo,
      createdAt: contact.dateAdded,
      updatedAt: contact.dateUpdated || contact.dateAdded,
      lastContactedAt: contact.lastActivity,
      estimatedValue: contact.customFields?.find((f: any) => f.key === 'estimated_value')?.value,
      motivation: contact.customFields?.find((f: any) => f.key === 'motivation')?.value,
    }
  }

  private mapContactStatusToLeadStatus(status: string): Lead['status'] {
    const statusMap: Record<string, Lead['status']> = {
      'new': 'new',
      'open': 'contacted',
      'won': 'closed',
      'lost': 'dead',
      'abandoned': 'dead',
    }
    return statusMap[status?.toLowerCase()] || 'new'
  }

  private mapGHLOpportunityToDeal(opportunity: any): Deal {
    return {
      id: opportunity.id,
      leadId: opportunity.contactId,
      lead: {} as Lead, // Will be populated separately if needed
      pipelineId: opportunity.pipelineId,
      stageId: opportunity.pipelineStageId,
      title: opportunity.name,
      value: opportunity.monetaryValue || 0,
      createdAt: opportunity.createdAt,
      updatedAt: opportunity.updatedAt || opportunity.createdAt,
    }
  }

  private mapGHLCampaignToCampaign(campaign: any): Campaign {
    return {
      id: campaign.id,
      name: campaign.name,
      type: campaign.type || 'email',
      status: campaign.status || 'draft',
      startDate: campaign.createdAt,
      leadsGenerated: 0,
      createdAt: campaign.createdAt,
    }
  }
}

// Export singleton instance
export const ghlApi = new GHLApiService()

// Export class for testing
export { GHLApiService }
