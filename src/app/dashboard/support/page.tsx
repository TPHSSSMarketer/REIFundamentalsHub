'use client'

import { useState } from 'react'
import { Header } from '@/components/layout/header'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Modal } from '@/components/ui/modal'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import {
  Plus,
  MessageSquare,
  Clock,
  CheckCircle,
  AlertCircle,
  HelpCircle,
  Send,
  Paperclip,
} from 'lucide-react'
import { formatDate } from '@/lib/utils'
import { toast } from 'sonner'
import type { SupportTicket, TicketCategory, TicketPriority, TicketStatus } from '@/types'

interface ExtendedTicket extends SupportTicket {
  lastReply?: string
}

const mockTickets: ExtendedTicket[] = [
  {
    id: '1',
    userId: '1',
    subject: 'Need help setting up SMS automation',
    description: 'I want to set up an automated SMS sequence for new leads but I am having trouble understanding how to configure the triggers.',
    category: 'training',
    priority: 'medium',
    status: 'in_progress',
    createdAt: new Date(Date.now() - 86400000).toISOString(),
    updatedAt: new Date(Date.now() - 3600000).toISOString(),
    lastReply: 'Support team is looking into this.',
    messages: [],
  },
  {
    id: '2',
    userId: '1',
    subject: 'Feature Request: Add property comps',
    description: 'It would be great if we could see comparable property sales directly in the lead details page.',
    category: 'feature_request',
    priority: 'low',
    status: 'open',
    createdAt: new Date(Date.now() - 259200000).toISOString(),
    updatedAt: new Date(Date.now() - 259200000).toISOString(),
    messages: [],
  },
  {
    id: '3',
    userId: '1',
    subject: 'Integration not syncing leads',
    description: 'My leads from the website form are not showing up in the CRM. I have checked the API key and it seems correct.',
    category: 'integration',
    priority: 'high',
    status: 'waiting',
    createdAt: new Date(Date.now() - 172800000).toISOString(),
    updatedAt: new Date(Date.now() - 43200000).toISOString(),
    lastReply: 'We need more information. Can you provide your website URL?',
    messages: [],
  },
  {
    id: '4',
    userId: '1',
    subject: 'Dashboard loading slowly',
    description: 'The dashboard takes a long time to load, especially the pipeline view.',
    category: 'technical',
    priority: 'medium',
    status: 'resolved',
    createdAt: new Date(Date.now() - 604800000).toISOString(),
    updatedAt: new Date(Date.now() - 518400000).toISOString(),
    resolvedAt: new Date(Date.now() - 518400000).toISOString(),
    lastReply: 'This has been fixed in our latest update.',
    messages: [],
  },
]

const statusIcons: Record<TicketStatus, typeof Clock> = {
  open: AlertCircle,
  in_progress: Clock,
  waiting: HelpCircle,
  resolved: CheckCircle,
  closed: CheckCircle,
}

const statusColors: Record<TicketStatus, 'default' | 'info' | 'warning' | 'success' | 'secondary'> = {
  open: 'info',
  in_progress: 'warning',
  waiting: 'secondary',
  resolved: 'success',
  closed: 'default',
}

const priorityColors: Record<TicketPriority, string> = {
  low: 'bg-gray-100 text-gray-800',
  medium: 'bg-yellow-100 text-yellow-800',
  high: 'bg-orange-100 text-orange-800',
  urgent: 'bg-red-100 text-red-800',
}

const categoryLabels: Record<TicketCategory, string> = {
  technical: 'Technical Issue',
  billing: 'Billing',
  feature_request: 'Feature Request',
  integration: 'Integration',
  training: 'Training',
  other: 'Other',
}

export default function SupportPage() {
  const [tickets, setTickets] = useState(mockTickets)
  const [isNewTicketOpen, setIsNewTicketOpen] = useState(false)
  const [selectedTicket, setSelectedTicket] = useState<ExtendedTicket | null>(null)
  const [replyMessage, setReplyMessage] = useState('')
  const [newTicket, setNewTicket] = useState({
    subject: '',
    category: '' as TicketCategory,
    priority: 'medium' as TicketPriority,
    description: '',
  })

  const handleCreateTicket = () => {
    const ticket: ExtendedTicket = {
      id: Date.now().toString(),
      userId: '1',
      subject: newTicket.subject,
      description: newTicket.description,
      category: newTicket.category,
      priority: newTicket.priority,
      status: 'open',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      messages: [],
    }

    setTickets((prev) => [ticket, ...prev])
    setIsNewTicketOpen(false)
    setNewTicket({ subject: '', category: '' as TicketCategory, priority: 'medium', description: '' })
    toast.success('Support ticket created! We will respond shortly.')
  }

  const handleSendReply = () => {
    if (!selectedTicket || !replyMessage.trim()) return

    setTickets((prev) =>
      prev.map((t) =>
        t.id === selectedTicket.id
          ? { ...t, updatedAt: new Date().toISOString(), status: 'waiting' as TicketStatus }
          : t
      )
    )
    setReplyMessage('')
    toast.success('Reply sent!')
  }

  const openTicketsCount = tickets.filter((t) => t.status === 'open' || t.status === 'in_progress').length

  return (
    <div className="min-h-screen">
      <Header
        title="Support"
        description="Need help? Submit a ticket and we'll assist you"
      />

      <div className="p-6 space-y-6">
        {/* Summary */}
        <div className="flex flex-wrap gap-4 items-center justify-between">
          <div className="flex gap-4">
            <div className="bg-card border rounded-lg px-4 py-2">
              <span className="text-sm text-muted-foreground">Open Tickets:</span>
              <span className="ml-2 font-bold text-primary">{openTicketsCount}</span>
            </div>
            <div className="bg-card border rounded-lg px-4 py-2">
              <span className="text-sm text-muted-foreground">Total Tickets:</span>
              <span className="ml-2 font-bold">{tickets.length}</span>
            </div>
          </div>
          <Button onClick={() => setIsNewTicketOpen(true)}>
            <Plus className="h-4 w-4 mr-2" />
            New Ticket
          </Button>
        </div>

        {/* Tickets List */}
        <div className="space-y-4">
          {tickets.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center">
                <MessageSquare className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                <p className="text-muted-foreground">No support tickets yet</p>
                <Button className="mt-4" onClick={() => setIsNewTicketOpen(true)}>
                  Create Your First Ticket
                </Button>
              </CardContent>
            </Card>
          ) : (
            tickets.map((ticket) => {
              const StatusIcon = statusIcons[ticket.status]
              return (
                <Card
                  key={ticket.id}
                  className="cursor-pointer hover:shadow-md transition-shadow"
                  onClick={() => setSelectedTicket(ticket)}
                >
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex items-start gap-3">
                        <div className="mt-1">
                          <StatusIcon className={`h-5 w-5 ${
                            ticket.status === 'resolved' ? 'text-green-500' :
                            ticket.status === 'in_progress' ? 'text-yellow-500' :
                            ticket.status === 'waiting' ? 'text-gray-500' :
                            'text-blue-500'
                          }`} />
                        </div>
                        <div>
                          <h3 className="font-medium">{ticket.subject}</h3>
                          <p className="text-sm text-muted-foreground line-clamp-1 mt-1">
                            {ticket.description}
                          </p>
                          <div className="flex items-center gap-2 mt-2">
                            <Badge variant={statusColors[ticket.status]}>
                              {ticket.status.replace('_', ' ')}
                            </Badge>
                            <span className={`text-xs px-2 py-0.5 rounded ${priorityColors[ticket.priority]}`}>
                              {ticket.priority}
                            </span>
                            <span className="text-xs text-muted-foreground">
                              {categoryLabels[ticket.category]}
                            </span>
                          </div>
                        </div>
                      </div>
                      <div className="text-right text-sm text-muted-foreground">
                        <p>{formatDate(ticket.createdAt)}</p>
                        {ticket.lastReply && (
                          <p className="text-xs mt-1">Last reply: {formatDate(ticket.updatedAt)}</p>
                        )}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              )
            })
          )}
        </div>
      </div>

      {/* New Ticket Modal */}
      <Modal
        isOpen={isNewTicketOpen}
        onClose={() => setIsNewTicketOpen(false)}
        title="Create Support Ticket"
        description="Describe your issue and we'll help you resolve it"
        size="lg"
      >
        <div className="space-y-4">
          <div>
            <label className="text-sm font-medium">Subject *</label>
            <Input
              placeholder="Brief description of your issue"
              value={newTicket.subject}
              onChange={(e) => setNewTicket((prev) => ({ ...prev, subject: e.target.value }))}
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-sm font-medium">Category *</label>
              <Select
                value={newTicket.category}
                onChange={(e) => setNewTicket((prev) => ({ ...prev, category: e.target.value as TicketCategory }))}
                options={[
                  { value: 'technical', label: 'Technical Issue' },
                  { value: 'billing', label: 'Billing' },
                  { value: 'feature_request', label: 'Feature Request' },
                  { value: 'integration', label: 'Integration' },
                  { value: 'training', label: 'Training' },
                  { value: 'other', label: 'Other' },
                ]}
                placeholder="Select category..."
              />
            </div>
            <div>
              <label className="text-sm font-medium">Priority</label>
              <Select
                value={newTicket.priority}
                onChange={(e) => setNewTicket((prev) => ({ ...prev, priority: e.target.value as TicketPriority }))}
                options={[
                  { value: 'low', label: 'Low' },
                  { value: 'medium', label: 'Medium' },
                  { value: 'high', label: 'High' },
                  { value: 'urgent', label: 'Urgent' },
                ]}
              />
            </div>
          </div>
          <div>
            <label className="text-sm font-medium">Description *</label>
            <Textarea
              rows={5}
              placeholder="Please provide details about your issue..."
              value={newTicket.description}
              onChange={(e) => setNewTicket((prev) => ({ ...prev, description: e.target.value }))}
            />
          </div>
          <div className="flex justify-end gap-2 pt-4">
            <Button variant="outline" onClick={() => setIsNewTicketOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleCreateTicket}
              disabled={!newTicket.subject || !newTicket.category || !newTicket.description}
            >
              Submit Ticket
            </Button>
          </div>
        </div>
      </Modal>

      {/* Ticket Detail Modal */}
      <Modal
        isOpen={!!selectedTicket}
        onClose={() => setSelectedTicket(null)}
        title={selectedTicket?.subject || ''}
        size="lg"
      >
        {selectedTicket && (
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <Badge variant={statusColors[selectedTicket.status]}>
                {selectedTicket.status.replace('_', ' ')}
              </Badge>
              <span className={`text-xs px-2 py-0.5 rounded ${priorityColors[selectedTicket.priority]}`}>
                {selectedTicket.priority}
              </span>
              <span className="text-sm text-muted-foreground">
                {categoryLabels[selectedTicket.category]}
              </span>
            </div>

            <div className="p-4 bg-muted rounded-lg">
              <p className="text-sm text-muted-foreground mb-1">
                Submitted on {formatDate(selectedTicket.createdAt)}
              </p>
              <p>{selectedTicket.description}</p>
            </div>

            {selectedTicket.lastReply && (
              <div className="p-4 border rounded-lg">
                <p className="text-sm font-medium mb-1">Support Team</p>
                <p className="text-sm">{selectedTicket.lastReply}</p>
              </div>
            )}

            {selectedTicket.status !== 'resolved' && selectedTicket.status !== 'closed' && (
              <div className="pt-4 border-t">
                <label className="text-sm font-medium">Reply</label>
                <div className="flex gap-2 mt-2">
                  <Textarea
                    rows={2}
                    placeholder="Type your reply..."
                    value={replyMessage}
                    onChange={(e) => setReplyMessage(e.target.value)}
                    className="flex-1"
                  />
                </div>
                <div className="flex justify-end gap-2 mt-2">
                  <Button variant="outline" size="sm">
                    <Paperclip className="h-4 w-4 mr-1" />
                    Attach
                  </Button>
                  <Button size="sm" onClick={handleSendReply} disabled={!replyMessage.trim()}>
                    <Send className="h-4 w-4 mr-1" />
                    Send
                  </Button>
                </div>
              </div>
            )}
          </div>
        )}
      </Modal>
    </div>
  )
}
