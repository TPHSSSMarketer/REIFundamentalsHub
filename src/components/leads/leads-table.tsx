'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Avatar } from '@/components/ui/avatar'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import {
  Phone,
  Mail,
  MoreHorizontal,
  Search,
  Filter,
  ChevronLeft,
  ChevronRight,
  Eye,
  Edit,
  Trash2,
  MessageSquare,
} from 'lucide-react'
import { formatDate, formatCurrency, formatPhoneNumber } from '@/lib/utils'
import type { Lead } from '@/types'

interface LeadsTableProps {
  leads: Lead[]
  onView: (lead: Lead) => void
  onEdit: (lead: Lead) => void
  onDelete: (lead: Lead) => void
  onSendMessage: (lead: Lead) => void
}

const statusColors: Record<Lead['status'], 'default' | 'secondary' | 'success' | 'warning' | 'info' | 'destructive'> = {
  new: 'info',
  contacted: 'secondary',
  qualified: 'warning',
  appointment_set: 'warning',
  offer_made: 'warning',
  under_contract: 'success',
  closed: 'success',
  dead: 'destructive',
}

const statusLabels: Record<Lead['status'], string> = {
  new: 'New',
  contacted: 'Contacted',
  qualified: 'Qualified',
  appointment_set: 'Appointment',
  offer_made: 'Offer Made',
  under_contract: 'Contract',
  closed: 'Closed',
  dead: 'Dead',
}

const motivationColors: Record<string, string> = {
  low: 'bg-gray-100 text-gray-800',
  medium: 'bg-yellow-100 text-yellow-800',
  high: 'bg-orange-100 text-orange-800',
  very_high: 'bg-red-100 text-red-800',
}

const statusFilterOptions = [
  { value: '', label: 'All Statuses' },
  { value: 'new', label: 'New' },
  { value: 'contacted', label: 'Contacted' },
  { value: 'qualified', label: 'Qualified' },
  { value: 'appointment_set', label: 'Appointment Set' },
  { value: 'offer_made', label: 'Offer Made' },
  { value: 'under_contract', label: 'Under Contract' },
  { value: 'closed', label: 'Closed' },
  { value: 'dead', label: 'Dead' },
]

export function LeadsTable({
  leads,
  onView,
  onEdit,
  onDelete,
  onSendMessage,
}: LeadsTableProps) {
  const [searchQuery, setSearchQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [currentPage, setCurrentPage] = useState(1)
  const [openMenuId, setOpenMenuId] = useState<string | null>(null)
  const pageSize = 10

  // Filter leads
  const filteredLeads = leads.filter((lead) => {
    const matchesSearch =
      !searchQuery ||
      `${lead.firstName} ${lead.lastName}`.toLowerCase().includes(searchQuery.toLowerCase()) ||
      lead.email?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      lead.phone?.includes(searchQuery) ||
      lead.address?.toLowerCase().includes(searchQuery.toLowerCase())

    const matchesStatus = !statusFilter || lead.status === statusFilter

    return matchesSearch && matchesStatus
  })

  // Paginate
  const totalPages = Math.ceil(filteredLeads.length / pageSize)
  const paginatedLeads = filteredLeads.slice(
    (currentPage - 1) * pageSize,
    currentPage * pageSize
  )

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search leads..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-8"
          />
        </div>
        <div className="w-full sm:w-48">
          <Select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            options={statusFilterOptions}
          />
        </div>
      </div>

      {/* Table */}
      <div className="rounded-lg border bg-card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-muted/50">
              <tr>
                <th className="text-left p-4 font-medium">Lead</th>
                <th className="text-left p-4 font-medium hidden md:table-cell">Property</th>
                <th className="text-left p-4 font-medium hidden lg:table-cell">Source</th>
                <th className="text-left p-4 font-medium">Status</th>
                <th className="text-left p-4 font-medium hidden lg:table-cell">Value</th>
                <th className="text-left p-4 font-medium hidden xl:table-cell">Added</th>
                <th className="text-right p-4 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {paginatedLeads.length === 0 ? (
                <tr>
                  <td colSpan={7} className="p-8 text-center text-muted-foreground">
                    No leads found
                  </td>
                </tr>
              ) : (
                paginatedLeads.map((lead) => (
                  <tr
                    key={lead.id}
                    className="hover:bg-muted/50 transition-colors"
                  >
                    <td className="p-4">
                      <div className="flex items-center gap-3">
                        <Avatar fallback={`${lead.firstName} ${lead.lastName}`} size="sm" />
                        <div>
                          <p className="font-medium">
                            {lead.firstName} {lead.lastName}
                          </p>
                          <div className="flex items-center gap-2 text-sm text-muted-foreground">
                            <span className="hidden sm:inline">{formatPhoneNumber(lead.phone)}</span>
                            {lead.motivation && (
                              <span className={`text-xs px-1.5 py-0.5 rounded ${motivationColors[lead.motivation]}`}>
                                {lead.motivation.replace('_', ' ')}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="p-4 hidden md:table-cell">
                      <div className="text-sm">
                        {lead.address ? (
                          <>
                            <p>{lead.address}</p>
                            <p className="text-muted-foreground">
                              {lead.city}, {lead.state} {lead.zipCode}
                            </p>
                          </>
                        ) : (
                          <span className="text-muted-foreground">No address</span>
                        )}
                      </div>
                    </td>
                    <td className="p-4 hidden lg:table-cell">
                      <span className="text-sm capitalize">
                        {lead.source?.replace('_', ' ') || 'Unknown'}
                      </span>
                    </td>
                    <td className="p-4">
                      <Badge variant={statusColors[lead.status]}>
                        {statusLabels[lead.status]}
                      </Badge>
                    </td>
                    <td className="p-4 hidden lg:table-cell">
                      {lead.estimatedValue ? formatCurrency(lead.estimatedValue) : '-'}
                    </td>
                    <td className="p-4 hidden xl:table-cell text-sm text-muted-foreground">
                      {formatDate(lead.createdAt)}
                    </td>
                    <td className="p-4">
                      <div className="flex items-center justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => window.location.href = `tel:${lead.phone}`}
                          title="Call"
                        >
                          <Phone className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => onSendMessage(lead)}
                          title="Send Message"
                        >
                          <MessageSquare className="h-4 w-4" />
                        </Button>
                        <div className="relative">
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => setOpenMenuId(openMenuId === lead.id ? null : lead.id)}
                          >
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                          {openMenuId === lead.id && (
                            <>
                              <div
                                className="fixed inset-0 z-10"
                                onClick={() => setOpenMenuId(null)}
                              />
                              <div className="absolute right-0 top-full mt-1 w-36 rounded-lg border bg-card shadow-lg z-20">
                                <button
                                  className="flex w-full items-center gap-2 px-3 py-2 text-sm hover:bg-muted"
                                  onClick={() => {
                                    onView(lead)
                                    setOpenMenuId(null)
                                  }}
                                >
                                  <Eye className="h-4 w-4" />
                                  View
                                </button>
                                <button
                                  className="flex w-full items-center gap-2 px-3 py-2 text-sm hover:bg-muted"
                                  onClick={() => {
                                    onEdit(lead)
                                    setOpenMenuId(null)
                                  }}
                                >
                                  <Edit className="h-4 w-4" />
                                  Edit
                                </button>
                                <button
                                  className="flex w-full items-center gap-2 px-3 py-2 text-sm text-destructive hover:bg-muted"
                                  onClick={() => {
                                    onDelete(lead)
                                    setOpenMenuId(null)
                                  }}
                                >
                                  <Trash2 className="h-4 w-4" />
                                  Delete
                                </button>
                              </div>
                            </>
                          )}
                        </div>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t">
            <p className="text-sm text-muted-foreground">
              Showing {(currentPage - 1) * pageSize + 1} to{' '}
              {Math.min(currentPage * pageSize, filteredLeads.length)} of{' '}
              {filteredLeads.length} leads
            </p>
            <div className="flex items-center gap-1">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setCurrentPage((p) => p - 1)}
                disabled={currentPage === 1}
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <span className="px-3 text-sm">
                {currentPage} / {totalPages}
              </span>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setCurrentPage((p) => p + 1)}
                disabled={currentPage === totalPages}
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
