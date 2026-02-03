// Lead Types
export interface Lead {
  id: string
  firstName: string
  lastName: string
  email: string
  phone: string
  address?: string
  city?: string
  state?: string
  zipCode?: string
  propertyType?: PropertyType
  source: LeadSource
  status: LeadStatus
  tags: string[]
  notes?: string
  assignedTo?: string
  createdAt: string
  updatedAt: string
  lastContactedAt?: string
  estimatedValue?: number
  motivation?: MotivationLevel
}

export type PropertyType =
  | 'single_family'
  | 'multi_family'
  | 'condo'
  | 'townhouse'
  | 'land'
  | 'commercial'
  | 'other'

export type LeadSource =
  | 'website'
  | 'referral'
  | 'direct_mail'
  | 'cold_call'
  | 'sms'
  | 'facebook'
  | 'google'
  | 'bandit_signs'
  | 'driving_for_dollars'
  | 'other'

export type LeadStatus =
  | 'new'
  | 'contacted'
  | 'qualified'
  | 'appointment_set'
  | 'offer_made'
  | 'under_contract'
  | 'closed'
  | 'dead'

export type MotivationLevel = 'low' | 'medium' | 'high' | 'very_high'

// Pipeline/Deal Types
export interface Deal {
  id: string
  leadId: string
  lead: Lead
  pipelineId: string
  stageId: string
  title: string
  value: number
  arv?: number
  repairCost?: number
  offerAmount?: number
  assignmentFee?: number
  closingDate?: string
  createdAt: string
  updatedAt: string
}

export interface Pipeline {
  id: string
  name: string
  stages: PipelineStage[]
}

export interface PipelineStage {
  id: string
  name: string
  order: number
  color: string
}

// Campaign Types
export interface Campaign {
  id: string
  name: string
  type: CampaignType
  status: CampaignStatus
  startDate: string
  endDate?: string
  budget?: number
  spent?: number
  leadsGenerated: number
  createdAt: string
}

export type CampaignType =
  | 'email'
  | 'sms'
  | 'direct_mail'
  | 'facebook'
  | 'google'
  | 'ringless_voicemail'

export type CampaignStatus = 'draft' | 'active' | 'paused' | 'completed'

// Support Ticket Types
export interface SupportTicket {
  id: string
  userId: string
  subject: string
  description: string
  category: TicketCategory
  priority: TicketPriority
  status: TicketStatus
  createdAt: string
  updatedAt: string
  resolvedAt?: string
  messages: TicketMessage[]
}

export interface TicketMessage {
  id: string
  ticketId: string
  senderId: string
  senderType: 'user' | 'support'
  message: string
  createdAt: string
}

export type TicketCategory =
  | 'technical'
  | 'billing'
  | 'feature_request'
  | 'integration'
  | 'training'
  | 'other'

export type TicketPriority = 'low' | 'medium' | 'high' | 'urgent'

export type TicketStatus = 'open' | 'in_progress' | 'waiting' | 'resolved' | 'closed'

// User Types
export interface User {
  id: string
  email: string
  name: string
  role: UserRole
  avatar?: string
  companyName?: string
  phone?: string
  createdAt: string
}

export type UserRole = 'admin' | 'user' | 'viewer'

// Dashboard Stats
export interface DashboardStats {
  totalLeads: number
  newLeadsThisMonth: number
  activeDeals: number
  totalDealValue: number
  closedDealsThisMonth: number
  closedDealValue: number
  activeCampaigns: number
  openTickets: number
  conversionRate: number
  avgDealValue: number
}

// API Response Types
export interface ApiResponse<T> {
  success: boolean
  data?: T
  error?: string
  message?: string
}

export interface PaginatedResponse<T> {
  data: T[]
  total: number
  page: number
  pageSize: number
  totalPages: number
}
