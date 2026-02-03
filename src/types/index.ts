// Contact types
export interface Contact {
  id: string
  firstName: string
  lastName: string
  name: string
  email: string
  phone: string
  tags: string[]
  source?: string
  dateAdded?: string
  lastActivity?: string
}

// Deal types
export interface Deal {
  id: string
  title: string
  value: number
  stageId: string
  pipelineId: string
  contactId?: string
  contactName?: string
  status: 'open' | 'won' | 'lost' | 'abandoned'
  createdAt?: string
  updatedAt?: string
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
