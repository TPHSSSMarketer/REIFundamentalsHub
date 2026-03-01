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
        stage: stageOptions[0],
        pipeline_id: pipelineId || mockPipelines[0].id,
      }))
    }
  }, [pipelineId, stageOptions])

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

    // Build deal object with all fields
    const dealData: Partial<Deal> = {
      address: formData.address,
      city: formData.city,
      state: formData.state,
      zip: formData.zip,
      stage: (formData.stage || stageOptions[0]) as Deal['stage'],
      pipeline_id: pipelineId || mockPipelines[0].id,
      contact_id: formData.contact_id || null,
      source: formData.source || null,
      notes: formData.notes || null,
      is_urgent: formData.is_urgent === 'true',

      // Property Details
      property_type: formData.property_type || null,
      bedrooms: formData.bedrooms ? parseInt(formData.bedrooms, 10) : null,
      bathrooms: formData.bathrooms ? parseFloat(formData.bathrooms) : null,
      square_footage: formData.square_footage ? parseInt(formData.square_footage, 10) : null,
      lot_size: formData.lot_size || null,
      year_built: formData.year_built ? parseInt(formData.year_built, 10) : null,
      garage: formData.garage || null,
      property_condition: formData.property_condition || null,
      occupancy_status: formData.occupancy_status || null,
      repairs_needed: formData.repairs_needed || null,
      special_features: formData.special_features || null,

      // Seller Motivation
      reason_for_selling: formData.reason_for_selling || null,
      motivation_level: formData.motivation_level || null,
      timeline_to_sell: formData.timeline_to_sell || null,
      asking_price: formData.asking_price ? parseFloat(formData.asking_price) : null,
      price_flexible: formData.price_flexible || null,
      how_established_price: formData.how_established_price || null,
      best_cash_offer: formData.best_cash_offer ? parseFloat(formData.best_cash_offer) : null,
      open_to_terms: formData.open_to_terms || null,
      what_if_doesnt_sell: formData.what_if_doesnt_sell || null,

      // Listing Information
      is_listed: formData.is_listed || null,
      realtor_name: formData.realtor_name || null,
      realtor_phone: formData.realtor_phone || null,
      how_long_listed: formData.how_long_listed || null,
      listing_expires: formData.listing_expires || null,
      any_offers: formData.any_offers || null,
      previous_offer_amount: formData.previous_offer_amount
        ? parseFloat(formData.previous_offer_amount)
        : null,

      // Homeowner Financials
      mortgage_balance: formData.mortgage_balance ? parseFloat(formData.mortgage_balance) : null,
      mortgage_balance_2nd: formData.mortgage_balance_2nd
        ? parseFloat(formData.mortgage_balance_2nd)
        : null,
      monthly_mortgage_payment: formData.monthly_mortgage_payment
        ? parseFloat(formData.monthly_mortgage_payment)
        : null,
      taxes_insurance_included: formData.taxes_insurance_included || null,
      monthly_tax_amount: formData.monthly_tax_amount
        ? parseFloat(formData.monthly_tax_amount)
        : null,
      monthly_insurance_amount: formData.monthly_insurance_amount
        ? parseFloat(formData.monthly_insurance_amount)
        : null,
      interest_rate_1st: formData.interest_rate_1st
        ? parseFloat(formData.interest_rate_1st)
        : null,
      interest_rate_2nd: formData.interest_rate_2nd
        ? parseFloat(formData.interest_rate_2nd)
        : null,
      loan_type: formData.loan_type || null,
      prepayment_penalty: formData.prepayment_penalty || null,
      mortgage_company_1st: formData.mortgage_company_1st || null,
      mortgage_company_2nd: formData.mortgage_company_2nd || null,
      payments_current: formData.payments_current || null,
      months_behind: formData.months_behind ? parseInt(formData.months_behind, 10) : null,
      amount_behind: formData.amount_behind ? parseFloat(formData.amount_behind) : null,
      back_taxes: formData.back_taxes ? parseFloat(formData.back_taxes) : null,
      other_liens: formData.other_liens || null,
      other_lien_amount: formData.other_lien_amount
        ? parseFloat(formData.other_lien_amount)
        : null,

      // Foreclosure Details
      foreclosure_status: formData.foreclosure_status || null,
      auction_date: formData.auction_date || null,
      reinstatement_amount: formData.reinstatement_amount
        ? parseFloat(formData.reinstatement_amount)
        : null,
      attorney_involved: formData.attorney_involved || null,
      attorney_name: formData.attorney_name || null,
      attorney_phone: formData.attorney_phone || null,

      // Deal Financials
      as_is_value: formData.as_is_value ? parseFloat(formData.as_is_value) : null,
      exit_strategy: formData.exit_strategy || null,
      list_price: formData.list_price ? parseFloat(formData.list_price) : null,
      purchase_price: formData.purchase_price ? parseFloat(formData.purchase_price) : null,
      arv: formData.arv ? parseFloat(formData.arv) : null,
      rehab_estimate: formData.rehab_estimate ? parseFloat(formData.rehab_estimate) : null,
      monthly_rent: formData.monthly_rent ? parseFloat(formData.monthly_rent) : null,
      offer_price: formData.offer_price ? parseFloat(formData.offer_price) : null,
      down_payment: formData.down_payment ? parseFloat(formData.down_payment) : null,
      earnest_money: formData.earnest_money ? parseFloat(formData.earnest_money) : null,
      closing_costs_buyer: formData.closing_costs_buyer
        ? parseFloat(formData.closing_costs_buyer)
        : null,
      loan_amount: formData.loan_amount ? parseFloat(formData.loan_amount) : null,
      interest_rate: formData.interest_rate ? parseFloat(formData.interest_rate) : null,
      loan_term_months: formData.loan_term_months || null,
      property_tax_annual: formData.property_tax_annual
        ? parseFloat(formData.property_tax_annual)
        : null,
      insurance_annual: formData.insurance_annual
        ? parseFloat(formData.insurance_annual)
        : null,
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
          <h2 className="text-2xl font-bold text-slate-900">Create New Deal</h2>
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
                value={formData.stage || (stageOptions[0] || '')}
                onChange={(val) => setField('stage', val)}
                options={stageOptions.map((s) => ({ label: s, value: s }))}
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

          {/* Section 1: Property Details */}
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

          {/* Section 2: Seller Motivation */}
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

          {/* Section 3: Listing Information */}
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

          {/* Section 4: Homeowner Financials */}
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

          {/* Section 5: Foreclosure Details */}
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

          {/* Section 6: Deal Financials */}
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
