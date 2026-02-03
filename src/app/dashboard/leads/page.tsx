'use client'

import { useState } from 'react'
import { Header } from '@/components/layout/header'
import { Button } from '@/components/ui/button'
import { Modal } from '@/components/ui/modal'
import { LeadsTable } from '@/components/leads/leads-table'
import { LeadForm } from '@/components/leads/lead-form'
import { UserPlus, Upload, Download } from 'lucide-react'
import { toast } from 'sonner'
import type { Lead } from '@/types'

// Mock data
const mockLeads: Lead[] = [
  {
    id: '1',
    firstName: 'John',
    lastName: 'Smith',
    email: 'john@example.com',
    phone: '5551234567',
    address: '123 Main St',
    city: 'Dallas',
    state: 'TX',
    zipCode: '75001',
    propertyType: 'single_family',
    source: 'direct_mail',
    status: 'new',
    tags: ['motivated', 'cash'],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    motivation: 'high',
    estimatedValue: 185000,
  },
  {
    id: '2',
    firstName: 'Sarah',
    lastName: 'Johnson',
    email: 'sarah@example.com',
    phone: '5559876543',
    address: '456 Oak Ave',
    city: 'Fort Worth',
    state: 'TX',
    zipCode: '76102',
    propertyType: 'single_family',
    source: 'facebook',
    status: 'qualified',
    tags: ['pre-foreclosure'],
    createdAt: new Date(Date.now() - 86400000).toISOString(),
    updatedAt: new Date().toISOString(),
    motivation: 'very_high',
    estimatedValue: 225000,
  },
  {
    id: '3',
    firstName: 'Michael',
    lastName: 'Williams',
    email: 'mike@example.com',
    phone: '5555551234',
    address: '789 Pine Rd',
    city: 'Arlington',
    state: 'TX',
    zipCode: '76010',
    propertyType: 'multi_family',
    source: 'referral',
    status: 'appointment_set',
    tags: ['investor'],
    createdAt: new Date(Date.now() - 172800000).toISOString(),
    updatedAt: new Date().toISOString(),
    motivation: 'medium',
    estimatedValue: 450000,
  },
  {
    id: '4',
    firstName: 'Emily',
    lastName: 'Davis',
    email: 'emily@example.com',
    phone: '5552223333',
    address: '321 Elm St',
    city: 'Plano',
    state: 'TX',
    zipCode: '75024',
    propertyType: 'single_family',
    source: 'driving_for_dollars',
    status: 'offer_made',
    tags: ['vacant', 'absentee'],
    createdAt: new Date(Date.now() - 259200000).toISOString(),
    updatedAt: new Date().toISOString(),
    motivation: 'high',
    estimatedValue: 165000,
  },
  {
    id: '5',
    firstName: 'Robert',
    lastName: 'Brown',
    email: 'robert@example.com',
    phone: '5554445555',
    address: '555 Cedar Ln',
    city: 'Irving',
    state: 'TX',
    zipCode: '75060',
    propertyType: 'single_family',
    source: 'cold_call',
    status: 'under_contract',
    tags: ['probate'],
    createdAt: new Date(Date.now() - 604800000).toISOString(),
    updatedAt: new Date().toISOString(),
    motivation: 'high',
    estimatedValue: 195000,
  },
  {
    id: '6',
    firstName: 'Jennifer',
    lastName: 'Martinez',
    email: 'jennifer@example.com',
    phone: '5556667777',
    address: '777 Birch Dr',
    city: 'Garland',
    state: 'TX',
    zipCode: '75040',
    propertyType: 'townhouse',
    source: 'google',
    status: 'contacted',
    tags: [],
    createdAt: new Date(Date.now() - 432000000).toISOString(),
    updatedAt: new Date().toISOString(),
    motivation: 'low',
    estimatedValue: 275000,
  },
  {
    id: '7',
    firstName: 'David',
    lastName: 'Garcia',
    email: 'david@example.com',
    phone: '5558889999',
    address: '999 Maple Way',
    city: 'Mesquite',
    state: 'TX',
    zipCode: '75150',
    propertyType: 'single_family',
    source: 'bandit_signs',
    status: 'closed',
    tags: ['wholesale'],
    createdAt: new Date(Date.now() - 1209600000).toISOString(),
    updatedAt: new Date().toISOString(),
    motivation: 'very_high',
    estimatedValue: 145000,
  },
  {
    id: '8',
    firstName: 'Lisa',
    lastName: 'Anderson',
    email: 'lisa@example.com',
    phone: '5550001111',
    address: '111 Willow St',
    city: 'Richardson',
    state: 'TX',
    zipCode: '75080',
    propertyType: 'condo',
    source: 'website',
    status: 'dead',
    tags: [],
    createdAt: new Date(Date.now() - 2592000000).toISOString(),
    updatedAt: new Date().toISOString(),
    motivation: 'low',
    estimatedValue: 180000,
  },
]

export default function LeadsPage() {
  const [leads, setLeads] = useState<Lead[]>(mockLeads)
  const [isAddModalOpen, setIsAddModalOpen] = useState(false)
  const [editingLead, setEditingLead] = useState<Lead | null>(null)
  const [viewingLead, setViewingLead] = useState<Lead | null>(null)
  const [deletingLead, setDeletingLead] = useState<Lead | null>(null)
  const [messageModalLead, setMessageModalLead] = useState<Lead | null>(null)

  const handleAddLead = async (data: Partial<Lead>) => {
    // In production, this would call the GHL API
    const newLead: Lead = {
      ...data,
      id: Date.now().toString(),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      tags: [],
    } as Lead

    setLeads((prev) => [newLead, ...prev])
    setIsAddModalOpen(false)
    toast.success('Lead added successfully!')
  }

  const handleEditLead = async (data: Partial<Lead>) => {
    if (!editingLead) return

    // In production, this would call the GHL API
    setLeads((prev) =>
      prev.map((lead) =>
        lead.id === editingLead.id
          ? { ...lead, ...data, updatedAt: new Date().toISOString() }
          : lead
      )
    )
    setEditingLead(null)
    toast.success('Lead updated successfully!')
  }

  const handleDeleteLead = async () => {
    if (!deletingLead) return

    // In production, this would call the GHL API
    setLeads((prev) => prev.filter((lead) => lead.id !== deletingLead.id))
    setDeletingLead(null)
    toast.success('Lead deleted successfully!')
  }

  return (
    <div className="min-h-screen">
      <Header
        title="Leads"
        description="Manage and track all your real estate leads"
      />

      <div className="p-6 space-y-6">
        {/* Actions bar */}
        <div className="flex flex-col sm:flex-row gap-4 justify-between">
          <div className="flex gap-2">
            <Button onClick={() => setIsAddModalOpen(true)}>
              <UserPlus className="h-4 w-4 mr-2" />
              Add Lead
            </Button>
            <Button variant="outline">
              <Upload className="h-4 w-4 mr-2" />
              Import
            </Button>
            <Button variant="outline">
              <Download className="h-4 w-4 mr-2" />
              Export
            </Button>
          </div>
          <div className="text-sm text-muted-foreground">
            {leads.length} total leads
          </div>
        </div>

        {/* Leads table */}
        <LeadsTable
          leads={leads}
          onView={setViewingLead}
          onEdit={setEditingLead}
          onDelete={setDeletingLead}
          onSendMessage={setMessageModalLead}
        />
      </div>

      {/* Add Lead Modal */}
      <Modal
        isOpen={isAddModalOpen}
        onClose={() => setIsAddModalOpen(false)}
        title="Add New Lead"
        description="Create a new lead to track in your pipeline"
        size="lg"
      >
        <LeadForm
          onSubmit={handleAddLead}
          onCancel={() => setIsAddModalOpen(false)}
        />
      </Modal>

      {/* Edit Lead Modal */}
      <Modal
        isOpen={!!editingLead}
        onClose={() => setEditingLead(null)}
        title="Edit Lead"
        description="Update lead information"
        size="lg"
      >
        {editingLead && (
          <LeadForm
            lead={editingLead}
            onSubmit={handleEditLead}
            onCancel={() => setEditingLead(null)}
          />
        )}
      </Modal>

      {/* View Lead Modal */}
      <Modal
        isOpen={!!viewingLead}
        onClose={() => setViewingLead(null)}
        title={viewingLead ? `${viewingLead.firstName} ${viewingLead.lastName}` : ''}
        size="lg"
      >
        {viewingLead && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-sm text-muted-foreground">Phone</p>
                <p className="font-medium">{viewingLead.phone}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Email</p>
                <p className="font-medium">{viewingLead.email || 'N/A'}</p>
              </div>
              <div className="col-span-2">
                <p className="text-sm text-muted-foreground">Address</p>
                <p className="font-medium">
                  {viewingLead.address}, {viewingLead.city}, {viewingLead.state}{' '}
                  {viewingLead.zipCode}
                </p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Property Type</p>
                <p className="font-medium capitalize">
                  {viewingLead.propertyType?.replace('_', ' ') || 'N/A'}
                </p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Estimated Value</p>
                <p className="font-medium">
                  {viewingLead.estimatedValue
                    ? `$${viewingLead.estimatedValue.toLocaleString()}`
                    : 'N/A'}
                </p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Source</p>
                <p className="font-medium capitalize">
                  {viewingLead.source?.replace('_', ' ')}
                </p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Motivation</p>
                <p className="font-medium capitalize">
                  {viewingLead.motivation?.replace('_', ' ') || 'N/A'}
                </p>
              </div>
            </div>
            {viewingLead.notes && (
              <div>
                <p className="text-sm text-muted-foreground">Notes</p>
                <p className="font-medium">{viewingLead.notes}</p>
              </div>
            )}
            <div className="flex justify-end gap-2 pt-4 border-t">
              <Button variant="outline" onClick={() => setViewingLead(null)}>
                Close
              </Button>
              <Button
                onClick={() => {
                  setViewingLead(null)
                  setEditingLead(viewingLead)
                }}
              >
                Edit Lead
              </Button>
            </div>
          </div>
        )}
      </Modal>

      {/* Delete Confirmation Modal */}
      <Modal
        isOpen={!!deletingLead}
        onClose={() => setDeletingLead(null)}
        title="Delete Lead"
        size="sm"
      >
        <div className="space-y-4">
          <p>
            Are you sure you want to delete{' '}
            <strong>
              {deletingLead?.firstName} {deletingLead?.lastName}
            </strong>
            ? This action cannot be undone.
          </p>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setDeletingLead(null)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleDeleteLead}>
              Delete
            </Button>
          </div>
        </div>
      </Modal>

      {/* Send Message Modal */}
      <Modal
        isOpen={!!messageModalLead}
        onClose={() => setMessageModalLead(null)}
        title={`Message ${messageModalLead?.firstName || ''}`}
        size="md"
      >
        {messageModalLead && (
          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium">Message</label>
              <textarea
                className="w-full mt-1 rounded-md border p-3 min-h-[120px]"
                placeholder="Type your message here..."
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setMessageModalLead(null)}>
                Cancel
              </Button>
              <Button
                onClick={() => {
                  toast.success('Message sent!')
                  setMessageModalLead(null)
                }}
              >
                Send SMS
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  )
}
