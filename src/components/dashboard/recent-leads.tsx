'use client'

import Link from 'next/link'
import { Avatar } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { formatDate, formatPhoneNumber } from '@/lib/utils'
import { ArrowRight, Phone, Mail } from 'lucide-react'
import type { Lead } from '@/types'

interface RecentLeadsProps {
  leads: Lead[]
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

export function RecentLeads({ leads }: RecentLeadsProps) {
  if (leads.length === 0) {
    return (
      <div className="rounded-xl border bg-card p-6">
        <h3 className="font-semibold">Recent Leads</h3>
        <p className="mt-4 text-center text-muted-foreground py-8">
          No leads yet. Start adding leads to see them here.
        </p>
      </div>
    )
  }

  return (
    <div className="rounded-xl border bg-card">
      <div className="flex items-center justify-between p-6 border-b">
        <h3 className="font-semibold">Recent Leads</h3>
        <Link href="/dashboard/leads">
          <Button variant="ghost" size="sm">
            View All
            <ArrowRight className="ml-1 h-4 w-4" />
          </Button>
        </Link>
      </div>
      <div className="divide-y">
        {leads.map((lead) => (
          <div
            key={lead.id}
            className="flex items-center justify-between p-4 hover:bg-muted/50 transition-colors"
          >
            <div className="flex items-center gap-3">
              <Avatar
                fallback={`${lead.firstName} ${lead.lastName}`}
                size="md"
              />
              <div>
                <p className="font-medium">
                  {lead.firstName} {lead.lastName}
                </p>
                <p className="text-sm text-muted-foreground">
                  {lead.address ? `${lead.address}, ${lead.city}` : 'No address'}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-4">
              <Badge variant={statusColors[lead.status]}>
                {statusLabels[lead.status]}
              </Badge>
              <div className="hidden md:flex items-center gap-2">
                <Button variant="ghost" size="icon" asChild>
                  <a href={`tel:${lead.phone}`}>
                    <Phone className="h-4 w-4" />
                  </a>
                </Button>
                <Button variant="ghost" size="icon" asChild>
                  <a href={`mailto:${lead.email}`}>
                    <Mail className="h-4 w-4" />
                  </a>
                </Button>
              </div>
              <span className="text-sm text-muted-foreground hidden lg:block">
                {formatDate(lead.createdAt)}
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
