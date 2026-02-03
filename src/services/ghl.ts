import axios, { AxiosInstance } from 'axios'
import type { Contact, Deal, Pipeline, PipelineStage, Location, Conversation } from '@/types'

/**
 * GoHighLevel API Service
 * Wrapper for all GHL REST API interactions
 */
class GHLService {
  private client: AxiosInstance
  private locationId: string

  constructor() {
    this.locationId = import.meta.env.VITE_GHL_LOCATION_ID || ''

    this.client = axios.create({
      baseURL: import.meta.env.VITE_GHL_API_BASE_URL || 'https://services.leadconnectorhq.com',
      headers: {
        'Authorization': `Bearer ${import.meta.env.VITE_GHL_API_KEY}`,
        'Content-Type': 'application/json',
        'Version': import.meta.env.VITE_GHL_API_VERSION || '2021-07-28',
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

  // ============ CONNECTION TEST ============

  async testConnection(): Promise<boolean> {
    try {
      // Try to fetch location info to test connection
      if (!this.locationId) {
        console.warn('No location ID configured')
        return true // Allow app to run without location for demo
      }
      await this.client.get(`/locations/${this.locationId}`)
      return true
    } catch (error) {
      console.error('Connection test failed:', error)
      // Return true for demo mode if no API key
      if (!import.meta.env.VITE_GHL_API_KEY) {
        return true
      }
      return false
    }
  }

  // ============ LOCATIONS ============

  async getLocations(): Promise<Location[]> {
    const response = await this.client.get('/locations/search')
    return response.data.locations || []
  }

  async getLocation(locationId: string): Promise<Location> {
    const response = await this.client.get(`/locations/${locationId}`)
    return response.data.location
  }

  setLocationId(locationId: string) {
    this.locationId = locationId
  }

  // ============ PIPELINES ============

  async getPipelines(): Promise<Pipeline[]> {
    const response = await this.client.get('/opportunities/pipelines', {
      params: { locationId: this.locationId },
    })
    return response.data.pipelines || []
  }

  async getPipelineStages(pipelineId: string): Promise<PipelineStage[]> {
    const pipelines = await this.getPipelines()
    const pipeline = pipelines.find(p => p.id === pipelineId)
    return pipeline?.stages || []
  }

  // ============ DEALS/OPPORTUNITIES ============

  async getDeals(pipelineId?: string): Promise<Deal[]> {
    const response = await this.client.get('/opportunities/search', {
      params: {
        locationId: this.locationId,
        pipelineId,
      },
    })
    return (response.data.opportunities || []).map(this.mapOpportunityToDeal)
  }

  async getDeal(dealId: string): Promise<Deal> {
    const response = await this.client.get(`/opportunities/${dealId}`)
    return this.mapOpportunityToDeal(response.data.opportunity)
  }

  async createDeal(deal: Partial<Deal>): Promise<Deal> {
    const response = await this.client.post('/opportunities/', {
      locationId: this.locationId,
      pipelineId: deal.pipelineId,
      pipelineStageId: deal.stageId,
      contactId: deal.contactId,
      name: deal.title,
      monetaryValue: deal.value,
      status: 'open',
    })
    return this.mapOpportunityToDeal(response.data.opportunity)
  }

  async updateDeal(dealId: string, updates: Partial<Deal>): Promise<Deal> {
    const response = await this.client.put(`/opportunities/${dealId}`, {
      pipelineStageId: updates.stageId,
      name: updates.title,
      monetaryValue: updates.value,
      status: updates.status,
    })
    return this.mapOpportunityToDeal(response.data.opportunity)
  }

  async updateDealStage(dealId: string, stageId: string): Promise<Deal> {
    const response = await this.client.put(`/opportunities/${dealId}/status`, {
      pipelineStageId: stageId,
    })
    return this.mapOpportunityToDeal(response.data.opportunity)
  }

  async deleteDeal(dealId: string): Promise<void> {
    await this.client.delete(`/opportunities/${dealId}`)
  }

  // ============ CONTACTS ============

  async getContacts(params?: {
    limit?: number
    offset?: number
    query?: string
  }): Promise<{ contacts: Contact[]; total: number }> {
    const response = await this.client.get('/contacts/', {
      params: {
        locationId: this.locationId,
        limit: params?.limit || 100,
        skip: params?.offset || 0,
        query: params?.query,
      },
    })
    return {
      contacts: (response.data.contacts || []).map(this.mapGHLContact),
      total: response.data.total || 0,
    }
  }

  async getContact(contactId: string): Promise<Contact> {
    const response = await this.client.get(`/contacts/${contactId}`)
    return this.mapGHLContact(response.data.contact)
  }

  async createContact(contact: Partial<Contact>): Promise<Contact> {
    const response = await this.client.post('/contacts/', {
      locationId: this.locationId,
      firstName: contact.firstName,
      lastName: contact.lastName,
      email: contact.email,
      phone: contact.phone,
      tags: contact.tags,
      source: contact.source,
    })
    return this.mapGHLContact(response.data.contact)
  }

  async updateContact(contactId: string, contact: Partial<Contact>): Promise<Contact> {
    const response = await this.client.put(`/contacts/${contactId}`, {
      firstName: contact.firstName,
      lastName: contact.lastName,
      email: contact.email,
      phone: contact.phone,
      tags: contact.tags,
    })
    return this.mapGHLContact(response.data.contact)
  }

  async deleteContact(contactId: string): Promise<void> {
    await this.client.delete(`/contacts/${contactId}`)
  }

  async searchContacts(query: string): Promise<Contact[]> {
    const response = await this.client.get('/contacts/', {
      params: {
        locationId: this.locationId,
        query,
        limit: 50,
      },
    })
    return (response.data.contacts || []).map(this.mapGHLContact)
  }

  // ============ CONVERSATIONS/MESSAGING ============

  async getConversations(contactId?: string): Promise<Conversation[]> {
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

  // ============ TASKS ============

  async getTasks(): Promise<any[]> {
    const response = await this.client.get('/contacts/tasks', {
      params: { locationId: this.locationId },
    })
    return response.data.tasks || []
  }

  async createTask(task: {
    title: string
    contactId?: string
    dueDate?: string
    description?: string
  }): Promise<any> {
    const response = await this.client.post('/contacts/tasks', {
      locationId: this.locationId,
      ...task,
    })
    return response.data.task
  }

  // ============ MAPPING FUNCTIONS ============

  private mapGHLContact = (contact: any): Contact => ({
    id: contact.id,
    firstName: contact.firstName || '',
    lastName: contact.lastName || '',
    name: `${contact.firstName || ''} ${contact.lastName || ''}`.trim() || 'Unknown',
    email: contact.email || '',
    phone: contact.phone || '',
    tags: contact.tags || [],
    source: contact.source || '',
    dateAdded: contact.dateAdded,
    lastActivity: contact.lastActivity,
  })

  private mapOpportunityToDeal = (opp: any): Deal => ({
    id: opp.id,
    title: opp.name || 'Untitled Deal',
    value: opp.monetaryValue || 0,
    stageId: opp.pipelineStageId,
    pipelineId: opp.pipelineId,
    contactId: opp.contactId,
    contactName: opp.contact?.name || opp.contact?.firstName || 'Unknown',
    status: opp.status || 'open',
    createdAt: opp.createdAt,
    updatedAt: opp.updatedAt,
  })
}

// Export singleton instance
export const ghlService = new GHLService()

// Export class for testing
export { GHLService }
