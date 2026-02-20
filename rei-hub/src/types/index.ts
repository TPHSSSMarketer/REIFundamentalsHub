// Contact types
export interface Contact {
  id: string
  name: string
  firstName?: string
  lastName?: string
  role: 'agent' | 'broker' | 'lender' | 'contractor' | 'wholesaler' | 'property_manager' | 'attorney' | 'cpa' | 'seller' | 'buyer' | 'partner'
  company?: string
  phone?: string
  email?: string
  tags?: string[]
  source?: string
  preferredChannel?: 'email' | 'phone' | 'sms' | 'telegram' | 'whatsapp'
  markets?: string[]
  notes?: string
  rating?: number
  lastContactedAt?: string
  interactionCount: number
  dateAdded: string
  lastActivity?: string
}

// Deal types
export interface Deal {
  id: string
  title: string
  address: string
  city?: string
  state?: string
  zip?: string
  stage: 'lead' | 'analysis' | 'offer' | 'under_contract' | 'due_diligence' | 'closing' | 'closed_won' | 'closed_lost'
  listPrice?: number
  purchasePrice?: number
  arv?: number
  rehabEstimate?: number
  allInCost?: number
  monthlyRent?: number
  cashOnCash?: number
  capRate?: number
  contactId?: string
  contactName?: string
  offerExpiresAt?: string
  inspectionDeadline?: string
  closingDate?: string
  source?: string
  notes?: string
  isUrgent: boolean
  passedReason?: string
  createdAt: string
  updatedAt: string
}

// Pipeline types
export interface Pipeline {
  id: string
  name: string
  stages: PipelineStage[]
}

export interface PipelineStage {
  id: string
  name: string
  order: number
}

// Location types
export interface Location {
  id: string
  name: string
  address?: string
  city?: string
  state?: string
  phone?: string
  email?: string
}

// Conversation types
export interface Conversation {
  id: string
  contactId: string
  type: 'SMS' | 'Email' | 'Call'
  lastMessageDate?: string
  unreadCount?: number
}

// Dashboard metrics
export interface DashboardMetrics {
  totalOpportunities: number
  activeDeals: number
  closedThisMonth: number
  pendingTasks: number
  pipelineValue: number
}

// Activity feed item
export interface Activity {
  id: string
  type: 'deal_created' | 'deal_updated' | 'contact_added' | 'message_sent' | 'task_completed'
  title: string
  description: string
  timestamp: string
  entityId?: string
  entityType?: 'deal' | 'contact' | 'task'
}

// Portfolio property types
export interface PortfolioProperty {
  id: string
  address: string
  city?: string
  state?: string
  zip?: string
  propertyType: 'single_family' | 'multi_family' | 'condo' | 'townhouse' | 'commercial' | 'land'
  units: number
  purchaseDate?: string
  purchasePrice?: number
  rehabCost?: number
  currentValue?: number
  loanBalance?: number
  monthlyMortgage?: number
  monthlyRent?: number
  notes?: string
  createdAt: string
  updatedAt: string
}

// Auth user (matches backend UserResponse)
export interface AuthUser {
  id: number
  email: string
  fullName: string | null
  isActive: boolean
  isVerified: boolean
  plan: string | null
}
