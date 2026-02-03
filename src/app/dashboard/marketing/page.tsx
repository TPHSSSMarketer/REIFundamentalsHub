'use client'

import { useState } from 'react'
import { Header } from '@/components/layout/header'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Modal } from '@/components/ui/modal'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import {
  Plus,
  Mail,
  MessageSquare,
  Phone,
  Megaphone,
  TrendingUp,
  Users,
  DollarSign,
  Play,
  Pause,
  BarChart3,
  Send,
} from 'lucide-react'
import { formatCurrency, formatDate } from '@/lib/utils'
import { toast } from 'sonner'
import type { Campaign, CampaignType, CampaignStatus } from '@/types'

interface ExtendedCampaign extends Campaign {
  sent?: number
  opened?: number
  clicked?: number
  responded?: number
}

const mockCampaigns: ExtendedCampaign[] = [
  {
    id: '1',
    name: 'Pre-Foreclosure Direct Mail',
    type: 'direct_mail',
    status: 'active',
    startDate: new Date(Date.now() - 604800000).toISOString(),
    budget: 5000,
    spent: 2340,
    leadsGenerated: 23,
    createdAt: new Date(Date.now() - 864000000).toISOString(),
    sent: 1500,
    responded: 45,
  },
  {
    id: '2',
    name: 'Absentee Owner SMS',
    type: 'sms',
    status: 'active',
    startDate: new Date(Date.now() - 1209600000).toISOString(),
    budget: 2000,
    spent: 890,
    leadsGenerated: 34,
    createdAt: new Date(Date.now() - 1296000000).toISOString(),
    sent: 5000,
    responded: 120,
  },
  {
    id: '3',
    name: 'Motivated Seller Email',
    type: 'email',
    status: 'paused',
    startDate: new Date(Date.now() - 2592000000).toISOString(),
    budget: 500,
    spent: 250,
    leadsGenerated: 12,
    createdAt: new Date(Date.now() - 2678400000).toISOString(),
    sent: 10000,
    opened: 2500,
    clicked: 450,
    responded: 45,
  },
  {
    id: '4',
    name: 'Facebook Lead Ads',
    type: 'facebook',
    status: 'active',
    startDate: new Date(Date.now() - 432000000).toISOString(),
    budget: 3000,
    spent: 1200,
    leadsGenerated: 56,
    createdAt: new Date(Date.now() - 518400000).toISOString(),
  },
  {
    id: '5',
    name: 'Ringless Voicemail',
    type: 'ringless_voicemail',
    status: 'completed',
    startDate: new Date(Date.now() - 5184000000).toISOString(),
    endDate: new Date(Date.now() - 2592000000).toISOString(),
    budget: 1500,
    spent: 1500,
    leadsGenerated: 18,
    createdAt: new Date(Date.now() - 5270400000).toISOString(),
    sent: 8000,
    responded: 85,
  },
]

const campaignTypeIcons: Record<CampaignType, typeof Mail> = {
  email: Mail,
  sms: MessageSquare,
  direct_mail: Megaphone,
  facebook: TrendingUp,
  google: TrendingUp,
  ringless_voicemail: Phone,
}

const campaignTypeLabels: Record<CampaignType, string> = {
  email: 'Email Campaign',
  sms: 'SMS Campaign',
  direct_mail: 'Direct Mail',
  facebook: 'Facebook Ads',
  google: 'Google Ads',
  ringless_voicemail: 'Ringless Voicemail',
}

const statusColors: Record<CampaignStatus, 'default' | 'success' | 'warning' | 'secondary'> = {
  draft: 'secondary',
  active: 'success',
  paused: 'warning',
  completed: 'default',
}

export default function MarketingPage() {
  const [campaigns, setCampaigns] = useState(mockCampaigns)
  const [isNewCampaignOpen, setIsNewCampaignOpen] = useState(false)
  const [quickSendOpen, setQuickSendOpen] = useState<'sms' | 'email' | null>(null)

  const stats = {
    totalCampaigns: campaigns.length,
    activeCampaigns: campaigns.filter((c) => c.status === 'active').length,
    totalSpent: campaigns.reduce((acc, c) => acc + (c.spent || 0), 0),
    totalLeads: campaigns.reduce((acc, c) => acc + c.leadsGenerated, 0),
  }

  const toggleCampaignStatus = (campaignId: string) => {
    setCampaigns((prev) =>
      prev.map((c) =>
        c.id === campaignId
          ? { ...c, status: c.status === 'active' ? 'paused' : 'active' }
          : c
      )
    )
    toast.success('Campaign status updated')
  }

  return (
    <div className="min-h-screen">
      <Header
        title="Marketing Hub"
        description="Manage your marketing campaigns and outreach"
      />

      <div className="p-6 space-y-6">
        {/* Stats */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Active Campaigns</p>
                  <p className="text-2xl font-bold">{stats.activeCampaigns}</p>
                </div>
                <div className="p-3 bg-green-100 rounded-full">
                  <Megaphone className="h-5 w-5 text-green-600" />
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Total Leads</p>
                  <p className="text-2xl font-bold">{stats.totalLeads}</p>
                </div>
                <div className="p-3 bg-blue-100 rounded-full">
                  <Users className="h-5 w-5 text-blue-600" />
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Total Spent</p>
                  <p className="text-2xl font-bold">{formatCurrency(stats.totalSpent)}</p>
                </div>
                <div className="p-3 bg-yellow-100 rounded-full">
                  <DollarSign className="h-5 w-5 text-yellow-600" />
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Cost Per Lead</p>
                  <p className="text-2xl font-bold">
                    {stats.totalLeads > 0
                      ? formatCurrency(stats.totalSpent / stats.totalLeads)
                      : '$0'}
                  </p>
                </div>
                <div className="p-3 bg-purple-100 rounded-full">
                  <BarChart3 className="h-5 w-5 text-purple-600" />
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Quick Actions */}
        <div className="flex flex-wrap gap-3">
          <Button onClick={() => setIsNewCampaignOpen(true)}>
            <Plus className="h-4 w-4 mr-2" />
            New Campaign
          </Button>
          <Button variant="outline" onClick={() => setQuickSendOpen('sms')}>
            <MessageSquare className="h-4 w-4 mr-2" />
            Quick SMS
          </Button>
          <Button variant="outline" onClick={() => setQuickSendOpen('email')}>
            <Mail className="h-4 w-4 mr-2" />
            Quick Email
          </Button>
        </div>

        {/* Campaigns */}
        <Tabs defaultValue="all">
          <TabsList>
            <TabsTrigger value="all">All Campaigns</TabsTrigger>
            <TabsTrigger value="active">Active</TabsTrigger>
            <TabsTrigger value="paused">Paused</TabsTrigger>
            <TabsTrigger value="completed">Completed</TabsTrigger>
          </TabsList>

          <TabsContent value="all" className="mt-4">
            <CampaignList campaigns={campaigns} onToggleStatus={toggleCampaignStatus} />
          </TabsContent>
          <TabsContent value="active" className="mt-4">
            <CampaignList
              campaigns={campaigns.filter((c) => c.status === 'active')}
              onToggleStatus={toggleCampaignStatus}
            />
          </TabsContent>
          <TabsContent value="paused" className="mt-4">
            <CampaignList
              campaigns={campaigns.filter((c) => c.status === 'paused')}
              onToggleStatus={toggleCampaignStatus}
            />
          </TabsContent>
          <TabsContent value="completed" className="mt-4">
            <CampaignList
              campaigns={campaigns.filter((c) => c.status === 'completed')}
              onToggleStatus={toggleCampaignStatus}
            />
          </TabsContent>
        </Tabs>
      </div>

      {/* New Campaign Modal */}
      <Modal
        isOpen={isNewCampaignOpen}
        onClose={() => setIsNewCampaignOpen(false)}
        title="Create New Campaign"
        size="lg"
      >
        <div className="space-y-4">
          <div>
            <label className="text-sm font-medium">Campaign Name</label>
            <Input placeholder="e.g., Pre-Foreclosure Direct Mail Q1" />
          </div>
          <div>
            <label className="text-sm font-medium">Campaign Type</label>
            <Select
              options={[
                { value: 'email', label: 'Email Campaign' },
                { value: 'sms', label: 'SMS Campaign' },
                { value: 'direct_mail', label: 'Direct Mail' },
                { value: 'facebook', label: 'Facebook Ads' },
                { value: 'google', label: 'Google Ads' },
                { value: 'ringless_voicemail', label: 'Ringless Voicemail' },
              ]}
              placeholder="Select type..."
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-sm font-medium">Budget</label>
              <Input type="number" placeholder="$0" />
            </div>
            <div>
              <label className="text-sm font-medium">Start Date</label>
              <Input type="date" />
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-4">
            <Button variant="outline" onClick={() => setIsNewCampaignOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => {
                toast.success('Campaign created!')
                setIsNewCampaignOpen(false)
              }}
            >
              Create Campaign
            </Button>
          </div>
        </div>
      </Modal>

      {/* Quick Send Modal */}
      <Modal
        isOpen={!!quickSendOpen}
        onClose={() => setQuickSendOpen(null)}
        title={quickSendOpen === 'sms' ? 'Send Quick SMS' : 'Send Quick Email'}
        size="md"
      >
        <div className="space-y-4">
          {quickSendOpen === 'email' && (
            <div>
              <label className="text-sm font-medium">Subject</label>
              <Input placeholder="Email subject..." />
            </div>
          )}
          <div>
            <label className="text-sm font-medium">
              {quickSendOpen === 'sms' ? 'Message' : 'Body'}
            </label>
            <Textarea
              rows={quickSendOpen === 'sms' ? 3 : 6}
              placeholder={
                quickSendOpen === 'sms'
                  ? 'Hi {first_name}, I noticed your property at...'
                  : 'Write your email content here...'
              }
            />
          </div>
          <div>
            <label className="text-sm font-medium">Send To</label>
            <Select
              options={[
                { value: 'all', label: 'All Leads' },
                { value: 'new', label: 'New Leads' },
                { value: 'qualified', label: 'Qualified Leads' },
                { value: 'tag', label: 'By Tag...' },
              ]}
              placeholder="Select recipients..."
            />
          </div>
          <div className="flex justify-end gap-2 pt-4">
            <Button variant="outline" onClick={() => setQuickSendOpen(null)}>
              Cancel
            </Button>
            <Button
              onClick={() => {
                toast.success('Message scheduled!')
                setQuickSendOpen(null)
              }}
            >
              <Send className="h-4 w-4 mr-2" />
              Send
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}

function CampaignList({
  campaigns,
  onToggleStatus,
}: {
  campaigns: ExtendedCampaign[]
  onToggleStatus: (id: string) => void
}) {
  if (campaigns.length === 0) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        No campaigns found
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {campaigns.map((campaign) => {
        const Icon = campaignTypeIcons[campaign.type]
        return (
          <Card key={campaign.id}>
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <div className="p-3 bg-primary/10 rounded-lg">
                    <Icon className="h-5 w-5 text-primary" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="font-medium">{campaign.name}</h3>
                      <Badge variant={statusColors[campaign.status]}>
                        {campaign.status}
                      </Badge>
                    </div>
                    <p className="text-sm text-muted-foreground">
                      {campaignTypeLabels[campaign.type]} • Started{' '}
                      {formatDate(campaign.startDate)}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-6">
                  <div className="text-right hidden md:block">
                    <p className="text-sm text-muted-foreground">Leads</p>
                    <p className="font-semibold">{campaign.leadsGenerated}</p>
                  </div>
                  <div className="text-right hidden md:block">
                    <p className="text-sm text-muted-foreground">Spent</p>
                    <p className="font-semibold">
                      {formatCurrency(campaign.spent || 0)}
                    </p>
                  </div>
                  <div className="text-right hidden lg:block">
                    <p className="text-sm text-muted-foreground">Budget</p>
                    <p className="font-semibold">
                      {formatCurrency(campaign.budget || 0)}
                    </p>
                  </div>
                  {campaign.status !== 'completed' && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => onToggleStatus(campaign.id)}
                    >
                      {campaign.status === 'active' ? (
                        <>
                          <Pause className="h-4 w-4 mr-1" />
                          Pause
                        </>
                      ) : (
                        <>
                          <Play className="h-4 w-4 mr-1" />
                          Resume
                        </>
                      )}
                    </Button>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        )
      })}
    </div>
  )
}
