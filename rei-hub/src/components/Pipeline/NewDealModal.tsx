import { useState, useMemo } from 'react'
import { X, DollarSign, ChevronDown, ChevronUp, Percent } from 'lucide-react'
import { useCreateDeal } from '@/hooks/useApi'
import type { Deal, Contact } from '@/types'

const STAGE_OPTIONS: { value: Deal['stage']; label: string }[] = [
  { value: 'lead', label: 'New Lead' },
  { value: 'analysis', label: 'Analysis' },
  { value: 'offer', label: 'Offer Made' },
  { value: 'under_contract', label: 'Under Contract' },
  { value: 'due_diligence', label: 'Due Diligence' },
  { value: 'closing', label: 'Closing' },
  { value: 'closed_won', label: 'Closed Won' },
  { value: 'closed_lost', label: 'Closed Lost' },
]

interface NewDealModalProps {
  isOpen: boolean
  onClose: () => void
  contacts: Contact[]
}

export default function NewDealModal({ isOpen, onClose, contacts }: NewDealModalProps) {
  const createDeal = useCreateDeal()

  const [address, setAddress] = useState('')
  const [city, setCity] = useState('')
  const [state, setState] = useState('')
  const [zip, setZip] = useState('')
  const [stage, setStage] = useState<Deal['stage']>('lead')
  const [listPrice, setListPrice] = useState('')
  const [purchasePrice, setPurchasePrice] = useState('')
  const [arv, setArv] = useState('')
  const [rehabEstimate, setRehabEstimate] = useState('')
  const [monthlyRent, setMonthlyRent] = useState('')
  const [contactId, setContactId] = useState('')
  const [contactSearch, setContactSearch] = useState('')
  const [showContactDropdown, setShowContactDropdown] = useState(false)
  const [offerPrice, setOfferPrice] = useState('')
  const [downPayment, setDownPayment] = useState('')
  const [earnestMoney, setEarnestMoney] = useState('')
  const [closingCostsBuyer, setClosingCostsBuyer] = useState('')
  const [loanAmount, setLoanAmount] = useState('')
  const [interestRate, setInterestRate] = useState('')
  const [loanTermMonths, setLoanTermMonths] = useState('360')
  const [propertyTaxAnnual, setPropertyTaxAnnual] = useState('')
  const [insuranceAnnual, setInsuranceAnnual] = useState('')
  const [showFinancials, setShowFinancials] = useState(false)
  const [source, setSource] = useState('')
  const [notes, setNotes] = useState('')
  const [isUrgent, setIsUrgent] = useState(false)
  const [errors, setErrors] = useState<{ address?: string }>({})

  const filteredContacts = useMemo(() => {
    if (!contactSearch.trim()) return contacts.slice(0, 10)
    const q = contactSearch.toLowerCase()
    return contacts.filter(
      (c) => c.name.toLowerCase().includes(q) || (c.phone && c.phone.includes(q))
    ).slice(0, 10)
  }, [contacts, contactSearch])

  const resetForm = () => {
    setAddress('')
    setCity('')
    setState('')
    setZip('')
    setStage('lead')
    setListPrice('')
    setPurchasePrice('')
    setArv('')
    setRehabEstimate('')
    setMonthlyRent('')
    setContactId('')
    setContactSearch('')
    setShowContactDropdown(false)
    setOfferPrice('')
    setDownPayment('')
    setEarnestMoney('')
    setClosingCostsBuyer('')
    setLoanAmount('')
    setInterestRate('')
    setLoanTermMonths('360')
    setPropertyTaxAnnual('')
    setInsuranceAnnual('')
    setShowFinancials(false)
    setSource('')
    setNotes('')
    setIsUrgent(false)
    setErrors({})
  }

  const handleClose = () => {
    resetForm()
    onClose()
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    const newErrors: { address?: string } = {}
    if (!address.trim()) newErrors.address = 'Address is required'
    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors)
      return
    }
    setErrors({})

    const selectedContact = contacts.find((c) => c.id === contactId)

    try {
      await createDeal.mutateAsync({
        title: address.trim(),
        address: address.trim(),
        city: city.trim() || undefined,
        state: state.trim() || undefined,
        zip: zip.trim() || undefined,
        stage,
        listPrice: listPrice ? parseFloat(listPrice) : undefined,
        purchasePrice: purchasePrice ? parseFloat(purchasePrice) : undefined,
        arv: arv ? parseFloat(arv) : undefined,
        rehabEstimate: rehabEstimate ? parseFloat(rehabEstimate) : undefined,
        monthlyRent: monthlyRent ? parseFloat(monthlyRent) : undefined,
        contactId: contactId || undefined,
        contactName: selectedContact?.name,
        offerPrice: offerPrice ? parseFloat(offerPrice) : undefined,
        downPayment: downPayment ? parseFloat(downPayment) : undefined,
        earnestMoney: earnestMoney ? parseFloat(earnestMoney) : undefined,
        closingCostsBuyer: closingCostsBuyer ? parseFloat(closingCostsBuyer) : undefined,
        loanAmount: loanAmount ? parseFloat(loanAmount) : undefined,
        interestRate: interestRate ? parseFloat(interestRate) : undefined,
        loanTermMonths: loanTermMonths ? parseInt(loanTermMonths) : undefined,
        propertyTaxAnnual: propertyTaxAnnual ? parseFloat(propertyTaxAnnual) : undefined,
        insuranceAnnual: insuranceAnnual ? parseFloat(insuranceAnnual) : undefined,
        source: source.trim() || undefined,
        notes: notes.trim() || undefined,
        isUrgent,
      })
      resetForm()
      onClose()
    } catch {
      // Error handled by hook's onError toast
    }
  }

  const handleSelectContact = (contact: Contact) => {
    setContactId(contact.id)
    setContactSearch(contact.name)
    setShowContactDropdown(false)
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/30" onClick={handleClose} />

      {/* Modal */}
      <div className="relative bg-white rounded-xl shadow-xl w-full max-w-lg mx-auto mt-10 border border-slate-200 max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-slate-200 sticky top-0 bg-white rounded-t-xl z-10">
          <h2 className="text-lg font-semibold text-slate-800">Add New Deal</h2>
          <button
            onClick={handleClose}
            className="p-1.5 rounded-lg hover:bg-slate-100 transition-colors"
          >
            <X className="w-5 h-5 text-slate-500" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          {/* Address */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              Address <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              placeholder="e.g. 123 Main St"
              className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 text-sm"
            />
            {errors.address && (
              <p className="text-xs text-red-500 mt-1">{errors.address}</p>
            )}
          </div>

          {/* City / State / ZIP */}
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">City</label>
              <input
                type="text"
                value={city}
                onChange={(e) => setCity(e.target.value)}
                placeholder="City"
                className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 text-sm"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">State</label>
              <input
                type="text"
                value={state}
                onChange={(e) => setState(e.target.value)}
                placeholder="TX"
                maxLength={2}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 text-sm"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">ZIP</label>
              <input
                type="text"
                value={zip}
                onChange={(e) => setZip(e.target.value)}
                placeholder="78201"
                maxLength={10}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 text-sm"
              />
            </div>
          </div>

          {/* Stage */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Stage</label>
            <select
              value={stage}
              onChange={(e) => setStage(e.target.value as Deal['stage'])}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 text-sm"
            >
              {STAGE_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>

          {/* Prices Row 1 */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">List Price</label>
              <div className="relative">
                <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <input
                  type="number"
                  value={listPrice}
                  onChange={(e) => setListPrice(e.target.value)}
                  placeholder="0"
                  min="0"
                  className="w-full pl-9 pr-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 text-sm"
                />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Purchase Price</label>
              <div className="relative">
                <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <input
                  type="number"
                  value={purchasePrice}
                  onChange={(e) => setPurchasePrice(e.target.value)}
                  placeholder="0"
                  min="0"
                  className="w-full pl-9 pr-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 text-sm"
                />
              </div>
            </div>
          </div>

          {/* Prices Row 2 */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">ARV</label>
              <div className="relative">
                <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <input
                  type="number"
                  value={arv}
                  onChange={(e) => setArv(e.target.value)}
                  placeholder="0"
                  min="0"
                  className="w-full pl-9 pr-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 text-sm"
                />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Rehab Estimate</label>
              <div className="relative">
                <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <input
                  type="number"
                  value={rehabEstimate}
                  onChange={(e) => setRehabEstimate(e.target.value)}
                  placeholder="0"
                  min="0"
                  className="w-full pl-9 pr-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 text-sm"
                />
              </div>
            </div>
          </div>

          {/* Monthly Rent */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Monthly Rent</label>
            <div className="relative">
              <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input
                type="number"
                value={monthlyRent}
                onChange={(e) => setMonthlyRent(e.target.value)}
                placeholder="0"
                min="0"
                className="w-full pl-9 pr-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 text-sm"
              />
            </div>
          </div>

          {/* ── Financial Details (collapsible) ── */}
          <div className="border border-slate-200 rounded-lg overflow-hidden">
            <button
              type="button"
              onClick={() => setShowFinancials(!showFinancials)}
              className="w-full flex items-center justify-between px-4 py-3 bg-slate-50 hover:bg-slate-100 transition-colors"
            >
              <span className="text-sm font-semibold text-slate-700">
                Financial Details
                <span className="ml-2 text-xs font-normal text-slate-400">(optional)</span>
              </span>
              {showFinancials ? (
                <ChevronUp className="w-4 h-4 text-slate-400" />
              ) : (
                <ChevronDown className="w-4 h-4 text-slate-400" />
              )}
            </button>

            {showFinancials && (
              <div className="p-4 space-y-4 border-t border-slate-200">
                {/* Offer Price */}
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Offer Price</label>
                  <div className="relative">
                    <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                    <input
                      type="number"
                      value={offerPrice}
                      onChange={(e) => setOfferPrice(e.target.value)}
                      placeholder="0"
                      min="0"
                      className="w-full pl-9 pr-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 text-sm"
                    />
                  </div>
                </div>

                {/* Down Payment / Earnest Money */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Down Payment</label>
                    <div className="relative">
                      <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                      <input
                        type="number"
                        value={downPayment}
                        onChange={(e) => setDownPayment(e.target.value)}
                        placeholder="0"
                        min="0"
                        className="w-full pl-9 pr-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 text-sm"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Earnest Money</label>
                    <div className="relative">
                      <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                      <input
                        type="number"
                        value={earnestMoney}
                        onChange={(e) => setEarnestMoney(e.target.value)}
                        placeholder="0"
                        min="0"
                        className="w-full pl-9 pr-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 text-sm"
                      />
                    </div>
                  </div>
                </div>

                {/* Closing Costs / Loan Amount */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Closing Costs</label>
                    <div className="relative">
                      <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                      <input
                        type="number"
                        value={closingCostsBuyer}
                        onChange={(e) => setClosingCostsBuyer(e.target.value)}
                        placeholder="0"
                        min="0"
                        className="w-full pl-9 pr-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 text-sm"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Loan Amount</label>
                    <div className="relative">
                      <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                      <input
                        type="number"
                        value={loanAmount}
                        onChange={(e) => setLoanAmount(e.target.value)}
                        placeholder="0"
                        min="0"
                        className="w-full pl-9 pr-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 text-sm"
                      />
                    </div>
                  </div>
                </div>

                {/* Interest Rate / Loan Term */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Interest Rate</label>
                    <div className="relative">
                      <input
                        type="number"
                        value={interestRate}
                        onChange={(e) => setInterestRate(e.target.value)}
                        placeholder="7.0"
                        min="0"
                        step="0.125"
                        className="w-full pl-3 pr-9 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 text-sm"
                      />
                      <Percent className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Loan Term</label>
                    <select
                      value={loanTermMonths}
                      onChange={(e) => setLoanTermMonths(e.target.value)}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 text-sm"
                    >
                      <option value="360">30 years</option>
                      <option value="240">20 years</option>
                      <option value="180">15 years</option>
                      <option value="120">10 years</option>
                      <option value="60">5 years</option>
                      <option value="12">1 year</option>
                    </select>
                  </div>
                </div>

                {/* Property Tax / Insurance */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Property Tax <span className="text-xs text-slate-400">/yr</span></label>
                    <div className="relative">
                      <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                      <input
                        type="number"
                        value={propertyTaxAnnual}
                        onChange={(e) => setPropertyTaxAnnual(e.target.value)}
                        placeholder="0"
                        min="0"
                        className="w-full pl-9 pr-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 text-sm"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Insurance <span className="text-xs text-slate-400">/yr</span></label>
                    <div className="relative">
                      <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                      <input
                        type="number"
                        value={insuranceAnnual}
                        onChange={(e) => setInsuranceAnnual(e.target.value)}
                        placeholder="0"
                        min="0"
                        className="w-full pl-9 pr-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 text-sm"
                      />
                    </div>
                  </div>
                </div>

                <p className="text-xs text-slate-400 italic">
                  You can add more details later on the Expenditures tab.
                </p>
              </div>
            )}
          </div>

          {/* Contact (searchable) */}
          <div className="relative">
            <label className="block text-sm font-medium text-slate-700 mb-1">Contact</label>
            <input
              type="text"
              value={contactSearch}
              onChange={(e) => {
                setContactSearch(e.target.value)
                setContactId('')
                setShowContactDropdown(true)
              }}
              onFocus={() => setShowContactDropdown(true)}
              placeholder="Search contacts..."
              className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 text-sm"
            />
            {showContactDropdown && filteredContacts.length > 0 && (
              <div className="absolute z-10 w-full mt-1 bg-white border border-slate-200 rounded-lg shadow-lg max-h-40 overflow-y-auto">
                {filteredContacts.map((contact) => (
                  <button
                    key={contact.id}
                    type="button"
                    onClick={() => handleSelectContact(contact)}
                    className="w-full text-left px-3 py-2 text-sm hover:bg-slate-50 transition-colors flex items-center justify-between"
                  >
                    <span className="font-medium text-slate-700">{contact.name}</span>
                    {contact.phone && (
                      <span className="text-xs text-slate-400">{contact.phone}</span>
                    )}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Source */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Source</label>
            <input
              type="text"
              value={source}
              onChange={(e) => setSource(e.target.value)}
              placeholder="e.g. Direct Mail, Facebook Ads, Referral"
              className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 text-sm"
            />
          </div>

          {/* Notes */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Notes</label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
              placeholder="Any additional details..."
              className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 text-sm resize-none"
            />
          </div>

          {/* Is Urgent */}
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setIsUrgent(!isUrgent)}
              className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors ${
                isUrgent ? 'bg-red-500' : 'bg-slate-200'
              }`}
            >
              <span
                className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition-transform ${
                  isUrgent ? 'translate-x-5' : 'translate-x-0'
                }`}
              />
            </button>
            <label className="text-sm font-medium text-slate-700">Mark as Urgent</label>
          </div>

          {/* Actions */}
          <div className="flex items-center justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={handleClose}
              className="px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={createDeal.isPending}
              className="px-4 py-2 text-sm font-medium text-white bg-primary-500 rounded-lg hover:bg-primary-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {createDeal.isPending ? 'Creating...' : 'Create Deal'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
