import axios, { AxiosInstance } from 'axios'
import type { Contact, Deal, Pipeline, PipelineStage, Location, Conversation } from '@/types'

/**
 * REI Fundamentals Hub — CRM API Service
 * Wrapper for CRM REST API interactions (contacts, deals, messaging).
 * The base URL is set via VITE_API_BASE_URL environment variable.
 */
class ApiService {
  private client: AxiosInstance
  private locationId: string

  constructor() {
    this.locationId = import.meta.env.VITE_API_LOCATION_ID || ''

    this.client = axios.create({
      baseURL: import.meta.env.VITE_API_BASE_URL || '',
      headers: {
        'Authorization': `Bearer ${import.meta.env.VITE_API_KEY}`,
        'Content-Type': 'application/json',
        'Version': import.meta.env.VITE_API_VERSION || '2021-07-28',
      },
    })

    // Response interceptor for error handling
    this.client.interceptors.response.use(
      (response) => response,
      (error) => {
        console.error('API Error:', error.response?.data || error.message)
        throw error
      }
    )
  }

  // ============ CONNECTION TEST ============

  async testConnection(): Promise<boolean> {
    try {
      if (!this.locationId) {
        console.warn('No location ID configured')
        return true
      }
      await this.client.get(`/locations/${this.locationId}`)
      return true
    } catch (error) {
      console.error('Connection test failed:', error)
      if (!import.meta.env.VITE_API_KEY) {
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
      pipelineStageId: deal.stage,
      contactId: deal.contactId,
      name: deal.title,
      monetaryValue: deal.purchasePrice,
      status: 'open',
    })
    return this.mapOpportunityToDeal(response.data.opportunity)
  }

  async updateDeal(dealId: string, updates: Partial<Deal>): Promise<Deal> {
    const response = await this.client.put(`/opportunities/${dealId}`, {
      pipelineStageId: updates.stage,
      name: updates.title,
      monetaryValue: updates.purchasePrice,
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
      contacts: (response.data.contacts || []).map(this.mapContact),
      total: response.data.total || 0,
    }
  }

  async getContact(contactId: string): Promise<Contact> {
    const response = await this.client.get(`/contacts/${contactId}`)
    return this.mapContact(response.data.contact)
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
    return this.mapContact(response.data.contact)
  }

  async updateContact(contactId: string, contact: Partial<Contact>): Promise<Contact> {
    const response = await this.client.put(`/contacts/${contactId}`, {
      firstName: contact.firstName,
      lastName: contact.lastName,
      email: contact.email,
      phone: contact.phone,
      tags: contact.tags,
    })
    return this.mapContact(response.data.contact)
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
    return (response.data.contacts || []).map(this.mapContact)
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

  private mapContact = (contact: any): Contact => ({
    id: contact.id,
    firstName: contact.firstName || '',
    lastName: contact.lastName || '',
    name: `${contact.firstName || ''} ${contact.lastName || ''}`.trim() || 'Unknown',
    role: contact.role || 'seller',
    email: contact.email || '',
    phone: contact.phone || '',
    tags: contact.tags || [],
    source: contact.source || '',
    interactionCount: contact.interactionCount ?? 0,
    dateAdded: contact.dateAdded || new Date().toISOString(),
    lastActivity: contact.lastActivity,
  })

  private mapOpportunityToDeal = (opp: any): Deal => ({
    id: opp.id,
    title: opp.name || 'Untitled Deal',
    address: opp.address || opp.name || '',
    stage: opp.pipelineStageId || 'lead',
    purchasePrice: opp.monetaryValue || 0,
    contactId: opp.contactId,
    contactName: opp.contact?.name || opp.contact?.firstName || 'Unknown',
    isUrgent: opp.isUrgent ?? false,
    createdAt: opp.createdAt || new Date().toISOString(),
    updatedAt: opp.updatedAt || new Date().toISOString(),
  })
}

// Export singleton instance
export const apiService = new ApiService()

// Export class for testing
export { ApiService }
