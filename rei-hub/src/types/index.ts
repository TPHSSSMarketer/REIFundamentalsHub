// Contact types
export interface Contact {
  id: string
  name: string
  firstName?: string
  lastName?: string
  role: 'agent' | 'broker' | 'lender' | 'contractor' | 'wholesaler' | 'property_manager' | 'attorney' | 'cpa' | 'seller' | 'buyer' | 'partner'
  company?: string
  buyingEntity?: string
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

// Buyer Criteria — stored per buyer contact for deal matching
export interface BuyerCriteria {
  id?: string
  buyerContactId: string
  propertyTypes?: string[]
  markets?: string[]
  conditionsAccepted?: string[]
  financingTypes?: string[]
  minBudget?: number
  maxBudget?: number
  timelineToPurchase?: string
  isActive?: boolean
}

// Deal File — photos and documents attached to deals
export interface DealFile {
  id: string
  dealId: string
  fileType: 'photo' | 'document'
  category: string  // photo: front, back, kitchen, living_room, bedroom_1, bedroom_2, bedroom_3, bathroom_1, bathroom_2, garage, yard, miscellaneous
                     // document: contract, inspection, title, appraisal, insurance, disclosure, other
  fileName: string
  mimeType: string
  fileSize: number
  fileContent?: string  // base64 (only on single-file fetch)
  thumbnail?: string    // base64 thumbnail (photos only)
  notes?: string
  transactionPhase?: 'buying' | 'selling' | 'holding'
  createdAt: string
}

// Deal Buyer Match — matched buyers for manual review & send
export interface DealBuyerMatch {
  id: string
  dealId: string
  buyerContactId: string
  buyerName?: string
  buyerEmail?: string
  buyingEntity?: string
  status: 'pending' | 'sent' | 'skipped'
  sentAt?: string
  createdAt: string
}

// Deal types
export interface Deal {
  id: string
  title: string
  address: string
  city?: string
  state?: string
  zip?: string
  stage: 'lead' | 'contacted' | 'analysis' | 'offer' | 'under_contract' | 'due_diligence' | 'closing' | 'closed_won' | 'closed_lost' | 'new_lead' | 'qualified' | 'sent_deals' | 'negotiating' | 'inactive' | 'pre_approved' | 'showing' | 'offer_received' | 'lost' | 'research' | 'auction' | 'won' | 'redemption_period' | 'clear_title' | 'disposed'

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

  // ── Property Details ──
  propertyType?: string
  bedrooms?: number
  bathrooms?: number
  squareFootage?: number
  lotSize?: string
  yearBuilt?: number
  garage?: string
  propertyCondition?: string
  occupancyStatus?: string
  repairsNeeded?: string
  specialFeatures?: string

  // ── Seller Motivation ──
  reasonForSelling?: string
  motivationLevel?: string
  timelineToSell?: string
  askingPrice?: number
  priceFlexible?: string
  howEstablishedPrice?: string
  bestCashOffer?: number
  whatIfDoesntSell?: string
  openToTerms?: string

  // ── Listing Information ──
  isListed?: string
  realtorName?: string
  realtorPhone?: string
  listingExpires?: string
  howLongListed?: string
  anyOffers?: string
  previousOfferAmount?: number

  // ── Homeowner Financials (liens now in DealLien model) ──
  backTaxes?: number
  liens?: DealLien[]

  // ── Foreclosure Details ──
  foreclosureStatus?: string
  auctionDate?: string
  reinstatementAmount?: number
  attorneyInvolved?: string
  attorneyName?: string
  attorneyPhone?: string

  // ── Additional ──
  asIsValue?: number
  exitStrategy?: string
  unitDetails?: string
  pipelineId?: string

  // ── Buyer Linking ──
  buyerId?: string
  buyerName?: string
  buyerType?: string  // investor, retail, wholesaler

  // ── Retail Buyer / Subject-To Details ──
  subjectToInterest?: string  // yes, no, maybe
  existingLoanServicer?: string
  dueOnSaleAware?: string  // yes, no
  insuranceAssignable?: string  // yes, no, unknown
  buyerDownPayment?: number
  sourceOfFunds?: string

  // ── Marketing / Campaign Tracking ──
  campaignId?: string
  campaignType?: string  // email, sms, direct_mail
  campaignName?: string

  // ── Front Photo (from deal list) ──
  frontPhotoThumbnail?: string  // base64 thumbnail of front-of-house photo

  // ── Location Coordinates ──
  latitude?: number | null
  longitude?: number | null

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
  sourceDealId?: string
  frontPhotoThumbnail?: string
  latitude?: number | null
  longitude?: number | null
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

// ── Flow Builder types ──────────────────────────────────

export type FlowNodeType =
  | 'greeting'
  | 'objective'
  | 'statement'
  | 'conversation'
  | 'switch'
  | 'true_false'
  | 'webhook'
  | 'delay'
  | 'stop'
  | 'transfer'

export interface ConversationFlow {
  id: string
  user_id: string
  name: string
  description?: string
  persona_id?: string
  is_active: boolean
  start_node_id?: string
  created_at: string
  updated_at: string
  status?: 'draft' | 'published'
  nodes?: FlowNode[]
  edges?: FlowEdge[]
}

export interface FlowNode {
  id: string
  flow_id: string
  node_type: FlowNodeType
  label: string
  position_x: number
  position_y: number
  // Objective fields
  objective_description?: string
  sensitivity?: number
  max_attempts?: number
  // Statement fields
  statement_text?: string
  // Switch fields
  switch_variable?: string
  switch_branches?: string
  // Webhook fields
  webhook_url?: string
  webhook_method?: string
  webhook_headers?: string
  // Delay fields
  delay_seconds?: number
  // Transfer fields
  transfer_to?: string
  created_at: string
  config?: Record<string, any>
}

export interface FlowEdge {
  id: string
  flow_id: string
  source_node_id: string
  target_node_id: string
  edge_label?: string
  condition?: string
  sort_order: number
}

export interface Persona {
  id: string
  user_id: string
  name: string
  tone?: string
  personality_traits?: string
  personality_prompt?: string
  response_style?: string
  response_length?: string
  description?: string
  quirks?: string
  created_at: string
  role?: string
  system_prompt?: string
  is_default?: boolean
  is_system?: boolean
  cloned_from?: string
  elevenlabs_voice_id?: string
  elevenlabs_agent_id?: string
}

export interface FlowExecution {
  id: string
  flow_id: string
  session_id?: string
  current_node_id?: string
  status: string
  variables?: string
  messages?: string
  started_at: string
  completed_at?: string
}

// ── AI Admin Assistant Types ─────────────────────────────────────

export interface AdminSession {
  id: string
  user_id: number
  title: string
  context_summary?: string
  is_active: boolean
  message_count: number
  created_at: string
  last_message_at?: string
}

export interface AdminMessage {
  id: string
  session_id: string
  role: 'user' | 'assistant' | 'system'
  content: string
  tool_calls?: Record<string, any>[]
  tokens_used?: number
  model_used?: string
  created_at: string
}

export interface AdminActionLog {
  id: string
  session_id?: string
  action_type: string
  action_name: string
  risk_level: 'LOW' | 'MEDIUM' | 'HIGH'
  proposed_details?: Record<string, any>
  approved?: boolean | null
  approval_method?: string
  approval_message?: string
  execution_status: 'pending' | 'approved' | 'executing' | 'success' | 'failed' | 'rejected'
  result_data?: Record<string, any>
  error_message?: string
  created_at: string
  approved_at?: string
  executed_at?: string
}

export interface AdminTrustSetting {
  action_type: string
  risk_level: 'LOW' | 'MEDIUM' | 'HIGH'
  trust_level: 'auto' | 'ask' | 'never'
  approval_count: number
  rejection_count: number
  suggested_auto: boolean
  last_approved_at?: string
}

export interface AdminSkill {
  id: string
  user_id?: number
  name: string
  description: string
  category: string
  is_system: boolean
  action_steps: Record<string, any>[]
  trigger_conditions?: Record<string, any>
  icon?: string
  enabled: boolean
  total_runs: number
  last_run_at?: string
  created_at: string
}

export interface AdminScheduledTask {
  id: string
  user_id: number
  skill_id: string
  name: string
  description?: string
  cron_expression: string
  timezone: string
  enabled: boolean
  last_run_at?: string
  next_run_at?: string
  last_run_status?: string
  total_runs: number
  created_at: string
}

// ── Deal Liens (dynamic, replaces hardcoded mortgage fields) ──

export interface DealLien {
  id: string
  dealId: string
  lienType: string
  lienHolder: string
  accountNumber?: string
  balance?: number
  monthlyPayment?: number
  interestRate?: number
  loanDate?: string
  maturityDate?: string
  status?: string
  paymentsCurrent?: string
  monthsBehind?: number
  amountBehind?: number
  loanType?: string
  prepaymentPenalty?: string
  taxesInsuranceIncluded?: string
  notes?: string
  sortOrder: number
  createdAt?: string
  updatedAt?: string
}

// ── Negotiation Service Types ──

export interface NegotiationRequest {
  id: string
  dealId: string
  userId: number
  lienIds: string[]
  serviceTypes: string[]
  message?: string
  status: 'pending' | 'accepted' | 'info_requested' | 'declined'
  propertyAddress?: string
  propertyCity?: string
  propertyState?: string
  createdAt: string
  updatedAt: string
}

export interface NegotiationCase {
  id: string
  requestId: string
  dealId: string
  userId: number
  serviceType: 'bank' | 'county_tax' | 'other_lien'
  status: 'intake' | 'researching' | 'in_progress' | 'awaiting_response' | 'resolved' | 'closed'
  priority: 'low' | 'normal' | 'high' | 'urgent'
  propertyAddress?: string
  assignedAt?: string
  resolvedAt?: string
  createdAt: string
  updatedAt: string
}

export interface NegotiationActivity {
  id: string
  caseId: string
  activityType: string
  // Admin sees adminNote; user sees userSummary
  adminNote?: string
  userSummary?: string
  sendMethod?: string
  uspsTrackingNumber?: string
  uspsSignatureTrackingNumber?: string
  trackingStatus?: string
  uspsDeliveredDate?: string
  uspsSignedBy?: string
  attachments?: { fileName: string; fileType: string; dealFileId: string }[]
  createdBy: string
  createdAt: string
}

export interface NegotiationMessage {
  id: string
  caseId: string
  senderId: number
  senderRole: 'admin' | 'user'
  content: string
  readAt?: string
  createdAt: string
}

export interface NegotiationRecipient {
  id: string
  caseId: string
  recipientType: 'ceo' | 'general_counsel' | 'registered_agent' | 'respa_address'
  name?: string
  title?: string
  mailingAddress?: string
  mailingCity?: string
  mailingState?: string
  mailingZip?: string
  phone?: string
  fax?: string
  email?: string
  confidence?: 'high' | 'medium' | 'low'
  sources?: string[]
  createdAt?: string
  updatedAt?: string
}
