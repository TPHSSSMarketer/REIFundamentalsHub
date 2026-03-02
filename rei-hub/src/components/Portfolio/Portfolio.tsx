import { useState, useEffect } from 'react'
import { Building2, MoreVertical, Search } from 'lucide-react'
import { toast } from 'sonner'
import type { PortfolioProperty } from '@/types'
import {
  getPortfolioProperties,
  createPortfolioProperty,
  updatePortfolioProperty,
  deletePortfolioProperty,
} from '@/services/crmApi'

// ============ HELPERS ============

function formatCurrency(n: number) {
  return '$' + n.toLocaleString()
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString()
}

function getPropertyTypeLabel(type: string) {
  const map: Record<string, string> = {
    single_family: 'Single Family',
    multi_family: 'Multi-Family',
    condo: 'Condo',
    townhouse: 'Townhouse',
    commercial: 'Commercial',
    land: 'Land',
  }
  return map[type] || type
}

function getCashFlowColor(cf: number) {
  if (cf > 0) return 'text-green-600'
  if (cf < 0) return 'text-red-500'
  return 'text-slate-500'
}

function getEquityPct(prop: PortfolioProperty) {
  return prop.currentValue && prop.purchasePrice
    ? Math.round(((prop.currentValue - (prop.loanBalance || 0)) / prop.currentValue) * 100)
    : 0
}

// ============ BLANK FORM DATA ============

const BLANK_FORM: Omit<PortfolioProperty, 'id' | 'createdAt' | 'updatedAt'> = {
  address: '',
  city: '',
  state: '',
  zip: '',
  propertyType: 'single_family',
  units: 1,
  purchaseDate: '',
  purchasePrice: undefined,
  rehabCost: undefined,
  currentValue: undefined,
  loanBalance: undefined,
  monthlyMortgage: undefined,
  monthlyRent: undefined,
  notes: '',
}

// ============ COMPONENT ============

export default function Portfolio() {
  const [properties, setProperties] = useState<PortfolioProperty[]>([])
  const [showAddModal, setShowAddModal] = useState(false)
  const [selectedProperty, setSelectedProperty] = useState<PortfolioProperty | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [isLoading, setIsLoading] = useState(true)
  const [openMenuId, setOpenMenuId] = useState<string | null>(null)

  const loadProperties = async () => {
    const result = await getPortfolioProperties()
    setProperties(result)
    setIsLoading(false)
  }

  useEffect(() => {
    loadProperties()
  }, [])

  // Close dropdown on outside click
  useEffect(() => {
    if (!openMenuId) return
    const handleClick = () => setOpenMenuId(null)
    document.addEventListener('click', handleClick)
    return () => document.removeEventListener('click', handleClick)
  }, [openMenuId])

  // ── Computed Metrics ──
  const totalProperties = properties.length
  const totalUnits = properties.reduce((sum, p) => sum + p.units, 0)
  const totalCurrentValue = properties.reduce((sum, p) => sum + (p.currentValue || 0), 0)
  const totalEquity = properties.reduce(
    (sum, p) => sum + ((p.currentValue || 0) - (p.loanBalance || 0)),
    0
  )
  const totalMonthlyRent = properties.reduce((sum, p) => sum + (p.monthlyRent || 0), 0)
  const totalMonthlyMortgage = properties.reduce((sum, p) => sum + (p.monthlyMortgage || 0), 0)
  const netMonthlyCashFlow = totalMonthlyRent - totalMonthlyMortgage

  // ── Filtered List ──
  const filteredProperties = properties.filter(
    (p) =>
      p.address.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (p.city || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
      (p.state || '').toLowerCase().includes(searchQuery.toLowerCase())
  )

  // ── Actions ──
  const handleDelete = async (id: string) => {
    if (!confirm('Delete this property?')) return
    await deletePortfolioProperty(id)
    await loadProperties()
    toast.success('Property removed.')
  }

  const handleEdit = (prop: PortfolioProperty) => {
    setSelectedProperty(prop)
    setOpenMenuId(null)
  }

  return (
    <div className="space-y-6">
      {/* 1. HEADER ROW */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Portfolio</h1>
          <p className="text-slate-500 text-sm">
            Track your owned properties, equity, and cash flow
          </p>
        </div>
        <button
          onClick={() => setShowAddModal(true)}
          className="flex items-center gap-2 px-4 py-2 bg-primary-500 text-white rounded-lg hover:bg-primary-600 transition-colors text-sm font-medium"
        >
          <Building2 className="w-4 h-4" />
          Add Property
        </button>
      </div>

      {/* 2. METRICS STRIP */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        <div className="bg-white rounded-xl border border-slate-200 p-4 text-center">
          <p className="text-xs text-slate-500 mb-1">Properties</p>
          <p className="text-xl font-bold text-slate-800">{totalProperties}</p>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 p-4 text-center">
          <p className="text-xs text-slate-500 mb-1">Total Units</p>
          <p className="text-xl font-bold text-slate-800">{totalUnits}</p>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 p-4 text-center">
          <p className="text-xs text-slate-500 mb-1">Portfolio Value</p>
          <p className="text-xl font-bold text-slate-800">{formatCurrency(totalCurrentValue)}</p>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 p-4 text-center">
          <p className="text-xs text-slate-500 mb-1">Total Equity</p>
          <p className="text-xl font-bold text-green-600">{formatCurrency(totalEquity)}</p>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 p-4 text-center">
          <p className="text-xs text-slate-500 mb-1">Monthly Rent</p>
          <p className="text-xl font-bold text-slate-800">{formatCurrency(totalMonthlyRent)}</p>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 p-4 text-center">
          <p className="text-xs text-slate-500 mb-1">Net Cash Flow</p>
          <p className={`text-xl font-bold ${getCashFlowColor(netMonthlyCashFlow)}`}>
            {formatCurrency(netMonthlyCashFlow)}
          </p>
        </div>
      </div>

      {/* 3. SEARCH ROW */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
        <input
          type="text"
          placeholder="Search by address, city, or state..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="w-full pl-10 pr-4 py-2.5 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
        />
      </div>

      {/* 4. PROPERTIES GRID */}
      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <div className="w-8 h-8 border-4 border-primary-500 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : filteredProperties.length === 0 ? (
        /* 5. EMPTY STATE */
        <div className="text-center py-16">
          <Building2 className="w-12 h-12 text-slate-300 mx-auto mb-3" />
          <p className="text-lg font-medium text-slate-600">No properties yet</p>
          <p className="text-sm text-slate-400 mt-1">
            Add your first owned property to start tracking equity and cash flow.
          </p>
          <button
            onClick={() => setShowAddModal(true)}
            className="mt-4 px-4 py-2 bg-primary-500 text-white rounded-lg hover:bg-primary-600 transition-colors text-sm font-medium"
          >
            Add Your First Property
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-4">
          {filteredProperties.map((prop) => {
            const cashFlow = (prop.monthlyRent || 0) - (prop.monthlyMortgage || 0)
            const equity = (prop.currentValue || 0) - (prop.loanBalance || 0)
            const location = [prop.city, prop.state, prop.zip].filter(Boolean).join(', ')

            return (
              <div
                key={prop.id}
                className="bg-white rounded-xl border border-slate-200 p-5 hover:shadow-md transition-shadow"
              >
                {/* Top row */}
                <div className="flex justify-between items-start">
                  <div>
                    <p className="font-bold text-lg text-slate-800">{prop.address}</p>
                    {location && (
                      <p className="text-slate-500 text-sm">{location}</p>
                    )}
                  </div>
                  <div className="relative">
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        setOpenMenuId(openMenuId === prop.id ? null : prop.id)
                      }}
                      className="p-1.5 rounded-lg hover:bg-slate-100 transition-colors"
                    >
                      <MoreVertical className="w-4 h-4 text-slate-400" />
                    </button>
                    {openMenuId === prop.id && (
                      <div className="absolute right-0 mt-1 w-32 bg-white border border-slate-200 rounded-lg shadow-lg z-10">
                        <button
                          onClick={() => handleEdit(prop)}
                          className="w-full text-left px-3 py-2 text-sm text-slate-700 hover:bg-slate-50 rounded-t-lg"
                        >
                          Edit
                        </button>
                        <button
                          onClick={() => {
                            setOpenMenuId(null)
                            handleDelete(prop.id)
                          }}
                          className="w-full text-left px-3 py-2 text-sm text-red-600 hover:bg-red-50 rounded-b-lg"
                        >
                          Delete
                        </button>
                      </div>
                    )}
                  </div>
                </div>

                {/* Property type badge + units */}
                <div className="mt-2">
                  <span className="bg-slate-100 text-slate-600 text-xs px-2 py-0.5 rounded-full inline-flex items-center gap-1">
                    {getPropertyTypeLabel(prop.propertyType)}
                    {prop.units > 1 && <span>· {prop.units} units</span>}
                  </span>
                </div>

                {/* Per-property cash flow */}
                <div className="mt-3">
                  <p className={`text-2xl font-bold ${getCashFlowColor(cashFlow)}`}>
                    {formatCurrency(cashFlow)}
                    <span className="text-xs font-normal text-slate-400">/mo</span>
                  </p>
                  <p className="text-xs text-slate-400">Monthly Cash Flow</p>
                </div>

                {/* Stats grid */}
                <div className="grid grid-cols-2 gap-2 mt-3 text-sm">
                  <div>
                    <p className="text-slate-400 text-xs">Current Value</p>
                    <p className="font-medium text-slate-700">
                      {prop.currentValue ? formatCurrency(prop.currentValue) : '—'}
                    </p>
                  </div>
                  <div>
                    <p className="text-slate-400 text-xs">Equity</p>
                    <p className="font-medium text-slate-700">
                      {formatCurrency(equity)}
                      <span className="text-xs text-slate-400 ml-1">{getEquityPct(prop)}%</span>
                    </p>
                  </div>
                  <div>
                    <p className="text-slate-400 text-xs">Purchase Price</p>
                    <p className="font-medium text-slate-700">
                      {prop.purchasePrice ? formatCurrency(prop.purchasePrice) : '—'}
                    </p>
                  </div>
                  <div>
                    <p className="text-slate-400 text-xs">Rehab Cost</p>
                    <p className="font-medium text-slate-700">
                      {prop.rehabCost ? formatCurrency(prop.rehabCost) : '—'}
                    </p>
                  </div>
                  <div>
                    <p className="text-slate-400 text-xs">Loan Balance</p>
                    <p className="font-medium text-slate-700">
                      {prop.loanBalance ? formatCurrency(prop.loanBalance) : '—'}
                    </p>
                  </div>
                  <div>
                    <p className="text-slate-400 text-xs">Monthly Rent</p>
                    <p className="font-medium text-slate-700">
                      {prop.monthlyRent ? formatCurrency(prop.monthlyRent) : '—'}
                    </p>
                  </div>
                </div>

                {/* Notes */}
                {prop.notes && (
                  <p className="italic text-slate-500 text-xs mt-3 line-clamp-2">{prop.notes}</p>
                )}

                {/* Footer */}
                {prop.purchaseDate && (
                  <p className="text-xs text-slate-400 mt-3">
                    Purchased {formatDate(prop.purchaseDate)}
                  </p>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* ADD / EDIT MODAL */}
      {(showAddModal || selectedProperty) && (
        <PropertyModal
          property={selectedProperty}
          onClose={() => {
            setShowAddModal(false)
            setSelectedProperty(null)
          }}
          onSave={loadProperties}
        />
      )}
    </div>
  )
}

// ============ MODAL COMPONENT ============

interface PropertyModalProps {
  property: PortfolioProperty | null
  onClose: () => void
  onSave: () => Promise<void>
}

function PropertyModal({ property, onClose, onSave }: PropertyModalProps) {
  const isEditing = !!property

  const [formData, setFormData] = useState<Omit<PortfolioProperty, 'id' | 'createdAt' | 'updatedAt'>>(() => {
    if (property) {
      return {
        address: property.address,
        city: property.city || '',
        state: property.state || '',
        zip: property.zip || '',
        propertyType: property.propertyType,
        units: property.units,
        purchaseDate: property.purchaseDate || '',
        purchasePrice: property.purchasePrice,
        rehabCost: property.rehabCost,
        currentValue: property.currentValue,
        loanBalance: property.loanBalance,
        monthlyMortgage: property.monthlyMortgage,
        monthlyRent: property.monthlyRent,
        notes: property.notes || '',
      }
    }
    return { ...BLANK_FORM }
  })

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>
  ) => {
    const { name, value, type } = e.target
    setFormData((prev) => ({
      ...prev,
      [name]: type === 'number' ? (value === '' ? undefined : parseFloat(value)) : value,
    }))
  }

  const handleSave = async () => {
    if (!formData.address.trim()) {
      toast.error('Address is required')
      return
    }
    if (isEditing && property) {
      await updatePortfolioProperty(property.id, formData)
      toast.success('Property updated.')
    } else {
      await createPortfolioProperty(formData)
      toast.success('Property added.')
    }
    await onSave()
    onClose()
  }

  const inputClass =
    'w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 text-sm'

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white rounded-xl p-6 w-full max-w-lg mx-4 max-h-[90vh] overflow-y-auto">
        <h2 className="text-lg font-semibold text-slate-800 mb-4">
          {isEditing ? 'Edit Property' : 'Add Property'}
        </h2>

        <div className="space-y-4">
          {/* Address */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              Address <span className="text-red-500">*</span>
            </label>
            <input
              name="address"
              type="text"
              value={formData.address}
              onChange={handleChange}
              placeholder="e.g. 1842 Ridgewood Dr"
              className={inputClass}
            />
          </div>

          {/* City / State / ZIP */}
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">City</label>
              <input
                name="city"
                type="text"
                value={formData.city || ''}
                onChange={handleChange}
                placeholder="City"
                className={inputClass}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">State</label>
              <input
                name="state"
                type="text"
                value={formData.state || ''}
                onChange={handleChange}
                placeholder="TX"
                maxLength={2}
                className={inputClass}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">ZIP</label>
              <input
                name="zip"
                type="text"
                value={formData.zip || ''}
                onChange={handleChange}
                placeholder="78201"
                className={inputClass}
              />
            </div>
          </div>

          {/* Property Type + Units */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Property Type
              </label>
              <select
                name="propertyType"
                value={formData.propertyType}
                onChange={handleChange}
                className={inputClass}
              >
                <option value="single_family">Single Family</option>
                <option value="multi_family">Multi-Family</option>
                <option value="condo">Condo</option>
                <option value="townhouse">Townhouse</option>
                <option value="commercial">Commercial</option>
                <option value="land">Land</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Units</label>
              <input
                name="units"
                type="number"
                min={1}
                value={formData.units}
                onChange={handleChange}
                className={inputClass}
              />
            </div>
          </div>

          {/* Purchase Date */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Purchase Date</label>
            <input
              name="purchaseDate"
              type="date"
              value={formData.purchaseDate ? formData.purchaseDate.slice(0, 10) : ''}
              onChange={handleChange}
              className={inputClass}
            />
          </div>

          {/* Purchase Price / Rehab Cost / Current Value */}
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Purchase Price
              </label>
              <input
                name="purchasePrice"
                type="number"
                min={0}
                value={formData.purchasePrice ?? ''}
                onChange={handleChange}
                placeholder="0"
                className={inputClass}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Rehab Cost</label>
              <input
                name="rehabCost"
                type="number"
                min={0}
                value={formData.rehabCost ?? ''}
                onChange={handleChange}
                placeholder="0"
                className={inputClass}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Current Value
              </label>
              <input
                name="currentValue"
                type="number"
                min={0}
                value={formData.currentValue ?? ''}
                onChange={handleChange}
                placeholder="0"
                className={inputClass}
              />
            </div>
          </div>

          {/* Loan Balance / Monthly Mortgage / Monthly Rent */}
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Loan Balance</label>
              <input
                name="loanBalance"
                type="number"
                min={0}
                value={formData.loanBalance ?? ''}
                onChange={handleChange}
                placeholder="0"
                className={inputClass}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Monthly Mortgage
              </label>
              <input
                name="monthlyMortgage"
                type="number"
                min={0}
                value={formData.monthlyMortgage ?? ''}
                onChange={handleChange}
                placeholder="0"
                className={inputClass}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Monthly Rent</label>
              <input
                name="monthlyRent"
                type="number"
                min={0}
                value={formData.monthlyRent ?? ''}
                onChange={handleChange}
                placeholder="0"
                className={inputClass}
              />
            </div>
          </div>

          {/* Notes */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Notes</label>
            <textarea
              name="notes"
              rows={3}
              value={formData.notes || ''}
              onChange={handleChange}
              placeholder="Any additional details..."
              className={inputClass + ' resize-none'}
            />
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center justify-end gap-3 mt-6">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            className="px-4 py-2 text-sm font-medium text-white bg-primary-500 rounded-lg hover:bg-primary-600 transition-colors"
          >
            {isEditing ? 'Save Changes' : 'Add Property'}
          </button>
        </div>
      </div>
    </div>
  )
}
