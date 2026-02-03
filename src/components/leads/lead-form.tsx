'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { Loader2 } from 'lucide-react'
import type { Lead, PropertyType, LeadSource, LeadStatus, MotivationLevel } from '@/types'

interface LeadFormProps {
  lead?: Lead
  onSubmit: (data: Partial<Lead>) => Promise<void>
  onCancel: () => void
}

const propertyTypeOptions = [
  { value: 'single_family', label: 'Single Family' },
  { value: 'multi_family', label: 'Multi Family' },
  { value: 'condo', label: 'Condo' },
  { value: 'townhouse', label: 'Townhouse' },
  { value: 'land', label: 'Land' },
  { value: 'commercial', label: 'Commercial' },
  { value: 'other', label: 'Other' },
]

const sourceOptions = [
  { value: 'website', label: 'Website' },
  { value: 'referral', label: 'Referral' },
  { value: 'direct_mail', label: 'Direct Mail' },
  { value: 'cold_call', label: 'Cold Call' },
  { value: 'sms', label: 'SMS' },
  { value: 'facebook', label: 'Facebook' },
  { value: 'google', label: 'Google' },
  { value: 'bandit_signs', label: 'Bandit Signs' },
  { value: 'driving_for_dollars', label: 'Driving for Dollars' },
  { value: 'other', label: 'Other' },
]

const statusOptions = [
  { value: 'new', label: 'New' },
  { value: 'contacted', label: 'Contacted' },
  { value: 'qualified', label: 'Qualified' },
  { value: 'appointment_set', label: 'Appointment Set' },
  { value: 'offer_made', label: 'Offer Made' },
  { value: 'under_contract', label: 'Under Contract' },
  { value: 'closed', label: 'Closed' },
  { value: 'dead', label: 'Dead' },
]

const motivationOptions = [
  { value: 'low', label: 'Low' },
  { value: 'medium', label: 'Medium' },
  { value: 'high', label: 'High' },
  { value: 'very_high', label: 'Very High' },
]

export function LeadForm({ lead, onSubmit, onCancel }: LeadFormProps) {
  const [isLoading, setIsLoading] = useState(false)
  const [formData, setFormData] = useState({
    firstName: lead?.firstName || '',
    lastName: lead?.lastName || '',
    email: lead?.email || '',
    phone: lead?.phone || '',
    address: lead?.address || '',
    city: lead?.city || '',
    state: lead?.state || '',
    zipCode: lead?.zipCode || '',
    propertyType: lead?.propertyType || '',
    source: lead?.source || '',
    status: lead?.status || 'new',
    motivation: lead?.motivation || '',
    estimatedValue: lead?.estimatedValue?.toString() || '',
    notes: lead?.notes || '',
  })

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>
  ) => {
    const { name, value } = e.target
    setFormData((prev) => ({ ...prev, [name]: value }))
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsLoading(true)

    try {
      await onSubmit({
        ...formData,
        propertyType: formData.propertyType as PropertyType,
        source: formData.source as LeadSource,
        status: formData.status as LeadStatus,
        motivation: formData.motivation as MotivationLevel,
        estimatedValue: formData.estimatedValue ? parseFloat(formData.estimatedValue) : undefined,
      })
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* Contact Information */}
      <div>
        <h4 className="font-medium mb-3">Contact Information</h4>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="text-sm font-medium">First Name *</label>
            <Input
              name="firstName"
              value={formData.firstName}
              onChange={handleChange}
              required
            />
          </div>
          <div>
            <label className="text-sm font-medium">Last Name *</label>
            <Input
              name="lastName"
              value={formData.lastName}
              onChange={handleChange}
              required
            />
          </div>
          <div>
            <label className="text-sm font-medium">Email</label>
            <Input
              name="email"
              type="email"
              value={formData.email}
              onChange={handleChange}
            />
          </div>
          <div>
            <label className="text-sm font-medium">Phone *</label>
            <Input
              name="phone"
              type="tel"
              value={formData.phone}
              onChange={handleChange}
              required
            />
          </div>
        </div>
      </div>

      {/* Property Information */}
      <div>
        <h4 className="font-medium mb-3">Property Information</h4>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="md:col-span-2">
            <label className="text-sm font-medium">Address</label>
            <Input
              name="address"
              value={formData.address}
              onChange={handleChange}
            />
          </div>
          <div>
            <label className="text-sm font-medium">City</label>
            <Input
              name="city"
              value={formData.city}
              onChange={handleChange}
            />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-sm font-medium">State</label>
              <Input
                name="state"
                value={formData.state}
                onChange={handleChange}
                maxLength={2}
              />
            </div>
            <div>
              <label className="text-sm font-medium">ZIP</label>
              <Input
                name="zipCode"
                value={formData.zipCode}
                onChange={handleChange}
              />
            </div>
          </div>
          <div>
            <label className="text-sm font-medium">Property Type</label>
            <Select
              name="propertyType"
              value={formData.propertyType}
              onChange={handleChange}
              options={propertyTypeOptions}
              placeholder="Select type..."
            />
          </div>
          <div>
            <label className="text-sm font-medium">Estimated Value</label>
            <Input
              name="estimatedValue"
              type="number"
              value={formData.estimatedValue}
              onChange={handleChange}
              placeholder="$0"
            />
          </div>
        </div>
      </div>

      {/* Lead Details */}
      <div>
        <h4 className="font-medium mb-3">Lead Details</h4>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label className="text-sm font-medium">Source</label>
            <Select
              name="source"
              value={formData.source}
              onChange={handleChange}
              options={sourceOptions}
              placeholder="Select source..."
            />
          </div>
          <div>
            <label className="text-sm font-medium">Status</label>
            <Select
              name="status"
              value={formData.status}
              onChange={handleChange}
              options={statusOptions}
            />
          </div>
          <div>
            <label className="text-sm font-medium">Motivation Level</label>
            <Select
              name="motivation"
              value={formData.motivation}
              onChange={handleChange}
              options={motivationOptions}
              placeholder="Select level..."
            />
          </div>
        </div>
      </div>

      {/* Notes */}
      <div>
        <label className="text-sm font-medium">Notes</label>
        <Textarea
          name="notes"
          value={formData.notes}
          onChange={handleChange}
          rows={3}
          placeholder="Add any notes about this lead..."
        />
      </div>

      {/* Actions */}
      <div className="flex justify-end gap-3 pt-4 border-t">
        <Button type="button" variant="outline" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" disabled={isLoading}>
          {isLoading ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Saving...
            </>
          ) : (
            lead ? 'Update Lead' : 'Add Lead'
          )}
        </Button>
      </div>
    </form>
  )
}
