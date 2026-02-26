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

  // ── Pricing & Valuation ──
  listPrice?: number
  offerPrice?: number
  purchasePrice?: number          // final contract price
  arv?: number                    // after-repair value

  // ── Acquisition Costs ──
  earnestMoney?: number           // earnest money deposit
  downPayment?: number            // cash down at closing
  closingCostsBuyer?: number      // title, escrow, recording, etc.
  loanOriginationFee?: number     // points / origination
  appraisalFee?: number
  inspectionFee?: number
  titleInsurance?: number
  attorneyFee?: number
  surveyFee?: number
  otherAcquisitionCosts?: number  // catch-all for misc acquisition

  // ── Rehab / Renovation ──
  rehabEstimate?: number          // estimated rehab budget
  rehabActual?: number            // actual rehab spent
  permitFees?: number
  architectFees?: number
  holdingCostsDuringRehab?: number // insurance, utilities, loan payments during rehab

  // ── Financing ──
  loanAmount?: number
  interestRate?: number           // annual % (e.g. 7.5)
  loanTermMonths?: number         // e.g. 360 for 30-year
  monthlyMortgagePI?: number      // principal + interest
  pmiMonthly?: number             // private mortgage insurance

  // ── Monthly Operating Expenses ──
  propertyTaxAnnual?: number
  insuranceAnnual?: number
  propertyMgmtPercent?: number    // % of rent (e.g. 10)
  propertyMgmtFlat?: number       // OR flat monthly fee
  vacancyPercent?: number         // reserve % (e.g. 8)
  maintenancePercent?: number     // maintenance + CapEx reserve % (e.g. 10)
  hoaMonthly?: number
  utilitiesMonthly?: number       // if landlord-paid
  otherExpensesMonthly?: number

  // ── Income ──
  monthlyRent?: number
  otherMonthlyIncome?: number     // laundry, parking, storage, etc.

  // ── Computed / Summary (can be stored or calculated) ──
  allInCost?: number              // total cash invested (down + closing + rehab + holding)
  totalMonthlyExpenses?: number
  monthlyCashFlow?: number
  annualCashFlow?: number
  cashOnCash?: number             // annual cash flow / total cash invested × 100
  capRate?: number                // NOI / purchase price × 100
  roiPercent?: number             // (ARV − allInCost) / allInCost × 100
  debtServiceCoverageRatio?: number // NOI / annual debt service

  // ── Deal Info ──
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

// Market tracking
export interface MarketData {
  id: string
  city: string
  state: string
  medianHomePrice: number
  medianRent: number
  rentToPriceRatio: number
  avgDaysOnMarket: number
  inventoryCount: number
  priceChangePct: number
  notes?: string
  addedAt: string
}
