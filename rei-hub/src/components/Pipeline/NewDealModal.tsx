import { useState, useMemo, useRef, useEffect } from 'react'
import { X, DollarSign, ChevronDown, ChevronUp, Percent } from 'lucide-react'
import { useCreateDeal } from '@/hooks/useApi'
import { mockPipelines } from '@/data/mockData'
import type { Deal, Contact } from '@/types'

interface NewDealModalProps {
  isOpen: boolean
  onClose: () => void
  contacts: Contact[]
  pipelineId?: string
}

// Helper component: TextField
function TextField({
  label,
  value,
  onChange,
  placeholder = '',
  className = '',
  required = false,
}: {
  label: string
  value: string
  onChange: (value: string) => void
  placeholder?: string
  className?: string
  required?: boolean
}) {
  return (
    <div className={className}>
      <label className="block text-sm font-medium text-slate-700 mb-1">
        {label}
        {required && <span className="text-red-500">*</span>}
      </label>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
      />
    </div>
  )
}

// Helper component: NumberField
function NumberField({
  label,
  value,
  onChange,
  placeholder = '',
  prefix = '',
  suffix = '',
  className = '',
  required = false,
}: {
  label: string
  value: string
  onChange: (value: string) => void
  placeholder?: string
  prefix?: string
  suffix?: string
  className?: string
  required?: boolean
}) {
  return (
    <div className={className}>
      <label className="block text-sm font-medium text-slate-700 mb-1">
        {label}
        {required && <span className="text-red-500">*</span>}
      </label>
      <div className="relative">
        {prefix && (
          <div className="absolute left-3 top-2 text-slate-500">
            {prefix === '$' && <DollarSign size={18} />}
            {prefix === '%' && <Percent size={18} />}
          </div>
        )}
        <input
          type="number"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className={`w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent ${
            prefix ? 'pl-10' : ''
          } ${suffix ? 'pr-10' : ''}`}
        />
        {suffix && <div className="absolute right-3 top-2 text-slate-500">{suffix}</div>}
      </div>
    </div>
  )
}

// Helper component: SelectField
function SelectField({
  label,
  value,
  onChange,
  options,
  className = '',
  required = false,
}: {
  label: string
  value: string
  onChange: (value: string) => void
  options: { label: string; value: string }[]
  className?: string
  required?: boolean
}) {
  return (
    <div className={className}>
      <label className="block text-sm font-medium text-slate-700 mb-1">
        {label}
        {required && <span className="text-red-500">*</span>}
      </label>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
      >
        <option value="">Select {label}</option>
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
    </div>
  )
}

// Helper component: TextareaField
function TextareaField({
  label,
  value,
  onChange,
  placeholder = '',
  className = '',
}: {
  label: string
  value: string
  onChange: (value: string) => void
  placeholder?: string
  className?: string
}) {
  return (
    <div className={className}>
      <label className="block text-sm font-medium text-slate-700 mb-1">
        {label}
      </label>
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        rows={3}
        className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
      />
    </div>
  )
}

// Helper component: CollapsibleSection
function CollapsibleSection({
  title,
  isOpen,
  onToggle,
  children,
}: {
  title: string
  isOpen: boolean
  onToggle: () => void
  children: React.ReactNode
}) {
  return (
    <div className="border border-slate-200 rounded-lg overflow-hidden">
      <button
        type="button"
        onClick={onToggle}
        className="w-full bg-slate-50 px-4 py-3 flex items-center justify-between hover:bg-slate-100 transition"
      >
        <h3 className="font-semibold text-slate-700">{title}</h3>
        {isOpen ? (
          <ChevronUp size={20} className="text-slate-600" />
        ) : (
          <ChevronDown size={20} className="text-slate-600" />
        )}
      </button>
      {isOpen && <div className="p-4 bg-white">{children}</div>}
    </div>
  )
}

export default function NewDealModal({
  isOpen,
  onClose,
  contacts,
  pipelineId,
}: NewDealModalProps) {
  const createDeal = useCreateDeal()
  const [formData, setFormData] = useState<Record<string, string>>({})
  const [openSections, setOpenSections] = useState<Record<string, boolean>>({})
  const [selectedContact, setSelectedContact] = useState<Contact | null>(null)
  const [showContactDropdown, setShowContactDropdown] = useState(false)
  const contactInputRef = useRef<HTMLInputElement>(null)

  // Get dynamic stage options based on active pipeline
  const stageOptions = useMemo(() => {
    const pipeline = mockPipelines.find((p) => p.id === pipelineId)
    if (!pipeline) return mockPipelines[0].stages
    return pipeline.stages
  }, [pipelineId])

  // Set default stage on mount or when pipelineId changes
  useEffect(() => {
    if (!formData.stage && stageOptions.length > 0) {
      setFormData((prev) => ({
        ...prev,
        stage: stageOptions[0].id,
        pipeline_id: pipelineId || mockPipelines[0].id,
      }))
    }
  }, [pipelineId, stageOptions])

  const activePipelineId = pipelineId || mockPipelines[0]?.id || 'pipeline-deals'

  // Which sections to show per pipeline
  const PIPELINE_SECTIONS: Record<string, string[]> = {
    'pipeline-deals': ['property_details', 'seller_motivation', 'listing_information', 'homeowner_financials', 'foreclosure_details', 'deal_financials'],
    'pipeline-investor-buyers': ['buyer_criteria', 'deal_financials'],
    'pipeline-retail-buyers': ['buyer_criteria', 'deal_financials'],
    'pipeline-tax-deals': ['property_details', 'foreclosure_details', 'deal_financials'],
  }
  const visibleSections = PIPELINE_SECTIONS[activePipelineId] || PIPELINE_SECTIONS['pipeline-deals']
  const showSection = (key: string) => visibleSections.includes(key)

  const setField = (key: string, value: string) => {
    setFormData((prev) => ({ ...prev, [key]: value }))
  }

  const toggleSection = (key: string) => {
    setOpenSections((prev) => ({ ...prev, [key]: !prev[key] }))
  }

  // Contact search logic
  const filteredContacts = useMemo(() => {
    if (!formData.contact_id) return contacts
    const searchTerm = formData.contact_id.toLowerCase()
    return contacts.filter(
      (c) =>
        c.name?.toLowerCase().includes(searchTerm) ||
        c.email?.toLowerCase().includes(searchTerm) ||
        c.phone?.includes(searchTerm)
    )
  }, [formData.contact_id, contacts])

  const handleSelectContact = (contact: Contact) => {
    setSelectedContact(contact)
    setField('contact_id', contact.id)
    setShowContactDropdown(false)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    // Validate required fields
    if (!formData.address || !formData.city || !formData.state || !formData.zip) {
      alert('Please fill in all required fields: Address, City, State, ZIP')
      return
    }

    // Build deal object with camelCase keys (matches Deal interface)
    const dealData: Partial<Deal> = {
      title: formData.address,
      address: formData.address,
      city: formData.city,
      state: formData.state,
      zip: formData.zip,
      stage: (formData.stage || stageOptions[0]?.id || 'lead') as Deal['stage'],
      pipelineId: pipelineId || mockPipelines[0].id,
      contactId: selectedContact?.id || undefined,
      contactName: selectedContact?.name || undefined,
      source: formData.source || undefined,
      notes: formData.notes || undefined,
      isUrgent: formData.is_urgent === 'true',

      // Property Details
      propertyType: formData.property_type || undefined,
      bedrooms: formData.bedrooms ? parseInt(formData.bedrooms, 10) : undefined,
      bathrooms: formData.bathrooms ? parseFloat(formData.bathrooms) : undefined,
      squareFootage: formData.square_footage ? parseInt(formData.square_footage, 10) : undefined,
      lotSize: formData.lot_size || undefined,
      yearBuilt: formData.year_built ? parseInt(formData.year_built, 10) : undefined,
      garage: formData.garage || undefined,
      propertyCondition: formData.property_condition || undefined,
      occupancyStatus: formData.occupancy_status || undefined,
      repairsNeeded: formData.repairs_needed || undefined,
      specialFeatures: formData.special_features || undefined,

      // Seller Motivation
      reasonForSelling: formData.reason_for_selling || undefined,
      motivationLevel: formData.motivation_level || undefined,
      timelineToSell: formData.timeline_to_sell || undefined,
      askingPrice: formData.asking_price ? parseFloat(formData.asking_price) : undefined,
      priceFlexible: formData.price_flexible || undefined,
      howEstablishedPrice: formData.how_established_price || undefined,
      bestCashOffer: formData.best_cash_offer ? parseFloat(formData.best_cash_offer) : undefined,
      openToTerms: formData.open_to_terms || undefined,
      whatIfDoesntSell: formData.what_if_doesnt_sell || undefined,

      // Listing Information
      isListed: formData.is_listed || undefined,
      realtorName: formData.realtor_name || undefined,
      realtorPhone: formData.realtor_phone || undefined,
      howLongListed: formData.how_long_listed || undefined,
      listingExpires: formData.listing_expires || undefined,
      anyOffers: formData.any_offers || undefined,
      previousOfferAmount: formData.previous_offer_amount
        ? parseFloat(formData.previous_offer_amount)
        : undefined,

      // Homeowner Financials
      mortgageBalance: formData.mortgage_balance ? parseFloat(formData.mortgage_balance) : undefined,
      mortgageBalance2nd: formData.mortgage_balance_2nd
        ? parseFloat(formData.mortgage_balance_2nd)
        : undefined,
      monthlyMortgagePayment: formData.monthly_mortgage_payment
        ? parseFloat(formData.monthly_mortgage_payment)
        : undefined,
      taxesInsuranceIncluded: formData.taxes_insurance_included || undefined,
      monthlyTaxAmount: formData.monthly_tax_amount
        ? parseFloat(formData.monthly_tax_amount)
        : undefined,
      monthlyInsuranceAmount: formData.monthly_insurance_amount
        ? parseFloat(formData.monthly_insurance_amount)
        : undefined,
      interestRate1st: formData.interest_rate_1st
        ? parseFloat(formData.interest_rate_1st)
        : undefined,
      interestRate2nd: formData.interest_rate_2nd
        ? parseFloat(formData.interest_rate_2nd)
        : undefined,
      loanType: formData.loan_type || undefined,
      prepaymentPenalty: formData.prepayment_penalty || undefined,
      mortgageCompany1st: formData.mortgage_company_1st || undefined,
      mortgageCompany2nd: formData.mortgage_company_2nd || undefined,
      paymentsCurrent: formData.payments_current || undefined,
      monthsBehind: formData.months_behind ? parseInt(formData.months_behind, 10) : undefined,
      amountBehind: formData.amount_behind ? parseFloat(formData.amount_behind) : undefined,
      backTaxes: formData.back_taxes ? parseFloat(formData.back_taxes) : undefined,
      otherLiens: formData.other_liens || undefined,
      otherLienAmount: formData.other_lien_amount
        ? parseFloat(formData.other_lien_amount)
        : undefined,

      // Foreclosure Details
      foreclosureStatus: formData.foreclosure_status || undefined,
      auctionDate: formData.auction_date || undefined,
      reinstatementAmount: formData.reinstatement_amount
        ? parseFloat(formData.reinstatement_amount)
        : undefined,
      attorneyInvolved: formData.attorney_involved || undefined,
      attorneyName: formData.attorney_name || undefined,
      attorneyPhone: formData.attorney_phone || undefined,

      // Deal Financials
      asIsValue: formData.as_is_value ? parseFloat(formData.as_is_value) : undefined,
      exitStrategy: formData.exit_strategy || undefined,
      listPrice: formData.list_price ? parseFloat(formData.list_price) : undefined,
      purchasePrice: formData.purchase_price ? parseFloat(formData.purchase_price) : undefined,
      arv: formData.arv ? parseFloat(formData.arv) : undefined,
      rehabEstimate: formData.rehab_estimate ? parseFloat(formData.rehab_estimate) : undefined,
      monthlyRent: formData.monthly_rent ? parseFloat(formData.monthly_rent) : undefined,
      offerPrice: formData.offer_price ? parseFloat(formData.offer_price) : undefined,
      downPayment: formData.down_payment ? parseFloat(formData.down_payment) : undefined,
      earnestMoney: formData.earnest_money ? parseFloat(formData.earnest_money) : undefined,
      closingCostsBuyer: formData.closing_costs_buyer
        ? parseFloat(formData.closing_costs_buyer)
        : undefined,
      loanAmount: formData.loan_amount ? parseFloat(formData.loan_amount) : undefined,
      interestRate: formData.interest_rate ? parseFloat(formData.interest_rate) : undefined,
      loanTermMonths: formData.loan_term_months ? parseInt(formData.loan_term_months, 10) : undefined,
      propertyTaxAnnual: formData.property_tax_annual
        ? parseFloat(formData.property_tax_annual)
        : undefined,
      insuranceAnnual: formData.insurance_annual
        ? parseFloat(formData.insurance_annual)
        : undefined,
    }

    try {
      await createDeal.mutateAsync(dealData)
      setFormData({})
      setSelectedContact(null)
      onClose()
    } catch (error) {
      console.error('Failed to create deal:', error)
      alert('Failed to create deal. Please try again.')
    }
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-5xl w-full max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="sticky top-0 bg-white border-b border-slate-200 px-6 py-4 flex items-center justify-between">
          <h2 className="text-2xl font-bold text-slate-900">
            {activePipelineId === 'pipeline-investor-buyers' ? 'Add Investor Buyer' :
             activePipelineId === 'pipeline-retail-buyers' ? 'Add Retail Buyer' :
             activePipelineId === 'pipeline-tax-deals' ? 'Add Tax Deal' :
             'Create New Deal'}
          </h2>
          <button
            onClick={onClose}
            className="text-slate-500 hover:text-slate-700 transition"
          >
            <X size={24} />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {/* Top Area - Always Visible */}
          <div className="space-y-4 bg-slate-50 p-4 rounded-lg border border-slate-200">
            <div className="grid grid-cols-4 gap-3">
              <TextField
                label="Address"
                value={formData.address || ''}
                onChange={(val) => setField('address', val)}
                placeholder="123 Main St"
                required
                className="col-span-2"
              />
              <TextField
                label="City"
                value={formData.city || ''}
                onChange={(val) => setField('city', val)}
                placeholder="Los Angeles"
                required
              />
              <TextField
                label="State"
                value={formData.state || ''}
                onChange={(val) => setField('state', val)}
                placeholder="CA"
                required
              />
            </div>

            <div className="grid grid-cols-4 gap-3">
              <TextField
                label="ZIP"
                value={formData.zip || ''}
                onChange={(val) => setField('zip', val)}
                placeholder="90001"
                required
              />
              <SelectField
                label="Stage"
                value={formData.stage || (stageOptions.length > 0 ? stageOptions[0].id : '')}
                onChange={(val) => setField('stage', val)}
                options={stageOptions.map((s) => ({ label: s.name, value: s.id }))}
                required
              />
              <SelectField
                label="Source"
                value={formData.source || ''}
                onChange={(val) => setField('source', val)}
                options={[
                  { label: 'Direct Mail', value: 'direct_mail' },
                  { label: 'Phone Call', value: 'phone_call' },
                  { label: 'Website', value: 'website' },
                  { label: 'Referral', value: 'referral' },
                  { label: 'MLS', value: 'mls' },
                  { label: 'Other', value: 'other' },
                ]}
              />
              <div className="flex items-end">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={formData.is_urgent === 'true'}
                    onChange={(e) => setField('is_urgent', e.target.checked ? 'true' : 'false')}
                    className="w-4 h-4 rounded border-slate-300"
                  />
                  <span className="text-sm font-medium text-slate-700">Is Urgent</span>
                </label>
              </div>
            </div>

            {/* Contact Search */}
            <div className="relative">
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Contact
              </label>
              <input
                ref={contactInputRef}
                type="text"
                placeholder="Search by name, email, or phone"
                onFocus={() => setShowContactDropdown(true)}
                onChange={(e) => {
                  setField('contact_id', e.target.value)
                  setShowContactDropdown(true)
                }}
                value={selectedContact ? selectedContact.name : formData.contact_id || ''}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
              />
              {showContactDropdown && filteredContacts.length > 0 && (
                <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-slate-300 rounded-lg shadow-lg z-10 max-h-48 overflow-y-auto">
                  {filteredContacts.map((contact) => (
                    <button
                      key={contact.id}
                      type="button"
                      onClick={() => handleSelectContact(contact)}
                      className="w-full text-left px-3 py-2 hover:bg-slate-100 transition border-b border-slate-100 last:border-0"
                    >
                      <div className="font-medium text-slate-900">{contact.name}</div>
                      <div className="text-sm text-slate-500">
                        {contact.email} {contact.phone && `• ${contact.phone}`}
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>

            <TextareaField
              label="Notes"
              value={formData.notes || ''}
              onChange={(val) => setField('notes', val)}
              placeholder="Add any additional notes..."
            />
          </div>

          {/* Section: Buyer Criteria (Investor & Retail Buyers only) */}
          {showSection('buyer_criteria') && (
          <CollapsibleSection
            title="Buyer Criteria"
            isOpen={openSections['buyer_criteria'] || false}
            onToggle={() => toggleSection('buyer_criteria')}
          >
            <div className="grid grid-cols-2 gap-3">
              <NumberField
                label="Max Budget"
                value={formData.asking_price || ''}
                onChange={(val) => setField('asking_price', val)}
                prefix="$"
                placeholder="0"
              />
              <SelectField
                label="Financing Type"
                value={formData.loan_type || ''}
                onChange={(val) => setField('loan_type', val)}
                options={[
                  { label: 'Cash', value: 'cash' },
                  { label: 'Conventional', value: 'conventional' },
                  { label: 'FHA', value: 'fha' },
                  { label: 'VA', value: 'va' },
                  { label: 'Hard Money', value: 'hard_money' },
                  { label: 'Private Money', value: 'private_money' },
                ]}
              />
              <SelectField
                label="Property Types Wanted"
                value={formData.property_type || ''}
                onChange={(val) => setField('property_type', val)}
                options={[
                  { label: 'SFR (Single Family)', value: 'sfr' },
                  { label: 'Multi-Family', value: 'multi_family' },
                  { label: 'Condo/Townhouse', value: 'condo_townhouse' },
                  { label: 'Mobile Home', value: 'mobile_home' },
                  { label: 'Land', value: 'land' },
                  { label: 'Any', value: 'any' },
                ]}
              />
              <SelectField
                label="Property Condition Accepted"
                value={formData.property_condition || ''}
                onChange={(val) => setField('property_condition', val)}
                options={[
                  { label: 'Move-In Ready', value: 'excellent' },
                  { label: 'Light Rehab', value: 'good' },
                  { label: 'Medium Rehab', value: 'fair' },
                  { label: 'Full Rehab OK', value: 'needs_full_rehab' },
                  { label: 'Any Condition', value: 'any' },
                ]}
              />
              <TextField
                label="Target Markets / Areas"
                value={formData.lot_size || ''}
                onChange={(val) => setField('lot_size', val)}
                placeholder="e.g. San Antonio, Austin, DFW"
              />
              <TextField
                label="Timeline to Purchase"
                value={formData.timeline_to_sell || ''}
                onChange={(val) => setField('timeline_to_sell', val)}
                placeholder="ASAP, 30 days, etc."
              />
              {activePipelineId === 'pipeline-retail-buyers' && (
                <>
                  <SelectField
                    label="Pre-Approved"
                    value={formData.price_flexible || ''}
                    onChange={(val) => setField('price_flexible', val)}
                    options={[
                      { label: 'Yes', value: 'yes' },
                      { label: 'No', value: 'no' },
                      { label: 'In Progress', value: 'maybe' },
                    ]}
                  />
                  <NumberField
                    label="Pre-Approval Amount"
                    value={formData.best_cash_offer || ''}
                    onChange={(val) => setField('best_cash_offer', val)}
                    prefix="$"
                    placeholder="0"
                  />
                </>
              )}
              <TextareaField
                label="Buyer Notes / Preferences"
                value={formData.reason_for_selling || ''}
                onChange={(val) => setField('reason_for_selling', val)}
                placeholder="What is the buyer looking for? Any specific requirements?"
                className="col-span-2"
              />
            </div>
          </CollapsibleSection>
          )}

          {/* Section 1: Property Details */}
          {showSection('property_details') && (
          <CollapsibleSection
            title="Property Details"
            isOpen={openSections['property_details'] || false}
            onToggle={() => toggleSection('property_details')}
          >
            <div className="grid grid-cols-2 gap-3">
              <SelectField
                label="Property Type"
                value={formData.property_type || ''}
                onChange={(val) => setField('property_type', val)}
                options={[
                  { label: 'SFR (Single Family Residential)', value: 'sfr' },
                  { label: 'Multi-Family', value: 'multi_family' },
                  { label: 'Condo/Townhouse', value: 'condo_townhouse' },
                  { label: 'Mobile Home', value: 'mobile_home' },
                  { label: 'Land', value: 'land' },
                ]}
              />
              <NumberField
                label="Bedrooms"
                value={formData.bedrooms || ''}
                onChange={(val) => setField('bedrooms', val)}
                placeholder="0"
              />
              <NumberField
                label="Bathrooms"
                value={formData.bathrooms || ''}
                onChange={(val) => setField('bathrooms', val)}
                placeholder="0"
              />
              <NumberField
                label="Square Footage"
                value={formData.square_footage || ''}
                onChange={(val) => setField('square_footage', val)}
                placeholder="0"
              />
              <TextField
                label="Lot Size"
                value={formData.lot_size || ''}
                onChange={(val) => setField('lot_size', val)}
                placeholder="0.5 acres"
              />
              <NumberField
                label="Year Built"
                value={formData.year_built || ''}
                onChange={(val) => setField('year_built', val)}
                placeholder="2000"
              />
              <TextField
                label="Garage"
                value={formData.garage || ''}
                onChange={(val) => setField('garage', val)}
                placeholder="2 car attached"
              />
              <SelectField
                label="Property Condition"
                value={formData.property_condition || ''}
                onChange={(val) => setField('property_condition', val)}
                options={[
                  { label: 'Excellent', value: 'excellent' },
                  { label: 'Good', value: 'good' },
                  { label: 'Fair', value: 'fair' },
                  { label: 'Poor', value: 'poor' },
                  { label: 'Needs Full Rehab', value: 'needs_full_rehab' },
                ]}
              />
              <SelectField
                label="Occupancy Status"
                value={formData.occupancy_status || ''}
                onChange={(val) => setField('occupancy_status', val)}
                options={[
                  { label: 'Owner Occupied', value: 'owner_occupied' },
                  { label: 'Tenant Occupied', value: 'tenant_occupied' },
                  { label: 'Vacant', value: 'vacant' },
                ]}
              />
              <TextareaField
                label="Repairs Needed"
                value={formData.repairs_needed || ''}
                onChange={(val) => setField('repairs_needed', val)}
                placeholder="Describe any repairs needed..."
                className="col-span-2"
              />
              <TextareaField
                label="Special Features"
                value={formData.special_features || ''}
                onChange={(val) => setField('special_features', val)}
                placeholder="Pool, updated kitchen, etc."
                className="col-span-2"
              />
            </div>
          </CollapsibleSection>
          )}

          {/* Section 2: Seller Motivation */}
          {showSection('seller_motivation') && (
          <CollapsibleSection
            title="Seller Motivation"
            isOpen={openSections['seller_motivation'] || false}
            onToggle={() => toggleSection('seller_motivation')}
          >
            <div className="grid grid-cols-2 gap-3">
              <TextareaField
                label="Reason for Selling"
                value={formData.reason_for_selling || ''}
                onChange={(val) => setField('reason_for_selling', val)}
                placeholder="Why is the seller selling?"
                className="col-span-2"
              />
              <SelectField
                label="Motivation Level"
                value={formData.motivation_level || ''}
                onChange={(val) => setField('motivation_level', val)}
                options={[
                  { label: 'Hot', value: 'hot' },
                  { label: 'Warm', value: 'warm' },
                  { label: 'Cold', value: 'cold' },
                ]}
              />
              <TextField
                label="Timeline to Sell"
                value={formData.timeline_to_sell || ''}
                onChange={(val) => setField('timeline_to_sell', val)}
                placeholder="ASAP, 30 days, etc."
              />
              <NumberField
                label="Asking Price"
                value={formData.asking_price || ''}
                onChange={(val) => setField('asking_price', val)}
                prefix="$"
                placeholder="0"
              />
              <SelectField
                label="Price Flexible"
                value={formData.price_flexible || ''}
                onChange={(val) => setField('price_flexible', val)}
                options={[
                  { label: 'Yes', value: 'yes' },
                  { label: 'No', value: 'no' },
                  { label: 'Maybe', value: 'maybe' },
                ]}
              />
              <TextField
                label="How Established Price"
                value={formData.how_established_price || ''}
                onChange={(val) => setField('how_established_price', val)}
                placeholder="Appraisal, estimate, etc."
              />
              <NumberField
                label="Best Cash Offer"
                value={formData.best_cash_offer || ''}
                onChange={(val) => setField('best_cash_offer', val)}
                prefix="$"
                placeholder="0"
              />
              <SelectField
                label="Open to Terms"
                value={formData.open_to_terms || ''}
                onChange={(val) => setField('open_to_terms', val)}
                options={[
                  { label: 'Yes', value: 'yes' },
                  { label: 'No', value: 'no' },
                  { label: 'Maybe', value: 'maybe' },
                ]}
              />
              <TextareaField
                label="What If Doesn't Sell"
                value={formData.what_if_doesnt_sell || ''}
                onChange={(val) => setField('what_if_doesnt_sell', val)}
                placeholder="Seller's backup plan..."
                className="col-span-2"
              />
            </div>
          </CollapsibleSection>
          )}

          {/* Section 3: Listing Information */}
          {showSection('listing_information') && (
          <CollapsibleSection
            title="Listing Information"
            isOpen={openSections['listing_information'] || false}
            onToggle={() => toggleSection('listing_information')}
          >
            <div className="grid grid-cols-2 gap-3">
              <SelectField
                label="Is Listed"
                value={formData.is_listed || ''}
                onChange={(val) => setField('is_listed', val)}
                options={[
                  { label: 'Yes', value: 'yes' },
                  { label: 'No', value: 'no' },
                ]}
              />
              <TextField
                label="Realtor Name"
                value={formData.realtor_name || ''}
                onChange={(val) => setField('realtor_name', val)}
                placeholder="John Smith"
              />
              <TextField
                label="Realtor Phone"
                value={formData.realtor_phone || ''}
                onChange={(val) => setField('realtor_phone', val)}
                placeholder="(555) 123-4567"
              />
              <TextField
                label="How Long Listed"
                value={formData.how_long_listed || ''}
                onChange={(val) => setField('how_long_listed', val)}
                placeholder="30 days, 6 months, etc."
              />
              <TextField
                label="Listing Expires"
                value={formData.listing_expires || ''}
                onChange={(val) => setField('listing_expires', val)}
                placeholder="MM/DD/YYYY"
              />
              <SelectField
                label="Any Offers"
                value={formData.any_offers || ''}
                onChange={(val) => setField('any_offers', val)}
                options={[
                  { label: 'Yes', value: 'yes' },
                  { label: 'No', value: 'no' },
                ]}
              />
              <NumberField
                label="Previous Offer Amount"
                value={formData.previous_offer_amount || ''}
                onChange={(val) => setField('previous_offer_amount', val)}
                prefix="$"
                placeholder="0"
              />
            </div>
          </CollapsibleSection>
          )}

          {/* Section 4: Homeowner Financials */}
          {showSection('homeowner_financials') && (
          <CollapsibleSection
            title="Homeowner Financials"
            isOpen={openSections['homeowner_financials'] || false}
            onToggle={() => toggleSection('homeowner_financials')}
          >
            <div className="grid grid-cols-2 gap-3">
              <NumberField
                label="Mortgage Balance (1st)"
                value={formData.mortgage_balance || ''}
                onChange={(val) => setField('mortgage_balance', val)}
                prefix="$"
                placeholder="0"
              />
              <NumberField
                label="Mortgage Balance (2nd)"
                value={formData.mortgage_balance_2nd || ''}
                onChange={(val) => setField('mortgage_balance_2nd', val)}
                prefix="$"
                placeholder="0"
              />
              <NumberField
                label="Monthly Mortgage Payment"
                value={formData.monthly_mortgage_payment || ''}
                onChange={(val) => setField('monthly_mortgage_payment', val)}
                prefix="$"
                placeholder="0"
              />
              <SelectField
                label="Taxes & Insurance Included"
                value={formData.taxes_insurance_included || ''}
                onChange={(val) => setField('taxes_insurance_included', val)}
                options={[
                  { label: 'Yes', value: 'yes' },
                  { label: 'No', value: 'no' },
                ]}
              />
              <NumberField
                label="Monthly Tax Amount"
                value={formData.monthly_tax_amount || ''}
                onChange={(val) => setField('monthly_tax_amount', val)}
                prefix="$"
                placeholder="0"
              />
              <NumberField
                label="Monthly Insurance Amount"
                value={formData.monthly_insurance_amount || ''}
                onChange={(val) => setField('monthly_insurance_amount', val)}
                prefix="$"
                placeholder="0"
              />
              <NumberField
                label="Interest Rate (1st)"
                value={formData.interest_rate_1st || ''}
                onChange={(val) => setField('interest_rate_1st', val)}
                suffix="%"
                placeholder="0"
              />
              <NumberField
                label="Interest Rate (2nd)"
                value={formData.interest_rate_2nd || ''}
                onChange={(val) => setField('interest_rate_2nd', val)}
                suffix="%"
                placeholder="0"
              />
              <SelectField
                label="Loan Type (1st)"
                value={formData.loan_type || ''}
                onChange={(val) => setField('loan_type', val)}
                options={[
                  { label: 'Fixed', value: 'fixed' },
                  { label: 'Adjustable', value: 'adjustable' },
                  { label: 'FHA', value: 'fha' },
                  { label: 'VA', value: 'va' },
                  { label: 'USDA', value: 'usda' },
                  { label: 'Conventional', value: 'conventional' },
                ]}
              />
              <SelectField
                label="Prepayment Penalty"
                value={formData.prepayment_penalty || ''}
                onChange={(val) => setField('prepayment_penalty', val)}
                options={[
                  { label: 'Yes', value: 'yes' },
                  { label: 'No', value: 'no' },
                ]}
              />
              <TextField
                label="Mortgage Company (1st)"
                value={formData.mortgage_company_1st || ''}
                onChange={(val) => setField('mortgage_company_1st', val)}
                placeholder="Bank name"
              />
              <TextField
                label="Mortgage Company (2nd)"
                value={formData.mortgage_company_2nd || ''}
                onChange={(val) => setField('mortgage_company_2nd', val)}
                placeholder="Bank name"
              />
              <SelectField
                label="Payments Current"
                value={formData.payments_current || ''}
                onChange={(val) => setField('payments_current', val)}
                options={[
                  { label: 'Yes', value: 'yes' },
                  { label: 'No', value: 'no' },
                ]}
              />
              <NumberField
                label="Months Behind"
                value={formData.months_behind || ''}
                onChange={(val) => setField('months_behind', val)}
                placeholder="0"
              />
              <NumberField
                label="Amount Behind"
                value={formData.amount_behind || ''}
                onChange={(val) => setField('amount_behind', val)}
                prefix="$"
                placeholder="0"
              />
              <NumberField
                label="Back Taxes"
                value={formData.back_taxes || ''}
                onChange={(val) => setField('back_taxes', val)}
                prefix="$"
                placeholder="0"
              />
              <TextField
                label="Other Liens"
                value={formData.other_liens || ''}
                onChange={(val) => setField('other_liens', val)}
                placeholder="Description"
              />
              <NumberField
                label="Other Lien Amount"
                value={formData.other_lien_amount || ''}
                onChange={(val) => setField('other_lien_amount', val)}
                prefix="$"
                placeholder="0"
              />
            </div>
          </CollapsibleSection>
          )}

          {/* Section 5: Foreclosure Details */}
          {showSection('foreclosure_details') && (
          <CollapsibleSection
            title="Foreclosure Details"
            isOpen={openSections['foreclosure_details'] || false}
            onToggle={() => toggleSection('foreclosure_details')}
          >
            <div className="grid grid-cols-2 gap-3">
              <SelectField
                label="Foreclosure Status"
                value={formData.foreclosure_status || ''}
                onChange={(val) => setField('foreclosure_status', val)}
                options={[
                  { label: 'None', value: 'none' },
                  { label: 'Pre-Foreclosure', value: 'pre_foreclosure' },
                  { label: 'Notice of Default', value: 'notice_of_default' },
                  { label: 'Lis Pendens', value: 'lis_pendens' },
                  { label: 'Auction Scheduled', value: 'auction_scheduled' },
                ]}
              />
              <TextField
                label="Auction Date"
                value={formData.auction_date || ''}
                onChange={(val) => setField('auction_date', val)}
                placeholder="MM/DD/YYYY"
              />
              <NumberField
                label="Reinstatement Amount"
                value={formData.reinstatement_amount || ''}
                onChange={(val) => setField('reinstatement_amount', val)}
                prefix="$"
                placeholder="0"
              />
              <SelectField
                label="Attorney Involved"
                value={formData.attorney_involved || ''}
                onChange={(val) => setField('attorney_involved', val)}
                options={[
                  { label: 'Yes', value: 'yes' },
                  { label: 'No', value: 'no' },
                ]}
              />
              <TextField
                label="Attorney Name"
                value={formData.attorney_name || ''}
                onChange={(val) => setField('attorney_name', val)}
                placeholder="John Doe"
              />
              <TextField
                label="Attorney Phone"
                value={formData.attorney_phone || ''}
                onChange={(val) => setField('attorney_phone', val)}
                placeholder="(555) 123-4567"
              />
            </div>
          </CollapsibleSection>
          )}

          {/* Section 6: Deal Financials */}
          {showSection('deal_financials') && (
          <CollapsibleSection
            title="Deal Financials"
            isOpen={openSections['deal_financials'] || false}
            onToggle={() => toggleSection('deal_financials')}
          >
            <div className="grid grid-cols-2 gap-3">
              <NumberField
                label="As-Is Value"
                value={formData.as_is_value || ''}
                onChange={(val) => setField('as_is_value', val)}
                prefix="$"
                placeholder="0"
              />
              <SelectField
                label="Exit Strategy"
                value={formData.exit_strategy || ''}
                onChange={(val) => setField('exit_strategy', val)}
                options={[
                  { label: 'Wholesale', value: 'wholesale' },
                  { label: 'Fix & Flip', value: 'fix_and_flip' },
                  { label: 'Buy & Hold', value: 'buy_and_hold' },
                  { label: 'Subject-To', value: 'subject_to' },
                  { label: 'Lease Option', value: 'lease_option' },
                  { label: 'Owner Finance', value: 'owner_finance' },
                  { label: 'Novation', value: 'novation' },
                  { label: 'Wholetail', value: 'wholetail' },
                ]}
              />
              <NumberField
                label="List Price"
                value={formData.list_price || ''}
                onChange={(val) => setField('list_price', val)}
                prefix="$"
                placeholder="0"
              />
              <NumberField
                label="Purchase Price"
                value={formData.purchase_price || ''}
                onChange={(val) => setField('purchase_price', val)}
                prefix="$"
                placeholder="0"
              />
              <NumberField
                label="ARV (After Repair Value)"
                value={formData.arv || ''}
                onChange={(val) => setField('arv', val)}
                prefix="$"
                placeholder="0"
              />
              <NumberField
                label="Rehab Estimate"
                value={formData.rehab_estimate || ''}
                onChange={(val) => setField('rehab_estimate', val)}
                prefix="$"
                placeholder="0"
              />
              <NumberField
                label="Monthly Rent"
                value={formData.monthly_rent || ''}
                onChange={(val) => setField('monthly_rent', val)}
                prefix="$"
                placeholder="0"
              />
              <NumberField
                label="Offer Price"
                value={formData.offer_price || ''}
                onChange={(val) => setField('offer_price', val)}
                prefix="$"
                placeholder="0"
              />
              <NumberField
                label="Down Payment"
                value={formData.down_payment || ''}
                onChange={(val) => setField('down_payment', val)}
                prefix="$"
                placeholder="0"
              />
              <NumberField
                label="Earnest Money"
                value={formData.earnest_money || ''}
                onChange={(val) => setField('earnest_money', val)}
                prefix="$"
                placeholder="0"
              />
              <NumberField
                label="Closing Costs (Buyer)"
                value={formData.closing_costs_buyer || ''}
                onChange={(val) => setField('closing_costs_buyer', val)}
                prefix="$"
                placeholder="0"
              />
              <NumberField
                label="Loan Amount"
                value={formData.loan_amount || ''}
                onChange={(val) => setField('loan_amount', val)}
                prefix="$"
                placeholder="0"
              />
              <NumberField
                label="Interest Rate"
                value={formData.interest_rate || ''}
                onChange={(val) => setField('interest_rate', val)}
                suffix="%"
                placeholder="0"
              />
              <SelectField
                label="Loan Term"
                value={formData.loan_term_months || ''}
                onChange={(val) => setField('loan_term_months', val)}
                options={[
                  { label: '30 years', value: '360' },
                  { label: '20 years', value: '240' },
                  { label: '15 years', value: '180' },
                  { label: '10 years', value: '120' },
                  { label: '5 years', value: '60' },
                  { label: '1 year', value: '12' },
                ]}
              />
              <NumberField
                label="Property Tax (Annual)"
                value={formData.property_tax_annual || ''}
                onChange={(val) => setField('property_tax_annual', val)}
                prefix="$"
                placeholder="0"
              />
              <NumberField
                label="Insurance (Annual)"
                value={formData.insurance_annual || ''}
                onChange={(val) => setField('insurance_annual', val)}
                prefix="$"
                placeholder="0"
              />
            </div>
          </CollapsibleSection>
          )}

          {/* Footer / Action Buttons */}
          <div className="flex gap-3 justify-end pt-4 border-t border-slate-200">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-slate-700 bg-slate-100 rounded-lg hover:bg-slate-200 transition font-medium"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={createDeal.isPending}
              className="px-6 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition font-medium disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {createDeal.isPending ? 'Creating...' : 'Create Deal'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
